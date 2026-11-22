import base64
import io
import os
import sys
import tarfile
import tempfile
import textwrap
import unittest
from unittest import mock

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
from vistiq import macos  # noqa: E402


class FakeSettings(dict):
    def set(self, k, v):
        self[k] = v


class TierTest(unittest.TestCase):
    def test_recommended_by_memory(self):
        self.assertEqual(macos.recommended_tier(8), "light")
        self.assertEqual(macos.recommended_tier(16), "studio")
        self.assertEqual(macos.recommended_tier(18), "studio")
        self.assertEqual(macos.recommended_tier(24), "pro")

    def test_higher_tiers_not_allowed(self):
        self.assertTrue(macos.tier_allowed("light", 8))
        self.assertFalse(macos.tier_allowed("studio", 8))
        self.assertTrue(macos.tier_allowed("studio", 16))
        self.assertFalse(macos.tier_allowed("pro", 16))
        self.assertTrue(macos.tier_allowed("pro", 24))

    def test_chosen_tier_kept_only_if_it_fits(self):
        with mock.patch.object(macos, "ram_gb", return_value=16), mock.patch.object(macos, "mage_supported", return_value=True):
            self.assertEqual(macos.tier(FakeSettings()), "studio")
            self.assertEqual(macos.tier(FakeSettings(mac_tier="light")), "light")
            self.assertEqual(macos.tier(FakeSettings(mac_tier="pro")), "studio")
            self.assertEqual(macos.engine_of(FakeSettings()), "mage")

    def test_old_macos_stays_on_light(self):
        with mock.patch.object(macos, "ram_gb", return_value=24), mock.patch.object(macos, "mage_supported", return_value=False):
            self.assertEqual(macos.tier(FakeSettings()), "light")

    def test_parts_per_tier(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual([p["key"] for p in macos.parts(d, "light")], ["engine", "klein4b", "upscaler"])
            self.assertEqual([p["key"] for p in macos.parts(d, "studio")], ["mlxserve", "mageflow", "upscaler"])

    def test_mage_folder_says_edit(self):
        # mlx-serve only edits with a pack whose folder name says so.
        self.assertIn("mage-flow-edit", os.path.basename(macos.mage_dir("/x")).lower())


class StageTest(unittest.TestCase):
    def test_stages_map_to_the_whole_picture(self):
        st = {}
        self.assertLess(macos.stage_fraction("Encoding", 1, 2, st), 0.1)
        self.assertAlmostEqual(macos.stage_fraction("Generating", 2, 4, st), 0.5)
        self.assertGreaterEqual(macos.stage_fraction("Decoding image", 4, 4, st), 0.9)


class EngineChoiceTest(unittest.TestCase):
    def test_picked_model_used_only_when_downloaded(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(macos, "support_dir", lambda: d), \
                mock.patch.object(macos, "ram_gb", return_value=16), mock.patch.object(macos, "mage_supported", return_value=True):
            md = os.path.join(d, "Models")
            s = FakeSettings(mac_engine="klein")
            self.assertEqual(macos.engine_of(s, md), "mage")            # Klein not here: the setup's model
            os.makedirs(macos.model_dir(md)); open(os.path.join(macos.model_dir(md), "ready.txt"), "w").close()
            os.makedirs(macos.env_dir()); open(os.path.join(macos.env_dir(), "ready.txt"), "w").close()
            self.assertEqual(macos.engine_of(s, md), "klein")
            self.assertEqual(macos.engine_tag("klein"), "Klein4B")
            self.assertEqual(macos.engine_tag("mage"), "Mage")


class SettingTest(unittest.TestCase):
    def test_real_settings_take_mac_tier(self):
        from vistiq import settings as st
        with tempfile.TemporaryDirectory() as d, mock.patch.object(st, "data_dir", lambda: d):
            s = st.Settings()
            s.set("mac_tier", "studio")
            self.assertEqual(st.Settings().get("mac_tier"), "studio")


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.p = mock.patch.object(macos, "support_dir", lambda: self.tmp.name)
        self.p.start()

    def tearDown(self):
        self.p.stop()
        self.tmp.cleanup()

    def _tar(self, path, evil=False):
        with tarfile.open(path, "w:gz") as t:
            data = b"#!/bin/sh\n"
            ti = tarfile.TarInfo("mlx-serve-macos-arm64/mlx-serve"); ti.size = len(data)
            t.addfile(ti, io.BytesIO(data))
            if evil:
                ti = tarfile.TarInfo("../evil"); ti.size = 1
                t.addfile(ti, io.BytesIO(b"x"))

    def test_damaged_engine_refused(self):
        def dl(url, path, *a):
            self._tar(path)
        with self.assertRaises(RuntimeError):
            macos.install_mlxserve(dl, lambda *a: None)
        self.assertFalse(os.path.isfile(os.path.join(macos.mlxs_dir(), "ready.txt")))

    def test_engine_unpacked_when_checksum_matches(self):
        def dl(url, path, *a):
            self._tar(path, evil=True)
        with mock.patch.object(macos, "_sha256", return_value=macos.MLXS_SHA256):
            macos.install_mlxserve(dl, lambda *a: None)
        self.assertTrue(os.path.isfile(macos.mlxs_bin()))
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(macos.mlxs_dir()), "evil")))

    def test_mage_download_all_files_then_ready(self):
        got = []
        files = [("model_index.json", 10), ("transformer/model.safetensors", 100)]

        def dl(url, path, prog, label, cancelled):
            got.append(url)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(b"x")
            prog(label, 1.0)
        md = os.path.join(self.tmp.name, "Models")
        with mock.patch.object(macos, "hf_files", return_value=files):
            macos.install_mage(md, dl, lambda *a: None)
        self.assertEqual(len(got), 2)
        self.assertTrue(all(macos.MAGE_REPO in u for u in got))
        self.assertTrue(os.path.isfile(os.path.join(macos.mage_dir(md), "transformer", "model.safetensors")))
        self.assertTrue(os.path.isfile(os.path.join(macos.mage_dir(md), "ready.txt")))


