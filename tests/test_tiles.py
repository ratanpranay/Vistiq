import io
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))

from PIL import Image, ImageChops, ImageStat  # noqa: E402

from vistiq import engine as eng, tiles  # noqa: E402


def gradient(w, h, mode="RGB"):
    im = Image.linear_gradient("L").resize((w, h))
    rgb = Image.merge("RGB", (im, im.transpose(Image.FLIP_LEFT_RIGHT), im.rotate(90).resize((w, h))))
    if mode == "RGBA":
        rgb.putalpha(Image.new("L", (w, h), 200))
    return rgb


class FakeEngine(eng.Engine):
    """Engine whose upscale step resizes, and runs out of memory above a size."""

    def __init__(self, fits_mp):
        self.state, self.url, self.own, self.vaes = "ready", "x", False, []
        self.fits_mp, self.calls = fits_mp, []

    def _one(self, path, width, height, scale, model, max_res, on_progress, cancelled,
             tuning, retry_tuning):
        ow, oh = eng.wf.output_size(width, height, scale, max_res)
        self.calls.append((ow, oh))
        if ow * oh / 1e6 > self.fits_mp:
            raise eng.MemoryError_("The graphics card ran out of memory.")
        if on_progress:
            on_progress("Upscaling", 0.5, 10)
        b = io.BytesIO()
        Image.open(path).resize((ow, oh), Image.BICUBIC).save(b, "PNG")
        return b.getvalue()


class Parts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def run_fake(self, w, h, scale, max_res, part_mp, fits, mode="RGB"):
        path = os.path.join(self.tmp.name, "in.png")
        gradient(w, h, mode).save(path)
        e = FakeEngine(fits)
        seen = []
        data = e.upscale(path, w, h, scale, "m", max_res, part_mp=part_mp,
                         on_progress=lambda *a: seen.append(a))
        return e, Image.open(io.BytesIO(data)), Image.open(path), seen

    def test_plan_for_52mp_on_16gb(self):
        boxes = tiles.plan(4800, 2700, 9600, 5400, tiles.part_limit(15.9))
        self.assertGreater(len(boxes), 1)
        for x0, y0, x1, y1 in boxes:
            self.assertLessEqual((x1 - x0) * (y1 - y0) * 4 / 1e6, tiles.part_limit(15.9))

    def test_small_result_is_one_part(self):
        self.assertEqual(tiles.plan(3584, 1184, 7168, 2368, 22), [(0, 0, 3584, 1184)])

    def test_parts_join_without_seams(self):
        e, out, src, seen = self.run_fake(480, 270, "2", 16384, 0.15, 1.0)
        self.assertEqual(out.size, (960, 540))
        self.assertGreater(len(e.calls), 1)
        ref = src.resize((960, 540), Image.BICUBIC)
        diff = ImageStat.Stat(ImageChops.difference(out.convert("RGB"), ref)).mean
        self.assertLess(max(diff), 2.0)
        self.assertTrue(any("part 2 of" in a[0] for a in seen))
        values = [a[1] for a in seen if a[1] is not None]
        self.assertEqual(values, sorted(values))

    def test_alpha_is_kept(self):
        _, out, _, _ = self.run_fake(300, 200, "2", 16384, 0.08, 1.0, mode="RGBA")
        self.assertEqual(out.mode, "RGBA")
        self.assertEqual(out.getchannel("A").getextrema(), (200, 200))

    def test_out_of_memory_makes_parts_smaller(self):
        e, out, _, _ = self.run_fake(480, 270, "2", 16384, None, 0.2)
        self.assertEqual(out.size, (960, 540))
        self.assertIsNotNone(e.learned_part_mp)
        self.assertLessEqual(e.learned_part_mp, 0.2 / 0.6 + 0.1)


if __name__ == "__main__":
    unittest.main()
