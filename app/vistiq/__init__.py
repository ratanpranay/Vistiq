"""Vistiq: sharper images, one drop away."""
import os

_here = os.path.dirname(os.path.abspath(__file__))


def version():
    from . import flavor
    name = "STUDIO_VERSION" if flavor.STUDIO else "VERSION"
    try:
        with open(os.path.join(os.path.dirname(_here), name), encoding="utf-8") as fh:
            return fh.read().strip()
    except Exception:
        return "0.0.0"


def _children_dont_hold_our_temp_folder():
    """Programs Studio starts (image engines, prompt helper) can keep running
    after it closes. On Windows they'd inherit the exe's unpack folder as a
    place to load DLLs from and keep it busy; Windows then shows "Failed to
    remove temporary directory" when Vistiq exits. Start them without it."""
    import sys
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    import subprocess
    if getattr(subprocess.Popen.__init__, "_vistiq", False):
        return
    os.environ["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    try:
        import ctypes
        k32 = ctypes.windll.kernel32
        orig = subprocess.Popen.__init__
        home = getattr(sys, "_MEIPASS", None)

        def init(self, *a, **k):
            k32.SetDllDirectoryW(None)
            try:
                orig(self, *a, **k)
            finally:
                k32.SetDllDirectoryW(home)
        init._vistiq = True
        subprocess.Popen.__init__ = init
    except Exception:
        pass


def main(app_dir=None, notice=""):
    """Entry point used by the launcher and by run_dev.py."""
    _children_dont_hold_our_temp_folder()
    from .app import run
    run(app_dir or os.path.dirname(_here), version(), notice)
