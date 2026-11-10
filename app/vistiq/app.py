"""The window and the bridge between it and the engine.

The interface is plain HTML in ../ui, shown by pywebview (Edge WebView2 on
Windows). JavaScript calls the methods of `Api`; the app answers by calling
`vistiq.event(...)` in the page.
"""
import json
import logging
import os
import subprocess
import sys
import threading
import time
import uuid

import webview

from . import engine_setup, imaging, workflow as wf
from .engine import Engine, EngineError
from .settings import Settings, data_dir

log = logging.getLogger("vistiq")


class Api:
    def __init__(self, app):
        self._app = app

    # state

    def init(self):
        a = self._app
        return {
            "version": a.version,
            "settings": a.settings.all(),
            "engine": {"state": a.engine.state, "message": a.engine.message,
                       "models": a.engine.models},
            "items": [a.public(i) for i in a.items],
            "notice": a.notice,
        }

    def set_setting(self, key, value):
        self._app.settings.set(key, value)
        return self._app.settings.all()

    # adding images

    def choose_files(self):
        win = self._app.window
        picked = win.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True,
            file_types=("Images (*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.tif;*.tiff)", "All files (*.*)"))
        return self._app.add(list(picked or []))

    def choose_folder_images(self):
        picked = self._app.window.create_file_dialog(webview.FOLDER_DIALOG)
        return self._app.add(list(picked or []))

    def paste(self):
        try:
            from PIL import ImageGrab
            grabbed = ImageGrab.grabclipboard()
        except Exception:
            grabbed = None
        if grabbed is None:
            return []
        if isinstance(grabbed, list):
            return self._app.add(grabbed)
        folder = os.path.join(data_dir(), "pasted")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, "pasted_%s.png" % time.strftime("%Y%m%d_%H%M%S"))
        grabbed.save(path, "PNG")
        return self._app.add([path])

    def remove(self, item_id):
        self._app.items = [i for i in self._app.items
                           if not (i["id"] == item_id and i["status"] != "running")]
        return True

    def clear(self):
        self._app.items = [i for i in self._app.items if i["status"] == "running"]
        return True

    # output

    def choose_output(self):
        picked = self._app.window.create_file_dialog(
            webview.FOLDER_DIALOG, directory=self._app.settings.get("out_dir") or "")
        if picked:
            self._app.settings.set("out_dir", picked[0])
        return self._app.settings.get("out_dir")

    def open_output(self):
        folder = self._app.settings.get("out_dir")
        os.makedirs(folder, exist_ok=True)
        _open(folder)

    def reveal(self, path):
        if path and os.path.exists(path):
            if sys.platform == "win32":
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            else:
                _open(os.path.dirname(path))

    # work

    def start(self):
        return self._app.start()

    def cancel(self):
        self._app.cancel()

    # engine setup

    def setup_info(self):
        name, vram = engine_setup.gpu()
        key = engine_setup.suggested_model(vram)
        models = []
        for m in engine_setup.MODELS:
            models.append({"key": m["key"], "name": m["name"], "about": m["about"],
                           "size": engine_setup.sizes(m["key"]).get("model", 0)})
        rest = engine_setup.sizes(key)
        return {"gpu": name, "vram": vram, "suggested": key, "models": models,
                "engine_size": rest.get("engine", 0) + rest.get("vae", 0),
                "free": round(engine_setup.free_gb(engine_setup.home())),
                "running": bool(self._app.installer)}

    def install_engine(self, model_key):
        return self._app.install(model_key)

    def cancel_install(self):
        if self._app.installer:
            self._app.installer.cancel()

    def import_models(self):
        picked = self._app.window.create_file_dialog(webview.FOLDER_DIALOG)
        if not picked:
            return []
        return engine_setup.import_models(picked[0])

    def retry_engine(self):
        self._app.connect_async()

    def choose_comfy(self):
        picked = self._app.window.create_file_dialog(webview.FOLDER_DIALOG)
        if picked:
            self._app.settings.set("comfy_path", picked[0])
            self._app.connect_async()
        return self._app.settings.get("comfy_path")

    def open_logs(self):
        _open(os.path.join(data_dir(), "logs"))

    def open_url(self, url):
        if url.startswith("https://"):
            import webbrowser
            webbrowser.open(url)


