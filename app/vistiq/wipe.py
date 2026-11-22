"""Delete everything Studio downloaded and made, so it can be set up fresh.

Studio has no installer, so this is the clean way to remove it. Files of the
running app can't be deleted while it runs (Windows locks them), so a small
script is started that waits for Studio to close, stops anything still
running from those folders, deletes them and then deletes itself.

Only Studio's own folders are touched: a ComfyUI models folder you pointed it
at, or a custom upscale folder outside Studio's folder, is left alone. The
upscaler engine shared with the plain Vistiq app is kept when that app is
also on this computer.
"""
import os
import subprocess
import sys
import tempfile

from . import flavor, studio
from .settings import data_dir

#: What you have to type to confirm.
WORD = "DELETE"

#: Folders Studio makes inside its own folder (Documents\Vistiq Studio by default).
HOME_PARTS = ("Outputs", "Models", "Sketches", ".work")


def _local():
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    return os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")


def _roaming():
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    return os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), ".config")


def targets(settings=None):
    """The folders to delete, biggest first, without duplicates or nesting."""
    paths = []
    home = studio.home(settings)
    default_home = os.path.join(studio._documents(), "Vistiq Studio")
    if os.path.normcase(os.path.abspath(home)) == os.path.normcase(os.path.abspath(default_home)):
        paths.append(home)                                    # all of it: it is Studio's own
    else:
        paths += [os.path.join(home, p) for p in HOME_PARTS]  # a folder you chose: only what Studio put there
    paths.append(os.path.join(_local(), flavor.FOLDER))      # app versions, image engine, Mac model engine
    paths.append(data_dir())                                  # settings, projects, logs
    # The upscaler engine is shared with the plain Vistiq app: keep it if that app is here too.
    if flavor.STUDIO and not os.path.isdir(os.path.join(_roaming(), "Vistiq")):
        paths.append(os.path.join(_local(), "Vistiq", "engine"))
    out, seen = [], []
    for p in paths:
        a = os.path.normcase(os.path.abspath(p))
        if any(a == s or a.startswith(s + os.sep) for s in seen):
            continue
        out = [o for o in out if not os.path.normcase(os.path.abspath(o)).startswith(a + os.sep)]
        seen = [s for s in seen if not s.startswith(a + os.sep)] + [a]
        out.append(p)
    return [p for p in out if _safe(p)]


def _safe(p):
    """Never a drive root, the user folder, Documents or another too-short path."""
    a = os.path.abspath(p)
    user = os.path.abspath(os.path.expanduser("~"))
    bad = {os.path.normcase(x) for x in (user, os.path.join(user, "Documents"), _local(), _roaming(),
                                         os.path.dirname(user), os.path.splitdrive(a)[0] + os.sep, "/")}
    return os.path.normcase(a) not in bad and len(a.strip(os.sep).split(os.sep)) >= 3


def script(paths, pid):
    """The text of the clean-up script for this computer."""
    if sys.platform == "win32":
        q = lambda s: "'" + s.replace("'", "''") + "'"
        lst = ",".join(q(p) for p in paths)
        return ("$ErrorActionPreference='SilentlyContinue'\n"
                "$paths=@(%s)\n"
                "for($i=0;$i -lt 120 -and (Get-Process -Id %d);$i++){Start-Sleep -Milliseconds 500}\n"
                "foreach($t in 1..6){\n"
                "  foreach($p in $paths){Get-Process | Where-Object {$_.Path -and $_.Path.StartsWith($p,'OrdinalIgnoreCase')} | Stop-Process -Force}\n"
                "  foreach($p in $paths){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Recurse -Force}}\n"
                "  if(-not ($paths | Where-Object {Test-Path -LiteralPath $_})){break}\n"
                "  Start-Sleep -Seconds 2\n"
                "}\n"
                "Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force\n") % (lst, pid)
    q = lambda s: "'" + s.replace("'", "'\\''") + "'"
    lines = ["#!/bin/sh", "i=0; while kill -0 %d 2>/dev/null && [ $i -lt 120 ]; do sleep 0.5; i=$((i+1)); done" % pid]
    for p in paths:
        lines.append("pkill -9 -f %s 2>/dev/null" % q(p))
    for p in paths:
        lines.append("rm -rf %s" % q(p))
    lines.append('rm -f "$0"')
    return "\n".join(lines) + "\n"


def start(paths, pid=None):
    """Start the clean-up script, detached; it runs after Studio has closed."""
    pid = pid or os.getpid()
    ext = ".ps1" if sys.platform == "win32" else ".sh"
    fd, path = tempfile.mkstemp(prefix="vistiq-delete-", suffix=ext)
    with os.fdopen(fd, "w", encoding="utf-8-sig" if ext == ".ps1" else "utf-8") as fh:
        fh.write(script(paths, pid))
    if sys.platform == "win32":
        flags = 0x00000008 | 0x00000200 | 0x08000000   # detached, own group, no window
        subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
                          "-File", path], creationflags=flags, close_fds=True)
    else:
        os.chmod(path, 0o700)
        subprocess.Popen(["/bin/sh", path], start_new_session=True, close_fds=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return path
