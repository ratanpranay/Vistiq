"""Vistiq Studio on a Mac (Apple Silicon).

Image generation: FLUX.2 Klein 4B, 4-bit, on Apple's MLX (the mflux tool),
in a private Python made with uv. Upscaling: a classic upscaler
(Real-ESRGAN x4plus) on onnxruntime, using the Mac's CoreML when it can.
Everything lives in ~/Library/Application Support/VistiqStudio and the
Vistiq Studio folder in Documents.
"""
import io
import json
import logging
import math
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import threading
import time

from PIL import Image, ImageFilter, ImageOps

log = logging.getLogger("vistiq")

MAC = sys.platform == "darwin"

UV = "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-apple-darwin.tar.gz"
MFLUX = "mflux==0.24.0"
KLEIN_REPO = "Runpod/FLUX.2-klein-4B-mflux-4bit"
UPSCALER = ("https://github.com/ratanpranay/Vistiq/releases/download/studio-assets/"
            "realesrgan-x4plus.onnx")


def support_dir():
    base = os.path.join(os.path.expanduser("~"), "Library", "Application Support") if MAC else \
        (os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"))
    return os.path.join(base, "VistiqStudio")


def ram_gb():
    try:
        out = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5).stdout
        return round(int(out.strip()) / 2**30)
    except Exception:
        return 0


def chip():
    try:
        return subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True,
                              timeout=5).stdout.strip() or platform.machine()
    except Exception:
        return platform.machine()


def max_side(ram=None):
    """Largest upscale result this Mac is allowed to make, in pixels."""
    ram = ram if ram is not None else ram_gb()
    if ram >= 32:
        return 8192
    if ram >= 24:
        return 6144
    if ram >= 16:
        return 4096
    return 2048


def can_generate(ram=None):
    ram = ram if ram is not None else ram_gb()
    return ram >= 16


# -- the private Python with mflux -------------------------------------------------

def env_dir():
    return os.path.join(support_dir(), "mlx")


def python():
    return os.path.join(env_dir(), "venv", "bin", "python")


def model_dir(models_dir):
    return os.path.join(models_dir, "klein-4b-mlx-4bit")


def upscaler_path(models_dir):
    return os.path.join(models_dir, "upscaler", "realesrgan-x4plus.onnx")


def parts(models_dir):
    m = model_dir(models_dir)
    return [
        {"key": "engine", "label": "Engine", "about": "Apple's MLX and Python, private to Vistiq Studio.",
         "gb": 0.8, "ready": os.path.isfile(os.path.join(env_dir(), "ready.txt"))},
        {"key": "klein4b", "label": "Image model + prompt reader",
         "about": "FLUX.2 Klein 4B, made smaller for Mac (4-bit). Free, no sign-up.", "gb": 5.0,
         "ready": os.path.isfile(os.path.join(m, "ready.txt"))},
        {"key": "upscaler", "label": "Upscaler", "about": "Fast classic upscaler, 2× and 4×.", "gb": 0.07,
         "ready": os.path.isfile(upscaler_path(models_dir))},
    ]


def _run(cmd, on_line=None, env=None, cancelled=lambda: False, cwd=None):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, cwd=cwd,
                         text=True, bufsize=1)
    tail = []
    buf = ""
    while True:
        ch = p.stdout.read(1)
        if not ch:
            break
        if ch in "\r\n":
            if buf.strip():
                tail = (tail + [buf])[-30:]
                if on_line:
                    on_line(buf)
            buf = ""
        else:
            buf += ch
        if cancelled():
            p.kill()
            raise RuntimeError("cancelled")
    p.wait()
    if p.returncode != 0:
        raise RuntimeError("\n".join(tail[-6:]) or "failed (%s)" % p.returncode)
    return tail


