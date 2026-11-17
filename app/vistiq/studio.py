"""Vistiq Studio: image generation next to the upscaler.

Create   one image (render or sketch) + a prompt -> changed light, CMF, style
Reference  your design + a reference image -> its camera view, CMF or style
Juice    an optional second pass that adds atmosphere (Flux.1 + a LoRA)

It runs on a second private ComfyUI (the image engine), pinned to the build
the person's own Klein workflow runs on. The upscaler keeps its own engine and
version; only one of them holds the graphics card at a time.

Model files live in the Vistiq Studio folder (Documents\\Vistiq Studio\\Models).
Files that need a Hugging Face login (FLUX.2 Klein 9B) or come from elsewhere
(LoRAs) are taken from a ComfyUI models folder the person already has: linked,
not copied, when it is on the same drive.
"""
import json
import math
import logging
import os
import random
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid

import requests

from . import engine_setup
from .engine import CREATE_NO_WINDOW, BELOW_NORMAL_PRIORITY_CLASS, _local, _kill_tree, _pid_on_port, _port_free


def _own_pid_on_port(port):
    """The process on a port, only if it is the image engine (its program
    lives in the image engine's folder). Anything else is left alone."""
    pid = _pid_on_port(port)
    if not pid:
        return None
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                              "(Get-Process -Id %d).Path" % pid], capture_output=True, text=True,
                             timeout=15, creationflags=CREATE_NO_WINDOW).stdout
    except Exception:
        return None
    path = os.path.normcase(os.path.normpath(out.strip()))
    home = os.path.normcase(os.path.normpath(engine_dir()))
    return pid if path and path.startswith(home + os.sep) else None

log = logging.getLogger("vistiq")

PORTABLE_VERSION = "v0.44.0"
PORTABLE = ("https://github.com/comfyanonymous/ComfyUI/releases/download/%s/"
            "ComfyUI_windows_portable_nvidia.7z" % PORTABLE_VERSION)
PORT = 8392


# -- folders ------------------------------------------------------------

def _documents():
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    return docs if os.path.isdir(docs) else os.path.expanduser("~")


def home(settings=None):
    chosen = (settings.get("studio_home") if settings else "") or ""
    return chosen or os.path.join(_documents(), "Vistiq Studio")


def outputs_dir(settings=None):
    return os.path.join(home(settings), "Outputs")


def models_dir(settings=None):
    return os.path.join(home(settings), "Models")


def engine_dir():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "VistiqStudio", "engine")


def portable_dir():
    return os.path.join(engine_dir(), "ComfyUI_windows_portable")


SUBFOLDERS = ("diffusion_models", "text_encoders", "vae", "loras", "controlnet", "depthanything3")


# -- the model files ------------------------------------------------------

HF = "https://huggingface.co/%s/resolve/main/%s"

