"""Magic eraser: LaMa (Apache 2.0) on onnxruntime, on the processor.

Paint over an object and it is removed: the area round the painted part is
cut out, filled in by LaMa at 512 x 512 and put back with soft edges. About a
second on a normal processor; the model (208 MB) downloads once on first use.
"""
import base64
import io
import logging
import os
import threading

from PIL import Image, ImageFilter

log = logging.getLogger("vistiq")

URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"
SIZE = 512
NAME = "lama_fp32.onnx"
MB = 208


def path(models_dir):
    return os.path.join(models_dir, "eraser", NAME)


def installed(models_dir):
    p = path(models_dir)
    return os.path.isfile(p) and os.path.getsize(p) > 100e6


def _from_url(data):
    raw = base64.b64decode(data.split(",", 1)[1] if "," in data else data)
    return Image.open(io.BytesIO(raw))


def _to_url(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


class Eraser:
    def __init__(self):
        self._lock = threading.Lock()
        self._sess = None

    def _load(self, model):
        if self._sess:
            return
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self._sess = ort.InferenceSession(model, opts, providers=["CPUExecutionProvider"])

    def fill(self, model, image, mask):
        """`image` RGB, `mask` L (white = remove), same size. Returns an RGBA patch
        of that size: the filled-in pixels where the mask was, clear elsewhere."""
        import numpy as np
        with self._lock:
            self._load(model)
            W, H = image.size
            m = mask.point(lambda v: 255 if v > 127 else 0)
            box = m.getbbox()
            if not box:
                return Image.new("RGBA", image.size, (0, 0, 0, 0))
            # Work on the painted part with a generous margin: LaMa needs the surroundings.
            x0, y0, x1, y1 = box
            side = max(x1 - x0, y1 - y0)
            pad = int(side * 0.6) + 24
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            half = (side + 2 * pad) / 2
            cx0, cy0 = max(0, int(cx - half)), max(0, int(cy - half))
            cx1, cy1 = min(W, int(cx + half)), min(H, int(cy + half))
            crop = (cx0, cy0, cx1, cy1)
            ci = image.crop(crop).resize((SIZE, SIZE), Image.LANCZOS)
            # Grow the mask a little: a stroke that just misses the edge leaves a ghost.
            cm = m.crop(crop).resize((SIZE, SIZE), Image.NEAREST).filter(ImageFilter.MaxFilter(9))
            a = np.asarray(ci, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
            b = (np.asarray(cm, dtype=np.float32)[None, None] > 127).astype(np.float32)
            names = [i.name for i in self._sess.get_inputs()]
            out = self._sess.run(None, {names[0]: a, names[1]: b})[0][0]
            if out.max() <= 1.5:
                out = out * 255.0
            out = np.clip(out.transpose(1, 2, 0), 0, 255).astype(np.uint8)
            filled = Image.fromarray(out).resize((cx1 - cx0, cy1 - cy0), Image.LANCZOS)
            # Soft edge: the patch fades out just beyond the painted part.
            edge = cm.resize((cx1 - cx0, cy1 - cy0), Image.BILINEAR).filter(ImageFilter.MaxFilter(5)) \
                .filter(ImageFilter.GaussianBlur(max(1.5, (cx1 - cx0) / 160)))
            patch = Image.new("RGBA", image.size, (0, 0, 0, 0))
            piece = filled.convert("RGBA")
            piece.putalpha(edge)
            patch.paste(piece, (cx0, cy0))
            return patch


_eraser = Eraser()


def erase(models_dir, image_url, mask_url):
    """Data URLs in, an RGBA patch data URL out."""
    model = path(models_dir)
    image = _from_url(image_url).convert("RGB")
    mask = _from_url(mask_url).convert("L").resize(image.size, Image.NEAREST)
    return _to_url(_eraser.fill(model, image, mask))
