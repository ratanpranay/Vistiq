import io
import os
import sys
import tempfile
import time
import unittest
import urllib.request

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
from vistiq import phonedrop  # noqa: E402


class PhoneDropTest(unittest.TestCase):
    def test_upload_reports_progress_then_the_file(self):
        events, files = [], []
        with tempfile.TemporaryDirectory() as d:
            drop = phonedrop.PhoneDrop(d, lambda p, tok: files.append((p, tok)),
                                       lambda tok, name, f, failed=False: events.append((tok, name, f, failed)))
            drop.start()
            try:
                port = drop.server.server_address[1]
                b = io.BytesIO()
                Image.effect_noise((1500, 1500), 60).convert("RGB").save(b, "PNG")
                req = urllib.request.Request("http://127.0.0.1:%d/drop?k=%s" % (port, drop.token), data=b.getvalue(),
                                             headers={"X-Name": "car.png", "Content-Type": "application/octet-stream"})
                urllib.request.urlopen(req, timeout=20).read()
            finally:
                drop.stop()
            self.assertEqual(len(files), 1)
            tok = files[0][1]
            self.assertTrue(tok)
            self.assertEqual(events[0], (tok, "car.png", 0.0, False))
            self.assertTrue(all(e[0] == tok and not e[3] for e in events))
            fr = [e[2] for e in events]
            self.assertEqual(fr, sorted(fr))

    def test_not_a_picture_fails_its_tile(self):
        events = []
        with tempfile.TemporaryDirectory() as d:
            drop = phonedrop.PhoneDrop(d, lambda p, tok: None, lambda tok, name, f, failed=False: events.append(failed))
            drop.start()
            try:
                port = drop.server.server_address[1]
                req = urllib.request.Request("http://127.0.0.1:%d/drop?k=%s" % (port, drop.token), data=b"nope" * 100)
                try:
                    urllib.request.urlopen(req, timeout=20).read()
                except Exception:
                    pass
            finally:
                drop.stop()
            self.assertTrue(events and events[-1] is True)


if __name__ == "__main__":
    unittest.main()
