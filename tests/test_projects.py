import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
sys.modules.setdefault("webview", mock.MagicMock())
from vistiq import app as appmod  # noqa: E402


class ProjectsStartTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.p = mock.patch.object(appmod, "data_dir", lambda: self.tmp.name)
        self.p.start()
        self.api = appmod.Api(object())

    def tearDown(self):
        self.p.stop()
        self.tmp.cleanup()

    def test_fresh_install_has_no_projects(self):
        self.assertEqual(self.api.studio_projects(), [])

    def test_old_board_with_pictures_becomes_my_board(self):
        with open(os.path.join(self.tmp.name, "board.json"), "w") as fh:
            json.dump({"tiles": [{"id": "a", "path": "C:/x.png"}]}, fh)
        names = [p["name"] for p in self.api.studio_projects()]
        self.assertEqual(names, ["My board"])

    def test_empty_old_board_makes_nothing(self):
        with open(os.path.join(self.tmp.name, "board.json"), "w") as fh:
            json.dump({"tiles": [{"id": "live", "kind": "live"}]}, fh)
        self.assertEqual(self.api.studio_projects(), [])


if __name__ == "__main__":
    unittest.main()
