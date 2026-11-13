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
    {"key": "klein", "part": "create", "tier": "best", "folder": "diffusion_models", "label": "Image model",
     "names": ["flux-2-klein-9b-fp8mixed.safetensors", "flux-2-klein-9b-fp8.safetensors",
               "flux-2-klein-9b.safetensors"],
     "gb": 9.4, "url": None, "page": "https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8",
     "about": "Makes the images. Its maker asks for a free sign-in to download it."},
    {"key": "qwen", "part": "create", "tier": "best", "folder": "text_encoders", "label": "Prompt reader",
     "names": ["qwen_3_8b_fp8mixed.safetensors", "qwen_3_8b.safetensors"], "gb": 8.7,
     "url": HF % ("Comfy-Org/flux2-klein-9B", "split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-klein-9B", "about": "Understands what you type."},
    {"key": "vae2", "part": "create", "folder": "vae", "label": "Image decoder",
     "names": ["flux2-vae.safetensors"], "gb": 0.34,
     "url": HF % ("Comfy-Org/flux2-dev", "split_files/vae/flux2-vae.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-dev", "about": "Turns the model's work into a picture."},
    {"key": "consistency", "part": "create", "tier": "best", "folder": "loras", "label": "Design lock",
     "names": ["Klein-consistency.safetensors"], "gb": 0.33, "url": None, "page": "",
     "optional": True, "about": "Holds your design in place (Keep my design)."},
    {"key": "klein4b", "part": "create", "tier": "good", "folder": "diffusion_models", "label": "Image model",
     "names": ["flux-2-klein-4b-fp8.safetensors", "flux-2-klein-4b.safetensors"], "gb": 4.0,
     "url": HF % ("black-forest-labs/FLUX.2-klein-4b-fp8", "flux-2-klein-4b-fp8.safetensors"),
     "page": "https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8", "about": "Makes the images."},
    {"key": "qwen4b", "part": "create", "tier": "good", "folder": "text_encoders", "label": "Prompt reader",
     "names": ["qwen_3_4b.safetensors", "qwen_3_4b_fp8_mixed.safetensors"], "gb": 8.0,
     "url": HF % ("Comfy-Org/flux2-klein-4B", "split_files/text_encoders/qwen_3_4b.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-klein-4B", "about": "Understands what you type."},
    {"key": "flux1", "part": "juice", "folder": "diffusion_models", "label": "Finishing model",
     "names": ["flux1-dev-fp8.safetensors", "flux1-dev.safetensors"], "gb": 23.8, "url": None,
     "page": "https://huggingface.co/black-forest-labs/FLUX.1-dev",
     "about": "Adds atmosphere in the finishing pass."},
    {"key": "t5", "part": "juice", "folder": "text_encoders", "label": "Finishing prompt reader",
     "names": ["t5xxl_fp8_e4m3fn.safetensors", "t5xxl_fp8_e4m3fn_scaled.safetensors", "t5xxl_fp16.safetensors"],
     "gb": 4.9, "url": HF % ("comfyanonymous/flux_text_encoders", "t5xxl_fp8_e4m3fn.safetensors"),
     "page": "https://huggingface.co/comfyanonymous/flux_text_encoders", "about": "Understands what you type, for the finishing pass."},
    {"key": "clipl", "part": "juice", "folder": "text_encoders", "label": "Finishing prompt reader 2",
     "names": ["clip_l.safetensors"], "gb": 0.25,
     "url": HF % ("comfyanonymous/flux_text_encoders", "clip_l.safetensors"),
     "page": "https://huggingface.co/comfyanonymous/flux_text_encoders", "about": "Understands what you type, for the finishing pass."},
    {"key": "vae1", "part": "juice", "folder": "vae", "label": "Finishing decoder",
     "names": ["ae.safetensors", "flux1-vae.safetensors"], "gb": 0.34,
     "url": HF % ("Comfy-Org/Lumina_Image_2.0_Repackaged", "split_files/vae/ae.safetensors"),
     "page": "https://huggingface.co/black-forest-labs/FLUX.1-dev", "about": "Turns the finishing pass's work into a picture."},
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
                # Studio's own helpers (design lock, speed-up) aren't styles to pick.
                builtin = any(n in f["names"] for f in FILES if f["folder"] == "loras") or n in RETIRED
                out.append({"name": n, "label": friendly_name(n), "family": lora_family(p),
                            "gb": round(os.path.getsize(p) / 1e9, 2), "builtin": builtin})
    return out


def friendly_name(file_name):
    """A LoRA's name for people: no extension, no version tags, no hashes."""
    stem = os.path.splitext(file_name)[0]
    if re.fullmatch(r"(?i)klein[-_ ]?consistency", stem):
        return "Design lock"
    if re.match(r"(?i)^(libenc|liblib)[-_]?[0-9a-f]{16,}$", stem) or re.fullmatch(r"[0-9a-f]{20,}", stem):
        return "Liblib style " + stem[-4:].upper()
    stem = re.sub(r"[_-]+", " ", stem)
    stem = re.sub(r"(?i)\b(v\d+(\.\d+)*|fp8|fp16|bf16|lora|safetensors|enhanced edition)\b", "", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .")
    return (stem[:1].upper() + stem[1:]) if stem else file_name


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
    meta = head.pop("__metadata__", None) or {}
    if meta.get("provider") == "liblib" or "liblibai_model_version_id" in meta:
        # Downloaded from Liblib in its locked form: the weights are scrambled and
        # only Liblib's own app can use them (anywhere else they give black pictures).
        return "locked"
    keys = list(head)
    joined = " ".join(keys[:4000])
    flux_like = any(t in joined for t in ("double_blocks", "single_blocks", "single_transformer_blocks",
                                              "transformer.transformer_blocks"))
    if not flux_like and ("input_blocks" in joined or "down_blocks" in joined or "lora_te" in joined):
        dims = {v["shape"][-1] for k, v in head.items() if "attn2" in k and ("down" in k or "lora_A" in k)}
        return "sdxl" if 2048 in dims else "sd15"
    hidden = 0
    for k in keys:
        if ("lora_down" in k or "lora_A" in k) and ("attn" in k or "qkv" in k) and "lora_te" not in k:
            hidden = head[k]["shape"][-1]
            break
    if not hidden and flux_like:
        for k in keys:
            if ("lora_down" in k or "lora_A" in k) and "lora_te" not in k and re.search(r"(single|double)_", k):
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


TIERS = {"best": "Best quality", "good": "Good quality"}
# Tested on real sketches on the user's PC (Nov 2026): without this wording the
# model tends to a flat, hazy look, and 6 steps are clearly crisper than 4.
CRISP = ("A professional photograph: crisp sharp focus, rich contrast, true-to-life colours, "
         "detailed real materials and textures, no haze.")
STEPS = 6
# Files from options that were tried and removed: never offered as styles.
RETIRED = ("Klein-9B-distill-speedup.safetensors",)


def in_tier(f, t):
    """Is file spec (or status row) `f` part of quality tier `t`? Shared files have no tier."""
    ft = f.get("tier")
    return ft is None or ft == t or (isinstance(ft, (tuple, list)) and t in ft)


def _have(key, settings):
    return bool(find(key, settings))


def tier(settings=None):
    """Which image model is used: 'best' (Klein 9B, needs a sign-in to get),
    'good' (Klein 4B, free download), or '' (not chosen yet). A choice whose
    files aren't all here falls back to the other one when that is."""
    def ready(t):
        return all(_have(f["key"], settings) for f in FILES
                   if f["part"] == "create" and in_tier(f, t) and not f.get("optional"))
    chosen = (settings.get("studio_tier") if settings else "") or ""
    if chosen in TIERS and ready(chosen):
        return chosen
    for t in ("best", "good"):
        if ready(t):
            return t
    return chosen if chosen in TIERS else ""


def _mac_status(settings):
    from . import macos
    md = models_dir(settings)
    parts = macos.parts(md)
    rows = [{"key": p["key"], "part": "create", "tier": "good", "label": p["label"], "about": p["about"],
             "gb": p["gb"], "ready": p["ready"], "file": "", "can_download": True, "page": "",
             "optional": False} for p in parts]
    ram = macos.ram_gb()
    gen = macos.can_generate(ram)
    ready = all(r["ready"] for r in rows) and gen
    return {"files": rows, "create_ready": ready, "juice_ready": False, "tier": "good", "chosen": "good",
            "tiers": {"best": {"label": "Best quality", "ready": False}, "good": {"label": "Good quality", "ready": ready}},
            "engine_installed": rows[0]["ready"], "loras": [], "select_ready": select_installed(settings),
            "helper_ready": helper_installed(settings),
            "home": home(settings), "comfy_models": "",
            "mac": {"chip": macos.chip(), "ram": ram, "can_generate": gen, "max_side": macos.max_side(ram), "work_side": macos.work_side(ram)}}


def status(settings=None):
    if sys.platform == "darwin":
        return _mac_status(settings)
    t = tier(settings)
    chosen = (settings.get("studio_tier") if settings else "") or ""
    chosen = chosen if chosen in TIERS else ""
    rows = []
    for f in FILES:
        p = find(f["key"], settings)
        rows.append({"key": f["key"], "part": f["part"], "tier": f.get("tier"), "label": f["label"],
                     "about": f["about"], "gb": round(os.path.getsize(p) / 1e9, 1) if p else f["gb"],
                     "ready": bool(p), "file": os.path.basename(p) if p else f["names"][0],
                     "can_download": bool(f["url"]), "page": f["page"], "optional": f.get("optional", False)})

    def ready(tt):
        return bool(tt) and all(r["ready"] for r in rows if r["part"] == "create" and in_tier(r, tt)
                                and not r["optional"])
    juice_ok = all(r["ready"] for r in rows if r["part"] == "juice")
    return {"files": rows, "create_ready": ready(t), "juice_ready": juice_ok, "tier": t, "chosen": chosen,
            "tiers": {k: {"label": v, "ready": ready(k)} for k, v in TIERS.items()},
            "engine_installed": engine_installed(), "loras": loras(settings),
            "select_ready": select_installed(settings), "helper_ready": helper_installed(settings),
            "home": home(settings), "comfy_models": guess_comfy_models(settings)}


def helper_installed(settings=None):
    from . import helper
    return helper.installed(models_dir(settings))


def select_installed(settings=None):
    from . import picker
    return picker.installed(models_dir(settings))


def install_select(settings, on_progress, cancelled=lambda: False):
    from . import picker
    picker.install(models_dir(settings), download, on_progress, cancelled)


def needed(settings, t):
    """The files a tier needs that can be downloaded and aren't here."""
    return [f for f in FILES if f["part"] == "create" and in_tier(f, t)
            and f["url"] and not _have(f["key"], settings)]


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
    for root, dirs, files in os.walk(folder):
        if root[len(folder):].count(os.sep) >= 3:
            dirs[:] = []
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
    if settings is not None and found and os.path.basename(folder.rstrip("\\/")).lower() == "models":
        settings.set("comfy_models", folder)
    return taken


# -- the image engine ---------------------------------------------------------

def _marker():
    return os.path.join(engine_dir(), "installed.txt")


def engine_installed():
    if sys.platform == "darwin":
        from . import macos
        return os.path.isfile(os.path.join(macos.env_dir(), "ready.txt"))
    return _comfy_installed()


def _comfy_installed():
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


def _hf_pick(repo):
    """The LoRA file of a Hugging Face repo whose file name isn't fixed: the
    rank-128 one if there are several, else the only .safetensors."""
    r = requests.get("https://huggingface.co/api/models/" + repo, timeout=30, headers={"User-Agent": "VistiqStudio"})
    r.raise_for_status()
    names = [x["rfilename"] for x in r.json().get("siblings", []) if x["rfilename"].endswith(".safetensors")]
    if not names:
        raise RuntimeError("no model file found in " + repo)
    pick = next((n for n in names if "128" in n), None) or sorted(names, key=len)[0]
    return HF % (repo, pick)


def download(url, path, on_progress=None, label="", cancelled=lambda: False):
    """Resumable download to `path`."""
    if url.startswith("hf:"):
        url = _hf_pick(url[3:])
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


def _preview_bytes(raw):
    """The picture in one of the engine's binary preview messages, or None.
    Type 1: 4 bytes type, 4 bytes format, then the image. Type 4 adds metadata."""
    if len(raw) < 12:
        return None
    kind = int.from_bytes(raw[:4], "big")
    if kind == 1:
        return bytes(raw[8:])
    if kind == 4:
        n = int.from_bytes(raw[4:8], "big")
        return bytes(raw[8 + n:]) if 8 + n < len(raw) else None
    return None


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

    def run(self, prompt, on_progress=None, cancelled=lambda: False, on_preview=None):
        """Queue a prompt, wait for it, return the bytes of its saved image.
        on_preview(jpeg_bytes) gets a small picture after each step ("watch it develop")."""
        import websocket
        ws = None
        try:
            ws = websocket.create_connection(self.url.replace("http", "ws", 1) + "/ws?clientId=" + self.client_id,
                                             timeout=2)
            ws.settimeout(0.5)
        except Exception:
            ws = None
        # latent2rgb: a quick colour preview after each step, no extra download (tested on ComfyUI 0.44).
        r = _local.post(self.url + "/prompt", json={"prompt": prompt, "client_id": self.client_id,
                                                    "extra_data": {"preview_method": "latent2rgb"}}, timeout=30)
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
                        if on_preview and isinstance(raw, (bytes, bytearray)):
                            pic = _preview_bytes(raw)
                            if pic:
                                on_preview(pic)
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
    "cmf": ("Image 1 is a line drawing of an automotive interior. Render it as a photorealistic photograph that "
            "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Dress every "
            "part in the colours, materials and finishes of the matching part in image 2: the seats like the "
            "seats of image 2, the dashboard like its dashboard, the door panels, console, trim and stitching "
            "the same. Natural daylight, realistic leather grain and reflections.\n"),
    "style": ("Image 1 is a line drawing of an automotive interior. Render it as a photorealistic photograph that "
              "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Give it "
              "the look of image 2: its colour palette, materials, lighting, mood and atmosphere.\n"),
}

# The wording used (any subject, not only car interiors).
GENERIC_PRESETS = {
    "sketch": ("Turn this sketch into a photorealistic photograph of the same subject. Keep every line, "
               "proportion, part and the camera view exactly as drawn. Realistic materials and natural light."),
    "lighting": ("Change only the lighting of this image. Keep every shape, material, colour and the camera "
                 "view exactly the same."),
    "cmf": ("Change only the colours, materials and finishes as described. Keep the design, shapes, "
            "proportions, lighting and camera view exactly the same."),
    "style": "Restyle this image as described, keeping the design and camera view exactly the same.",
    "design": "Change the design as described, keeping the camera view, lighting and everything else the same.",
    "photo": ("Make this image look like a real professional photograph: realistic materials, accurate "
              "reflections and natural light. Do not change the design."),
}

GENERIC_REF_PRESETS = {
    "camera": ("Show the subject of image 1 from exactly the same camera position, angle and "
               "field of view as image 2. Everything must line up with image 2. "
               "Keep the design, materials and colours of image 1."),
    # Short on purpose: the longer "dress every part…" wording copied the
    # wrong colours (brown seats from a white-seat reference) in engine tests.
    "cmf": ("Image 1 is a line drawing. Render it as a photorealistic photograph that "
            "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Give it "
            "the colours, materials and finishes of image 2: the same colour on the same kind of part.\n"),
    "style": ("Image 1 is a line drawing. Render it as a photorealistic photograph that "
              "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Give it "
              "the look of image 2: its colour palette, materials, lighting, mood and atmosphere.\n"),
}


def _klein_base(settings, keep):
    s = settings
    t = tier(s)
    best = t != "good"
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("klein" if best else "klein4b", s)),
                                                       "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(find("qwen" if best else "qwen4b", s)),
                                                       "type": "flux2"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("vae2", s))}},
    }
    model = ["1", 0]
    lora = find("consistency", s) if best else None      # the design lock is made for 9B only
    if lora and keep > 0:
        p["4"] = {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"model": model, "lora_name": os.path.basename(lora),
                             "strength_model": round(float(keep), 2)}}
        model = ["4", 0]
    return p, model


