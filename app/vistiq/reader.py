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
    "style": ("Describe only how this picture is made, its rendering style: photograph, 3D render, marker "
              "sketch, pencil drawing, watercolour or other; the line work, the shading technique, the colour "
              "palette, how the background is treated and how realistic it is. Do not describe what is "
              "shown. One paragraph, at most 60 words."),
    "scene": ("Describe this picture for a photographer who will recreate it as a real photograph. Say what it "
              "is (for example a car interior, a car exterior, a product), then the colour and material look of "
              "each main part exactly as drawn (for example yellow seats, aubergine door panels, black dashboard, "
              "metal pedals), and the setting outside or behind it. Precise colour names. At most 80 words, "
              "plain sentences, no opinions."),
    "edit": ("Here is a picture and a change someone wants: \"{req}\". Write one clear instruction for an "
             "image-editing AI that carries out this change completely and believably in this picture: name "
             "everything the change implies here (for example ground, surfaces and objects covered in snow, what "
             "people wear, light and weather, fires lit, reflections), and say that the main subject's design and "
             "the camera stay the same. Plain sentences, at most 90 words, the instruction only."),
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
    f = folder(models_dir)
    return (os.path.isfile(os.path.join(f, MODEL)) and os.path.isfile(os.path.join(f, MMPROJ))
            and bool(_server(models_dir)))


def install(models_dir, download, on_progress, cancelled=lambda: False):
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
    for name, label in ((MMPROJ, "Picture reader eyes"), (MODEL, "Picture reader model")):
        p = os.path.join(f, name)
        if not os.path.isfile(p):
            download(BASE + name, p, on_progress, label, cancelled)


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
            return
        md = self.models_dir()
        exe = _server(md)
        if not exe:
            raise RuntimeError("The picture reader isn't installed.")
        f = folder(md)
        threads = str(max(2, min(12, (os.cpu_count() or 4) - 2)))
        cmd = [exe, "-m", os.path.join(f, MODEL), "--mmproj", os.path.join(f, MMPROJ), "--port", str(PORT),
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
