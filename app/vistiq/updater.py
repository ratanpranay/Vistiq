"""Updates while the app is open.

The launcher already updates on every start; this lets the app notice a new
release while it's running, fetch it in the background, and restart into
it on request. It installs into the same place the launcher reads from
(%LOCALAPPDATA%\\Vistiq\\app\\<version>), so the restart picks it up.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import threading
import urllib.request
import zipfile

REPO = "ratanpranay/Vistiq"
ASSET = "vistiq-app.zip"
RELEASES = "https://github.com/%s/releases" % REPO
CHECK_EVERY = 2 * 60 * 60


def _home():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "Vistiq", "app")


def ver(text):
    parts = []
    for p in (text or "0").strip().lstrip("v").split("."):
        digits = "".join(c for c in p if c.isdigit())
        parts.append(int(digits or 0))
    return tuple(parts + [0] * (3 - len(parts)))[:3]


def _installed_versions():
    found = []
    home = _home()
    if os.path.isdir(home):
        for name in os.listdir(home):
            try:
                with open(os.path.join(home, name, "VERSION"), encoding="utf-8") as fh:
                    found.append(fh.read().strip())
            except Exception:
                pass
    return found


class Updater:
    """state: idle | checking | current | downloading | ready | error"""

    def __init__(self, version, on_change):
        self.version = version
        self.on_change = on_change
        self.state = "idle"
        self.latest = None
        self.notes = ""
        self.url = RELEASES
        self.message = ""
        self._lock = threading.Lock()
        self._timer = None

    def info(self):
        return {"current": self.version, "state": self.state, "latest": self.latest,
                "notes": self.notes, "url": self.url, "message": self.message}

    def _set(self, state, message=""):
        self.state, self.message = state, message
        self.on_change(self.info())

    def check_async(self, delay=0):
        t = threading.Timer(delay, self.check)
        t.daemon = True
        t.start()

    def watch(self):
        """Check soon after start, then every couple of hours."""
        def loop():
            self.check()
            self._timer = threading.Timer(CHECK_EVERY, loop)
            self._timer.daemon = True
            self._timer.start()
        self._timer = threading.Timer(8, loop)
        self._timer.daemon = True
        self._timer.start()

    def check(self):
        if not self._lock.acquire(blocking=False):
            return
        try:
            if self.state in ("downloading", "ready"):
                self.on_change(self.info())
                return
            self._set("checking")
            try:
                req = urllib.request.Request(
                    "https://api.github.com/repos/%s/releases/latest" % REPO,
                    headers={"Accept": "application/vnd.github+json", "User-Agent": "Vistiq"})
                with urllib.request.urlopen(req, timeout=10) as r:
                    data = json.load(r)
            except Exception:
                self._set("error", "Couldn't reach GitHub. Check the connection and try again.")
                return
            tag = (data.get("tag_name") or "").lstrip("v")
            self.latest = tag or None
            self.notes = (data.get("body") or "").strip()
            self.url = data.get("html_url") or RELEASES
            asset = next((a for a in data.get("assets", []) if a.get("name") == ASSET), None)
            if not tag or ver(tag) <= ver(self.version) or not asset:
                self._set("current")
                return
            if tag in _installed_versions():
                self._set("ready")
                return
            self._set("downloading")
            try:
                self._install(tag, asset["browser_download_url"])
            except Exception as exc:
                self._set("error", "The update couldn't be downloaded (%s)." % exc)
                return
            self._set("ready")
        finally:
            self._lock.release()

    def _install(self, version, url):
        req = urllib.request.Request(url, headers={"User-Agent": "Vistiq"})
        with urllib.request.urlopen(req, timeout=120) as r:
            blob = r.read()
        target = os.path.join(_home(), version)
        tmp = target + ".partial"
        shutil.rmtree(tmp, ignore_errors=True)
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            for name in z.namelist():
                if name.startswith("/") or ".." in name.replace("\\", "/").split("/"):
                    raise ValueError("unsafe path in update")
            z.extractall(tmp)
        if not os.path.isfile(os.path.join(tmp, "VERSION")) or \
                not os.path.isfile(os.path.join(tmp, "vistiq", "__init__.py")):
            shutil.rmtree(tmp, ignore_errors=True)
            raise ValueError("incomplete update")
        shutil.rmtree(target, ignore_errors=True)
        os.replace(tmp, target)


def relaunch():
    """Start a fresh copy of Vistiq. The caller then closes this one."""
    if getattr(sys, "frozen", False):
        cmd = [sys.executable]
    else:
        cmd = [sys.executable] + sys.argv
    flags = 0
    if sys.platform == "win32":
        flags = 0x00000008 | 0x00000200   # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    env = dict(os.environ)
    # PyInstaller 6.9+: start as a brand-new instance, not as a child that
    # shares this one's unpacked files (they're deleted when it exits).
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    # The launcher's onefile unpack folder belongs to this process; a new
    # copy must make its own.
    env.pop("_MEIPASS2", None)
    env.pop("_PYI_APPLICATION_HOME_DIR", None)
    env.pop("_PYI_ARCHIVE_FILE", None)
    env.pop("_PYI_PARENT_PROCESS_LEVEL", None)
    subprocess.Popen(cmd, close_fds=True, creationflags=flags, env=env)