def create_prompt(settings, image, text, keep=0.8, megapixels=2.0, seed=None, steps=STEPS):
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
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)),
                          "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudio"}},
    })
    return p


def reference_prompt(settings, design, reference, text, mode="camera", keep=0.8, megapixels=2.0,
                     seed=None, steps=STEPS):
    """Klein with two reference images: image 1 your design, image 2 the reference."""
    # For CMF and style the design goes in as its lines only (edges of the
    # picture): the model then has to colour the lines from the reference,
    # instead of copying the design's own colours back, which the design
    # lock (trained to keep image 1) would otherwise do. The lock is off.
    lines = mode in ("cmf", "style")
    p = create_prompt(settings, design, text, 0 if lines else keep, megapixels, seed, steps)
    if lines:
        p["16"] = {"class_type": "Canny", "inputs": {"image": ["11", 0], "low_threshold": 0.15,
                                                       "high_threshold": 0.35}}
        p["17"] = {"class_type": "ImageInvert", "inputs": {"image": ["16", 0]}}
        p["12"]["inputs"]["pixels"] = ["17", 0]
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
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)),
                          "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": float(denoise)}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudioJuice"}},
    }
    return p


# Default light, so nobody has to describe it every time. The prompt decides
# which: an interior word gets the on-location interior press look, an
# exterior word the studio press look, anything else a neutral press look.
# Tuned on the engine against Pranay's benchmark pictures. Left out when the
# prompt sets its own time of day or mood ("ambient lighting" alone doesn't
# count: that's the LED strips).
# Day and night interiors, modelled on Pranay's theme renders (same cabin by
# day and by night): soft skylight that shapes every volume by day; by night
# the car's own lights lead and the rest falls into soft shadow.
LIGHT_INT = ("Photographed like a car maker's interior press photo on a bright overcast day: soft, even skylight "
             "floods in through the windows and glass roof from above and in front; the windows glow bright and "
             "softly white; every volume is modelled by smooth, gradual gradients, tops of surfaces lighter, "
             "undersides and recesses gently darker, with soft contact shadows where parts meet and no hard "
             "shadows; leather and satin surfaces show broad, soft highlights along their curves; ambient "
             "lighting strips are visible but subtle in daylight; colours clean and true to the materials. "
             "Airy, calm, high-key, ultra-clean.")
