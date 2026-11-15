"""Vistiq Studio's jobs: setting up, creating images, the library.

Lives next to the upscaler's App; `Studio(app)` is made only in the Studio
build.
"""
import base64
import glob
import io
import json
import re
import logging
import os
import sys
import threading
import time

from PIL import Image, ImageFilter, ImageOps

from . import imaging, studio
from .engine import _local

log = logging.getLogger("vistiq")

#: Working size of the image model, in megapixels.
WORK_MP = 2.0
#: A painted area is cut out with this much of its surroundings (share of the
#: area's size), so the model sees what it has to blend into.
CONTEXT = 0.6
MIN_CROP = 640


# -- masks --------------------------------------------------------------------

def decode_mask(data_url, size):
    """The painted mask (white = change), at `size`, from a PNG data URL."""
    raw = base64.b64decode(data_url.split(",", 1)[1])
    m = Image.open(io.BytesIO(raw))
    if m.mode in ("RGBA", "LA"):
        m = m.getchannel("A")
    else:
        m = m.convert("L")
    if m.size != size:
        m = m.resize(size, Image.BILINEAR)
    return m.point(lambda v: 255 if v > 20 else 0)


def crop_box(mask, size):
    """The part of the picture to send to the model for a painted area:
    the paint plus some surroundings, never smaller than MIN_CROP."""
    box = mask.getbbox()
    if not box:
        return None
    w, h = size
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    pad_x, pad_y = int(bw * CONTEXT / 2), int(bh * CONTEXT / 2)
    x0, y0, x1, y1 = x0 - pad_x, y0 - pad_y, x1 + pad_x, y1 + pad_y
    cw, ch = max(x1 - x0, min(MIN_CROP, w)), max(y1 - y0, min(MIN_CROP, h))
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    x0, y0 = int(round(cx - cw / 2.0)), int(round(cy - ch / 2.0))
    x0, y0 = max(0, min(w - cw, x0)), max(0, min(h - ch, y0))
    return (x0, y0, min(w, x0 + cw), min(h, y0 + ch))


def feather(mask, px):
    """Soft edge of `px` pixels around the paint."""
    if px <= 0:
        return mask
    return mask.filter(ImageFilter.GaussianBlur(px / 2.0))


def composite(original, result, mask, box, blend_px):
    """Put the model's result back into the original: inside the paint only,
    with soft edges. Outside the paint the original's pixels are untouched."""
    out = original.copy()
    region = result.convert(original.mode).resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
    m = feather(mask.crop(box), blend_px)
    out.paste(region, box[:2], m)
    return out


def finish(im, clarity=0.0, sharp=0.35):
    """A clean finish, the way a retoucher cleans a render, without burning it:
    highlights roll off softly instead of clipping to white, the deepest
    blacks lift a touch (no crushed shadows), then local contrast (clarity)
    and a fine sharpen. No colour boost: colours stay true to the CMF. Checked
    against Pranay's reference interiors (clipping, black level, colour).
    Clarity is off by default: on leather and alcantara it turned faint
    unevenness into stains (Nov 2026); only a fine, small-radius sharpen."""
    import numpy as np
    out = im.convert("RGB")
    if clarity:
        out = out.filter(ImageFilter.UnsharpMask(radius=max(out.size) // 80, percent=int(clarity * 100), threshold=3))
    if sharp:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=int(sharp * 100), threshold=2))
    a = np.asarray(out).astype(np.float32) / 255
    knee, top = 0.80, 0.965                       # highlights ease into 96%, never hard white
    h = top - knee
    a = np.where(a > knee, knee + h * np.tanh((a - knee) / h), a)
    a = 0.018 + a * (1 - 0.018)                   # lift the floor: no crushed blacks
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def _blend(base, top, mode):
    """Photoshop-style blend of top over base (float arrays 0..1, RGB)."""
    import numpy as np
    if mode == "multiply":
        return base * top
    if mode == "screen":
        return 1 - (1 - base) * (1 - top)
    if mode == "overlay":
        return np.where(base < 0.5, 2 * base * top, 1 - 2 * (1 - base) * (1 - top))
    if mode == "darken":
        return np.minimum(base, top)
    if mode == "lighten":
        return np.maximum(base, top)
    return top


def flatten_layers(original, spec):
    """The picture with the layers painted in Studio, flattened at the picture's
    full size: what Create works on. spec = {base: {visible, opacity, blend},
    layers: [{png, opacity, blend, below_base}]} (bottom first)."""
    import numpy as np
    W, H = original.size
    b = spec.get("base") or {}
    white = np.ones((H, W, 3), dtype=np.float32)
    pic = np.asarray(original.convert("RGB"), dtype=np.float32) / 255
    out = white

    def over(out, rgb, alpha, mode):
        mixed = _blend(out, rgb, mode)
        return out * (1 - alpha) + mixed * alpha

    layers = spec.get("layers") or []
    for L in [x for x in layers if x.get("below_base")]:
        im = Image.open(io.BytesIO(base64.b64decode(L["png"].split(",", 1)[1]))).convert("RGBA").resize((W, H), Image.LANCZOS)
        a = np.asarray(im, dtype=np.float32) / 255
        out = over(out, a[..., :3], a[..., 3:4] * float(L.get("opacity", 1)), L.get("blend") or "normal")
    if b.get("visible", True):
        out = over(out, pic, np.full((H, W, 1), float(b.get("opacity", 1)), dtype=np.float32), b.get("blend") or "normal")
    for L in [x for x in layers if not x.get("below_base")]:
        im = Image.open(io.BytesIO(base64.b64decode(L["png"].split(",", 1)[1]))).convert("RGBA").resize((W, H), Image.LANCZOS)
        a = np.asarray(im, dtype=np.float32) / 255
        out = over(out, a[..., :3], a[..., 3:4] * float(L.get("opacity", 1)), L.get("blend") or "normal")
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))


