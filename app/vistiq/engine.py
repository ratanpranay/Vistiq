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

from . import engine_setup, progress as prog_mod, workflow as wf

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
        self.own = False
        self.resolution_key = "new_resolution"
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

    def _has_nodes(self, url):
        try:
            r = requests.get(url + "/object_info/SeedVR2LoadDiTModel", timeout=5)
            return r.ok and "SeedVR2LoadDiTModel" in r.json()
        except Exception:
            return False

    def connect(self, on_state=None, allow_start=True):
        """Get an engine ready, in this order:

        1. an address set by hand in settings
        2. Vistiq's own engine, if it has been set up (started hidden)
        3. a ComfyUI already running on this PC that has the upscaling nodes
        4. a ComfyUI folder chosen in Settings (started hidden)

        Failing all of those the state becomes "setup": the app offers to
        set up its own engine.
        """
        with self._lock:
            def say(state, message=""):
                self.state, self.message = state, message
                if on_state:
                    on_state(state, message)

            say("starting", "Looking for the engine")
            own_url = (self.settings.get("comfy_url") or "").strip().rstrip("/")
            if own_url and self._alive(own_url):
                self.url = own_url
                return self._after_connect(say)

            if self.process and self.process.poll() is None and self.url and self._alive(self.url):
                return self._after_connect(say)

            # Vistiq's own engine, still running from last time: just use it.
            port = int(self.settings.get("engine_port") or 0)
            if port and engine_setup.installed():
                url = "http://127.0.0.1:%d" % port
                if self._alive(url) and self._has_nodes(url):
                    self.url, self.own = url, True
                    return self._after_connect(say)

            if engine_setup.installed() and allow_start:
                cmd = command_for(engine_setup.portable_dir())
                if cmd:
                    self.own = True
                    return self._start(cmd[0], cmd[1], "Vistiq's engine", say)

            for port in PORTS:
                url = "http://127.0.0.1:%d" % port
                if self._alive(url) and self._has_nodes(url):
                    self.url = url
                    return self._after_connect(say)

            chosen = self.settings.get("comfy_path")
            if chosen and allow_start:
                found = find_installed(chosen)
                if found:
                    return self._start(found[0], found[1], found[2], say)
                say("error", "No ComfyUI was found in the chosen folder.")
                return False

            say("setup", "The engine needs a one-time setup.")
            return False

    def _start(self, cmd, cwd, label, say):
        port = OWN_PORT
        while not _port_free(port) and port < OWN_PORT + 20:
            port += 1
        cmd = cmd + ["--port", str(port), "--disable-auto-launch"]
        os.makedirs(self.log_dir, exist_ok=True)
        log = open(os.path.join(self.log_dir, "engine.log"), "ab")
        say("starting", "Starting the engine")
        # The engine's output goes to a file, which Windows would otherwise
        # write in its old code page; the upscaler nodes print emoji on
        # load, and that alone stops ComfyUI from starting. UTF-8 avoids it.
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
        try:
            self.process = subprocess.Popen(
                cmd, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        except Exception as exc:
            say("error", "Couldn't start the engine from %s: %s" % (label, exc))
            return False
        url = "http://127.0.0.1:%d" % port
        deadline = time.time() + 300
        while time.time() < deadline:
            if self.process.poll() is not None:
                say("error", "The engine stopped while starting. "
                             "The details are in engine.log (Settings, Open logs).")
                self.process = None
                return False
            if self._alive(url, timeout=1.0):
                self.url = url
                if self.own:
                    self.settings.set("engine_port", port)
                return self._after_connect(say)
            time.sleep(0.7)
        say("error", "The engine took too long to start.")
        return False

    def _after_connect(self, say):
        try:
            info = requests.get(self.url + "/object_info/SeedVR2LoadDiTModel", timeout=10).json()
            spec = info["SeedVR2LoadDiTModel"]["input"]["required"]["model"]
            self.models = _options(spec)
        except Exception:
            self.models = []
        self.all_models = list(self.models)
        self.refresh_models()
        if not self.models:
            import logging
            logging.getLogger("vistiq").error(
                "ComfyUI at %s has no SeedVR2LoadDiTModel node "
                "(custom node: ComfyUI-SeedVR2_VideoUpscaler)", self.url)
            say("error", "This ComfyUI is missing Vistiq's upscaling nodes. "
                         "Open the logs from Settings for what to install.")
            return False
        # The target-size input was renamed between versions of the nodes
        # ("resolution" became "new_resolution"); ask which one this has.
        try:
            info = requests.get(self.url + "/object_info/SeedVR2VideoUpscaler", timeout=10).json()
            spec = info["SeedVR2VideoUpscaler"]["input"]
            names = set(spec.get("required", {})) | set(spec.get("optional", {}))
            self.resolution_key = "new_resolution" if "new_resolution" in names or not names else "resolution"
        except Exception:
            self.resolution_key = "new_resolution"
        try:
            info = requests.get(self.url + "/object_info/SeedVR2LoadVAEModel", timeout=10).json()
            self.vaes = _options(info["SeedVR2LoadVAEModel"]["input"]["required"]["model"])
        except Exception:
            self.vaes = []
        say("ready", "Engine ready")
        return True

    def refresh_models(self):
        """The nodes list every model they could download. In Vistiq's own
        engine, offer only the ones that are actually here."""
        if self.own and getattr(self, "all_models", None):
            here = set(engine_setup.local_models())
            self.models = [m for m in self.all_models if m in here] or list(self.all_models)

    def stop_own(self):
        """Stop Vistiq's own engine, whichever run of the app started it."""
        self.stop()
        port = int(self.settings.get("engine_port") or 0)
        pid = _pid_on_port(port) if port else None
        if pid:
            _kill_tree(pid)
        self.settings.set("engine_port", 0)
        self.url, self.state, self.message = None, "idle", "Engine stopped"

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
                cancelled=lambda: False, tuning=None, retry_tuning=None, history=None):
        """Run one image through the workflow. Returns the result's bytes."""
        if self.state != "ready" or not self.url:
            raise EngineError("The engine isn't ready yet.")
        name = self._upload(path)
        vae = wf.DEFAULT_VAE if (not self.vaes or wf.DEFAULT_VAE in self.vaes) else self.vaes[0]
        out_w, out_h = wf.output_size(width, height, "max" if scale == "max" else float(scale), max_res)
        self._job = {"mp": out_w * out_h / 1e6, "history": history}
        self.last_timings = None
        try:
            return self._run(name, width, height, scale, model, vae, max_res,
                             on_progress, cancelled, tuning)
        except EngineError as exc:
            # Out of graphics memory with the lighter settings: once more,
            # with everything swapped out and smaller tiles.
            if retry_tuning and "ran out of memory" in str(exc):
                if on_progress:
                    on_progress("Retrying with less memory", None, None)
                return self._run(name, width, height, scale, model, vae, max_res,
                                 on_progress, cancelled, retry_tuning)
            raise

    def _run(self, name, width, height, scale, model, vae, max_res, on_progress,
             cancelled, tuning):
        # Vistiq's own engine writes its log where Vistiq can read it; there
        # the upscaler's debug log gives real, tile-by-tile progress.
        log_path = os.path.join(self.log_dir, "engine.log")
        use_log = self.own and os.path.isfile(log_path)
        prompt = wf.build_prompt(name, width, height, scale=scale, dit_model=model,
                                 vae_model=vae, max_res=max_res,
                                 resolution_key=self.resolution_key, tuning=tuning,
                                 debug=use_log)
        job = getattr(self, "_job", None) or {"mp": 1, "history": None}
        tracker = prog_mod.Progress(job["mp"], job["history"]) if use_log else None
        tail = prog_mod.LogTail(log_path) if use_log else None
        ws = self._open_socket()
        try:
            r = requests.post(self.url + "/prompt",
                              json={"prompt": prompt, "client_id": self.client_id}, timeout=30)
            if not r.ok:
                raise EngineError(_prompt_error(r))
            prompt_id = r.json()["prompt_id"]
            self._wait(prompt_id, ws, on_progress, cancelled, tracker, tail)
            if tracker and tracker.seen_log:
                self.last_timings = tracker.learned()
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

    def _wait(self, prompt_id, ws, on_progress, cancelled, tracker=None, tail=None):
        stage = "Waiting"
        last_poll = 0
        last_emit = 0
        if ws is not None:
            try:
                ws.settimeout(0.35)
            except Exception:
                pass
        while True:
            if cancelled():
                self.interrupt()
                raise EngineError("Cancelled")
            if tracker is not None:
                for line in tail.lines():
                    tracker.feed(line)
                if on_progress and time.time() - last_emit > 0.3:
                    last_emit = time.time()
                    on_progress(tracker.label(), tracker.value(), tracker.remaining())
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
                    if on_progress and tracker is None:
                        on_progress(stage, None, None)
                elif kind == "progress" and on_progress and tracker is None:
                    total = data.get("max") or 0
                    on_progress(stage, (data.get("value", 0) / float(total)) if total else None, None)
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


def _kill_tree(pid):
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                           creationflags=CREATE_NO_WINDOW,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.kill(pid, 15)
    except Exception:
        pass


def _pid_on_port(port):
    """The process listening on a local port (Windows), or None."""
    if sys.platform != "win32":
        return None
    try:
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True,
                             timeout=10, creationflags=CREATE_NO_WINDOW).stdout
    except Exception:
        return None
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[1].endswith(":%d" % port) and parts[3].upper() == "LISTENING":
            try:
                return int(parts[4])
            except ValueError:
                pass
    return None


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