def _env(models_dir):
    env = dict(os.environ)
    env["HF_HOME"] = os.path.join(models_dir, "hf-cache")
    env["HF_HUB_DISABLE_TELEMETRY"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    return env


def install(models_dir, download, on_progress, cancelled=lambda: False, want_generate=True):
    """Set up what's missing: the engine (uv + Python + mflux), the model,
    the upscaler."""
    os.makedirs(env_dir(), exist_ok=True)
    if want_generate and not os.path.isfile(os.path.join(env_dir(), "ready.txt")):
        uv = os.path.join(env_dir(), "uv")
        if not os.path.isfile(uv):
            tgz = os.path.join(env_dir(), "uv.tar.gz")
            download(UV, tgz, on_progress, "Engine tools", cancelled)
            with tarfile.open(tgz) as t:
                for m in t.getmembers():
                    if os.path.basename(m.name) == "uv":
                        with t.extractfile(m) as src, open(uv, "wb") as dst:
                            shutil.copyfileobj(src, dst)
            os.chmod(uv, 0o755)
            os.remove(tgz)
        on_progress("Setting up the engine (Python and MLX)", None)
        venv = os.path.join(env_dir(), "venv")
        _run([uv, "venv", "--python", "3.12", venv], cancelled=cancelled)
        _run([uv, "pip", "install", "--python", python(), MFLUX, "huggingface_hub"],
             on_line=lambda l: on_progress("Setting up the engine · " + l[-60:], None), cancelled=cancelled)
        with open(os.path.join(env_dir(), "ready.txt"), "w") as fh:
            fh.write(MFLUX)
    m = model_dir(models_dir)
    if want_generate and not os.path.isfile(os.path.join(m, "ready.txt")):
        on_progress("Image model: starting download (about 5 GB)", None)
        script = ("import sys\nfrom huggingface_hub import snapshot_download\n"
                  "snapshot_download(%r, local_dir=sys.argv[1])\n" % KLEIN_REPO)

        def line(l):
            if "%" in l:
                on_progress("Image model · " + l.strip()[-70:], None)
        _run([python(), "-c", script, m], on_line=line, env=_env(models_dir), cancelled=cancelled)
        with open(os.path.join(m, "ready.txt"), "w") as fh:
            fh.write(KLEIN_REPO)
    up = upscaler_path(models_dir)
    if not os.path.isfile(up):
        download(UPSCALER, up, on_progress, "Upscaler", cancelled)


# -- image generation ------------------------------------------------------------

class MlxEngine:
    """Same few methods as the Windows image engine, run through mflux."""

    def __init__(self, models_dir_fn):
        self.models_dir = models_dir_fn
        self.state, self.message = "idle", ""
        self._proc = None

    def alive(self):
        return os.path.isfile(python())

    def start(self, say=lambda s, m="": None):
        if not self.alive():
            self.state, self.message = "setup", "The image engine isn't set up yet."
            say(self.state, self.message)
            return False
        self.state, self.message = "ready", "Image engine ready"
        return True

    def stop(self):
        self.interrupt()

    def free(self):
        pass

    def interrupt(self):
        p = self._proc
        if p and p.poll() is None:
            p.kill()

    def upload(self, path):
        return path

    # The model stays loaded in one long-running helper process: loading it
    # takes longer than making an image, so it happens once per session,
    # not once per variation.
    def _worker(self):
        p = self._proc
        if p and p.poll() is None:
            return p
        md = self.models_dir()
        script = os.path.join(env_dir(), "vistiq_worker.py")
        with open(script, "w") as fh:
            fh.write(WORKER)
        self._proc = subprocess.Popen([python(), "-u", script, model_dir(md)], stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
                                      env=_env(md))
        self._progress = None
        threading.Thread(target=self._read_err, args=(self._proc,), daemon=True).start()
        return self._proc

    def _read_err(self, p):
        buf = ""
        self._tail = []
        while True:
            ch = p.stderr.read(1)
            if not ch:
                break
            if ch in "\r\n":
                if buf.strip():
                    self._tail = (self._tail + [buf])[-20:]
                    cb = self._progress
                    if cb and "|" in buf and "/" in buf:
                        try:
                            a, b = buf.split("|")[2].strip().split(" ")[0].split("/")
                            cb(int(a) / max(1, int(b)))
                        except Exception:
                            pass
                buf = ""
            else:
                buf += ch

    def run(self, job, on_progress=None, cancelled=lambda: False):
        """job: {image, ref, text, seed, lines} → PNG bytes."""
        out_dir = os.path.join(support_dir(), "work")
        os.makedirs(out_dir, exist_ok=True)
        images = [job["image"]] + ([job["ref"]] if job.get("ref") else [])
        if job.get("lines"):
            images[0] = lines_of(job["image"], out_dir)
        w, h = _work_size(images[0], job.get("mp", 1.0))
        out = os.path.join(out_dir, "out_%d.png" % int(time.time() * 1000))
        p = self._worker()
        self._progress = on_progress
        p.stdin.write(json.dumps({"images": images, "prompt": job["text"], "seed": int(job["seed"]) % 2**31,
                                  "width": w, "height": h, "output": out}) + "\n")
        p.stdin.flush()
        while True:
            if cancelled():
                self.interrupt()
                raise RuntimeError("Cancelled")
            line = p.stdout.readline()
            if not line:
                tail = "\n".join(getattr(self, "_tail", [])[-5:])
                self._proc = None
                raise RuntimeError("The image engine stopped: " + tail[-300:])
            line = line.strip()
            if line.startswith("{"):
                msg = json.loads(line)
                if msg.get("error"):
                    raise RuntimeError("The image engine failed: " + msg["error"][-300:])
                if msg.get("done"):
                    break
        with open(out, "rb") as fh:
            data = fh.read()
        os.remove(out)
        return data


WORKER = r"""
import json, sys, traceback
model_path = sys.argv[1]
from mflux.models.flux2.cli.flux2_edit_generate import build_parser, Flux2EditCommand

def parse(extra):
    sys.argv = ["mflux-generate-flux2-edit", "--model", model_path, "--base-model", "flux2-klein-4b"] + extra
    return build_parser().parse_args()

model = Flux2EditCommand.load(parse(["--prompt", "x", "--image-paths", "x.png"]))
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    try:
        j = json.loads(line)
        args = parse(["--prompt", j["prompt"], "--image-paths"] + j["images"] +
                     ["--seed", str(j["seed"]), "--steps", "4", "--width", str(j["width"]),
                      "--height", str(j["height"]), "--output", j["output"]])
        img = Flux2EditCommand.generate(model, args, j["seed"], j["prompt"])
        img.save(path=j["output"], overwrite=True)
        print(json.dumps({"done": True}), flush=True)
    except Exception:
        print(json.dumps({"error": traceback.format_exc()}), flush=True)
"""


def _work_size(path, mp=1.0):
    """About `mp` megapixels, multiples of 16, same shape as the picture."""
    w, h = Image.open(path).size
    f = math.sqrt(mp * 1e6 / float(w * h))
    return max(256, int(w * f) // 16 * 16), max(256, int(h * f) // 16 * 16)


def lines_of(path, folder):
    """The picture's lines, black on white (for CMF and style transfer)."""
    im = ImageOps.exif_transpose(Image.open(path)).convert("L")
    edges = im.filter(ImageFilter.GaussianBlur(1)).filter(ImageFilter.FIND_EDGES)
    edges = edges.point(lambda v: 0 if v > 28 else 255)
    p = os.path.join(folder, "lines_%d.png" % int(time.time() * 1000))
    edges.convert("RGB").save(p)
    return p


# -- the classic upscaler ----------------------------------------------------------

TILE = 256
PAD = 16


class ClassicEngine:
    """Stands in for the SeedVR2 engine on a Mac: same methods the upscaler
    page uses, but a fast classic model on onnxruntime."""

    def __init__(self, settings, models_dir_fn):
        self.settings = settings
        self.models_dir = models_dir_fn
        self.state, self.message = "idle", ""
        self.models = ["classic"]
        self.all_models = ["classic"]
        self.own = False
        self.url = "local"
        self.process = None
        self.learned_part_mp = None
        self.failed_tuning = False
        self.last_timings = None
        self._sess = None
        self._stop = False

    # the bits of Engine the app touches
    def connect(self, on_state=lambda s, m: None):
        if os.path.isfile(upscaler_path(self.models_dir())):
            self.state, self.message = "ready", "Upscaler ready"
        else:
            self.state, self.message = "error", "The upscaler isn't downloaded yet. Open Create and click Set up."
        on_state(self.state, self.message)

    def alive(self):
        return self.state == "ready"

    def busy(self):
        return False

    def refresh_models(self):
        pass

    def stop(self):
        pass

    def stop_own(self):
        pass

    def drop_queue(self):
        pass

    def interrupt(self):
        self._stop = True

    def _session(self):
        if self._sess is None:
            import onnxruntime as ort
            prov = [p for p in ("CoreMLExecutionProvider", "CPUExecutionProvider")
                    if p in ort.get_available_providers()]
            self._sess = ort.InferenceSession(upscaler_path(self.models_dir()), providers=prov)
        return self._sess

    def upscale(self, path, width, height, scale, model, max_res, on_progress=None, cancelled=lambda: False,
                **_):
        import numpy as np
        from . import workflow as wf
        self._stop = False
        scale = "max" if str(scale) == "max" else float(scale)
        ow, oh = wf.output_size(width, height, scale, max_res)
        im = ImageOps.exif_transpose(Image.open(path))
        # The model always makes 4×. Keep that intermediate under ~64 MP:
        # shrink the input first when 4× of it would be bigger than needed.
        if im.size[0] * im.size[1] * 16 > 64e6:
            f = max(ow / 4.0 / im.size[0], math.sqrt(64e6 / 16 / (im.size[0] * im.size[1])))
            if f < 1:
                im = im.resize((max(1, round(im.size[0] * f)), max(1, round(im.size[1] * f))), Image.LANCZOS)
        alpha = im.getchannel("A") if im.mode in ("RGBA", "LA") else None
        rgb = np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0
        h, w = rgb.shape[:2]
        sess = self._session()
        name = sess.get_inputs()[0].name
        out = np.zeros((h * 4, w * 4, 3), dtype=np.float32)
        tiles = [(x, y) for y in range(0, h, TILE) for x in range(0, w, TILE)]
        t0 = time.time()
        for i, (x, y) in enumerate(tiles):
            if cancelled() or self._stop:
                from .engine import EngineError
                raise EngineError("Cancelled")
            x0, y0 = max(0, x - PAD), max(0, y - PAD)
            x1, y1 = min(w, x + TILE + PAD), min(h, y + TILE + PAD)
            tile = rgb[y0:y1, x0:x1].transpose(2, 0, 1)[None]
            res = sess.run(None, {name: tile})[0][0].transpose(1, 2, 0)
            ix0, iy0 = (x - x0) * 4, (y - y0) * 4
            tw, th = min(TILE, w - x) * 4, min(TILE, h - y) * 4
            out[y * 4:y * 4 + th, x * 4:x * 4 + tw] = res[iy0:iy0 + th, ix0:ix0 + tw]
            if on_progress:
                done = (i + 1) / len(tiles)
                left = (time.time() - t0) / done * (1 - done)
                on_progress("Upscaling", done, left)
        big = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
        if big.size != (ow, oh):
            big = big.resize((ow, oh), Image.LANCZOS)
        if alpha is not None:
            big.putalpha(alpha.resize((ow, oh), Image.LANCZOS))
        buf = io.BytesIO()
        big.save(buf, "PNG", compress_level=1)
        return buf.getvalue()
