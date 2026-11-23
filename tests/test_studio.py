import base64
import time
import io
import json
import os
import struct
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))

from PIL import Image, ImageChops, ImageDraw  # noqa: E402

from vistiq import studio, studio_jobs as sj  # noqa: E402


def fake_lora(path, keys):
    head = {k: {"dtype": "F16", "shape": shape, "data_offsets": [0, 0]} for k, shape in keys.items()}
    raw = json.dumps(head).encode()
    with open(path, "wb") as fh:
        fh.write(struct.pack("<Q", len(raw)) + raw)


class Settings(dict):
    def get(self, k, d=None):
        return dict.get(self, k, d)

    def set(self, k, v):
        self[k] = v


class Families(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def fam(self, keys):
        p = os.path.join(self.tmp.name, "l.safetensors")
        fake_lora(p, keys)
        return studio.lora_family(p)

    def test_klein_9b(self):
        keys = {"diffusion_model.double_blocks.%d.img_attn.qkv.lora_A.weight" % i: [16, 4096] for i in range(8)}
        self.assertEqual(self.fam(keys), "klein9b")

    def test_flux1(self):
        keys = {"lora_unet_double_blocks_%d_img_attn_qkv.lora_down.weight" % i: [16, 3072] for i in range(19)}
        self.assertEqual(self.fam(keys), "flux1")

    def test_flux1_diffusers(self):
        keys = {"transformer.transformer_blocks.%d.attn.to_q.lora_A.weight" % i: [16, 3072] for i in range(19)}
        self.assertEqual(self.fam(keys), "flux1")

    def test_flux1_with_text_encoder_keys(self):
        keys = {"lora_te1_text_model_encoder_layers_0_mlp_fc1.lora_down.weight": [16, 768]}
        keys.update({"lora_unet_single_blocks_%d_linear1.lora_down.weight" % i: [16, 3072] for i in range(38)})
        self.assertEqual(self.fam(keys), "flux1")

    def test_sdxl(self):
        keys = {"lora_unet_input_blocks_4_1_transformer_blocks_0_attn2_to_k.lora_down.weight": [8, 2048]}
        self.assertEqual(self.fam(keys), "sdxl")

    def test_broken_file(self):
        p = os.path.join(self.tmp.name, "bad.safetensors")
        open(p, "wb").write(b"nonsense")
        self.assertEqual(studio.lora_family(p), "unknown")


class Folders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = Settings(studio_home=os.path.join(self.tmp.name, "Studio"))

    def tearDown(self):
        self.tmp.cleanup()

    def comfy(self):
        m = os.path.join(self.tmp.name, "ComfyUI", "models")
        for sub, name in (("diffusion_models", "flux-2-klein-9b-fp8mixed.safetensors"),
                          ("text_encoders", "qwen_3_8b_fp8mixed.safetensors"),
                          ("vae", "flux2-vae.safetensors"), ("loras", "Klein-consistency.safetensors"),
                          ("loras", "AutoInterior.safetensors"), ("checkpoints", "other.safetensors")):
            os.makedirs(os.path.join(m, sub), exist_ok=True)
            open(os.path.join(m, sub, name), "wb").write(b"x" * 10)
        return m

    @unittest.skipIf(sys.platform == "darwin", "the ComfyUI model files are the Windows set-up")
    def test_import_links_known_files_and_loras(self):
        m = self.comfy()
        self.assertFalse(studio.status(self.s)["create_ready"])
        taken = studio.import_from(os.path.dirname(m), self.s)
        self.assertIn("AutoInterior.safetensors", taken)
        self.assertNotIn("other.safetensors", taken)
        st = studio.status(self.s)
        self.assertTrue(st["create_ready"])
        self.assertFalse(st["juice_ready"])
        self.assertEqual(self.s["comfy_models"], m)
        # Again: nothing new.
        self.assertEqual(studio.import_from(m, self.s), [])

    @unittest.skipIf(sys.platform == "darwin", "ComfyUI workflows are the Windows set-up")
    def test_prompts(self):
        studio.import_from(self.comfy(), self.s)
        p = studio.create_prompt(self.s, "a.png", "text", keep=0.7, seed=5)
        self.assertEqual(p["4"]["inputs"]["strength_model"], 0.7)
        self.assertEqual(p["40"]["inputs"]["model"], ["4", 0])
        self.assertEqual(p["40"]["inputs"]["steps"], studio.STEPS)
        p0 = studio.create_prompt(self.s, "a.png", "text", keep=0)
        self.assertNotIn("4", p0)
        self.assertEqual(p0["40"]["inputs"]["model"], ["1", 0])
        r = studio.reference_prompt(self.s, "a.png", "b.png", "t", mode="camera")
        self.assertEqual(r["22"]["inputs"]["conditioning"], ["24", 0])
        self.assertEqual(r["24"]["inputs"]["conditioning"], ["21", 0])
        self.assertEqual(r["30"]["inputs"]["image"], ["14", 0])
        r2 = studio.reference_prompt(self.s, "a.png", "b.png", "t", mode="cmf")
        self.assertEqual(r2["30"]["inputs"]["image"], ["11", 0])
        self.assertEqual(r2["12"]["inputs"]["pixels"], ["17", 0])       # the design's lines
        self.assertNotIn("4", r2)                                       # no design lock
        sj._add_lora(p, "look.safetensors", 0.6)
        self.assertEqual(p["40"]["inputs"]["model"], ["7", 0])
        self.assertEqual(p["7"]["inputs"]["model"], ["4", 0])
        # Every link points at a node that exists.
        for prompt in (p, p0, r, r2):
            for node in prompt.values():
                for v in node["inputs"].values():
                    if isinstance(v, list):
                        self.assertIn(v[0], prompt)

    def test_model_paths_file(self):
        with mock.patch.object(studio, "portable_dir", return_value=os.path.join(self.tmp.name, "p")):
            os.makedirs(os.path.join(self.tmp.name, "p", "ComfyUI"))
            studio.write_model_paths(self.s)
            text = open(os.path.join(self.tmp.name, "p", "ComfyUI", "extra_model_paths.yaml")).read()
        self.assertIn("loras: loras", text)
        self.assertNotIn("\\", text)

    def test_text(self):
        self.assertIn("red seats", studio.build_text("cmf", "red seats"))
        self.assertTrue(studio.build_text("cmf", "red paint").endswith(studio.CRISP))
        self.assertTrue(studio.build_text("cmf", "red seats").endswith(studio.CLEAN))
        self.assertTrue(studio.build_text("", "just this").startswith("just this"))
        self.assertTrue(studio.build_text("", ""))

    def test_default_light(self):
        # Good light comes by default; a prompt that sets its own mood wins.
        self.assertIn(studio.LIGHT, studio.build_text("photo", "beige leather, keep the ambient lighting"))
        self.assertIn(studio.LIGHT, studio.build_text("photo", ""))
        self.assertNotIn(studio.LIGHT, studio.build_text("photo", "the same car at night"))
        self.assertNotIn(studio.LIGHT, studio.build_text("photo", "Golden hour sunset"))

    def test_interior_materials_stay_clean(self):
        # Pranay's own light wording still gets press-photo light, new materials, no "rich contrast".
        t = studio.build_text("sketch", "yellow nappa seats, burgundy alcantara lower door. lighting is morning 11am")
        self.assertIn(studio.FINISH_MAT, t)
        self.assertIn(studio.SOFT_LIGHT, t)
        self.assertNotIn("rich contrast", t)
        self.assertNotIn(studio.FINISH_MAT, studio.build_text("sketch", "silver sports car, side view"))
        self.assertNotIn(studio.FINISH_MAT, studio.build_text("lighting", "SUV interior, golden hour"))

    def test_locks_lead_the_prompt(self):
        t = studio.with_locks(studio.build_text("lighting", "SUV interior at golden hour"),
                              {"design": True, "materials": True, "light": False, "camera": True}, False)
        self.assertTrue(t.startswith(studio.LOCK_TEXT["design"]))
        self.assertIn(studio.LOCK_TEXT["materials"], t)
        self.assertNotIn(studio.LOCK_TEXT["light"], t)
        # Light locked: our own light text goes, so it can't fight the picture's.
        t = studio.with_locks(studio.build_text("photo", "SUV interior, red seats"),
                              {"design": True, "materials": False, "light": True, "camera": True}, False)
        self.assertNotIn(studio.LIGHT_INT, t)
        self.assertIn(studio.LOCK_TEXT["light"], t)
        # A sketch: the design hold comes from elsewhere; only materials/light rules here.
        t = studio.with_locks(studio.build_text("sketch", "interior, tan seats"), {"design": True, "materials": True}, True)
        self.assertTrue(t.startswith(studio.SKETCH_LOCK_TEXT["materials"]))

    def test_sketch_colours_are_placeholders(self):
        t = studio.with_locks(studio.build_text("sketch", "interior, all white nappa leather"), {"design": True, "materials": False}, True)
        self.assertTrue(t.startswith(studio.SKETCH_RECOLOUR))
        t = studio.with_locks(studio.build_text("sketch", "interior, all white nappa leather"), {"design": True, "materials": True}, True)
        self.assertNotIn(studio.SKETCH_RECOLOUR, t)

    def test_light_follows_prompt(self):
        # No interior/exterior switch: the words in the prompt pick the look.
        self.assertEqual(studio.light_for("SUV interior, tan leather seats"), studio.LIGHT_INT)
        self.assertEqual(studio.light_for("new dashboard with purple LED strip"), studio.LIGHT_INT)
        self.assertEqual(studio.light_for("silver sports car, side view"), studio.LIGHT_EXT)
        self.assertEqual(studio.light_for("a lamp on a table"), studio.LIGHT)
        self.assertEqual(studio.light_for("SUV interior at night"), studio.LIGHT_NIGHT)
        self.assertEqual(studio.light_for("white cabin, night mode"), studio.LIGHT_NIGHT)
        self.assertEqual(studio.light_for("the same car at night"), "")
        self.assertEqual(studio.light_for("sports car at night"), "")
        self.assertEqual(studio.light_for("SUV interior at sunset"), "")


class Masks(unittest.TestCase):
    def test_outside_the_paint_stays_identical(self):
        orig = Image.effect_noise((900, 600), 60).convert("RGB")
        mask = Image.new("L", orig.size, 0)
        ImageDraw.Draw(mask).ellipse((400, 250, 520, 330), fill=255)
        box = sj.crop_box(mask, orig.size)
        self.assertLessEqual(box[2] - box[0], 900)
        self.assertGreaterEqual(box[2] - box[0], sj.MIN_CROP)
        self.assertTrue(box[0] <= 400 and box[2] >= 520 and box[1] <= 250 and box[3] >= 330)
        result = Image.new("RGB", (1024, 1024), (255, 0, 0))     # the model's output, any size
        out = sj.composite(orig, result, mask, box, 12)
        self.assertEqual(out.size, orig.size)
        far = Image.new("L", orig.size, 255)
        ImageDraw.Draw(far).rectangle((360, 210, 560, 370), fill=0)
        diff = ImageChops.difference(out, orig)
        self.assertEqual(ImageChops.multiply(diff.convert("L"), far).getextrema(), (0, 0))
        self.assertEqual(out.getpixel((460, 290)), (255, 0, 0))

    def test_mask_from_the_window(self):
        m = Image.new("RGBA", (200, 100), (0, 0, 0, 0))
        ImageDraw.Draw(m).rectangle((10, 10, 50, 50), fill=(138, 43, 242, 255))
        buf = io.BytesIO()
        m.save(buf, "PNG")
        url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        got = sj.decode_mask(url, (400, 200))
        self.assertEqual(got.size, (400, 200))
        self.assertEqual(got.getpixel((60, 60)), 255)
        self.assertEqual(got.getpixel((300, 150)), 0)

    def test_empty_mask(self):
        self.assertIsNone(sj.crop_box(Image.new("L", (100, 100), 0), (100, 100)))

    def test_library_kinds_and_names(self):
        self.assertEqual(sj.kind_of("Vistiq_a_create_v1.png"), "create")
        self.assertEqual(sj.kind_of("Vistiq_a_camera_v2.png"), "reference")
        self.assertEqual(sj.kind_of("Vistiq_a_4x.png"), "upscale")
        self.assertEqual(sj._strip_tags("seat_create_v2"), "seat")
        self.assertEqual(sj._strip_tags("seat_refine_v1_3"), "seat")


if __name__ == "__main__":
    unittest.main()


class Picker(unittest.TestCase):
    """The click-to-select plumbing, with stand-ins for the two ONNX models."""

    def test_select_makes_a_mask_of_the_canvas_size(self):
        import numpy as np
        from vistiq import picker

        class Arg:
            def __init__(self, name, shape=None, type_="tensor(float)"):
                self.name, self.shape, self.type = name, shape, type_

        class Enc:
            def get_inputs(self):
                return [Arg("image", [1, 3, 1024, 1024])]

            def get_outputs(self):
                return [Arg("high_res_feats_0"), Arg("high_res_feats_1"), Arg("image_embed")]

            def run(self, _names, feeds):
                assert feeds["image"].shape == (1, 3, 1024, 1024)
                return [np.zeros(1), np.zeros(1), np.zeros(1)]

        class Dec:
            seen = None

            def get_inputs(self):
                return [Arg(n) for n in ("image_embed", "high_res_feats_0", "high_res_feats_1", "point_coords",
                                         "point_labels", "mask_input", "has_mask_input")]

            def run(self, _names, feeds):
                Dec.seen = feeds
                m = np.full((1, 3, 256, 256), -1, np.float32)
                m[0, 1, 64:192, 32:128] = 1          # the best-scored mask
                return [m, np.array([[0.1, 0.9, 0.2]], np.float32)]

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "a.png")
            Image.new("RGB", (1600, 900), "gray").save(path)
            s = picker.Selector()
            s._enc, s._dec = Enc(), Dec()
            mask = s.select(tmp, path, [(0.25, 0.5, True), (0.75, 0.5, False)], (800, 450))
        self.assertEqual(mask.size, (800, 450))
        x0, y0, x1, y1 = mask.getbbox()
        self.assertTrue(90 <= x0 <= 110 and 390 <= x1 <= 410 and 105 <= y0 <= 120 and 330 <= y1 <= 345)
        self.assertEqual(Dec.seen["point_coords"].tolist(), [[[256.0, 512.0], [768.0, 512.0]]])
        self.assertEqual(Dec.seen["point_labels"].tolist(), [[1.0, 0.0]])
        self.assertTrue(picker.to_png(mask).startswith(b"\x89PNG"))


