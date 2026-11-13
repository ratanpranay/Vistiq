"""The Photoshop link: Vistiq Studio's Photoshop panel sends the active
document's canvas here after every change; Create shows it live.

Listens on this PC only (127.0.0.1). The panel lives in ../photoshop and is
installed into Photoshop once, as a .ccx package.
"""
import base64
import glob
import io
import json
import logging
import os
import socket
import subprocess
import sys
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image

log = logging.getLogger("vistiq")

PORT = 38393
MAX_BODY = 80 << 20
KEEP = 4                       # live frames kept on disk
PANEL_VERSION = "1.0.3"        # the panel in app/photoshop (tests check they match)


class _Server(ThreadingHTTPServer):
    # Windows lets two programs share a port with SO_REUSEADDR, and then
    # Photoshop's pictures can go to the wrong one. Take the port for ourselves.
    allow_reuse_address = sys.platform != "win32"

    def server_bind(self):
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Bridge:
    def __init__(self, folder, on_frame):
        self.folder = folder
        self.on_frame = on_frame
        self.server = None
        self.n = 0
        self.doc = ""
        self.busy_reason = ""
        self._lock = threading.Lock()
        self.on_released = lambda: None
        self.on_state = lambda state, message: None   # Photoshop open / no file / closed
        self.on_old_panel = lambda: None              # an older panel checked in
        self._asked_update = False
        self.have = ""            # the panel's document key of the picture we have
        self.last_seen = 0.0
        self.ps_state = ""

    @property
    def running(self):
        return self.server is not None

    def start(self):
        if self.server:
            return True
        os.makedirs(self.folder, exist_ok=True)
        self.have, self.ps_state, self.last_seen = "", "", 0.0
        # Pictures from an earlier session would confuse the numbering: start clean.
        for old in glob.glob(os.path.join(self.folder, "photoshop_*.jpg")):
            try:
                os.remove(old)
            except OSError:
                pass
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def _send(self, code, body=b"{}"):
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.end_headers()

            def do_GET(self):
                if self.path.startswith("/ping"):
                    from urllib.parse import urlparse, parse_qs
                    q = parse_qs(urlparse(self.path).query)
                    bridge.seen((q.get("key") or [None])[0], (q.get("v") or [""])[0])
                    self._send(200, json.dumps({"app": "Vistiq Studio", "have": bridge.have}).encode())
                else:
                    self._send(404)

            def do_POST(self):
                if self.path.startswith("/release"):
                    # A newer Vistiq Studio wants the link: step aside.
                    self._send(200)
                    log.info("Photoshop link handed over to another Vistiq Studio")
                    bridge.stop()
                    try:
                        bridge.on_released()
                    except Exception:
                        pass
                    return
                if self.path.startswith("/raw"):
                    return self._raw()
                if not self.path.startswith("/frame"):
                    return self._send(404)
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > MAX_BODY:
                    return self._send(413)
                try:
                    bridge.frame(json.loads(self.rfile.read(n)))
                    self._send(200)
                except Exception:
                    log.exception("bad frame from Photoshop")
                    self._send(400)

        def _raw(self):
            """Raw pixels from the panel: ?w=&h=&c= (components 3 or 4, 8 bit)."""
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY * 2:
                return self._send(413)
            try:
                w, h, c = int(q["w"][0]), int(q["h"][0]), int(q.get("c", ["3"])[0])
                body = self.rfile.read(n)
                bridge.raw(body, w, h, c, (q.get("name") or ["Photoshop"])[0])
                if q.get("key"):
                    bridge.have = q["key"][0]
                self._send(200)
            except Exception:
                log.exception("bad raw frame from Photoshop")
                self._send(400)

        Handler._raw = _raw

        # Ask an older Vistiq Studio (left running in the background, e.g. after an
        # update) to let go of the link first; otherwise Photoshop keeps talking to it.
        try:
            import urllib.request
            urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%d/release" % PORT, data=b"{}",
                                                          method="POST"), timeout=2).read()
            time.sleep(0.5)
        except Exception:
            pass
        for attempt in range(6):
            try:
                self.server = _Server(("127.0.0.1", PORT), Handler)
                break
            except OSError as exc:
                last = exc
                time.sleep(0.5)
        else:
            exc = last
            log.warning("Photoshop link can't listen on %d: %s", PORT, exc)
            self.server = None
            self.busy_reason = "other"
            try:
                import urllib.request
                if b"Vistiq Studio" in urllib.request.urlopen("http://127.0.0.1:%d/ping" % PORT, timeout=2).read():
                    self.busy_reason = "studio"
            except Exception:
                pass
            return False
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        threading.Thread(target=self._watch, args=(self.server,), daemon=True).start()
        log.info("Photoshop link listening on %d", PORT)
        return True

    def seen(self, key, version=""):
        """The panel checked in (every second while Photoshop runs)."""
        self.last_seen = time.time()
        if version != PANEL_VERSION and not self._asked_update:
            self._asked_update = True
            threading.Thread(target=self.on_old_panel, daemon=True).start()
        if key == "none":
            self._state("nodoc", "No file open in Photoshop.")
            self.have = "none"
        elif key and self.have == key:
            self._state("live", "")

    def _state(self, state, message):
        if state != self.ps_state:
            self.ps_state = state
            try:
                self.on_state(state, message)
            except Exception:
                log.exception("live state")

    def _watch(self, server):
        # No check-in for a while: Photoshop was closed (or the panel unloaded).
        while self.server is server:
            if self.last_seen and time.time() - self.last_seen > 6 and self.ps_state != "closed":
                self.have = ""
                self._state("closed", "Photoshop is closed. Open it with the Vistiq Studio panel and it shows up here.")
            time.sleep(1)

    def stop(self):
        s, self.server = self.server, None
        if s:
            threading.Thread(target=lambda: (s.shutdown(), s.server_close()), daemon=True).start()

    def raw(self, body, w, h, c, name):
        mode = {1: "L", 3: "RGB", 4: "RGBA"}.get(c)
        if not mode or len(body) < w * h * c:
            raise ValueError("unexpected pixels: %dx%dx%d, %d bytes" % (w, h, c, len(body)))
        im = Image.frombytes(mode, (w, h), body[:w * h * c])
        if mode != "RGB":
            if mode == "RGBA":
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.getchannel("A"))
                im = bg
            else:
                im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=92)
        self.frame({"name": name, "jpeg": base64.b64encode(buf.getvalue()).decode("ascii")})

    def frame(self, data):
        raw = base64.b64decode(data["jpeg"])
        im = Image.open(io.BytesIO(raw))
        im.load()
        with self._lock:
            self.n += 1
            n = self.n
            path = os.path.join(self.folder, "photoshop_%05d.jpg" % n)
            with open(path, "wb") as fh:
                fh.write(raw)
            for old in sorted(glob.glob(os.path.join(self.folder, "photoshop_*.jpg")), key=os.path.getmtime)[:-KEEP]:
                if old == path:
                    continue
                try:
                    os.remove(old)
                except OSError:
                    pass
        name = str(data.get("name") or "Photoshop")
        self.doc = name
        self._state("live", "")
        self.on_frame({"path": path, "name": name, "w": im.size[0], "h": im.size[1], "n": n, "app": "photoshop"})


