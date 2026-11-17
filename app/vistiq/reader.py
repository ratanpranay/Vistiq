"""Picture reader: a small local vision model (Qwen3-VL 2B, Apache 2.0) that
puts a reference picture's camera, light, style or materials into words.

The image model copies materials from a reference picture, but only follows
a camera, a light or a style when it is described in words (tested on the
user's PC, Nov 2026). Optional download (about 2.6 GB); runs on the
processor with llama.cpp, offline, so the graphics card stays free.
"""
import base64
import io
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile

import requests

log = logging.getLogger("vistiq")

BASE = "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/"
MODEL = "Qwen3VL-2B-Instruct-Q8_0.gguf"
MMPROJ = "mmproj-Qwen3VL-2B-Instruct-F16.gguf"
GB = 2.6
# The XL reader (Qwen3-VL 8B, about 5.8 GB) understands sketches far better: what each
# drawn shape is (a band across the dashboard is a display…). Used when it is there.
XL_BASE = "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/"
XL_MODEL = "Qwen3VL-8B-Instruct-Q4_K_M.gguf"
XL_MMPROJ = "mmproj-Qwen3VL-8B-Instruct-F16.gguf"
XL_GB = 6.2


def _files(models_dir):
    """The best reader on this computer: (model, eyes)."""
    f = folder(models_dir)
    if os.path.isfile(os.path.join(f, XL_MODEL)) and os.path.isfile(os.path.join(f, XL_MMPROJ)):
        return os.path.join(f, XL_MODEL), os.path.join(f, XL_MMPROJ)
    return os.path.join(f, MODEL), os.path.join(f, MMPROJ)


def xl_installed(models_dir):
    f = folder(models_dir)
    return os.path.isfile(os.path.join(f, XL_MODEL)) and os.path.isfile(os.path.join(f, XL_MMPROJ)) and bool(_server(models_dir))
RELEASES = "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30"
PORT = 38395
SIDE = 896          # the picture is read at this size (longest side)