#: What each part needs. `names` are accepted file names, best first; `url` a
#: download that needs no login (None: take it from a ComfyUI folder, or the
#: page says how to get it).
FILES = [
    {"key": "klein", "part": "create", "tier": "best", "folder": "diffusion_models", "label": "Image model",
     "names": ["flux-2-klein-9b-fp8mixed.safetensors", "flux-2-klein-9b-fp8.safetensors",
               "flux-2-klein-9b.safetensors"],
     "gb": 9.4, "url": None, "page": "https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8",
     "about": "Makes the images. Its maker asks for a free sign-in to download it."},
    {"key": "qwen", "part": "create", "tier": "best", "folder": "text_encoders", "label": "Prompt reader",
     "names": ["qwen_3_8b_fp8mixed.safetensors", "qwen_3_8b.safetensors"], "gb": 8.7,
     "url": HF % ("Comfy-Org/flux2-klein-9B", "split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-klein-9B", "about": "Understands what you type."},
    {"key": "vae2", "part": "create", "folder": "vae", "label": "Image decoder",
     "names": ["flux2-vae.safetensors"], "gb": 0.34,
     "url": HF % ("Comfy-Org/flux2-dev", "split_files/vae/flux2-vae.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-dev", "about": "Turns the model's work into a picture."},
    {"key": "consistency", "part": "create", "tier": "best", "folder": "loras", "label": "Design lock",
     "names": ["Klein-consistency.safetensors"], "gb": 0.33, "url": None, "page": "",
     "optional": True, "about": "Holds your design in place (Keep my design)."},
    {"key": "klein4b", "part": "create", "tier": "good", "folder": "diffusion_models", "label": "Image model",
     "names": ["flux-2-klein-4b-fp8.safetensors", "flux-2-klein-4b.safetensors"], "gb": 4.0,
     "url": HF % ("black-forest-labs/FLUX.2-klein-4b-fp8", "flux-2-klein-4b-fp8.safetensors"),
     "page": "https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8", "about": "Makes the images."},
    {"key": "qwen4b", "part": "create", "tier": "good", "folder": "text_encoders", "label": "Prompt reader",
     "names": ["qwen_3_4b.safetensors", "qwen_3_4b_fp8_mixed.safetensors"], "gb": 8.0,
     "url": HF % ("Comfy-Org/flux2-klein-4B", "split_files/text_encoders/qwen_3_4b.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/flux2-klein-4B", "about": "Understands what you type."},
    # FLUX 3 Image Klein (Oct 2026): used instead of Klein 9B whenever both
    # files are here. Gated on Hugging Face: a free sign-in and "agree" first.
    {"key": "flux3", "part": "flux3", "folder": "diffusion_models", "label": "FLUX 3 image model",
     "names": ["flux3-image-klein-int8-convrot.safetensors", "flux3-image-klein-nvfp4.safetensors",
               "flux3-image-klein-bf16.safetensors"], "gb": 5.8, "url": None, "optional": True,
     "page": "https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy",
     "about": "The newest image model: more real light, materials and detail."},
    {"key": "qwen3vl", "part": "flux3", "folder": "text_encoders", "label": "FLUX 3 prompt reader",
     "names": ["qwen3vl_4b_int8_convrot.safetensors", "qwen3vl_4b_bf16.safetensors"], "gb": 4.9, "url": None,
     "optional": True, "page": "https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy",
     "about": "Understands what you type and sees your reference pictures."},
    # Qwen Image Edit 2511 (Nov 2026, experimental): reads the picture natively, so
    # it understands context (what a sketch shows, what a change implies, new views).
    {"key": "qie", "part": "qwenedit", "folder": "diffusion_models", "label": "Qwen Image Edit model",
     "names": ["qwen_image_edit_2511_int8_convrot.safetensors", "qwen_image_edit_2511_fp8mixed.safetensors",
               "qwen_image_edit_2511_bf16.safetensors"], "gb": 20.5, "optional": True,
     "url": HF % ("Comfy-Org/Qwen-Image-Edit_ComfyUI", "split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI", "about": "Understands pictures and changes in context."},
    {"key": "qie_te", "part": "qwenedit", "folder": "text_encoders", "label": "Qwen Image Edit reader",
     "names": ["qwen_2.5_vl_7b_fp8_scaled.safetensors"], "gb": 9.4, "optional": True,
     "url": HF % ("Comfy-Org/HunyuanVideo_1.5_repackaged", "split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged", "about": "Sees your picture and reads your words."},
    {"key": "qie_vae", "part": "qwenedit", "folder": "vae", "label": "Qwen Image Edit decoder",
     "names": ["qwen_image_vae.safetensors"], "gb": 0.25, "optional": True,
     "url": HF % ("Comfy-Org/Qwen-Image_ComfyUI", "split_files/vae/qwen_image_vae.safetensors"),
     "page": "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI", "about": "Turns its work into a picture."},
    {"key": "qie_fast", "part": "qwenedit", "folder": "loras", "label": "Qwen Image Edit speed-up",
     "names": ["Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"], "gb": 0.85, "optional": True,
     "url": HF % ("lightx2v/Qwen-Image-Edit-2511-Lightning", "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"),
     "page": "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning", "about": "4 steps instead of 40."},
    # Camera angles (Nov 2026): a LoRA trained only on camera moves for this model; 3D views
    # follow the chosen view far more often with it ("<sks> back-left quarter view ...").
    {"key": "qie_angles", "part": "qwenedit", "folder": "loras", "label": "Camera angles",
     "names": ["qwen-image-edit-2511-multiple-angles-lora.safetensors"], "gb": 0.3, "optional": True,
     "url": HF % ("fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA", "qwen-image-edit-2511-multiple-angles-lora.safetensors"),
     "page": "https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA", "about": "Apache-2.0. Better 3D views."},
    # Anything2Real (Nov 2026, testing): sketches and illustrations to photographs, keeps the composition.
    {"key": "qie_real", "part": "qwenedit", "folder": "loras", "label": "Photo realism",
     "names": ["anything2real_2601.safetensors"], "gb": 0.6, "optional": True,
     "url": HF % ("jdmontegue/Anything2RealLCL", "anything2real_2601.safetensors"),
     "page": "https://huggingface.co/jdmontegue/Anything2RealLCL", "about": "Apache-2.0. Sketch to photograph."},
    # MetaView (experimental, Nov 2026): one picture + a camera move (yaw, pitch) renders the
    # scene from the new viewpoint. Built on Qwen Image Edit (shares its reader and decoder).
    # Its depth models (Depth-Anything-3) are non-commercial (CC BY-NC 4.0).
    {"key": "mv", "part": "metaview", "folder": "diffusion_models", "label": "MetaView model",
     "names": ["metaview_dit_fp8scaled.safetensors"], "gb": 28.4, "optional": True,
     "url": HF % ("Wherebot101/MetaView-ComfyUI", "metaview_dit_fp8scaled.safetensors"),
     "page": "https://huggingface.co/Wherebot101/MetaView-ComfyUI", "about": "Moves the camera in your picture."},
    {"key": "mv_giant_cfg", "part": "metaview", "folder": "depthanything3/DA3-GIANT-1.1", "label": "MetaView depth (3D)",
     "names": ["config.json"], "gb": 0.0, "optional": True, "url": HF % ("depth-anything/DA3-GIANT-1.1", "config.json"),
     "page": "https://huggingface.co/depth-anything/DA3-GIANT-1.1", "about": ""},
    {"key": "mv_giant", "part": "metaview", "folder": "depthanything3/DA3-GIANT-1.1", "label": "MetaView depth (3D)",
     "names": ["model.safetensors"], "gb": 4.5, "optional": True, "url": HF % ("depth-anything/DA3-GIANT-1.1", "model.safetensors"),
     "page": "https://huggingface.co/depth-anything/DA3-GIANT-1.1", "about": "Reads the 3D shape of your picture."},
    {"key": "mv_depth_cfg", "part": "metaview", "folder": "depthanything3/DA3NESTED-GIANT-LARGE-1.1", "label": "MetaView depth",
     "names": ["config.json"], "gb": 0.0, "optional": True, "url": HF % ("depth-anything/DA3NESTED-GIANT-LARGE-1.1", "config.json"),
     "page": "https://huggingface.co/depth-anything/DA3NESTED-GIANT-LARGE-1.1", "about": ""},
    {"key": "mv_depth", "part": "metaview", "folder": "depthanything3/DA3NESTED-GIANT-LARGE-1.1", "label": "MetaView depth",
     "names": ["model.safetensors"], "gb": 6.0, "optional": True, "url": HF % ("depth-anything/DA3NESTED-GIANT-LARGE-1.1", "model.safetensors"),
     "page": "https://huggingface.co/depth-anything/DA3NESTED-GIANT-LARGE-1.1", "about": "Reads how far each part is."},
    {"key": "flux1", "part": "juice", "folder": "diffusion_models", "label": "Finishing model",
     "names": ["flux1-dev-fp8.safetensors", "flux1-dev.safetensors"], "gb": 23.8, "url": None,
     "page": "https://huggingface.co/black-forest-labs/FLUX.1-dev",
     "about": "Adds atmosphere in the finishing pass."},
    {"key": "t5", "part": "juice", "folder": "text_encoders", "label": "Finishing prompt reader",
     "names": ["t5xxl_fp8_e4m3fn.safetensors", "t5xxl_fp8_e4m3fn_scaled.safetensors", "t5xxl_fp16.safetensors"],
     "gb": 4.9, "url": HF % ("comfyanonymous/flux_text_encoders", "t5xxl_fp8_e4m3fn.safetensors"),
     "page": "https://huggingface.co/comfyanonymous/flux_text_encoders", "about": "Understands what you type, for the finishing pass."},
    {"key": "clipl", "part": "juice", "folder": "text_encoders", "label": "Finishing prompt reader 2",
     "names": ["clip_l.safetensors"], "gb": 0.25,
     "url": HF % ("comfyanonymous/flux_text_encoders", "clip_l.safetensors"),
     "page": "https://huggingface.co/comfyanonymous/flux_text_encoders", "about": "Understands what you type, for the finishing pass."},
    {"key": "vae1", "part": "juice", "folder": "vae", "label": "Finishing decoder",
     "names": ["ae.safetensors", "flux1-vae.safetensors"], "gb": 0.34,
     "url": HF % ("Comfy-Org/Lumina_Image_2.0_Repackaged", "split_files/vae/ae.safetensors"),
     "page": "https://huggingface.co/black-forest-labs/FLUX.1-dev", "about": "Turns the finishing pass's work into a picture."},
]


def find(key, settings=None):
    """Path of a model file in the Studio folder, or None."""
    spec = next(f for f in FILES if f["key"] == key)
    folder = os.path.join(models_dir(settings), spec["folder"])
    for n in spec["names"]:
        p = os.path.join(folder, n)
        if os.path.isfile(p):
            return p
    return None


def loras(settings=None):
    """LoRA files in the Studio folder, with the model family each was made
    for (read from the file itself)."""
    folder = os.path.join(models_dir(settings), "loras")
    out = []
    if os.path.isdir(folder):
        for n in sorted(os.listdir(folder)):
            if n.endswith(".safetensors"):
                p = os.path.join(folder, n)
                # Studio's own helpers (design lock, speed-up) aren't styles to pick.
                builtin = any(n in f["names"] for f in FILES if f["folder"] == "loras") or n in RETIRED
                out.append({"name": n, "label": friendly_name(n), "family": lora_family(p),
                            "gb": round(os.path.getsize(p) / 1e9, 2), "builtin": builtin})
    return out


def friendly_name(file_name):
    """A LoRA's name for people: no extension, no version tags, no hashes."""
    stem = os.path.splitext(file_name)[0]
    if re.fullmatch(r"(?i)klein[-_ ]?consistency", stem):
        return "Design lock"
    if re.match(r"(?i)^(libenc|liblib)[-_]?[0-9a-f]{16,}$", stem) or re.fullmatch(r"[0-9a-f]{20,}", stem):
        return "Liblib style " + stem[-4:].upper()
    stem = re.sub(r"[_-]+", " ", stem)
    stem = re.sub(r"(?i)\b(v\d+(\.\d+)*|fp8|fp16|bf16|lora|safetensors|enhanced edition)\b", "", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .")
    return (stem[:1].upper() + stem[1:]) if stem else file_name


def lora_family(path):
    """'klein9b', 'klein4b', 'flux1', 'sdxl', 'sd15' or 'unknown', from the
    LoRA's own layout: names and sizes of the layers it changes."""
    try:
        with open(path, "rb") as fh:
            n = struct.unpack("<Q", fh.read(8))[0]
            if n > 50_000_000:
                return "unknown"
            head = json.loads(fh.read(n))
    except Exception:
        return "unknown"
    meta = head.pop("__metadata__", None) or {}
    if meta.get("provider") == "liblib" or "liblibai_model_version_id" in meta:
        # Downloaded from Liblib in its locked form: the weights are scrambled and
        # only Liblib's own app can use them (anywhere else they give black pictures).
        return "locked"
    keys = list(head)
    joined = " ".join(keys[:4000])
    flux_like = any(t in joined for t in ("double_blocks", "single_blocks", "single_transformer_blocks",
                                              "transformer.transformer_blocks"))
    if not flux_like and ("input_blocks" in joined or "down_blocks" in joined or "lora_te" in joined):
        dims = {v["shape"][-1] for k, v in head.items() if "attn2" in k and ("down" in k or "lora_A" in k)}
        return "sdxl" if 2048 in dims else "sd15"
    hidden = 0
    for k in keys:
        if ("lora_down" in k or "lora_A" in k) and ("attn" in k or "qkv" in k) and "lora_te" not in k:
            hidden = head[k]["shape"][-1]
            break
    if not hidden and flux_like:
        for k in keys:
            if ("lora_down" in k or "lora_A" in k) and "lora_te" not in k and re.search(r"(single|double)_", k):
                hidden = head[k]["shape"][-1]
                break
    double = {int(m.group(1)) for k in keys for m in [re.search(r"(?:double_blocks|transformer\.transformer_blocks)[._](\d+)[._]", k)] if m}
    if hidden == 4096:
        return "klein9b"
    if hidden == 3072 and len(double) >= 15:
        return "flux1"
    if hidden == 3072 and 0 < len(double) <= 8:
        return "klein4b"
    if hidden == 3072:
        return "flux1"
    return "unknown"


FAMILY_LABEL = {"klein9b": "FLUX.2 Klein 9B", "klein4b": "FLUX.2 Klein 4B", "flux1": "Flux.1",
                "sdxl": "SDXL", "sd15": "SD 1.5", "unknown": "unknown model"}


TIERS = {"best": "Best quality", "good": "Good quality"}
# Tested on real sketches on the user's PC (Nov 2026): without this wording the
# model tends to a flat, hazy look, and 6 steps are clearly crisper than 4.
CRISP = ("A professional photograph: crisp sharp focus, rich contrast, true-to-life colours, "
         "detailed real materials and textures, no haze.")
STEPS = 6
# Files from options that were tried and removed: never offered as styles.
RETIRED = ("Klein-9B-distill-speedup.safetensors",)


def in_tier(f, t):
    """Is file spec (or status row) `f` part of quality tier `t`? Shared files have no tier."""
    ft = f.get("tier")
    return ft is None or ft == t or (isinstance(ft, (tuple, list)) and t in ft)


def flux3_ready(settings=None):
    """FLUX 3 Image Klein is used when its two files and the shared decoder are here."""
    return sys.platform != "darwin" and all(_have(k, settings) for k in ("flux3", "qwen3vl", "vae2"))


def qwenedit_ready(settings=None):
    return sys.platform != "darwin" and all(_have(k, settings) for k in ("qie", "qie_te", "qie_vae", "qie_fast"))


MV_NODES = ("https://github.com/EnviralDesign/comfyUI-enviral-design-node-pack/archive/"
            "3a95f3bc3314976abdb74f9c54a186a1bb0ab988.zip")
MV_NODES_DIR = "comfyUI-enviral-design-node-pack"
MV_PACKAGES = ["addict", "omegaconf", "einops", "opencv-python-headless", "scipy", "color-matcher"]
MV_TRIGGER = "\u955c\u5934\u89c6\u89d2\u8f6c\u5230\u6307\u5b9a\u4f4d\u7f6e"   # its fixed trigger: "move the camera to the set viewpoint"


def metaview_nodes_dir():
    return os.path.join(portable_dir(), "ComfyUI", "custom_nodes", MV_NODES_DIR)


def angles_ready(settings=None):
    return qwenedit_ready(settings) and _have("qie_angles", settings)


# The car's own left and right (tested Nov 2026 on a Kia: "front-right" and "back-right" showed those corners).
ANGLE_AZ = {"front": "front view", "front-right": "front-right quarter view", "right": "right side view",
            "rear-right": "back-right quarter view", "rear": "back view", "rear-left": "back-left quarter view",
            "left": "left side view", "front-left": "front-left quarter view"}


def angles_text(target, pitch=0.0, dist=0.0):
    """The Camera angles LoRA's own wording: <sks> azimuth elevation distance."""
    p = float(pitch)
    elev = ("high-angle shot" if p >= 55 else "elevated shot" if p >= 15 else "low-angle shot" if p <= -12 else "eye-level shot")
    d = float(dist)
    far = "close-up" if d <= -0.25 else "wide shot" if d >= 0.25 else "medium shot"
    return "<sks> %s %s %s" % (ANGLE_AZ.get(target, "front view"), elev, far)


def metaview_ready(settings=None):
    return (sys.platform != "darwin" and os.path.isdir(metaview_nodes_dir())
            and all(_have(k, settings) for k in ("mv", "mv_giant", "mv_giant_cfg", "mv_depth", "mv_depth_cfg", "qie_te", "qie_vae")))


def metaview_prompt(settings, image, yaw, pitch, seed=None, width=0, height=0, steps=8):
    """MetaView: the picture seen from a camera turned by yaw / pitch degrees
    (the node pack's own example graph)."""
    s = settings
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": image}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(find("qie_te", s)), "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("qie_vae", s))}},
        "4": {"class_type": "TextEncodeQwenImageEdit", "inputs": {"clip": ["2", 0], "prompt": MV_TRIGGER, "image": ["1", 0]}},
        "5": {"class_type": "MetaViewDA3Loader", "inputs": {"giant_model": "DA3-GIANT-1.1", "depth_model": "DA3NESTED-GIANT-LARGE-1.1"}},
        "6": {"class_type": "MetaView3DConditioning", "inputs": {"conditioning": ["4", 0], "da3_model": ["5", 0], "image": ["1", 0],
                                                                 "yaw": float(yaw), "pitch": float(pitch), "radius": 0.0,
                                                                 "auto_radius": True, "vae": ["3", 0],
                                                                 "width": int(width), "height": int(height)}},
        "7": {"class_type": "MetaViewModelLoader", "inputs": {"model_name": os.path.basename(find("mv", s))}},
        "8": {"class_type": "TextEncodeQwenImageEdit", "inputs": {"clip": ["2", 0], "prompt": ""}},
        "12": {"class_type": "MetaViewSigmas", "inputs": {"steps": int(steps), "latent": ["6", 1]}},
        "13": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "SamplerCustom", "inputs": {"model": ["7", 0], "add_noise": True,
                                                        "noise_seed": int(seed if seed is not None else random.randint(1, 2**48)),
                                                        "cfg": 1.0, "positive": ["6", 0], "negative": ["8", 0], "sampler": ["13", 0],
                                                        "sigmas": ["12", 0], "latent_image": ["6", 1]}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["3", 0]}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "VistiqStudio"}},
    }


def use_qwenedit(settings=None):
    """Qwen Image Edit makes the pictures when it is here and chosen in Settings."""
    return bool(settings and settings.get("studio_engine") == "qwenedit") and qwenedit_ready(settings)


QE_MP = 3.2          # tested Nov 2026: 3.2 MP is crisp (logos, edges, textures) and still whole; 1.4 was soft
QE_MP_MIN = 1.0
QE_STEPS = 4