LIGHT_NIGHT = ("Photographed like a car maker's interior press photo at night: the cabin is lit mainly by its "
               "own lights. Glowing ambient light strips along the dashboard and doors cast soft coloured light "
               "onto the surfaces next to them, warm white footwell lights pool on the floor mats and the lower "
               "console, the screens glow; everything else falls off smoothly into deep, soft shadow; the "
               "windows and glass roof are dark, showing a night sky and distant city lights; light surfaces "
               "pick up gentle reflections of the ambient colour. Low-key, no harsh contrast, true material "
               "colours. Calm, premium, ultra-clean.")
# Interiors burnt with "rich contrast" in the closing line; they get a cleaner one.
CLEAN = "A professional photograph: crisp sharp focus, true-to-life colours, detailed real materials and textures."
LIGHT_EXT = ("Photographed like a car maker's press photo in a large minimalist photo studio: smooth light-grey "
             "back wall, dark grey concrete floor with a faint soft reflection under the car, one huge soft "
             "overhead light drawing a long smooth highlight along the roof and shoulder, the lower body "
             "falling gently into shadow, soft contact shadows under the tyres. Satin true-to-life paint, "
             "crisp panel gaps, real tyres; wheels exactly as drawn. Calm, clean, premium.")
LIGHT = ("Lit like a premium brand press photo: soft, wrapping daylight; exposure balanced so windows "
         "and bright areas keep their detail; glossy highlights rolling along chrome, glass and lacquered "
         "surfaces; soft sheen on leather and fabric; deeper shadows and a gentle vignette toward the edges "
         "that draw the eye to the centre. Calm, luxurious mood.")
