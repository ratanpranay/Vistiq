"""The Affinity link: Affinity's own "MCP" switch (Settings → Model Context
Protocol → Enable Affinity MCP) serves its scripting on this computer.
Studio asks it for a picture of the open document about once a second and
shows it in Create when it changed. For Create itself, the full-size canvas
is exported to a hidden file on the Desktop (the only place Affinity's
scripts may write).
"""
import base64
import hashlib
import json
import logging
import os
import queue
import threading
import time

import requests

log = logging.getLogger("vistiq")

BASE = "http://localhost:6767"
EVERY = 1.0


class Client:
    def __init__(self):
        self.s = requests.Session()
        self.s.trust_env = False
        self.post_url = None
        self.pending = {}
        self.next_id = 1
        self.lock = threading.Lock()
        self.alive = False

    def connect(self):
        r = self.s.get(BASE + "/sse", stream=True, timeout=(3, None), headers={"Accept": "text/event-stream"})
        r.raise_for_status()
        got = queue.Queue()
        threading.Thread(target=self._read, args=(r, got), daemon=True).start()
        self.post_url = got.get(timeout=10)
        self.alive = True
        for v in ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"):
            try:
                self.request("initialize", {"protocolVersion": v, "capabilities": {},
                                            "clientInfo": {"name": "vistiq-studio", "version": "1"}})
                break
            except RuntimeError as exc:
                if "protocol" not in str(exc).lower():
                    raise
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.call("read_sdk_documentation_topic", {"filename": "preamble"})

    def _read(self, r, got):
        event, data = "message", []
        try:
            for raw in r.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                if raw == "":
                    payload = "\n".join(data)
                    if event == "endpoint":
                        url = payload if payload.startswith("http") else BASE + payload
                        if not url.startswith(BASE):
                            url = BASE + "/" + url.split("/", 3)[-1]     # stay on this computer
                        got.put(url)
                    elif payload:
                        try:
                            msg = json.loads(payload)
                            q = self.pending.pop(msg.get("id"), None)
                            if q:
                                q.put(msg)
                        except ValueError:
                            pass
                    event, data = "message", []
                elif raw.startswith("event:"):
                    event = raw[6:].strip()
                elif raw.startswith("data:"):
                    data.append(raw[5:].lstrip())
        except Exception:
            pass
        self.alive = False
        for q in list(self.pending.values()):
            q.put({"error": {"message": "connection closed"}})

    def _post(self, body):
        r = self.s.post(self.post_url, json=body, timeout=10)
        if r.status_code == 404:
            self.alive = False
            raise RuntimeError("session ended")

    def request(self, method, params, timeout=60):
        with self.lock:
            rid = self.next_id
            self.next_id += 1
        q = queue.Queue()
        self.pending[rid] = q
        self._post({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        try:
            msg = q.get(timeout=timeout)
        except queue.Empty:
            self.pending.pop(rid, None)
            raise RuntimeError("Affinity didn't answer")
        if msg.get("error"):
            raise RuntimeError(msg["error"].get("message", "error"))
        return msg.get("result") or {}

    def call(self, tool, args, timeout=60):
        return self.request("tools/call", {"name": tool, "arguments": args}, timeout)

    def script(self, code, timeout=60):
        res = self.call("execute_script", {"script": code}, timeout)
        return "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text").strip()


def _image(res):
    for c in res.get("content", []):
        if c.get("type") == "image" and c.get("data"):
            return base64.b64decode(c["data"])
    return None


INFO = ("const { app } = require('/application'); const d = app.documents.current;"
        "console.log(d ? JSON.stringify({uuid: d.sessionUuid, title: d.title}) : 'NONE');")


class AffinityLink:
    def __init__(self, folder, on_frame, on_state=lambda s, m: None):
        self.folder = folder
        self.on_frame = on_frame
        self.on_state = on_state
        self.client = None
        self.running = False
        self.doc = None
        self.n = 0
        self._last = None

    def start(self):
        if self.running:
            return True
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()
        return True

    def stop(self):
        self.running = False

    def _loop(self):
        os.makedirs(self.folder, exist_ok=True)
        said = None
        while self.running:
            try:
                if not self.client or not self.client.alive:
                    self.client = Client()
                    self.client.connect()
                    self._last = None
                info = self.client.script(INFO, 20)
                if info == "NONE":
                    if said != "nodoc":
                        self.on_state("waiting", "Open a document in Affinity.")
                        said = "nodoc"
                    time.sleep(1.5)
                    continue
                self.doc = json.loads(info)
                jpg = _image(self.client.call("render_spread", {"document_session_uuid": self.doc["uuid"],
                                                                 "spread_index": 0}, 30))
                if jpg:
                    h = hashlib.md5(jpg).hexdigest()
                    if h != self._last:
                        self._last = h
                        self.n += 1
                        path = os.path.join(self.folder, "affinity_%05d.jpg" % self.n)
                        with open(path, "wb") as fh:
                            fh.write(jpg)
                        old = os.path.join(self.folder, "affinity_%05d.jpg" % (self.n - 4))
                        if os.path.exists(old):
                            os.remove(old)
                        from PIL import Image
                        w, hh = Image.open(path).size
                        self.on_frame({"path": path, "name": self.doc.get("title") or "Affinity", "w": w, "h": hh,
                                       "n": self.n, "app": "affinity"})
                if said != "ok":
                    self.on_state("live", "")
                    said = "ok"
            except Exception as exc:
                self.client = None
                if said != "off":
                    log.info("Affinity link: %s", exc)
                    self.on_state("off", "Can't reach Affinity. Open it and turn on Settings → Model Context "
                                         "Protocol → Enable Affinity MCP.")
                    said = "off"
                time.sleep(2)
                continue
            time.sleep(EVERY)

    def export_full(self, need=None, preview=None):
        """The whole canvas at full size, as a PNG path (None if that fails).
        If the live preview is already about `need` px on its long side, use it instead (much faster)."""
        if need and preview and os.path.isfile(preview):
            from PIL import Image
            if max(Image.open(preview).size) >= need * 0.9:
                return preview
        if not self.client or not self.doc:
            return None
        path = os.path.join(os.path.expanduser("~"), "Desktop", ".vistiq-studio-canvas.png")
        code = ("const { app } = require('/application'); const { FileExportOptions } = require('/document.js');"
                "const d = app.documents.current; if (!d) { console.log('NONE'); } else {"
                "d.export(%s, FileExportOptions.createWithPresetName('PNG'), null, null); console.log('OK'); }"
                % json.dumps(path))
        try:
            if self.client.script(code, 120).endswith("OK") and os.path.isfile(path):
                return path
        except Exception:
            log.exception("Affinity export failed")
        return None