# -- installing the panel into Photoshop ---------------------------------------

UPIA = [r"C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI"
        r"\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"]


def package(app_dir, out_dir):
    """The panel as a .ccx file (a zip of its folder)."""
    src = os.path.join(app_dir, "photoshop")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "VistiqStudio-Photoshop.ccx")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(os.listdir(src)):
            z.write(os.path.join(src, name), name)
    return out


def update_panel(app_dir, out_dir):
    """Quietly replace an older panel through Adobe's installer (no dialogs).
    Photoshop picks it up the next time it starts."""
    if not any(os.path.isfile(exe) for exe in UPIA):
        return False
    ok, _ = install_panel(app_dir, out_dir, quiet=True)
    return ok


def install_panel(app_dir, out_dir, quiet=False):
    """Hand the panel to Adobe's installer. Returns (ok, message)."""
    ccx = package(app_dir, out_dir)
    for exe in UPIA:
        if os.path.isfile(exe):
            try:
                # An older copy of the panel is replaced, not kept.
                subprocess.run([exe, "/remove", "Vistiq Studio"], capture_output=True, text=True, timeout=120,
                               creationflags=0x08000000 if sys.platform == "win32" else 0)
                r = subprocess.run([exe, "/install", ccx], capture_output=True, text=True, timeout=180,
                                   creationflags=0x08000000 if sys.platform == "win32" else 0)
                text = (r.stdout + r.stderr).strip()
                log.info("panel install: %s %s", r.returncode, text[-500:])
                if r.returncode == 0:
                    return True, "Installed. Restart Photoshop, then open Window → Plugins → Vistiq Studio."
            except Exception as exc:
                log.exception("panel install failed")
                text = str(exc)
            break
    if quiet:
        return False, ""
    # Fall back to Creative Cloud's own handling of a double-clicked .ccx.
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", ccx])
        else:
            os.startfile(ccx)  # noqa
        return True, ("Creative Cloud is installing the panel. Confirm there, restart Photoshop, then "
                      "open Window → Plugins → Vistiq Studio.")
    except Exception:
        return False, "Couldn't install the panel. The file is here: " + ccx
