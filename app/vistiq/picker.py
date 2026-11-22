"""Select object: click a part of the picture, get its outline.

Uses SAM 2.1 (Meta, Apache 2.0), the small "tiny" version exported to ONNX,
run on the processor with onnxruntime: about a second to read a picture the
first time, then a fraction of a second per click.
"""
import glob
import io
import logging
import os
import shutil
import threading
import zipfile

from PIL import Image, ImageFilter, ImageOps

log = logging.getLogger("vistiq")

URL = ("https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main/"
       "sam2.1_hiera_tiny_20260221.zip")
SIZE_MB = 111
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def folder(models_dir):
    return os.path.join(models_dir, "select")


def _files(models_dir):
    f = folder(models_dir)
    enc = glob.glob(os.path.join(f, "**", "*encoder*.onnx"), recursive=True)
    dec = glob.glob(os.path.join(f, "**", "*decoder*.onnx"), recursive=True)
    return (enc[0], dec[0]) if enc and dec else (None, None)


def installed(models_dir):
    return all(_files(models_dir))


def install(models_dir, download, on_progress, cancelled):
    """Download and unpack the selection model (about 110 MB, once)."""
    f = folder(models_dir)
    os.makedirs(f, exist_ok=True)
    zpath = os.path.join(f, "sam2.1_tiny.zip")
    download(URL, zpath, on_progress, "Selection tool", cancelled)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(f)
    os.remove(zpath)
    if not installed(models_dir):
        shutil.rmtree(f, ignore_errors=True)
        raise RuntimeError("The selection tool download was incomplete.")