class App:
    def __init__(self, app_dir, version, notice=""):
        self.app_dir = app_dir
        self.version = version
        self.notice = notice
        self.settings = Settings()
        self.engine = Engine(self.settings, os.path.join(data_dir(), "logs"))
        self.items = []
        self.window = None
        self.installer = None
        self._worker = None
        self._cancel = threading.Event()
        self._emit_lock = threading.Lock()

    # talking to the page

    def emit(self, kind, payload):
        if not self.window:
            return
        script = "window.vistiq && vistiq.event(%s, %s)" % (json.dumps(kind), json.dumps(payload))
        with self._emit_lock:
            try:
                self.window.evaluate_js(script)
            except Exception:
                log.exception("emit failed")

    def public(self, item):
        return {k: v for k, v in item.items() if not k.startswith("_")}

    def update(self, item, **changes):
        item.update(changes)
        self.emit("item", self.public(item))

    # images

    def add(self, paths):
        added = []
        known = {i["path"] for i in self.items}
        for path in imaging.expand(paths):
            if path in known:
                continue
            try:
                w, h = imaging.size_of(path)
                item = {"id": uuid.uuid4().hex[:10], "path": path,
                        "name": os.path.basename(path), "w": w, "h": h,
                        "status": "ready", "progress": 0, "stage": "",
                        "preview": imaging.preview(path)}
            except Exception as exc:
                log.warning("can't read %s: %s", path, exc)
                continue
            self.items.append(item)
            added.append(self.public(item))
        return added

    # the engine

    def connect_async(self):
        def run():
            self.engine.connect(on_state=lambda s, m: self.emit(
                "engine", {"state": s, "message": m, "models": self.engine.models}))
            self.emit("engine", {"state": self.engine.state, "message": self.engine.message,
                                 "models": self.engine.models})
        threading.Thread(target=run, daemon=True).start()

    def install(self, model_key):
        if self.installer:
            return False

        def progress(step, label, fraction, detail):
            self.emit("setup", {"state": "running", "step": step, "label": label,
                                "fraction": fraction, "detail": detail})

        def done(ok, message):
            self.installer = None
            if ok:
                self.settings.set("model", engine_setup.model_by_key(model_key)["file"])
                self.emit("setup", {"state": "done"})
                self.connect_async()
            else:
                self.emit("setup", {"state": "cancelled" if message == "cancelled" else "error",
                                    "message": message})

        self.installer = engine_setup.Installer(model_key, progress, done)
        self.installer.start()
        return True

    def start(self):
        if self._worker and self._worker.is_alive():
            return False
        if not any(i["status"] in ("ready", "error") for i in self.items):
            return False
        self._cancel.clear()
        for i in self.items:
            if i["status"] in ("ready", "error"):
                self.update(i, status="queued", error="", progress=0, stage="Waiting")
        self._worker = threading.Thread(target=self._run_queue, daemon=True)
        self._worker.start()
        return True

    def cancel(self):
        self._cancel.set()
        self.engine.interrupt()

    def _run_queue(self):
        s = self.settings
        self.emit("batch", {"state": "running"})
        while not self._cancel.is_set():
            item = next((i for i in self.items if i["status"] == "queued"), None)
            if not item:
                break
            if self.engine.state != "ready":
                self.engine.connect(on_state=lambda st, m: self.emit(
                    "engine", {"state": st, "message": m, "models": self.engine.models}))
                if self.engine.state != "ready":
                    self.update(item, status="error", error=self.engine.message)
                    break
            started = time.time()
            self.update(item, status="running", stage="Starting", progress=0)
            scale = s.get("scale")
            max_res = wf.LIMIT
            model = s.get("model")
            if self.engine.models and model not in self.engine.models:
                model = wf.DEFAULT_DIT if wf.DEFAULT_DIT in self.engine.models else self.engine.models[0]
            try:
                data = self.engine.upscale(
                    item["path"], item["w"], item["h"], scale, model, max_res,
                    on_progress=lambda stage, frac, it=item: self.update(
                        it, stage=stage, progress=frac if frac is not None else it.get("progress", 0)),
                    cancelled=self._cancel.is_set)
                tag = "vistiq_max" if scale == "max" else "vistiq_%sx" % scale
                path, w, h = imaging.save(data, item["path"], s.get("out_dir"), s.get("format"), tag)
                self.update(item, status="done", progress=1, stage="Saved",
                            out_path=path, out_w=w, out_h=h,
                            seconds=round(time.time() - started, 1),
                            out_preview=imaging.preview(data))
            except EngineError as exc:
                text = str(exc)
                self.update(item, status="ready" if text == "Cancelled" else "error",
                            error="" if text == "Cancelled" else text, stage="", progress=0)
            except Exception as exc:
                log.exception("job failed")
                self.update(item, status="error", error="Something went wrong: %s" % exc,
                            stage="", progress=0)
        for i in self.items:
            if i["status"] == "queued":
                self.update(i, status="ready", stage="")
        self.emit("batch", {"state": "idle"})

    def shutdown(self):
        self._cancel.set()
        if self.installer:
            self.installer.cancel()
        if self.settings.get("stop_engine_on_exit", True):
            self.engine.stop()


def _open(path):
    if sys.platform == "win32":
        os.startfile(path)  # noqa
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


def _on_drop(app):
    def handler(event):
        files = ((event or {}).get("dataTransfer") or {}).get("files") or []
        paths = [f.get("pywebviewFullPath") for f in files if f.get("pywebviewFullPath")]
        if paths:
            added = app.add(paths)
            app.emit("added", added)
    return handler


def run(app_dir, version, notice=""):
    logs = os.path.join(data_dir(), "logs")
    os.makedirs(logs, exist_ok=True)
    logging.basicConfig(filename=os.path.join(logs, "vistiq.log"), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    log.info("Vistiq %s starting from %s", version, app_dir)
    app = App(app_dir, version, notice)
    index = os.path.join(app_dir, "ui", "index.html")
    app.window = webview.create_window(
        "Vistiq", url=index, js_api=Api(app), width=1200, height=780,
        min_size=(980, 640), background_color="#FFFFFF", text_select=False)

    def on_loaded():
        try:
            from webview.dom import DOMEventHandler
            app.window.dom.document.events.drop += DOMEventHandler(_on_drop(app), True, True)
        except Exception:
            log.exception("drag and drop unavailable")

    app.window.events.loaded += on_loaded
    app.window.events.closed += app.shutdown
    app.connect_async()
    webview.start(private_mode=False, storage_path=os.path.join(data_dir(), "webview"))
    app.shutdown()
