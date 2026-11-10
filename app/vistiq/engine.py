"""Finding, starting and talking to ComfyUI — the engine behind the app.

Vistiq never shows ComfyUI. It looks for one already running; failing that
it finds an installed one (the portable build, a git checkout, or ComfyUI
Desktop) and starts it hidden, with no console window and no browser. If it
started the engine, it stops it again when the app closes.
"""
import glob
import json
import os
import subprocess
import sys
import threading
import time
import uuid

import requests

try:
    import websocket  # websocket-client
except Exception:  # pragma: no cover
    websocket = None

from . import workflow as wf

PORTS = (8188, 8000, 8189)
OWN_PORT = 8188
CREATE_NO_WINDOW = 0x08000000


class EngineError(Exception):
    """Something the person needs to read, already in plain words."""


def _home(*parts):
    return os.path.join(os.path.expanduser("~"), *parts)


def _env(name, *parts):
    base = os.environ.get(name)
    return os.path.join(base, *parts) if base else None


# -- finding an installed ComfyUI ---------------------------------------

def _portable_command(folder):
    py = os.path.join(folder, "python_embeded", "python.exe")
    main = os.path.join(folder, "ComfyUI", "main.py")
    if os.path.isfile(py) and os.path.isfile(main):
        return [py, "-s", main, "--windows-standalone-build"], folder
    return None


def _checkout_command(folder):
    main = os.path.join(folder, "main.py")
    if not os.path.isfile(main):
        return None
    for venv in ("venv", ".venv"):
        py = os.path.join(folder, venv, "Scripts", "python.exe")
        if os.path.isfile(py):
            return [py, main], folder
    return None


def _desktop_command():
    """ComfyUI Desktop keeps its Python and models in a base folder and its
    ComfyUI code inside the installed app. Both are needed to start it
    without its window."""
    config = _env("APPDATA", "ComfyUI", "config.json")
    if not config or not os.path.isfile(config):
        return None
    try:
        with open(config, "r", encoding="utf-8") as fh:
            base = json.load(fh).get("basePath")
    except Exception:
        return None
    if not base:
        return None
    py = os.path.join(base, ".venv", "Scripts", "python.exe")
    mains = []
    programs = _env("LOCALAPPDATA", "Programs")
    if programs:
        mains = glob.glob(os.path.join(programs, "*", "resources", "ComfyUI", "main.py"))
    if not os.path.isfile(py) or not mains:
        return None
    cmd = [py, mains[0], "--base-directory", base]
    extra = _env("APPDATA", "ComfyUI", "extra_models_config.yaml")
    if extra and os.path.isfile(extra):
        cmd += ["--extra-model-paths-config", extra]
    return cmd, base


def command_for(folder):
    """The command that starts the ComfyUI in `folder`, or None."""
    if not folder or not os.path.isdir(folder):
        return None
    return _portable_command(folder) or _checkout_command(folder) \
        or _portable_command(os.path.dirname(folder))


def find_installed(preferred=None):
    """(command, cwd, label) for a ComfyUI on this machine, or None."""
    if preferred:
        found = command_for(preferred)
        if found:
            return found[0], found[1], preferred
    guesses = []
    for drive in ("C:\\", "D:\\", "E:\\"):
        guesses += [os.path.join(drive, "ComfyUI_windows_portable"),
                    os.path.join(drive, "ComfyUI")]
        guesses += glob.glob(os.path.join(drive, "*", "ComfyUI_windows_portable"))
    for sub in ("Desktop", "Downloads", "Documents", ""):
        guesses.append(_home(sub, "ComfyUI_windows_portable"))
        guesses.append(_home(sub, "ComfyUI"))
    for folder in guesses:
        found = command_for(folder)
        if found:
            return found[0], found[1], folder
    desktop = _desktop_command()
    if desktop:
        return desktop[0], desktop[1], "ComfyUI Desktop"
    return None


# -- the engine ---------------------------------------------------------

