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

    def test_ceiling(self):
        ow, oh = wf.output_size(1000, 1000, "max", max_res=20000)
        self.assertEqual((ow, oh), (16384, 16384))

    def test_chosen_limit(self):
        self.assertEqual(wf.output_size(3584, 1184, 4, max_res=16384), (14336, 4736))
        self.assertEqual(wf.output_size(3584, 1184, "max", max_res=8192), (8192, 2706))

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
        self.assertEqual(up["new_resolution"], 2304)
        self.assertNotIn("resolution", up)
        self.assertEqual(up["max_resolution"], 7000)
        self.assertEqual(up["color_correction"], "lab")
        self.assertEqual(p[wf.NODE_DIT]["inputs"]["model"], wf.DEFAULT_DIT)




class NodeInputs(unittest.TestCase):
    """The prompt must use exactly the input names the pinned nodes declare."""
    EXPECTED = {
        "SeedVR2VideoUpscaler": {"image", "dit", "vae", "seed", "new_resolution", "max_resolution",
                                 "batch_size", "uniform_batch_size", "temporal_overlap",
                                 "prepend_frames", "color_correction", "input_noise_scale",
                                 "latent_noise_scale", "offload_device", "enable_debug"},
        "SeedVR2LoadDiTModel": {"model", "device", "blocks_to_swap", "swap_io_components",
                                "offload_device", "cache_model", "attention_mode"},
        "SeedVR2LoadVAEModel": {"model", "device", "encode_tiled", "encode_tile_size",
                                "encode_tile_overlap", "decode_tiled", "decode_tile_size",
                                "decode_tile_overlap", "tile_debug", "offload_device", "cache_model"},
    }

    def test_names(self):
        p = wf.build_prompt("x.png", 3584, 1184, scale="2")
        for node in p.values():
            want = self.EXPECTED.get(node["class_type"])
            if want:
                self.assertEqual(set(node["inputs"]), want, node["class_type"])


class Detail(unittest.TestCase):
    def test_levels_reach_the_prompt(self):
        p = wf.build_prompt("x.png", 1000, 500, detail="creative")
        self.assertEqual(p[wf.NODE_UPSCALE]["inputs"]["input_noise_scale"], wf.DETAIL["creative"][0])
        p = wf.build_prompt("x.png", 1000, 500)
        self.assertEqual(p[wf.NODE_UPSCALE]["inputs"]["input_noise_scale"], 0.0)

    def test_opaque_pictures_skip_the_alpha_step(self):
        p = wf.build_prompt("x.png", 1000, 500, alpha=False)
        self.assertNotIn(wf.NODE_ALPHA, p)
        self.assertEqual(p[wf.NODE_UPSCALE]["inputs"]["image"], [wf.NODE_LOAD, 0])
        p = wf.build_prompt("x.png", 1000, 500)
        self.assertEqual(p[wf.NODE_UPSCALE]["inputs"]["image"], [wf.NODE_ALPHA, 0])

    def test_passes(self):
        self.assertEqual(wf.passes(1000, 2000), [2.0])
        self.assertEqual(wf.passes(1000, 4000), [2.0, 2.0])
        self.assertEqual(wf.passes(1000, 4000, two_pass=False), [4.0])


if __name__ == "__main__":
    unittest.main()