class PhotoshopLink(unittest.TestCase):
    def test_frames_arrive_and_old_ones_go(self):
        import urllib.request
        from vistiq import bridge
        got = []
        with tempfile.TemporaryDirectory() as tmp:
            b = bridge.Bridge(tmp, got.append)
            with mock.patch.object(bridge, "PORT", 18394):
                self.assertTrue(b.start())
            try:
                ping = urllib.request.urlopen("http://127.0.0.1:18394/ping", timeout=5).read()
                self.assertIn(b"Vistiq Studio", ping)
                buf = io.BytesIO()
                Image.new("RGB", (64, 32), "red").save(buf, "JPEG")
                body = json.dumps({"name": "sketch.psd", "jpeg": base64.b64encode(buf.getvalue()).decode()}).encode()
                for _ in range(6):
                    req = urllib.request.Request("http://127.0.0.1:18394/frame", data=body,
                                                 headers={"Content-Type": "application/json"})
                    self.assertEqual(urllib.request.urlopen(req, timeout=5).status, 200)
                raw = Image.new("RGBA", (40, 20), (0, 0, 255, 255)).tobytes()
                req = urllib.request.Request("http://127.0.0.1:18394/raw?w=40&h=20&c=4&name=a%20b.psd", data=raw,
                                             headers={"Content-Type": "application/octet-stream"})
                self.assertEqual(urllib.request.urlopen(req, timeout=5).status, 200)
                self.assertEqual((got[-1]["w"], got[-1]["name"]), (40, "a b.psd"))
                got.pop()
                self.assertEqual((got[-1]["w"], got[-1]["h"], got[-1]["name"]), (64, 32, "sketch.psd"))
                self.assertEqual(os.listdir(tmp), [])            # a mirror: nothing written to disk
                self.assertTrue(got[-1]["path"].startswith(bridge.LIVE))
            finally:
                b.stop()

    def test_panel_package(self):
        import zipfile
        from vistiq import bridge
        with tempfile.TemporaryDirectory() as tmp:
            ccx = bridge.package(os.path.join(ROOT, "app"), tmp)
            names = zipfile.ZipFile(ccx).namelist()
        self.assertIn("manifest.json", names)
        self.assertIn("main.js", names)
        m = json.load(open(os.path.join(ROOT, "app", "photoshop", "manifest.json")))
        self.assertEqual(m["manifestVersion"], 5)