class Selector:
    """Keeps the model and the last picture it read."""

    def __init__(self):
        self._lock = threading.Lock()
        self._enc = self._dec = None
        self._key = None
        self._feats = None
        self._size = None

    def _load(self, models_dir):
        if self._enc:
            return
        import onnxruntime as ort
        enc, dec = _files(models_dir)
        if not enc:
            raise RuntimeError("The selection tool isn't set up yet.")
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self._enc = ort.InferenceSession(enc, opts, providers=["CPUExecutionProvider"])
        self._dec = ort.InferenceSession(dec, opts, providers=["CPUExecutionProvider"])

    def _encode(self, path):
        import numpy as np
        key = (path, os.path.getmtime(path))
        if self._key == key:
            return
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        self._size = im.size
        inp = self._enc.get_inputs()[0]
        h, w = int(inp.shape[2]), int(inp.shape[3])
        arr = np.asarray(im.resize((w, h), Image.BILINEAR), dtype=np.float32) / 255.0
        if inp.type == "tensor(float)":
            arr = (arr - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
            t = arr.transpose(2, 0, 1)[None].astype(np.float32)
        else:
            t = (arr * 255).astype(np.uint8).transpose(2, 0, 1)[None]
        outs = self._enc.run(None, {inp.name: t})
        names = [o.name for o in self._enc.get_outputs()]
        by = dict(zip(names, outs))
        # high_res_feats_0, high_res_feats_1, image_embed (by name if present)
        self._feats = (by.get("high_res_feats_0", outs[0]), by.get("high_res_feats_1", outs[1]),
                       by.get("image_embed", outs[2]))
        self._in_size = (h, w)
        self._key = key

    def select(self, models_dir, path, points, out_size):
        """points: [(u, v, positive)] with u, v in 0..1 of the picture.
        Returns a mask (L, 255 = selected) of out_size."""
        import numpy as np
        with self._lock:
            self._load(models_dir)
            self._encode(path)
            h, w = self._in_size
            f0, f1, emb = self._feats
            coords = np.array([[[u * w, v * h] for u, v, _ in points]], dtype=np.float32)
            labels = np.array([[1 if pos else 0 for _, _, pos in points]], dtype=np.float32)
            feeds = {}
            values = {"image_embed": emb, "high_res_feats_0": f0, "high_res_feats_1": f1,
                      "point_coords": coords, "point_labels": labels,
                      "mask_input": np.zeros((1, 1, h // 4, w // 4), dtype=np.float32),
                      "has_mask_input": np.array([0], dtype=np.float32),
                      "orig_im_size": np.array([h, w], dtype=np.int64)}
            order = [emb, f0, f1, coords, labels, values["mask_input"], values["has_mask_input"]]
            for i, inp in enumerate(self._dec.get_inputs()):
                feeds[inp.name] = values[inp.name] if inp.name in values else order[i]
            masks, scores = self._dec.run(None, feeds)[:2]
            m = masks[0][int(np.argmax(np.asarray(scores).reshape(-1)))]
        # The model's answer is a coarse map of how sure it is; enlarge that
        # smoothly before cutting at zero, so the outline follows the curve.
        logits = Image.fromarray(np.ascontiguousarray(m, dtype=np.float32)).resize(out_size, Image.BILINEAR)
        mask = Image.fromarray(((np.asarray(logits) > 0) * 255).astype(np.uint8), "L")
        return mask.filter(ImageFilter.MedianFilter(3))


def to_png(mask):
    buf = io.BytesIO()
    rgba = Image.new("RGBA", mask.size, (138, 43, 242, 0))
    rgba.putalpha(mask)
    rgba.save(buf, "PNG")
    return buf.getvalue()


def snap_points(shape, n_in=5, n_out=8):
    """Prompt points for snapping a hand-drawn shape (L mask) to the object it covers:
    positives well inside it, negatives on a ring just outside. Returns [(u, v, positive)]."""
    import math
    import numpy as np
    small = shape.convert("L").resize((256, max(1, round(256 * shape.size[1] / shape.size[0]))), Image.BILINEAR)
    a = np.asarray(small) > 127
    ys, xs = np.nonzero(a)
    if len(xs) < 30:
        return []
    h, w = a.shape
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    # inside: shrink the shape so the points stay off its (hand-drawn) edge
    er = small
    k = max(3, (int(min(bw, bh) * 0.18) | 1))
    er2 = np.asarray(small.filter(ImageFilter.MinFilter(k))) > 127
    if er2.sum() >= 12:
        er = er2
    else:
        er = a
    ey, ex = np.nonzero(er)
    pts = []
    cols = rows = 3
    x0, y0 = ex.min(), ey.min()
    cw, ch = (ex.max() - x0 + 1) / cols, (ey.max() - y0 + 1) / rows
    for r in range(rows):
        for c in range(cols):
            sel = (ex >= x0 + c * cw) & (ex < x0 + (c + 1) * cw) & (ey >= y0 + r * ch) & (ey < y0 + (r + 1) * ch)
            if sel.sum() > 3:
                i = np.argmin((ex[sel] - ex[sel].mean()) ** 2 + (ey[sel] - ey[sel].mean()) ** 2)
                pts.append((ex[sel][i], ey[sel][i], sel.sum()))
    pts.sort(key=lambda p: -p[2])
    out = [((x + 0.5) / w, (y + 0.5) / h, True) for x, y, _ in pts[:n_in]]
    # outside: a ring a little away from the shape, sampled round its centre
    grow = max(5, (int(max(bw, bh) * 0.12) | 1))
    ring = (np.asarray(small.filter(ImageFilter.MaxFilter(grow))) > 127) & ~(np.asarray(small.filter(ImageFilter.MaxFilter(max(3, grow // 2 | 1)))) > 127)
    ry, rx = np.nonzero(ring)
    if len(rx):
        cx, cy = xs.mean(), ys.mean()
        ang = np.arctan2(ry - cy, rx - cx)
        for j in range(n_out):
            lo, hi = -math.pi + j * 2 * math.pi / n_out, -math.pi + (j + 1) * 2 * math.pi / n_out
            sel = (ang >= lo) & (ang < hi)
            if sel.sum():
                i = np.flatnonzero(sel)[sel.sum() // 2]
                out.append(((rx[i] + 0.5) / w, (ry[i] + 0.5) / h, False))
    return out


def snap_merge(shape, found, reach=0.2):
    """The object's outline, kept near the drawn shape (it may complete the object a little past the
    drawn edge, and drop what the shape spilled onto). Falls back to the shape when the object found
    is much smaller or larger than what was drawn (the wrong thing)."""
    import numpy as np
    a = np.asarray(shape.convert("L")) > 127
    f = np.asarray(found.convert("L").resize(shape.size)) > 127
    area = a.sum()
    if area < 50:
        return shape
    ys, xs = np.nonzero(a)
    # how far the object may run past what was drawn: a share of the drawn size, grown on a small copy
    f8 = max(1, max(shape.size) // 256)
    small = shape.convert("L").resize((max(1, shape.size[0] // f8), max(1, shape.size[1] // f8)), Image.BILINEAR)
    g = max(3, int(max(xs.max() - xs.min(), ys.max() - ys.min()) * reach / f8) | 1)
    near = np.asarray(small.filter(ImageFilter.MaxFilter(min(g, 61))).resize(shape.size, Image.NEAREST)) > 127
    out = f & near
    ratio = out.sum() / float(area)
    if ratio < 0.35 or ratio > 2.2:
        return shape
    return Image.fromarray((out * 255).astype("uint8"), "L").filter(ImageFilter.MedianFilter(3))
