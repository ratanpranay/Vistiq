"""Upscaling in parts, for results too big for the graphics card in one go.

The upscaler works on the whole picture at once, and the memory that takes
grows with the size of the result: on a 16 GB card about 25 megapixels fit,
but 9600 x 5400 (52 MP) does not, even with the whole model swapped out.
Bigger results are made in overlapping parts, each upscaled on its own, then
blended back together across the overlaps so no seam shows. Every part is
colour-matched to its own piece of the original by the upscaler, so the parts
agree with each other.
"""
import io
import math
import os

from PIL import Image, ImageChops, ImageOps

Image.MAX_IMAGE_PIXELS = None

#: Graphics memory the upscale step needs, per megapixel of result (measured:
#: 9.1 GB peak for 17 MP, 21.7 GB for 52 MP), with a little to spare.
GB_PER_MP = 0.6
#: What the card keeps for Windows, the screen and the model's resident parts.
RESERVED_GB = 2.5
#: Blend zone between parts, in result pixels.
OVERLAP = 192


def part_limit(vram_gb, learned=None):
    """The largest part, in megapixels of result, this card handles."""
    if learned:
        return float(learned)
    if not vram_gb:
        return 16.0
    return max(4.0, min(64.0, (vram_gb - RESERVED_GB) / GB_PER_MP))


def plan(width, height, out_w, out_h, limit_mp):
    """The parts to cut: a list of (x0, y0, x1, y1) boxes in the original,
    or a single box when the whole result fits."""
    if out_w * out_h / 1e6 <= limit_mp:
        return [(0, 0, width, height)]
    factor = out_w / float(width)
    pad = int(math.ceil(OVERLAP / factor / 2.0))       # each side of a seam
    best = None
    for cols in range(1, 9):
        for rows in range(1, 9):
            cw, ch = width / float(cols), height / float(rows)
            pw = cw + (2 * pad if cols > 1 else 0)
            ph = ch + (2 * pad if rows > 1 else 0)
            if pw * factor * ph * factor / 1e6 > limit_mp:
                continue
            # Fewest parts, then parts closest to square.
            score = (cols * rows, abs(math.log(pw / ph)))
            if best is None or score < best[0]:
                best = (score, cols, rows)
    if best is None:
        cols = rows = 8
    else:
        _, cols, rows = best
    xs = [round(i * width / float(cols)) for i in range(cols + 1)]
    ys = [round(j * height / float(rows)) for j in range(rows + 1)]
    boxes = []
    for j in range(rows):
        for i in range(cols):
            boxes.append((max(0, xs[i] - pad), max(0, ys[j] - pad),
                          min(width, xs[i + 1] + pad), min(height, ys[j + 1] + pad)))
    return boxes


def cut(path, boxes, folder):
    """Writes each part as a PNG in `folder`; returns their paths."""
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() or im.mode == "P" else "RGB")
    stem = os.path.splitext(os.path.basename(path))[0][:40]
    paths = []
    for n, box in enumerate(boxes):
        p = os.path.join(folder, "%s_part%d.png" % (stem, n + 1))
        im.crop(box).save(p, "PNG", compress_level=1)
        paths.append(p)
    return paths


def _ramp(size, start, end):
    """A 0..255 mask, along one axis: rises over [0, start), falls over
    (size-end, size]."""
    vals = []
    for i in range(size):
        v = 1.0
        if start and i < start:
            v = (i + 0.5) / start
        if end and i >= size - end:
            v = min(v, (size - i - 0.5) / end)
        vals.append(int(round(255 * max(0.0, min(1.0, v)))))
    return vals


def stitch(parts, boxes, width, height, out_w, out_h):
    """Blends the upscaled parts (PNG bytes, in `boxes` order) into one image
    of out_w x out_h; returns PNG bytes."""
    fx, fy = out_w / float(width), out_h / float(height)
    mode = "RGBA" if any(Image.open(io.BytesIO(p)).mode in ("RGBA", "LA") for p in parts) else "RGB"
    canvas = Image.new(mode, (out_w, out_h))
    for data, (x0, y0, x1, y1) in zip(parts, boxes):
        ox0, oy0 = round(x0 * fx), round(y0 * fy)
        ox1, oy1 = round(x1 * fx), round(y1 * fy)
        w, h = ox1 - ox0, oy1 - oy0
        im = Image.open(io.BytesIO(data)).convert(mode)
        if im.size != (w, h):
            im = im.resize((w, h), Image.LANCZOS)
        # Feather only the edges that overlap a part already on the canvas
        # (left and top) or one still to come (right and bottom): the ramps
        # of two neighbours add up to one across the overlap.
        left = min(OVERLAP, w // 2) if x0 > 0 else 0
        top = min(OVERLAP, h // 2) if y0 > 0 else 0
        if not left and not top:
            canvas.paste(im, (ox0, oy0))
            continue
        hx = Image.new("L", (w, 1))
        hx.putdata(_ramp(w, left, 0))
        hy = Image.new("L", (1, h))
        hy.putdata(_ramp(h, top, 0))
        mask = ImageChops.multiply(hx.resize((w, h), Image.NEAREST), hy.resize((w, h), Image.NEAREST))
        canvas.paste(im, (ox0, oy0), mask)
    buf = io.BytesIO()
    canvas.save(buf, "PNG", compress_level=1)
    return buf.getvalue()
