"""Live machine numbers for the little bar under the canvas: graphics card
(load, temperature, memory), processor (load, temperature when Windows
gives it) and memory. Cheap: one nvidia-smi process that reports every
second, and the processor/memory numbers straight from Windows."""
import ctypes
import logging
import os
import subprocess
import sys
import threading
import time

log = logging.getLogger("vistiq")
_NOWIN = 0x08000000 if sys.platform == "win32" else 0      # no console window flashing up


def _short_gpu(name):
    """"NVIDIA RTX PRO 4000 Blackwell Generation Laptop GPU" -> "RTX PRO 4000"; "NVIDIA GeForce RTX 4090" -> "RTX 4090"."""
    n = name.replace("NVIDIA", "").replace("GeForce", "")
    for cut in (" Blackwell", " Ada", " Generation", " Laptop", " GPU", " with "):
        n = n.split(cut)[0]
    return " ".join(n.split()) or name


class Monitor:
    def __init__(self):
        self._gpu = None
        self._proc = None
        self._lock = threading.Lock()
        self._cpu_prev = None
        self._cpu_name = None
        self._started = False

    # -- graphics card: one nvidia-smi that prints a line every second ----------------
    def _start_gpu(self):
        if self._started:
            return
        self._started = True
        try:
            self._proc = subprocess.Popen(
                ["nvidia-smi", "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
                 "--format=csv,noheader,nounits", "-lms", "1000"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, creationflags=_NOWIN)
        except Exception as exc:
            log.info("no nvidia-smi: %s", exc)
            return
        threading.Thread(target=self._read_gpu, daemon=True).start()

    def _read_gpu(self):
        for line in self._proc.stdout:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 5:
                continue
            try:
                with self._lock:
                    self._gpu = {"name": _short_gpu(parts[0]),
                                 "load": int(float(parts[1])), "temp": int(float(parts[2])),
                                 "used": float(parts[3]) / 1024, "total": float(parts[4]) / 1024, "at": time.time()}
            except ValueError:
                continue

    # -- processor and memory ---------------------------------------------------------
    def _cpu_times(self):
        if sys.platform == "win32":
            FT = ctypes.c_ulonglong
            idle, kernel, user = FT(), FT(), FT()
            ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user))
            return idle.value, kernel.value + user.value          # kernel time includes idle
        with open("/proc/stat") as fh:
            v = [int(x) for x in fh.readline().split()[1:]]
        return v[3] + v[4], sum(v)

    def _cpu_load(self):
        try:
            now = self._cpu_times()
        except Exception:
            return None
        prev, self._cpu_prev = self._cpu_prev, now
        if not prev:
            return None
        idle, total = now[0] - prev[0], now[1] - prev[1]
        return max(0, min(100, round(100 * (1 - idle / total)))) if total > 0 else None

    def _ram(self):
        try:
            if sys.platform == "win32":
                class MS(ctypes.Structure):
                    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                                ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
                m = MS(); m.dwLength = ctypes.sizeof(MS)
                ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
                return (m.ullTotalPhys - m.ullAvailPhys) / 2**30, m.ullTotalPhys / 2**30
            info = {}
            with open("/proc/meminfo") as fh:
                for line in fh:
                    k, v = line.split(":", 1)
                    info[k] = int(v.split()[0]) * 1024
            return (info["MemTotal"] - info["MemAvailable"]) / 2**30, info["MemTotal"] / 2**30
        except Exception:
            return None

    def _cpu_label(self):
        if self._cpu_name is None:
            name = ""
            try:
                if sys.platform == "win32":
                    import winreg
                    k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
                    name = winreg.QueryValueEx(k, "ProcessorNameString")[0]
                else:
                    with open("/proc/cpuinfo") as fh:
                        name = next((l.split(":", 1)[1] for l in fh if l.startswith("model name")), "")
            except Exception:
                name = ""
            # "13th Gen Intel(R) Core(TM) i9-13900K" -> "i9-13900K"; "AMD Ryzen 9 7950X 16-Core Processor" -> "Ryzen 9 7950X"
            name = name.replace("(R)", "").replace("(TM)", "").replace("CPU", "").strip()
            for cut in (" Processor", " with ", " @"):
                name = name.split(cut)[0]
            words = name.split()
            core = [w for w in words if any(c.isdigit() for c in w) and "-" in w]
            self._cpu_name = core[-1] if core else " ".join(w for w in words if w not in ("Intel", "AMD", "Core", "13th", "12th", "14th", "Gen"))[:24]
        return self._cpu_name

    def read(self):
        self._start_gpu()
        with self._lock:
            gpu = dict(self._gpu) if self._gpu and time.time() - self._gpu["at"] < 5 else None
        ram = self._ram()
        return {"gpu": gpu, "cpu": {"name": self._cpu_label(), "load": self._cpu_load(), "temp": None},
                "ram": {"used": round(ram[0], 1), "total": round(ram[1])} if ram else None}

    def stop(self):
        try:
            if self._proc:
                self._proc.terminate()
        except Exception:
            pass


monitor = Monitor()
import atexit  # noqa: E402
atexit.register(monitor.stop)
