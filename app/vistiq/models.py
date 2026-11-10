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
    from . import tiles
    for r in rows:
        t = tuning(r["file"])
        r["on_card"] = t["blocks_to_swap"] == 0
    return {"vram": vram, "part_mp": round(tiles.part_limit(vram)), "models": rows, "auto_target": target, "auto_ready": ready,
            "auto_now": current["key"] if current else None}


# -- memory tuning ----------------------------------------------------------

#: Graphics memory (GB) kept free while a model runs: a base for the card
#: itself and the VAE, plus room that grows with the size of the result,
#: because the upscaling step works on the whole image at once.
BASE_HEADROOM = 3.0
PER_MEGAPIXEL = 0.4
#: What Windows and the display keep for themselves on the card (more so on
#: a laptop, where the same card drives the screen).
SYSTEM_RESERVE = 2.0
#: Windows doesn't fail when graphics memory runs short: it quietly spills
#: into system RAM, and the upscale becomes many times slower (a 4 MP result
#: taking minutes). So the model is kept on the card only with a wide
#: margin; swapping it in from RAM costs little by comparison.
ON_CARD_SHARE = 0.75


def tuning(model_file, retry=False, megapixels=8.0, extra_swap=0):
    """Loader settings for this model, on this card, for a result this big.

    `extra_swap` is what earlier failures taught for this model (see
    App: a run that crashes the card raises it for next time).
    """
    vram = _vram()
    m = es.model_by_file(model_file) or {}
    blocks = m.get("blocks", 36)
    path = os.path.join(es.models_dir(), model_file or "")
    size = os.path.getsize(path) / 1e9 if os.path.isfile(path) else m.get("gb", 16.5)
    headroom = BASE_HEADROOM + PER_MEGAPIXEL * max(0.0, megapixels) + SYSTEM_RESERVE
    # The whole model stays on the card only when it fits with room to spare
    # for this result; otherwise every block is swapped, as in the original
    # workflow. Swapping part of a model saved little and was where cards
    # hung or crashed.
    if retry or extra_swap or not vram or size + headroom > vram * ON_CARD_SHARE:
        swap = blocks
    else:
        swap = 0
    # Keeping the model in memory between images only pays when the PC has
    # the RAM for it; on a 16 or 32 GB laptop it pushes Windows into paging.
    ram = _ram()
    cache = bool(ram) and ram >= size * 2 + 16
    # Tiles of 1024 px worked on this card in the original workflow even at
    # 17 MP, so a retry keeps them and only swaps more.
    return {"blocks_to_swap": swap, "cache_model": cache, "tile": 1024, "overlap": 128}


def _ram():
    """Installed memory in GB, or 0 when unknown."""
    try:
        import ctypes

        class MS(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        st = MS()
        st.dwLength = ctypes.sizeof(MS)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
            return st.ullTotalPhys / 1e9
    except Exception:
        pass
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9
    except Exception:
        return 0


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
