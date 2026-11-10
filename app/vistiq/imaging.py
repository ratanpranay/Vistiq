"""Reading, previewing and saving images."""
import base64
import io
import os

from PIL import Image, ImageOps

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
    fmt = (fmt or "PNG").upper()
    ext = {"PNG": ".png", "JPG": ".jpg", "WEBP": ".webp"}.get(fmt, ".png")
    stem = os.path.splitext(os.path.basename(source_path))[0]
    path = os.path.join(out_dir, "%s_%s%s" % (stem, tag, ext))
    n = 2
    while os.path.exists(path):
        path = os.path.join(out_dir, "%s_%s_%d%s" % (stem, tag, n, ext))
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
