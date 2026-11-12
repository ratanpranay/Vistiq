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
import subprocess
import sys
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image

log = logging.getLogger("vistiq")

PORT = 8393
MAX_BODY = 80 << 20
KEEP = 4                       # live frames kept on disk


class Bridge:
    def __init__(self, folder, on_frame):
        self.folder = folder
        self.on_frame = on_frame
        self.server = None
        self.n = 0
        self.doc = ""
        self._lock = threading.Lock()

    @property
    def running(self):
        return self.server is not None

    def start(self):
        if self.server:
            return True
        os.makedirs(self.folder, exist_ok=True)
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
                    self._send(200, b'{"app": "Vistiq Studio"}')
                else:
                    self._send(404)

            def do_POST(self):
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

        try:
            self.server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        except OSError as exc:
            log.warning("Photoshop link can't listen on %d: %s", PORT, exc)
            self.server = None
            return False
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        log.info("Photoshop link listening on %d", PORT)
        return True

    def stop(self):
        s, self.server = self.server, None
        if s:
            threading.Thread(target=lambda: (s.shutdown(), s.server_close()), daemon=True).start()

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
            for old in sorted(glob.glob(os.path.join(self.folder, "photoshop_*.jpg")))[:-KEEP]:
                try:
                    os.remove(old)
                except OSError:
                    pass
        name = str(data.get("name") or "Photoshop")
        self.doc = name
        self.on_frame({"path": path, "name": name, "w": im.size[0], "h": im.size[1], "n": n})


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


def install_panel(app_dir, out_dir):
    """Hand the panel to Adobe's installer. Returns (ok, message)."""
    ccx = package(app_dir, out_dir)
    for exe in UPIA:
        if os.path.isfile(exe):
            try:
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
    # Fall back to Creative Cloud's own handling of a double-clicked .ccx.
    try:
        os.startfile(ccx)  # noqa
        return True, ("Creative Cloud is installing the panel. Confirm there, restart Photoshop, then "
                      "open Window → Plugins → Vistiq Studio.")
    except Exception:
        return False, "Couldn't install the panel. The file is here: " + ccx
