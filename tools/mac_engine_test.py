"""Real end-to-end test of Studio on a Mac: install the engine and model the
same way the app does, then run Create jobs through the real Studio code."""
import os, sys, time, json, threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
os.environ["VISTIQ_FLAVOR"] = "studio"
from PIL import Image, ImageDraw
from vistiq import studio, macos
from vistiq.settings import Settings
from vistiq.studio_jobs import Studio
# GitHub's test Macs have 7 GB; act like a 16 GB MacBook Air (the app refuses below 16 GB)
macos.ram_gb = lambda: 16
macos.can_generate = lambda ram=None: True

s = Settings()
md = studio.models_dir(s)
t = time.time()
macos.install(md, studio.download, lambda label, f: print("install:", label, f, flush=True), want_generate=True)
print("INSTALL took %.0fs" % (time.time() - t), flush=True)

events = []
done = threading.Event()
class App:
    settings = s
    def emit(self, kind, data):
        d = {k: v for k, v in data.items() if k not in ("preview",)}
        if kind == "studio-result":
            d["result"] = {k: v for k, v in data["result"].items() if k != "preview"}
        print("EVENT", kind, json.dumps(d, default=str)[:300], flush=True)
        events.append((kind, data))
        if kind == "studio-job" and data.get("state") in ("done", "error", "cancelled"):
            done.set()
    def free_upscaler(self):
        pass

st = Studio(App())
print("STATUS create_ready:", studio.status(s)["create_ready"], flush=True)

# a simple truck-ish sketch, like a live frame from Affinity (1024 px wide)
live_dir = os.path.join(macos.support_dir(), "affinity"); os.makedirs(live_dir, exist_ok=True)
sk = Image.new("RGB", (1024, 571), "white"); d = ImageDraw.Draw(sk)
d.rectangle([150, 200, 850, 380], outline="black", width=8); d.ellipse([220, 330, 360, 470], outline="black", width=8)
d.ellipse([640, 330, 780, 470], outline="black", width=8); d.polygon([(450, 200), (520, 110), (760, 110), (820, 200)], outline="black", width=8)
frame = os.path.join(live_dir, "affinity_00005.jpg"); sk.save(frame)

def job(j, label):
    done.clear(); t = time.time()
    jid = st.run(j)
    if j.get("live_app") and os.path.exists(frame):
        os.remove(frame)  # the live loop throws old frames away; Create must not care
    assert jid, "run() refused"
    assert done.wait(3600), "timed out"
    last = [e for e in events if e[0] == "studio-job"][-1][1]
    print("RESULT %s: %s in %.0fs" % (label, last.get("state"), time.time() - t), last.get("message", ""), flush=True)
    assert last["state"] == "done", last
    return [e[1]["result"] for e in events if e[0] == "studio-result" and e[1]["id"] == jid]

r = job({"mode": "create", "image": frame, "name": "truck.af", "live_app": "affinity", "preset": "sketch",
         "text": "Turn this sketch into a photorealistic pickup truck, matte olive paint, desert", "keep": 0.8,
         "variations": 2}, "create x2 (first: loads model)")
for x in r:
    im = Image.open(x["path"]); print("  out", x["path"], im.size, flush=True); assert max(im.size) <= 1100
src = r[0]["path"]
job({"mode": "create", "image": src, "name": "truck.png", "preset": "", "text": "make it red", "keep": 0.9,
     "variations": 1}, "create warm")
w, h = Image.open(src).size
m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rectangle([w // 4, h // 4, w // 2, h // 2], fill=255)
import io, base64
b = io.BytesIO(); m.save(b, "PNG")
job({"mode": "create", "image": src, "name": "truck.png", "text": "a chrome wheel", "keep": 0.8, "variations": 1,
     "mask": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), "blend": 0.35}, "paint an area")
job({"mode": "reference", "image": src, "reference": src, "name": "truck.png", "preset": "cmf", "text": "",
     "keep": 0.8, "variations": 1}, "reference cmf")
print("TIMES", s.get("studio_times"), flush=True)
print("ALL GOOD", flush=True)
