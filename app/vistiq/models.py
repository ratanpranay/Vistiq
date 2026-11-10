"""Which model to use, downloading and removing models, and tuning memory.

Auto picks the best model that fits fully in this PC's graphics memory and,
for whichever model runs, works out how much of it has to be swapped out to
system memory. Swapping is what lets a big model run on a smaller card, and
it's also what makes it slow, so Vistiq swaps only as much as it must.
"""
import math
import os
import threading

from . import engine_setup as es

AUTO = "auto"


def _vram():
    """Total graphics memory in GB, asked once per run of the app."""
    if _vram.cache is None:
        _vram.cache = es.gpu()[1] or 0
    return _vram.cache


_vram.cache = None


def installed_files():
    return set(es.local_models())


def installed_keys():
    files = installed_files()
    return [m["key"] for m in es.MODELS if m["file"] in files]


def auto_target():
    """The model Auto wants on this PC (installed or not)."""
    return es.suggested_model(_vram())


def auto_pick():
    """(model file to use now, target key, is the target installed)."""
    target = es.model_by_key(auto_target())
    have = installed_files()
    if target["file"] in have:
        return target["file"], target["key"], True
    # Until the target arrives, the best installed model in Auto's order,
    # then anything installed at all.
    for key in es.AUTO_ORDER + [m["key"] for m in es.MODELS]:
        m = es.model_by_key(key)
        if m["file"] in have:
            return m["file"], target["key"], False
    others = sorted(f for f in have if f != es.VAE[1])
    return (others[0] if others else None), target["key"], False


def resolve(choice):
    """The model file to run for a setting of "auto" or a file name."""
    if not choice or choice == AUTO:
        return auto_pick()[0]
    return choice


def catalog():
    """Everything the model menu shows."""
    vram = _vram()
    have = installed_files()
    target = auto_target()
    rows = []
    for m in es.MODELS:
        fits = vram >= m["fits"]
        note = m["about"]
        if vram and not fits:
            note += " Slower here: bigger than this card."
        elif vram and fits and m["key"] == target:
            note += " Fast on this PC."
        path = os.path.join(es.models_dir(), m["file"])
        rows.append({"key": m["key"], "name": m["name"], "file": m["file"], "note": note,
                     "gb": m["gb"], "installed": m["file"] in have, "fits": fits,
                     "auto": m["key"] == target,
                     "on_disk_gb": round(os.path.getsize(path) / 1e9, 1) if m["file"] in have else 0})
    now, _, ready = auto_pick()
    current = es.model_by_file(now) if now else None
    return {"vram": vram, "models": rows, "auto_target": target, "auto_ready": ready,
            "auto_now": current["key"] if current else None}


# -- memory tuning ----------------------------------------------------------

#: Graphics memory (GB) kept free for the image itself, the VAE and the
#: card's own use while a model runs.
HEADROOM = 5.0


def tuning(model_file, retry=False):
    """Loader settings for this model on this card."""
    vram = _vram()
    m = es.model_by_file(model_file) or {}
    blocks = m.get("blocks", 36)
    path = os.path.join(es.models_dir(), model_file or "")
    size = os.path.getsize(path) / 1e9 if os.path.isfile(path) else m.get("gb", 16.5)
    if retry or not vram:
        swap = blocks
    else:
        over = size + HEADROOM - vram
        swap = 0 if over <= 0 else min(blocks, int(math.ceil(over / size * blocks)) + 2)
    tile = 512 if retry else 1024
    return {"blocks_to_swap": swap, "cache_model": True, "tile": tile,
            "overlap": 64 if retry else 128}


# -- downloading and removing -----------------------------------------------

class Downloads:
    """One model download at a time, reported through on_change(state)."""

    def __init__(self, on_change):
        self.on_change = on_change
        self.job = None           # {"key", "fraction", "detail"}
        self._installer = None

    def start(self, key):
        if self.job:
            return False
        m = es.model_by_key(key)
        if m["file"] in installed_files():
            return False
        self.job = {"key": key, "fraction": 0, "detail": "Starting"}
        self.on_change(dict(self.job, state="running"))

        def progress(step, label, fraction, detail):
            if self.job:
                self.job.update(fraction=fraction, detail=detail)
                self.on_change(dict(self.job, state="running"))

        def done(ok, message):
            job, self.job = self.job, None
            self._installer = None
            self.on_change({"key": key, "state": "done" if ok else
                            ("cancelled" if message == "cancelled" else "error"),
                            "message": message, "fraction": 1 if ok else 0})

        inst = es.Installer(key, progress, done)
        self._installer = inst

        def run():
            try:
                inst._models()
                done(True, "")
            except es.Cancelled:
                done(False, "cancelled")
            except Exception as exc:
                done(False, str(exc))

        threading.Thread(target=run, daemon=True).start()
        return True

    def cancel(self):
        if self._installer:
            self._installer.cancel()


def remove(key, in_use_file=None):
    """Delete a downloaded model. Refuses the last one and one in use."""
    m = es.model_by_key(key)
    have = [f for f in installed_files() if f != es.VAE[1]]
    if m["file"] not in have:
        return "That model isn't installed."
    if len(have) <= 1:
        return "This is the only model. Download another one before removing it."
    if in_use_file and in_use_file == m["file"]:
        return "That model is in use right now. Try again when the images are done."
    try:
        os.remove(os.path.join(es.models_dir(), m["file"]))
    except OSError as exc:
        return "Couldn't remove it: %s" % exc
    return ""
