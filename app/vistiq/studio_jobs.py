"""Vistiq Studio's jobs: setting up, creating images, the library.

Lives next to the upscaler's App; `Studio(app)` is made only in the Studio
build.
"""
import base64
import io
import json
import logging
import os
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
        self.engine = studio.ImageEngine(app.settings, os.path.join(data_dir(), "logs"))
        self._cancel = threading.Event()
        self._job = None
        self._setup = None
        self._thumbs = {}

    def emit(self, kind, data):
        self.app.emit(kind, data)

    def say(self, state, message=""):
        self.emit("studio-engine", {"state": state, "message": message})

    # -- status and setup ----------------------------------------------------

    def status(self):
        st = studio.status(self.settings)
        st["engine"] = {"state": self.engine.state, "message": self.engine.message}
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
                if not studio.engine_installed():
                    studio.install_engine(self.settings, prog, self._cancel.is_set)
                for f in studio.FILES:
                    if f["part"] == "juice" and not juice:
                        continue
                    if f["url"] and not studio.find(f["key"], self.settings):
                        dst = os.path.join(studio.models_dir(self.settings), f["folder"], f["names"][0])
                        studio.download(f["url"], dst, prog, f["label"], self._cancel.is_set)
                studio.write_model_paths(self.settings)
                self.emit("studio-setup", {"state": "done", "status": studio.status(self.settings)})
            except Exception as exc:
                log.exception("studio setup failed")
                self.emit("studio-setup", {"state": "cancelled" if str(exc) == "cancelled" else "error",
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
        if not studio.status(self.settings)["create_ready"]:
            self.emit("studio-job", {"state": "error", "message": "Some model files are missing. See Settings."})
            return False
        self._cancel.clear()
        job_id = "%x" % int(time.time() * 1000)
        self._job = threading.Thread(target=self._run, args=(job_id, job), daemon=True)
        self._job.start()
        return job_id

    def _run(self, job_id, job):
        s = self.settings
        n = max(1, min(4, int(job.get("variations") or 1)))
        say = lambda stage, frac: self.emit("studio-job", {"id": job_id, "state": "running", "stage": stage,
                                                            "fraction": frac})
        try:
            say("Making room on the graphics card", None)
            self.app.free_upscaler()
            if not self.engine.alive() and not self.engine.start(self.say):
                raise RuntimeError(self.engine.message)
            src_path = job["image"]
            original = load_rgb(src_path)
            mask = box = None
            if job.get("mask"):
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
            if mode == "reference":
                ref_path = os.path.join(tmp_dir, "ref_%s.png" % job_id)
                load_rgb(job["reference"]).save(ref_path, "PNG", compress_level=1)
                ref_image = self.engine.upload(ref_path)
                text = studio.build_text(job.get("preset") or "camera", job.get("text"), studio.REF_PRESETS)
            else:
                text = studio.build_text(job.get("preset") or "", job.get("text"))
            seed = int(job.get("seed") or int(time.time()) % 100000 * 7919)
            keep = float(job.get("keep") if job.get("keep") is not None else 0.8)
            stem = os.path.splitext(os.path.basename(job.get("name") or src_path))[0]
            if stem.lower().startswith("vistiq_"):
                stem = stem[7:]
            stem = _strip_tags(stem)
            tag = ("refine" if job.get("refine_of") else
                   ("paint" if mask is not None else ("create" if mode == "create" else (job.get("preset") or "reference"))))
            out_dir = os.path.join(studio.outputs_dir(s), time.strftime("%Y-%m-%d"))
            results = []
            for v in range(n):
                if self._cancel.is_set():
                    raise RuntimeError("Cancelled")
                label = "Variation %d of %d" % (v + 1, n) if n > 1 else "Creating"
                say(label, v / n)
                prog = lambda f, v=v: say(label, (v + f) / n)
                if mode == "reference":
                    prompt = studio.reference_prompt(s, image, ref_image, text, job.get("preset") or "camera",
                                                     keep, WORK_MP, seed + v)
                else:
                    prompt = studio.create_prompt(s, image, text, keep, WORK_MP, seed + v)
                _add_lora(prompt, job.get("lora"), job.get("lora_strength", 0.8))
                data = self.engine.run(prompt, prog, self._cancel.is_set)
                if job.get("juice") and studio.status(s)["juice_ready"] and job.get("juice_lora"):
                    say("Juice · " + label.lower(), (v + 0.9) / n)
                    jpath = os.path.join(tmp_dir, "juice_%s_%d.png" % (job_id, v))
                    with open(jpath, "wb") as fh:
                        fh.write(data)
                    jimg = self.engine.upload(jpath)
                    amount = max(0.0, min(1.0, float(job.get("juice"))))
                    jp = studio.juice_prompt(s, jimg, text, job["juice_lora"], 0.8, 0.18 + 0.27 * amount,
                                             WORK_MP, seed + v)
                    data = self.engine.run(jp, None, self._cancel.is_set)
                result = Image.open(io.BytesIO(data)).convert("RGB")
                if mask is not None:
                    blend = int(float(job.get("blend", 0.35)) * 0.06 * max(box[2] - box[0], box[3] - box[1])) + 2
                    result = composite(original, result, mask, box, blend)
                buf = io.BytesIO()
                result.save(buf, "PNG")
                path, w, h = imaging.save(buf.getvalue(), stem + ".png", out_dir, "PNG",
                                          "%s_v%d" % (tag, v + 1), limit=16384)
                meta = {"mode": mode, "preset": job.get("preset"), "text": job.get("text") or "",
                        "keep": keep, "seed": seed + v, "source": src_path, "reference": job.get("reference"),
                        "painted": mask is not None, "juice": job.get("juice") or 0, "lora": job.get("lora"),
                        "kind": "reference" if mode == "reference" else "create",
                        "made": time.strftime("%Y-%m-%d %H:%M:%S")}
                _write_meta(path, meta)
                item = {"path": path, "w": w, "h": h, "name": os.path.basename(path),
                        "preview": imaging.preview(path), "meta": meta}
                results.append(item)
                self.emit("studio-result", {"id": job_id, "result": item, "index": v, "of": n})
            self.emit("studio-job", {"id": job_id, "state": "done", "count": len(results)})
        except Exception as exc:
            msg = str(exc)
            if msg != "Cancelled":
                log.exception("studio job failed")
            self.emit("studio-job", {"id": job_id, "state": "cancelled" if msg == "Cancelled" else "error",
                                     "message": "" if msg == "Cancelled" else msg})

    # -- the library ----------------------------------------------------------------

    def library(self, limit=200):
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
        out = []
        for mtime, p in found[:limit]:
            meta = _read_meta(p)
            out.append({"path": p, "name": os.path.basename(p), "kind": meta.get("kind") or kind_of(os.path.basename(p)),
                        "made": mtime * 1000, "text": meta.get("text", ""), "thumb": self.thumb(p, mtime)})
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
        if not self.settings.get("keep_engine", True):
            self.engine.stop()


def _add_lora(prompt, lora, strength):
    """An extra Klein LoRA (a look), after Klein-consistency."""
    if not lora:
        return
    model = prompt["40"]["inputs"]["model"]
    prompt["5"] = {"class_type": "LoraLoaderModelOnly",
                   "inputs": {"model": model, "lora_name": lora, "strength_model": round(float(strength), 2)}}
    prompt["40"]["inputs"]["model"] = ["5", 0]


def _strip_tags(stem):
    import re
    return re.sub(r"_(create|refine|paint|reference|camera|cmf|style)_v\d+(_\d+)?$", "", stem) or stem


def _meta_path(path):
    return os.path.join(os.path.dirname(path), ".vistiq", os.path.basename(path) + ".json")


def _write_meta(path, meta):
    try:
        mp = _meta_path(path)
        os.makedirs(os.path.dirname(mp), exist_ok=True)
        if os.name == "nt":
            import ctypes
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


def _free_gb(path):
    import shutil
    p = path
    while p and not os.path.exists(p):
        p = os.path.dirname(p)
    try:
        return round(shutil.disk_usage(p or os.path.expanduser("~")).free / 1e9)
    except OSError:
        return 0
