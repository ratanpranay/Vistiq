"""Vistiq's own engine: a private, portable ComfyUI set up on first run.

Everything lives in %LOCALAPPDATA%\\Vistiq\\engine and nothing outside it is
touched. Every step can be stopped and picked up again: downloads resume
from where they stopped, and a step that already finished is skipped.

Steps:
  1. 7-Zip's small extractor (7zr.exe)
  2. ComfyUI portable for NVIDIA (the official build)
  3. The upscaling nodes, pinned to the version the workflow was made with,
     plus the Python packages they need
  4. The model, and the VAE it pairs with
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile

import requests

from . import workflow as wf

CREATE_NO_WINDOW = 0x08000000

SEVEN_ZIP = "https://www.7-zip.org/a/7zr.exe"
PORTABLE = ("https://github.com/Comfy-Org/ComfyUI/releases/latest/download/"
            "ComfyUI_windows_portable_nvidia.7z")
NODES_COMMIT = "690cc39379c1481159ddd451368dbf2295930fc6"
NODES_ZIP = ("https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler/archive/%s.zip"
             % NODES_COMMIT)
NODES_DIR = "ComfyUI-SeedVR2_VideoUpscaler"
# torch and torchvision come with the portable build and must not be
# replaced; everything else the nodes ask for is installed.
NODE_PACKAGES = ["safetensors", "numpy", "tqdm", "psutil", "einops", "omegaconf>=2.3.0",
                 "diffusers>=0.33.1", "peft>=0.17.0", "rotary_embedding_torch>=0.5.3",
                 "opencv-python", "gguf", "matplotlib"]

HF = "https://huggingface.co/%s/resolve/main/%s"
VAE = ("numz/SeedVR2_comfyUI", "ema_vae_fp16.safetensors",
       "20678548f420d98d26f11442d3528f8b8c94e57ee046ef93dbb7633da8612ca1")

#: The models offered at setup, best first. `vram` is the graphics memory
#: (GB) below which a lighter choice is suggested instead.
MODELS = [
    {"key": "ultra-sharp", "name": "Vistiq Ultra Sharp", "repo": "numz/SeedVR2_comfyUI",
     "file": "seedvr2_ema_7b_sharp_fp16.safetensors", "vram": 16,
     "about": "Most detail, crispest edges.",
     "sha256": "20a93e01ff24beaeebc5de4e4e5be924359606c356c9c51509fba245bd2d77dd"},
    {"key": "ultra-sharp-lite", "name": "Vistiq Ultra Sharp Lite", "repo": "AInVFX/SeedVR2_comfyUI",
     "file": "seedvr2_ema_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors", "vram": 10,
     "about": "Nearly the same detail, half the download.",
     "sha256": "0d2c5b8be0fda94351149c5115da26aef4f4932a7a2a928c6f184dda9186e0be"},
    {"key": "swift", "name": "Vistiq Swift", "repo": "numz/SeedVR2_comfyUI",
     "file": "seedvr2_ema_3b_fp16.safetensors", "vram": 6,
     "about": "Faster, for smaller cards and big batches.",
     "sha256": "2fd0e03a3dad24e07086750360727ca437de4ecd456f769856e960ae93e2b304"},
]


class Cancelled(Exception):
    pass


class SetupError(Exception):
    pass


def home():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "Vistiq", "engine")


def portable_dir():
    return os.path.join(home(), "ComfyUI_windows_portable")


def models_dir():
    return os.path.join(portable_dir(), "ComfyUI", "models", "SEEDVR2")


def nodes_dir():
    return os.path.join(portable_dir(), "ComfyUI", "custom_nodes", NODES_DIR)


def _marker(name):
    return os.path.join(home(), name + ".done")


def _done(name):
    return os.path.isfile(_marker(name))


def _mark(name):
    os.makedirs(home(), exist_ok=True)
    with open(_marker(name), "w") as fh:
        fh.write(time.strftime("%Y-%m-%d %H:%M:%S"))


def local_models():
    """Model files present in Vistiq's engine."""
    folder = models_dir()
    if not os.path.isdir(folder):
        return []
    return sorted(f for f in os.listdir(folder)
                  if f.endswith((".safetensors", ".gguf")) and not f.endswith(".part"))


def installed():
    """The engine runs: ComfyUI, the nodes and at least one model."""
    return (_done("portable") and _done("nodes")
            and os.path.isfile(os.path.join(models_dir(), VAE[1]))
            and any(m != VAE[1] for m in local_models()))


