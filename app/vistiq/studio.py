"""Vistiq Studio: image generation next to the upscaler.

Create   one image (render or sketch) + a prompt -> changed light, CMF, style
Reference  your design + a reference image -> its camera view, CMF or style
Juice    an optional second pass that adds atmosphere (Flux.1 + a LoRA)

It runs on a second private ComfyUI (the image engine), pinned to the build
the person's own Klein workflow runs on. The upscaler keeps its own engine and
version; only one of them holds the graphics card at a time.

Model files live in the Vistiq Studio folder (Documents\\Vistiq Studio\\Models).
Files that need a Hugging Face login (FLUX.2 Klein 9B) or come from elsewhere
(LoRAs) are taken from a ComfyUI models folder the person already has: linked,
not copied, when it is on the same drive.
"""
import json
import logging
import os
import random
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid

import requests

from . import engine_setup
from .engine import CREATE_NO_WINDOW, BELOW_NORMAL_PRIORITY_CLASS, _local, _kill_tree, _pid_on_port, _port_free


def _own_pid_on_port(port):
    """The process on a port, only if it is the image engine (its program
    lives in the image engine's folder). Anything else is left alone."""
    pid = _pid_on_port(port)
    if not pid:
        return None
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                              "(Get-Process -Id %d).Path" % pid], capture_output=True, text=True,
                             timeout=15, creationflags=CREATE_NO_WINDOW).stdout
    except Exception:
        return None
    path = os.path.normcase(os.path.normpath(out.strip()))
    home = os.path.normcase(os.path.normpath(engine_dir()))
    return pid if path and path.startswith(home + os.sep) else None

log = logging.getLogger("vistiq")

PORTABLE_VERSION = "v0.44.0"
PORTABLE = ("https://github.com/comfyanonymous/ComfyUI/releases/download/%s/"
            "ComfyUI_windows_portable_nvidia.7z" % PORTABLE_VERSION)
PORT = 8392


# -- folders ------------------------------------------------------------

def _documents():
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    return docs if os.path.isdir(docs) else os.path.expanduser("~")


def home(settings=None):
    chosen = (settings.get("studio_home") if settings else "") or ""
    return chosen or os.path.join(_documents(), "Vistiq Studio")


def outputs_dir(settings=None):
    return os.path.join(home(settings), "Outputs")


def models_dir(settings=None):
    return os.path.join(home(settings), "Models")


def engine_dir():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "VistiqStudio", "engine")


def portable_dir():
    return os.path.join(engine_dir(), "ComfyUI_windows_portable")


SUBFOLDERS = ("diffusion_models", "text_encoders", "vae", "loras", "controlnet")


# -- the model files ------------------------------------------------------

HF = "https://huggingface.co/%s/resolve/main/%s"

