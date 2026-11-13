"""A whole Create run through the real Studio code, with the real Settings
store, a stand-in image engine and no network. Catches crashes anywhere in
the flow (settings keys, live frames, painting, reference, timing)."""
import base64
import io
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))

from PIL import Image, ImageDraw  # noqa: E402


class FakeEngine:
    state, message = "ready", ""

    def __init__(self):
        self.runs = []

    def alive(self):
        return True

    def start(self, say=None):
        return True

    def upload(self, path):
        assert os.path.isfile(path), path
        return path

    def run(self, prompt, on_progress=None, cancelled=lambda: False):
        self.runs.append(prompt)
        if on_progress:
            on_progress(0.5)
        b = io.BytesIO()
        Image.new("RGB", (640, 360), (200, 30, 30)).save(b, "PNG")
        return b.getvalue()

    def interrupt(self):
        pass

    def stop(self):
        pass


class WholeRun(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = self.tmp.name
        self.env = mock.patch.dict(os.environ, {"APPDATA": t, "LOCALAPPDATA": t, "HOME": t, "USERPROFILE": t,
                                                "VISTIQ_FLAVOR": "studio"})
        self.env.start()
        from vistiq.settings import Settings
        from vistiq import studio, studio_jobs
        self.studio, self.sj = studio, studio_jobs
        self.settings = Settings()            # the real store: unknown keys raise
        self.settings.set("studio_home", os.path.join(t, "Studio"))
        self.events = []
        test = self

        class App:
            settings = self.settings

            def emit(self, kind, data):
                test.events.append((kind, data))

            def free_upscaler(self):
                pass

        with mock.patch("vistiq.bridge.Bridge.start", lambda *a, **k: None, create=True):
            self.st = studio_jobs.Studio(App())
        self.engine = self.st.engine = FakeEngine()
        self.ready = mock.patch.object(studio, "status", side_effect=lambda s: {"create_ready": True,
                                                                                 "juice_ready": False})
        self.ready.start()
        self.inst = mock.patch.object(studio, "engine_installed", lambda *a: True)
        self.inst.start()
        self.find = mock.patch.object(studio, "find", lambda key, s=None: "/models/%s.safetensors" % key)
        self.find.start()
        live = os.path.join(t, "live")
        os.makedirs(live)
        self.frame = os.path.join(live, "affinity_00005.jpg")
        Image.new("RGB", (1024, 571), "white").save(self.frame)

    def tearDown(self):
        self.ready.stop()
        self.inst.stop()
        self.find.stop()
        self.env.stop()
        self.tmp.cleanup()

    def go(self, job, drop_frame=False):
        jid = self.st.run(job)
        self.assertTrue(jid)
        if drop_frame:
            os.remove(self.frame)  # the live loop throws old frames away mid-run
        self.st._job.join(60)
        last = [d for k, d in self.events if k == "studio-job" and d.get("id") == jid][-1]
        self.assertEqual(last["state"], "done", last)
        return [d["result"] for k, d in self.events if k == "studio-result" and d["id"] == jid]

    def test_live_create_two_variations_then_warm(self):
        with mock.patch.object(self.st.affinity, "export_full", lambda need=None, prev=None: prev):
            r = self.go({"mode": "create", "image": self.frame, "name": "truck.af", "live_app": "affinity",
                         "preset": "sketch", "text": "pickup truck", "keep": 0.8, "variations": 2},
                        drop_frame=True)
        self.assertEqual(len(r), 2)
        for x in r:
            self.assertTrue(os.path.isfile(x["path"]))
        times = self.settings.get("studio_times")
        self.assertTrue(times.get("per") is not None, times)
        r2 = self.go({"mode": "create", "image": r[0]["path"], "text": "make it red", "variations": 1})
        self.assertEqual(len(r2), 1)
        self.assertTrue(self.st.status()["times"]["warm"])

    def test_create_from_photoshop_mirror(self):
        b = io.BytesIO()
        Image.new("RGB", (800, 450), "white").save(b, "JPEG")
        self.st.bridge.frame({"name": "flat 2.psd", "jpeg": base64.b64encode(b.getvalue()).decode()})
        live = [d for k, d in self.events if k == "studio-live"][-1]
        self.assertTrue(live["path"].startswith("live://") and live["preview"].startswith("data:image/jpeg"))
        r = self.go({"mode": "create", "image": live["path"], "name": "flat 2.psd", "live_app": "photoshop",
                     "preset": "sketch", "text": "interior", "variations": 1})
        self.assertEqual(len(r), 1)
        self.assertIn("flat 2", r[0]["name"])

    def test_paint_and_reference(self):
        src = os.path.join(self.tmp.name, "src.png")
        Image.new("RGB", (1200, 800), "white").save(src)
        m = Image.new("L", (1200, 800), 0)
        ImageDraw.Draw(m).rectangle([300, 200, 600, 400], fill=255)
        b = io.BytesIO()
        m.save(b, "PNG")
        r = self.go({"mode": "create", "image": src, "text": "a wheel", "variations": 1, "blend": 0.35,
                     "mask": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()})
        out = Image.open(r[0]["path"])
        self.assertEqual(out.size, (1200, 800))
        self.assertEqual(out.getpixel((50, 50)), (255, 255, 255))      # outside the paint: untouched
        self.assertNotEqual(out.getpixel((450, 300)), (255, 255, 255))  # inside: changed
        for preset in ("cmf", "style", "camera"):
            self.go({"mode": "reference", "image": src, "reference": src, "preset": preset, "variations": 1})


if __name__ == "__main__":
    unittest.main()
