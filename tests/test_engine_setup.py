import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))

from vistiq import engine_setup as es, models  # noqa: E402


class EngineBuild(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"LOCALAPPDATA": self.tmp.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def _old_install(self):
        """What Vistiq 0.2 left: markers with a date only, models in ComfyUI."""
        old = os.path.join(es.portable_dir(), "ComfyUI", "models", "SEEDVR2")
        os.makedirs(old)
        for f in (es.VAE[1], es.MODELS[1]["file"]):
            open(os.path.join(old, f), "wb").write(b"x")
        for name in ("portable", "nodes"):
            open(es._marker(name), "w").write("2026-10-01 10:00:00")

    def test_pinned_version(self):
        self.assertIn("/v0.3.68/", es.PORTABLE)

    def test_old_engine_is_replaced_and_models_kept(self):
        self._old_install()
        self.assertFalse(es.installed())
        self.assertTrue(es.needs_update())
        self.assertIn(es.MODELS[1]["file"], es.local_models())
        self.assertTrue(es.models_dir().startswith(es.home()))
        self.assertNotIn("ComfyUI_windows_portable", es.models_dir())

    def test_current_build_is_installed(self):
        self._old_install()
        es._mark("portable")
        es._mark("nodes")
        self.assertTrue(es.installed())
        self.assertFalse(es.needs_update())

    def test_model_paths_file(self):
        os.makedirs(os.path.join(es.portable_dir(), "ComfyUI"))
        es.write_model_paths()
        text = open(os.path.join(es.portable_dir(), "ComfyUI", "extra_model_paths.yaml")).read()
        self.assertIn("seedvr2: SEEDVR2", text)
        self.assertNotIn("\\", text)


class Tuning(unittest.TestCase):
    def run_with(self, vram, ram, model, mp=8.0, **kw):
        with mock.patch.object(models, "_vram", return_value=vram), \
             mock.patch.object(models, "_ram", return_value=ram):
            return models.tuning(es.model_by_key(model)["file"], megapixels=mp, **kw)

    def test_seven_b_on_16gb_swaps_everything(self):
        t = self.run_with(16, 32, "ultra-sharp-lite")
        self.assertEqual(t["blocks_to_swap"], es.model_by_key("ultra-sharp-lite")["blocks"])

    def test_small_model_on_big_card_stays_on_card(self):
        self.assertEqual(self.run_with(24, 64, "swift")["blocks_to_swap"], 0)

    def test_cache_needs_ram(self):
        self.assertFalse(self.run_with(16, 32, "ultra-sharp")["cache_model"])
        self.assertTrue(self.run_with(16, 64, "ultra-sharp")["cache_model"])

    def test_learned_swap_is_full(self):
        t = self.run_with(24, 64, "swift", extra_swap=10)
        self.assertEqual(t["blocks_to_swap"], es.model_by_key("swift")["blocks"])


if __name__ == "__main__":
    unittest.main()
