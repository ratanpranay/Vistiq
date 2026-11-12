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