def qwenedit_prompt(settings, images, text, seed=None, frame=0, megapixels=QE_MP, steps=QE_STEPS, ref_latent=True,
                    ref_mp=1.0, angles=0.0, realism=0.0):
    """Qwen Image Edit 2511 with its 4-step speed-up (ComfyUI's own template,
    minus the extras). images[0] is the picture worked on; up to two more are
    references. `frame`: the image whose size the result takes.
    ref_latent: the model gets the pictures at the size it draws (ReferenceLatent). The
    stock encode node shrinks them to about 1 MP while we draw at ~3 MP; the mismatch made
    results zoom out (a wider, more distant view than the sketch, Nov 2026)."""
    s = settings
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("qie", s)), "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(find("qie_te", s)), "type": "qwen_image",
                                                       "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("qie_vae", s))}},
        "4": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": os.path.basename(find("qie_fast", s)),
                                                                "strength_model": 1.0}},
        "5": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["4", 0], "shift": 3.1}},
    }
    if angles:
        p["6"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["4", 0], "lora_name": os.path.basename(find("qie_angles", s)),
                                                                    "strength_model": float(angles)}}
        p["5"]["inputs"]["model"] = ["6", 0]
    if realism:      # Anything2Real: sketches and illustrations to photographs, composition kept
        prev = p["5"]["inputs"]["model"]
        p["7"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": prev, "lora_name": os.path.basename(find("qie_real", s)),
                                                                    "strength_model": float(realism)}}
        p["5"]["inputs"]["model"] = ["7", 0]
    enc = {"clip": ["2", 0], "prompt": text}
    if not ref_latent:
        enc["vae"] = ["3", 0]
    imgs = images[:3]
    fi = frame if frame < len(imgs) else 0
    for i, im in enumerate(imgs):
        load, scale = str(10 + 2 * i), str(11 + 2 * i)
        p[load] = {"class_type": "LoadImage", "inputs": {"image": im}}
        # The picture worked on (and the one whose size the result takes) at the drawing size;
        # other references smaller (they only lend a look).
        mp = megapixels if (i == 0 or i == fi or not ref_latent) else min(megapixels, ref_mp)
        p[scale] = {"class_type": "ImageScaleToTotalPixels",
                    "inputs": {"image": [load, 0], "upscale_method": "lanczos", "megapixels": float(mp),
                               "resolution_steps": 16}}
        enc["image%d" % (i + 1)] = [scale, 0]
    p["20"] = {"class_type": "TextEncodeQwenImageEditPlus", "inputs": enc}
    pos = ["20", 0]
    if ref_latent:
        for i in range(len(imgs)):
            e, r = str(50 + 2 * i), str(51 + 2 * i)
            p[e] = {"class_type": "VAEEncode", "inputs": {"pixels": [str(11 + 2 * i), 0], "vae": ["3", 0]}}
            p[r] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": pos, "latent": [e, 0]}}
            pos = [r, 0]
        latent = [str(50 + 2 * fi), 0]
    else:
        p["30"] = {"class_type": "VAEEncode", "inputs": {"pixels": [str(11 + 2 * fi), 0], "vae": ["3", 0]}}
        latent = ["30", 0]
    p.update({
        "21": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": pos}},
        "40": {"class_type": "KSampler",
               "inputs": {"model": ["5", 0], "positive": pos, "negative": ["21", 0], "latent_image": latent,
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)), "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudio"}},
    })
    return p


# The detail pass (on by default): Qwen draws at about 1.4 MP, so small parts (logos,
# text, stitching) come out soft. The result is redrawn at twice the size in
# overlapping parts, each with the same spot of the original when the view is kept.
QE_DETAIL = ("This is one part of a larger photograph. Redraw Picture 1 as a sharp, high-resolution photo: "
             "crisp edges and panel gaps, clean legible logos, text, icons and screen graphics, fine stitching, "
             "perforation and material texture. Change nothing else: exactly the same colours, materials, "
             "lighting, shapes, positions and framing.")
QE_DETAIL_SRC = (" Picture 2 is the same spot of the original design at high resolution: take its logos, text, "
                 "screen graphics, edges and small parts from it, but keep the colours and materials of Picture 1.")
DETAIL_TILE_MP = 1.2
DETAIL_SCALE = 2.0


def detail_boxes(w, h, tile_mp=DETAIL_TILE_MP, overlap=0.18):
    """Overlapping parts covering a w x h picture, each about tile_mp megapixels."""
    import math
    best = None
    for cols in range(1, 9):
        for rows in range(1, 9):
            tw, th = w / cols * (1 + overlap), h / rows * (1 + overlap)
            if tw * th > tile_mp * 1e6 or not (0.45 <= tw / th <= 2.2):
                continue
            if best is None or cols * rows < best[0] * best[1]:
                best = (cols, rows)
    cols, rows = best or (max(1, math.ceil(w / 1100)), max(1, math.ceil(h / 1100)))
    tw = min(w, int(math.ceil(w / cols * (1 + overlap) / 16) * 16))
    th = min(h, int(math.ceil(h / rows * (1 + overlap) / 16) * 16))
    boxes = []
    for r in range(rows):
        for c in range(cols):
            x = 0 if cols == 1 else round(c * (w - tw) / (cols - 1))
            y = 0 if rows == 1 else round(r * (h - th) / (rows - 1))
            boxes.append((x, y, x + tw, y + th))
    return boxes


# 3D: a camera move put into words. The picture reader says which side we see; the
# move then names the view to show ("rear-left three-quarter, from low"), which the
# model follows far better than "orbit 97 degrees". Azimuth: the camera's place around
# the car, clockwise seen from above, 0 = in front.
SIDES = ["front", "front-right", "right", "rear-right", "rear", "rear-left", "left", "front-left"]
SIDE_WORDS = {"front": "straight from the front", "front-right": "front-right three-quarter view",
              "right": "right side view", "rear-right": "rear-right three-quarter view", "rear": "straight from behind",
              "rear-left": "rear-left three-quarter view", "left": "left side view", "front-left": "front-left three-quarter view"}
CABIN_WORDS = {"front": "from the windscreen, looking back into the cabin over the dashboard",
               "front-right": "from the front passenger corner, looking across the cabin",
               "right": "from the open passenger door, looking across the cabin",
               "rear-right": "from behind the passenger seat, looking forward across the cabin",
               "rear": "from the middle of the rear seat, looking forward between the front seats",
               "rear-left": "from behind the driver's seat, looking forward across the cabin",
               "left": "from the open driver's door, looking across the cabin",
               "front-left": "from the driver's front corner, looking across the cabin"}


def parse_view(answer):
    """The picture reader's answer: (kind, side, height), with safe defaults.
    Outside a cabin the side comes from where the nose points in the picture: a car whose
    nose points to the picture's left shows its own left side (and the reverse)."""
    a = (answer or "").lower()
    kind = next((k for k in ("interior", "exterior", "product") if k in a), "exterior")
    m = re.search(r"side\s*=\s*([a-z-]+)", a)
    side = m.group(1) if m and m.group(1) in SIDES else "front-left"
    nose = re.search(r"nose\s*=\s*([a-z]+)", a)
    end = re.search(r"end\s*=\s*([a-z]+)", a)
    nose, end = nose and nose.group(1), end and end.group(1)
    if kind != "interior" and nose:
        if nose == "toward":
            side = "front"
        elif nose == "away":
            side = "rear"
        elif nose in ("left", "right"):
            side = nose if end not in ("front", "rear") else end + "-" + nose
    if kind == "interior" and side == "front":
        # the reader says "front" for almost every cabin picture; looking back from the
        # windscreen is rare, looking forward from the rear seats is the usual view
        side = "rear"
    m = re.search(r"height\s*=\s*([a-z]+)", a)
    height = m.group(1) if m and m.group(1) in ("low", "eye", "high", "top") else "eye"
    return kind, side, height


CABIN_LOOKS = ["toward the windscreen and dashboard", "toward the front passenger corner", "toward the passenger door",
               "toward the rear passenger-side corner", "toward the rear of the cabin", "toward the rear driver-side corner",
               "toward the driver's door", "toward the driver's front corner"]


CABIN_SEES = ["the dashboard, the steering wheel and the windscreen ahead",
              "the passenger side of the dashboard and the passenger door, at an angle",
              "the passenger side: the passenger seat, its door and window",
              "the rear passenger door and the right rear seat",
              "the rear seats and the back window",
              "the rear driver-side door and the left rear seat",
              "the driver's side: the driver's seat, its door and window",
              "the steering wheel, the driver's seat and the driver's door, seen at an angle across the cabin"]


def cabin_words(u, v, look):
    """Inside the cabin: where the camera stands (u: driver side -1 .. passenger side 1,
    v: dashboard -1 .. rear seats 1) and where it looks (degrees, 0 = forward, clockwise)."""
    u, v = float(u), float(v)
    row = ("at the dashboard" if v < -0.5 else "in the front row, between the front seats" if v < 0.1 and abs(u) <= 0.35
           else "in the front row" if v < 0.1 else "just behind the front seats" if v < 0.5 else "in the rear seats")
    side = "" if "between" in row else (" on the driver's side" if u < -0.35 else " on the passenger side" if u > 0.35 else " in the middle")
    k = int(round(float(look) / 45.0)) % 8
    return ("from inside the cabin: the camera stands " + row + side + ", looking " + CABIN_LOOKS[k] +
            "; the new picture shows " + CABIN_SEES[k] + ". The camera has clearly moved: the view is different "
            "from the picture")


def cabin_place(u, v):
    u, v = float(u), float(v)
    side = "driver's side" if u < -0.35 else "passenger side" if u > 0.35 else ""
    if v < -0.5:
        return "the dashboard" + (" on the " + side if side else "")
    if v < 0.1:   # the camera is where a person's eyes are, not looking at the seat from behind
        return ("the driver's head position, as if sitting in the driver's seat" if u < -0.35 else
                "the front passenger's head position, as if sitting in the passenger seat" if u > 0.35 else
                "between the front seats, at head height")
    if v < 0.5:
        return "just behind the front seats" + (" on the " + side if side else ", in the middle")
    return "the rear seats" + (" on the " + side if side else ", in the middle")


def cabin_move(base_side, u, v, look, height):
    """Inside a cabin the model follows a relative move from the picture's camera ("turn the
    camera 45 degrees to the left and move it to the front passenger seat"), not a place
    named on its own (tested Nov 2026: named places left the view unchanged)."""
    import math
    az = math.radians(SIDES.index(base_side if base_side in SIDES else "rear") * 45)
    bu, bv, blook = math.sin(az) * 30 / 38.0, -math.cos(az) * 62 / 82.0, (math.degrees(az) + 180) % 360
    turn = int(round(((float(look) - blook + 540) % 360 - 180) / 15.0)) * 15
    k = int(round(float(look) / 45.0)) % 8
    parts = []
    if abs(turn) >= 15:
        parts.append("Turn the camera %d degrees to the %s" % (abs(turn), "right" if turn > 0 else "left"))
    here, there = cabin_place(bu, bv), cabin_place(u, v)
    if there != here or math.hypot(float(u) - bu, float(v) - bv) > 0.3:
        parts.append(("and move it to " if parts else "Move the camera to ") + there)
    if not parts:
        parts.append("Keep the camera where it is")
    hs = ("" if height == "from eye level" else ", raise it and look down" if "above" in height or "raised" in height
          else ", lower it and look up")
    return (" ".join(parts) + hs + ", so it looks " + CABIN_LOOKS[k] + ": the new picture shows " + CABIN_SEES[k] +
            ". Same car interior, same design, materials and colours.")


def view_words(kind, side, yaw, pitch, dist=0.0, lens="normal", target=None, design="", cabin=None):
    """Words for the view after turning the camera by yaw (dragging right brings the
    picture's left side forward) and pitch degrees, or straight to `target` (a side).
    `design`: the picture reader's description of the design, so the new view keeps it."""
    if target not in SIDES:
        az = (SIDES.index(side) * 45 - float(yaw)) % 360
        target = SIDES[int(round(az / 45.0)) % 8]
    p = float(pitch)
    # 50 degrees made an almost top view (tested Nov 2026): "from above" is a raised camera
    # that still shows the side; only a very high setting looks steeply down.
    height = ("from high above, looking down at it" if p >= 55 else
              "from a slightly raised camera, a little above the roof, looking down a little, the side still fully visible" if p >= 15
              else "from a low camera close to the ground, looking up at it" if p <= -12 else "from eye level")
    if kind == "interior":
        # where to go: the plan's free camera, or a named spot on the ring round the cabin looking across it
        import math
        if cabin:
            u, v, lk = cabin.get("u", 0), cabin.get("v", 0), cabin.get("look", 0)
        else:
            az = math.radians(SIDES.index(target) * 45)
            u, v, lk = math.sin(az) * 30 / 38.0, -math.cos(az) * 62 / 82.0, (SIDES.index(target) * 45 + 180) % 360
        move = cabin_move(side, u, v, lk, height)
        extra = []
        if lens == "wide":
            extra.append("Use a wide-angle lens.")
        elif lens == "tele":
            extra.append("Use a long lens.")
        design = " ".join((design or "").split()).strip()
        return (move + (" The interior: " + design if design else "") + (" " + " ".join(extra) if extra else "") +
                " Add no logos, badges or text that are not in the picture."), target
    else:
        where = "the " + SIDE_WORDS[target] + ", " + height
    extra = []
    if dist <= -0.25:
        extra.append("closer in")
    elif dist >= 0.25:
        extra.append("from further back, showing more around it")
    if lens == "wide":
        extra.append("wide-angle lens")
    elif lens == "tele":
        extra.append("long lens, flat perspective")
    design = " ".join((design or "").split()).strip()
    if design and design[-1] not in ".!?":
        design += "."
    return ("Show this exact same design from a new camera: " + where + (", " + ", ".join(extra) if extra else "") + ". " +
            ("The design: " + design + " " if design else "") +
            "Keep every part exactly as designed: the same proportions, silhouette, lights, grille, wheels, window "
            "line, surfaces and colours; only the camera moves. Keep the picture's look exactly: the same kind of "
            "image, materials, colours and light. Parts that were "
            "hidden are completed to match the design. Add no logos, badges or text that are not in the picture."), target