#: What each part needs. `names` are accepted file names, best first; `url` a
#: download that needs no login (None: take it from a ComfyUI folder, or the
#: page says how to get it).
FILES = [
    {"key": "klein", "part": "create", "folder": "diffusion_models", "label": "FLUX.2 Klein 9B",
     "names": ["flux-2-klein-9b-fp8mixed.safetensors", "flux-2-klein-9b-fp8.safetensors",
               "flux-2-klein-9b.safetensors"],
     "gb": 9.4, "url": None, "page": "https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8",
     "about": "The image model. Needs a free Hugging Face account to download."},
    {"key": "qwen", "part": "create", "folder": "text_encoders", "label": "Qwen 3 8B text encoder",
     "names": ["qwen_3_8b_fp8mixed.safetensors", "qwen_3_8b.safetensors"], "gb": 8.7,
     "url": HF % ("Comfy-Org/flux2-klein-9B", "split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-klein-9B", "about": "Reads your prompt."},
    {"key": "vae2", "part": "create", "folder": "vae", "label": "FLUX.2 VAE",
     "names": ["flux2-vae.safetensors"], "gb": 0.34,
     "url": HF % ("Comfy-Org/flux2-dev", "split_files/vae/flux2-vae.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-dev", "about": "Turns pictures into the model's format and back."},
    {"key": "consistency", "part": "create", "folder": "loras", "label": "Klein-consistency",
     "names": ["Klein-consistency.safetensors"], "gb": 0.33, "url": None, "page": "",
     "optional": True, "about": "Keeps your design when Keep my design is up."},
    {"key": "flux1", "part": "juice", "folder": "diffusion_models", "label": "Flux.1 dev",
     "names": ["flux1-dev-fp8.safetensors", "flux1-dev.safetensors"], "gb": 23.8, "url": None,
     "page": "https://huggingface.co/black-forest-labs/FLUX.1-dev",
     "about": "Adds atmosphere in the Juice pass. Needs a free Hugging Face account."},
    {"key": "t5", "part": "juice", "folder": "text_encoders", "label": "T5 text encoder",
     "names": ["t5xxl_fp8_e4m3fn.safetensors", "t5xxl_fp8_e4m3fn_scaled.safetensors", "t5xxl_fp16.safetensors"],
     "gb": 4.9, "url": HF % ("comfyanonymous/flux_text_encoders", "t5xxl_fp8_e4m3fn.safetensors"),
     "page": "https://huggingface.co/comfyanonymous/flux_text_encoders", "about": "Reads the prompt for Flux.1."},
    {"key": "clipl", "part": "juice", "folder": "text_encoders", "label": "CLIP-L text encoder",
     "names": ["clip_l.safetensors"], "gb": 0.25,
     "url": HF % ("comfyanonymous/flux_text_encoders", "clip_l.safetensors"),
     "page": "https://huggingface.co/comfyanonymous/flux_text_encoders", "about": "Reads the prompt for Flux.1."},
    {"key": "vae1", "part": "juice", "folder": "vae", "label": "Flux.1 VAE",
     "names": ["ae.safetensors", "flux1-vae.safetensors"], "gb": 0.34,
     "url": HF % ("Comfy-Org/Lumina_Image_2.0_Repackaged", "split_files/vae/ae.safetensors"),
     "page": "https://huggingface.co/black-forest-labs/FLUX.1-dev", "about": "Flux.1's picture format."},
]


def find(key, settings=None):
    """Path of a model file in the Studio folder, or None."""
    spec = next(f for f in FILES if f["key"] == key)
    folder = os.path.join(models_dir(settings), spec["folder"])
    for n in spec["names"]:
        p = os.path.join(folder, n)
        if os.path.isfile(p):
            return p
    return None


def loras(settings=None):
    """LoRA files in the Studio folder, with the model family each was made
    for (read from the file itself)."""
    folder = os.path.join(models_dir(settings), "loras")
    out = []
    if os.path.isdir(folder):
        for n in sorted(os.listdir(folder)):
            if n.endswith(".safetensors"):
                p = os.path.join(folder, n)
                out.append({"name": n, "family": lora_family(p),
                            "gb": round(os.path.getsize(p) / 1e9, 2)})
    return out


def lora_family(path):
    """'klein9b', 'klein4b', 'flux1', 'sdxl', 'sd15' or 'unknown', from the
    LoRA's own layout: names and sizes of the layers it changes."""
    try:
        with open(path, "rb") as fh:
            n = struct.unpack("<Q", fh.read(8))[0]
            if n > 50_000_000:
                return "unknown"
            head = json.loads(fh.read(n))
    except Exception:
        return "unknown"
    head.pop("__metadata__", None)
    keys = list(head)
    joined = " ".join(keys[:4000])
    flux_like = any(t in joined for t in ("double_blocks", "single_blocks", "single_transformer_blocks",
                                              "transformer_blocks"))
    if not flux_like and ("input_blocks" in joined or "down_blocks" in joined or "lora_te" in joined):
        dims = {v["shape"][-1] for k, v in head.items() if "attn2" in k and ("down" in k or "lora_A" in k)}
        return "sdxl" if 2048 in dims else "sd15"
    hidden = 0
    for k in keys:
        if ("lora_down" in k or "lora_A" in k) and ("attn" in k or "qkv" in k):
            hidden = head[k]["shape"][-1]
            break
    double = {int(m.group(1)) for k in keys for m in [re.search(r"(?:double_blocks|transformer\.transformer_blocks)[._](\d+)[._]", k)] if m}
    if hidden == 4096:
        return "klein9b"
    if hidden == 3072 and len(double) >= 15:
        return "flux1"
    if hidden == 3072 and 0 < len(double) <= 8:
        return "klein4b"
    if hidden == 3072:
        return "flux1"
    return "unknown"


FAMILY_LABEL = {"klein9b": "FLUX.2 Klein 9B", "klein4b": "FLUX.2 Klein 4B", "flux1": "Flux.1",
                "sdxl": "SDXL", "sd15": "SD 1.5", "unknown": "unknown model"}


def status(settings=None):
    rows = []
    for f in FILES:
        p = find(f["key"], settings)
        rows.append({"key": f["key"], "part": f["part"], "label": f["label"], "about": f["about"],
                     "gb": round(os.path.getsize(p) / 1e9, 1) if p else f["gb"],
                     "ready": bool(p), "file": os.path.basename(p) if p else f["names"][0],
                     "can_download": bool(f["url"]), "page": f["page"], "optional": f.get("optional", False)})
    create_ok = all(r["ready"] for r in rows if r["part"] == "create" and not r["optional"])
    juice_ok = all(r["ready"] for r in rows if r["part"] == "juice")
    return {"files": rows, "create_ready": create_ok, "juice_ready": juice_ok,
            "engine_installed": engine_installed(), "loras": loras(settings),
            "home": home(settings), "comfy_models": guess_comfy_models(settings)}


# -- taking files from an existing ComfyUI ------------------------------------

def guess_comfy_models(settings=None):
    """A ComfyUI models folder on this PC, if one is easy to find."""
    chosen = (settings.get("comfy_models") if settings else "") or ""
    if chosen and os.path.isdir(chosen):
        return chosen
    user = os.path.expanduser("~")
    cands = [os.path.join(user, "Downloads", "ComfyUI-Easy-Install", "ComfyUI-Easy-Install", "ComfyUI", "models"),
             os.path.join(user, "Documents", "ComfyUI", "models"),
             os.path.join(user, "ComfyUI", "models")]
    for drive in ("C:\\", "D:\\", "E:\\"):
        cands += [os.path.join(drive, "ComfyUI_windows_portable", "ComfyUI", "models"),
                  os.path.join(drive, "ComfyUI", "models")]
    for c in cands:
        if os.path.isdir(os.path.join(c, "diffusion_models")) or os.path.isdir(os.path.join(c, "loras")):
            return c
    return ""


def import_from(folder, settings=None, on_progress=None):
    """Bring every known model file, and every LoRA, from a ComfyUI models
    folder (or any folder) into the Studio folder. Hard links where possible
    (instant, no extra space), copies otherwise. Returns the names taken."""
    if os.path.basename(folder.rstrip("\\/")).lower() != "models" and os.path.isdir(os.path.join(folder, "models")):
        folder = os.path.join(folder, "models")
    wanted = {}
    for f in FILES:
        for n in f["names"]:
            wanted[n.lower()] = f["folder"]
    found = []
    for root, _dirs, files in os.walk(folder):
        if root[len(folder):].count(os.sep) > 3:
            continue
        for n in files:
            low = n.lower()
            sub = wanted.get(low)
            if not sub and low.endswith(".safetensors") and os.path.basename(root).lower() == "loras":
                sub = "loras"
            if sub:
                found.append((os.path.join(root, n), sub, n))
    taken = []
    for i, (src, sub, n) in enumerate(found):
        dst_dir = os.path.join(models_dir(settings), sub)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, n)
        if os.path.isfile(dst) and os.path.getsize(dst) == os.path.getsize(src):
            continue
        if on_progress:
            on_progress("Taking %s" % n, i / max(1, len(found)))
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
        taken.append(n)
    if settings is not None and found:
        settings.set("comfy_models", folder)
    return taken


# -- the image engine ---------------------------------------------------------

def _marker():
    return os.path.join(engine_dir(), "installed.txt")


def engine_installed():
    try:
        with open(_marker(), encoding="utf-8") as fh:
            return fh.read().strip() == PORTABLE_VERSION and os.path.isdir(portable_dir())
    except OSError:
        return False


def write_model_paths(settings=None):
    comfy = os.path.join(portable_dir(), "ComfyUI")
    if not os.path.isdir(comfy):
        return
    base = models_dir(settings).replace("\\", "/")
    lines = ["vistiq_studio:", "    base_path: %s" % json.dumps(base)]
    lines += ["    %s: %s" % (s, s) for s in SUBFOLDERS]
    with open(os.path.join(comfy, "extra_model_paths.yaml"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def download(url, path, on_progress=None, label="", cancelled=lambda: False):
    """Resumable download to `path`."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part = path + ".part"
    have = os.path.getsize(part) if os.path.isfile(part) else 0
    headers = {"User-Agent": "VistiqStudio"}
    if have:
        headers["Range"] = "bytes=%d-" % have
    with requests.get(url, headers=headers, stream=True, timeout=60, allow_redirects=True) as r:
        if r.status_code in (401, 403):
            raise RuntimeError("this file needs a Hugging Face login; download it from its page and "
                               "use “Take files from a folder”")
        if r.status_code == 416:
            have = 0
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0) + (have if r.status_code == 206 else 0)
        mode = "ab" if r.status_code == 206 else "wb"
        done = have if r.status_code == 206 else 0
        last = 0
        with open(part, mode) as fh:
            for chunk in r.iter_content(4 << 20):
                if cancelled():
                    raise RuntimeError("cancelled")
                fh.write(chunk)
                done += len(chunk)
                if on_progress and time.time() - last > 0.4:
                    last = time.time()
                    on_progress("%s: %.1f of %.1f GB" % (label, done / 1e9, total / 1e9) if total else label,
                                done / total if total else None)
    os.replace(part, path)


def install_engine(settings, on_progress, cancelled=lambda: False):
    """Download and unpack the image engine (about 2 GB, once)."""
    os.makedirs(engine_dir(), exist_ok=True)
    seven = os.path.join(engine_setup.home(), "7zr.exe")
    if not os.path.isfile(seven):
        seven = os.path.join(engine_dir(), "7zr.exe")
        if not os.path.isfile(seven):
            download(engine_setup.SEVEN_ZIP, seven, on_progress, "Unpacker", cancelled)
    archive = os.path.join(engine_dir(), "comfyui_%s.7z" % PORTABLE_VERSION)
    if not os.path.isfile(archive):
        download(PORTABLE, archive, on_progress, "Image engine", cancelled)
    on_progress("Unpacking the image engine", None)
    shutil.rmtree(portable_dir(), ignore_errors=True)
    subprocess.run([seven, "x", archive, "-o" + engine_dir(), "-y", "-bso0", "-bsp0"], check=True,
                   creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    try:
        os.remove(archive)
    except OSError:
        pass
    write_model_paths(settings)
    with open(_marker(), "w", encoding="utf-8") as fh:
        fh.write(PORTABLE_VERSION)


class ImageEngine:
    """Vistiq Studio's second, private ComfyUI."""

    def __init__(self, settings, log_dir):
        self.settings = settings
        self.log_dir = log_dir
        self.url = None
        self.process = None
        self.state = "idle"
        self.message = ""
        self.client_id = uuid.uuid4().hex
        self._lock = threading.Lock()

    def alive(self):
        if not self.url:
            return False
        try:
            return _local.get(self.url + "/system_stats", timeout=2).ok
        except Exception:
            return False

    def start(self, say=lambda s, m="": None):
        with self._lock:
            if self.alive():
                return True
            if not engine_installed():
                self.state, self.message = "setup", "The image engine isn't set up yet."
                say(self.state, self.message)
                return False
            write_model_paths(self.settings)
            port = int(self.settings.get("studio_port") or 0)
            if port and (sys.platform != "win32" or _own_pid_on_port(port)):
                url = "http://127.0.0.1:%d" % port
                try:
                    if _local.get(url + "/system_stats", timeout=2).ok:
                        self.url = url
                        self.state, self.message = "ready", "Image engine ready"
                        say(self.state, self.message)
                        return True
                except Exception:
                    pass
            port = PORT
            while not _port_free(port) and port < PORT + 20:
                port += 1
            py = os.path.join(portable_dir(), "python_embeded", "python.exe")
            main = os.path.join(portable_dir(), "ComfyUI", "main.py")
            cmd = [py, "-s", main, "--windows-standalone-build", "--port", str(port),
                   "--disable-auto-launch"]
            os.makedirs(self.log_dir, exist_ok=True)
            logf = open(os.path.join(self.log_dir, "image-engine.log"), "ab")
            env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", PYTHONUNBUFFERED="1")
            self.state, self.message = "starting", "Starting the image engine"
            say(self.state, self.message)
            flags = (CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS) if sys.platform == "win32" else 0
            self.process = subprocess.Popen(cmd, cwd=portable_dir(), env=env, stdout=logf,
                                            stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                            creationflags=flags)
            url = "http://127.0.0.1:%d" % port
            deadline = time.time() + 300
            while time.time() < deadline:
                if self.process.poll() is not None:
                    self.state, self.message = "error", "The image engine stopped while starting (image-engine.log)."
                    say(self.state, self.message)
                    return False
                try:
                    if _local.get(url + "/system_stats", timeout=1).ok:
                        self.url = url
                        self.settings.set("studio_port", port)
                        self.state, self.message = "ready", "Image engine ready"
                        say(self.state, self.message)
                        return True
                except Exception:
                    pass
                time.sleep(0.7)
            self.state, self.message = "error", "The image engine took too long to start."
            say(self.state, self.message)
            return False

    def stop(self):
        port = int(self.settings.get("studio_port") or 0)
        if self.process and self.process.poll() is None:
            _kill_tree(self.process.pid)
        elif port:
            pid = _own_pid_on_port(port)
            if pid:
                _kill_tree(pid)
        self.process, self.url = None, None
        self.settings.set("studio_port", 0)
        self.state, self.message = "idle", "Image engine stopped"

    def free(self):
        """Let go of the graphics card, so the upscaler can have it."""
        if self.url:
            try:
                _local.post(self.url + "/free", json={"unload_models": True, "free_memory": True}, timeout=10)
            except Exception:
                pass

    def interrupt(self):
        if self.url:
            try:
                _local.post(self.url + "/queue", json={"clear": True}, timeout=5)
                _local.post(self.url + "/interrupt", timeout=5)
            except Exception:
                pass

    def upload(self, path):
        with open(path, "rb") as fh:
            r = _local.post(self.url + "/upload/image",
                            files={"image": ("vs_%s_%s" % (uuid.uuid4().hex[:6], os.path.basename(path)[-60:]), fh,
                                             "application/octet-stream")},
                            data={"overwrite": "true", "type": "input"}, timeout=120)
        r.raise_for_status()
        d = r.json()
        return (d["subfolder"] + "/" if d.get("subfolder") else "") + d["name"]

    def run(self, prompt, on_progress=None, cancelled=lambda: False):
        """Queue a prompt, wait for it, return the bytes of its saved image."""
        import websocket
        ws = None
        try:
            ws = websocket.create_connection(self.url.replace("http", "ws", 1) + "/ws?clientId=" + self.client_id,
                                             timeout=2)
            ws.settimeout(0.5)
        except Exception:
            ws = None
        r = _local.post(self.url + "/prompt", json={"prompt": prompt, "client_id": self.client_id}, timeout=30)
        if not r.ok:
            raise RuntimeError(_error_text(r))
        pid = r.json()["prompt_id"]
        try:
            while True:
                if cancelled():
                    self.interrupt()
                    raise RuntimeError("Cancelled")
                msg = None
                if ws:
                    try:
                        raw = ws.recv()
                        msg = json.loads(raw) if isinstance(raw, str) else None
                    except Exception:
                        msg = None
                else:
                    time.sleep(0.5)
                if msg:
                    t, d = msg.get("type"), msg.get("data") or {}
                    if t == "progress" and d.get("prompt_id") in (None, pid) and on_progress:
                        on_progress(d.get("value", 0) / max(1, d.get("max", 1)))
                    elif t == "execution_error" and d.get("prompt_id") == pid:
                        raise RuntimeError(_short(d.get("exception_message") or "The image engine failed."))
                    elif t == "executing" and d.get("prompt_id") == pid and d.get("node") is None:
                        break
                h = _local.get(self.url + "/history/" + pid, timeout=5).json().get(pid)
                if h and (h.get("status") or {}).get("completed"):
                    break
                if h and (h.get("status") or {}).get("status_str") == "error":
                    msgs = (h.get("status") or {}).get("messages") or []
                    err = next((m[1].get("exception_message") for m in msgs if m[0] == "execution_error"), None)
                    raise RuntimeError(_short(err or "The image engine failed."))
        finally:
            if ws:
                try:
                    ws.close()
                except Exception:
                    pass
        for _ in range(20):
            h = _local.get(self.url + "/history/" + pid, timeout=5).json().get(pid) or {}
            for out in (h.get("outputs") or {}).values():
                for im in out.get("images") or []:
                    if im.get("type") == "output":
                        v = _local.get(self.url + "/view", params={"filename": im["filename"],
                                                                     "subfolder": im.get("subfolder", ""),
                                                                     "type": "output"}, timeout=120)
                        v.raise_for_status()
                        return v.content
            time.sleep(0.5)
        raise RuntimeError("The image engine finished but no image came back.")


def _short(text):
    text = (text or "").strip().splitlines()[0] if text else ""
    if "out of memory" in text.lower() or "allocation on device" in text.lower():
        return "The graphics card ran out of memory. Try a smaller working size."
    return text[:300]


def _error_text(r):
    try:
        d = r.json()
        e = d.get("error") or {}
        details = []
        for nid, ne in (d.get("node_errors") or {}).items():
            for x in ne.get("errors", []):
                details.append("%s: %s" % (x.get("message"), x.get("details")))
        return "The image engine refused the job: %s %s" % (e.get("message", ""), "; ".join(details)[:400])
    except Exception:
        return "The image engine refused the job (%s)." % r.status_code


# -- the workflows -----------------------------------------------------------------

#: The text behind each preset button. The person's own prompt is added after.
PRESETS = {
    "sketch": ("Turn this sketch into a photorealistic automotive interior photograph. Keep every line, "
               "proportion, part and the camera view exactly as drawn. Realistic materials, natural daylight."),
    "lighting": ("Refine only the lighting of this automotive interior render: soft natural daylight through the "
                 "windows, balanced exposure, gentle fill in dark areas, soft realistic shadows, controlled "
                 "highlights. Do not change any design, geometry, material or colour."),
    "cmf": ("Change only the colours, materials and finishes of this automotive interior as described. Keep the "
            "design, geometry, proportions, parts, lighting and camera view exactly the same."),
    "style": ("Restyle this automotive interior image as described, keeping the design, geometry and camera "
              "view exactly the same."),
    "design": ("Change the design of this automotive interior as described, keeping the camera view, lighting "
               "and everything not mentioned the same."),
    "photo": ("Make this automotive interior render look like a real professional automotive photograph: "
              "realistic leather grain, stitching, perforation, satin metal, soft-touch plastics, accurate "
              "reflections and natural light. Do not change the design."),
}

REF_PRESETS = {
    "camera": ("Show the automotive interior from image 1 from exactly the same camera position, angle and "
               "field of view as image 2. The steering wheel, seats and console must line up with image 2. "
               "Keep the design, materials and colours of image 1."),
    "cmf": ("Apply the colours, materials and finishes of the interior in image 2 to the interior in image 1. "
            "Keep the design, geometry, camera view and lighting of image 1 exactly."),
    "style": ("Give the interior in image 1 the visual style, mood and lighting of image 2. Keep the design, "
              "geometry and camera view of image 1 exactly."),
}


def _klein_base(settings, keep):
    s = settings
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("klein", s)),
                                                       "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(find("qwen", s)),
                                                       "type": "flux2"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("vae2", s))}},
    }
    model = ["1", 0]
    lora = find("consistency", s)
    if lora and keep > 0:
        p["4"] = {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"model": ["1", 0], "lora_name": os.path.basename(lora),
                             "strength_model": round(float(keep), 2)}}
        model = ["4", 0]
    return p, model


