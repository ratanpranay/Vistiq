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


def composite(original, result, mask, box, blend_px, grow=False):
    """Put the model's result back into the original: inside the paint only,
    with soft edges. Outside the paint the original's pixels are untouched.
    grow: something was added; where the result clearly differs from the original next to the
    paint (the added object running past its edge) it is kept too, so the object is whole."""
    out = original.copy()
    region = result.convert(original.mode).resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
    mc = mask.crop(box).convert("L")
    if grow:
        try:
            import numpy as np
            a = np.asarray(original.crop(box).convert("L")).astype(np.int16)
            b = np.asarray(region.convert("L")).astype(np.int16)
            diff = Image.fromarray((np.abs(a - b) > 28).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))
            small = mc.resize((max(1, mc.size[0] // 8), max(1, mc.size[1] // 8)))      # only near the paint
            reach = small.filter(ImageFilter.MaxFilter(max(3, (max(small.size) // 6) | 1))).resize(mc.size)
            extra = Image.fromarray(np.minimum(np.asarray(diff), np.asarray(reach)).astype(np.uint8))
            mc = Image.fromarray(np.maximum(np.asarray(mc), np.asarray(extra)).astype(np.uint8))
        except Exception:
            pass
    m = feather(mc, blend_px)
    out.paste(region, box[:2], m)
    return out


ADD_WORDS = re.compile(r"\b(add|adds|adding|place|put|insert|with a|include)\b", re.I)


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


DESIGN_WORDS = re.compile(r"\b(design\w*|redesign\w*|inspired|inspiration|variation\w*|concept\w*|imagine|reimagine|new shape)\b", re.I)
# Words that say the strokes only mark a place ("in the green highlighted area", "remove green").
MARK_WORDS = re.compile(r"\b(?:in|inside|within|on)?\s*(?:the\s+)?(?:green|red|blue|yellow|pink|purple|orange|painted|marked|"
                        r"highlighted|circled|scribbled)\s+(?:highlighted\s+|marked\s+)?(?:area|part|region|zone|spot|bit|marking|"
                        r"strokes?|lines?)\b|\bremove (?:the\s+)?(?:green|red|blue|yellow|pink|purple|orange)(?:\s+(?:paint|marking|"
                        r"strokes?|lines?|colou?r|highlight))?\b|\bhighlighted\b", re.I)


def painted_area(spec, size, grow=0.02):
    """The area covered by painted strokes (layers above the picture), grown a little and filled,
    as a selection mask; None when nothing is painted."""
    import numpy as np
    from . import picker
    W, H = size
    acc = None
    for L in [x for x in (spec.get("layers") or []) if not x.get("below_base")]:
        try:
            im = Image.open(io.BytesIO(base64.b64decode(L["png"].split(",", 1)[1]))).convert("RGBA").resize((W, H), Image.BILINEAR)
        except Exception:
            continue
        a = np.asarray(im.getchannel("A")) > 40
        acc = a if acc is None else (acc | a)
    if acc is None or acc.sum() < 0.0005 * W * H:
        return None
    m = Image.fromarray((acc * 255).astype("uint8"), "L")
    f = max(1, max(W, H) // 512)
    small = m.resize((max(1, W // f), max(1, H // f)), Image.BILINEAR)
    k = max(3, int(max(small.size) * grow) | 1)
    small = small.filter(ImageFilter.MaxFilter(k))
    small = picker.fill_holes(small.point(lambda v: 255 if v > 60 else 0))
    return small.resize((W, H), Image.BILINEAR).point(lambda v: 255 if v > 127 else 0)


def marker_colour(spec):
    """True when the painted strokes are a bright marker colour (green, red, yellow, neon...): a marking,
    not a drawing (black or grey lines are a drawing of the new shape)."""
    import numpy as np
    px = []
    for L in [x for x in (spec.get("layers") or []) if not x.get("below_base")]:
        try:
            im = Image.open(io.BytesIO(base64.b64decode(L["png"].split(",", 1)[1]))).convert("RGBA")
        except Exception:
            continue
        im.thumbnail((256, 256))
        a = np.asarray(im).reshape(-1, 4)
        px.append(a[a[:, 3] > 128, :3])
    if not px:
        return False
    p = np.concatenate(px).astype(np.float32)
    if len(p) < 10:
        return False
    mx, mn = p.max(axis=1), p.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return float(np.median(sat)) > 0.45 and float(np.median(mx)) > 110


def keep_unchanged(original, result, thresh=0.07):
    """The original's own pixels wherever the model didn't change the picture, the model's only where
    it did (Nov 2026: every edit redrew the whole picture at about 1 MP and lost the speaker mesh, the
    leather perforation and the brushed metal). Changes are judged on blurred copies, so a slight shift
    in tone or detail counts as unchanged; thin edge differences are dropped, real changes are kept
    whole with a soft border."""
    import numpy as np
    W, H = original.size
    w = min(512, W); h = max(8, round(w * H / W))
    O = np.asarray(original.convert("RGB").resize((w, h), Image.BOX)).astype(np.float32) / 255
    R = np.asarray(result.convert("RGB").resize((w, h), Image.BOX)).astype(np.float32) / 255
    d = np.abs(_blur(O, 2) - _blur(R, 2)).max(axis=2)
    ch = Image.fromarray(((d > thresh) * 255).astype("uint8"), "L")
    ch = ch.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))      # no thin edge slivers
    big = _big_areas(np.asarray(ch) > 127, 0.0015)
    m = Image.fromarray((big * 255).astype("uint8"), "L").filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    M = np.asarray(m.resize((W, H), Image.BILINEAR)).astype(np.float32)[..., None] / 255
    if M.mean() > 0.85:          # the whole picture changed (a restyle): the model's picture
        return result.convert("RGB").resize((W, H), Image.LANCZOS), float(M.mean())
    o = np.asarray(original.convert("RGB")).astype(np.float32)
    r = np.asarray(result.convert("RGB").resize((W, H), Image.LANCZOS)).astype(np.float32)
    return Image.fromarray((o * (1 - M) + r * M + 0.5).clip(0, 255).astype(np.uint8)), float(M.mean())


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
    """create / reference / upscale, from a file name or path (anything in Outputs\\Upscale is an upscale)."""
    if os.path.basename(os.path.dirname(name or "")).lower() == "upscale":
        return "upscale"
    low = os.path.basename(name or "").lower()
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
            self.engine = macos.MacEngine(app.settings, lambda: studio.models_dir(app.settings))
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

    def _detail(self, result, original, s, seed, tmp_dir, job_id, on_progress, lab=None):
        """Redraw the result at twice the size in overlapping parts (Qwen), so logos, text,
        stitching and edges come out crisp. Each part keeps the result's colours and shapes
        (its broad tones are put back after); `original`, when given, shows each part's spot
        in the original at high resolution."""
        import numpy as np
        from PIL import ImageFilter
        lab = lab or {}
        scale = float(lab.get("detail_scale", studio.DETAIL_SCALE))
        if original is not None:
            scale = min(scale, max(1.0, (original.size[0] * original.size[1] / (result.size[0] * result.size[1])) ** 0.5))
        if scale < 1.3:
            return result
        W, H = int(result.size[0] * scale) // 16 * 16, int(result.size[1] * scale) // 16 * 16
        big = result.resize((W, H), Image.LANCZOS)
        src = original.resize((W, H), Image.LANCZOS) if original is not None else None
        boxes = studio.detail_boxes(W, H, float(lab.get("detail_mp", studio.DETAIL_TILE_MP)))
        acc = np.zeros((H, W, 3), np.float64)
        wsum = np.zeros((H, W, 1), np.float64)
        text = studio.QE_DETAIL + (studio.QE_DETAIL_SRC if src is not None else "")
        sigma = max(2.0, scale * 1.5)
        for i, (x0, y0, x1, y1) in enumerate(boxes):
            if self._cancel.is_set():
                raise RuntimeError("Cancelled")
            on_progress(i / len(boxes))
            part = big.crop((x0, y0, x1, y1))
            pp = os.path.join(tmp_dir, "dt_%s_%d.png" % (job_id, i))
            part.save(pp, "PNG", compress_level=1)
            imgs = [self.engine.upload(pp)]
            if src is not None:
                sp = os.path.join(tmp_dir, "ds_%s_%d.png" % (job_id, i))
                src.crop((x0, y0, x1, y1)).save(sp, "PNG", compress_level=1)
                imgs.append(self.engine.upload(sp))
            mp = (x1 - x0) * (y1 - y0) / 1e6
            prompt = studio.qwenedit_prompt(s, imgs, text, seed + 101 * (i + 1), frame=0, megapixels=mp,
                                            steps=int(lab.get("detail_steps", studio.QE_STEPS)))
            try:
                out = Image.open(io.BytesIO(self.engine.run(prompt, None, self._cancel.is_set))).convert("RGB")
            except Exception:
                if self._cancel.is_set():
                    raise
                log.exception("detail pass part %d failed; keeping it as it was", i)
                out = part
            out = out.resize(part.size, Image.LANCZOS)
            # Only the fine detail is new: the broad tones stay the result's, so no part drifts.
            a = np.asarray(out, np.float64)
            a = a - np.asarray(out.filter(ImageFilter.GaussianBlur(sigma)), np.float64) \
                + np.asarray(part.filter(ImageFilter.GaussianBlur(sigma)), np.float64)
            tw, th = x1 - x0, y1 - y0
            fx = np.minimum(1, np.minimum(np.arange(tw) + 1, tw - np.arange(tw)) / max(1, tw * 0.09))
            fy = np.minimum(1, np.minimum(np.arange(th) + 1, th - np.arange(th)) / max(1, th * 0.09))
            if x0 == 0: fx[: tw // 2] = 1
            if x1 == W: fx[tw // 2:] = 1
            if y0 == 0: fy[: th // 2] = 1
            if y1 == H: fy[th // 2:] = 1
            wgt = (fy[:, None] * fx[None, :])[..., None]
            acc[y0:y1, x0:x1] += a * wgt
            wsum[y0:y1, x0:x1] += wgt
        on_progress(1.0)
        res = np.clip(acc / np.maximum(wsum, 1e-6), 0, 255).astype(np.uint8)
        return Image.fromarray(res)

    def _read(self, path, use, say, req=""):
        """The picture reader's words for this picture, or "" (not installed, or it failed)."""
        if (sys.platform == "darwin" and not self.settings.get("smart_read", True)) or not studio.reader_installed(self.settings):
            return ""
        try:
            # The same picture read again (another render of the same sketch) answers from memory: the reader
            # restarts for every run (it leaves the graphics card to the image model), about 20 s each time.
            try:
                import hashlib
                with open(path, "rb") as fh:          # by content: each run writes its own copy of the picture
                    key = (hashlib.md5(fh.read()).hexdigest(), use, req or "")
            except OSError:
                key = None
            memo = self.__dict__.setdefault("_read_memo", {})
            if key in memo:
                return memo[key]
            say("Reading your picture", None)
            from . import reader
            with self.__dict__.setdefault("_read_lock", threading.Lock()):   # one reader, two callers (medium + a run)
                if key in memo:
                    return memo[key]
                if not hasattr(self, "_reader"):
                    self._reader = reader.Reader(lambda: studio.models_dir(self.settings))
                out = self._reader.describe(path, use, req)
            if key and out:
                if len(memo) > 200:
                    memo.clear()
                memo[key] = out
            return out
        except Exception as e:                       # never block a run over this
            log.warning("picture reader: %s", e)
            return ""

    def medium(self, path):
        """"render" or "sketch" for a picture just opened (the picture reader's view, the same read a run
        uses, so the run answers from memory), or "" when it can't tell or a run is busy."""
        if self._job and self._job.is_alive():
            return ""
        try:
            rp = self.real_path(path)
            return (studio.parse_medium(self._read(rp, "view", lambda *a: None) or "")
                    or studio.guess_medium(rp))           # no reader (a Mac): from the pixels
        except Exception as e:
            log.warning("medium: %s", e)
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
        if path and str(path).startswith("data:image"):      # the picture as shown (layers flattened)
            import hashlib
            raw = base64.b64decode(path.split(",", 1)[-1])
            tmp_dir = os.path.join(studio.home(self.settings), ".work")
            os.makedirs(tmp_dir, exist_ok=True)
            out = os.path.join(tmp_dir, "shown_%s.png" % hashlib.sha1(raw).hexdigest()[:16])
            if not os.path.isfile(out):
                Image.open(io.BytesIO(raw)).convert("RGB").save(out, "PNG")
            return out
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
        if f.get("app", "photoshop") == "photoshop" and not self.settings.get("ps_panel"):
            try:
                self.settings.set("ps_panel", True)        # the plugin is there: it sent a picture
            except Exception:
                pass
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
        st["ps_panel"] = bool(self.settings.get("ps_panel"))
        st["sizes"] = recommended_sizes()
        t = dict(self.settings.get("studio_times") or {})
        if sys.platform != "darwin" and studio.use_qwenedit(self.settings):
            t = {"per": t.get("per_qe"), "load": t.get("load_qe")}     # the chosen model's own times
        st["times"] = dict(t, warm=bool(getattr(self, "_warm", False)))
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

    def get_mac_model(self, key):
        """Mac: download the other render model (Klein 4B or Mage-Flow) to compare them."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()

        def run():
            from . import macos
            prog = lambda label, f: self.emit("studio-setup", {"state": "running", "label": label, "fraction": f})
            try:
                md = studio.models_dir(self.settings)
                if key == "mage":
                    macos.install_mlxserve(studio.download, prog, self._cancel.is_set)
                    macos.install_mage(md, studio.download, prog, self._cancel.is_set)
                else:
                    macos.install(md, studio.download, prog, self._cancel.is_set, want_generate=True, t="light")
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("mac model download")
                self.emit("studio-setup", {"state": "error", "message": str(exc)[-300:]})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
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
                                  want_generate=macos.can_generate(), t=macos.tier(self.settings))
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
                    if f["part"] in ("qwenedit", "metaview", "qwen21"):
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

    def get_qwen21(self):
        """Download Qwen-Image 2.1 (about 22 GB with its Consistency LoRA and sketch ControlNet) and
        switch Create to it (3D views keep Qwen Image Edit 2511)."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()

        def run():
            prog = lambda label, f: self.emit("studio-setup", {"state": "running", "label": label, "fraction": f})
            try:
                for f in studio.FILES:
                    if f["part"] == "qwen21" and not studio.find(f["key"], self.settings):
                        dst = os.path.join(studio.models_dir(self.settings), f["folder"], f["names"][0])
                        studio.download(f["url"], dst, prog, f["label"], self._cancel.is_set)
                studio.write_model_paths(self.settings)
                try:
                    self.engine.stop()               # it reads the new model folder (model_patches) on its next start
                except Exception:
                    pass
                self.settings.set("studio_engine", "qwen21")
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("Qwen-Image 2.1 download failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc).lower() == "cancelled" else "error",
                                           "message": str(exc)})
        self._setup = threading.Thread(target=run, daemon=True)
        self._setup.start()
        return True

    def get_metaview(self):
        """Download MetaView (about 39 GB: its model, two depth models and its nodes)."""
        if self._setup and self._setup.is_alive():
            return False
        self._cancel.clear()

        def run():
            prog = lambda label, f: self.emit("studio-setup", {"state": "running", "label": label, "fraction": f})
            try:
                for f in studio.FILES:
                    if f["part"] == "metaview" and not studio.find(f["key"], self.settings):
                        dst = os.path.join(studio.models_dir(self.settings), f["folder"], f["names"][0])
                        studio.download(f["url"], dst, prog, f["label"], self._cancel.is_set)
                if not os.path.isdir(studio.metaview_nodes_dir()):
                    import shutil, subprocess, zipfile
                    prog("MetaView nodes", None)
                    z = os.path.join(studio.engine_dir(), "metaview_nodes.zip")
                    studio.download(studio.MV_NODES, z, prog, "MetaView nodes", self._cancel.is_set)
                    target = studio.metaview_nodes_dir()
                    # A short folder, only what ComfyUI loads, and long-path support: Windows
                    # stops at 260 characters (the pack's .github templates went past it).
                    tmp = os.path.join(studio.engine_dir(), "mvn")
                    lp = (lambda q: "\\\\?\\" + os.path.abspath(q)) if sys.platform == "win32" else (lambda q: q)
                    for old in (tmp, target + ".tmp"):          # also what an earlier try left
                        shutil.rmtree(lp(old), ignore_errors=True)
                    with zipfile.ZipFile(z) as zz:
                        for m in zz.infolist():
                            parts = m.filename.split("/")
                            if len(parts) > 1 and parts[1] in (".github", "docs", "tests", "workflows"):
                                continue
                            zz.extract(m, lp(tmp))
                    inner = [os.path.join(tmp, d) for d in os.listdir(tmp)]
                    py = os.path.join(studio.portable_dir(), "python_embeded", "python.exe")
                    prog("Installing what MetaView needs", None)
                    with open(os.path.join(studio.engine_dir(), "metaview-pip.log"), "ab") as logf:
                        r = subprocess.run([py, "-s", "-m", "pip", "install", "--no-warn-script-location"] + studio.MV_PACKAGES,
                                           cwd=studio.portable_dir(), stdout=logf, stderr=subprocess.STDOUT,
                                           creationflags=0x08000000 if sys.platform == "win32" else 0)
                    if r.returncode != 0:
                        raise RuntimeError("installing MetaView's packages failed (metaview-pip.log)")
                    os.replace(inner[0] if len(inner) == 1 and os.path.isdir(inner[0]) else tmp, target)
                    shutil.rmtree(tmp, ignore_errors=True)
                    os.remove(z)
                studio.write_model_paths(self.settings)
                try:
                    self.engine.stop()               # it loads the new nodes on its next start
                except Exception:
                    pass
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("MetaView download failed")
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

    def get_all(self):
        """Everything Studio uses, one after another (a new PC left to download for hours):
        the engine and image models, Qwen Image Edit, both picture readers, the prompt
        helper, Select and the magic eraser. A failed part doesn't stop the rest."""
        if (self._setup and self._setup.is_alive()) or (getattr(self, "_all", None) and self._all.is_alive()):
            return False
        self._cancel.clear()

        def run():
            steps = [self.setup, self.get_qwenedit, self.get_reader, self.get_reader_xl, self.get_helper, self.get_select]
            for step in steps:
                if self._cancel.is_set():
                    return
                if step():
                    self._setup.join()
            if self._cancel.is_set():
                return
            from . import eraser
            md = studio.models_dir(self.settings)
            if not eraser.installed(md):
                try:
                    studio.download(eraser.URL, eraser.path(md), lambda label, f: self.emit(
                        "studio-setup", {"state": "running", "label": label, "fraction": f}), "Magic eraser", self._cancel.is_set)
                except Exception:
                    log.exception("magic eraser download failed")
            self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
        self._all = threading.Thread(target=run, daemon=True)
        self._all.start()
        return True

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
        t_job = time.time()
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
            painted_mask = None
            if job.get("layers"):
                plain = original
                original = flatten_layers(original, job["layers"])   # painted layers on top, as seen
                # Strokes painted over a picture, with words and no selection (Nov 2026: "the door handle in
                # the green highlighted area"): the strokes mark WHERE to change, like a selection, so the
                # rest of the picture stays exactly as it was. Words about the marking ("highlighted",
                # "marked", "remove green") make it a marker only: the model gets the picture without it.
                if not job.get("mask") and (job.get("text") or "").strip() and not job.get("view") and not job.get("instant"):
                    pm = painted_area(job["layers"], original.size)
                    if pm is not None:
                        painted_mask = pm
                        job = dict(job, mask="painted")
                        if MARK_WORDS.search(job.get("text") or "") or marker_colour(job["layers"]):
                            original = plain
                            job = dict(job, text=MARK_WORDS.sub(" ", job.get("text") or ""))
            # Reference images (Create): each gives one thing (camera, materials, style, light).
            refs = [r for r in (job.get("refs") or []) if r and r.get("path")][:3] if job.get("mode", "create") == "create" else []
            uses = [r.get("use") or "describe" for r in refs]
            cam_i = uses.index("camera") + 1 if "camera" in uses else 0
            sent = list(range(len(refs)))
            mask = box = None
            if job.get("mask") and not cam_i:      # a new camera view changes the whole picture
                mask = painted_mask if job.get("mask") == "painted" else decode_mask(job["mask"], original.size)
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
            elif refs and sys.platform != "darwin" and studio.use_qwenedit(s):
                text, sent = studio.qwen_refs(job.get("text"), refs, job.get("locks"),
                                              (job.get("preset") or "") == "sketch")
                user_text = job.get("text") or ""
                cam_i = (sent.index(cam_i - 1) + 1) if cam_i and (cam_i - 1) in sent else 0
                ref_images = [ref_images[i] for i in sent]
                job = dict(job, qwen_refs=True)
            elif refs:
                text, sent = studio.ref_plan(job.get("text"), refs, job.get("locks"), (job.get("preset") or "") == "sketch",
                                             float(job.get("keep") if job.get("keep") is not None else 0.8))
                user_text = job.get("text") or ""
                # Only references that go in as pictures; the frame is the design's,
                # or a camera reference's when its camera couldn't be put into words.
                cam_i = (sent.index(cam_i - 1) + 1) if cam_i and (cam_i - 1) in sent else 0
                ref_images = [ref_images[i] for i in sent]
            elif job.get("view"):
                # 3D: which side we see, then the view to show, in words.
                v = job["view"]
                kind, side, _h = studio.parse_view(self._read(work_path, "view", say) or "")
                design = self._read(work_path, "design", say) or ""
                words, target = studio.view_words(kind, side, v.get("yaw", 0), v.get("pitch", 0), float(v.get("dist", 0)),
                                                   v.get("lens", "normal"), v.get("target"), design, v.get("cabin"))
                extra = (job.get("text") or "").strip()
                # Outside, with the Camera angles LoRA: its own wording (a cabin isn't what it learned).
                ang = kind != "interior" and studio.angles_ready(s)
                if ang:
                    words = studio.angles_text(target, v.get("pitch", 0), float(v.get("dist", 0)))
                job = dict(job, text=words + (" " + extra if extra else ""), said=extra, angles=0.9 if ang else 0.0,
                           locks=dict(job.get("locks") or {}, camera=False), view=dict(v, kind=kind, seen=side, target=target))
                text = job["text"]
            elif job.get("instant"):
                # Qwen-Image 2.1 sees the picture itself: the scene description only cost a second read
                # (about 20 s for every new picture, Nov 2026); the view read says inside or outside.
                scene = "" if studio.use_q21(s) else self._read(work_path, "scene", say)
                # inside or outside: the reliable reading (the scene words made cars look like cabins)
                kind, vside, vh = studio.parse_view(self._read(work_path, "view", say) or "") if studio.use_qwenedit(s) else ("", "", "")
                cam_words = studio.instant_camera(vside, vh) if kind and kind != "interior" else ""
                text = studio.instant_text(job.get("text") or "", scene)
            else:
                # Words: the picture reader spells out everything the change means in this picture
                # (snow on the ground and on the truck, winter clothes…), the way a person would.
                # Your words go as you wrote them (Nov 2026): the picture reader's "fuller" rewrite of them
                # ("change material to forged carbon fiber" became "replace all tan leather ... keep the silver
                # base") fought the selection and the model did something else.
                text = studio.build_text(job.get("preset") or "", job.get("text"))
                # Smart reading (Nov 2026): the picture reader says what the picture is and what the words ask
                # for (render a sketch, relight, edit a part, new scene, new view, restyle); the prompt is built
                # from that instead of matching words.
                im_ = ""      # what the picture is comes from the view read below (sketch or render)
                # No picture reader (a Mac): a photo or CGI opened as a sketch is changed as what it is.
                if (sys.platform == "darwin" and not im_ and (job.get("preset") or "") == "sketch" and not job.get("instant")
                        and studio.guess_medium(work_path) == "render"):
                    job = dict(job, preset="render")
                    text = studio.build_text("render", job.get("text"))
                if studio.use_qwenedit(s) and not refs:
                    va = self._read(work_path, "view", say) or ""
                    kind = studio.parse_view(va)[0]                    # interior or exterior wording
                    # A finished render opened as a sketch (Studio guessed from the file name, e.g. a
                    # FLUX output): the reader sees it is a render, so it is changed as one. As a sketch it
                    # was re-drawn from scratch ("Turn this sketch into a render") and lost its detail (Nov 2026).
                    if ((job.get("preset") or "") == "sketch" and not job.get("instant")
                            and studio.parse_medium(va) == "render"):
                        job = dict(job, preset="render")
                        text = studio.build_text("render", job.get("text"))
                    cam_words = studio.instant_camera("", "")         # words never move the camera unless asked
                    # Scenarios and lighting are easiest on a resolved CGI design (the person, Nov 2026): a
                    # picture that is already CGI is changed directly (2511); a sketch first becomes CGI (the
                    # Instant render), then the words change that.
                    if (studio.use_q21(s) and studio.qwenedit_ready(s) and (job.get("preset") or "") == "sketch"
                            and not job.get("from_result") and mask is None and (job.get("said") or job.get("text") or "").strip()):
                        if studio.parse_medium(va) == "render":
                            cgi_direct = True
                        else:
                            chain = True
                if job.get("locks"):
                    text = studio.with_locks(text, job["locks"], (job.get("preset") or "") == "sketch",
                                             words=job.get("said") or job.get("text") or "", task=job.get("task") or "")
            # Lab (testing only): %APPDATA%\VistiqStudio\lab.json tries other wordings
            # and image orders for references without a new build.
            user_text = locals().get("user_text", job.get("said") or job.get("text") or "")
            lab = _lab() if refs or studio.use_qwenedit(s) else {}
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
            if studio.use_qwenedit(s) and mode == "create" and job.get("view"):
                text = job.get("text") or ""      # no QE_CLEAN: it pushed sketches to a photo and a new design
                if lab.get("text"):               # lab: try other camera wordings
                    text = lab["text"].replace("{auto}", text)
            elif studio.use_qwenedit(s) and mode == "create" and not job.get("qwen_refs"):
                # Qwen Image Edit reads short, direct instructions best (the long
                # FLUX wording made it muddy and stopped camera moves).
                text = studio.qwen_text(job.get("text") or "", instant=bool(job.get("instant")),
                                        scene=locals().get("scene") or "", locks=job.get("locks"), kind=locals().get("kind") or "", camera=locals().get("cam_words") or "",
                                        ref_head=(text.split("\n\n")[0] if refs else ""),
                                        sketch=(job.get("preset") or "") == "sketch", said=job.get("said"),
                                        task=job.get("task") or "")
                if lab.get("text"):               # lab: try other wordings ({auto} = Studio's own)
                    text = lab["text"].replace("{auto}", text).replace("{user}", user_text)
            stem = os.path.splitext(os.path.basename(job.get("name") or src_path))[0]
            if stem.lower().startswith("vistiq_"):
                stem = stem[7:]
            stem = _strip_tags(re.sub(r"^\d{4,}_", "", stem))
            # Every run gets the next number first, so the files sort in the order they were made.
            seq = self._next_seq()
            stem = "%s_%s" % (studio.newest_first(seq), stem)       # newest first when sorted by name
            model_tag = studio.model_tag(s, job)                    # e.g. _v1_Mage, _v1_Klein4B
            tag = ("refine" if job.get("refine_of") else
                   ("paint" if mask is not None else ("create" if mode == "create" else (job.get("preset") or "reference"))))
            out_dir = studio.create_dir(s)
            results = []
            # How long this should take, from earlier runs on this computer:
            # seconds per variation, plus the model loading of a session's first run.
            times = dict(s.get("studio_times") or {})
            # Each image model learns its own time (Qwen at 3.2 MP takes far longer than FLUX).
            tk = ("_q21" if studio.use_q21(s) and not job.get("view") else "_qe") if (sys.platform != "darwin" and studio.use_qwenedit(s)) else ""
            per, load = times.get("per" + tk), times.get("load" + tk)
            first = not getattr(self, "_warm", False)
            if per:
                est = per * n + ((load or 0) if first else 0)
                self.emit("studio-job", {"id": job_id, "state": "running", "stage": "Starting", "fraction": 0,
                                         "estimate": round(est)})
            # The detail pass: on by default with Qwen; the original's crisp detail joins in when
            # the view and the design are kept and it isn't a sketch or a style change.
            locks_ = job.get("locks") or {}
            detail_on = (sys.platform != "darwin" and studio.use_qwenedit(s) and mode == "create"
                         and bool(lab.get("detail", False)))   # testing only (lab.json)
            detail_src = (locks_.get("camera", True) and locks_.get("design", True) and not cam_i
                          and (job.get("preset") or "") != "sketch" and not job.get("instant")
                          and "style" not in uses)
            # The picture reader (llama.cpp) keeps several GB on the graphics card; with it there the image
            # model spills to system memory and runs about 3x slower (12 s a step instead of 4, Nov 2026).
            if hasattr(self, "_reader"):
                try:
                    self._reader.stop()
                except Exception:
                    pass
            t_start = time.time()
            q21_pre = {}
            for v in range(n):
                if self._cancel.is_set():
                    raise RuntimeError("Cancelled")
                t_var = time.time()
                label = "Variation %d of %d" % (v + 1, n) if n > 1 else "Creating"
                say(label, v / n)
                prog = lambda f, v=v: say(label, (v + f) / n)
                reframe = job.get("reframe") or lab.get("reframe")
                if sys.platform != "darwin" and reframe and studio.metaview_ready(s):
                    # MetaView (testing): the same scene from a camera turned by yaw / pitch degrees.
                    prompt = studio.metaview_prompt(s, image, reframe.get("yaw", 0), reframe.get("pitch", 0), seed + v,
                                                    int(reframe.get("w", 0)), int(reframe.get("h", 0)), int(reframe.get("steps", 8)))
                elif (sys.platform != "darwin" and studio.use_q21(s) and mode == "create" and not job.get("view")
                      and not cam_i and not (studio.qwenedit_ready(s) and (job.get("locks") or {}).get("camera") is False)
                      and not (studio.qwenedit_ready(s) and (job.get("from_result") or (job.get("preset") or "") != "sketch"
                                                               or locals().get("cgi_direct"))
                               and not job.get("instant"))):
                    # (a CGI render with words, e.g. "night", goes to 2511 below: it keeps the render's CGI look)
                    # Qwen-Image 2.1 (Nov 2026): Create and Instant render. The Consistency LoRA keeps the frame;
                    # for an Instant render the ControlNet also holds the sketch's lines.
                    imgs = [image] + list(ref_images or ([ref_image] if ref_image else []))
                    free = (job.get("locks") or {}).get("camera") is False
                    ctrl = float(lab.get("q21_ctrl", studio.Q21_CTRL if job.get("instant") else 0.0))
                    q21_used = True
                    t21 = text
                    # A sketch (any picture that isn't a Studio render) becomes a photo also when words are given:
                    # without this "night" on a sketch kept the pencil hatching (tested Nov 2026).
                    photo21 = bool(job.get("instant") or ((job.get("preset") or "") == "sketch" and not refs and mask is None))
                    if photo21 and not lab.get("text"):
                        inside = (locals().get("kind") or "") == "interior"
                        base21 = text
                        if locals().get("chain"):          # the plain Instant render first; the words come after
                            base21 = studio.qwen_text("", instant=True, kind=locals().get("kind") or "",
                                                      camera=locals().get("cam_words") or "")
                        t21 = studio.Q21_PHOTO.format(
                            what="car interior" if inside else "car",
                            surf=("real leather, fabric, soft-touch trims and satin metal" if inside else
                                  "smooth glossy painted bodywork, real rubber tyres and machined wheels")) + base21
                    mk21 = lambda vv, t21=t21, imgs=imgs, ctrl=ctrl, free=free: studio.q21_prompt(s, imgs, studio.juice_pick(t21, int(job.get("look", seed % 60)) + vv), seed + vv,
                                               megapixels=float(lab.get("q21_mp", min(
                                                   studio.Q21_MP_SHAPE if (photo21 and studio.qwenedit_ready(s)) else studio.Q21_MP, max(
                                                   1.0, work.size[0] * work.size[1] / 1e6)))),
                                               steps=lab.get("q21_steps"), fast=bool(lab.get("q21_fast", True)),
                                               consistency=0.0 if free else float(lab.get("q21_cons", studio.Q21_CONS)),
                                               control=0.0 if free else ctrl,
                                               control_end=float(lab.get("q21_ctrl_end", studio.Q21_CTRL_END)),
                                               control_mode=lab.get("q21_ctrl_mode", "canny"))
                    if photo21 and studio.qwenedit_ready(s) and lab.get("q21_finish", True):
                        # Every shape first, then every CGI finish: the two models swap once, not per variation.
                        if v not in q21_pre:
                            # One model at a time on the graphics card: with 2511 still there the shape took 41 s
                            # instead of 20, and the finish after it 80 s instead of 25 (15 s a step, Nov 2026).
                            self.engine.free(keep_ram=True)
                            for vv in range(v, n):
                                if self._cancel.is_set():
                                    raise RuntimeError("Cancelled")
                                say("Shape · variation %d of %d" % (vv + 1, n) if n > 1 else "Shape", (vv * 0.5) / n)
                                q21_pre[vv] = self.engine.run(studio.cap_megapixels(mk21(vv), job.get("res")), None, self._cancel.is_set)
                                if _still_sketch(work, q21_pre[vv]):
                                    # A dense pencil sketch can hold the Consistency LoRA to its strokes: the shape
                                    # came back as the sketch (Nov 2026). Again, held less, with another seed.
                                    say("Shape · trying again", (vv * 0.5) / n)
                                    p2 = mk21(vv)
                                    for node in p2.values():
                                        if node.get("class_type") == "LoraLoaderModelOnly" and "consistency" in str(node["inputs"].get("lora_name", "")):
                                            node["inputs"]["strength_model"] = 0.3
                                        if node.get("class_type") == "KSampler":
                                            node["inputs"]["seed"] = int(node["inputs"]["seed"]) + 7919
                                    q21_pre[vv] = self.engine.run(studio.cap_megapixels(p2, job.get("res")), None, self._cancel.is_set)
                        prompt = None
                    else:
                        prompt = mk21(v)
                elif sys.platform != "darwin" and studio.use_qwenedit(s):
                    imgs = [image] + list(ref_images or ([ref_image] if ref_image else []))
                    # Picture 2 says which part to change. Worded as "this part", not "an area to put
                    # something in": a new material came back as a new black block in the map's shape, and
                    # without the map nothing changed (the model couldn't tell which part, Nov 2026).
                    if mask is not None and len(imgs) == 1 and not lab.get("no_mask_hint"):
                        if v == 0 or not locals().get("mask_img"):
                            mpath = os.path.join(tmp_dir, "mask_%s.png" % job_id)
                            mask.crop(box).convert("L").point(lambda a: 255 if a > 40 else 0).convert("RGB").save(mpath, "PNG")
                            mask_img = self.engine.upload(mpath)
                        imgs = imgs + [mask_img]
                        if "Picture 2" not in text:
                            w_ = job.get("said") or job.get("text") or ""
                            if ADD_WORDS.search(w_):
                                head = ("Picture 2 is a map of picture 1: white marks the selected area. Make the change only "
                                        "inside the white area; anything added sits completely inside it, whole and not cut off, "
                                        "in natural perspective and light. Do not draw the map. ")
                            else:
                                # "keeps its exact shape ... everything outside stays" made the model change nothing
                                # at all (Nov 2026): the words, aimed at the marked part, and nothing else.
                                head = "In picture 1, the part marked white in picture 2: "
                            text = head + text.replace(" Keep everything else exactly as it is.", "") + " Do not draw picture 2."
                            # "inspired by a carabiner" came back as a literal carabiner bolted on (Nov 2026): a new
                            # design in a selection is a refined part that belongs to the design around it.
                            if DESIGN_WORDS.search(w_) and not ADD_WORDS.search(w_):
                                # "inspired from a carabiner" bolted a carabiner on next to the old handle: the marked
                                # part is replaced by a new design of the same part, in the same place and size.
                                text = ("Redesign the part of picture 1 that is marked white in picture 2: remove the old "
                                        "part there completely and put a new design of the same part in its place, the "
                                        "same size and position, fitted into the panel. " + text.replace(head, "") +
                                        " The new part is a refined, production-ready automotive design, not a literal "
                                        "copy of what inspired it; it matches the materials, quality and design language "
                                        "of the parts around it.")
                    fr = cam_i if refs else (1 if mode == "reference" and (job.get("preset") or "camera") == "camera" else 0)
                    # Photo realism on by default for Instant render once it's here (tested Nov 2026: photographic,
                    # follows the sketch)
                    real = float(lab.get("realism", 0.8)) if studio.find("qie_real", s) else 0.0
                    if real and job.get("instant"):      # Anything2Real's own wording first
                        text = "Change picture 1 to a realistic photograph. " + text
                    prompt = studio.qwenedit_prompt(s, imgs, studio.juice_pick(text, int(job.get("look", seed % 60)) + v), seed + v, frame=fr,
                                                    realism=real if job.get("instant") else 0.0,
                                                    # a selected part is drawn zoomed in (up to 2x), so the new part
                                                    # comes out as crisp as the picture around it (Nov 2026)
                                                    megapixels=float(lab.get("qe_mp", min(studio.QE_MP, max(
                                                        studio.QE_MP_MIN, work.size[0] * work.size[1] / 1e6 * (4 if mask is not None else 1))))),
                                                    steps=int(lab.get("qe_steps", studio.QE_STEPS)),
                                                    # the full-size picture holds every part in place: right when
                                                    # the camera stays, but it stops a new view (3D, Camera unlocked,
                                                    # a camera reference), so those keep the model's own small one
                                                    angles=float(lab.get("angles", job.get("angles") or 0.0)),
                                                    ref_latent=bool(lab.get("qe_reflat", not job.get("view") and not cam_i and
                                                                            (job.get("locks") or {}).get("camera") is not False)))
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
                if sys.platform != "darwin" and prompt is not None:
                    _add_lora(prompt, job.get("lora"), job.get("lora_strength", 0.8))
                def preview(pic, v=v):
                    self.emit("studio-preview", {"id": job_id, "index": v,
                                                 "preview": "data:image/jpeg;base64," + base64.b64encode(pic).decode()})
                import inspect
                if prompt is None:
                    data = q21_pre.pop(v)          # made above, with the other variations
                elif "on_preview" in inspect.signature(self.engine.run).parameters:
                    data = self.engine.run(studio.cap_megapixels(prompt, job.get("res")), prog, self._cancel.is_set, on_preview=preview)
                else:                      # an engine without previews (the Mac one)
                    data = self.engine.run(studio.cap_megapixels(prompt, job.get("res")), prog, self._cancel.is_set)
                if (locals().get("q21_used") and locals().get("photo21") and studio.qwenedit_ready(s)
                        and lab.get("q21_finish", True)):
                    # CGI finish (Nov 2026): Qwen-Image 2.1 gets the sketch's shape exactly but renders soft, like
                    # a clay model; Qwen Image Edit 2511 with Photo realism turns that into crisp press-photo CGI
                    # and keeps the shape (the picture it gets is already right).
                    say("CGI finish · " + label.lower(), (v + 0.6) / n)
                    fpath = os.path.join(tmp_dir, "q21_%s_%d.png" % (job_id, v))
                    with open(fpath, "wb") as fh:
                        fh.write(data)
                    fimg = self.engine.upload(fpath)
                    if not locals().get("freed21"):
                        self.engine.free(keep_ram=True)  # the shapes are made: let 2511 have the card
                        freed21 = True
                    real2 = float(lab.get("realism", 0.8)) if studio.find("qie_real", s) else 0.0
                    # Materials only: a new scene here made 2511 turn the car (tested Nov 2026), so the setting,
                    # light and camera of the 2.1 picture stay.
                    ftext = (studio.QE_FINISH + " " + studio.QE_FINISH_KEEP + " " + (locals().get("cam_words") or "")).strip()
                    # Words about the object (materials, colours, parts) go into this pass: one model run less per
                    # variation (Nov 2026: a sketch with words took three runs). A new scene or light still gets
                    # its own pass after it (here it made 2511 turn the car).
                    w_chain = job.get("said") or job.get("text") or ""
                    merge = bool(locals().get("chain") and w_chain.strip() and not studio.PLACE_WORDS.search(w_chain)
                                 and not studio.NIGHT_WORDS.search(w_chain) and not studio.SUN_WORDS.search(w_chain)
                                 and not studio.SOFT_WORDS.search(w_chain) and lab.get("merge_words", True))
                    if merge:
                        ftext = studio.QE_FINISH + " " + " ".join(studio.clean_prompt(w_chain).split()).rstrip(".") + ". " + \
                            studio.QE_FINISH_KEEP + " " + (locals().get("cam_words") or "")
                        ftext = ftext.strip()
                    if (locals().get("kind") or "") == "interior" and not studio.night_clause(job.get("said") or job.get("text") or ""):
                        ftext += " " + studio.QE_INT_BRIGHT
                    if real2:
                        ftext = "Change picture 1 to a realistic photograph. " + ftext
                    fp = studio.qwenedit_prompt(s, [fimg], ftext,
                                                seed + v, realism=real2,
                                                megapixels=float(lab.get("qe_mp", min(studio.QE_MP, max(
                                                    studio.QE_MP_MIN, work.size[0] * work.size[1] / 1e6)))),
                                                steps=int(lab.get("qe_steps", studio.QE_STEPS)), ref_latent=True)
                    finished = self.engine.run(studio.cap_megapixels(fp, job.get("res")), None, self._cancel.is_set)
                    if not _is_blank(finished):
                        data = finished
                    if locals().get("chain") and not merge:
                        # The words on the CGI it just made (lighting, scene, materials), with 2511.
                        say("Your change · " + label.lower(), (v + 0.85) / n)
                        cpath = os.path.join(tmp_dir, "cgi_%s_%d.png" % (job_id, v))
                        with open(cpath, "wb") as fh:
                            fh.write(data)
                        cimg = self.engine.upload(cpath)
                        words = job.get("said") or job.get("text") or ""
                        ctext = studio.qwen_text(words, locks={"design": True, "camera": True},
                                                 kind=locals().get("kind") or "", said=job.get("said"),
                                                 camera=studio.instant_camera("", ""))
                        cp = studio.qwenedit_prompt(s, [cimg], ctext, seed + v,
                                                    megapixels=float(lab.get("qe_mp", min(studio.QE_MP, max(
                                                        studio.QE_MP_MIN, work.size[0] * work.size[1] / 1e6)))),
                                                    steps=int(lab.get("qe_steps", studio.QE_STEPS)), ref_latent=True)
                        changed = self.engine.run(studio.cap_megapixels(cp, job.get("res")), None, self._cancel.is_set)
                        if not _is_blank(changed):
                            data = changed
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
                if (sys.platform != "darwin" and mode == "create" and not job.get("instant") and not job.get("view")
                        and not refs and (job.get("locks") or {}).get("materials") and (job.get("text") or "").strip()
                        and lab.get("keep_cmf", True)
                        # an instruction of its own (remove lines, add a part, change a colour) is never undone by
                        # copying the original back (Nov 2026)
                        and not studio.instructs(job.get("said") or job.get("text") or "")
                        and not studio.material_edit(job.get("said") or job.get("text") or "")
                        and job.get("task") not in ("edit", "style", "view")):
                    try:
                        model_pic = result
                        night = bool(studio.night_clause(job.get("said") or job.get("text") or ""))
                        sun = bool(studio.sun_clause(job.get("said") or job.get("text") or ""))
                        # the sun look's cool sky fill in the shadows is part of it: held a little less there
                        result = keep_cmf(work, result, strength=0.6 if (night or sun) else 0.75)
                        if (job.get("locks") or {}).get("camera", True) and lab.get("keep_texture", True) and aligned(work, result):
                            lw = job.get("said") or job.get("text") or ""
                            # only for a relight: added objects (a phone, a bag) are meant to be new
                            if (lab.get("no_new_parts", True) and mask is None
                                    and (night or sun or studio.SOFT_WORDS.search(lw))):
                                result = no_new_parts(work, result)
                            result = keep_texture(work, result, strength=0.6 if night else 1.0)
                        if lab.get("same_place", True):
                            result = _blend_kept(model_pic, result, same_place(work, model_pic))
                    except Exception:
                        log.exception("keeping the CMF failed; the picture as the model made it")
                if detail_on and mask is None:
                    result = self._detail(result, work if detail_src else None, s, seed + v, tmp_dir, job_id,
                                          lambda f, v=v: say("Adding detail · " + label.lower(), (v + 0.6 + 0.4 * f) / n),
                                          lab)
                if not (mode == "reference" and job.get("preset") == "style") and "style" not in uses \
                        and s.get("studio_finish", True):
                    result = finish(result)        # a style reference keeps its own look
                # What the model didn't change keeps the original's own pixels (full detail, no softening).
                if (mode == "create" and not job.get("view") and not job.get("instant") and not cam_i
                        and (job.get("preset") or "") != "sketch" and (job.get("locks") or {}).get("camera", True)
                        and lab.get("keep_unchanged", True)):
                    try:
                        if aligned(work, result, need=0.45):
                            result, share = keep_unchanged(work, result)
                            log.info("create %s: kept the original's pixels on %d%% of the picture", job_id, round(100 * (1 - share)))
                    except Exception:
                        log.exception("keeping the unchanged pixels failed; the picture as the model made it")
                if mask is not None:
                    blend = int(float(job.get("blend", 0.35)) * 0.06 * max(box[2] - box[0], box[3] - box[1])) + 2
                    result = composite(original, result, mask, box, blend,
                                       grow=bool(ADD_WORDS.search(job.get("said") or job.get("text") or "")))
                buf = io.BytesIO()
                result.save(buf, "PNG")
                path, w, h = imaging.save(buf.getvalue(), stem + ".png", out_dir, "PNG",
                                          "%s_v%d_%s" % (tag, v + 1, model_tag), limit=16384)
                meta = {"mode": mode, "preset": job.get("preset"), "view": job.get("view"),
                        "text": job.get("said") if job.get("view") else (job.get("said") or job.get("text") or ""),
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
                log.info("create %s: variation %d of %d in %.1f s (%s, %s, %dx%d, read %.1f s before)", job_id, v + 1, n, took,
                         tag, "sketch" if (job.get("preset") or "") == "sketch" else (job.get("preset") or "-"), w, h,
                         t_start - t_job)
                if v == 0 and first:
                    # The first variation includes loading the models: learn both parts.
                    times["load" + tk] = round(max(0.0, took - (per or took * 0.5)), 1) if per else round(took * 0.5, 1)
                    took = took - times["load" + tk]
                if job.get("res") not in studio.RES_CAP:   # the estimate is for full size; Create scales it per size
                    times["per" + tk] = round(took if not times.get("per" + tk) else times["per" + tk] * 0.6 + took * 0.4, 1)
                try:
                    s.set("studio_times", times)
                except Exception:
                    log.exception("couldn't save creation times")
                self._warm = True
                self.emit("studio-result", {"id": job_id, "result": item, "index": v, "of": n})
            log.info("create %s: done in %.1f s", job_id, time.time() - t_job)
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

    def snap(self, path, shape_url, out_w, out_h):
        """A hand-drawn selection (PNG data URL) tightened to the object it covers (Nov 2026: a rough
        lasso changed the sofa and cut the trousers in half). None: keep the shape as drawn."""
        from . import picker
        if not studio.select_installed(self.settings):
            return None
        path = self.real_path(path)
        raw = base64.b64decode(shape_url.split(",", 1)[-1])
        im = Image.open(io.BytesIO(raw))
        shape = (im.getchannel("A") if im.mode in ("RGBA", "LA") else im.convert("L")).resize((int(out_w), int(out_h)))
        pts = picker.snap_points(shape)
        if not any(p[2] for p in pts):
            return None
        if not hasattr(self, "_picker"):
            self._picker = picker.Selector()
        found = self._picker.select(studio.models_dir(self.settings), path, pts, (int(out_w), int(out_h)))
        merged = picker.snap_merge(shape, found)
        if merged is shape:
            return None
        return "data:image/png;base64," + base64.b64encode(picker.to_png(merged)).decode("ascii")

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
            out.append({"path": p, "name": os.path.basename(p), "kind": meta.get("kind") or kind_of(p),
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
            if s2 != stem or kind_of(p) not in ("create", "reference"):
                continue
            try:
                w, h = imaging.size_of(p)
            except Exception:
                continue
            meta = _read_meta(p)
            out.append({"path": p, "name": nm, "w": w, "h": h, "thumb": self.thumb(p, mtime), "made": mtime * 1000,
                        "meta": {"text": meta.get("text", ""), "preset": meta.get("preset", ""), "source": meta.get("source", ""),
                                 "instant": bool(meta.get("instant")), "view": meta.get("view"),
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
        else:
            self.engine.free()        # stays ready, but lets go of the models (tens of GB of RAM)


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


# Relighting a CGI with Materials locked dulled its colours (coral red went brown, Nov 2026): the new
# light and shadows stay, the original colour of every material comes back.

def keep_cmf(original, result, strength=0.75, light_tint=0.5):
    """Put the original's colours (hue and saturation of every material) back under the new light:
    the result's brightness (light, shadows) stays; its colour per unit brightness is pulled back to the
    original's, softly blurred so small shifts don't fringe. light_tint keeps part of the light's colour cast."""
    import numpy as np
    res = result.convert("RGB")
    org = original.convert("RGB").resize(res.size, Image.LANCZOS)
    r = np.asarray(res).astype(np.float32) / 255
    o = np.asarray(org).astype(np.float32) / 255
    w = np.array([0.299, 0.587, 0.114], np.float32)
    lr = (r * w).sum(-1, keepdims=True) + 1e-3
    lo = (o * w).sum(-1, keepdims=True) + 1e-3
    nr, no = r / lr, o / lo                                     # colour per unit brightness
    rad = max(2, res.size[0] // 300)
    def blur(a):
        im = Image.fromarray(np.clip(a / 4 * 255, 0, 255).astype(np.uint8))
        return np.asarray(im.filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255 * 4
    bno, bnr = blur(no), blur(nr)
    tint = (nr.reshape(-1, 3).mean(0) / no.reshape(-1, 3).mean(0)) ** light_tint   # the light's colour, kept in part
    target = nr + (bno * tint - bnr)                             # original colour, the result's fine detail
    n = nr + strength * (target - nr)
    out = np.clip(n * lr, 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


# Relighting a CGI softened its fine texture (perforation, stitching, screen graphics, Nov 2026): the light
# comes from the model, the texture from the original, at the original's full size.
def texture_gate(original, result, width=1400):
    """Where the original's fine detail may go onto the result (0..1): where both show the same thing.
    Off where the result changed what is there (a window turned to haze, a new reflection): copying
    the original's detail there embossed ghost rocks onto foggy glass (Nov 2026)."""
    import numpy as np
    w = min(width, original.size[0]); h = max(8, round(w * original.size[1] / original.size[0]))
    lum = lambda im: np.asarray(im.convert("L").resize((w, h), Image.BOX)).astype(np.float32) / 255
    o, r = lum(original), lum(result)
    bo, br = o - _blur(o, 2), r - _blur(r, 2)
    eo, er = _blur(bo * bo, 6) + 1e-6, _blur(br * br, 6) + 1e-6
    ncc = _blur(bo * br, 6) / np.sqrt(eo * er)
    busy = np.clip((np.sqrt(eo) - 0.006) / 0.01, 0, 1)          # the original has visible detail here
    # the result lost the detail (haze, fog, a blurred view) -> off; a texture in a different phase
    # (perforation drawn again by the model) still counts as the same surface
    same = np.clip((np.sqrt(er / eo) - 0.25) / 0.3, 0, 1) * (0.6 + 0.4 * np.clip((ncc - 0.2) / 0.4, 0, 1))
    g = (1 - busy) + busy * same
    return _blur(g, 3)


def keep_texture(original, result, radius=None, strength=1.0):
    """At the original's full size: the light and colour from the result, the fine texture (perforation,
    stitching, grain, edges) from the original, where the result still shows the same thing (texture_gate).
    Multiplicative, so texture follows the new light and shadow."""
    import numpy as np
    org = original.convert("RGB")
    res = result.convert("RGB").resize(org.size, Image.LANCZOS)
    gate = texture_gate(org, result)
    G = np.asarray(Image.fromarray(gate.astype(np.float32), "F").resize(org.size, Image.BILINEAR))[..., None]
    rad = radius or max(2, org.size[0] // 900)
    o = np.asarray(org).astype(np.float32) + 1
    bo = np.asarray(org.filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) + 1
    r = np.asarray(res).astype(np.float32)
    br = np.asarray(res.filter(ImageFilter.GaussianBlur(rad))).astype(np.float32)
    ratio = (o / bo) ** (strength * G)
    out = np.clip(br * ratio + (r - br) * (1 - G), 0, 255)
    return Image.fromarray((out + 0.5).astype(np.uint8))

def _blur(a, sigma):
    """Gaussian-like blur of a float array (three box blurs), numpy only."""
    import numpy as np
    r = max(1, int(round(sigma * 0.9)))
    out = a.astype(np.float32)
    for _ in range(3):
        for ax in (0, 1):
            pad = [(0, 0)] * out.ndim
            pad[ax] = (r + 1, r)
            c = np.cumsum(np.pad(out, pad, mode="edge"), axis=ax, dtype=np.float64)
            hi = np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax)
            lo = np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)
            out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def no_new_parts(original, result, thresh=0.06):
    """A relight must not add parts (Qwen kept adding a glovebox handle that was never there, Nov 2026):
    where the original surface is plain and the result shows a small new feature, the original goes back,
    lit like its surroundings in the result. Shadows and sun patches (large or long) stay as they are."""
    import numpy as np
    org = original.convert("RGB")
    res = result.convert("RGB").resize(org.size, Image.LANCZOS)
    w, h = org.size
    sw, sh = max(8, w // 4), max(8, h // 4)
    o = np.asarray(org.resize((sw, sh), Image.BOX)).astype(np.float32) / 255
    r = np.asarray(res.resize((sw, sh), Image.BOX)).astype(np.float32) / 255
    lum = lambda a: a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    lo, lr = np.log(lum(o) + 0.02), np.log(lum(r) + 0.02)
    g = np.clip(lr - lo, -2, 2)
    k = max(5, (sw // 40) | 1)      # features under about 1/80 of the width count as "small"
    u = Image.fromarray(((g + 2) / 4 * 255 + 0.5).astype(np.uint8)).filter(ImageFilter.MedianFilter(k))
    gm = np.asarray(u).astype(np.float32) / 255 * 4 - 2
    resid = np.abs(_blur(g - gm, 1.0))
    detail = _blur(np.abs(lo - _blur(lo, 3)), 4)
    m = ((resid > thresh) & (detail < 0.03)).astype(np.uint8) * 255
    if not m.any():
        return res
    mi = Image.fromarray(m).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MaxFilter(9))
    mf = _blur(np.asarray(mi).astype(np.float32) / 255, 2.5)
    up = lambda a: np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), Image.BILINEAR))
    G = np.exp(up(gm))
    cr, co = _blur(r, 6) + 0.02, _blur(o, 6) + 0.02
    tint = (cr / co) / np.exp(_blur(g, 6))[..., None]
    T = np.stack([up(tint[..., c]) for c in range(3)], axis=-1)
    M = up(mf)[..., None]
    O = np.asarray(org).astype(np.float32)
    R = np.asarray(res).astype(np.float32)
    put = np.clip(O * G[..., None] * T, 0, 255)
    out = R * (1 - M) + put * M
    return Image.fromarray((out + 0.5).astype(np.uint8))


def same_place(original, result, width=360):
    """0..1 per spot: is the result there still the original, only under other light (brighter, darker,
    hazier, tinted), or does it show something else? Locally the result is fitted as gain x original +
    offset: a relight fits (shadows, sun patches, haze), a new scene does not (a city instead of the
    desert outside the windows). Studio's keep steps work only where this is 1 (Nov 2026: they painted
    the desert back over a city road the model had drawn). Small misfits (an invented handle) count as
    the same place, so the no-new-parts guard still removes them."""
    import numpy as np
    w = min(width, original.size[0]); h = max(8, round(w * original.size[1] / original.size[0]))
    arr = lambda im: np.asarray(im.convert("RGB").resize((w, h), Image.BOX)).astype(np.float32) / 255
    O, R = arr(original), arr(result)
    fit = []
    for c in range(3):
        o, r = O[..., c], R[..., c]
        mo, mr = _blur(o, 5), _blur(r, 5)
        vo = np.maximum(_blur(o * o, 5) - mo * mo, 0)
        vr = np.maximum(_blur(r * r, 5) - mr * mr, 0)
        cv = _blur(o * r, 5) - mo * mr
        r2 = (cv * cv) / ((vo + 1e-5) * (vr + 1e-5))            # how much of the result the original explains
        busy = np.clip((np.sqrt(vr) - 0.01) / 0.02, 0, 1)       # flat in the result: nothing to say
        fit.append(1 - busy * (1 - r2))
    a = np.clip((np.mean(fit, axis=0) - 0.2) / 0.3, 0, 1)
    # changed only counts in large areas (a window view, a background), not spots (a sun patch, a handle)
    a = np.where(_big_areas(a < 0.5, 0.03), a, 1.0)
    return np.clip(_blur(a, 2), 0, 1)


def _big_areas(mask, min_frac):
    """Keep only the connected areas of a small boolean mask covering at least min_frac of it."""
    import numpy as np
    from collections import deque
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    keep = np.zeros((h, w), bool)
    need = min_frac * h * w
    n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q, pts = deque([(y0, x0)]), []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        if len(pts) >= need:
            ys, xs = zip(*pts)
            keep[list(ys), list(xs)] = True
    return keep


def _blend_kept(changed, kept, agree):
    """The model's picture where it changed things, Studio's kept version where it did not."""
    import numpy as np
    size = kept.size
    A = np.asarray(Image.fromarray(agree.astype(np.float32), "F").resize(size, Image.BILINEAR))[..., None]
    c = np.asarray(changed.convert("RGB").resize(size, Image.LANCZOS)).astype(np.float32)
    k = np.asarray(kept.convert("RGB")).astype(np.float32)
    return Image.fromarray((c * (1 - A) + k * A + 0.5).clip(0, 255).astype(np.uint8))


def aligned(original, result, need=0.55):
    """True when the result shows the same picture in the same place (a relight, not a new view): the
    edges of both, small, correlate."""
    import numpy as np
    def edges(im):
        g = np.asarray(im.convert("L").resize((256, 144), Image.LANCZOS)).astype(np.float32)
        e = np.abs(np.diff(g, axis=0))[:, :-1] + np.abs(np.diff(g, axis=1))[:-1, :]
        return (e - e.mean()) / (e.std() + 1e-6)
    a, b = edges(original), edges(result)
    return float((a * b).mean()) >= need


def _still_sketch(work, data):
    """True when a render came back looking like the sketch it was made from: nearly the same grey picture
    (no colour, little change from the input)."""
    try:
        out = Image.open(io.BytesIO(data)).convert("RGB")
        a = work.convert("L").resize((96, 96))
        b = out.convert("L").resize((96, 96))
        diff = sum(abs(x - y) for x, y in zip(a.getdata(), b.getdata())) / (96 * 96)
        hsv = out.resize((96, 96)).convert("HSV")
        sat = sum(px[1] for px in hsv.getdata()) / (96 * 96)
        return diff < 22 and sat < 28
    except Exception:
        return False


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