ASK = {
    "camera": ("Describe only the camera of this picture, so a photographer could put the camera in exactly "
               "the same place. Say how high the camera is (low, eye level, high, overhead), where it stands "
               "in the scene, which way it looks, how steeply it tilts down or up, the lens (wide, normal, "
               "telephoto) and what fills the foreground, the middle and the top edge of the frame. Do not "
               "mention colours, materials, brands, logos or design details. One paragraph, at most 70 words."),
    "light": ("Describe only the lighting and mood of this picture: time of day, the sky and the brightness "
              "outside the windows, every light source, the light's direction, colour temperature, brightness "
              "and contrast, shadows, any glowing ambient light strips or screens, and the mood. Do not "
              "describe shapes, design, materials or the camera. One paragraph, at most 70 words."),
    "style": ("Describe only how this picture is made. First say which it is: a real photograph; a "
              "photorealistic CGI render; a designer's digital illustration painted in Photoshop (gradient fills, "
              "airbrushed shading, crisp outlines, simplified surfaces); a marker sketch; a pencil sketch; a "
              "watercolour; or other. Then the line work, the shading, the colour palette and gradients, the light "
              "and mood, and the background. Do not describe what is shown. One paragraph, at most 60 words."),
    "scene": ("This is a designer's sketch or render for a car (interior or exterior) or a product. Explain it "
              "to a 3D visualizer who will build a finished, photoreal CGI render from it. 1) What it is and the "
              "view. 2) What each drawn part IS and how it works, reading the designer's intent (for example: the "
              "wide blue band across the dashboard is a curved glass display; the shape in the middle is the "
              "centre console with a wireless charging tray; the yoke is the steering wheel; the grey area below is "
              "the carpeted floor). 3) The intended colour and material of each part, as drawn. 4) What a "
              "finished car would have here that the sketch only hints at (seats, door panels, glass, a closed "
              "cabin). 5) The setting or studio background. At most 110 words, plain sentences."),
    "edit": ("Here is a picture and a change someone wants: \"{req}\". Rewrite it as one complete instruction "
             "for an image-editing AI that does the change thoroughly and believably in THIS picture, the way a "
             "skilled retoucher would: name everything it implies here (for example: snow on the ground, on the "
             "roof, bonnet, tyres, tent and cooler; falling snow; overcast winter light; people dressed for the "
             "cold; a lit campfire with glow on nearby faces), and say what stays exactly the same (the main "
             "subject's design and colours, the people's poses, the camera). Plain sentences, at most 100 words, "
             "the instruction only."),
    "design": ("Describe the design in this picture in two short sentences, so someone could draw it again from "
               "another side: what it is; its proportions and "
               "silhouette; its key features (lights, grille, wheels, window line, seats, dashboard, surfaces, colours "
               "and materials). Facts only; do not say how it is drawn."),
    # Car-left/right was often mirrored (Nov 2026); which way the nose points in the picture is
    # read reliably, and the side follows from it (see studio.parse_view).
    "view": ("Look at this picture and answer in exactly this form, nothing else: "
             "kind=<exterior|interior|product>; nose=<left|right|toward|away>; end=<front|rear|none>; "
             "side=<front|front-right|right|rear-right|rear|rear-left|left|front-left>; height=<low|eye|high|top>. "
             "kind: a car seen from outside, a car's inside (cabin, dashboard, seats), or anything else. "
             "nose: which way the front of the car (or object) points in the picture: to the left edge of the "
             "picture, to the right edge, or (only when the front or the rear faces the camera straight on, with no side "
             "visible) toward the camera or away from it; in a three-quarter view the nose points left or right. end: which end we also see, its front "
             "end (headlights, grille), its rear end (tail lights), or none (a side view: the whole length of the car is seen and its ends only at a sharp angle; most side views are none). Answer front or rear only when that end's face is clearly turned toward the camera. side: for an "
             "interior, where the camera stands in the cabin (front = at the windscreen looking back, rear = behind "
             "the front seats looking forward, left or right = at that door; if the dashboard and windscreen are ahead of "
             "the camera, it is side=rear); otherwise your best guess. "
             "height: where the camera is."),
    "materials": ("Describe only the colours, materials and finishes in this picture, part by part (for "
                  "example the seats, dashboard, door panels, console, trims, floor), with precise words: the "
                  "colour, the material (leather, fabric, wood, metal, plastic…), its finish (matte, satin, "
                  "gloss, brushed) and any stitching or pattern. Do not describe shapes or the camera. At most "
                  "80 words."),
}


def folder(models_dir):
    return os.path.join(models_dir, "picture-reader")


def _server(models_dir):
    name = "llama-server.exe" if sys.platform == "win32" else "llama-server"
    for root, _d, files in os.walk(os.path.join(folder(models_dir), "llama")):
        if name in files:
            return os.path.join(root, name)
    return None


def installed(models_dir):
    if xl_installed(models_dir):
        return True
    f = folder(models_dir)
    return (os.path.isfile(os.path.join(f, MODEL)) and os.path.isfile(os.path.join(f, MMPROJ))
            and bool(_server(models_dir)))