class LinkTakeover(unittest.TestCase):
    """A Vistiq Studio left running in the background must hand the Photoshop link to the new one."""

    def test_new_studio_takes_the_link(self):
        import time
        import urllib.request
        from vistiq import bridge
        with tempfile.TemporaryDirectory() as t, mock.patch.object(bridge, "PORT", 18396):
            got = {"old": 0, "new": 0}
            old = bridge.Bridge(os.path.join(t, "a"), lambda f: got.__setitem__("old", got["old"] + 1))
            released = []
            old.on_released = lambda: released.append(1)
            self.assertTrue(old.start())
            new = bridge.Bridge(os.path.join(t, "b"), lambda f: got.__setitem__("new", got["new"] + 1))
            try:
                self.assertTrue(new.start())
                urllib.request.urlopen(urllib.request.Request(
                    "http://127.0.0.1:18396/raw?w=2&h=2&c=3&name=x", data=bytes([9] * 12), method="POST"),
                    timeout=3).read()
                time.sleep(0.2)
                self.assertEqual(released, [1])
                self.assertEqual(got, {"old": 0, "new": 1})
            finally:
                new.stop()
                old.stop()


class Navigator(unittest.TestCase):
    """The Photoshop link behaves like a navigator."""

    def setUp(self):
        from vistiq import bridge
        self.bridge_mod = bridge
        self.tmp = tempfile.TemporaryDirectory()
        self.port = mock.patch.object(bridge, "PORT", 18397)
        self.port.start()
        self.frames, self.states = [], []
        self.b = bridge.Bridge(self.tmp.name, self.frames.append)
        self.b.on_state = lambda st, m: self.states.append(st)
        self.b.on_old_panel = lambda: self.states.append("old-panel")

    def tearDown(self):
        self.b.stop()
        self.port.stop()
        self.tmp.cleanup()

    def get(self, path):
        import urllib.request
        return json.loads(urllib.request.urlopen("http://127.0.0.1:18397" + path, timeout=3).read())

    def post_raw(self, key):
        import urllib.request
        urllib.request.urlopen(urllib.request.Request(
            "http://127.0.0.1:18397/raw?w=2&h=2&c=3&name=a.psd&key=" + key, data=bytes([9] * 12),
            method="POST"), timeout=3).read()

    def test_mirror_in_memory_file_only_when_used(self):
        # Leftovers from older versions are cleared and nothing new is written.
        for n in range(46, 50):
            Image.new("RGB", (2, 2)).save(os.path.join(self.tmp.name, "photoshop_%05d.jpg" % n))
        self.assertTrue(self.b.start())
        for _ in range(5):
            self.post_raw("k1")
        self.assertEqual(len(self.frames), 5)
        self.assertEqual(os.listdir(self.tmp.name), [])
        self.assertTrue(self.frames[-1]["path"].startswith(self.bridge_mod.LIVE))
        self.assertTrue(self.b.latest)

    def test_ping_says_what_studio_has(self):
        from vistiq.bridge import PANEL_VERSION
        self.assertTrue(self.b.start())
        v = "&v=" + PANEL_VERSION
        self.assertEqual(self.get("/ping?key=k1" + v)["have"], "")   # panel sees a mismatch and sends
        self.post_raw("k1")
        self.assertEqual(self.get("/ping?key=k1" + v)["have"], "k1")
        self.get("/ping?key=none" + v)
        self.assertIn("nodoc", self.states)
        self.assertNotIn("old-panel", self.states)

    def test_old_panel_is_noticed_once(self):
        import time
        self.assertTrue(self.b.start())
        self.get("/ping?key=k1")
        self.get("/ping?key=k1")
        time.sleep(0.2)
        self.assertEqual(self.states.count("old-panel"), 1)

    def test_closing_photoshop_is_noticed(self):
        import time
        self.assertTrue(self.b.start())
        self.post_raw("k1")
        self.b.last_seen = time.time() - 10
        time.sleep(1.5)
        self.assertIn("closed", self.states)

    def test_panel_version_matches(self):
        with open(os.path.join(ROOT, "app", "photoshop", "manifest.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["version"], self.bridge_mod.PANEL_VERSION)
        with open(os.path.join(ROOT, "app", "photoshop", "main.js"), encoding="utf-8") as fh:
            self.assertIn('const VERSION = "%s"' % self.bridge_mod.PANEL_VERSION, fh.read())


class SendToPhotoshop(unittest.TestCase):
    def test_queue_fetch_place(self):
        import time
        import urllib.request
        from vistiq import bridge
        with tempfile.TemporaryDirectory() as t, mock.patch.object(bridge, "PORT", 18398):
            b = bridge.Bridge(t, lambda f: None)
            done = []
            b.on_placed = lambda name, ok, msg: done.append((name, ok))
            self.assertTrue(b.start())
            try:
                pic = os.path.join(t, "Vistiq_flat 2_create_v1.png")
                Image.new("RGB", (8, 4), "red").save(pic)
                self.assertFalse(b.send(pic, "x"))                      # Photoshop not seen: refuse
                base = "http://127.0.0.1:18398"
                urllib.request.urlopen(base + "/ping?key=k&v=" + bridge.PANEL_VERSION, timeout=3).read()
                pid = b.send(pic, "Vistiq · flat 2")
                self.assertTrue(pid)
                ping = json.loads(urllib.request.urlopen(base + "/ping?key=k&v=" + bridge.PANEL_VERSION,
                                                         timeout=3).read())
                self.assertEqual(ping["place"], [{"id": pid, "name": "Vistiq · flat 2", "ext": ".png"}])
                body = urllib.request.urlopen(base + "/file?id=" + pid, timeout=3).read()
                self.assertEqual(Image.open(io.BytesIO(body)).size, (8, 4))
                ping = json.loads(urllib.request.urlopen(base + "/ping?key=k&v=" + bridge.PANEL_VERSION,
                                                         timeout=3).read())
                self.assertEqual(ping["place"], [])                      # handed out once
                urllib.request.urlopen(urllib.request.Request(base + "/placed?id=%s&ok=1" % pid, data=b"",
                                                              method="POST"), timeout=3).read()
                self.assertEqual(done, [("Vistiq · flat 2", True)])
            finally:
                b.stop()


class PromptGraph(unittest.TestCase):
    """Every node a prompt points at exists and nothing points in a circle, for all tiers with a style."""

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_no_cycles_any_tier(self):
        for tier_name, keys in (("best", ("klein", "qwen", "vae2", "consistency")),
                                ("good", ("klein4b", "qwen4b", "vae2")),
                                ("best", ("klein", "qwen", "vae2", "consistency", "flux3", "qwen3vl")),
                                ):
            with tempfile.TemporaryDirectory() as t:
                s = Settings(studio_home=t, studio_tier=tier_name)
                md = studio.models_dir(s)
                for key in keys:
                    spec = next(f for f in studio.FILES if f["key"] == key)
                    os.makedirs(os.path.join(md, spec["folder"]), exist_ok=True)
                    open(os.path.join(md, spec["folder"], spec["names"][0]), "wb").close()
                for p in (studio.create_prompt(s, "a.png", "x", keep=0.8),
                          studio.reference_prompt(s, "a.png", "b.png", "x", "cmf", 0.8)):
                    sj._add_lora(p, "style.safetensors", 0.8)
                    for nid, node in p.items():
                        for v in node["inputs"].values():
                            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                                self.assertIn(v[0], p, (tier_name, nid, v))
                    for start in p:
                        seen, todo = set(), [start]
                        while todo:
                            n = todo.pop()
                            for v in p[n]["inputs"].values():
                                if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                                    self.assertNotEqual(v[0], start, (tier_name, "cycle at", start))
                                    if v[0] not in seen:
                                        seen.add(v[0]); todo.append(v[0])


class SelectionMask(unittest.TestCase):
    def test_selection_bounds_land_in_place(self):
        from vistiq import bridge
        # A selection returned only for its bounds (doc 2000x1000, sel at 1000..2000 x 0..500),
        # picture downscaled to 1000x500: the mask lands on the right-top quarter.
        sel = Image.new("L", (500, 250), 255).tobytes()
        m = bridge.Bridge.mask_from(sel, 500, 250, 1000, 500, 2000, 1000, 1000, 0, 2000, 500)
        self.assertEqual(m.size, (1000, 500))
        self.assertEqual(m.getpixel((750, 100)), 255)
        self.assertEqual(m.getpixel((250, 100)), 0)
        self.assertEqual(m.getpixel((750, 400)), 0)
        self.assertIsNone(bridge.Bridge.mask_from(bytes(500 * 250), 500, 250, 1000, 500, 2000, 1000, 0, 0, 2000, 1000))

    def test_sel_endpoint(self):
        import urllib.request
        from vistiq import bridge
        with tempfile.TemporaryDirectory() as t, mock.patch.object(bridge, "PORT", 18399):
            got = []
            b = bridge.Bridge(t, lambda f: None)
            b.on_sel = got.append
            self.assertTrue(b.start())
            try:
                base = "http://127.0.0.1:18399"
                q = "/sel?w=4&h=2&fw=4&fh=2&dw=4&dh=2&l=0&t=0&r=4&b=2&key=k"
                urllib.request.urlopen(urllib.request.Request(base + q, data=bytes([255, 255, 0, 0] * 2), method="POST"), timeout=3).read()
                self.assertEqual(got[-1].getpixel((0, 0)), 255)
                self.assertEqual(got[-1].getpixel((3, 0)), 0)
                urllib.request.urlopen(urllib.request.Request(base + "/sel?none=1&key=k", data=b"", method="POST"), timeout=3).read()
                self.assertIsNone(got[-1])
            finally:
                b.stop()


class OpenLine(unittest.TestCase):
    """The panel's /wait is answered the moment Studio needs a picture."""

    def setUp(self):
        from vistiq import bridge
        self.bridge = bridge
        self.tmp = tempfile.TemporaryDirectory()
        self.port = mock.patch.object(bridge, "PORT", 18400)
        self.port.start()
        self.b = bridge.Bridge(self.tmp.name, lambda f: None)
        self.assertTrue(self.b.start())

    def tearDown(self):
        self.b.stop()
        self.port.stop()
        self.tmp.cleanup()

    def wait(self, key, results):
        import urllib.request
        t = time.time()
        body = json.loads(urllib.request.urlopen("http://127.0.0.1:18400/wait?key=%s&v=%s" % (key, self.bridge.PANEL_VERSION),
                                                 timeout=30).read())
        results.append((round(time.time() - t, 1), body))

    def test_answers(self):
        import threading
        r = []
        self.wait("k1", r)                                   # Studio has nothing yet: answered at once
        self.assertLess(r[-1][0], 1)
        self.b.have = "k1"
        th = threading.Thread(target=self.wait, args=("k1", r)); th.start()
        time.sleep(1.2)
        self.assertEqual(len(r), 1)                          # up to date: the line stays open
        self.b.poke()                                        # Connect clicked / Studio started
        th.join(5)
        self.assertEqual(len(r), 2)
        self.assertLess(r[-1][0], 2.5)
        self.b.have = "k1"
        th = threading.Thread(target=self.wait, args=("k1", r)); th.start()
        time.sleep(0.5)
        pic = os.path.join(self.tmp.name, "x.png")
        Image.new("RGB", (4, 4)).save(pic)
        self.assertTrue(self.b.send(pic, "x"))               # To Photoshop: answered at once
        th.join(5)
        self.assertEqual(len(r), 3)
        self.assertEqual(r[-1][1]["place"][0]["name"], "x")


class Previews(unittest.TestCase):
    def test_preview_messages(self):
        jpeg = b"\xff\xd8" + b"x" * 20
        self.assertEqual(studio._preview_bytes((1).to_bytes(4, "big") + (1).to_bytes(4, "big") + jpeg), jpeg)
        meta = b'{"prompt_id":"p"}'
        raw = (4).to_bytes(4, "big") + len(meta).to_bytes(4, "big") + meta + jpeg
        self.assertEqual(studio._preview_bytes(raw), jpeg)
        self.assertIsNone(studio._preview_bytes((3).to_bytes(4, "big") + b"x" * 20))


class Finish(unittest.TestCase):
    def test_finish_is_clean_never_burnt(self):
        # Highlights roll off instead of clipping, blacks aren't crushed,
        # colours aren't pushed, and it gets crisper.
        import numpy as np
        from PIL import Image, ImageFilter
        from vistiq import studio_jobs
        rng = np.random.default_rng(1)
        base = np.zeros((90, 160, 3), np.float32)
        base[..., 0] = np.linspace(0, 255, 160)[None, :]
        base[..., 1] = np.linspace(0, 255, 160)[None, :] * 0.8
        base[..., 2] = np.linspace(20, 255, 90)[:, None]
        base[30:60, 60:100] = 255                       # a blown window
        base = np.clip(base + rng.integers(-6, 6, base.shape), 0, 255).astype(np.uint8)
        im = Image.fromarray(base)
        out = studio_jobs.finish(im)
        a = np.asarray(out)
        self.assertEqual(out.size, im.size)
        self.assertLess(a.max(), 250)                   # nothing hard white
        self.assertGreaterEqual(a.min(), 4)             # no crushed black
        sat = lambda x: np.asarray(x.convert("HSV"))[..., 1].mean()
        self.assertLessEqual(sat(out), sat(im) * 1.03)  # colour not boosted
        edges = lambda x: np.asarray(x.convert("L").filter(ImageFilter.FIND_EDGES)).mean()
        self.assertGreater(edges(out), edges(im) * 0.95)


class Flux3(unittest.TestCase):
    """FLUX 3 Klein takes over when its files are here; Klein 9B otherwise."""

    def _settings(self, t, keys):
        s = Settings(studio_home=t, studio_tier="best")
        md = studio.models_dir(s)
        for key in keys:
            spec = next(f for f in studio.FILES if f["key"] == key)
            os.makedirs(os.path.join(md, spec["folder"]), exist_ok=True)
            open(os.path.join(md, spec["folder"], spec["names"][0]), "wb").close()
        return s

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_create_with_references(self):
        for keys in (("klein", "qwen", "vae2", "consistency"), ("klein", "qwen", "vae2", "consistency", "flux3", "qwen3vl")):
            with tempfile.TemporaryDirectory() as t:
                s = self._settings(t, keys)
                p = studio.create_prompt(s, "a.png", "x", 0, refs=["cam.png", "mat.png"], frame=1)
                loads = [n["inputs"]["image"] for n in p.values() if n.get("class_type") == "LoadImage"]
                self.assertEqual(loads[:1] + sorted(loads[1:]), ["a.png", "cam.png", "mat.png"])
                size_of = p["30"]["inputs"]["image"][0]
                self.assertEqual(p[p[size_of]["inputs"]["image"][0]]["inputs"]["image"], "cam.png")   # camera ref's frame

    def test_qwen_refs_in_words(self):
        t, sent = studio.qwen_refs("", [{"use": "materials", "desc": "Yellow nappa seats."}], {"camera": True})
        self.assertEqual(sent, [])
        self.assertIn("Yellow nappa seats.", t)
        self.assertIn("the camera view", t)
        t, sent = studio.qwen_refs("like ref 1", [{"use": "materials", "desc": ""}], {})
        self.assertEqual(sent, [0])
        self.assertIn("Picture 2", t)
        t, sent = studio.qwen_refs("", [{"use": "camera", "desc": "Low, from the rear."}], {"camera": True})
        self.assertNotIn("the camera view", t)

    def test_qwen_new_view_uses_own_words(self):
        t = studio.qwen_text("Keep the camera. Red seats.", locks={"camera": False}, said="Red seats, seen from the rear seat.")
        self.assertIn("rear seat", t)
        self.assertNotIn("Keep the camera", t)

    def test_metaview_graph(self):
        with mock.patch.object(studio, "find", lambda k, s=None: "/m/%s.safetensors" % k):
            p = studio.metaview_prompt(None, "a.png", -30, 15, seed=1)
        self.assertEqual(p["6"]["inputs"]["yaw"], -30.0)
        self.assertEqual(p["6"]["inputs"]["pitch"], 15.0)
        self.assertEqual(p["12"]["class_type"], "MetaViewSigmas")
        self.assertEqual(p["4"]["inputs"]["prompt"], studio.MV_TRIGGER)

    def test_qwen_style_reference_is_a_picture(self):
        t, sent = studio.qwen_refs("", [{"use": "style", "desc": "A designer's digital illustration painted in Photoshop."}],
                                   {"camera": True}, sketch=True)
        self.assertEqual(sent, [0])
        self.assertIn("look and feel of Picture 2", t)
        self.assertNotIn("photorealistic render", t)
        self.assertIn(studio.QE_NOT_PHOTO, t)
        t, _ = studio.qwen_refs("", [{"use": "style", "desc": "A photorealistic CGI render."}], {}, sketch=True)
        self.assertNotIn(studio.QE_NOT_PHOTO, t)


    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_qwen_image_21(self):
        with tempfile.TemporaryDirectory() as t:
            s = self._settings(t, ("q21", "q21_te", "q21_vae", "q21_fast", "q21_cons", "q21_ctrl"))
            self.assertTrue(studio.q21_ready(s))
            self.assertFalse(studio.use_q21(s))
            s.set("studio_engine", "qwen21")
            self.assertTrue(studio.use_q21(s) and studio.use_qwenedit(s))
            p = studio.q21_prompt(s, ["a.png", "r.png"], "render", seed=1, control=0.8)
            self.assertEqual(p["20"]["class_type"], "TextEncodeQwenImage21")
            self.assertEqual(p["20"]["inputs"]["images.image_1"], ["11", 0])
            self.assertEqual(p["20"]["inputs"]["images.image_2"], ["13", 0])
            self.assertEqual(p["20"]["inputs"]["resolution"], 0)                 # the picture's own size
            self.assertEqual(p["40"]["inputs"]["latent_image"], ["20", 2])
            self.assertEqual(p["40"]["inputs"]["negative"], ["20", 1])
            self.assertEqual(p["40"]["inputs"]["steps"], 8)
            self.assertEqual(p["40"]["inputs"]["model"], ["33", 0])              # ControlNet last
            self.assertEqual(p["33"]["inputs"]["model"], ["6", 0])               # after Consistency
            self.assertEqual(p["6"]["inputs"]["model"], ["4", 0])                # after the speed-up
            self.assertEqual(p["31"]["class_type"], "Canny")
            q = studio.q21_prompt(s, ["a.png"], "x", seed=1, fast=False, consistency=0)
            self.assertEqual(q["40"]["inputs"]["model"], ["1", 0])
            self.assertEqual(q["40"]["inputs"]["steps"], 25)
            self.assertEqual(studio.status(s)["qwen21"], True)

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_qwen_image_edit(self):
        with tempfile.TemporaryDirectory() as t:
            s = self._settings(t, ("qie", "qie_te", "qie_vae", "qie_fast"))
            self.assertTrue(studio.qwenedit_ready(s))
            self.assertFalse(studio.use_qwenedit(s))          # chosen in Settings first
            s.set("studio_engine", "qwenedit")
            self.assertTrue(studio.use_qwenedit(s))
            p = studio.qwenedit_prompt(s, ["a.png", "r.png"], "make it night", seed=1, frame=1)
            self.assertEqual(p["20"]["class_type"], "TextEncodeQwenImageEditPlus")
            self.assertEqual(p["20"]["inputs"]["image2"], ["13", 0])
            self.assertEqual(p["52"]["inputs"]["pixels"], ["13", 0])      # the frame of image 2
            self.assertEqual(p["40"]["inputs"]["latent_image"], ["52", 0])
            self.assertNotIn("vae", p["20"]["inputs"])                     # not shrunk to 1 MP inside the node
            self.assertEqual(p["40"]["inputs"]["positive"], ["53", 0])      # both pictures as reference latents
            self.assertEqual(p["53"]["inputs"]["conditioning"], ["51", 0])
            self.assertEqual(p["11"]["inputs"]["megapixels"], studio.QE_MP)
            q = studio.qwenedit_prompt(s, ["a.png"], "x", seed=1, ref_latent=False)
            self.assertEqual(q["20"]["inputs"]["vae"], ["3", 0])
            self.assertEqual(p["40"]["inputs"]["steps"], 4)
            self.assertEqual(p["2"]["inputs"]["type"], "qwen_image")

    def test_reference_wording(self):
        # A camera read into words goes in as words only; the other references keep their picture numbers.
        t, sent = studio.ref_plan("seats like ref 2, view of ref 1",
                                  [{"use": "camera", "desc": "High overhead view looking down."}, {"use": "materials"}],
                                  {"camera": False, "materials": True, "light": True}, False, 0.8)
        self.assertEqual(sent, [1])
        self.assertIn("High overhead view looking down.", t)
        self.assertIn("colours and materials of image 2", t)
        self.assertIn("seats like image 2", t)                   # ref 2 is picture 2 now
        self.assertIn("the reference described above", t)
        self.assertNotIn("Keep the camera", t)
        self.assertNotIn("every material and colour", t)          # materials come from the reference
        self.assertIn("the lighting of image 1", t)               # still locked
        t, sent = studio.ref_plan("", [{"use": "light", "desc": "Night, amber light strips."}], {"materials": True}, False, 0.8)
        self.assertEqual(sent, [])
        self.assertIn("Change the lighting of image 1: Night, amber light strips.", t)
        self.assertIn("every material and colour", t)
        t, _ = studio.ref_plan("", [{"use": "style", "desc": "Grey marker sketch."}], {}, True, 0.8)
        self.assertIn("rendering style: Grey marker sketch.", t)
        self.assertNotIn("photorealistic", t)
        self.assertNotIn(studio.CRISP, t)
        t, sent = studio.ref_plan("", [{"use": "camera"}], {}, False, 0.8)       # no words: the picture goes in
        self.assertEqual(sent, [0])
        self.assertIn("camera position, height, tilt", t)

    @unittest.skipIf(sys.platform == "darwin", "the Mac has its own image engine")
    def test_used_when_present(self):
        with tempfile.TemporaryDirectory() as t:
            s = self._settings(t, ("klein", "qwen", "vae2", "consistency"))
            self.assertFalse(studio.flux3_ready(s))
            self.assertEqual(studio.create_prompt(s, "a.png", "x")["1"]["inputs"]["unet_name"],
                             "flux-2-klein-9b-fp8mixed.safetensors")
        with tempfile.TemporaryDirectory() as t:
            s = self._settings(t, ("klein", "qwen", "vae2", "consistency", "flux3", "qwen3vl"))
            self.assertTrue(studio.flux3_ready(s))
            p = studio.create_prompt(s, "a.png", "x")
            self.assertTrue(p["1"]["inputs"]["unet_name"].startswith("flux3"))
            self.assertEqual(p["2"]["inputs"]["type"], "flux3")
            self.assertEqual(p["40"]["inputs"]["steps"], 16)
            self.assertNotIn("4", p)                                  # no Klein design lock
            self.assertFalse(sj._has_lock(s))
            sj._add_lora(p, "style.safetensors", 0.8)
            self.assertNotIn("7", p)                                  # Klein looks don't fit
            r = studio.reference_prompt(s, "a.png", "b.png", "x", "cmf")
            self.assertEqual(r["24"]["inputs"]["images.image0"], ["11", 0])
            self.assertEqual(r["24"]["inputs"]["images.image1"], ["13", 0])
            self.assertEqual(r["30"]["inputs"]["image"], ["11", 0])   # the result takes the design's frame
            cam = studio.reference_prompt(s, "a.png", "b.png", "x", "camera")
            self.assertEqual(cam["30"]["inputs"]["image"], ["13", 0])  # camera: the reference's frame
            self.assertEqual(p["11"]["inputs"]["megapixels"], 3.0)    # results at 3 MP
            self.assertEqual(r["13"]["inputs"]["megapixels"], 2.0)    # references read at 2
            self.assertEqual(cam["13"]["inputs"]["megapixels"], 3.0)
            held = studio.create_prompt(s, "a.png", "x", keep=1.0)    # design hold: the sketch twice
            self.assertEqual(held["24"]["inputs"]["images.image1"], ["13", 0])
            self.assertEqual(held["12"]["inputs"]["image"], "a.png")
            self.assertNotIn("images.image1", studio.create_prompt(s, "a.png", "x", keep=0.8)["24"]["inputs"])

    def test_reference_words(self):
        t = studio.build_text("cmf", "", studio.REF_PRESETS, f3=True)
        self.assertIn("second image", t)
        self.assertIn(studio.F3_KEEP, t)
        self.assertNotIn(studio.LIGHT, t)
        self.assertIn("first image", sj.follow_words(0.8, True))


class Condense(unittest.TestCase):
    def test_long_prompts_are_boiled_down(self):
        from unittest import mock
        st = sj.Studio.__new__(sj.Studio)
        st.settings = {}
        st.improve = lambda preset, text: "tan leather seats, light grey dashboard, soft desert daylight, purple strips"
        long = "**Lighting:** " + "warm golden directional sunlight " * 30
        with mock.patch.object(studio, "helper_installed", lambda s: True):
            self.assertTrue(st._condense("sketch", long).startswith("tan leather"))
            self.assertEqual(st._condense("sketch", "red seats"), "red seats")      # short: untouched
        with mock.patch.object(studio, "helper_installed", lambda s: False):
            self.assertEqual(st._condense("sketch", long), long)                    # no helper: untouched
        self.assertNotIn("**", studio.clean_prompt(long))
        self.assertEqual(studio.light_for("interior, warm afternoon sunlight"), "")  # its own light wins


class ViewSide(unittest.TestCase):
    def test_side_from_the_nose(self):
        from vistiq import studio
        self.assertEqual(studio.parse_view("kind=product; nose=left; end=front; side=front-right")[1], "front-left")
        self.assertEqual(studio.parse_view("kind=exterior; nose=right; end=rear; side=front")[1], "rear-right")
        self.assertEqual(studio.parse_view("kind=exterior; nose=toward; end=front")[1], "front")
        self.assertEqual(studio.parse_view("kind=interior; nose=left; side=rear")[1], "rear")


class CabinCamera(unittest.TestCase):
    def test_free_camera_in_the_cabin(self):
        from vistiq import studio
        # a picture from the rear seats looking forward; the camera goes to the passenger seat, looking at the driver's corner
        w, _ = studio.view_words("interior", "rear", 0, 0, cabin={"u": 0.6, "v": -0.1, "look": -45})
        self.assertTrue(w.startswith("Turn the camera 45 degrees to the left and move it to the front passenger's head position"), w)
        self.assertIn("steering wheel, the driver's seat and the driver's door", w)
        w, _ = studio.view_words("interior", "rear", 0, 0, cabin={"u": -0.6, "v": 0.8, "look": 0})
        self.assertTrue(w.startswith("Move the camera to the rear seats on the driver's side"), w)


class CameraAngles(unittest.TestCase):
    def test_wording_and_graph(self):
        from vistiq import studio
        self.assertEqual(studio.angles_text("rear-left", 30, 0), "<sks> back-left quarter view elevated shot medium shot")
        self.assertEqual(studio.angles_text("front", -20, -0.5), "<sks> front view low-angle shot close-up")
        with mock.patch.object(studio, "find", lambda k, s=None: "/m/" + k + ".safetensors"):
            p = studio.qwenedit_prompt(None, ["a.png"], "x", seed=1, angles=0.9, ref_latent=False)
            self.assertEqual(p["6"]["inputs"]["model"], ["4", 0])
            self.assertEqual(p["5"]["inputs"]["model"], ["6", 0])
            self.assertEqual(p["6"]["inputs"]["strength_model"], 0.9)
            self.assertNotIn("6", studio.qwenedit_prompt(None, ["a.png"], "x", seed=1))



class InstantCamera(unittest.TestCase):
    def test_words(self):
        from vistiq import studio
        w = studio.instant_camera("rear-left", "eye")
        self.assertIn("Do not turn", w)
        self.assertNotIn("rear", w)                 # never names a view the reader may have misread
        t = studio.qwen_text("", instant=True, kind="exterior", camera=w)
        self.assertIn("Do not turn", t)


class Medium(unittest.TestCase):
    def test_parse(self):
        from vistiq import studio
        self.assertEqual(studio.parse_medium("kind=exterior; medium=render; nose=left"), "render")
        self.assertEqual(studio.parse_medium("kind=interior; medium=sketch"), "sketch")
        self.assertEqual(studio.parse_medium("kind=interior"), "")
        self.assertIn("lamps glowing", studio.night_clause("night", "exterior"))
        self.assertIn("roof downlights", studio.night_clause("night", "interior"))


class OutputSize(unittest.TestCase):
    def test_cap(self):
        from vistiq import studio
        p = {"11": {"class_type": "ImageScaleToTotalPixels", "inputs": {"megapixels": 3.2}},
             "13": {"class_type": "ImageScaleToTotalPixels", "inputs": {"megapixels": 0.8}}}
        studio.cap_megapixels(p, "1k")
        self.assertEqual(p["11"]["inputs"]["megapixels"], 1.05)
        self.assertEqual(p["13"]["inputs"]["megapixels"], 0.8)
        studio.cap_megapixels(p, "512")
        self.assertEqual(p["11"]["inputs"]["megapixels"], 0.27)
        q = {"11": {"class_type": "ImageScaleToTotalPixels", "inputs": {"megapixels": 3.2}}}
        studio.cap_megapixels(q, "2k")
        self.assertEqual(q["11"]["inputs"]["megapixels"], 3.2)


class RelightHold(unittest.TestCase):

    def test_other_edits_free(self):
        t = studio.with_locks("make the seats sportier", {"materials": True, "camera": True}, False)
        self.assertNotIn("no new handles", t)


class OvercastNotSun(unittest.TestCase):
    def test_overcast_daylight_no_sun_look(self):
        self.assertEqual(studio.sun_clause("soft overcast daylight, gentle even light, no hard shadows"), "")
        self.assertTrue(studio.sun_clause("cinematic golden hour sun"))

    def test_rewrite_adding_snow_is_refused(self):
        self.assertTrue(studio.adds_scene("soft overcast daylight", "overcast winter light, add subtle snow on the seats"))
        self.assertFalse(studio.adds_scene("snowy mountain scene", "snow on the ground and the roof"))





class NoNewParts(unittest.TestCase):
    def test_new_handle_on_plain_panel_goes_back(self):
        o = Image.new("RGB", (2400, 1200), (200, 80, 60))
        r = Image.new("RGB", (2400, 1200), (220, 100, 70))      # brighter light everywhere
        ImageDraw.Draw(r).rectangle([1140, 585, 1260, 605], fill=(60, 20, 15))   # an invented handle
        out = sj.no_new_parts(o, r)
        px = out.getpixel((1200, 595))
        self.assertGreater(px[0], 180, px)
        self.assertLess(abs(out.getpixel((300, 300))[0] - 220), 6)

    def test_big_shadow_stays(self):
        o = Image.new("RGB", (2400, 1200), (200, 80, 60))
        r = Image.new("RGB", (2400, 1200), (220, 100, 70))
        ImageDraw.Draw(r).rectangle([0, 0, 1200, 1200], fill=(110, 50, 35))      # a large shadow
        out = sj.no_new_parts(o, r)
        self.assertLess(out.getpixel((600, 600))[0], 130)


class TextureGate(unittest.TestCase):
    def test_haze_over_detail_gets_no_texture(self):
        import random
        rnd = random.Random(1)
        o = Image.new("L", (1400, 700), 128)
        px = o.load()
        for y in range(700):
            for x in range(1400):
                px[x, y] = 128 + rnd.randint(-40, 40)
        r = o.copy()
        r.paste(Image.new("L", (700, 700), 200), (0, 0))            # left half turned to flat haze
        g = sj.texture_gate(o.convert("RGB"), r.convert("RGB"))
        self.assertLess(float(g[300:400, 100:600].mean()), 0.2)
        self.assertGreater(float(g[300:400, 800:1300].mean()), 0.8)


class SceneChange(unittest.TestCase):


    def test_same_place_sees_new_scene_not_new_light(self):
        import random
        rnd = random.Random(2)
        o = Image.new("RGB", (720, 400))
        px = o.load()
        for y in range(400):
            for x in range(720):
                v = 100 + rnd.randint(-50, 50)
                px[x, y] = (v, v // 2, v // 3)
        relit = o.point(lambda c: min(255, int(c * 1.4)))
        a = sj.same_place(o, relit)
        self.assertGreater(float(a.mean()), 0.9)
        new = o.copy()
        other = Image.new("RGB", (360, 400))
        po = other.load()
        for y in range(400):
            for x in range(360):
                v = 100 + rnd.randint(-50, 50)
                po[x, y] = (v // 3, v, v // 2)
        new.paste(other, (0, 0))
        a = sj.same_place(o, new)
        self.assertLess(float(a[:, :100].mean()), 0.3)
        self.assertGreater(float(a[:, -100:].mean()), 0.8)


class OutputNames(unittest.TestCase):
    def test_newest_sorts_first_by_name(self):
        names = ["Vistiq_%s_cabin_create_v1.png" % studio.newest_first(n) for n in (5, 6, 120, 121)]
        self.assertEqual(sorted(names)[0], names[-1])       # the newest (121) comes first A→Z
        self.assertTrue(studio.create_dir().endswith(os.path.join("Outputs", "Create")))
        self.assertTrue(studio.upscale_dir().endswith(os.path.join("Outputs", "Upscale")))

    def test_upscale_name_gets_the_number_once(self):
        from vistiq import imaging
        buf = io.BytesIO(); Image.new("RGB", (8, 8)).save(buf, "PNG")
        with tempfile.TemporaryDirectory() as d:
            p, w, h = imaging.save(buf.getvalue(), "Vistiq_999870_cabin_create_v1.png", d, "PNG", "2x", prefix="999860")
            self.assertEqual(os.path.basename(p), "Vistiq_999860_cabin_create_v1_2x.png")

    def test_results_still_found_by_picture(self):
        self.assertEqual(sj._strip_tags("999846_cabin_create_v1"), "cabin")




class FollowWordsTest(unittest.TestCase):
    def test_action_words(self):
        from vistiq import studio
        for w in ["remove all sketch lines", "add a phone on the charger",
                  "replace the wheels with bronze ones", "no labels or text", "clean up the lines"]:
            self.assertTrue(studio.instructs(w), w)
        for w in ["soft overcast daylight", "golden hour sun", "Add no logos or badges", "studio light, dark background",
                  "do not change the design", "change the seats to red leather"]:
            self.assertFalse(studio.instructs(w), w)




class MaterialRefineTest(unittest.TestCase):
    # Nov 2026: "apply premium materials ... do not change the design" redesigned a steering wheel: "change"
    # counted as an instruction, so "do what the words say, even where it changes a part" came first.
    WHEEL = ("apply premium materials on this steering wheel design: fine nappa leather textures on the steering "
             "wheel rim and center hub, piano black twin stalks with metallic buttons, subtle reflections, precise "
             "seams. do not change the design")


    def test_negations_are_not_instructions(self):
        from vistiq import studio
        for w in ["don't change anything else", "without altering the shape", "keep the design, dark background",
                  "never modify the steering wheel"]:
            self.assertFalse(studio.instructs(w), w)
        # but a real instruction next to one still counts
        self.assertTrue(studio.instructs("remove the sketch lines, do not change the design"))
        self.assertTrue(studio.instructs("add a cup holder but keep the design"))
        self.assertTrue(studio.follows("add a cup holder but keep the design"))
        self.assertFalse(studio.follows("make it red, keep the design", "edit"))



class DirectWordsTest(unittest.TestCase):
    # Nov 2026: the words go to the model as written, with one short line per Keep lock.
    def test_words_as_written(self):
        from vistiq import studio
        t = studio.qwen_text("change material to forged carbon fiber", locks={"camera": True, "materials": True})
        self.assertTrue(t.startswith("change material to forged carbon fiber."))
        self.assertNotIn("Above all", t)
        self.assertNotIn("Keep the materials", t)          # the words ask for new materials
        self.assertIn("Keep the camera view.", t)
        self.assertLess(len(t), 170)

    def test_sketch_and_parts(self):
        from vistiq import studio
        t = studio.qwen_text("add a cup holder", locks={"camera": True}, sketch=True)
        self.assertTrue(t.startswith("Turn this sketch into a photorealistic render. add a cup holder."))
        self.assertIn("Keep everything else as drawn.", t)
        t = studio.qwen_text(MaterialRefineTest.WHEEL, locks={"camera": True, "light": True}, sketch=True)
        self.assertIn("Keep the design as drawn.", t)
        self.assertIn("Keep the lighting.", t)

    def test_light_words_free_the_light_lock(self):
        from vistiq import studio
        t = studio.qwen_text("night scene, headlights on", locks={"light": True, "camera": True})
        self.assertNotIn("Keep the lighting", t)

    def test_said_words_win_over_any_rewrite(self):
        from vistiq import studio
        t = studio.qwen_text("a long rewrite by the reader", said="make it red", locks={"camera": True})
        self.assertTrue(t.startswith("make it red."))
        self.assertNotIn("rewrite", t)

    def test_with_locks_short(self):
        from vistiq import studio
        t = studio.with_locks("add a phone on the charger", {"design": True, "materials": True, "camera": True}, False)
        self.assertNotIn(studio.LOCK_TEXT["design"], t)     # adding a part changes the design, as asked
        self.assertNotIn(studio.FOLLOW_FIRST, t)
        self.assertIn(studio.LOCK_TEXT["camera"], t)


class SnapAndMediumTest(unittest.TestCase):
    def test_snap_is_one_solid_piece(self):
        # Nov 2026: snapping found pencil speckles and left spots unchanged inside the selection.
        import random
        from PIL import Image, ImageDraw
        from vistiq import picker
        shape = Image.new("L", (400, 300), 0)
        ImageDraw.Draw(shape).rectangle([100, 80, 300, 220], fill=255)
        found = shape.copy(); px = found.load(); random.seed(1)
        for _ in range(3000):
            px[random.randint(105, 295), random.randint(85, 215)] = 0
        m = picker.snap_merge(shape, found)
        self.assertEqual(m.getbbox()[:2], (100, 80))
        inside = [m.getpixel((x, y)) for x in range(110, 290, 7) for y in range(90, 210, 7)]
        self.assertTrue(all(v == 255 for v in inside))

    def test_snap_points_inside_and_outside(self):
        from PIL import Image, ImageDraw
        from vistiq import picker
        m = Image.new("L", (400, 300), 0)
        ImageDraw.Draw(m).ellipse([100, 60, 300, 240], fill=255)
        pts = picker.snap_points(m)
        pos = [p for p in pts if p[2]]
        neg = [p for p in pts if not p[2]]
        self.assertTrue(pos and neg)
        for u, v, _ in pos:
            self.assertEqual(m.getpixel((int(u * 400), int(v * 300))), 255)
        for u, v, _ in neg:
            self.assertEqual(m.getpixel((min(399, int(u * 400)), min(299, int(v * 300)))), 0)

    def test_snap_merge_keeps_the_object_near_the_shape(self):
        from PIL import Image, ImageDraw
        from vistiq import picker
        shape = Image.new("L", (400, 300), 0)
        ImageDraw.Draw(shape).rectangle([100, 50, 300, 200], fill=255)       # rough: cuts the object
        obj = Image.new("L", (400, 300), 0)
        ImageDraw.Draw(obj).rectangle([120, 60, 280, 230], fill=255)          # the real object runs a bit lower
        out = picker.snap_merge(shape, obj)
        self.assertIsNot(out, shape)
        self.assertEqual(out.getpixel((200, 220)), 255)     # completed past the drawn edge
        self.assertEqual(out.getpixel((105, 55)), 0)        # spill dropped
        wrong = Image.new("L", (400, 300), 0)
        ImageDraw.Draw(wrong).rectangle([190, 120, 200, 130], fill=255)       # a tiny wrong thing
        self.assertIs(picker.snap_merge(shape, wrong), shape)

    def test_guess_medium(self):
        import tempfile
        import numpy as np
        from PIL import Image, ImageDraw
        d = tempfile.mkdtemp()
        sk = Image.new("RGB", (600, 400), "white")
        dr = ImageDraw.Draw(sk)
        for i in range(20):
            dr.line([(i * 30, 80), (i * 30 + 150, 320)], fill=(30, 30, 30), width=3)
        sk.save(d + "/s.png")
        a = (np.random.RandomState(0).rand(400, 600, 3) * [200, 120, 60] + [40, 30, 20]).astype("uint8")
        Image.fromarray(a).save(d + "/p.png")
        self.assertEqual(studio.guess_medium(d + "/s.png"), "sketch")
        self.assertEqual(studio.guess_medium(d + "/p.png"), "render")


class IntentTest(unittest.TestCase):
    def test_parse_intent(self):
        self.assertEqual(studio.parse_intent("medium=photo; task=edit"), ("photo", "edit"))
        self.assertEqual(studio.parse_intent("medium = sketch ; task = render."), ("sketch", "render"))
        self.assertEqual(studio.parse_intent("no idea"), ("", ""))



class KeepUnchangedTest(unittest.TestCase):
    # Nov 2026: every edit redrew the whole picture at about 1 MP and lost fine detail everywhere.
    def _pics(self):
        import numpy as np
        from PIL import Image, ImageFilter
        rng = np.random.default_rng(1)
        o = (rng.random((600, 800, 3)) * 60 + 100).astype("uint8")          # fine "perforation" texture
        orig = Image.fromarray(o)
        res = orig.resize((400, 300)).resize((800, 600)).filter(ImageFilter.GaussianBlur(1.5))  # soft redraw
        r = np.asarray(res).copy()
        r[200:400, 300:500] = (200, 40, 40)                                  # the asked change: a red part
        return orig, Image.fromarray(r)

    def test_detail_kept_outside_the_change(self):
        import numpy as np
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
        from vistiq import studio_jobs
        orig, res = self._pics()
        out, share = studio_jobs.keep_unchanged(orig, res)
        o, q = np.asarray(orig), np.asarray(out)
        self.assertTrue((q[20:150, 20:200] == o[20:150, 20:200]).all())     # untouched: the original's pixels
        self.assertTrue((q[260:340, 360:440] == (200, 40, 40)).all())        # the change is there
        self.assertLess(share, 0.3)

    def test_painted_marker(self):
        import base64, io
        from PIL import Image, ImageDraw
        from vistiq import studio_jobs
        lay = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
        ImageDraw.Draw(lay).ellipse([100, 80, 200, 160], outline=(0, 255, 0, 255), width=8)
        b = io.BytesIO(); lay.save(b, "PNG")
        spec = {"layers": [{"png": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), "opacity": 1}]}
        m = studio_jobs.painted_area(spec, (400, 300))
        self.assertEqual(m.getpixel((150, 120)), 255)                        # inside the circle: filled
        self.assertEqual(m.getpixel((350, 250)), 0)
        t = "create different design variations for the door grab handlebar in the green highlighted area. remove green"
        left = studio_jobs.MARK_WORDS.sub(" ", t)
        self.assertNotIn("green", left)
        self.assertIn("door grab handlebar", left)


class MarkerColourTest(unittest.TestCase):
    def _spec(self, rgb):
        import base64, io
        from PIL import Image, ImageDraw
        lay = Image.new("RGBA", (300, 200), (0, 0, 0, 0))
        ImageDraw.Draw(lay).ellipse([50, 40, 200, 160], outline=rgb + (255,), width=12)
        b = io.BytesIO(); lay.save(b, "PNG")
        return {"layers": [{"png": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()}]}

    def test_green_is_a_marker_black_is_a_drawing(self):
        from vistiq import studio_jobs
        self.assertTrue(studio_jobs.marker_colour(self._spec((110, 230, 60))))
        self.assertFalse(studio_jobs.marker_colour(self._spec((20, 20, 20))))
