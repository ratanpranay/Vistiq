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
from vistiq import studio  # noqa: E402


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

    def run(self, prompt, on_progress=None, cancelled=lambda: False, on_preview=None):
        self.runs.append(prompt)
        if on_progress:
            on_progress(0.5)
        if on_preview:
            on_preview(b"\xff\xd8preview")
        b = io.BytesIO()
        Image.new("RGB", (640, 360), (200, 30, 30)).save(b, "PNG")
        return b.getvalue()

    def interrupt(self):
        pass

    def stop(self):
        pass


def _texts(runs):
    """The prompt text of each run (a ComfyUI graph, or the Mac engine's plain job)."""
    out = []
    for p in runs:
        if not isinstance(p, dict):
            continue
        if isinstance(p.get("text"), str):
            out.append(p["text"])
        out += [n["inputs"]["text"] for n in p.values() if isinstance(n, dict) and n.get("class_type") == "CLIPTextEncode"
                and n["inputs"].get("text")]
    return out


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
        self.assertTrue([d for k, d in self.events if k == "studio-preview"], "no step pictures")
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

    def test_photoshop_selection_is_the_mask(self):
        import urllib.request
        from vistiq import bridge
        # The panel sends a white live picture and a selection covering the left half.
        b = io.BytesIO()
        Image.new("RGB", (800, 450), "white").save(b, "JPEG")
        self.st.bridge.frame({"name": "flat 2.psd", "jpeg": base64.b64encode(b.getvalue()).decode()})
        sel = Image.new("L", (400, 225), 0)
        ImageDraw.Draw(sel).rectangle([0, 0, 199, 224], fill=255)
        mask = bridge.Bridge.mask_from(sel.tobytes(), 400, 225, 800, 450, 1600, 900, 0, 0, 1600, 900)
        self.st.bridge.selection(mask)
        shown = [d for k, d in self.events if k == "studio-sel"][-1]
        self.assertTrue(shown["on"] and shown["preview"].startswith("data:image/png"))
        live = [d for k, d in self.events if k == "studio-live"][-1]
        r = self.go({"mode": "create", "image": live["path"], "name": "flat 2.psd", "live_app": "photoshop",
                     "text": "red", "variations": 1, "mask": "ps-selection", "blend": 0.1})
        out = Image.open(r[0]["path"]).convert("RGB")
        self.assertEqual(out.size, (800, 450))
        self.assertNotEqual(out.getpixel((100, 225)), (255, 255, 255))   # inside the selection: changed
        self.assertEqual(out.getpixel((700, 225)), (255, 255, 255))      # outside: untouched
        # Selection removed in Photoshop: the window is told.
        self.st.bridge.selection(None)
        self.assertFalse([d for k, d in self.events if k == "studio-sel"][-1]["on"])

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

    def test_create_with_references(self):
        src = os.path.join(self.tmp.name, "src.png")
        Image.new("RGB", (1200, 800), "white").save(src)
        ref = os.path.join(self.tmp.name, "ref.png")
        Image.new("RGB", (900, 900), "gray").save(ref)
        self.engine.runs.clear()
        r = self.go({"mode": "create", "image": src, "text": "ref 1 view", "variations": 1, "preset": "sketch",
                     "refs": [{"path": ref, "use": "camera"}, {"path": ref, "use": "materials"}]})
        self.assertEqual(len(r), 1)
        self.assertEqual([x["use"] for x in r[0]["meta"]["refs"]], ["camera", "materials"])
        texts = _texts(self.engine.runs)
        self.assertTrue(any("framing of image 2" in x and "image 2 view" in x for x in texts), texts)
        self.assertTrue(r[0]["meta"]["prompt"])
        # With the camera in words, only the materials picture goes in.
        self.engine.runs.clear()
        r = self.go({"mode": "create", "image": src, "text": "x", "variations": 1,
                     "refs": [{"path": ref, "use": "camera", "desc": "Overhead view."}, {"path": ref, "use": "materials"}]})
        texts = _texts(self.engine.runs)
        self.assertTrue(any("Overhead view." in x and "materials of image 2" in x for x in texts), texts)

    def test_instant_render(self):
        src = os.path.join(self.tmp.name, "src.png")
        Image.new("RGB", (1200, 800), "white").save(src)
        self.engine.runs.clear()
        r = self.go({"mode": "create", "image": src, "text": "parked in a desert", "variations": 1, "instant": True, "preset": "sketch"})
        self.assertTrue(r[0]["meta"]["instant"])
        texts = _texts(self.engine.runs)
        self.assertTrue(any(studio.INSTANT in x and "The scene: parked in a desert" in x for x in texts), texts)

    def test_camera_reference_does_not_hold_the_first_view(self):
        src = os.path.join(self.tmp.name, "src.png")
        Image.new("RGB", (1200, 800), "white").save(src)
        self.engine.runs.clear()
        self.go({"mode": "reference", "image": src, "reference": src, "preset": "camera", "keep": 1.0, "variations": 1})
        texts = _texts(self.engine.runs)
        self.assertTrue(texts)
        for t in texts:
            self.assertNotIn("camera view exactly as in the first image", t)
            self.assertNotIn("camera view stay identical", t)

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_your_workflow(self):
        src = os.path.join(self.tmp.name, "wf.png")
        Image.new("RGB", (1200, 800), "white").save(src)
        self.engine.runs.clear()
        with mock.patch.object(studio, "workflow_ready", lambda s=None: True):
            self.go({"mode": "create", "image": src, "text": "golden hour light", "variations": 1})
        g = [p for p in self.engine.runs if any(n.get("class_type") == "ReferenceLatent" for n in p.values() if isinstance(n, dict))]
        self.assertTrue(g, self.engine.runs)
        n = {v["class_type"]: v["inputs"] for v in g[0].values()}
        self.assertEqual(n["CLIPTextEncode"]["text"], "golden hour light")
        self.assertEqual(n["FluxGuidance"]["guidance"], 4.0)
        self.assertEqual(n["LoraLoaderModelOnly"]["strength_model"], 0.8)
        self.assertEqual(n["ImageScaleToTotalPixels"]["megapixels"], 2.0)

    def test_online_own_key(self):
        """Nano Banana with the person's own key: the selected part goes alone, comes back in place, each
        picture is counted, and the month's limit stops the run."""
        import io as _io
        from vistiq import online
        src = os.path.join(self.tmp.name, "door.png")
        Image.new("RGB", (800, 600), (40, 40, 40)).save(src)
        self.settings.set("nb_key", "AIzaTEST"); self.settings.set("nb_limit", 10.0)
        sent = []
        def fake(key, eng, imgs, text, size="1K", ratio="16:9", cancelled=None):
            sent.append((key, eng, imgs[0].size, size, text, len(imgs)))
            b = _io.BytesIO(); Image.new("RGB", imgs[0].size, (200, 30, 30)).save(b, "PNG"); return b.getvalue()
        from PIL import ImageDraw
        m = Image.new("L", (800, 600), 0); ImageDraw.Draw(m).rectangle([300, 200, 500, 400], fill=255)
        b = _io.BytesIO(); m.save(b, "PNG")
        mask = "data:image/png;base64," + __import__("base64").b64encode(b.getvalue()).decode()
        with mock.patch.object(online, "generate", fake):
            r = self.go({"mode": "create", "image": src, "text": "red handle", "variations": 2, "engine": "pro", "res": "4k", "mask": mask})
        self.assertEqual(len(r), 2)
        self.assertEqual(sent[0][1], "pro"); self.assertEqual(sent[0][3], "2K")        # 4K is made at 2K online
        self.assertEqual(sent[0][2], (800, 600)); self.assertEqual(sent[0][5], 2)      # the whole picture + the mask picture
        self.assertIn("mask", sent[0][4])
        out = Image.open(r[0]["path"]).convert("RGB")
        self.assertEqual(out.getpixel((20, 20)), (40, 40, 40))                          # outside: untouched
        self.assertGreater(out.getpixel((400, 300))[0], 150)                           # inside: changed
        u = online.usage(self.settings)
        self.assertEqual(u["n"], 2); self.assertAlmostEqual(u["usd"], 0.268, places=3); self.assertEqual(u["credits"], 8)
        self.assertIn("NanoBananaPro", r[0]["name"])
        # Enhance (before upscaling): the whole picture at 2K, words that keep the design
        sent.clear()
        with mock.patch.object(online, "generate", fake):
            r2 = self.go({"mode": "create", "image": src, "text": "", "variations": 1, "engine": "standard", "res": "2k", "enhance": True})
        self.assertEqual(len(r2), 1); self.assertEqual(sent[0][2], (800, 600)); self.assertEqual(sent[0][3], "2K")
        self.assertIn("Keep the design", sent[0][4])
        # the limit stops the next run before it costs anything
        self.settings.set("nb_limit", 0.2)
        jid = self.st.run({"mode": "create", "image": src, "text": "x", "variations": 1, "engine": "standard"})
        self.assertFalse(jid)
        self.assertIn("limit", [d for k, d in self.events if k == "studio-job"][-1]["message"])

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_relight_preset_varies(self):
        src = os.path.join(self.tmp.name, "cab.png")
        Image.new("RGB", (1200, 800), "white").save(src)
        self.engine.runs.clear()
        with mock.patch.object(studio, "workflow_ready", lambda s=None: True), \
                mock.patch.object(self.st, "_read", lambda *a, **k: "kind=interior side=rear"):
            self.go({"mode": "create", "image": src, "text": "night lighting", "variations": 2, "light": "night"})
        texts = [v["inputs"]["text"] for p in self.engine.runs for v in p.values()
                 if isinstance(v, dict) and v.get("class_type") == "CLIPTextEncode"]
        self.assertEqual(len(texts), 2, texts)
        self.assertNotEqual(texts[0], texts[1])                     # a different light each
        self.assertTrue(all("light lines" in t and "headlights" not in t and "no added gloss" in t for t in texts), texts)

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_qwen_detail_pass(self):
        src = os.path.join(self.tmp.name, "big.png")
        Image.new("RGB", (2400, 1350), "white").save(src)
        self.engine.runs.clear()
        with mock.patch.object(studio, "use_qwenedit", lambda s=None: True), \
                mock.patch.object(self.st, "_read", lambda *a, **k: ""):
            lab = mock.patch.object(self.sj, "_lab", lambda: {"detail": True, "workflow": False})
            lab.start()
            r = self.go({"mode": "create", "image": src, "text": "red seats", "variations": 1})
            prompts = [n["inputs"]["prompt"] for p in self.engine.runs for n in p.values()
                       if isinstance(n, dict) and n.get("class_type") == "TextEncodeQwenImageEditPlus"]
            self.assertGreater(len(prompts), 2)
            self.assertTrue(all(studio.QE_DETAIL_SRC in t for t in prompts[1:]), prompts[1:])
            self.assertEqual(Image.open(r[0]["path"]).size, (1280, 720), r[0])
            # Off in Settings: one run, the model's own size.
            lab.stop()
            self.engine.runs.clear()
            r = self.go({"mode": "create", "image": src, "text": "red seats", "variations": 1})
            self.assertEqual(len(self.engine.runs), 1)

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_3d_view_names_the_view(self):
        src = os.path.join(self.tmp.name, "car.png")
        Image.new("RGB", (1600, 900), "white").save(src)
        self.engine.runs.clear()
        with mock.patch.object(studio, "use_qwenedit", lambda s=None: True), mock.patch.object(studio, "angles_ready", lambda s=None: False), \
                mock.patch.object(self.st, "_read", lambda path, use, *a, **k: "kind=exterior; side=front-left; height=eye" if use == "view" else "A boxy SUV with a long roof" if use == "design" else "EXPANDED"):
            r = self.go({"mode": "create", "image": src, "text": "", "variations": 1,
                         "view": {"yaw": 90, "pitch": -20, "dist": 0, "lens": "normal", "target": "rear-left"}})
        prompts = [n["inputs"]["prompt"] for p in self.engine.runs for n in p.values()
                   if isinstance(n, dict) and n.get("class_type") == "TextEncodeQwenImageEditPlus"]
        self.assertTrue(any("rear-left three-quarter view" in t and "low camera" in t and "logos" in t for t in prompts), prompts)
        self.assertFalse(any("EXPANDED" in t for t in prompts))
        self.assertTrue(any("The design: A boxy SUV with a long roof." in t and "look exactly" in t for t in prompts), prompts)
        self.assertFalse(any("sketch" in t for t in prompts), prompts)
        # a new view: the model's own small reference, so the camera can move
        enc = [n for p in self.engine.runs for n in p.values() if isinstance(n, dict) and n.get("class_type") == "TextEncodeQwenImageEditPlus"]
        self.assertTrue(all("vae" in n["inputs"] for n in enc))
        self.assertEqual(r[0]["meta"]["view"]["target"], "rear-left")


if __name__ == "__main__":
    unittest.main()