QE_INSTANT = ("Turn this design sketch into a finished, photorealistic CGI render, like a car maker's studio "
              "visualization: every drawn shape becomes the real part it stands for, built with real materials, glass, "
              "panel gaps and stitching; parts the sketch only hints at are completed. Keep the design, proportions, "
              "colour scheme and camera view. No sketch lines remain. Keep the exact framing, lens and perspective "
              "of the picture: every part stays the same size and in the same place, nothing new appears at the "
              "edges. Each part keeps exactly the colour it is painted (dark blue stays dark blue, tan stays tan); "
              "add no wood, chrome or colours that are not in the picture. Where the picture is only lines, use a "
              "calm, premium two-tone scheme. Add no logos, badges, brand marks or text that are not drawn; the "
              "steering wheel hub stays plain.")
# The renders came out clean but flat and static (Nov 2026, next to Vizcom). Juicy press-photo looks,
# after the person's own references; each render takes one (variations differ). The design stays.
QE_KEEP_DRAWN = ("The design is exactly the picture's: same proportions, silhouette, lamp graphics, grille, wheels, "
                 "surfaces and every line; only light, materials and setting are added.")
QE_JUICE_INT = [
    ("Cinematic premium car-maker interior photograph at golden hour: warm low sunlight rakes across the cabin, glowing "
     "highlights on leather and brushed metal, deep soft shadows, rich warm contrast, shallow depth of field; perforated, "
     "stitched leather with visible grain, knurled and brushed aluminium, glossy black glass screens with reflections; "
     "through the windows a softly blurred warm landscape."),
    ("Premium car-maker interior photograph in bright natural daylight: sun streams through the windows and glass roof, "
     "crisp sun patches and soft shadows across the seats and dashboard, clean airy contrast, fine leather grain and "
     "stitching, satin metal, glossy trims; outside, a bright, softly blurred mountain and desert landscape."),
    ("Premium car-maker interior photograph in the evening: soft warm ambient light lines glow along the dashboard and "
     "doors, gentle pools of light on leather and metal, screens glowing, deep calm shadows; through the windows a "
     "dusky landscape under a deep blue sky."),
]
QE_JUICE_EXT = [
    ("Cinematic premium car-maker launch photograph: the car stands on a polished, slightly wet stone floor that mirrors it, "
     "in front of a modern architectural wall of tall panels glowing with warm golden light; crisp, long reflections flow "
     "along the body, glowing lamp graphics, a deep soft contact shadow, rich contrast and depth."),
    ("Premium car-maker press photograph in clear daylight by a calm mountain lake: snow-capped peaks reflected in still "
     "water behind, the car on a pale concrete apron with a crisp sun shadow, clean bright reflections on the paint and "
     "glass, rich detail in wheels and lamps."),
    ("Premium car-maker studio photograph at dusk: the car on a vast glossy floor that reflects it, under a soft gradient "
     "sky from warm horizon to blue, gentle rim light tracing the body lines, glowing lamps, deep contact shadow."),
]
QE_CLEAN = ("Clean, brand-new surfaces: leather and fabric smooth and evenly coloured, no stains, smudges, "
            "fingerprints, blotches or mottled texture; crisp, sharp detail.")
# Plain "night" made a starry, blue-washed, neon look (tested Nov 2026). This reads like a real press photo.
QE_NIGHT = ("Make it an evening press photo shot at blue hour in a city, like a premium car maker's "
            "brochure: the cabin is gently lit by soft, warm interior lights, so the seats, dashboard and trims are "
            "clearly visible with their true colours and fine texture; a thin, warm white ambient light line "
            "glows along the dashboard and doors; the screens glow; through the windows, softly blurred city "
            "lights and buildings; elegant, calm and realistic, gentle contrast, clean reflections.")
NIGHT_WORDS = re.compile(r"\b(night|nighttime|night-time|evening|dusk|after dark|midnight)\b", re.I)
NIGHT_OWN = re.compile(r"\b(neon|stars?|starry|starlight|cyberpunk)\b", re.I)


def night_clause(words):
    """The calm press-photo night, when the words ask for night and don't describe their own look."""
    w = words or ""
    return QE_NIGHT if NIGHT_WORDS.search(w) and not NIGHT_OWN.search(w) else ""


def juice_pick(text, k):
    """Fill the juicy look for render k (variations get different ones)."""
    return (text.replace("{JUICE_EXT}", QE_JUICE_EXT[k % len(QE_JUICE_EXT)] + " Light, not colour: every part keeps its colour.")
                .replace("{JUICE_INT}", QE_JUICE_INT[k % len(QE_JUICE_INT)] + " Light, not colour: every part keeps its colour."))


def qwen_text(words, instant=False, scene="", locks=None, ref_head="", sketch=False, said=None, kind=""):
    """Short, direct instructions for Qwen Image Edit."""
    words = " ".join(clean_prompt(words).split())
    if words and words[-1] not in ".!?":
        words += "."
    locks = dict(locks or {})
    parts = []
    if instant:
        parts.append(QE_INSTANT)
        if scene:
            parts.append("In the picture: " + scene)
        if words:
            parts.append("The scene: " + words + " Change only what these words name; everything else follows the "
                         "picture exactly.")
        if not night_clause(words):
            if kind:
                ext = kind != "interior"
            else:
                ext = bool(re.search(r"\b(exterior|outside of|body|bodywork|wheels? arches?|bonnet|hood|seen from (the )?(front|side|rear))\b",
                                     scene or "", re.I)) and not re.search(r"\b(interior|cabin|dashboard|seats?)\b", scene or "", re.I)
            parts.append("{JUICE_EXT}" if ext else "{JUICE_INT}")      # one look per render (see juice_pick)
        parts.append(QE_KEEP_DRAWN)
    else:
        if ref_head:
            parts.append(ref_head)
        if sketch and not ref_head:
            parts.append("Turn this sketch into a photorealistic render.")
        night = night_clause(said if said is not None else words)
        if said and (night or locks.get("camera") is False):
            # the reader's rewrite keeps the camera and adds starry skies: use the person's words
            words = " ".join(clean_prompt(said).split())
            if words[-1:] not in ".!?":
                words += "."
        if words:
            parts.append(words)
        if night:
            parts.append(night)
            locks["light"] = False
        keep = []
        if locks.get("design", True):
            keep.append("the design and every part")
        if locks.get("materials") and not sketch:
            keep.append("the materials and colours")
        if locks.get("light"):
            keep.append("the lighting")
        if locks.get("camera", True):
            keep.append("the camera view")
        if keep and not ref_head:
            parts.append("Keep " + ", ".join(keep[:-1]) + (" and " if len(keep) > 1 else "") + keep[-1] + " exactly as they are.")
        elif not locks.get("camera", True) and not ref_head:
            pass
    parts.append(QE_CLEAN)
    return " ".join(parts)


def _have(key, settings):
    return bool(find(key, settings))


def tier(settings=None):
    """Which image model is used: 'best' (Klein 9B, needs a sign-in to get),
    'good' (Klein 4B, free download), or '' (not chosen yet). A choice whose
    files aren't all here falls back to the other one when that is."""
    def ready(t):
        return all(_have(f["key"], settings) for f in FILES
                   if f["part"] == "create" and in_tier(f, t) and not f.get("optional"))
    chosen = (settings.get("studio_tier") if settings else "") or ""
    if chosen in TIERS and ready(chosen):
        return chosen
    for t in ("best", "good"):
        if ready(t):
            return t
    return chosen if chosen in TIERS else ""


def _mac_status(settings):
    from . import macos
    md = models_dir(settings)
    parts = macos.parts(md)
    rows = [{"key": p["key"], "part": "create", "tier": "good", "label": p["label"], "about": p["about"],
             "gb": p["gb"], "ready": p["ready"], "file": "", "can_download": True, "page": "",
             "optional": False} for p in parts]
    ram = macos.ram_gb()
    gen = macos.can_generate(ram)
    ready = all(r["ready"] for r in rows) and gen
    return {"files": rows, "create_ready": ready, "juice_ready": False, "tier": "good", "chosen": "good",
            "tiers": {"best": {"label": "Best quality", "ready": False}, "good": {"label": "Good quality", "ready": ready}},
            "engine_installed": rows[0]["ready"], "loras": [], "select_ready": select_installed(settings),
            "helper_ready": helper_installed(settings), "reader_ready": reader_installed(settings),
            "home": home(settings), "comfy_models": "",
            "mac": {"chip": macos.chip(), "ram": ram, "can_generate": gen, "max_side": macos.max_side(ram), "work_side": macos.work_side(ram)}}


def status(settings=None):
    if sys.platform == "darwin":
        return _mac_status(settings)
    t = tier(settings)
    chosen = (settings.get("studio_tier") if settings else "") or ""
    chosen = chosen if chosen in TIERS else ""
    rows = []
    for f in FILES:
        p = find(f["key"], settings)
        rows.append({"key": f["key"], "part": f["part"], "tier": f.get("tier"), "label": f["label"],
                     "about": f["about"], "gb": round(os.path.getsize(p) / 1e9, 1) if p else f["gb"],
                     "ready": bool(p), "file": os.path.basename(p) if p else f["names"][0],
                     "can_download": bool(f["url"]), "page": f["page"], "optional": f.get("optional", False)})

    def ready(tt):
        return bool(tt) and all(r["ready"] for r in rows if r["part"] == "create" and in_tier(r, tt)
                                and not r["optional"])
    juice_ok = all(r["ready"] for r in rows if r["part"] == "juice")
    # A PC can run on Qwen Image Edit alone (no FLUX files): Create is ready then too.
    return {"files": rows, "create_ready": ready(t) or use_qwenedit(settings), "juice_ready": juice_ok, "tier": t, "chosen": chosen,
            "tiers": {k: {"label": v, "ready": ready(k)} for k, v in TIERS.items()},
            "engine_installed": engine_installed(), "loras": loras(settings),
            "select_ready": select_installed(settings), "helper_ready": helper_installed(settings),
            "reader_ready": reader_installed(settings), "reader_xl_ready": reader_xl_installed(settings),
            "home": home(settings), "comfy_models": guess_comfy_models(settings),
            "flux3": flux3_ready(settings), "qwenedit": qwenedit_ready(settings), "metaview": metaview_ready(settings),
            "angles": angles_ready(settings), "realism": qwenedit_ready(settings) and _have("qie_real", settings),
            "engine_choice": (settings.get("studio_engine") if settings else "") or "flux3"}


def reader_xl_installed(settings=None):
    from . import reader
    return reader.xl_installed(models_dir(settings))


def reader_installed(settings=None):
    from . import reader
    return reader.installed(models_dir(settings))


def helper_installed(settings=None):
    from . import helper
    return helper.installed(models_dir(settings))


def select_installed(settings=None):
    from . import picker
    return picker.installed(models_dir(settings))


def install_select(settings, on_progress, cancelled=lambda: False):
    from . import picker
    picker.install(models_dir(settings), download, on_progress, cancelled)


def needed(settings, t):
    """The files a tier needs that can be downloaded and aren't here."""
    return [f for f in FILES if f["part"] == "create" and in_tier(f, t)
            and f["url"] and not _have(f["key"], settings)]


# -- taking files from an existing ComfyUI ------------------------------------

