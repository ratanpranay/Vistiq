"""Prompt helper: a small local text model (Qwen 3, 1.7B) that turns a short
note into a clear instruction for the image model. Optional download
(about 1.1 GB); runs on this computer with llama.cpp, offline.
"""
import json
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

MODEL_URL = "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf"
MODEL_GB = 1.1
RELEASES = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
PORT = 38394

TASKS = {
    "sketch": "turn a sketch into a photorealistic photo, keeping every line and the camera view",
    "lighting": "change only the lighting",
    "cmf": "change only colours, materials and finishes",
    "style": "change the overall look and mood",
    "design": "change the shape or design of specific parts",
    "photo": "make a render look like a real photograph",
    "camera": "show the design from the reference image's camera view",
    "": "edit the image as described",
}

SYSTEM = ("You write instructions for an image-editing AI that works on automotive interior images. "
          "Rewrite the user's note into ONE clear instruction for this task: {task}. Keep the user's intent "
          "and every detail they gave; add precise words for materials, colours, finishes and light where "
          "it helps. Do not invent design changes unless the task is about design. At most 60 words. "
          "Reply with the instruction only, no quotes, no preamble.")


def folder(models_dir):
    return os.path.join(models_dir, "prompt-helper")


def _model(models_dir):
    return os.path.join(folder(models_dir), os.path.basename(MODEL_URL))


def _server(models_dir):
    name = "llama-server.exe" if sys.platform == "win32" else "llama-server"
    for root, _d, files in os.walk(os.path.join(folder(models_dir), "llama")):
        if name in files:
            return os.path.join(root, name)
    return None


def installed(models_dir):
    return os.path.isfile(_model(models_dir)) and bool(_server(models_dir))


def install(models_dir, download, on_progress, cancelled=lambda: False):
    f = folder(models_dir)
    os.makedirs(f, exist_ok=True)
    if not _server(models_dir):
        rel = requests.get(RELEASES, timeout=30, headers={"Accept": "application/vnd.github+json"}).json()
        pat = (r"bin-macos-arm64\.(tar\.gz|zip)$" if sys.platform == "darwin"
               else r"bin-win-cpu-x64\.zip$")
        asset = next((a for a in rel.get("assets", []) if re.search(pat, a["name"])), None)
        if not asset:
            raise RuntimeError("couldn't find the prompt helper's engine for this computer (%s)"
                               % (rel.get("message") or rel.get("tag_name") or "no release"))
        z = os.path.join(f, asset["name"])
        download(asset["browser_download_url"], z, on_progress, "Prompt helper engine", cancelled)
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
    if not os.path.isfile(_model(models_dir)):
        download(MODEL_URL, _model(models_dir), on_progress, "Prompt helper model", cancelled)


class Helper:
    def __init__(self, models_dir_fn):
        self.models_dir = models_dir_fn
        self.proc = None
        self._lock = threading.Lock()

    def _start(self):
        if self.proc and self.proc.poll() is None:
            return
        md = self.models_dir()
        exe = _server(md)
        cmd = [exe, "-m", _model(md), "--port", str(PORT), "--host", "127.0.0.1", "-c", "2048", "--jinja",
               "-ngl", "99"]
        flags = 0x08000000 if sys.platform == "win32" else 0
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     cwd=os.path.dirname(exe), creationflags=flags)
        deadline = time.time() + 60
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("The prompt helper didn't start.")
            try:
                if requests.get("http://127.0.0.1:%d/health" % PORT, timeout=1).ok:
                    return
            except Exception:
                pass
            time.sleep(0.4)
        raise RuntimeError("The prompt helper took too long to start.")

    def improve(self, preset, text):
        with self._lock:
            self._start()
            body = {"messages": [{"role": "system", "content": SYSTEM.format(task=TASKS.get(preset, TASKS[""]))},
                                 {"role": "user", "content": text.strip() + " /no_think"}],
                    "max_tokens": 220, "temperature": 0.4,
                    "chat_template_kwargs": {"enable_thinking": False}}
            s = requests.Session()
            s.trust_env = False
            r = s.post("http://127.0.0.1:%d/v1/chat/completions" % PORT, json=body, timeout=120)
            r.raise_for_status()
            out = r.json()["choices"][0]["message"]["content"]
        out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip().strip('"').strip()
        return out

    def stop(self):
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            p.kill()