class Engine:
    def __init__(self, settings, log_dir):
        self.settings = settings
        self.log_dir = log_dir
        self.url = None
        self.process = None
        self.state = "idle"        # idle | starting | ready | missing | error
        self.message = ""
        self.models = []
        self.vaes = []
        self.client_id = uuid.uuid4().hex
        self._lock = threading.Lock()

    # connection

    def _alive(self, url, timeout=1.5):
        try:
            return requests.get(url + "/system_stats", timeout=timeout).ok
        except Exception:
            return False

    def _candidates(self):
        own = (self.settings.get("comfy_url") or "").strip().rstrip("/")
        urls = [own] if own else []
        urls += ["http://127.0.0.1:%d" % p for p in PORTS]
        return urls

    def connect(self, on_state=None, allow_start=True):
        """Find a running engine, or start one. Blocks until it is ready
        or it is clear it cannot be."""
        with self._lock:
            def say(state, message=""):
                self.state, self.message = state, message
                if on_state:
                    on_state(state, message)

            say("starting", "Looking for the engine")
            for url in self._candidates():
                if self._alive(url):
                    self.url = url
                    return self._after_connect(say)

            if not allow_start:
                say("missing", "The engine isn't running.")
                return False

            found = find_installed(self.settings.get("comfy_path"))
            if not found:
                say("missing", "ComfyUI wasn't found on this PC. "
                               "Point Vistiq at its folder in Settings.")
                return False
            cmd, cwd, label = found
            port = OWN_PORT
            while not _port_free(port) and port < OWN_PORT + 20:
                port += 1
            cmd = cmd + ["--port", str(port), "--disable-auto-launch"]
            os.makedirs(self.log_dir, exist_ok=True)
            log = open(os.path.join(self.log_dir, "engine.log"), "ab")
            say("starting", "Starting the engine")
            try:
                self.process = subprocess.Popen(
                    cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            except Exception as exc:
                say("error", "Couldn't start ComfyUI from %s: %s" % (label, exc))
                return False
            url = "http://127.0.0.1:%d" % port
            deadline = time.time() + 240
            while time.time() < deadline:
                if self.process.poll() is not None:
                    say("error", "ComfyUI stopped while starting. "
                                 "The details are in engine.log.")
                    self.process = None
                    return False
                if self._alive(url, timeout=1.0):
                    self.url = url
                    return self._after_connect(say)
                time.sleep(0.7)
            say("error", "ComfyUI took too long to start.")
            return False

    def _after_connect(self, say):
        try:
            info = requests.get(self.url + "/object_info/SeedVR2LoadDiTModel", timeout=10).json()
            spec = info["SeedVR2LoadDiTModel"]["input"]["required"]["model"]
            self.models = _options(spec)
        except Exception:
            self.models = []
        if not self.models:
            import logging
            logging.getLogger("vistiq").error(
                "ComfyUI at %s has no SeedVR2LoadDiTModel node "
                "(custom node: ComfyUI-SeedVR2_VideoUpscaler)", self.url)
            say("error", "This ComfyUI is missing Vistiq's upscaling nodes. "
                         "Open the logs from Settings for what to install.")
            return False
        try:
            info = requests.get(self.url + "/object_info/SeedVR2LoadVAEModel", timeout=10).json()
            self.vaes = _options(info["SeedVR2LoadVAEModel"]["input"]["required"]["model"])
        except Exception:
            self.vaes = []
        say("ready", "Engine ready")
        return True

    def stop(self):
        """Stop the engine, but only one this app started."""
        proc, self.process = self.process, None
        if proc and proc.poll() is None:
            try:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                                   creationflags=CREATE_NO_WINDOW,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    proc.terminate()
            except Exception:
                pass

    # one job

    def upscale(self, path, width, height, scale, model, max_res, on_progress=None,
                cancelled=lambda: False):
        """Run one image through the workflow. Returns the result's bytes."""
        if self.state != "ready" or not self.url:
            raise EngineError("The engine isn't ready yet.")
        name = self._upload(path)
        vae = wf.DEFAULT_VAE if (not self.vaes or wf.DEFAULT_VAE in self.vaes) else self.vaes[0]
        prompt = wf.build_prompt(name, width, height, scale=scale, dit_model=model,
                                 vae_model=vae, max_res=max_res)
        ws = self._open_socket()
        try:
            r = requests.post(self.url + "/prompt",
                              json={"prompt": prompt, "client_id": self.client_id}, timeout=30)
            if not r.ok:
                raise EngineError(_prompt_error(r))
            prompt_id = r.json()["prompt_id"]
            self._wait(prompt_id, ws, on_progress, cancelled)
        finally:
            if ws:
                try:
                    ws.close()
                except Exception:
                    pass
        return self._fetch_output(prompt_id)

    def interrupt(self):
        if self.url:
            try:
                requests.post(self.url + "/interrupt", timeout=5)
            except Exception:
                pass

    def _upload(self, path):
        with open(path, "rb") as fh:
            files = {"image": (_safe_name(path), fh, "application/octet-stream")}
            r = requests.post(self.url + "/upload/image", files=files,
                              data={"overwrite": "true", "type": "input"}, timeout=120)
        if not r.ok:
            raise EngineError("Couldn't hand the image to the engine (%s)." % r.status_code)
        data = r.json()
        name = data.get("name")
        if data.get("subfolder"):
            name = data["subfolder"] + "/" + name
        return name

    def _open_socket(self):
        if websocket is None:
            return None
        try:
            ws_url = self.url.replace("http", "ws", 1) + "/ws?clientId=" + self.client_id
            ws = websocket.create_connection(ws_url, timeout=2)
            return ws
        except Exception:
            return None

    def _wait(self, prompt_id, ws, on_progress, cancelled):
        stage = "Waiting"
        last_poll = 0
        while True:
            if cancelled():
                self.interrupt()
                raise EngineError("Cancelled")
            message = None
            if ws is not None:
                try:
                    raw = ws.recv()
                    if isinstance(raw, str):
                        message = json.loads(raw)
                except Exception:
                    message = None
            else:
                time.sleep(0.5)
            if message:
                kind, data = message.get("type"), message.get("data") or {}
                if data.get("prompt_id") not in (None, prompt_id):
                    continue
                if kind == "executing":
                    node = data.get("node")
                    if node is None:
                        return
                    stage = wf.STAGES.get(str(node), stage)
                    if on_progress:
                        on_progress(stage, None)
                elif kind == "progress" and on_progress:
                    total = data.get("max") or 0
                    on_progress(stage, (data.get("value", 0) / float(total)) if total else None)
                elif kind == "execution_error":
                    raise EngineError(_exec_error(data))
                elif kind == "execution_interrupted":
                    raise EngineError("Cancelled")
            if time.time() - last_poll > 2.0:
                last_poll = time.time()
                done = self._history(prompt_id)
                if done is not None:
                    status = done.get("status") or {}
                    if status.get("status_str") == "error":
                        for kind, data in status.get("messages", []):
                            if kind == "execution_error":
                                raise EngineError(_exec_error(data))
                        raise EngineError("The engine reported an error.")
                    if done.get("outputs"):
                        return

    def _history(self, prompt_id):
        try:
            r = requests.get(self.url + "/history/" + prompt_id, timeout=5)
            return r.json().get(prompt_id) if r.ok else None
        except Exception:
            return None

    def _fetch_output(self, prompt_id):
        for _ in range(20):
            item = self._history(prompt_id)
            images = ((item or {}).get("outputs", {}).get(wf.NODE_SAVE) or {}).get("images")
            if images:
                image = images[0]
                r = requests.get(self.url + "/view", params={
                    "filename": image["filename"], "subfolder": image.get("subfolder", ""),
                    "type": image.get("type", "output")}, timeout=300)
                if r.ok:
                    return r.content
            time.sleep(0.5)
        raise EngineError("The engine finished but no image came back.")


def _options(spec):
    if spec and isinstance(spec[0], list):
        return list(spec[0])
    if spec and isinstance(spec[0], str) and len(spec) > 1 and isinstance(spec[1], dict):
        return list(spec[1].get("options") or [])
    return []


def _port_free(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _safe_name(path):
    base = os.path.basename(path)
    stem, ext = os.path.splitext(base)
    keep = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)[:60] or "image"
    return "vistiq_%s_%s%s" % (uuid.uuid4().hex[:6], keep, ext.lower() or ".png")


def _exec_error(data):
    msg = (data.get("exception_message") or "").strip()
    low = msg.lower()
    if "out of memory" in low or "outofmemory" in low:
        return ("The graphics card ran out of memory. Try a smaller scale "
                "or a Swift model.")
    return msg.splitlines()[0] if msg else "The engine reported an error."


def _prompt_error(response):
    try:
        data = response.json()
        err = data.get("error", {})
        details = []
        for node in (data.get("node_errors") or {}).values():
            for e in node.get("errors", []):
                details.append(e.get("details") or e.get("message", ""))
        text = err.get("message", "The engine rejected the job.")
        if details:
            text += " " + "; ".join(d for d in details if d)
        return text
    except Exception:
        return "The engine rejected the job (%s)." % response.status_code
