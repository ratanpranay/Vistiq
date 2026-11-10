import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))

from vistiq import workflow as wf  # noqa: E402


class Sizes(unittest.TestCase):
    def test_scale(self):
        self.assertEqual(wf.output_size(1024, 576, 2), (2048, 1152))
        self.assertEqual(wf.output_size(1024, 576, 4), (4096, 2304))

    def test_never_past_7000(self):
        for scale in (2, 4, "max"):
            for w, h in ((3000, 2000), (2000, 3000), (6999, 10), (12000, 9000)):
                ow, oh = wf.output_size(w, h, scale)
                self.assertLessEqual(max(ow, oh), 7000, (w, h, scale))

    def test_cannot_raise_the_limit(self):
        ow, oh = wf.output_size(1000, 1000, "max", max_res=20000)
        self.assertEqual((ow, oh), (7000, 7000))

    def test_max(self):
        self.assertEqual(wf.output_size(1000, 500, "max"), (7000, 3500))
        self.assertEqual(wf.target_resolution(1000, 500, "max"), 3500)


class Prompt(unittest.TestCase):
    def test_matches_original_graph(self):
        with open(os.path.join(ROOT, "app", "workflow_image.json"), encoding="utf-8") as fh:
            graph = json.load(fh)
        types = {str(n["id"]): n["type"] for n in graph["nodes"] if n.get("mode", 0) != 4 and n["type"] != "Note"}
        prompt = wf.build_prompt("x.png", 1024, 576, scale="4")
        self.assertEqual({k: v["class_type"] for k, v in prompt.items()}, types)

    def test_inputs(self):
        p = wf.build_prompt("x.png", 1024, 576, scale="4")
        up = p[wf.NODE_UPSCALE]["inputs"]
        self.assertEqual(up["resolution"], 2304)
        self.assertEqual(up["max_resolution"], 7000)
        self.assertEqual(up["color_correction"], "lab")
        self.assertEqual(p[wf.NODE_DIT]["inputs"]["model"], wf.DEFAULT_DIT)


if __name__ == "__main__":
    unittest.main()