def gpu():
    """(name, memory in GB) of the NVIDIA card, or (None, 0)."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10,
            creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0).stdout
        line = out.strip().splitlines()[0]
        name, mem = [p.strip() for p in line.split(",")]
        return name, round(int(mem) / 1024.0)
    except Exception:
        return None, 0


def suggested_model(vram):
    for m in MODELS:
        if vram >= m["vram"]:
            return m["key"]
    return MODELS[-1]["key"]


def model_by_key(key):
    for m in MODELS:
        if m["key"] == key:
            return m
    return MODELS[0]


def free_gb(path):
    probe = path
    while probe and not os.path.exists(probe):
        probe = os.path.dirname(probe)
    try:
        return shutil.disk_usage(probe or os.path.expanduser("~")).free / 1e9
    except Exception:
        return 0


def remote_size(url):
    try:
        r = requests.head(url, allow_redirects=True, timeout=15)
        size = r.headers.get("x-linked-size") or r.headers.get("content-length")
        return int(size) if size else 0
    except Exception:
        return 0


def sizes(model_key):
    """Download sizes in bytes for what setup still has to fetch."""
    m = model_by_key(model_key)
    out = {}
    if not _done("portable"):
        out["engine"] = remote_size(PORTABLE) or int(2.0e9)
    if not os.path.isfile(os.path.join(models_dir(), m["file"])):
        out["model"] = remote_size(HF % (m["repo"], m["file"]))
    if not os.path.isfile(os.path.join(models_dir(), VAE[1])):
        out["vae"] = remote_size(HF % (VAE[0], VAE[1]))
    return out


# -- the installer ------------------------------------------------------

class Installer:
    """Runs setup on a thread and reports progress as
    on_progress(step, label, fraction or None, detail)."""

    STEPS = [("check", "Checking this PC"), ("engine", "Downloading the engine"),
             ("unpack", "Unpacking the engine"), ("nodes", "Adding the upscaler"),
             ("model", "Downloading the model")]

    def __init__(self, model_key, on_progress, on_done):
        self.model = model_by_key(model_key)
        self.on_progress = on_progress
        self.on_done = on_done
        self._stop = threading.Event()
        self._proc = None
        self.thread = None

    def start(self):
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def cancel(self):
        self._stop.set()
        proc = self._proc
        if proc and proc.poll() is None:
            try:
                proc.kill()
            except Exception:
                pass

    def _say(self, step, fraction=None, detail=""):
        label = dict(self.STEPS)[step]
        self.on_progress(step, label, fraction, detail)

    def _check(self):
        if self._stop.is_set():
            raise Cancelled()

    def _run(self):
        try:
            os.makedirs(home(), exist_ok=True)
            self._say("check")
            if sys.platform != "win32":
                raise SetupError("The engine can only be set up on Windows.")
            name, _ = gpu()
            if not name:
                raise SetupError("No NVIDIA graphics card was found. Vistiq needs one "
                                 "to upscale, with an up-to-date driver.")
            need = sum(sizes(self.model["key"]).values()) / 1e9 * 2.2 + 1
            if free_gb(home()) < need:
                raise SetupError("Not enough free space: setup needs about %d GB on "
                                 "drive %s." % (round(need), os.path.splitdrive(home())[0] or "C:"))
            self._portable()
            self._nodes()
            self._models()
            self.on_done(True, "")
        except Cancelled:
            self.on_done(False, "cancelled")
        except SetupError as exc:
            self.on_done(False, str(exc))
        except Exception as exc:
            self.on_done(False, "Setup stopped: %s" % exc)

    # steps

    def _portable(self):
        if _done("portable") and os.path.isdir(portable_dir()):
            return
        seven = os.path.join(home(), "7zr.exe")
        if not os.path.isfile(seven):
            self._download(SEVEN_ZIP, seven, "engine")
        archive = os.path.join(home(), "comfyui_portable.7z")
        self._download(PORTABLE, archive, "engine")
        self._say("unpack", 0)
        shutil.rmtree(portable_dir(), ignore_errors=True)
        cmd = [seven, "x", archive, "-o" + home(), "-y", "-bsp1", "-bso0"]
        self._proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                      creationflags=CREATE_NO_WINDOW)
        buf = b""
        while True:
            chunk = self._proc.stdout.read(64)
            if not chunk:
                break
            buf = (buf + chunk)[-200:]
            found = re.findall(rb"(\d+)%", buf)
            if found:
                self._say("unpack", int(found[-1]) / 100.0)
            self._check()
        code = self._proc.wait()
        self._check()
        if code != 0 or not os.path.isfile(os.path.join(portable_dir(), "python_embeded", "python.exe")):
            raise SetupError("The engine couldn't be unpacked (7-Zip code %s)." % code)
        try:
            os.remove(archive)
        except Exception:
            pass
        _mark("portable")

    def _nodes(self):
        if _done("nodes") and os.path.isdir(nodes_dir()):
            return
        self._say("nodes", None, "Downloading")
        archive = os.path.join(home(), "nodes.zip")
        self._download(NODES_ZIP, archive, "nodes", quiet=True)
        target = nodes_dir()
        shutil.rmtree(target, ignore_errors=True)
        tmp = target + ".tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        with zipfile.ZipFile(archive) as z:
            z.extractall(tmp)
        inner = [os.path.join(tmp, d) for d in os.listdir(tmp)]
        os.replace(inner[0] if len(inner) == 1 and os.path.isdir(inner[0]) else tmp, target)
        shutil.rmtree(tmp, ignore_errors=True)
        os.remove(archive)

        self._say("nodes", None, "Installing what it needs")
        py = os.path.join(portable_dir(), "python_embeded", "python.exe")
        log = open(os.path.join(home(), "setup-pip.log"), "ab")
        self._proc = subprocess.Popen(
            [py, "-s", "-m", "pip", "install", "--no-warn-script-location"] + NODE_PACKAGES,
            cwd=portable_dir(), stdout=log, stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW)
        while self._proc.poll() is None:
            self._check()
            time.sleep(0.5)
        self._check()
        if self._proc.returncode != 0:
            raise SetupError("Installing the upscaler's packages failed. "
                             "Details are in setup-pip.log.")
        _mark("nodes")

    def _models(self):
        os.makedirs(models_dir(), exist_ok=True)
        for repo, name, digest in (VAE, (self.model["repo"], self.model["file"], self.model["sha256"])):
            path = os.path.join(models_dir(), name)
            if os.path.isfile(path):
                continue
            self._download(HF % (repo, name), path, "model", sha256=digest,
                           detail_prefix="VAE" if name == VAE[1] else self.model["name"])

    # downloading

    def _download(self, url, path, step, sha256=None, quiet=False, detail_prefix=""):
        """Resumable download to `path`, via `path.part`."""
        part = path + ".part"
        have = os.path.getsize(part) if os.path.exists(part) else 0
        headers = {"User-Agent": "Vistiq"}
        if have:
            headers["Range"] = "bytes=%d-" % have
        for attempt in range(5):
            try:
                with requests.get(url, headers=headers, stream=True, timeout=30,
                                  allow_redirects=True) as r:
                    if r.status_code == 416:
                        break
                    if r.status_code == 200 and have:
                        have = 0          # the server ignored the range: start over
                    r.raise_for_status()
                    total = int(r.headers.get("content-length") or 0) + have
                    started, done_at_start = time.time(), have
                    with open(part, "ab" if have else "wb") as fh:
                        last = 0
                        for chunk in r.iter_content(1 << 20):
                            self._check()
                            fh.write(chunk)
                            have += len(chunk)
                            if not quiet and time.time() - last > 0.25:
                                last = time.time()
                                speed = (have - done_at_start) / max(0.1, time.time() - started)
                                self._say(step, have / total if total else None,
                                          _detail(detail_prefix, have, total, speed))
                break
            except Cancelled:
                raise
            except Exception:
                if attempt == 4:
                    raise SetupError("A download kept failing. Check the internet "
                                     "connection and try again; it will continue "
                                     "where it stopped.")
                time.sleep(3 + attempt * 3)
                have = os.path.getsize(part) if os.path.exists(part) else 0
                headers["Range"] = "bytes=%d-" % have
        if sha256:
            self._say(step, None, "Checking the download")
            if _sha256(part, self._check) != sha256:
                os.remove(part)
                raise SetupError("A download arrived damaged and was deleted. "
                                 "Try again to fetch it fresh.")
        os.replace(part, path)


def _detail(prefix, have, total, speed):
    gb = lambda n: "%.1f GB" % (n / 1e9) if n >= 1e9 else "%d MB" % (n / 1e6)
    text = gb(have) + (" of " + gb(total) if total else "")
    if speed > 0 and total:
        left = (total - have) / speed
        text += ", about " + (("%d min" % max(1, round(left / 60))) if left > 90 else "%d s" % left) + " left"
    return (prefix + ": " if prefix else "") + text


def _sha256(path, check):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(8 << 20)
            if not block:
                break
            h.update(block)
            check()
    return h.hexdigest()


def import_models(folder):
    """Bring model files the person already has into the engine, by hard
    link when they share a drive (instant, no extra space) or by copy.
    Returns the file names brought in."""
    wanted = {m["file"] for m in MODELS} | {VAE[1]}
    found = {}
    for root, _dirs, files in os.walk(folder):
        for f in files:
            if f in wanted or (f.startswith("seedvr2_") and f.endswith((".safetensors", ".gguf"))):
                found.setdefault(f, os.path.join(root, f))
        if root.count(os.sep) - folder.count(os.sep) > 4:
            _dirs[:] = []
    os.makedirs(models_dir(), exist_ok=True)
    brought = []
    for name, src in found.items():
        dst = os.path.join(models_dir(), name)
        if os.path.exists(dst):
            continue
        try:
            os.link(src, dst)
        except Exception:
            shutil.copy2(src, dst)
        brought.append(name)
    return brought


def uninstall():
    shutil.rmtree(home(), ignore_errors=True)


__all__ = ["Installer", "MODELS", "installed", "gpu", "suggested_model", "sizes",
           "import_models", "portable_dir", "local_models", "wf"]