def guess_comfy_models(settings=None):
    """A ComfyUI models folder on this PC, if one is easy to find."""
    chosen = (settings.get("comfy_models") if settings else "") or ""
    if chosen and os.path.isdir(chosen):
        return chosen
    user = os.path.expanduser("~")
    cands = [os.path.join(user, "Downloads", "ComfyUI-Easy-Install", "ComfyUI-Easy-Install", "ComfyUI", "models"),
             os.path.join(user, "Documents", "ComfyUI", "models"),
             os.path.join(user, "ComfyUI", "models")]
    for drive in ("C:\\", "D:\\", "E:\\"):
        cands += [os.path.join(drive, "ComfyUI_windows_portable", "ComfyUI", "models"),
                  os.path.join(drive, "ComfyUI", "models")]
    for c in cands:
        if os.path.isdir(os.path.join(c, "diffusion_models")) or os.path.isdir(os.path.join(c, "loras")):
            return c
    return ""


def import_from(folder, settings=None, on_progress=None):
    """Bring every known model file, and every LoRA, from a ComfyUI models
    folder (or any folder) into the Studio folder. Hard links where possible
    (instant, no extra space), copies otherwise. Returns the names taken."""
    if os.path.basename(folder.rstrip("\\/")).lower() != "models" and os.path.isdir(os.path.join(folder, "models")):
        folder = os.path.join(folder, "models")
    wanted = {}
    for f in FILES:
        for n in f["names"]:
            wanted[n.lower()] = f["folder"]
    found = []
    for root, dirs, files in os.walk(folder):
        if root[len(folder):].count(os.sep) >= 3:
            dirs[:] = []
        for n in files:
            low = n.lower()
            sub = wanted.get(low)
            if not sub and low.endswith(".safetensors") and os.path.basename(root).lower() == "loras":
                sub = "loras"
            if sub:
                found.append((os.path.join(root, n), sub, n))
    taken = []
    for i, (src, sub, n) in enumerate(found):
        dst_dir = os.path.join(models_dir(settings), sub)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, n)
        if os.path.isfile(dst) and os.path.getsize(dst) == os.path.getsize(src):
            continue
        if on_progress:
            on_progress("Taking %s" % n, i / max(1, len(found)))
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
        taken.append(n)
    if settings is not None and found and os.path.basename(folder.rstrip("\\/")).lower() == "models":
        settings.set("comfy_models", folder)
    return taken


# -- the image engine ---------------------------------------------------------

def _marker():
    return os.path.join(engine_dir(), "installed.txt")


def engine_installed():
    if sys.platform == "darwin":
        from . import macos
        return os.path.isfile(os.path.join(macos.env_dir(), "ready.txt"))
    return _comfy_installed()


def _comfy_installed():
    try:
        with open(_marker(), encoding="utf-8") as fh:
            return fh.read().strip() == PORTABLE_VERSION and os.path.isdir(portable_dir())
    except OSError:
        return False


def write_model_paths(settings=None):
    comfy = os.path.join(portable_dir(), "ComfyUI")
    if not os.path.isdir(comfy):
        return
    base = models_dir(settings).replace("\\", "/")
    lines = ["vistiq_studio:", "    base_path: %s" % json.dumps(base)]
    lines += ["    %s: %s" % (s, s) for s in SUBFOLDERS]
    with open(os.path.join(comfy, "extra_model_paths.yaml"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def _hf_pick(repo):
    """The LoRA file of a Hugging Face repo whose file name isn't fixed: the
    rank-128 one if there are several, else the only .safetensors."""
    r = requests.get("https://huggingface.co/api/models/" + repo, timeout=30, headers={"User-Agent": "VistiqStudio"})
    r.raise_for_status()
    names = [x["rfilename"] for x in r.json().get("siblings", []) if x["rfilename"].endswith(".safetensors")]
    if not names:
        raise RuntimeError("no model file found in " + repo)
    pick = next((n for n in names if "128" in n), None) or sorted(names, key=len)[0]
    return HF % (repo, pick)


def download(url, path, on_progress=None, label="", cancelled=lambda: False):
    """Resumable download to `path`."""
    if url.startswith("hf:"):
        url = _hf_pick(url[3:])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part = path + ".part"
    have = os.path.getsize(part) if os.path.isfile(part) else 0
    headers = {"User-Agent": "VistiqStudio"}
    if have:
        headers["Range"] = "bytes=%d-" % have
    with requests.get(url, headers=headers, stream=True, timeout=60, allow_redirects=True) as r:
        if r.status_code in (401, 403):
            raise RuntimeError("this file needs a Hugging Face login; download it from its page and "
                               "use “Take files from a folder”")
        if r.status_code == 416:
            have = 0
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0) + (have if r.status_code == 206 else 0)
        mode = "ab" if r.status_code == 206 else "wb"
        done = have if r.status_code == 206 else 0
        last = 0
        with open(part, mode) as fh:
            for chunk in r.iter_content(4 << 20):
                if cancelled():
                    raise RuntimeError("cancelled")
                fh.write(chunk)
                done += len(chunk)
                if on_progress and time.time() - last > 0.4:
                    last = time.time()
                    on_progress("%s: %.1f of %.1f GB" % (label, done / 1e9, total / 1e9) if total else label,
                                done / total if total else None)
    os.replace(part, path)


def install_engine(settings, on_progress, cancelled=lambda: False):
    """Download and unpack the image engine (about 2 GB, once)."""
    os.makedirs(engine_dir(), exist_ok=True)
    seven = os.path.join(engine_setup.home(), "7zr.exe")
    if not os.path.isfile(seven):
        seven = os.path.join(engine_dir(), "7zr.exe")
        if not os.path.isfile(seven):
            download(engine_setup.SEVEN_ZIP, seven, on_progress, "Unpacker", cancelled)
    archive = os.path.join(engine_dir(), "comfyui_%s.7z" % PORTABLE_VERSION)
    if not os.path.isfile(archive):
        download(PORTABLE, archive, on_progress, "Image engine", cancelled)
    on_progress("Unpacking the image engine", None)
    shutil.rmtree(portable_dir(), ignore_errors=True)
    subprocess.run([seven, "x", archive, "-o" + engine_dir(), "-y", "-bso0", "-bsp0"], check=True,
                   creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    try:
        os.remove(archive)
    except OSError:
        pass
    write_model_paths(settings)
    with open(_marker(), "w", encoding="utf-8") as fh:
        fh.write(PORTABLE_VERSION)


def _preview_bytes(raw):
    """The picture in one of the engine's binary preview messages, or None.
    Type 1: 4 bytes type, 4 bytes format, then the image. Type 4 adds metadata."""
    if len(raw) < 12:
        return None
    kind = int.from_bytes(raw[:4], "big")
    if kind == 1:
        return bytes(raw[8:])
    if kind == 4:
        n = int.from_bytes(raw[4:8], "big")
        return bytes(raw[8 + n:]) if 8 + n < len(raw) else None
    return None


class ImageEngine:
    """Vistiq Studio's second, private ComfyUI."""

    def __init__(self, settings, log_dir):
        self.settings = settings
        self.log_dir = log_dir
        self.url = None
        self.process = None
        self.state = "idle"
        self.message = ""
        self.client_id = uuid.uuid4().hex
        self._lock = threading.Lock()

    def alive(self):
        if not self.url:
            return False
        try:
            return _local.get(self.url + "/system_stats", timeout=2).ok
        except Exception:
            return False

    def start(self, say=lambda s, m="": None):
        with self._lock:
            if self.alive():
                return True
            if not engine_installed():
                self.state, self.message = "setup", "The image engine isn't set up yet."
                say(self.state, self.message)
                return False
            write_model_paths(self.settings)
            port = int(self.settings.get("studio_port") or 0)
            if port and (sys.platform != "win32" or _own_pid_on_port(port)):
                url = "http://127.0.0.1:%d" % port
                try:
                    if _local.get(url + "/system_stats", timeout=2).ok:
                        self.url = url
                        self.state, self.message = "ready", "Image engine ready"
                        say(self.state, self.message)
                        return True
                except Exception:
                    pass
            port = PORT
            while not _port_free(port) and port < PORT + 20:
                port += 1
            py = os.path.join(portable_dir(), "python_embeded", "python.exe")
            main = os.path.join(portable_dir(), "ComfyUI", "main.py")
            cmd = [py, "-s", main, "--windows-standalone-build", "--port", str(port),
                   "--disable-auto-launch"]
            os.makedirs(self.log_dir, exist_ok=True)
            logf = open(os.path.join(self.log_dir, "image-engine.log"), "ab")
            env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", PYTHONUNBUFFERED="1")
            self.state, self.message = "starting", "Starting the image engine"
            say(self.state, self.message)
            flags = (CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS) if sys.platform == "win32" else 0
            self.process = subprocess.Popen(cmd, cwd=portable_dir(), env=env, stdout=logf,
                                            stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                            creationflags=flags)
            url = "http://127.0.0.1:%d" % port
            deadline = time.time() + 300
            while time.time() < deadline:
                if self.process.poll() is not None:
                    self.state, self.message = "error", "The image engine stopped while starting (image-engine.log)."
                    say(self.state, self.message)
                    return False
                try:
                    if _local.get(url + "/system_stats", timeout=1).ok:
                        self.url = url
                        self.settings.set("studio_port", port)
                        self.state, self.message = "ready", "Image engine ready"
                        say(self.state, self.message)
                        return True
                except Exception:
                    pass
                time.sleep(0.7)
            self.state, self.message = "error", "The image engine took too long to start."
            say(self.state, self.message)
            return False

    def stop(self):
        port = int(self.settings.get("studio_port") or 0)
        if self.process and self.process.poll() is None:
            _kill_tree(self.process.pid)
        elif port:
            pid = _own_pid_on_port(port)
            if pid:
                _kill_tree(pid)
        self.process, self.url = None, None
        self.settings.set("studio_port", 0)
        self.state, self.message = "idle", "Image engine stopped"

    def free(self):
        """Let go of the graphics card, so the upscaler can have it."""
        if self.url:
            try:
                _local.post(self.url + "/free", json={"unload_models": True, "free_memory": True}, timeout=10)
            except Exception:
                pass

    def interrupt(self):
        if self.url:
            try:
                _local.post(self.url + "/queue", json={"clear": True}, timeout=5)
                _local.post(self.url + "/interrupt", timeout=5)
            except Exception:
                pass

    def upload(self, path):
        with open(path, "rb") as fh:
            r = _local.post(self.url + "/upload/image",
                            files={"image": ("vs_%s_%s" % (uuid.uuid4().hex[:6], os.path.basename(path)[-60:]), fh,
                                             "application/octet-stream")},
                            data={"overwrite": "true", "type": "input"}, timeout=120)
        r.raise_for_status()
        d = r.json()
        return (d["subfolder"] + "/" if d.get("subfolder") else "") + d["name"]

    def run(self, prompt, on_progress=None, cancelled=lambda: False, on_preview=None):
        """Queue a prompt, wait for it, return the bytes of its saved image.
        on_preview(jpeg_bytes) gets a small picture after each step ("watch it develop")."""
        import websocket
        ws = None
        try:
            ws = websocket.create_connection(self.url.replace("http", "ws", 1) + "/ws?clientId=" + self.client_id,
                                             timeout=2)
            ws.settimeout(0.5)
        except Exception:
            ws = None
        # latent2rgb: a quick colour preview after each step, no extra download (tested on ComfyUI 0.44).
        r = _local.post(self.url + "/prompt", json={"prompt": prompt, "client_id": self.client_id,
                                                    "extra_data": {"preview_method": "latent2rgb"}}, timeout=30)
        if not r.ok:
            raise RuntimeError(_error_text(r))
        pid = r.json()["prompt_id"]
        try:
            while True:
                if cancelled():
                    self.interrupt()
                    raise RuntimeError("Cancelled")
                msg = None
                if ws:
                    try:
                        raw = ws.recv()
                        msg = json.loads(raw) if isinstance(raw, str) else None
                        if on_preview and isinstance(raw, (bytes, bytearray)):
                            pic = _preview_bytes(raw)
                            if pic:
                                on_preview(pic)
                    except Exception:
                        msg = None
                else:
                    time.sleep(0.5)
                if msg:
                    t, d = msg.get("type"), msg.get("data") or {}
                    if t == "progress" and d.get("prompt_id") in (None, pid) and on_progress:
                        on_progress(d.get("value", 0) / max(1, d.get("max", 1)))
                    elif t == "execution_error" and d.get("prompt_id") == pid:
                        raise RuntimeError(_short(d.get("exception_message") or "The image engine failed."))
                    elif t == "executing" and d.get("prompt_id") == pid and d.get("node") is None:
                        break
                h = _local.get(self.url + "/history/" + pid, timeout=5).json().get(pid)
                if h and (h.get("status") or {}).get("completed"):
                    break
                if h and (h.get("status") or {}).get("status_str") == "error":
                    msgs = (h.get("status") or {}).get("messages") or []
                    err = next((m[1].get("exception_message") for m in msgs if m[0] == "execution_error"), None)
                    raise RuntimeError(_short(err or "The image engine failed."))
        finally:
            if ws:
                try:
                    ws.close()
                except Exception:
                    pass
        for _ in range(20):
            h = _local.get(self.url + "/history/" + pid, timeout=5).json().get(pid) or {}
            for out in (h.get("outputs") or {}).values():
                for im in out.get("images") or []:
                    if im.get("type") == "output":
                        v = _local.get(self.url + "/view", params={"filename": im["filename"],
                                                                     "subfolder": im.get("subfolder", ""),
                                                                     "type": "output"}, timeout=120)
                        v.raise_for_status()
                        return v.content
            time.sleep(0.5)
        raise RuntimeError("The image engine finished but no image came back.")


def _short(text):
    text = (text or "").strip().splitlines()[0] if text else ""
    if "out of memory" in text.lower() or "allocation on device" in text.lower():
        return "The graphics card ran out of memory. Try a smaller working size."
    return text[:300]


def _error_text(r):
    try:
        d = r.json()
        e = d.get("error") or {}
        details = []
        for nid, ne in (d.get("node_errors") or {}).items():
            for x in ne.get("errors", []):
                details.append("%s: %s" % (x.get("message"), x.get("details")))
        return "The image engine refused the job: %s %s" % (e.get("message", ""), "; ".join(details)[:400])
    except Exception:
        return "The image engine refused the job (%s)." % r.status_code


# -- the workflows -----------------------------------------------------------------

#: The text behind each preset button. The person's own prompt is added after.
PRESETS = {
    "sketch": ("Turn this sketch into a photorealistic automotive interior photograph. Keep every line, "
               "proportion, part and the camera view exactly as drawn. Realistic materials, natural daylight."),
    "lighting": ("Refine only the lighting of this automotive interior render: soft natural daylight through the "
                 "windows, balanced exposure, gentle fill in dark areas, soft realistic shadows, controlled "
                 "highlights. Do not change any design, geometry, material or colour."),
    "cmf": ("Change only the colours, materials and finishes of this automotive interior as described. Keep the "
            "design, geometry, proportions, parts, lighting and camera view exactly the same."),
    "style": ("Restyle this automotive interior image as described, keeping the design, geometry and camera "
              "view exactly the same."),
    "design": ("Change the design of this automotive interior as described, keeping the camera view, lighting "
               "and everything not mentioned the same."),
    "photo": ("Make this automotive interior render look like a real professional automotive photograph: "
              "realistic leather grain, stitching, perforation, satin metal, soft-touch plastics, accurate "
              "reflections and natural light. Do not change the design."),
}

REF_PRESETS = {
    "camera": ("Show the automotive interior from image 1 from exactly the same camera position, angle and "
               "field of view as image 2. The steering wheel, seats and console must line up with image 2. "
               "Keep the design, materials and colours of image 1."),
    "cmf": ("Image 1 is a line drawing of an automotive interior. Render it as a photorealistic photograph that "
            "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Dress every "
            "part in the colours, materials and finishes of the matching part in image 2: the seats like the "
            "seats of image 2, the dashboard like its dashboard, the door panels, console, trim and stitching "
            "the same. Natural daylight, realistic leather grain and reflections.\n"),
    "style": ("Image 1 is a line drawing of an automotive interior. Render it as a photorealistic photograph that "
              "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Give it "
              "the look of image 2: its colour palette, materials, lighting, mood and atmosphere.\n"),
}

# The wording used (any subject, not only car interiors).
GENERIC_PRESETS = {
    "sketch": ("Turn this sketch into a photorealistic photograph of the same subject. Keep every line, "
               "proportion, part and the camera view exactly as drawn. Realistic materials and natural light."),
    "lighting": ("Change only the lighting of this image. Keep every shape, material, colour and the camera "
                 "view exactly the same."),
    "cmf": ("Change only the colours, materials and finishes as described. Keep the design, shapes, "
            "proportions, lighting and camera view exactly the same."),
    "style": "Restyle this image as described, keeping the design and camera view exactly the same.",
    "design": "Change the design as described, keeping the camera view, lighting and everything else the same.",
    "photo": ("Make this image look like a real professional photograph: realistic materials, accurate "
              "reflections and natural light. Do not change the design."),
}

GENERIC_REF_PRESETS = {
    "camera": ("Show the subject of image 1 from exactly the same camera position, angle and "
               "field of view as image 2. Everything must line up with image 2. "
               "Keep the design, materials and colours of image 1."),
    # Short on purpose: the longer "dress every part…" wording copied the
    # wrong colours (brown seats from a white-seat reference) in engine tests.
    "cmf": ("Image 1 is a line drawing. Render it as a photorealistic photograph that "
            "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Give it "
            "the colours, materials and finishes of image 2: the same colour on the same kind of part.\n"),
    "style": ("Image 1 is a line drawing. Render it as a photorealistic photograph that "
              "follows every line of image 1 exactly: same parts, shapes, proportions and camera view. Give it "
              "the look of image 2: its colour palette, materials, lighting, mood and atmosphere.\n"),
}


def _klein_base(settings, keep):
    s = settings
    t = tier(s)
    best = t != "good"
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("klein" if best else "klein4b", s)),
                                                       "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(find("qwen" if best else "qwen4b", s)),
                                                       "type": "flux2"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("vae2", s))}},
    }
    model = ["1", 0]
    lora = find("consistency", s) if best else None      # the design lock is made for 9B only
    if lora and keep > 0:
        p["4"] = {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"model": model, "lora_name": os.path.basename(lora),
                             "strength_model": round(float(keep), 2)}}
        model = ["4", 0]
    return p, model


