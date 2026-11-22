import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
from vistiq import wipe, studio  # noqa: E402


class WipeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = self.tmp.name
        self.env = mock.patch.dict(os.environ, {"APPDATA": os.path.join(t, "Roaming"), "LOCALAPPDATA": os.path.join(t, "Local"),
                                                "HOME": os.path.join(t, "user"), "USERPROFILE": os.path.join(t, "user")})
        self.env.start()
        os.makedirs(os.path.join(t, "user", "Documents"), exist_ok=True)
        self.docs = mock.patch.object(studio, "_documents", lambda: os.path.join(t, "user", "Documents"))
        self.docs.start()

    def tearDown(self):
        self.docs.stop(); self.env.stop(); self.tmp.cleanup()

    def test_default_home_deleted_whole(self):
        ps = wipe.targets({})
        self.assertIn(os.path.join(self.tmp.name, "user", "Documents", "Vistiq Studio"), ps)
        self.assertNotIn(os.path.join(self.tmp.name, "user", "Documents"), ps)

    def test_custom_home_only_studio_parts(self):
        custom = os.path.join(self.tmp.name, "user", "Work")
        ps = wipe.targets({"studio_home": custom})
        self.assertNotIn(custom, ps)
        self.assertIn(os.path.join(custom, "Models"), ps)
        self.assertIn(os.path.join(custom, "Outputs"), ps)

    def test_never_user_or_root(self):
        for p in wipe.targets({}):
            self.assertTrue(wipe._safe(p))
        self.assertFalse(wipe._safe(os.path.expanduser("~")))
        self.assertFalse(wipe._safe(os.path.join(os.path.expanduser("~"), "Documents")))
        self.assertFalse(wipe._safe("/"))

    def test_shared_engine_kept_when_plain_vistiq_here(self):
        with mock.patch.object(wipe.flavor, "STUDIO", True), mock.patch.object(wipe.flavor, "FOLDER", "VistiqStudio"):
            eng = os.path.join(wipe._local(), "Vistiq", "engine")
            self.assertIn(eng, wipe.targets({}))
            os.makedirs(os.path.join(wipe._roaming(), "Vistiq"))
            self.assertNotIn(eng, wipe.targets({}))

    def test_script_quotes_paths(self):
        s = wipe.script(["/a/it's here"], 123)
        self.assertIn("kill -0 123", s)
        self.assertIn("rm -rf '/a/it'\\''s here'", s)

    def test_sh_script_deletes_after_exit(self):
        if sys.platform == "win32":
            return
        d = os.path.join(self.tmp.name, "x", "y", "z"); os.makedirs(os.path.join(d, "sub"))
        import subprocess
        p = subprocess.Popen(["sleep", "1"])
        path = wipe.start([d], pid=p.pid)
        self.assertTrue(os.path.isdir(d))
        p.wait()
        import time
        for _ in range(40):
            if not os.path.exists(d):
                break
            time.sleep(0.25)
        self.assertFalse(os.path.exists(d))
        self.assertFalse(os.path.exists(path))


if __name__ == "__main__":
    unittest.main()
