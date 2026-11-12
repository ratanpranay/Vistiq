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


def main(app_dir=None, notice=""):
    """Entry point used by the launcher and by run_dev.py."""
    from .app import run
    run(app_dir or os.path.dirname(_here), version(), notice)