FAKE_SERVER = textwrap.dedent(r'''
    #!/usr/bin/env python3
    # A stand-in for mlx-serve: /health and /v1/images/edits (multipart) -> b64 PNG.
    import base64, io, json, sys
    from email.parser import BytesParser
    from email.policy import default
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from PIL import Image
    a = sys.argv
    port = int(a[a.index("--port") + 1]); model = a[a.index("--model") + 1]
    class H(BaseHTTPRequestHandler):
        def log_message(self, *x): pass
        def do_GET(self):
            self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert req["mode"] == "edit" and req["stream"] is True and "mage-flow-edit" in model.lower()
            imgs = [req["image"]] + req.get("ref_images", [])
            for x in imgs:
                Image.open(io.BytesIO(base64.b64decode(x)))
            w, h = [int(v) for v in req["size"].split("x")]
            im = Image.new("RGB", (w, h), (len(imgs) * 40, 0, 0)); b = io.BytesIO(); im.save(b, "PNG")
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            for i in range(1, 5):
                self.wfile.write(("data: " + json.dumps({"type": "progress", "stage": "Generating", "step": i, "total": 4}) + "\n\n").encode())
            self.wfile.write(("data: " + json.dumps({"type": "progress", "stage": "Decoding image", "step": 4, "total": 4}) + "\n\n").encode())
            self.wfile.write(("data: " + json.dumps({"type": "complete", "data": [{"b64_json": base64.b64encode(b.getvalue()).decode()}]}) + "\n\n").encode())
    HTTPServer(("127.0.0.1", port), H).serve_forever()
''').lstrip()


@unittest.skipIf(sys.platform == "win32", "needs a POSIX script as the engine")
class MageEngineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = self.tmp.name
        self.p = mock.patch.object(macos, "support_dir", lambda: t)
        self.p.start()
        os.makedirs(os.path.dirname(macos.mlxs_bin()))
        with open(macos.mlxs_bin(), "w") as fh:
            fh.write("#!%s\n" % sys.executable + FAKE_SERVER.split("\n", 1)[1])
        os.chmod(macos.mlxs_bin(), 0o755)
        self.md = os.path.join(t, "Models")
        os.makedirs(macos.mage_dir(self.md))
        open(os.path.join(macos.mage_dir(self.md), "ready.txt"), "w").write("x")
        self.img = os.path.join(t, "sketch.png")
        Image.new("RGB", (1600, 900), "white").save(self.img)

    def tearDown(self):
        self.p.stop()
        self.tmp.cleanup()

    def test_run_returns_png_at_work_size(self):
        e = macos.MageEngine(lambda: self.md)
        try:
            self.assertTrue(e.alive())
            fr = []
            data = e.run({"image": self.img, "ref": self.img, "text": "render it", "seed": 5, "side": 1024}, fr.append)
            self.assertEqual(fr, sorted(fr))
            self.assertGreaterEqual(fr[-1], 0.9)
            self.assertTrue(any(0.1 < f < 0.9 for f in fr))
            im = Image.open(io.BytesIO(data))
            self.assertEqual(im.size, (1024, 576))
            self.assertEqual(im.getpixel((0, 0))[0], 80)          # sketch + reference both sent
            # The server stays up for the next picture.
            p = e._proc
            e.run({"image": self.img, "text": "again", "seed": 6, "side": 512})
            self.assertIs(e._proc, p)
        finally:
            e.stop()
        self.assertIsNone(e._proc)

    def test_dispatcher_uses_setup(self):
        s = FakeSettings(mac_tier="studio")
        with mock.patch.object(macos, "ram_gb", return_value=16), mock.patch.object(macos, "mage_supported", return_value=True):
            m = macos.MacEngine(s, lambda: self.md)
            self.assertIsInstance(m.current, macos.MageEngine)
            s["mac_tier"] = "light"
            self.assertIsInstance(m.current, macos.MlxEngine)


if __name__ == "__main__":
    unittest.main()
