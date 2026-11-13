import base64
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
        self.assertTrue(studio.build_text("cmf", "red seats").endswith(studio.CRISP))
        self.assertTrue(studio.build_text("", "just this").startswith("just this"))
        self.assertTrue(studio.build_text("", ""))


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