def create_prompt(settings, image, text, keep=0.8, megapixels=2.0, seed=None, steps=4):
    """Klein edit of one image (render or sketch)."""
    p, model = _klein_base(settings, keep)
    p.update({
        "10": {"class_type": "LoadImage", "inputs": {"image": image}},
        "11": {"class_type": "ImageScaleToTotalPixels",
               "inputs": {"image": ["10", 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                          "resolution_steps": 16}},
        "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}},
        "20": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "21": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["20", 0], "latent": ["12", 0]}},
        "22": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["21", 0], "guidance": 3.5}},
        "23": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["20", 0]}},
        "30": {"class_type": "GetImageSize", "inputs": {"image": ["11", 0]}},
        "31": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": ["30", 0], "height": ["30", 1],
                                                                  "batch_size": 1}},
        "40": {"class_type": "KSampler",
               "inputs": {"model": model, "positive": ["22", 0], "negative": ["23", 0], "latent_image": ["31", 0],
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)), "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudio"}},
    })
    return p


def reference_prompt(settings, design, reference, text, mode="camera", keep=0.8, megapixels=2.0,
                     seed=None, steps=4):
    """Klein with two reference images: image 1 your design, image 2 the reference."""
    p = create_prompt(settings, design, text, keep, megapixels, seed, steps)
    p.update({
        "13": {"class_type": "LoadImage", "inputs": {"image": reference}},
        "14": {"class_type": "ImageScaleToTotalPixels",
               "inputs": {"image": ["13", 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                          "resolution_steps": 16}},
        "15": {"class_type": "VAEEncode", "inputs": {"pixels": ["14", 0], "vae": ["3", 0]}},
        "24": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["21", 0], "latent": ["15", 0]}},
    })
    p["22"]["inputs"]["conditioning"] = ["24", 0]
    if mode == "camera":
        # The result takes the reference's frame.
        p["30"]["inputs"]["image"] = ["14", 0]
    return p


