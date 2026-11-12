"""Vistiq.exe — the part that never needs rebuilding.

All the launcher does is make sure the newest version of the app is on this
PC, then run it. The app itself (Python code and the HTML interface) is
published as `vistiq-app.zip` on each GitHub release; the launcher fetches
it into %LOCALAPPDATA%\\Vistiq\\app\\<version> and imports it from there.

So a change to the app is a new GitHub release, nothing more. This exe only
has to be rebuilt if the app starts needing a Python library it doesn't
already carry (see the imports below).
"""
import io
import json
import os
import shutil
import sys
import threading
import traceback
import urllib.request
import zipfile

# Everything the app is allowed to import must be inside this exe, because
# the app's code arrives later as plain .py files. Importing them here is
# what makes PyInstaller pack them.
import base64, glob, logging, socket, subprocess, time, uuid, webbrowser  # noqa: F401,E401
import requests  # noqa: F401
import websocket  # noqa: F401
import webview  # noqa: F401
import webview.dom  # noqa: F401
from PIL import Image, ImageGrab, ImageOps  # noqa: F401

# Vistiq Studio (the test build with image generation) is the same launcher
# started by studio.py, which sets VISTIQ_FLAVOR first: own folder, own zip,
# own release channel ("studio-v..." pre-releases).
STUDIO = os.environ.get("VISTIQ_FLAVOR", "").lower() == "studio"
REPO = "ratanpranay/Vistiq"
ASSET = "vistiq-studio-app.zip" if STUDIO else "vistiq-app.zip"
TAG_PREFIX = "studio-v" if STUDIO else "v"
NAME = "Vistiq Studio" if STUDIO else "Vistiq"
HERE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"),
                    "VistiqStudio" if STUDIO else "Vistiq")
APPS = os.path.join(HOME, "app")


def _ver(text):
    parts = []
    for p in (text or "0").strip().lstrip("v").split("."):
        digits = "".join(c for c in p if c.isdigit())
        parts.append(int(digits or 0))
    return tuple(parts + [0] * (3 - len(parts)))[:3]


def _read_version(folder):
    try:
        with open(os.path.join(folder, "VERSION"), encoding="utf-8") as fh:
            return fh.read().strip()
    except Exception:
        return None


def _installed():
    """Versions already unpacked on this PC, newest first."""
    found = []
    if os.path.isdir(APPS):
        for name in os.listdir(APPS):
            folder = os.path.join(APPS, name)
            v = _read_version(folder)
            if v and os.path.isfile(os.path.join(folder, "vistiq", "__init__.py")):
                found.append((_ver(v), v, folder))
    bundled = os.path.join(HERE, "app")
    v = _read_version(bundled)
    if v:
        found.append((_ver(v), v, bundled))
    found.sort(reverse=True)
    return found


def _latest_release(timeout=6):
    if STUDIO:
        url = "https://api.github.com/repos/%s/releases?per_page=30" % REPO
    else:
        url = "https://api.github.com/repos/%s/releases/latest" % REPO
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "User-Agent": "Vistiq-launcher"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.load(r)
    if STUDIO:
        mine = [d for d in data if (d.get("tag_name") or "").startswith(TAG_PREFIX)]
        if not mine:
            return None, None
        mine.sort(key=lambda d: _ver(d["tag_name"][len(TAG_PREFIX):]), reverse=True)
        data = mine[0]
        data["tag_name"] = data["tag_name"][len(TAG_PREFIX):]
    tag = data.get("tag_name", "")
    for asset in data.get("assets", []):
        if asset.get("name") == ASSET:
            return tag.lstrip("v"), asset["browser_download_url"]
    return None, None


def _install(version, url):
    req = urllib.request.Request(url, headers={"User-Agent": "Vistiq-launcher"})
    with urllib.request.urlopen(req, timeout=60) as r:
        blob = r.read()
    target = os.path.join(APPS, version)
    tmp = target + ".partial"
    shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for name in z.namelist():
            if name.startswith("/") or ".." in name.replace("\\", "/").split("/"):
                raise ValueError("unsafe path in update: %s" % name)
        z.extractall(tmp)
    if _read_version(tmp) is None or not os.path.isfile(os.path.join(tmp, "vistiq", "__init__.py")):
        raise ValueError("update is incomplete")
    shutil.rmtree(target, ignore_errors=True)
    os.replace(tmp, target)
    return target


def _tidy(keep):
    """Keep the two newest downloaded versions, so a bad release can be
    stepped back from by deleting its folder."""
    downloaded = [f for f in _installed() if f[2].startswith(APPS)]
    for _, _, folder in downloaded[keep:]:
        shutil.rmtree(folder, ignore_errors=True)


def _update():
    """Returns a short note for the app to show, or ''."""
    if os.environ.get("VISTIQ_NO_UPDATE"):
        return ""
    have = _installed()
    newest = have[0][0] if have else (0, 0, 0)
    try:
        version, url = _latest_release()
    except Exception as exc:
        # Usually a network that blocks GitHub. Worth a line in the log:
        # otherwise an old copy keeps running and nothing says why.
        _log("couldn't check for updates: %s" % exc)
        return ""
    if not version or _ver(version) <= newest:
        return ""
    try:
        _install(version, url)
        _tidy(keep=2)
        return "Updated to %s" % version
    except Exception:
        _log(traceback.format_exc())
        return ""


def _log(text):
    try:
        os.makedirs(HOME, exist_ok=True)
        with open(os.path.join(HOME, "launcher.log"), "a", encoding="utf-8") as fh:
            fh.write(time.strftime("%Y-%m-%d %H:%M:%S ") + text + "\n")
    except Exception:
        pass


def _fatal(text):
    _log(text)
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0, NAME + " couldn't start.\n\n" + text.strip().splitlines()[-1] +
            "\n\nDetails: " + os.path.join(HOME, "launcher.log"), NAME, 0x10)
    except Exception:
        print(text)


def selftest():
    """Used by the build: can this exe load the app it carries?"""
    sys.path.insert(0, os.path.join(HERE, "app"))
    import vistiq.app  # noqa
    import vistiq.engine  # noqa
    from vistiq import workflow
    assert workflow.output_size(1000, 500, "max") == (7000, 3500)
    if STUDIO:
        from vistiq import flavor, studio, studio_jobs  # noqa
        assert flavor.STUDIO and studio.FILES and studio_jobs.Studio
    return 0


def main():
    if "--selftest" in sys.argv:
        try:
            return selftest()
        except Exception:
            _log("selftest failed:\n" + traceback.format_exc())
            return 3
    os.makedirs(APPS, exist_ok=True)
    note = _update()
    have = _installed()
    if not have:
        _fatal("No copy of the app was found, and none could be downloaded.")
        return 1
    for _, version, folder in have:
        try:
            sys.path.insert(0, folder)
            import vistiq  # noqa
            import vistiq.app  # noqa  (a broken download fails here, not mid-run)
        except Exception:
            _log("version %s failed:\n%s" % (version, traceback.format_exc()))
            sys.path.remove(folder)
            for mod in [m for m in sys.modules if m == "vistiq" or m.startswith("vistiq.")]:
                del sys.modules[mod]
            note = ""
            continue
        _log("running %s from %s" % (version, folder))
        try:
            vistiq.main(app_dir=folder, notice=note)
        except Exception:
            _fatal(traceback.format_exc())
            return 1
        return 0
    _fatal("Every installed version failed to start.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
