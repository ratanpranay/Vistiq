"""Upload from phone: a tiny web page on this PC, reachable from a phone on the
same Wi-Fi through a QR code. Pictures sent from the phone land on the board.

Only while the QR window is open (and 15 minutes at most), only with the
secret in the QR code, only pictures (up to 40 MB each).
"""
import html
import io
import logging
import os
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from PIL import Image

log = logging.getLogger("vistiq")
PORTS = (8395, 8396, 8397, 0)
MAX = 40 << 20
LIFE = 15 * 60

PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send to Vistiq Studio</title><style>
body{margin:0;font:16px/1.4 -apple-system,system-ui,sans-serif;background:#f6f7fa;color:#14161f;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{width:min(420px,92vw);background:#fff;border-radius:22px;box-shadow:0 10px 40px rgba(14,16,32,.12);padding:28px 22px;text-align:center}
h1{font-size:20px;margin:0 0 6px}p{color:#80869a;margin:0 0 22px;font-size:14px}
label{display:block;padding:16px;border-radius:14px;background:#14161f;color:#fff;font-weight:600;margin-bottom:10px}
label.b{background:#f0eeff;color:#5b4ce0}input{display:none}
#s{margin-top:16px;font-size:14px;color:#3b4050;min-height:20px}.ok{color:#16a34a}.bad{color:#d14343}
</style></head><body><main><h1>Send to Vistiq Studio</h1><p>Pictures go straight onto the board on %(pc)s.</p>
<label>Take a photo<input id="c" type="file" accept="image/*" capture="environment"></label>
<label class="b">Choose pictures<input id="f" type="file" accept="image/*" multiple></label><div id="s"></div></main>
<script>
const s=document.getElementById('s');
async function send(files){for(const f of files){s.className='';s.textContent='Sending '+f.name+'…';
try{const r=await fetch(location.pathname+location.search,{method:'POST',headers:{'X-Name':encodeURIComponent(f.name||'photo.jpg')},body:f});
if(!r.ok)throw new Error(await r.text());s.className='ok';s.textContent='On the board ✓ Send another?';}catch(e){s.className='bad';s.textContent='Didn\\'t arrive: '+e.message;}}}
for(const id of ['c','f'])document.getElementById(id).addEventListener('change',e=>send(e.target.files));
</script></body></html>"""


def lan_ip():
    """This PC's address on the Wi-Fi (no traffic is sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


class PhoneDrop:
    def __init__(self, folder, on_file):
        self.folder = folder
        self.on_file = on_file
        self.server = None
        self.token = ""
        self.until = 0

    def start(self):
        if self.server and time.time() < self.until:
            self.until = time.time() + LIFE
            return self.url()
        self.stop()
        self.token = secrets.token_urlsafe(6)
        drop = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _ok(self):
                q = parse_qs(urlparse(self.path).query)
                return urlparse(self.path).path == "/drop" and q.get("k", [""])[0] == drop.token and time.time() < drop.until

            def _say(self, code, body, kind="text/plain; charset=utf-8"):
                data = body.encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if not self._ok():
                    return self._say(404, "This link has expired. Open Upload from phone in Vistiq Studio again.")
                self._say(200, PAGE % {"pc": html.escape(socket.gethostname())}, "text/html; charset=utf-8")

            def do_POST(self):
                if not self._ok():
                    return self._say(404, "This link has expired.")
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > MAX:
                    return self._say(413, "Too big (40 MB at most).")
                data = self.rfile.read(n)
                try:
                    im = Image.open(io.BytesIO(data))
                    im.verify()
                except Exception:
                    return self._say(415, "That isn't a picture.")
                from urllib.parse import unquote
                name = os.path.basename(unquote(self.headers.get("X-Name") or "photo.jpg")) or "photo.jpg"
                stem, ext = os.path.splitext(name)
                os.makedirs(drop.folder, exist_ok=True)
                path = os.path.join(drop.folder, "phone_%s_%s%s" % (time.strftime("%Y%m%d_%H%M%S"), stem[:40], ext.lower() or ".jpg"))
                with open(path, "wb") as fh:
                    fh.write(data)
                try:
                    drop.on_file(path)
                except Exception:
                    log.exception("phone drop")
                self._say(200, "ok")

        for port in PORTS:
            try:
                self.server = ThreadingHTTPServer(("0.0.0.0", port), H)
                break
            except OSError:
                continue
        if not self.server:
            raise RuntimeError("couldn't open a port for the phone")
        self.until = time.time() + LIFE
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        threading.Thread(target=self._expire, daemon=True).start()
        return self.url()

    def _expire(self):
        while self.server and time.time() < self.until:
            time.sleep(5)
        self.stop()

    def url(self):
        return "http://%s:%d/drop?k=%s" % (lan_ip(), self.server.server_address[1], self.token)

    def stop(self):
        srv, self.server = self.server, None
        if srv:
            try:
                srv.shutdown()
                srv.server_close()
            except Exception:
                pass
