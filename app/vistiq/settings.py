"""The person's choices, kept between runs in %APPDATA%\\Vistiq\\settings.json."""
import json
import os
import threading

from . import workflow as wf


def data_dir():
    import sys
    if sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), ".config")
    from . import flavor
    path = os.path.join(base, flavor.FOLDER)
    os.makedirs(path, exist_ok=True)
    return path


def default_output():
    from . import flavor
    if flavor.STUDIO:
        from . import studio
        return studio.upscale_dir()
    pictures = os.path.join(os.path.expanduser("~"), "Pictures")
    return os.path.join(pictures if os.path.isdir(pictures) else os.path.expanduser("~"),
                        "Vistiq")


DEFAULTS = {
    "scale": "2",                 # "2" | "4" | "max"
    "model": "auto",
    "format": "PNG",              # PNG | JPG | WEBP
    "two_pass": True,             # 3x and more as two steps
    "out_dir": None,
    "max_res": wf.DEFAULT_MAX_RES,
    "comfy_path": "",
    "comfy_url": "",
    "keep_engine": True,          # leave the engine running when the app closes
    "engine_port": 0,             # where Vistiq's own engine last listened
    "speeds": {},
    "phase_speeds": {},           # seconds per phase (per MP), by model
    "auto_migrated": False,
    "swap_bias": {},              # extra blocks to swap, learned from crashes
    "part_mp": {},                # largest part (MP) that fit, learned from memory errors
    "engine_flags": 0,            # which OWN_FLAGS the running engine has
    # Studio only
    "studio_home": "",            # the Vistiq Studio folder (Outputs, Models)
    "studio_port": 0,             # where the image engine last listened
    "comfy_models": "",           # a ComfyUI models folder to take files from
    "studio_tier": "",            # "best" (Klein 9B) or "good" (Klein 4B)
    "mac_engine": "",             # Mac render model when both are here: "mage" or "klein" ("" = the setup's)
    "smart_read": True,           # the picture reader works out what the words ask for (when it's installed)
    "mac_tier": "",               # Mac setup: "light", "studio" or "pro" ("" = the suggested one)
    "studio_times": {},           # learned creation times, for the timer
    "studio_seq": 0,              # the last run number (results are named 0001_, 0002_…)
    "studio_engine": "flux3",     # which image model makes the pictures: flux3 or qwenedit
    "studio_finish": True,        # the finishing grade (colour, contrast, sharpness) on results
    "nb_key": "",                 # Google AI Studio key for Nano Banana (own key, stays on this computer)
    "nb_on": True,                # online pictures with that key allowed
    "nb_limit": 10.0,             # stop online pictures at this many USD a month (Vistiq counts, Google bills)
    "nb_usage": {},               # this month's online pictures: {month, n, usd, credits}
    "nb_ok": False,               # the key worked when it was added
    "onboarded": False,           # the welcome page was done or skipped
    "keep_design": 0.8,
    "variations": 2,
    "juice": 0.0,
}


class Settings:
    def __init__(self):
        self.path = os.path.join(data_dir(), "settings.json")
        self._lock = threading.Lock()
        self._data = dict(DEFAULTS)
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                self._data.update(json.load(fh))
        except Exception:
            pass
        if not self._data.get("out_dir"):
            self._data["out_dir"] = default_output()
        else:
            # Studio: upscales used to land loose in Outputs; now they have their own folder.
            try:
                from . import flavor
                if flavor.STUDIO:
                    from . import studio
                    if os.path.normcase(os.path.normpath(self._data["out_dir"])) == os.path.normcase(os.path.normpath(studio.outputs_dir())):
                        self._data["out_dir"] = studio.upscale_dir()
            except Exception:
                pass

    def get(self, key, default=None):
        return self._data.get(key, default)

    def max_side(self):
        try:
            v = int(self._data.get("max_res") or wf.LIMIT)
        except (TypeError, ValueError):
            v = wf.LIMIT
        v = v if v in wf.SIZES else wf.LIMIT
        import sys
        if sys.platform == "darwin":
            from . import macos
            v = min(v, macos.max_side())      # what this Mac can do in sensible time
        return v

    def set(self, key, value):
        if key not in DEFAULTS:
            raise KeyError(key)
        with self._lock:
            self._data[key] = value
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, indent=2)
            os.replace(tmp, self.path)

    def all(self):
        return dict(self._data)
