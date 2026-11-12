"""The window and the bridge between it and the engine.

The interface is plain HTML in ../ui, shown by pywebview (Edge WebView2 on
Windows). JavaScript calls the methods of `Api`; the app answers by calling
`vistiq.event(...)` in the page.
"""
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import webview

from . import engine_setup, flavor, imaging, models, tiles, updater, workflow as wf
from .engine import Engine, EngineError, _local
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
            "update": a.updater.info(),
            "models": a.model_info(),
            "flavor": "studio" if flavor.STUDIO else "vistiq",
        }

    def lens(self, item_id, u, v, lens_px, zoom, out_px):
        """What the magnifier shows at a point of a finished image."""
        a = self._app
        item = next((i for i in a.items if i["id"] == item_id), None)
        if not item or not item.get("out_path") or not os.path.isfile(item["out_path"]):
            return None
        try:
            with a._lens_lock:
                return a._lens.cut(item["path"], item["out_path"], float(u), float(v),
                                   float(lens_px), float(zoom), max(64, min(1100, int(out_px))))
        except Exception:
            log.exception("magnifier failed")
            return None

    def estimates(self):
        """Seconds each image waiting to be upscaled should take with the
        current settings, from how long this PC took before (0 = unknown)."""
        return self._app.estimates()

    def set_setting(self, key, value):
        if key == "max_res":
            value = int(value) if int(value) in wf.SIZES else wf.LIMIT
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
            models.append({"key": m["key"], "name": "Vistiq " + m["name"], "about": m["about"],
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

    # models

    def model_info(self):
        return self._app.model_info()

    def download_model(self, key):
        return self._app.downloads.start(key)

    def cancel_model_download(self):
        self._app.downloads.cancel()

    def remove_model(self, key):
        msg = models.remove(key, self._app._model_in_use)
        if not msg:
            self._app.engine.refresh_models()
        self._app.emit("models", self._app.model_info())
        return msg

    # updates

    def update_info(self):
        return self._app.updater.info()

    def check_updates(self):
        self._app.updater.check_async()
        return True

    def restart(self):
        return self._app.restart()

    def stop_engine(self):
        if self._app._worker and self._app._worker.is_alive():
            return False
        self._app.engine.stop_own()
        self._app.emit("engine", {"state": "stopped", "message": "Engine stopped. It starts again the next time you upscale.", "models": self._app.engine.models})
        return True

    def engine_state(self):
        """Where the engine stands right now, for a window that may have
        missed the news (see boot() in app.js)."""
        a = self._app
        return {"engine": {"state": a.engine.state, "message": a.engine.message,
                           "models": a.engine.models},
                "models": a.model_info()}

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

    # Vistiq Studio

    def studio_status(self):
        return self._app.studio.status() if self._app.studio else None

    def studio_setup(self, juice=False):
        return self._app.studio.setup(bool(juice))

    def studio_cancel(self):
        self._app.studio.cancel()

    def studio_take_from(self, folder=""):
        if not folder:
            picked = self._app.window.create_file_dialog(webview.FOLDER_DIALOG)
            if not picked:
                return False
            folder = picked[0]
        if not os.path.isdir(folder):
            return False
        return self._app.studio.take_from(folder)

    def studio_choose_home(self):
        from . import studio
        picked = self._app.window.create_file_dialog(webview.FOLDER_DIALOG,
                                                     directory=studio.home(self._app.settings))
        if picked:
            self._app.settings.set("studio_home", picked[0])
            if self._app.settings.get("out_dir") == studio.outputs_dir():
                self._app.settings.set("out_dir", studio.outputs_dir(self._app.settings))
            studio.write_model_paths(self._app.settings)
        return self._app.studio.status()

    def studio_pick(self):
        picked = self._app.window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False,
            file_types=("Images (*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.tif;*.tiff)", "All files (*.*)"))
        return _image_info(picked[0]) if picked else None

    def studio_image(self, path):
        return _image_info(path)

    def studio_paste(self):
        try:
            from PIL import ImageGrab
            grabbed = ImageGrab.grabclipboard()
        except Exception:
            grabbed = None
        if grabbed is None:
            return None
        if isinstance(grabbed, list):
            paths = [p for p in grabbed if imaging.is_image(p)]
            return _image_info(paths[0]) if paths else None
        folder = os.path.join(data_dir(), "pasted")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, "pasted_%s.png" % time.strftime("%Y%m%d_%H%M%S"))
        grabbed.save(path, "PNG")
        return _image_info(path)

    def studio_drop_target(self, target):
        self._app.drop_target = target or ""

    def studio_run(self, job):
        return self._app.studio.run(job)

    def studio_select(self, path, points, out_w, out_h):
        try:
            return {"mask": self._app.studio.select(path, points, out_w, out_h)}
        except ImportError:
            return {"error": "Select needs the newest Vistiq Studio.exe. Download it once from the "
                             "latest Studio release; after that it updates by itself."}
        except Exception as exc:
            log.exception("select failed")
            return {"error": str(exc)}

    def studio_live(self, on):
        b = self._app.studio.bridge
        if on:
            ok = b.start()
            if ok:
                return {"on": True, "error": ""}
            if b.busy_reason == "studio":
                return {"on": False, "error": "Another Vistiq Studio window is already connected. Close it, then try again."}
            return {"on": False, "error": "Another program is using the Photoshop link's port (38393). "
                                          "Restart the PC if this keeps happening."}
        b.stop()
        return {"on": False}

    def studio_install_panel(self):
        from . import bridge
        ok, msg = bridge.install_panel(self._app.app_dir, os.path.join(data_dir(), "photoshop"))
        return {"ok": ok, "message": msg}

    def studio_set_tier(self, tier):
        if tier in ("best", "good"):
            self._app.settings.set("studio_tier", tier)
        return self._app.studio.status()

    def studio_library(self):
        return self._app.studio.library()

    def studio_to_upscale(self, path):
        added = self._app.add([path])
        if not added:
            added = [self._app.public(i) for i in self._app.items if i["path"] == path]
        self._app.emit("added", added)
        return added

    def studio_open_outputs(self):
        from . import studio
        folder = studio.outputs_dir(self._app.settings)
        os.makedirs(folder, exist_ok=True)
        _open(folder)

    def studio_open_models(self):
        from . import studio
        folder = studio.models_dir(self._app.settings)
        for sub in studio.SUBFOLDERS:
            os.makedirs(os.path.join(folder, sub), exist_ok=True)
        _open(folder)

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
        self.updater = updater.Updater(version, lambda info: self.emit("update", info))
        self.downloads = models.Downloads(self._on_model_download)
        self._model_in_use = None
        if not self.settings.get("auto_migrated"):
            # Everyone starts on Auto once; picking a model by hand sticks.
            self.settings.set("model", models.AUTO)
            self.settings.set("auto_migrated", True)
        self._worker = None
        self._cancel = threading.Event()
        self._lens = imaging.Lens()
        self._lens_lock = threading.Lock()
        self._restarting = threading.Event()
        self._restarting.set()
        self._emit_lock = threading.Lock()
        self.drop_target = ""
        self.studio = None
        if flavor.STUDIO:
            from .studio_jobs import Studio
            self.studio = Studio(self)

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
            t0 = time.time()
            self.engine.connect(on_state=lambda s, m: self.emit(
                "engine", {"state": s, "message": m, "models": self.engine.models}))
            self.emit("engine", {"state": self.engine.state, "message": self.engine.message,
                                 "models": self.engine.models})
            log.info("engine %s after %.1f s", self.engine.state, time.time() - t0)
            self.emit("models", self.model_info())
            if self.engine.state == "setup" and engine_setup.needs_update():
                # Replace an older engine build on its own; the models stay.
                m = engine_setup.model_by_file(self.settings.get("model")) or \
                    next((engine_setup.model_by_file(f) for f in engine_setup.local_models()
                          if engine_setup.model_by_file(f)), None)
                if m:
                    self.install(m["key"])
        threading.Thread(target=run, daemon=True).start()

    def _on_model_download(self, info):
        self.emit("model-dl", info)
        if info.get("state") == "done":
            self.engine.refresh_models()
            self.emit("models", self.model_info())

    def model_info(self):
        info = models.catalog() if self.engine.own or engine_setup.installed() else None
        return {"catalog": info, "engine_models": self.engine.models,
                "download": self.downloads.job}

    def install(self, model_key):
        if self.installer:
            return False
        upgrade = engine_setup.needs_update()

        def progress(step, label, fraction, detail):
            self.emit("setup", {"state": "running", "step": step, "label": label,
                                "fraction": fraction, "detail": detail, "upgrade": upgrade})

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
        self.engine.drop_queue()
        self.engine.interrupt()
        if self.engine.own:
            threading.Thread(target=self._release_after_cancel, daemon=True).start()

    def _release_after_cancel(self):
        """The upscaler only notices a stop between its phases, which can be
        minutes away; meanwhile the card stays full and the next image waits.
        So Vistiq's own engine is stopped at once, which frees the card
        instantly, and started again in the background (about 15 seconds)."""
        self._restarting.clear()
        try:
            if not self.engine.busy():
                return
            log.info("cancelled while the upscaler was working; restarting the engine")
            say = lambda st, m: self.emit("engine", {"state": st, "message": m,
                                                     "models": self.engine.models})
            self.engine.stop_own()
            say("starting", "Getting the engine ready again")
            self.engine.connect(on_state=say)
            say(self.engine.state, self.engine.message)
        finally:
            self._restarting.set()

    def free_upscaler(self):
        """Let the upscaler's engine give back the graphics card (Studio:
        before the image engine runs)."""
        if self._worker and self._worker.is_alive():
            raise RuntimeError("The upscaler is busy. Wait for it to finish, or cancel it.")
        if self.engine.url and self.engine.state == "ready":
            try:
                _local.post(self.engine.url + "/free", json={"unload_models": True, "free_memory": True},
                            timeout=10)
            except Exception:
                pass

    def _run_queue(self):
        s = self.settings
        self._restarting.wait(90)     # a cancel may still be freeing the card
        if self.studio:
            if self.studio._job and self.studio._job.is_alive():
                self.emit("batch", {"state": "idle"})
                for i in self.items:
                    if i["status"] == "queued":
                        self.update(i, status="ready", stage="",
                                    error="Image generation is running. Upscale when it is done.")
                return
            self.studio.engine.free()
        self.emit("batch", {"state": "running"})
        while not self._cancel.is_set():
            item = next((i for i in self.items if i["status"] == "queued"), None)
            if not item:
                break
            if self.engine.state != "ready" or not self.engine.alive():
                self.engine.connect(on_state=lambda st, m: self.emit(
                    "engine", {"state": st, "message": m, "models": self.engine.models}))
                if self.engine.state != "ready":
                    self.update(item, status="error", error=self.engine.message)
                    break
            started = time.time()
            scale = s.get("scale")
            max_res = s.max_side()
            # The upscaler reports little progress for a single image, so the
            # bar is driven by an estimate from how long earlier jobs took
            # with the same model, per megapixel of output.
            ow, oh = wf.output_size(item["w"], item["h"], "max" if scale == "max" else float(scale), max_res)
            item["scale_used"] = scale
            mp = max(0.1, ow * oh / 1e6)
            tuning = retry = part_mp = None
            if self.engine.own:
                model = models.resolve(s.get("model"))
                bias = (s.get("swap_bias") or {}).get(model, 0)
                part_mp = tiles.part_limit(models._vram(), (s.get("part_mp") or {}).get(model))
                tuning = models.tuning(model, megapixels=min(mp, part_mp), extra_swap=bias)
                retry = models.tuning(model, retry=True)
            else:
                model = s.get("model")
                if model == models.AUTO or (self.engine.models and model not in self.engine.models):
                    model = wf.DEFAULT_DIT if wf.DEFAULT_DIT in self.engine.models else self.engine.models[0]
            if not model:
                self.update(item, status="error", error="No model is installed. Download one from the Model list.")
                break
            self._model_in_use = model
            rate = (s.get("speeds") or {}).get(model)
            phase_hist = (s.get("phase_speeds") or {}).get(model)
            self.update(item, status="running", stage="Starting", progress=0,
                        started=time.time() * 1000, fine=bool(self.engine.own),
                        estimate=round(rate * mp, 1) if rate else 0)
            log.info("upscale %s with %s, tuning %s", item["name"], model, tuning)
            try:
                report = lambda stage, frac, left, it=item: self.update(
                    it, stage=stage, progress=frac if frac is not None else it.get("progress", 0),
                    left=round(left, 1) if left is not None else None)
                # Noise-based "detail" levels were tried (0.2.8) and only
                # added a mottled texture, so the original settings stay.
                detail = "faithful"
                passes = wf.passes(item["w"], ow, s.get("two_pass") is not False)
                log.info("detail %s, %d pass(es)", detail, len(passes))
                data = self._passes(item, passes, ow, max_res, model, report, tuning, retry,
                                    phase_hist, part_mp, detail)
                tag = "max" if scale == "max" else "%sx" % scale
                path, w, h = imaging.save(data, item["path"], s.get("out_dir"), s.get("format"), tag, limit=max_res)
                took = time.time() - started
                self._learn_from_engine(model)
                if self.engine.failed_tuning:
                    # The lighter settings crashed the card for this size:
                    # swap more with this model from now on.
                    sb = dict(s.get("swap_bias") or {})
                    sb[model] = min(36, int(sb.get(model, 0)) + 10)
                    s.set("swap_bias", sb)
                    log.info("raised swap for %s to +%d", model, sb[model])
                speeds = dict(s.get("speeds") or {})
                old = speeds.get(model)
                new = took / max(0.1, sum(_pass_mps(item["w"], item["h"], ow, oh,
                                                    s.get("two_pass") is not False)))
                speeds[model] = round(new if not old else old * 0.6 + new * 0.4, 3)
                s.set("speeds", speeds)
                if self.engine.last_timings:
                    from . import progress as prog_mod
                    ph = dict(s.get("phase_speeds") or {})
                    ph[model] = prog_mod.merge(ph.get(model), self.engine.last_timings)
                    s.set("phase_speeds", ph)
                self.update(item, status="done", progress=1, stage="Saved",
                            out_path=path, out_w=w, out_h=h,
                            seconds=round(took, 1),
                            out_preview=imaging.preview(data))
            except EngineError as exc:
                text = str(exc)
                self.update(item, status="ready" if text == "Cancelled" else "error",
                            error="" if text == "Cancelled" else text, stage="", progress=0)
            except Exception as exc:
                log.exception("job failed")
                self.update(item, status="error", error="Something went wrong: %s" % exc,
                            stage="", progress=0)
        self._model_in_use = None
        for i in self.items:
            if i["status"] == "queued":
                self.update(i, status="ready", stage="")
        self.emit("batch", {"state": "idle"})

    def _passes(self, item, passes, out_w, max_res, model, report, tuning, retry,
                history, part_mp, detail):
        """Upscale in one step, or in two (3x and more): a first step to the
        middle size, then from there to the final size. The upscaler adds
        more detail over two smaller steps than one big jump."""
        if len(passes) == 1:
            return self.engine.upscale(
                item["path"], item["w"], item["h"], item["scale_used"], model, max_res,
                on_progress=report, cancelled=self._cancel.is_set, tuning=tuning,
                retry_tuning=retry, history=history, part_mp=part_mp, detail=detail)
        folder = tempfile.mkdtemp(prefix="vistiq_pass_")
        try:
            path, w, h = item["path"], item["w"], item["h"]
            weights = [f * f for f in passes]
            weights = [x / sum(weights) for x in weights]
            done = 0.0
            data = None
            for n, f in enumerate(passes):
                last = n == len(passes) - 1
                share, base = weights[n], done

                def step(stage, frac, left, n=n, share=share, base=base):
                    report("%s · pass %d of %d" % (stage, n + 1, len(passes)),
                           None if frac is None else base + share * frac,
                           None if left is None or not last else left)

                target = out_w / float(w) if last else f
                data = self.engine.upscale(
                    path, w, h, target, model, max_res if last else wf.CEILING,
                    on_progress=step, cancelled=self._cancel.is_set, tuning=tuning,
                    retry_tuning=retry, history=history, part_mp=part_mp, detail=detail)
                self._learn_from_engine(model)
                done += share
                if not last:
                    path = os.path.join(folder, "pass%d.png" % (n + 1))
                    with open(path, "wb") as fh:
                        fh.write(data)
                    w, h = imaging.size_of(path)
            return data
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def _model_for_estimate(self):
        s = self.settings
        if self.engine.own or engine_setup.installed():
            return models.resolve(s.get("model"))
        m = s.get("model")
        if m == models.AUTO or (self.engine.models and m not in self.engine.models):
            return wf.DEFAULT_DIT if wf.DEFAULT_DIT in self.engine.models else (self.engine.models or [None])[0]
        return m

    def estimate(self, item, model=None):
        s = self.settings
        model = model or self._model_for_estimate()
        if not model:
            return 0
        scale = s.get("scale")
        max_res = s.max_side()
        ow, oh = wf.output_size(item["w"], item["h"], "max" if scale == "max" else float(scale), max_res)
        mps = _pass_mps(item["w"], item["h"], ow, oh, s.get("two_pass") is not False)
        hist = (s.get("phase_speeds") or {}).get(model) or {}
        per_mp = [hist.get(p) for p in ("encode", "upscale", "decode", "post")]
        if all(v is not None for v in per_mp):
            return round(sum(hist.get("load", 0) + mp * sum(per_mp) for mp in mps))
        rate = (s.get("speeds") or {}).get(model)
        return round(rate * sum(mps)) if rate else 0

    def estimates(self):
        model = self._model_for_estimate()
        return {i["id"]: self.estimate(i, model) for i in self.items
                if i["status"] in ("ready", "error", "queued")}

    def _learn_from_engine(self, model):
        s = self.settings
        if getattr(self.engine, "learned_part_mp", None):
            pm = dict(s.get("part_mp") or {})
            pm[model] = self.engine.learned_part_mp
            s.set("part_mp", pm)

    def restart(self):
        if self._worker and self._worker.is_alive():
            return "busy"
        if self.installer:
            return "busy"
        log.info("restarting for an update")
        self.shutdown()
        try:
            updater.relaunch()
        except Exception as exc:
            log.exception("relaunch failed")
            return "Couldn't restart: %s" % exc
        threading.Timer(0.3, lambda: self.window.destroy()).start()
        return "ok"

    def shutdown(self):
        self._cancel.set()
        if self.studio:
            self.studio.shutdown()
        if self.installer:
            self.installer.cancel()
        if not self.settings.get("keep_engine", True) or not self.engine.own:
            self.engine.stop()
        elif self.engine.process:
            # Leave it running for next time: let go of it without stopping it.
            self.engine.process = None


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
        app.emit("dropped", {})
        if app.studio and app.drop_target and app.drop_target != "upscale":
            imgs = [p for p in imaging.expand(paths)]
            if imgs:
                app.emit("studio-dropped", {"target": app.drop_target, "images": [_image_info(p) for p in imgs[:2]]})
            return
        if paths:
            added = app.add(paths)
            app.emit("added", added)
    return handler