OWN_LIGHT = ("night", "dusk", "dawn", "sunset", "sunrise", "evening", "golden hour", "blue hour",
             "neon", "moody", "overcast", "sunny", "studio light", "spotlight", "candle")
INTERIOR = ("interior", "cabin", "cockpit", "dashboard", "dash ", "seat", "steering", "console",
            "door panel", "headliner", "instrument panel")
EXTERIOR = ("exterior", "side view", "front view", "rear view", "3/4", "three-quarter", "bodywork",
            "body side", "wheels", "rims", "bumper", "headlight", "taillight", "supercar", "sports car",
            "coupe", "sedan", "suv", "hatchback", "roadster")


NIGHT = ("night", "evening", "after dark", "dark mode", "night mode")


def light_for(text):
    low = " " + (text or "").lower() + " "
    if any(w in low for w in NIGHT) and any(w in low for w in INTERIOR):
        return LIGHT_NIGHT                 # an interior at night: the car's own lights lead
    if any(w in low for w in OWN_LIGHT):
        return ""
    if any(w in low for w in INTERIOR):
        return LIGHT_INT
    if any(w in low for w in EXTERIOR):
        return LIGHT_EXT
    return LIGHT


def build_text(preset, text, presets=PRESETS):
    # Any subject: interiors, exteriors, boats, furniture, lamps… The button
    # only says what kind of change; the prompt says what it is.
    presets = GENERIC_REF_PRESETS if presets is REF_PRESETS else GENERIC_PRESETS
    base = presets.get(preset, "")
    text = (text or "").strip()
    out = (base + "\n\n" + text) if base and text else (base or text or "Photorealistic photograph.")
    # A style reference brings its own light; ours would fight it.
    light = "" if (presets is GENERIC_REF_PRESETS and preset == "style") else light_for(text)
    if light:
        out += "\n\n" + light
    return out + "\n\n" + (CLEAN if light in (LIGHT_INT, LIGHT_NIGHT) else CRISP)