def install(models_dir, download, on_progress, cancelled=lambda: False, xl=False):
    f = folder(models_dir)
    os.makedirs(f, exist_ok=True)
    if not _server(models_dir):
        # Its own, recent llama.cpp: reading pictures of this model needs a new one.
        rels = requests.get(RELEASES, timeout=30, headers={"Accept": "application/vnd.github+json"}).json()
        if isinstance(rels, dict):
            raise RuntimeError("couldn't ask GitHub for the picture reader's engine (%s)" % rels.get("message"))
        pat = (r"bin-macos-arm64\.(tar\.gz|zip)$" if sys.platform == "darwin" else r"bin-win-cpu-x64\.zip$")
        asset = next((a for rel in rels for a in rel.get("assets", []) if re.search(pat, a["name"])), None)
        if not asset:
            raise RuntimeError("couldn't find the picture reader's engine for this computer")
        z = os.path.join(f, asset["name"])
        download(asset["browser_download_url"], z, on_progress, "Picture reader engine", cancelled)
        dest = os.path.join(f, "llama")
        shutil.rmtree(dest, ignore_errors=True)
        os.makedirs(dest, exist_ok=True)
        if z.endswith(".zip"):
            with zipfile.ZipFile(z) as zz:
                zz.extractall(dest)
        else:
            import tarfile
            with tarfile.open(z) as t:
                t.extractall(dest)
        os.remove(z)
        if sys.platform != "win32":
            for root, _d, files in os.walk(dest):
                for n in files:
                    if n.startswith("llama-") or n.endswith(".dylib"):
                        os.chmod(os.path.join(root, n), 0o755)
            subprocess.run(["xattr", "-dr", "com.apple.quarantine", dest], capture_output=True)
    files = (((XL_MMPROJ, "Picture reader XL eyes"), (XL_MODEL, "Picture reader XL model")) if xl
             else ((MMPROJ, "Picture reader eyes"), (MODEL, "Picture reader model")))
    for name, label in files:
        p = os.path.join(f, name)
        if not os.path.isfile(p):
            download((XL_BASE if xl else BASE) + name, p, on_progress, label, cancelled)


def _jpeg(path):
    from PIL import Image
    im = Image.open(path)
    im = im.convert("RGB")
    im.thumbnail((SIDE, SIDE))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def clean(text):
    t = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    t = re.sub(r"\*\*|__|`|#+\s*", "", t)
    t = " ".join(t.split()).strip().strip('"').strip()
    return t


class Reader:
    def __init__(self, models_dir_fn):
        self.models_dir = models_dir_fn
        self.proc = None
        self._lock = threading.Lock()

    def _start(self):
        if self.proc and self.proc.poll() is None:
            if getattr(self, "which", None) == _files(self.models_dir())[0]:
                return
            self.stop()                           # the XL reader just arrived: switch to it
        md = self.models_dir()
        exe = _server(md)
        if not exe:
            raise RuntimeError("The picture reader isn't installed.")
        f = folder(md)
        threads = str(max(2, min(12, (os.cpu_count() or 4) - 2)))
        model, eyes = _files(md)
        self.which = model
        cmd = [exe, "-m", model, "--mmproj", eyes, "--port", str(PORT),
               "--host", "127.0.0.1", "-c", "4096", "--jinja", "-t", threads]
        flags = 0x08000000 if sys.platform == "win32" else 0
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     cwd=os.path.dirname(exe), creationflags=flags)
        deadline = time.time() + 120
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("The picture reader didn't start.")
            try:
                if requests.get("http://127.0.0.1:%d/health" % PORT, timeout=1).ok:
                    return
            except Exception:
                pass
            time.sleep(0.5)
        raise RuntimeError("The picture reader took too long to start.")

    def describe(self, path, use, req=""):
        ask = ASK.get(use)
        if ask and "{req}" in ask:
            ask = ask.replace("{req}", " ".join((req or "").split())[:400].replace('"', "'"))
        if not ask:
            return ""
        with self._lock:
            self._start()
            body = {"messages": [{"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": _jpeg(path)}},
                        {"type": "text", "text": ask}]}],
                    "max_tokens": 200, "temperature": 0.2,
                    "cache_prompt": False}           # every picture read fresh (a cached one answered for the last)
            s = requests.Session()
            s.trust_env = False
            r = s.post("http://127.0.0.1:%d/v1/chat/completions" % PORT, json=body, timeout=300)
            r.raise_for_status()
            return clean(r.json()["choices"][0]["message"]["content"])

    def stop(self):
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            p.kill()
