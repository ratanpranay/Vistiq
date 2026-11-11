"""The SeedVR2 image-upscale workflow, in ComfyUI's API format.

Built from the user's own graph (workflow_image.json). Node ids are
kept the same as in that file so a ComfyUI error that names a node id can be
matched back to it. The torch.compile settings node is bypassed in the
original graph and is left out here, which is what bypassing it means.
"""

DEFAULT_DIT = "seedvr2_ema_7b_sharp_fp16.safetensors"
DEFAULT_VAE = "ema_vae_fp16.safetensors"
DEFAULT_MAX_RES = 7000
#: The default largest side, and the most the upscaler nodes accept.
LIMIT = 7000
CEILING = 16384
SIZES = (4096, 7000, 8192, 12000, 16384)

NODE_LOAD = "16"
NODE_ALPHA = "17"
NODE_DIT = "14"
NODE_VAE = "13"
NODE_UPSCALE = "10"
NODE_SAVE = "15"

#: How much freedom the upscaler gets to build texture: noise added to the
#: picture before it's read (input) and while it's upscaled (latent).
#: Faithful is the original workflow.
DETAIL = {
    "faithful": (0.0, 0.0),
    "balanced": (0.1, 0.0),
    "creative": (0.25, 0.03),
}

#: What each node is doing, in words for the progress line.
STAGES = {
    NODE_LOAD: "Reading image",
    NODE_ALPHA: "Reading image",
    NODE_DIT: "Loading model",
    NODE_VAE: "Loading model",
    NODE_UPSCALE: "Upscaling",
    NODE_SAVE: "Finishing",
}


def output_size(width, height, scale, max_res=DEFAULT_MAX_RES):
    """The size the result will come out at.

    `scale` is a number (2, 4) or "max". SeedVR2 is driven by the target
    length of the short side, capped so the long side never passes
    `max_res`; this mirrors that so the app can show the size up front.
    """
    width, height = int(width), int(height)
    max_res = min(int(max_res or LIMIT), CEILING)
    if width <= 0 or height <= 0:
        return 0, 0
    long_side = max(width, height)
    if scale == "max":
        factor = max_res / float(long_side)
    else:
        factor = float(scale)
        if long_side * factor > max_res:
            factor = max_res / float(long_side)
    return int(round(width * factor / 2.0)) * 2, int(round(height * factor / 2.0)) * 2


TWO_PASS_FROM = 2.5


def passes(width, out_width, two_pass=True):
    """The scale of each step: one step, or two equal ones when the result
    is TWO_PASS_FROM times the original or more. Below that the steps would
    be too small to add anything, for half as much time again."""
    total = out_width / float(max(1, width))
    if not two_pass or total < TWO_PASS_FROM:
        return [total]
    step = total ** 0.5
    return [step, step]


def target_resolution(width, height, scale, max_res=DEFAULT_MAX_RES):
    """SeedVR2's `resolution` input: the short side of the result."""
    out_w, out_h = output_size(width, height, scale, max_res)
    return max(16, min(out_w, out_h))


def build_prompt(image_name, width, height, scale="4", dit_model=DEFAULT_DIT,
                 vae_model=DEFAULT_VAE, max_res=DEFAULT_MAX_RES, seed=42,
                 prefix="Vistiq/out", resolution_key="new_resolution", tuning=None,
                 debug=False, detail="faithful", alpha=True):
    """The API-format prompt for one image already uploaded to ComfyUI."""
    input_noise, latent_noise = DETAIL.get(detail, DETAIL["faithful"])
    if scale != "max":
        scale = float(scale)
    max_res = min(int(max_res or LIMIT), CEILING)
    resolution = target_resolution(width, height, scale, max_res)
    t = {"blocks_to_swap": 36, "cache_model": False, "tile": 1024, "overlap": 128}
    t.update(tuning or {})
    prompt = {
        NODE_LOAD: {
            "class_type": "LoadImage",
            "inputs": {"image": image_name},
        },
        NODE_ALPHA: {
            "class_type": "JoinImageWithAlpha",
            "inputs": {"image": [NODE_LOAD, 0], "alpha": [NODE_LOAD, 1]},
        },
        NODE_DIT: {
            "class_type": "SeedVR2LoadDiTModel",
            "inputs": {
                "model": dit_model,
                "device": "cuda:0",
                "blocks_to_swap": int(t["blocks_to_swap"]),
                "swap_io_components": False,
                "offload_device": "cpu",
                "cache_model": bool(t["cache_model"]),
                "attention_mode": "sdpa",
            },
        },
        NODE_VAE: {
            "class_type": "SeedVR2LoadVAEModel",
            "inputs": {
                "model": vae_model,
                "device": "cuda:0",
                "encode_tiled": True,
                "encode_tile_size": int(t["tile"]),
                "encode_tile_overlap": int(t["overlap"]),
                "decode_tiled": True,
                "decode_tile_size": int(t["tile"]),
                "decode_tile_overlap": int(t["overlap"]),
                "tile_debug": "false",
                "offload_device": "cpu",
                "cache_model": bool(t["cache_model"]),
            },
        },
        NODE_UPSCALE: {
            "class_type": "SeedVR2VideoUpscaler",
            "inputs": {
                "image": [NODE_ALPHA, 0] if alpha else [NODE_LOAD, 0],
                "dit": [NODE_DIT, 0],
                "vae": [NODE_VAE, 0],
                "seed": int(seed),
                resolution_key: int(resolution),
                "max_resolution": int(max_res),
                "batch_size": 1,
                "uniform_batch_size": False,
                "color_correction": "lab",
                "temporal_overlap": 0,
                "prepend_frames": 0,
                "input_noise_scale": float(input_noise),
                "latent_noise_scale": float(latent_noise),
                "offload_device": "cpu",
                "enable_debug": bool(debug),
            },
        },
        NODE_SAVE: {
            "class_type": "SaveImage",
            "inputs": {"images": [NODE_UPSCALE, 0], "filename_prefix": prefix},
        },
    }
    if not alpha:
        # Nothing transparent in the picture: leave the alpha step out. The
        # upscaler otherwise upscales a transparency channel too, which
        # takes time and can leave faint see-through specks.
        del prompt[NODE_ALPHA]
    return prompt
