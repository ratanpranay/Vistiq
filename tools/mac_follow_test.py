"""On a GitHub Mac: how well does Create follow a sketch, for several start strengths?"""
import base64, io, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
os.environ["VISTIQ_FLAVOR"] = "studio"
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from vistiq import studio, macos
from vistiq.settings import Settings
macos.ram_gb = lambda: 16
s = Settings(); md = studio.models_dir(s)
macos.install(md, studio.download, lambda l, f: None, want_generate=True)
eng = macos.MlxEngine(lambda: md)
work = os.path.join(macos.support_dir(), "t"); os.makedirs(work, exist_ok=True)

# a wobbly, unusual concept-truck sketch (slanted cab, big rear wheel), thick lines
import math, random
random.seed(3)
sk = Image.new("RGB", (1072, 592), "white"); d = ImageDraw.Draw(sk); W = 10
def wob(pts):
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for k in range(12):
            t = k / 12.0
            out.append((x0 + (x1 - x0) * t + random.uniform(-4, 4), y0 + (y1 - y0) * t + random.uniform(-4, 4)))
    out.append(pts[-1]); return out
d.line(wob([(70, 360), (80, 260), (300, 250), (470, 110), (560, 105), (600, 250), (1010, 230), (1000, 400), (70, 400), (70, 360)]), fill="black", width=W, joint="curve")
d.line(wob([(480, 130), (550, 128), (575, 240), (360, 248), (480, 130)]), fill="black", width=W)
d.ellipse([140, 320, 300, 480], outline="black", width=W); d.ellipse([720, 270, 940, 490], outline="black", width=W)
sp = os.path.join(work, "sketch.png"); sk.save(sp)

def lines(im):
    g = im.convert("L").filter(ImageFilter.GaussianBlur(1.2)).filter(ImageFilter.FIND_EDGES)
    return g.point(lambda v: 255 if v > 30 else 0).filter(ImageFilter.MaxFilter(13))

ref = sk.convert("L").point(lambda v: 255 if v < 128 else 0)
def follow(out):
    e = lines(out.resize(sk.size)); hit = ImageChops.multiply(ref, e)
    return sum(1 for v in hit.getdata() if v) / max(1, sum(1 for v in ref.getdata() if v))

text = ("Turn this sketch into a photorealistic photograph of a pickup truck, matte olive paint, in a desert. "
        "Keep every line, proportion, part and the camera view exactly as drawn.")
for label, extra in [("noise (old)", {}), ("raw s=0.19", {"strength": 0.19, "steps": 8, "start_mode": "raw"}),
                     ("blur s=0.25", {"strength": 0.25, "steps": 8, "start_mode": "blur"}),
                     ("blur s=0.375", {"strength": 0.375, "steps": 8, "start_mode": "blur"}),
                     ("grey s=0.25", {"strength": 0.25, "steps": 8, "start_mode": "grey"}),
                     ("grey s=0.375", {"strength": 0.375, "steps": 8, "start_mode": "grey"})]:
    t = time.time()
    job = dict({"image": sp, "text": text, "seed": 42}, **extra)
    data = eng.run(job)
    out = Image.open(io.BytesIO(data)).convert("RGB")
    sat = sum(max(p) - min(p) for p in out.resize((64, 36)).getdata()) / (64 * 36)
    print("RESULT %-12s follow=%.2f colour=%.0f time=%.0fs" % (label, follow(out), sat, time.time() - t), flush=True)
    b = io.BytesIO(); out.resize((320, 177)).save(b, "JPEG", quality=70)
    print("THUMB %s %s" % (label.replace(" ", "_"), base64.b64encode(b.getvalue()).decode()), flush=True)
for m in ("blur", "grey"):
    b = io.BytesIO(); Image.open(macos.start_image(sp, m, work)).resize((320, 177)).save(b, "JPEG", quality=70)
    print("THUMB start_%s %s" % (m, base64.b64encode(b.getvalue()).decode()), flush=True)
b = io.BytesIO(); sk.resize((320, 177)).save(b, "JPEG", quality=70)
print("THUMB sketch %s" % base64.b64encode(b.getvalue()).decode(), flush=True)
print("ALL GOOD", flush=True)