F3_STEPS = 16          # the distilled FLUX 3 Klein's own setting (BFL's templates)
# Results at 4 megapixels (about 2736x1536), references read at 2: cleaner
# lines and textures for about a minute a picture (tested on the user's PC).
F3_MP = 3.0      # 4 MP mottled leather and alcantara (Nov 2026 test); 3 MP renders clean nappa
F3_REF_MP = 2.0


def flux3_prompt(settings, images, text, megapixels=F3_MP, seed=None, steps=F3_STEPS, frame=0, ref_mp=F3_REF_MP):
    """FLUX 3 Image Klein: an edit of image 1, with any further images as
    references (colours, materials, style). Built like BFL's own template,
    minus the prompt upsampler. `frame` is the image whose size the result takes."""
    s = settings
    mp = float(megapixels)
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("flux3", s)),
                                                       "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": os.path.basename(find("qwen3vl", s)),
                                                       "type": "flux3", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("vae2", s))}},
        "20": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "21": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["2", 0]}},
        "24": {"class_type": "ReferenceMultiLatent",
               "inputs": {"positive": ["20", 0], "negative": ["21", 0], "vae": ["3", 0],
                          "resolution": "resize", "resolution.megapixels": float(ref_mp)}},
    }
    for i, im in enumerate(images):
        load, scale = str(10 + 2 * i), str(11 + 2 * i)
        p[load] = {"class_type": "LoadImage", "inputs": {"image": im}}
        p[scale] = {"class_type": "ImageScaleToTotalPixels",
                    "inputs": {"image": [load, 0], "upscale_method": "lanczos",
                               "megapixels": mp if i == frame else float(ref_mp), "resolution_steps": 16}}
        p["24"]["inputs"]["images.image%d" % i] = [scale, 0]
    p.update({
        "30": {"class_type": "GetImageSize", "inputs": {"image": [str(11 + 2 * frame), 0]}},
        "5": {"class_type": "ModelSamplingFlux",
              "inputs": {"model": ["1", 0], "max_shift": round(math.log(steps), 5), "base_shift": round(math.log(steps), 5),
                         "width": ["30", 0], "height": ["30", 1]}},
        "31": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": ["30", 0], "height": ["30", 1],
                                                                  "batch_size": 1}},
        "40": {"class_type": "KSampler",
               "inputs": {"model": ["5", 0], "positive": ["24", 0], "negative": ["24", 1], "latent_image": ["31", 0],
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)),
                          "steps": int(steps), "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
                          "denoise": 1.0}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudio"}},
    })
    return p


def create_prompt(settings, image, text, keep=0.8, megapixels=2.0, seed=None, steps=STEPS, refs=None, frame=0):
    """Klein edit of one image (render or sketch). `refs`: reference images
    (image 2, 3…), `frame`: the image whose size and framing the result takes."""
    refs = list(refs or [])
    if flux3_ready(settings):
        if refs:
            return flux3_prompt(settings, [image] + refs, text, seed=seed, frame=frame)
        # "Follow my sketch" at the top: the sketch goes in twice, which holds
        # the design tighter (tested: the rear and front stayed as drawn).
        return flux3_prompt(settings, [image, image] if keep >= 0.95 else [image], text, seed=seed)
    p, model = _create_klein(settings, image, text, keep, megapixels, seed, steps)
    cond = ["21", 0]
    for i, ref in enumerate(refs):
        load, scale, enc, node = str(60 + 4 * i), str(61 + 4 * i), str(62 + 4 * i), str(63 + 4 * i)
        p[load] = {"class_type": "LoadImage", "inputs": {"image": ref}}
        p[scale] = {"class_type": "ImageScaleToTotalPixels",
                    "inputs": {"image": [load, 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                               "resolution_steps": 16}}
        p[enc] = {"class_type": "VAEEncode", "inputs": {"pixels": [scale, 0], "vae": ["3", 0]}}
        p[node] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": cond, "latent": [enc, 0]}}
        cond = [node, 0]
        if frame == i + 1:
            p["30"]["inputs"]["image"] = [scale, 0]       # the result takes this reference's framing
    if refs:
        p["22"]["inputs"]["conditioning"] = cond
    return p


def _create_klein(settings, image, text, keep, megapixels, seed, steps):
    p, model = _klein_base(settings, keep)
    p.update({
        "10": {"class_type": "LoadImage", "inputs": {"image": image}},
        "11": {"class_type": "ImageScaleToTotalPixels",
               "inputs": {"image": ["10", 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                          "resolution_steps": 16}},
        "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}},
        "20": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "21": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["20", 0], "latent": ["12", 0]}},
        "22": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["21", 0], "guidance": 3.5}},
        "23": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["20", 0]}},
        "30": {"class_type": "GetImageSize", "inputs": {"image": ["11", 0]}},
        "31": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": ["30", 0], "height": ["30", 1],
                                                                  "batch_size": 1}},
        "40": {"class_type": "KSampler",
               "inputs": {"model": model, "positive": ["22", 0], "negative": ["23", 0], "latent_image": ["31", 0],
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)),
                          "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudio"}},
    })
    return p, model