def _image_info(path):
    try:
        w, h = imaging.size_of(path)
        return {"path": path, "name": os.path.basename(path), "w": w, "h": h,
                "preview": imaging.preview(path)}
    except Exception as exc:
        log.warning("can't read %s: %s", path, exc)
        return None


def _pass_mps(w, h, out_w, out_h, two_pass):
    """Megapixels each pass produces."""
    steps = wf.passes(w, out_w, two_pass)
    mps, f = [], 1.0
    for n, k in enumerate(steps):
        f *= k
        mps.append(out_w * out_h / 1e6 if n == len(steps) - 1 else w * h * f * f / 1e6)
    return mps


def _free_port():
    import socket
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def run(app_dir, version, notice=""):
    logs = os.path.join(data_dir(), "logs")
    os.makedirs(logs, exist_ok=True)
    logging.basicConfig(filename=os.path.join(logs, "vistiq.log"), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    log.info("%s %s starting from %s", flavor.NAME, version, app_dir)
    app = App(app_dir, version, notice)
    index = os.path.join(app_dir, "ui", "index.html")
    app.window = webview.create_window(
        flavor.NAME, url=index, js_api=Api(app), width=1280 if flavor.STUDIO else 1200, height=800 if flavor.STUDIO else 780,
        min_size=(980, 640), background_color="#FFFFFF", text_select=False)

    def on_loaded():
        try:
            from webview.dom import DOMEventHandler
            app.window.dom.document.events.drop += DOMEventHandler(_on_drop(app), prevent_default=True, stop_propagation=False)
        except Exception:
            log.exception("drag and drop unavailable")

    app.window.events.loaded += on_loaded
    app.window.events.closed += app.shutdown
    app.connect_async()
    app.updater.watch()
    # A port of its own each run: with a fixed one, the window could be
    # handed the previous version's page after an update.
    webview.start(private_mode=False, storage_path=os.path.join(data_dir(), "webview"),
                  http_port=_free_port())
    app.shutdown()