def load_rgb(path):
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        return bg
    return im.convert("RGB")


# -- the library --------------------------------------------------------------------

KINDS = ("create", "reference", "upscale")


def kind_of(name):
    low = name.lower()
    if "_create" in low or "_refine" in low or "_paint" in low:
        return "create"
    if "_reference" in low or "_camera" in low or "_cmf" in low or "_style" in low:
        return "reference"
    return "upscale"


class Studio:
    def __init__(self, app):
        self.app = app
        self.settings = app.settings
        from .settings import data_dir
        if sys.platform == "darwin":
            from . import macos
            self.engine = macos.MlxEngine(lambda: studio.models_dir(app.settings))
        else:
            self.engine = studio.ImageEngine(app.settings, os.path.join(data_dir(), "logs"))
        self._cancel = threading.Event()
        self._job = None
        self._setup = None
        self._thumbs = {}
        from .bridge import Bridge
        self.bridge = Bridge(os.path.join(data_dir(), "photoshop"), self._on_frame)
        self.bridge.on_state = lambda state, msg: self.emit("studio-live-state", {
            "app": "photoshop", "state": state, "message": msg})
        def old_panel():
            from . import bridge as _b
            if getattr(app, "app_dir", None) and _b.update_panel(app.app_dir, os.path.join(data_dir(), "photoshop")):
                self.emit("studio-live-state", {"app": "photoshop", "state": "note",
                                                "message": "The Photoshop panel was updated. Restart Photoshop once."})
        self.bridge.on_old_panel = old_panel
        self.bridge.on_sel = self._on_sel
        self.bridge.on_placed = lambda name, ok, msg: self.emit("studio-sent", {
            "app": "photoshop", "ok": ok, "message": ("Placed in Photoshop as a new layer: " + name) if ok
            else ("Photoshop couldn't place it: " + (msg or "unknown reason"))})
        # Like a navigator: listen for Photoshop the whole time Studio is open.
        try:
            self.bridge.start()
            self.bridge.poke()
        except Exception:
            log.exception("Photoshop link")
        self.bridge.on_released = lambda: self.emit("studio-live-state", {
            "app": "photoshop", "state": "off",
            "message": "Another Vistiq Studio window took over the Photoshop link. Click Stop, then connect again here."})
        from .affinity import AffinityLink
        self.affinity = AffinityLink(os.path.join(data_dir(), "affinity"), self._on_frame,
                                     lambda st, m: self.emit("studio-live-state", {"app": "affinity", "state": st,
                                                                                   "message": m}))
        self._last_frame = 0

    def _on_sel(self, mask):
        """Photoshop's selection changed: show it over the live picture."""
        if mask is None:
            self.emit("studio-sel", {"on": False})
            return
        small = mask.copy()
        small.thumbnail((512, 512))
        # Transparent outside the selection, so the window can tint just that area.
        small = Image.merge("LA", (Image.new("L", small.size, 255), small))
        buf = io.BytesIO()
        small.save(buf, "PNG")
        self.emit("studio-sel", {"on": True, "preview": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()})

    def _ps_selection(self):
        """The current Photoshop selection as a PNG data URL (what a painted mask looks like)."""
        m = self.bridge.sel
        if m is None:
            return None
        buf = io.BytesIO()
        m.save(buf, "PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    def home_dir(self):
        return studio.home(self.settings)

    def freeze(self, path, name=""):
        """A still copy of a picture (the Live one) to sketch on, in Vistiq Studio/Sketches."""
        src = self.real_path(path)
        folder = os.path.join(studio.home(self.settings), "Sketches")
        os.makedirs(folder, exist_ok=True)
        stem = _strip_tags(os.path.splitext(os.path.basename(name or src))[0]) or "Sketch"
        n = 1
        while os.path.exists(os.path.join(folder, "%s · sketch %d.png" % (stem, n))):
            n += 1
        out = os.path.join(folder, "%s · sketch %d.png" % (stem, n))
        load_rgb(src).save(out, "PNG")
        return out

    def _read(self, path, use, say, req=""):
        """The picture reader's words for this picture, or "" (not installed, or it failed)."""
        if sys.platform == "darwin" or not studio.reader_installed(self.settings):
            return ""
        try:
            say("Reading your picture", None)
            from . import reader
            if not hasattr(self, "_reader"):
                self._reader = reader.Reader(lambda: studio.models_dir(self.settings))
            return self._reader.describe(path, use, req)
        except Exception as e:                       # never block a run over this
            log.warning("picture reader: %s", e)
            return ""

    def _next_seq(self):
        s = self.settings
        n = s.get("studio_seq")
        if not n:
            n = len(self._outputs())          # first time: carry on after what's already there
        n = int(n) + 1
        try:
            s.set("studio_seq", n)
        except Exception:
            log.exception("couldn't save the run number")
        return n

    def magic_warm(self):
        """Load the magic eraser in the background when its tool is picked, so
        the first stroke doesn't wait for it."""
        from . import eraser
        md = studio.models_dir(self.settings)
        if not eraser.installed(md):
            return False
        threading.Thread(target=lambda: eraser.warm(md), daemon=True).start()
        return True

    def magic_erase(self, image_url, mask_url):
        """The magic eraser (LaMa): downloads its model once, then about a second a stroke."""
        from . import eraser
        md = studio.models_dir(self.settings)
        if not eraser.installed(md):
            self.emit("studio-note", {"text": "Getting the magic eraser (%d MB, once)…" % eraser.MB})
            studio.download(eraser.URL, eraser.path(md), lambda label, f: self.emit(
                "studio-note", {"text": "Getting the magic eraser · %d%%" % round((f or 0) * 100)}), "Magic eraser")
        return eraser.erase(md, image_url, mask_url)

    def real_path(self, path):
        """A file for a picture: the mirrored Photoshop picture lives in memory,
        so write it out (once per picture) when something needs a file."""
        from .bridge import LIVE
        if not path or not str(path).startswith(LIVE):
            return path
        data = self.bridge.latest
        if not data:
            raise RuntimeError("Photoshop's picture isn't here any more. Open the file in Photoshop again.")
        tmp_dir = os.path.join(studio.home(self.settings), ".work")
        os.makedirs(tmp_dir, exist_ok=True)
        out = os.path.join(tmp_dir, "photoshop_live_%d.jpg" % self.bridge.n)
        if not os.path.isfile(out):
            for old in glob.glob(os.path.join(tmp_dir, "photoshop_live_*.jpg")):
                try:
                    os.remove(old)
                except OSError:
                    pass
            with open(out, "wb") as fh:
                fh.write(data)
        return out

    def _on_frame(self, f):
        """A new canvas from Photoshop: show it in Create."""
        try:
            data = f.pop("data", None)
            f["preview"] = imaging.preview(data if data is not None else f["path"])
        except Exception:
            return
        self.emit("studio-live", f)

    def emit(self, kind, data):
        self.app.emit(kind, data)

    def say(self, state, message=""):
        self.emit("studio-engine", {"state": state, "message": message})

    # -- status and setup ----------------------------------------------------

    def status(self):
        st = studio.status(self.settings)
        st["engine"] = {"state": self.engine.state, "message": self.engine.message}
        st["apps"] = installed_apps()
        st["sizes"] = recommended_sizes()
        st["times"] = dict(self.settings.get("studio_times") or {}, warm=bool(getattr(self, "_warm", False)))
        st["busy"] = bool(self._job and self._job.is_alive())
        st["setup_running"] = bool(self._setup and self._setup.is_alive())
        st["free_gb"] = _free_gb(studio.home(self.settings))
        return st

    def take_from(self, folder):
        def run():
            try:
                taken = studio.import_from(folder, self.settings,
                                           lambda label, f: self.emit("studio-setup", {"state": "running",
                                                                                         "label": label, "fraction": f}))
                self.emit("studio-setup", {"state": "done", "taken": taken, "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("import failed")
                self.emit("studio-setup", {"state": "error", "message": str(exc)})
        threading.Thread(target=run, daemon=True).start()
        return True

    def setup(self, juice=False):
        """Download what is missing and can be downloaded: the image engine,
        then the model files without a login."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()

        def run():
            def prog(label, fraction):
                self.emit("studio-setup", {"state": "running", "label": label, "fraction": fraction})
            try:
                if sys.platform == "darwin":
                    from . import macos
                    macos.install(studio.models_dir(self.settings), studio.download, prog, self._cancel.is_set,
                                  want_generate=macos.can_generate())
                    if not studio.select_installed(self.settings):
                        try:
                            studio.install_select(self.settings, prog, self._cancel.is_set)
                        except Exception:
                            log.exception("couldn't get the selection tool")
                    self.app.engine.connect()
                    self.emit("engine", {"state": self.app.engine.state, "message": self.app.engine.message,
                                         "models": self.app.engine.models})
                    self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
                    return
                # 1. Files already on this PC: an existing ComfyUI, and the
                #    Downloads folder (where a file fetched by hand lands).
                for folder in (studio.guess_comfy_models(self.settings), _downloads()):
                    if folder and os.path.isdir(folder):
                        prog("Looking for model files on this PC", None)
                        studio.import_from(folder, self.settings, prog)
                # 2. The image engine, then what can be downloaded.
                if not studio.engine_installed():
                    studio.install_engine(self.settings, prog, self._cancel.is_set)
                t = self.settings.get("studio_tier") or studio.tier(self.settings) or "good"
                for f in studio.FILES:
                    if f["part"] == "juice" and not juice:
                        continue
                    if f["part"] == "qwenedit":
                        continue                     # only on request (Settings)
                    if f["part"] == "create" and not studio.in_tier(f, t):
                        continue
                    if f["url"] and not studio.find(f["key"], self.settings):
                        dst = os.path.join(studio.models_dir(self.settings), f["folder"], f["names"][0])
                        studio.download(f["url"], dst, prog, f["label"], self._cancel.is_set)
                if not studio.select_installed(self.settings):
                    try:
                        studio.install_select(self.settings, prog, self._cancel.is_set)
                    except Exception:
                        log.exception("couldn't get the selection tool; the brush still works")
                studio.write_model_paths(self.settings)
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("studio setup failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc) == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def get_helper(self):
        """Download the prompt helper (about 1.1 GB)."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()
        from . import helper

        def run():
            try:
                helper.install(studio.models_dir(self.settings), studio.download, lambda label, f: self.emit(
                    "studio-setup", {"state": "running", "label": label, "fraction": f}), self._cancel.is_set)
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("prompt helper download failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc).lower() == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def _condense(self, preset, text):
        """Very long prompts (pasted from chat tools) made FLUX 3 dark and
        dramatic and it invented parts. Over 80 words, the prompt helper boils
        it down to the essentials first, when it's installed."""
        if len(text.split()) <= 80 or not studio.helper_installed(self.settings):
            return text
        try:
            short = self.improve(preset, studio.clean_prompt(text))
            return short if short and len(short.split()) >= 8 else text
        except Exception as e:                     # never block a run over this
            log.warning("prompt helper couldn't shorten the prompt: %s", e)
            return text

    def get_reader(self):
        """Download the picture reader (about 2.6 GB)."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()
        from . import reader

        def run():
            try:
                reader.install(studio.models_dir(self.settings), studio.download, lambda label, f: self.emit(
                    "studio-setup", {"state": "running", "label": label, "fraction": f}), self._cancel.is_set)
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("picture reader download failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc).lower() == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def get_qwenedit(self):
        """Download Qwen Image Edit (about 31 GB) and switch to it."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()

        def run():
            prog = lambda label, f: self.emit("studio-setup", {"state": "running", "label": label, "fraction": f})
            try:
                for f in studio.FILES:
                    if f["part"] == "qwenedit" and not studio.find(f["key"], self.settings):
                        dst = os.path.join(studio.models_dir(self.settings), f["folder"], f["names"][0])
                        studio.download(f["url"], dst, prog, f["label"], self._cancel.is_set)
                studio.write_model_paths(self.settings)
                self.settings.set("studio_engine", "qwenedit")
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("Qwen Image Edit download failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc).lower() == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def get_reader_xl(self):
        """Download the XL picture reader (about 6 GB): reads sketches much better."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()
        from . import reader

        def run():
            try:
                reader.install(studio.models_dir(self.settings), studio.download, lambda label, f: self.emit(
                    "studio-setup", {"state": "running", "label": label, "fraction": f}), self._cancel.is_set, xl=True)
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("picture reader XL download failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc).lower() == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def describe(self, path, use):
        """A reference's camera, light, style or materials in words."""
        from . import reader
        if not studio.reader_installed(self.settings):
            return ""
        if not hasattr(self, "_reader"):
            self._reader = reader.Reader(lambda: studio.models_dir(self.settings))
        return self._reader.describe(self.real_path(path), use)

    def meta(self, path):
        return _read_meta(self.real_path(path)) or {}

    def improve(self, preset, text):
        from . import helper
        if not hasattr(self, "_helper"):
            self._helper = helper.Helper(lambda: studio.models_dir(self.settings))
        return self._helper.improve(preset, text)

    def get_select(self):
        """Download the Select tool now (otherwise its first click does)."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()

        def run():
            try:
                studio.install_select(self.settings, lambda label, f: self.emit(
                    "studio-setup", {"state": "running", "label": label, "fraction": f}), self._cancel.is_set)
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("select download failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc).lower() == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def cancel(self):
        self._cancel.set()
        self.engine.interrupt()

    # -- jobs ------------------------------------------------------------------------

    def run(self, job):
        """job: {mode: create|reference, image, reference?, preset, text,
        keep, variations, mask?, blend, lora?, lora_strength, juice?,
        juice_lora?, seed?, refine_of?}"""
        if self._job and self._job.is_alive():
            return False
        if job.get("mask") == "ps-selection":
            # Taken together with the picture, so both are from the same moment.
            job["mask"] = self._ps_selection()
        if job.get("live_app") or str(job.get("image") or "").startswith("live://"):
            try:
                job["image"] = self._hold_live(job.get("image"))
            except Exception as exc:
                self.emit("studio-job", {"state": "error", "message": str(exc)})
                return False
        if not studio.status(self.settings)["create_ready"]:
            self.emit("studio-job", {"state": "error", "message": "Some model files are missing. See Settings."})
            return False
        self._cancel.clear()
        job_id = "%x" % int(time.time() * 1000)
        self._job = threading.Thread(target=self._run, args=(job_id, job), daemon=True)
        self._job.start()
        return job_id

    def _hold_live(self, path):
        """Live frames get replaced every second; keep our own copy of the one Create uses."""
        import glob
        import shutil
        if not path:
            return path
        path = self.real_path(path)
        if not os.path.isfile(path):
            frames = sorted(glob.glob(os.path.join(os.path.dirname(path), "*.jpg")) +
                            glob.glob(os.path.join(os.path.dirname(path), "*.png")), key=os.path.getmtime)
            if not frames:
                return path
            path = frames[-1]
        tmp_dir = os.path.join(studio.home(self.settings), ".work")
        os.makedirs(tmp_dir, exist_ok=True)
        keep = os.path.join(tmp_dir, "live_" + os.path.basename(path))
        try:
            shutil.copyfile(path, keep)
            return keep
        except OSError:
            return path

    def _run(self, job_id, job):
        s = self.settings
        n = max(1, min(4, int(job.get("variations") or 1)))
        say = lambda stage, frac: self.emit("studio-job", {"id": job_id, "state": "running", "stage": stage,
                                                            "fraction": frac})
        try:
            say("Getting ready", None)
            self.app.free_upscaler()
            if not studio.engine_installed() and sys.platform != "darwin":
                # First Create on this PC: set up the image engine on the way
                # (one time, about 2 GB), instead of stopping with an error.
                if self._setup and self._setup.is_alive():
                    say("Waiting for the setup to finish", None)
                    self._setup.join()
                if not studio.engine_installed():
                    studio.install_engine(self.settings, lambda label, f: say(
                        "One-time setup · " + label, f), self._cancel.is_set)
            if not self.engine.alive() and not self.engine.start(self.say):
                raise RuntimeError(self.engine.message)
            src_path = job["image"]
            if job.get("live_app") == "affinity":
                need = __import__("vistiq.macos", fromlist=["x"]).work_side() if sys.platform == "darwin" else None
                if not need:
                    say("Getting the full-size canvas from Affinity", None)
                src_path = self.affinity.export_full(need, src_path) or src_path
            original = load_rgb(src_path)
            if job.get("layers"):
                original = flatten_layers(original, job["layers"])   # painted layers on top, as seen
            # Reference images (Create): each gives one thing (camera, materials, style, light).
            refs = [r for r in (job.get("refs") or []) if r and r.get("path")][:3] if job.get("mode", "create") == "create" else []
            uses = [r.get("use") or "describe" for r in refs]
            cam_i = uses.index("camera") + 1 if "camera" in uses else 0
            sent = list(range(len(refs)))
            mask = box = None
            if job.get("mask") and not cam_i:      # a new camera view changes the whole picture
                mask = decode_mask(job["mask"], original.size)
                box = crop_box(mask, original.size)
                if not box:
                    mask = None
            work = original.crop(box) if box else original
            tmp_dir = os.path.join(studio.home(s), ".work")
            os.makedirs(tmp_dir, exist_ok=True)
            work_path = os.path.join(tmp_dir, "in_%s.png" % job_id)
            work.save(work_path, "PNG", compress_level=1)
            image = self.engine.upload(work_path)
            ref_image = None
            mode = job.get("mode") or "create"
            ref_images = []
            for i, r in enumerate(refs):
                rp = os.path.join(tmp_dir, "cref%d_%s.png" % (i, job_id))
                load_rgb(self.real_path(r["path"])).save(rp, "PNG", compress_level=1)
                ref_images.append(self.engine.upload(rp))
            job = dict(job, text=self._condense(job.get("preset") or "", job.get("text") or ""))
            if mode == "reference":
                ref_path = os.path.join(tmp_dir, "ref_%s.png" % job_id)
                load_rgb(job["reference"]).save(ref_path, "PNG", compress_level=1)
                ref_image = self.engine.upload(ref_path)
                text = studio.build_text(job.get("preset") or "camera", job.get("text"), studio.REF_PRESETS,
                                         f3=studio.flux3_ready(s))
            elif refs:
                text, sent = studio.ref_plan(job.get("text"), refs, job.get("locks"), (job.get("preset") or "") == "sketch",
                                             float(job.get("keep") if job.get("keep") is not None else 0.8))
                user_text = job.get("text") or ""
                # Only references that go in as pictures; the frame is the design's,
                # or a camera reference's when its camera couldn't be put into words.
                cam_i = (sent.index(cam_i - 1) + 1) if cam_i and (cam_i - 1) in sent else 0
                ref_images = [ref_images[i] for i in sent]
            elif job.get("instant"):
                scene = self._read(work_path, "scene", say)
                text = studio.instant_text(job.get("text") or "", scene)
            else:
                # Words: the picture reader spells out everything the change means in this picture
                # (snow on the ground and on the truck, winter clothes…), the way a person would.
                if (job.get("text") or "").strip() and not job.get("refine_of"):
                    more = self._read(work_path, "edit", say, job.get("text"))
                    if more:
                        # The fuller instruction replaces the words; the result still shows yours.
                        user_words = job.get("text")
                        job = dict(job, text=more, said=user_words)
                text = studio.build_text(job.get("preset") or "", job.get("text"))
                if job.get("locks"):
                    text = studio.with_locks(text, job["locks"], (job.get("preset") or "") == "sketch")
            # Lab (testing only): %APPDATA%\VistiqStudio\lab.json tries other wordings
            # and image orders for references without a new build.
            lab = _lab() if refs else {}
            if lab.get("text"):
                text = lab["text"].replace("{auto}", text).replace("{user}", user_text)
            seed = int(job.get("seed") or int(time.time()) % 100000 * 7919)
            keep = float(job.get("keep") if job.get("keep") is not None else 0.8)
            camera = mode == "reference" and (job.get("preset") or "camera") == "camera"
            if refs or job.get("instant"):
                pass                    # the wording already says what to keep
            elif camera:
                # "Follow my sketch" here means the design; the view comes from the reference.
                if keep >= 0.3:
                    text = text + "\n\n" + studio.F3_CAMERA_KEEP
            elif (job.get("locks") or {}).get("camera") is False and studio.flux3_ready(s) and keep >= 0.6:
                # Camera unlocked: keep the design, but let the words move the camera.
                text = studio.F3_FREE_CAM + "\n\n" + text
            elif studio.flux3_ready(s) and keep >= 0.6 and studio.F3_KEEP not in text:
                # FLUX 3 weighs what comes first: the design leads, nothing is added.
                text = studio.F3_HOLD + "\n\n" + text
            elif not _has_lock(s) and studio.F3_KEEP not in text:
                # Without the design lock, the slider works through the wording.
                text = text + "\n\n" + follow_words(keep, studio.flux3_ready(s))
            if studio.use_qwenedit(s) and mode == "create":
                # Qwen Image Edit reads short, direct instructions best (the long
                # FLUX wording made it muddy and stopped camera moves).
                text = studio.qwen_text(job.get("text") or "", instant=bool(job.get("instant")),
                                        scene=locals().get("scene") or "", locks=job.get("locks"),
                                        ref_head=(text.split("\n\n")[0] if refs else ""),
                                        sketch=(job.get("preset") or "") == "sketch")
            stem = os.path.splitext(os.path.basename(job.get("name") or src_path))[0]
            if stem.lower().startswith("vistiq_"):
                stem = stem[7:]
            stem = _strip_tags(re.sub(r"^\d{4,}_", "", stem))
            # Every run gets the next number first, so the files sort in the order they were made.
            seq = self._next_seq()
            stem = "%04d_%s" % (seq, stem)
            tag = ("refine" if job.get("refine_of") else
                   ("paint" if mask is not None else ("create" if mode == "create" else (job.get("preset") or "reference"))))
            out_dir = os.path.join(studio.outputs_dir(s), time.strftime("%Y-%m-%d"))
            results = []
            # How long this should take, from earlier runs on this computer:
            # seconds per variation, plus the model loading of a session's first run.
            times = dict(s.get("studio_times") or {})
            per, load = times.get("per"), times.get("load")
            first = not getattr(self, "_warm", False)
            if per:
                est = per * n + ((load or 0) if first else 0)
                self.emit("studio-job", {"id": job_id, "state": "running", "stage": "Starting", "fraction": 0,
                                         "estimate": round(est)})
            t_start = time.time()
            for v in range(n):
                if self._cancel.is_set():
                    raise RuntimeError("Cancelled")
                t_var = time.time()
                label = "Variation %d of %d" % (v + 1, n) if n > 1 else "Creating"
                say(label, v / n)
                prog = lambda f, v=v: say(label, (v + f) / n)
                if sys.platform != "darwin" and studio.use_qwenedit(s):
                    imgs = [image] + list(ref_images or ([ref_image] if ref_image else []))
                    fr = cam_i if refs else (1 if mode == "reference" and (job.get("preset") or "camera") == "camera" else 0)
                    prompt = studio.qwenedit_prompt(s, imgs, text, seed + v, frame=fr)
                elif sys.platform == "darwin":
                    prompt = {"image": image, "ref": ref_image or (ref_images[0] if ref_images else None), "text": text,
                              "seed": seed + v, "keep": keep,
                              "lines": mode == "reference" and job.get("preset") in ("cmf", "style")}
                elif mode == "reference":
                    prompt = studio.reference_prompt(s, image, ref_image, text, job.get("preset") or "camera",
                                                     keep, WORK_MP, seed + v)
                elif refs and lab and studio.flux3_ready(s):
                    toks = {"d": image}
                    toks.update({"r%d" % (i + 1): im for i, im in enumerate(ref_images)})
                    order = [t for t in (lab.get("order") or ["d"] + ["r%d" % (i + 1) for i in range(len(ref_images))]) if t in toks]
                    fr = lab.get("frame") or ("r%d" % cam_i if cam_i else "d")
                    prompt = studio.flux3_prompt(s, [toks[t] for t in order], text, seed=seed + v,
                                                 frame=order.index(fr) if fr in order else 0,
                                                 megapixels=float(lab.get("mp", studio.F3_MP)),
                                                 ref_mp=float(lab.get("ref_mp", studio.F3_REF_MP)),
                                                 steps=int(lab.get("steps", studio.F3_STEPS)))
                elif refs:
                    # The design lock keeps image 1's view too: off for a new camera.
                    prompt = studio.create_prompt(s, image, text, 0 if cam_i else keep, WORK_MP, seed + v,
                                                  refs=ref_images, frame=cam_i)
                elif job.get("instant"):
                    # One copy of the sketch: two make the model trace the lines instead of building the parts.
                    prompt = studio.create_prompt(s, image, text, min(keep, 0.9), WORK_MP, seed + v)
                else:
                    prompt = studio.create_prompt(s, image, text, keep, WORK_MP, seed + v)
                if sys.platform != "darwin":
                    _add_lora(prompt, job.get("lora"), job.get("lora_strength", 0.8))
                def preview(pic, v=v):
                    self.emit("studio-preview", {"id": job_id, "index": v,
                                                 "preview": "data:image/jpeg;base64," + base64.b64encode(pic).decode()})
                import inspect
                if "on_preview" in inspect.signature(self.engine.run).parameters:
                    data = self.engine.run(prompt, prog, self._cancel.is_set, on_preview=preview)
                else:                      # an engine without previews (the Mac one)
                    data = self.engine.run(prompt, prog, self._cancel.is_set)
                if sys.platform != "darwin" and job.get("juice") and studio.status(s)["juice_ready"] and job.get("juice_lora"):
                    say("Finishing pass · " + label.lower(), (v + 0.9) / n)
                    jpath = os.path.join(tmp_dir, "juice_%s_%d.png" % (job_id, v))
                    with open(jpath, "wb") as fh:
                        fh.write(data)
                    jimg = self.engine.upload(jpath)
                    amount = max(0.0, min(1.0, float(job.get("juice"))))
                    jp = studio.juice_prompt(s, jimg, text, job["juice_lora"], 0.8, 0.18 + 0.27 * amount,
                                             WORK_MP, seed + v)
                    juiced = self.engine.run(jp, None, self._cancel.is_set)
                    if _is_blank(juiced):
                        # Some styles break the finishing model (it returns a black
                        # picture). Keep the image from before the pass instead.
                        log.warning("finishing pass with %s gave a blank picture", job.get("juice_lora"))
                        pass   # keep the picture from before the pass, quietly
                    else:
                        data = juiced
                result = Image.open(io.BytesIO(data)).convert("RGB")
                if not (mode == "reference" and job.get("preset") == "style") and "style" not in uses \
                        and s.get("studio_finish", True):
                    result = finish(result)        # a style reference keeps its own look
                if mask is not None:
                    blend = int(float(job.get("blend", 0.35)) * 0.06 * max(box[2] - box[0], box[3] - box[1])) + 2
                    result = composite(original, result, mask, box, blend)
                buf = io.BytesIO()
                result.save(buf, "PNG")
                path, w, h = imaging.save(buf.getvalue(), stem + ".png", out_dir, "PNG",
                                          "%s_v%d" % (tag, v + 1), limit=16384)
                meta = {"mode": mode, "preset": job.get("preset"), "text": job.get("said") or job.get("text") or "",
                        "keep": keep, "seed": seed + v, "source": src_path, "reference": job.get("reference"),
                        "painted": mask is not None, "instant": bool(job.get("instant")),
                        "refs": [{"path": r["path"], "use": u, "desc": r.get("desc") or ""} for r, u in zip(refs, uses)],
                        "prompt": text, "lab": lab or None, "juice": job.get("juice") or 0, "lora": job.get("lora"),
                        "kind": "reference" if mode == "reference" else "create",
                        "made": time.strftime("%Y-%m-%d %H:%M:%S")}
                _write_meta(path, meta)
                item = {"path": path, "w": w, "h": h, "name": os.path.basename(path),
                        "preview": imaging.preview(path), "meta": meta}
                results.append(item)
                took = time.time() - t_var
                if v == 0 and first:
                    # The first variation includes loading the models: learn both parts.
                    times["load"] = round(max(0.0, took - (per or took * 0.5)), 1) if per else round(took * 0.5, 1)
                    took = took - times["load"]
                times["per"] = round(took if not times.get("per") else times["per"] * 0.6 + took * 0.4, 1)
                try:
                    s.set("studio_times", times)
                except Exception:
                    log.exception("couldn't save creation times")
                self._warm = True
                self.emit("studio-result", {"id": job_id, "result": item, "index": v, "of": n})
            self.emit("studio-job", {"id": job_id, "state": "done", "count": len(results)})
        except Exception as exc:
            msg = str(exc)
            if msg.lower() == "cancelled":
                msg = "Cancelled"
            if msg != "Cancelled":
                log.exception("studio job failed")
            self.emit("studio-job", {"id": job_id, "state": "cancelled" if msg == "Cancelled" else "error",
                                     "message": "" if msg == "Cancelled" else msg})

    # -- select object ----------------------------------------------------------

    def select(self, path, points, out_w, out_h):
        """Outline of the object under the clicked points, as a PNG data URL
        of out_w x out_h (the painting canvas)."""
        from . import picker
        path = self.real_path(path)
        if not studio.select_installed(self.settings):
            self.emit("studio-select", {"state": "installing"})
            studio.install_select(self.settings, lambda label, f: self.emit(
                "studio-select", {"state": "installing", "label": label, "fraction": f}))
        if not hasattr(self, "_picker"):
            self._picker = picker.Selector()
        mask = self._picker.select(studio.models_dir(self.settings), path,
                                   [(float(u), float(v), bool(pos)) for u, v, pos in points],
                                   (int(out_w), int(out_h)))
        return "data:image/png;base64," + base64.b64encode(picker.to_png(mask)).decode("ascii")

    # -- the library ----------------------------------------------------------------

    def _outputs(self):
        """(mtime, path) of every picture Studio made, newest first."""
        roots = [studio.outputs_dir(self.settings)]
        up = self.settings.get("out_dir")
        if up and os.path.normcase(up) not in [os.path.normcase(r) for r in roots]:
            roots.append(up)
        found = []
        for root in roots:
            if not os.path.isdir(root):
                continue
            for dirpath, _dirs, files in os.walk(root):
                if os.sep + ".work" in dirpath:
                    continue
                for f in files:
                    if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and f.startswith("Vistiq_"):
                        p = os.path.join(dirpath, f)
                        try:
                            found.append((os.path.getmtime(p), p))
                        except OSError:
                            pass
        found.sort(reverse=True)
        return found

    def library(self, limit=200):
        found = self._outputs()
        out = []
        for mtime, p in found[:limit]:
            meta = _read_meta(p)
            out.append({"path": p, "name": os.path.basename(p), "kind": meta.get("kind") or kind_of(os.path.basename(p)),
                        "made": mtime * 1000, "text": meta.get("text", ""), "thumb": self.thumb(p, mtime)})
        return out

    def results_for(self, name):
        """Everything ever made from a picture (by its name), newest last: the strip
        under it always shows them all, also after a restart."""
        from . import imaging
        stem = _strip_tags(os.path.splitext(os.path.basename(name or ""))[0])
        if stem.lower().startswith("vistiq_"):
            stem = _strip_tags(stem[7:])
        if not stem:
            return []
        out = []
        for mtime, p in self._outputs():
            nm = os.path.basename(p)
            s2 = os.path.splitext(nm)[0]
            s2 = _strip_tags(s2[7:] if s2.lower().startswith("vistiq_") else s2)
            if s2 != stem or kind_of(nm) not in ("create", "reference"):
                continue
            try:
                w, h = imaging.size_of(p)
            except Exception:
                continue
            meta = _read_meta(p)
            out.append({"path": p, "name": nm, "w": w, "h": h, "thumb": self.thumb(p, mtime), "made": mtime * 1000,
                        "meta": {"text": meta.get("text", ""), "preset": meta.get("preset", ""), "source": meta.get("source", ""),
                                 "instant": bool(meta.get("instant")),
                                 "refs": [{"use": r.get("use")} for r in (meta.get("refs") or [])]}})
        out.sort(key=lambda x: x["made"])
        return out

    def thumb(self, path, mtime):
        key = (path, mtime)
        t = self._thumbs.get(key)
        if t is None:
            try:
                im = load_rgb(path)
                im.thumbnail((360, 360), Image.LANCZOS)
                buf = io.BytesIO()
                im.save(buf, "JPEG", quality=80)
                t = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception:
                t = ""
            self._thumbs[key] = t
        return t

    def shutdown(self):
        self._cancel.set()
        self.bridge.stop()
        self.affinity.stop()
        if hasattr(self, "_helper"):
            self._helper.stop()
        if hasattr(self, "_reader"):
            self._reader.stop()
        if not self.settings.get("keep_engine", True):
            self.engine.stop()


def _is_blank(data):
    """A black (or one-colour) picture: what a broken style makes."""
    try:
        im = Image.open(io.BytesIO(data)).convert("L")
        im.thumbnail((64, 64))
        lo, hi = im.getextrema()
        return hi - lo < 8
    except Exception:
        return False


def _lab():
    try:
        from .settings import data_dir
        p = os.path.join(data_dir(), "lab.json")
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as fh:
                d = json.load(fh)
            return d if isinstance(d, dict) and d.get("on", True) else {}
    except Exception as e:
        log.warning("lab.json unreadable: %s", e)
    return {}


def _has_lock(settings):
    # The design lock is a Klein 9B add-on; FLUX 3 follows the picture through the wording.
    return (sys.platform != "darwin" and not studio.flux3_ready(settings) and studio.tier(settings) != "good"
            and bool(studio.find("consistency", settings)))


def follow_words(keep, f3=False):
    """How closely to follow the picture, in words the model understands."""
    if f3:
        if keep >= 0.6:
            return studio.F3_KEEP
        if keep >= 0.3:
            return "Use the first image as the base, but feel free to refine shapes and details."
        return "Use the first image only as loose inspiration; reinterpret it creatively."
    if keep >= 0.9:
        return "Follow the input image exactly: every line, shape, proportion and the camera view stay identical."
    if keep >= 0.6:
        return "Stay close to the input image: keep its shapes, proportions and camera view."
    if keep >= 0.3:
        return "Use the input image as the base, but feel free to refine shapes and details."
    return "Use the input image only as loose inspiration; reinterpret it creatively."


def _add_lora(prompt, lora, strength):
    """An extra Klein LoRA (a look), after Klein-consistency."""
    if prompt.get("1", {}).get("inputs", {}).get("unet_name", "").startswith(("flux3", "qwen")):
        return          # Klein 9B looks fit neither FLUX 3 nor Qwen
    if not lora or lora in studio.RETIRED or any(lora in f["names"] for f in studio.FILES if f["folder"] == "loras"):
        return          # Studio's own helpers are already in the job
    model = prompt["40"]["inputs"]["model"]
    # Node 5 is True V2's speed-up and 4 the design lock: the style gets its own number.
    prompt["7"] = {"class_type": "LoraLoaderModelOnly",
                   "inputs": {"model": model, "lora_name": lora, "strength_model": round(float(strength), 2)}}
    prompt["40"]["inputs"]["model"] = ["7", 0]


def _strip_tags(stem):
    import re
    stem = re.sub(r"^\d{4,}_", "", stem)            # the run number in front
    return re.sub(r"_(create|refine|paint|reference|camera|cmf|style)_v\d+(_\d+)?$", "", stem) or stem


def _meta_path(path):
    return os.path.join(os.path.dirname(path), ".vistiq", os.path.basename(path) + ".json")


def _write_meta(path, meta):
    try:
        mp = _meta_path(path)
        os.makedirs(os.path.dirname(mp), exist_ok=True)
        if os.name == "nt":
            import ctypes  # noqa
            ctypes.windll.kernel32.SetFileAttributesW(os.path.dirname(mp), 0x02)
        with open(mp, "w", encoding="utf-8") as fh:
            json.dump(meta, fh)
    except Exception:
        log.exception("couldn't write image notes")


def _read_meta(path):
    try:
        with open(_meta_path(path), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def recommended_sizes():
    """The largest upscale to recommend here (and, on a Mac, allow)."""
    if sys.platform == "darwin":
        from . import macos
        cap = macos.max_side()
        return {"recommended": cap, "allowed": cap, "why": "%d GB memory" % macos.ram_gb()}
    try:
        from . import models
        vram = models._vram() or 0
    except Exception:
        vram = 0
    rec = 4096 if vram and vram <= 8 else 7000 if vram and vram <= 16 else 8192 if vram else 7000
    return {"recommended": rec, "allowed": 16384,
            "why": ("%d GB graphics card" % round(vram)) if vram else "this PC"}


def installed_apps():
    """Which drawing apps this computer has (for Live from app)."""
    import glob
    if sys.platform == "darwin":
        ps = glob.glob("/Applications/Adobe Photoshop*")
        af = glob.glob("/Applications/Affinity*.app")
    else:
        pf = [os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", "")]
        ps = [g for p in pf if p for g in glob.glob(os.path.join(p, "Adobe", "Adobe Photoshop*"))]
        af = [g for p in pf if p for g in glob.glob(os.path.join(p, "Affinity*"))]
        af += glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WindowsApps", "*Affinity*"))
    return {"photoshop": bool(ps), "affinity": bool(af)}


def _downloads():
    return os.path.join(os.path.expanduser("~"), "Downloads")


def _free_gb(path):
    import shutil
    p = path
    while p and not os.path.exists(p):
        p = os.path.dirname(p)
    try:
        return round(shutil.disk_usage(p or os.path.expanduser("~")).free / 1e9)
    except OSError:
        return 0
