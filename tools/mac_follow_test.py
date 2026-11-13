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

# a rough pickup-truck sketch, thick black lines on white (like Affinity)
sk = Image.new("RGB", (1072, 592), "white"); d = ImageDraw.Draw(sk); W = 9
d.line([(90, 330), (90, 250), (330, 230), (420, 140), (610, 140), (650, 240), (650, 250), (990, 250), (990, 380),
        (90, 380), (90, 330)], fill="black", width=W, joint="curve")
d.line([(650, 250), (650, 380)], fill="black", width=W)
d.line([(440, 155), (600, 155), (620, 235), (380, 235), (440, 155)], fill="black", width=W)
d.ellipse([170, 310, 330, 470], outline="black", width=W); d.ellipse([740, 310, 900, 470], outline="black", width=W)
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
for label, extra in [("noise (old)", {}), ("s=0.125", {"strength": 0.125, "steps": 8}),
                     ("s=0.25", {"strength": 0.25, "steps": 8}), ("s=0.375", {"strength": 0.375, "steps": 8}),
                     ("s=0.5", {"strength": 0.5, "steps": 8})]:
    t = time.time()
    job = dict({"image": sp, "text": text, "seed": 42}, **extra)
    data = eng.run(job)
    out = Image.open(io.BytesIO(data)).convert("RGB")
    sat = sum(max(p) - min(p) for p in out.resize((64, 36)).getdata()) / (64 * 36)
    print("RESULT %-12s follow=%.2f colour=%.0f time=%.0fs" % (label, follow(out), sat, time.time() - t), flush=True)
    b = io.BytesIO(); out.resize((320, 177)).save(b, "JPEG", quality=70)
    print("THUMB %s %s" % (label.replace(" ", "_"), base64.b64encode(b.getvalue()).decode()), flush=True)
b = io.BytesIO(); sk.resize((320, 177)).save(b, "JPEG", quality=70)
print("THUMB sketch %s" % base64.b64encode(b.getvalue()).decode(), flush=True)
print("ALL GOOD", flush=True)
