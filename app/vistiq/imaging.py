"""Reading, previewing and saving images."""
import base64
import io
import os

from PIL import Image, ImageOps

# Results go up to 16 384 px a side; Pillow would refuse those as too big.
Image.MAX_IMAGE_PIXELS = None

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
PREVIEW = 1600


def is_image(path):
    return os.path.splitext(path)[1].lower() in EXTS


def expand(paths):
    """Files as given, folders opened one level down, images only."""
    out = []
    for p in paths:
        if not p:
            continue
        if os.path.isdir(p):
            for name in sorted(os.listdir(p)):
                full = os.path.join(p, name)
                if os.path.isfile(full) and is_image(full):
                    out.append(full)
        elif os.path.isfile(p) and is_image(p):
            out.append(p)
    return out


def size_of(path):
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        return im.size


def has_alpha(path):
    """Whether any of the picture is actually transparent."""
    try:
        with Image.open(path) as im:
            if im.mode == "P" and "transparency" in im.info:
                im = im.convert("RGBA")
            if "A" not in im.getbands():
                return False
            return im.getchannel("A").getextrema()[0] < 255
    except Exception:
        return False


def preview(source):
    """A JPEG data URL small enough for the window, from a path or bytes."""
    im = Image.open(io.BytesIO(source) if isinstance(source, (bytes, bytearray)) else source)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((PREVIEW, PREVIEW), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=86)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


LIMIT = 7000


def save(data, source_path, out_dir, fmt, tag, limit=LIMIT):
    """Write the result next to nothing it could overwrite. Returns
    (path, width, height)."""
    os.makedirs(out_dir, exist_ok=True)
    im = Image.open(io.BytesIO(data))
    if max(im.size) > limit:
        # The engine aims for the limit but rounds to its own grid; the
        # promise is that nothing leaves this app bigger than the limit.
        f = limit / float(max(im.size))
        im = im.resize((max(1, min(limit, round(im.size[0] * f))),
                        max(1, min(limit, round(im.size[1] * f)))), Image.LANCZOS)
    # A picture with nothing transparent in it is saved without a
    # transparency channel: smaller, and it opens anywhere.
    if im.mode == "RGBA" and (not has_alpha(source_path)
                              or im.getchannel("A").getextrema() == (255, 255)):
        im = im.convert("RGB")
    fmt = (fmt or "PNG").upper()
    ext = {"PNG": ".png", "JPG": ".jpg", "WEBP": ".webp"}.get(fmt, ".png")
    stem = os.path.splitext(os.path.basename(source_path))[0]
    # "Vistiq_" first, so results sort together and are easy to find.
    path = os.path.join(out_dir, "Vistiq_%s_%s%s" % (stem, tag, ext))
    n = 2
    while os.path.exists(path):
        path = os.path.join(out_dir, "Vistiq_%s_%s_%d%s" % (stem, tag, n, ext))
        n += 1
    if fmt == "JPG":
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.getchannel("A"))
            im = bg
        im.convert("RGB").save(path, "JPEG", quality=95, subsampling=0)
    elif fmt == "WEBP":
        im.save(path, "WEBP", quality=95, method=5)
    else:
        im.save(path, "PNG", optimize=False)
    return path, im.size[0], im.size[1]


class Lens:
    """Cuts matching pieces of an original and its result for the magnifier.
    Both pictures stay open while one image is being looked at."""

    def __init__(self):
        self._key = None
        self._before = self._after = None

    def _open(self, before_path, after_path):
        key = (before_path, after_path, os.path.getmtime(after_path))
        if key != self._key:
            b = ImageOps.exif_transpose(Image.open(before_path))
            self._before = b.convert("RGBA" if has_alpha(before_path) else "RGB")
            a = Image.open(after_path)
            self._after = a.convert("RGBA" if a.mode in ("RGBA", "LA", "P") else "RGB")
            self._key = key

    def cut(self, before_path, after_path, u, v, lens_px, zoom, out_px):
        """The square around the point (u, v) (0..1 across the picture) that
        a lens of `lens_px` shows at `zoom` (screen pixels per result pixel),
        from both pictures, as JPEG data URLs `out_px` wide."""
        self._open(before_path, after_path)
        aw, ah = self._after.size
        side = lens_px / max(0.05, zoom)              # in result pixels
        out = []
        for im, how in ((self._before, Image.BICUBIC), (self._after, Image.LANCZOS)):
            w, h = im.size
            k = w / float(aw)                         # this picture's pixels per result pixel
            half = side * k / 2.0
            box = (u * w - half, v * h - half, u * w + half, v * h + half)
            piece = im.crop(tuple(int(round(c)) for c in box))
            if piece.mode == "RGBA":
                bg = Image.new("RGB", piece.size, (236, 238, 242))
                bg.paste(piece, mask=piece.getchannel("A"))
                piece = bg
            piece = piece.resize((out_px, out_px), how)
            buf = io.BytesIO()
            piece.save(buf, "JPEG", quality=90)
            out.append("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
        return {"before": out[0], "after": out[1]}
