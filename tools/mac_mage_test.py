"""Real test of the Mage-Flow setup on a GitHub Mac: install mlx-serve and the
model the way the app does, start the engine, then run Create through the real
Studio code. GitHub's Macs have 7 GB and a virtual GPU, so the picture itself
may be refused for memory; everything up to it must work."""
import os, sys, time, json, threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
os.environ["VISTIQ_FLAVOR"] = "studio"
from PIL import Image, ImageDraw
from vistiq import studio, macos
from vistiq.settings import Settings
from vistiq.studio_jobs import Studio
import platform, requests
print("macOS", platform.mac_ver()[0], "mage_supported", macos.mage_supported(), flush=True)
macos.ram_gb = lambda: 16
macos.can_generate = lambda ram=None: True

s = Settings()
s.set("mac_tier", "studio")
md = studio.models_dir(s)
print("tier", macos.tier(s), "engine", macos.engine_of(s), flush=True)
t = time.time()
last = [0]
def prog(label, f):
    if time.time() - last[0] > 20:
        last[0] = time.time(); print("install:", label, f, flush=True)
macos.install(md, studio.download, prog, want_generate=True, t=macos.tier(s))
print("INSTALL took %.0fs" % (time.time() - t), flush=True)
print("files:", sorted(os.listdir(macos.mage_dir(md))), flush=True)
st_ = studio.status(s)
print("STATUS create_ready:", st_["create_ready"], [ (f["key"], f["ready"]) for f in st_["files"]], flush=True)
assert st_["create_ready"]

e = macos.MageEngine(lambda: md)
t = time.time()
def dump_log():
    try:
        print("----- mlx-serve log -----\n" + open(e._log, encoding="utf-8", errors="replace").read()[-8000:], flush=True)
    except Exception as exc:
        print("no log:", exc, flush=True)
try:
    e._server(lambda: False)
except Exception:
    dump_log(); raise
print("SERVER up in %.0fs on port %d" % (time.time() - t, e._port), flush=True)
print("models:", requests.get(e._url("/v1/models"), timeout=10).text[:600], flush=True)

sk = Image.new("RGB", (1024, 576), "white"); d = ImageDraw.Draw(sk)
d.rectangle([150, 200, 850, 380], outline="black", width=8); d.ellipse([220, 330, 360, 470], outline="black", width=8)
d.ellipse([640, 330, 780, 470], outline="black", width=8); d.polygon([(450, 200), (520, 110), (760, 110), (820, 200)], outline="black", width=8)
p = os.path.join(macos.support_dir(), "sketch.png"); sk.save(p)
out = os.path.join(os.path.expanduser("~"), "Documents", "Vistiq Studio", "Outputs"); os.makedirs(out, exist_ok=True)
for side in (512, 768):
    t = time.time()
    try:
        png = e.run({"image": p, "text": "Turn this sketch into a photorealistic pickup truck, olive paint, studio light", "seed": 1, "side": side})
        open(os.path.join(out, "mage_%d.png" % side), "wb").write(png)
        print("PICTURE %d OK in %.0fs, %d bytes" % (side, time.time() - t, len(png)), flush=True)
    except Exception as exc:
        print("PICTURE %d FAILED in %.0fs: %s" % (side, time.time() - t, exc), flush=True)
        break
dump_log()
e.stop()
