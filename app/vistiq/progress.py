"""Realistic progress for one upscale.

The upscaler tells ComfyUI almost nothing while it works (three coarse
checkpoints per image). With its debug log switched on, though, it writes
which phase it is in and, while encoding and decoding, which tile of how
many. Vistiq's own engine writes that log to a file Vistiq can read, so
progress is built from it:

  loading  →  encoding (tile n of N)  →  upscaling  →  decoding (tile n of N)  →  finishing

Each phase gets its share of the bar from how long that phase actually took
on this PC before (learned per model, per megapixel). Inside a phase, tiles
move the bar exactly; the upscaling step has no tiles, so it moves by time
against what it took last time.
"""
import os
import re
import time

PHASES = ["load", "encode", "upscale", "decode", "post"]
LABELS = {"load": "Loading model", "encode": "Preparing", "upscale": "Upscaling",
          "decode": "Finishing details", "post": "Saving"}
#: Shares of the bar before anything has been learned (from the node's own
#: weighting, with room for loading).
DEFAULT_SHARE = {"load": 0.10, "encode": 0.18, "upscale": 0.22, "decode": 0.45, "post": 0.05}

_TILE = re.compile(r"(Encoding|Decoding) tiles? (\d+)(?:-(\d+))? / (\d+)")
_BEGIN = [
    (re.compile(r"Using VAE tiled encoding|Encoding tile|Phase 1"), "encode"),
    (re.compile(r"Phase 1: VAE encoding complete|Phase 2"), "upscale"),
    (re.compile(r"Phase 2: DiT upscaling complete|Using VAE tiled decoding|Decoding tile|Phase 3"), "decode"),
    (re.compile(r"Phase 3: VAE decoding complete|Phase 4"), "post"),
]


class LogTail:
    """Reads lines appended to a file since this object was made."""

    def __init__(self, path):
        self.path = path
        try:
            self.pos = os.path.getsize(path)
        except OSError:
            self.pos = 0
        self._rest = b""

    def lines(self):
        try:
            size = os.path.getsize(self.path)
        except OSError:
            return []
        if size < self.pos:          # the log was replaced
            self.pos = 0
        if size == self.pos:
            return []
        with open(self.path, "rb") as fh:
            fh.seek(self.pos)
            data = fh.read(size - self.pos)
        self.pos = size
        data = self._rest + data
        parts = data.split(b"\n")
        self._rest = parts.pop()
        return [p.decode("utf-8", "replace") for p in parts]


class Progress:
    def __init__(self, megapixels, history=None):
        """`history`: learned seconds for this model, as
        {"load": s, "encode": s/MP, "upscale": s/MP, "decode": s/MP, "post": s/MP}."""
        self.mp = max(0.1, megapixels)
        self.history = history or {}
        self.expect = {}
        for p in PHASES:
            v = self.history.get(p)
            if v:
                self.expect[p] = v if p == "load" else v * self.mp
        if len(self.expect) == len(PHASES):
            total = sum(self.expect.values()) or 1
            self.share = {p: self.expect[p] / total for p in PHASES}
        else:
            self.share = dict(DEFAULT_SHARE)
        self.phase = "load"
        self.sub = None              # exact fraction inside the phase, from tiles
        self.started = time.time()
        self.began = {"load": self.started}
        self.seen_log = False
        self._high = 0.0             # what has been shown; never go back

    # feeding it

    def feed(self, line):
        m = _TILE.search(line)
        if m:
            self.seen_log = True
            phase = "encode" if m.group(1) == "Encoding" else "decode"
            first, total = int(m.group(2)), int(m.group(4))
            self._enter(phase)
            if total:
                self.sub = max(self.sub or 0, (first - 1) / float(total))
            return
        for pattern, phase in _BEGIN:
            if pattern.search(line):
                self.seen_log = True
                self._enter(phase)

    def _enter(self, phase):
        if PHASES.index(phase) > PHASES.index(self.phase):
            now = time.time()
            for p in PHASES[PHASES.index(self.phase) + 1:PHASES.index(phase) + 1]:
                self.began.setdefault(p, now)
            self.phase = phase
            self.sub = None

    # reading it

    def value(self):
        i = PHASES.index(self.phase)
        base = sum(self.share[p] for p in PHASES[:i])
        inside = self.sub
        if inside is None:
            elapsed = time.time() - self.began.get(self.phase, self.started)
            expect = self.expect.get(self.phase)
            if expect:
                inside = min(0.95, elapsed / expect)
            else:
                # Nothing learned yet: close in on the end of the phase,
                # slowing down, without ever claiming it's done.
                guess = 8.0 if self.phase == "load" else max(4.0, self.mp * 1.2)
                inside = 0.9 * (1 - pow(2.718281828, -elapsed / guess))
        self._high = max(self._high, min(0.99, base + self.share[self.phase] * inside))
        return self._high

    def label(self):
        return LABELS[self.phase]

    def remaining(self):
        """Seconds left, when everything has been learned; else None."""
        if len(self.expect) != len(PHASES):
            return None
        i = PHASES.index(self.phase)
        left = sum(self.expect[p] for p in PHASES[i + 1:])
        here = self.expect[self.phase]
        elapsed = time.time() - self.began.get(self.phase, self.started)
        frac = self.sub if self.sub is not None else min(0.95, elapsed / here if here else 1)
        return max(0.0, left + here * (1 - frac))

    def learned(self):
        """Durations from this run, in the same shape as `history`."""
        end = time.time()
        out = {}
        for n, p in enumerate(PHASES):
            if p not in self.began:
                continue
            nxt = next((self.began[q] for q in PHASES[n + 1:] if q in self.began), end)
            secs = max(0.0, nxt - self.began[p])
            out[p] = secs if p == "load" else secs / self.mp
        return out


def merge(old, new):
    """Blend a run's timings into what was known (recent runs weigh more)."""
    out = dict(old or {})
    for p, v in (new or {}).items():
        out[p] = round(v if p not in out else out[p] * 0.6 + v * 0.4, 4)
    return out