def reference_prompt(settings, design, reference, text, mode="camera", keep=0.8, megapixels=2.0,
                     seed=None, steps=STEPS):
    """Klein with two reference images: image 1 your design, image 2 the reference."""
    if flux3_ready(settings):
        # FLUX 3 reads both pictures as they are (no line extraction needed).
        return flux3_prompt(settings, [design, reference], text, seed=seed,
                            frame=1 if mode == "camera" else 0)
    # For CMF and style the design goes in as its lines only (edges of the
    # picture): the model then has to colour the lines from the reference,
    # instead of copying the design's own colours back, which the design
    # lock (trained to keep image 1) would otherwise do. The lock is off.
    lines = mode in ("cmf", "style")
    # The design lock is trained to keep image 1 as it is, its view too: off for a camera change.
    p = create_prompt(settings, design, text, 0 if lines or mode == "camera" else keep, megapixels, seed, steps)
    if lines:
        p["16"] = {"class_type": "Canny", "inputs": {"image": ["11", 0], "low_threshold": 0.15,
                                                       "high_threshold": 0.35}}
        p["17"] = {"class_type": "ImageInvert", "inputs": {"image": ["16", 0]}}
        p["12"]["inputs"]["pixels"] = ["17", 0]
    p.update({
        "13": {"class_type": "LoadImage", "inputs": {"image": reference}},
        "14": {"class_type": "ImageScaleToTotalPixels",
               "inputs": {"image": ["13", 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                          "resolution_steps": 16}},
        "15": {"class_type": "VAEEncode", "inputs": {"pixels": ["14", 0], "vae": ["3", 0]}},
        "24": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["21", 0], "latent": ["15", 0]}},
    })
    p["22"]["inputs"]["conditioning"] = ["24", 0]
    if mode == "camera":
        # The result takes the reference's frame.
        p["30"]["inputs"]["image"] = ["14", 0]
    return p


def juice_prompt(settings, image, text, lora, strength=0.8, denoise=0.35, megapixels=2.0, seed=None, steps=20):
    """A light Flux.1 pass with a style LoRA: adds atmosphere and material
    richness. `denoise` is how much it may repaint; kept low so the design
    stays."""
    s = settings
    p = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": os.path.basename(find("flux1", s)),
                                                       "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": os.path.basename(find("t5", s)),
                                                           "clip_name2": os.path.basename(find("clipl", s)),
                                                           "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": os.path.basename(find("vae1", s))}},
        "4": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": lora,
                                                                "strength_model": round(float(strength), 2)}},
        "10": {"class_type": "LoadImage", "inputs": {"image": image}},
        "11": {"class_type": "ImageScaleToTotalPixels",
               "inputs": {"image": ["10", 0], "upscale_method": "lanczos", "megapixels": float(megapixels),
                          "resolution_steps": 16}},
        "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}},
        "20": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "21": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["20", 0], "guidance": 3.5}},
        "22": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["20", 0]}},
        "40": {"class_type": "KSampler",
               "inputs": {"model": ["4", 0], "positive": ["21", 0], "negative": ["22", 0], "latent_image": ["12", 0],
                          "seed": int(seed if seed is not None else random.randint(1, 2**48)),
                          "steps": int(steps),
                          "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": float(denoise)}},
        "41": {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["3", 0]}},
        "42": {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "VistiqStudioJuice"}},
    }
    return p


# Default light, so nobody has to describe it every time. The prompt decides
# which: an interior word gets the on-location interior press look, an
# exterior word the studio press look, anything else a neutral press look.
# Tuned on the engine against Pranay's benchmark pictures. Left out when the
# prompt sets its own time of day or mood ("ambient lighting" alone doesn't
# count: that's the LED strips).
# Day and night interiors, modelled on Pranay's theme renders (same cabin by
# day and by night): soft skylight that shapes every volume by day; by night
# the car's own lights lead and the rest falls into soft shadow.
LIGHT_INT = ("Photographed like a car maker's interior press photo on a bright overcast day: soft, even skylight "
             "floods in through the windows and glass roof from above and in front; the windows glow bright and "
             "softly white; every volume is modelled by smooth, gradual gradients, tops of surfaces lighter, "
             "undersides and recesses gently darker, with soft contact shadows where parts meet and no hard "
             "shadows; leather and satin surfaces show broad, soft highlights along their curves; ambient "
             "lighting strips are visible but subtle in daylight; colours clean and true to the materials. "
             "Airy, calm, high-key, ultra-clean.")
LIGHT_NIGHT = ("Photographed like a car maker's interior press photo at night: the cabin is lit mainly by its "
               "own lights. Glowing ambient light strips along the dashboard and doors cast soft coloured light "
               "onto the surfaces next to them, warm white footwell lights pool on the floor mats and the lower "
               "console, the screens glow; everything else falls off smoothly into deep, soft shadow; the "
               "windows and glass roof are dark, showing a night sky and distant city lights; light surfaces "
               "pick up gentle reflections of the ambient colour. Low-key, no harsh contrast, true material "
               "colours. Calm, premium, ultra-clean.")
# Interiors burnt with "rich contrast" in the closing line; they get a cleaner one.
CLEAN = "A professional photograph: crisp sharp focus, true-to-life colours, detailed real materials and textures."
LIGHT_EXT = ("Photographed like a car maker's press photo in a large minimalist photo studio: smooth light-grey "
             "back wall, dark grey concrete floor with a faint soft reflection under the car, one huge soft "
             "overhead light drawing a long smooth highlight along the roof and shoulder, the lower body "
             "falling gently into shadow, soft contact shadows under the tyres. Satin true-to-life paint, "
             "crisp panel gaps, real tyres; wheels exactly as drawn. Calm, clean, premium.")
LIGHT = ("Lit like a premium brand press photo: soft, wrapping daylight; exposure balanced so windows "
         "and bright areas keep their detail; glossy highlights rolling along chrome, glass and lacquered "
         "surfaces; soft sheen on leather and fabric; deeper shadows and a gentle vignette toward the edges "
         "that draw the eye to the centre. Calm, luxurious mood.")
OWN_LIGHT = ("night", "dusk", "dawn", "sunset", "sunrise", "evening", "golden hour", "blue hour",
             "neon", "moody", "overcast", "sunny", "studio light", "spotlight", "candle")
INTERIOR = ("interior", "cabin", "cockpit", "dashboard", "dash ", "seat", "steering", "console",
            "door panel", "headliner", "instrument panel")
EXTERIOR = ("exterior", "side view", "front view", "rear view", "3/4", "three-quarter", "bodywork",
            "body side", "wheels", "rims", "bumper", "headlight", "taillight", "supercar", "sports car",
            "coupe", "sedan", "suv", "hatchback", "roadster")


NIGHT = ("night", "evening", "after dark", "dark mode", "night mode")


# Words that mean the prompt already says how the light should be.
_OWN_LIGHT_RE = re.compile(r"\b(sun ?light|sunlit|afternoon|morning|daylight|lighting:|directional light|"
                           r"cinematic light|rim light|shadows?)\b", re.I)