def juice_prompt(settings, image, text, lora, strength=0.8, denoise=0.35, megapixels=2.0, seed=None, steps=20):
    """A light Flux.1 pass with a style LoRA: adds atmosphere and material
    richness. `denoise` is how much it may repaint; kept low so the design
    stays."""
    s = settings
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("flux1", s)),
                                                       "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": os.path.basename(find("t5", s)),
                                                           "clip_name2": os.path.basename(find("clipl", s)),
                                                           "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("vae1", s))}},
        "4": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": lora,
                                                                "strength_model": round(float(strength), 2)}},
        "10": {"class_type": "LoadImage", "inputs": {"image": image}},
        "11": {"class_type": "ImageScaleToTotalPixels",
               "inputs": {"image": ["10", 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                          "resolution_steps": 16}},
        "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}},
        "20": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "21": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["20", 0], "guidance": 3.5}},
        "22": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["20", 0]}},
        "40": {"class_type": "KSampler",
               "inputs": {"model": ["4", 0], "positive": ["21", 0], "negative": ["22", 0], "latent_image": ["12", 0],
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)), "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": float(denoise)}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudioJuice"}},
    }
    return p


def build_text(preset, text, presets=PRESETS):
    base = presets.get(preset, "")
    text = (text or "").strip()
    if base and text:
        return base + "\n\n" + text
    return base or text or "Photorealistic automotive interior photograph."
