import os
import sys
import tempfile
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))

from vistiq import progress as pg  # noqa: E402

RUN = [
    "[INFO] Using VAE tiled encoding (Tile: 1024, Overlap: 128)",
    "Encoding tiles 1-5 / 12",
    "Encoding tiles 6-10 / 12",
    "Encoding tiles 11-12 / 12",
    "Phase 1: VAE encoding complete",
    "Phase 2: DiT upscaling complete",
    "Using VAE tiled decoding (Tile: 1024, Overlap: 128)",
    "Decoding tiles 1-5 / 12",
    "Decoding tiles 6-10 / 12",
    "Decoding tiles 11-12 / 12",
    "Phase 3: VAE decoding complete",
    "Phase 4: Post-processing complete",
]


class Tracking(unittest.TestCase):
    def test_moves_forward_through_a_run(self):
        p = pg.Progress(17)
        seen = [p.value()]
        labels = []
        for line in RUN:
            p.feed(line)
            seen.append(p.value())
            labels.append(p.label())
        self.assertTrue(all(b >= a - 1e-9 for a, b in zip(seen, seen[1:])), seen)
        self.assertGreater(seen[-1], 0.9)
        self.assertLess(seen[-1], 1.0)
        self.assertEqual(labels[1], "Preparing")
        self.assertEqual(labels[4], "Upscaling")
        self.assertEqual(labels[8], "Finishing details")
        self.assertEqual(labels[-1], "Saving")

    def test_tiles_move_the_bar_exactly(self):
        p = pg.Progress(17)
        p.feed("Phase 2: DiT upscaling complete")
        start = p.value()
        p.feed("Decoding tiles 6-10 / 10")
        share = p.share["decode"]
        self.assertAlmostEqual(p.value() - start, share * 0.5, places=3)

    def test_learning_shapes_the_next_run(self):
        hist = {"load": 2.0, "encode": 0.5, "upscale": 3.0, "decode": 1.0, "post": 0.1}
        p = pg.Progress(10, hist)
        self.assertAlmostEqual(sum(p.share.values()), 1.0, places=6)
        self.assertGreater(p.share["upscale"], p.share["decode"])
        self.assertIsNotNone(p.remaining())
        learned = p.learned()
        self.assertIn("load", learned)
        merged = pg.merge(hist, {"upscale": 1.0})
        self.assertAlmostEqual(merged["upscale"], 2.2, places=3)

    def test_tail_reads_only_new_lines(self):
        fd, path = tempfile.mkstemp()
        os.write(fd, b"old line\n")
        os.close(fd)
        t = pg.LogTail(path)
        with open(path, "ab") as fh:
            fh.write(b"Encoding tiles 1-5 / 12\nhalf a li")
        self.assertEqual(t.lines(), ["Encoding tiles 1-5 / 12"])
        with open(path, "ab") as fh:
            fh.write(b"ne\n")
        self.assertEqual(t.lines(), ["half a line"])
        os.remove(path)


if __name__ == "__main__":
    unittest.main()