def clean_prompt(text):
    """Prompts pasted from chat tools come with **bold**, # headings and bullets;
    the image model reads those as noise. Plain sentences only."""
    t = re.sub(r"\*\*|__|`", "", text or "")
    t = re.sub(r"(?m)^\s{0,3}(#{1,6}\s*|[-*•]\s+|\d+[.)]\s+)", "", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def light_for(text):
    low = " " + (text or "").lower() + " "
    if _OWN_LIGHT_RE.search(low) and not any(w in low for w in NIGHT):
        return ""                          # the prompt sets its own light: ours would fight it
    if any(w in low for w in NIGHT) and any(w in low for w in INTERIOR):
        return LIGHT_NIGHT                 # an interior at night: the car's own lights lead
    if any(w in low for w in OWN_LIGHT):
        return ""
    if any(w in low for w in INTERIOR):
        return LIGHT_INT
    if any(w in low for w in EXTERIOR):
        return LIGHT_EXT
    return LIGHT


F3_KEEP = ("Keep every line, part, opening, proportion and the camera view exactly as in the first image; "
           "change nothing in the design, only make it real.")
# Long prompts made FLUX 3 invent trims and light strips the sketch doesn't have
# (Nov 2026): the design comes first, and nothing gets added.
F3_HOLD = (F3_KEEP + " Do not add any parts, trims, light strips, panels or details that are not drawn "
           "in the first image.")
# Worded for FLUX 3, which reads "the first image", "the second image". Tested
# on the user's PC (Nov 2026): colours and materials, or the whole look, come
# over from the reference while the design stays.
F3_REF_PRESETS = {
    "camera": ("Change the camera. Show the design of the first image as seen from the camera of the second "
               "image: the same camera position, height, tilt, angle, lens and framing as the second image. If the "
               "second image looks down from above, look down from above; if it is closer or wider, be closer or "
               "wider. The composition must match the second image, not the first. Keep the design, materials and "
               "colours of the first image; take nothing but the viewpoint from the second image."),
    "cmf": ("Render the design in the first image as a photorealistic photograph. " + F3_KEEP + " Apply the "
            "colours, materials and finishes of the second image: the same colours and materials on the same "
            "kinds of parts, the same trim materials and the same ambient light colour. Do not copy the shapes "
            "or the camera view of the second image."),
    "style": ("Render the design in the first image as a photorealistic photograph. " + F3_KEEP + " Give it "
              "the lighting, colours, materials, mood and photographic look of the second image. Do not copy "
              "the shapes or the camera view of the second image."),
}


F3_FREE_CAM = ("Keep every part, shape, line, proportion, material and colour of the design in the first image; "
               "change nothing in the design. The camera is free: show it from the view the instructions ask for.")
# For a camera change: hold the design, but never the first image's viewpoint
# (the usual "keep the camera view" wording made the result copy image 1's view).
F3_CAMERA_KEEP = ("Keep every part, shape, proportion, material and colour of the first image's design. "
                  "Only the viewpoint changes, to the second image's camera.")


# Create with reference images (Nov 2026): image 1 is the design, each
# reference gives exactly one thing. Everything else stays the design's own.
REF_USES = ("camera", "materials", "style", "light", "describe")
REF_LOOSE_DESIGN = "Use image 1 as the design to start from; its shapes may be refined."
# Worded as tested on the user's PC (Nov 2026): FLUX 3 copies colours and
# materials from a reference picture, but only follows a camera, a light or a
# style when it is put into words ({desc}, read by the picture reader or typed).
REF_CLAUSE = {
    "camera": ("Show this exact design from a completely different camera: {desc} Only the camera moves."),
    "camera_nodesc": ("Show the design from exactly the camera position, height, tilt, angle, lens and framing of "
                      "{n}; the composition must match {n}, not image 1."),
    "materials": ("Recolour image 1 with the colours and materials of {n}. Every surface takes the colour and "
                  "material of the matching surface in {n} (seats, dashboard, door panels, console and trims "
                  "alike): the same leather or fabric, colour, finish and stitching. The colour change must be "
                  "clearly visible.{desc}{sk}"),
    "style": "Redraw image 1 in this rendering style: {desc}",
    "style_nodesc": ("Redraw image 1 in exactly the rendering style of {n}: the same medium, line work, shading "
                     "technique, colour palette and finish."),
    "light": "Change the lighting of image 1: {desc}",
    "light_nodesc": ("Light image 1 exactly like {n}: the same time of day, sky, light direction, colour "
                     "temperature, brightness, contrast, ambient light strips and mood. The view through the "
                     "windows changes to match."),
    "describe": "{n} is a reference: use it only as the instructions below say.",
}
# Qwen Image Edit with references (tested Nov 2026): a reference sent as a picture pulls its
# whole design in (dashboard, console), so what the reader put into words goes in as words.
QE_REF = {
    "camera": "Show this same design from a different camera: {desc}",
    "materials": "Change the colours and materials, keeping every shape and part: {desc}",
    "light": "Change the lighting: {desc}",
    "style": "Render it in this style: {desc}",
}
QE_REF_PIC = {
    "camera": "Show the design of Picture 1 from the camera position, angle and framing of {n}.",
    "materials": "Apply the colours and materials of {n} to the matching parts of Picture 1.",
    "light": "Light Picture 1 exactly like {n}.",
    "style": "Render Picture 1 in the rendering style of {n}.",
    "describe": "{n} is a reference: use it only as the words below say.",
}


# A style reference goes in as the picture (tested Nov 2026: put into words, "a stylized
# render" came back photoreal); the sketch's own lines stay crisp under the new look.
QE_STYLE_PIC = ("Paint over Picture 1 the way a car designer renders a sketch: keep every line and its exact "
                "position, the same crisp, sharp edges, corners, creases and proportions; do not round, soften "
                "or reshape any form. Give it the look and feel of {n}, as close to it as possible: its rendering "
                "technique, colour palette, gradients, light, mood and flow. Take none of {n}'s shapes or parts.")
QE_NOT_PHOTO = "Not photorealistic, not a 3D render; a plain background with no text or patterns."
PHOTO_LOOK = re.compile(r"\b(photo|photograph|photographic|photoreal\w*|realistic render|cgi)\b", re.I)


def qwen_refs(text, refs, locks=None, sketch=False):
    """Qwen's words for Create with references. Returns (text, sent)."""
    locks = dict(locks or {})
    refs = [dict(r, use=r.get("use") if r.get("use") in REF_USES else "describe",
                 desc=" ".join((r.get("desc") or "").split())) for r in refs]
    uses = [r["use"] for r in refs]
    parts, sent, numbers = [], [], {}
    styled = "style" in uses
    if sketch and not styled:
        parts.append("Turn this sketch into a photorealistic render." +
                     (" The colours in the sketch are only placeholders." if "materials" in uses else ""))
    illustrated = False
    for i, r in enumerate(refs):
        u, d = r["use"], r["desc"]
        if u == "style":
            sent.append(i)
            numbers[i + 1] = len(sent) + 1
            parts.append(QE_STYLE_PIC.format(n="Picture %d" % (len(sent) + 1)))
            illustrated = illustrated or not PHOTO_LOOK.search(d or "")
        elif d and u in QE_REF:
            parts.append(QE_REF[u].format(desc=d.rstrip(".") + "."))
        else:
            sent.append(i)
            numbers[i + 1] = len(sent) + 1
            parts.append(QE_REF_PIC[u].format(n="Picture %d" % (len(sent) + 1)))
    words = map_refs(clean_prompt(text), numbers)
    words = re.sub(r"\bimage (\d)\b", r"Picture \1", words)
    if words:
        parts.append(words if words[-1] in ".!?" else words + ".")
    keep = ["the design, every shape and part"]
    if not sketch and "materials" not in uses and locks.get("materials"):
        keep.append("the materials and colours")
    if "light" not in uses and "style" not in uses and locks.get("light"):
        keep.append("the lighting")
    if "camera" not in uses and locks.get("camera", True):
        keep.append("the camera view")
    parts.append("Keep " + ", ".join(keep[:-1]) + (" and " if len(keep) > 1 else "") + keep[-1] +
                 (" of Picture 1" if sent else "") + " exactly as they are." +
                 (" Take no shapes or parts from the other pictures." if sent else ""))
    if illustrated:
        parts.append(QE_NOT_PHOTO)          # a drawn style stays drawn: no "clean leather" realism
    else:
        parts.append(QE_CLEAN)
    return " ".join(parts), sent


_REF_RE = re.compile(r"\b(?:ref(?:erence)?)\s*#?\s*([1-3])\b", re.I)


def map_refs(text, numbers=None):
    """"ref 1" in the prompt becomes the picture's number for the model
    (image 1 is the design; a camera reference read into words is no picture)."""
    numbers = numbers or {1: 2, 2: 3, 3: 4}
    def sub(m):
        k = int(m.group(1))
        return ("image %d" % numbers[k]) if numbers.get(k) else "the reference described above"
    return _REF_RE.sub(sub, text or "")


def ref_plan(text, refs, locks=None, sketch=False, keep=0.8):
    """The prompt for Create with reference images, and which references go
    in as pictures. `refs`: [{"use": …, "desc": …}]. Returns (text, sent),
    `sent` the indices of the references sent as pictures 2, 3…"""
    locks = dict(locks or {})
    refs = [dict(r, use=r.get("use") if r.get("use") in REF_USES else "describe",
                 desc=" ".join((r.get("desc") or "").split())) for r in refs]
    sent, numbers = [], {}
    for i, r in enumerate(refs):
        if r["use"] in ("camera", "light", "style") and r["desc"]:
            continue                      # in words only (tested: the picture pulls its design in too)
        sent.append(i)
        numbers[i + 1] = len(sent) + 1
    uses = [r["use"] for r in refs]
    has = lambda u: u in uses
    out = []
    if sketch and not has("style"):
        out.append("Render the sketch in image 1 as a photorealistic photograph.")
    for i, r in enumerate(refs):
        u, d, n = r["use"], r["desc"], "image %d" % numbers.get(i + 1, 0)
        if u == "materials":
            out.append(REF_CLAUSE["materials"].format(n=n, desc=(" In %s: %s" % (n, d)) if d else "",
                                                      sk=" The colours in the sketch are only placeholders." if sketch else ""))
        elif u in ("camera", "style", "light"):
            out.append(REF_CLAUSE[u if d else u + "_nodesc"].format(n=n, desc=d))
        else:
            out.append(REF_CLAUSE["describe"].format(n=n))
    # One rule for what stays: everything a reference doesn't change.
    keep_parts = ["every shape, part, line and proportion"] if keep >= 0.3 else []
    if not sketch and not has("materials") and locks.get("materials"):
        keep_parts.append("every material and colour")
    if not has("light") and not has("style") and locks.get("light"):
        keep_parts.append("the lighting")
    if not has("camera") and locks.get("camera", True):
        keep_parts.append("the camera")
    if keep_parts:
        out.append("Keep " + ", ".join(keep_parts[:-1]) + (" and " if len(keep_parts) > 1 else "") + keep_parts[-1] +
                   " of image 1 exactly; take no shapes or parts from the reference images.")
    else:
        out.append(REF_LOOSE_DESIGN + " Take no shapes or parts from the reference images.")
    if sketch and not has("materials") and COLOUR_WORDS.search(text or ""):
        out.append(SKETCH_RECOLOUR)
    body = [" ".join(out)]
    text = map_refs(clean_prompt(text), numbers)
    if text:
        body.append(text)
    light = ""
    if not has("light") and not has("style") and not locks.get("light"):
        light = light_for(text)
        if light:
            body.append(light)
    inside = _interior(text)
    if inside and not has("materials") and not has("style"):
        body.append(FINISH_MAT)
    if not has("style"):
        body.append(CLEAN if inside or light in (LIGHT_INT, LIGHT_NIGHT) else CRISP)
    return "\n\n".join(body), sent


def ref_text(text, uses, locks=None, sketch=False, keep=0.8):
    return ref_plan(text, [{"use": u} for u in uses], locks, sketch, keep)[0]


# Sketch renders came out with stained, mottled leather and crushed-velvet
# alcantara (Nov 2026, Pranay's yellow/burgundy cabin): the model reads "nappa"
# and "alcantara" as worn, patterned materials unless told they are new.
FINISH_MAT = ("All materials are brand new and showroom-perfect, like a car maker's press photo: leather is "
              "smooth, fine-grain nappa (not suede or nubuck), evenly coloured, with a soft satin sheen and fine, "
              "even stitching; alcantara has a fine, short, uniform matte nap, like microsuede, never shiny or "
              "crushed velvet; no stains, "
              "blotches, mottling, patches, creases, wear or dust anywhere.")
# When the prompt names its own time of day, the light still has to look
# like a press photo, not a flat, hazy snapshot.
SOFT_LIGHT = ("Soft, diffused light with smooth, gradual gradients on every volume and gentle contact "
              "shadows; windows bright but not blown out; balanced, natural exposure.")


LOCK_TEXT = {
    "design": "Keep the design exactly: every shape, part, line and proportion stays as it is.",
    "materials": "Keep every material, colour and finish exactly as it is.",
    "light": "Keep the lighting exactly as it is: the same direction, softness, brightness and time of day.",
    "camera": "Keep the camera exactly: the same viewpoint, angle, lens and framing.",
}
SKETCH_LOCK_TEXT = {
    "materials": "Use the colours and materials exactly as drawn in the sketch.",
    "light": "Keep the light and shading as drawn in the sketch.",
}


COLOUR_WORDS = re.compile(r"\b(white|black|grey|gray|beige|cream|ivory|tan|brown|red|burgund\w*|blue|green|yellow|orange|purple|pink|silver|chrome|leather|nappa|alcantara|suede|fabric|wood|cmf|colou?rs?|materials?)\b", re.I)
# A coloured sketch: the model copies its colours unless told they are only placeholders.
SKETCH_RECOLOUR = ("The colours and fills in the sketch are only placeholders, not the design: ignore them and use "
                   "only the colours and materials described here, on every part. Where a colour is described for "
                   "everything (e.g. all white), every trim, panel and seat takes it, apart from glass, screens, "
                   "rubber and metal details.")


def with_locks(text, locks, sketch):
    """Rules for what must not change (the Keep toggles), put first: the model
    weighs the start of the prompt most. Light locked also drops our own light."""
    locks = locks or {}
    if locks.get("light"):
        for part in (LIGHT_INT, LIGHT_NIGHT, LIGHT_EXT, LIGHT, SOFT_LIGHT):
            text = text.replace("\n\n" + part, "")
    if sketch:
        rules = [SKETCH_LOCK_TEXT[k] for k in ("materials", "light") if locks.get(k)]
        if not locks.get("materials") and COLOUR_WORDS.search(text.split("\n\n", 1)[-1] or ""):
            rules.append(SKETCH_RECOLOUR)
    else:
        rules = [LOCK_TEXT[k] for k in ("design", "materials", "light", "camera") if locks.get(k)]
        free = [k for k in ("design", "materials", "light", "camera") if not locks.get(k)]
        if free:
            rules.append("Change only what the instructions below describe.")
    return ("\n".join(rules) + "\n\n" + text) if rules else text


def _interior(text):
    low = " " + (text or "").lower() + " "
    return any(w in low for w in INTERIOR)


# Instant render (Nov 2026): Create with no words and no references makes a
# studio-quality CGI picture that follows the sketch or render as it is.
INSTANT = ("Turn this design sketch into a finished, photorealistic CGI render, like a car maker's "
           "design-studio visualization. Keep the design, its proportions and the camera view, but read the "
           "sketch as a designer would: every drawn shape becomes the real part it stands for, built to production "
           "quality with real materials, clean surfaces, panel gaps, stitching and glass, and parts the sketch only "
           "hints at are completed as they would be in the finished car. Keep the drawn colour scheme. No sketch "
           "lines, pencil marks or paper texture remain. Light colours stay light and clean; surfaces are brand "
           "new, never worn, dusty or blotchy. Clean studio lighting with soft reflections and gentle shadows.")


def instant_text(text="", scene=""):
    text = clean_prompt(text)
    out = [INSTANT]
    if scene:
        out.append("In the picture: " + scene)
    if text:
        out.append("The scene: " + text)
    light = light_for(text + " " + scene)
    out.append(light or SOFT_LIGHT)
    out.append(FINISH_MAT)
    out.append(CRISP)
    return "\n\n".join(out)


def build_text(preset, text, presets=PRESETS, f3=False):
    # Any subject: interiors, exteriors, boats, furniture, lamps… The button
    # only says what kind of change; the prompt says what it is.
    text = clean_prompt(text)
    if f3 and presets is REF_PRESETS:
        out = F3_REF_PRESETS.get(preset, F3_REF_PRESETS["camera"])
        if text:
            out += "\n\n" + text
        light = light_for(text) if preset == "camera" else ""   # a reference brings its own light
        if light:
            out += "\n\n" + light
        return out + "\n\n" + (CLEAN if light in (LIGHT_INT, LIGHT_NIGHT, "") else CRISP)
    presets = GENERIC_REF_PRESETS if presets is REF_PRESETS else GENERIC_PRESETS
    base = presets.get(preset, "")
    text = (text or "").strip()
    out = (base + "\n\n" + text) if base and text else (base or text or "Photorealistic photograph.")
    # A style reference brings its own light; ours would fight it.
    light = "" if (presets is GENERIC_REF_PRESETS and preset == "style") else light_for(text)
    inside = _interior(text) or preset in ("sketch", "cmf", "photo") and _interior(base)
    if light:
        out += "\n\n" + light
    elif inside and not (presets is GENERIC_REF_PRESETS and preset == "style"):
        out += "\n\n" + SOFT_LIGHT          # the prompt's own time of day, press-photo quality
    if inside and preset != "lighting":
        out += "\n\n" + FINISH_MAT
    return out + "\n\n" + (CLEAN if inside or light in (LIGHT_INT, LIGHT_NIGHT) else CRISP)

