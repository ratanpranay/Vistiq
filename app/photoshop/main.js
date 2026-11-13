// Vistiq Studio link: after every change in Photoshop, the active document's
// visible canvas is sent to Vistiq Studio on this PC (nothing leaves the PC).
const { action, core, imaging, app } = require("photoshop");
const uxpStorage = require("uxp").storage;

const STUDIO = "http://127.0.0.1:38393";
const MAX_SIDE = 2048;
const VERSION = "1.0.6";
let lastError = "";
let sendError = "";

let connected = false;
let sending = false;
let again = false;
let timer = null;
let lastKey = "";

const $ = (id) => document.getElementById(id);

function show(text, ok) {
  $("st").textContent = text;
  $("dot").className = ok ? "dot on" : "dot";
}

function enabled() {
  const c = $("send");
  return !c || c.checked !== false;
}

// Every second: tell Studio which file is in front. Studio answers with the
// file it has; if they differ (new file, a change, Studio restarted, a lost
// picture), send the canvas. So it can't get stuck, like a navigator.
async function ping() {
  let key = "none";
  try { const d = app.activeDocument; if (d) key = docKey(d); } catch (e) {}
  try {
    const r = await fetch(STUDIO + "/ping?v=" + VERSION + "&key=" + encodeURIComponent(enabled() ? key : "off"));
    connected = r.ok;
    let have = "", place = [];
    try { const j = await r.json(); have = j.have || ""; place = j.place || []; } catch (e) {}
    for (const item of place) placeQueue(item);
    if (connected && key !== "none" && enabled() && have !== key && !sending) schedule(0);
    lastError = connected ? "" : "answered " + r.status;
  } catch (e) {
    connected = false;
    lastError = String(e && e.message || e);
  }
  if (connected) show("Connected to Vistiq Studio", true);
  else show("Vistiq Studio isn't open", false);
  if (key === "none") $("info").textContent = "Open a file to show it in Studio.";
  $("ver").textContent = "Panel " + VERSION + (lastError ? " · " + lastError : "");
}

function schedule(delay) {
  if (!connected || !enabled()) return;
  clearTimeout(timer);
  timer = setTimeout(send, delay == null ? 300 : delay);
}

// Pictures Studio sends back ("Send to Photoshop"): placed as a new layer,
// stretched to the canvas so it lines up with the sketch.
const placing = new Set();
async function placeQueue(item) {
  if (placing.has(item.id)) return;
  placing.add(item.id);
  let ok = false, msg = "";
  try {
    const doc = app.activeDocument;
    if (!doc) throw new Error("No file is open.");
    const r = await fetch(STUDIO + "/file?id=" + encodeURIComponent(item.id));
    if (!r.ok) throw new Error("Studio answered " + r.status);
    const buf = await r.arrayBuffer();
    const tmp = await uxpStorage.localFileSystem.getTemporaryFolder();
    const f = await tmp.createFile("vistiq_" + item.id + (item.ext || ".png"), { overwrite: true });
    await f.write(buf, { format: uxpStorage.formats.binary });
    const token = uxpStorage.localFileSystem.createSessionToken(f);
    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "placeEvent", null: { _path: token, _kind: "local" },
        freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
        offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: 0 }, vertical: { _unit: "pixelsUnit", _value: 0 } }
      }], {});
      const layer = doc.activeLayers[0];
      if (layer) {
        const b = layer.bounds, w = b.right - b.left, h = b.bottom - b.top;
        if (w > 0 && h > 0) await layer.scale(doc.width / w * 100, doc.height / h * 100);
        const b2 = layer.bounds;
        await layer.translate(-b2.left, -b2.top);
        layer.name = item.name || "Vistiq";
      }
    }, { commandName: "Place from Vistiq Studio" });
    ok = true;
    $("info").textContent = "Placed “" + (item.name || "picture") + "” as a new layer.";
  } catch (e) {
    msg = String(e && e.message || e);
    $("info").textContent = "Couldn't place the picture: " + msg;
  }
  try { await fetch(STUDIO + "/placed?id=" + encodeURIComponent(item.id) + "&ok=" + (ok ? 1 : 0), { method: "POST", body: msg }); } catch (e) {}
  lastKey = "";   // the canvas changed: send it again
}

// Something to tell "has anything changed" without reading pixels.
function docKey(doc) {
  try {
    const h = doc.activeHistoryState;
    return doc.id + ":" + (h ? h.id : "") + ":" + doc.historyStates.length + ":" + doc.width + "x" + doc.height;
  } catch (e) {
    return String(Math.random());
  }
}

async function send() {
  if (sending) { again = true; return; }
  const doc = app.activeDocument;
  if (!doc || !connected || !enabled()) return;
  sending = true;
  const key0 = docKey(doc);
  try {
    let frame = null, sel = null;
    await core.executeAsModal(async () => {
      const w = doc.width, h = doc.height;
      const opts = { documentID: doc.id, componentSize: 8, applyAlpha: true, colorSpace: "RGB" };
      if (Math.max(w, h) > MAX_SIDE) opts.targetSize = w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE };
      const px = await imaging.getPixels(opts);
      const img = px.imageData;
      const data = await img.getData({ chunky: true });
      frame = { width: img.width, height: img.height, components: img.components || img.componentCount || 3,
                bytes: data };
      img.dispose();
      // The current selection (lasso, marquee, Select Subject…) as a mask the
      // same size as the picture: Studio uses it as "change only this area".
      try {
        const s = await imaging.getSelection({ documentID: doc.id,
          sourceBounds: { left: 0, top: 0, right: w, bottom: h },
          targetSize: { width: frame.width, height: frame.height } });
        if (s && s.imageData) {
          const sd = await s.imageData.getData({ chunky: true });
          sel = { width: s.imageData.width, height: s.imageData.height, bytes: sd,
                  b: s.sourceBounds || { left: 0, top: 0, right: w, bottom: h }, dw: w, dh: h };
          s.imageData.dispose();
        }
      } catch (e) { sel = null; }   // no selection
    }, { commandName: "Vistiq Studio live view" });
    const key = key0;
    lastKey = key;
    if (frame) {
      const name = doc.title || doc.name || "Photoshop";
      const r = await fetch(STUDIO + "/raw?w=" + frame.width + "&h=" + frame.height + "&c=" + frame.components +
                            "&name=" + encodeURIComponent(name) + "&key=" + encodeURIComponent(key),
                            { method: "POST", headers: { "Content-Type": "application/octet-stream" },
                              body: frame.bytes.buffer || frame.bytes });
      sendError = r.ok ? "" : "Studio answered " + r.status;
      $("info").textContent = r.ok ? "Showing “" + name + "” in Studio." : sendError;
      try {
        if (sel) {
          const q = "/sel?w=" + sel.width + "&h=" + sel.height + "&fw=" + frame.width + "&fh=" + frame.height +
                    "&dw=" + sel.dw + "&dh=" + sel.dh + "&l=" + sel.b.left + "&t=" + sel.b.top + "&r=" + sel.b.right +
                    "&b=" + sel.b.bottom + "&key=" + encodeURIComponent(key);
          await fetch(STUDIO + q, { method: "POST", headers: { "Content-Type": "application/octet-stream" },
                                    body: sel.bytes.buffer || sel.bytes });
        } else {
          await fetch(STUDIO + "/sel?none=1&key=" + encodeURIComponent(key), { method: "POST", body: "" });
        }
      } catch (e) {}
    }
  } catch (e) {
    // Photoshop busy (a dialog, a long filter), or something else: say so, try again.
    sendError = String(e && e.message || e);
    $("info").textContent = "Couldn't read the canvas: " + sendError;
    again = true;
  } finally {
    sending = false;
    if (again) { again = false; schedule(1500); }
  }
}

action.addNotificationListener(
  ["historyStateChanged", "select", "open", "close", "make", "set", "delete", "paste", "move", "transform"],
  () => schedule(150));

// A safety net for changes that send no notice: look every second.
setInterval(() => {
  const doc = app.activeDocument;
  if (doc && connected && enabled() && docKey(doc) !== lastKey) schedule(0);
}, 1000);

$("send").addEventListener("change", () => { lastKey = ""; schedule(0); });
// One request always open to Studio, answered the moment Studio needs a
// picture (Connect, Studio starting, a lost picture) or has one to place.
// Photoshop slows a panel's timers down while you work elsewhere, but not this.
let waiting = false;
async function waitLoop() {
  if (waiting) return;
  waiting = true;
  while (true) {
    let key = "none";
    try { const d = app.activeDocument; if (d) key = docKey(d); } catch (e) {}
    try {
      const r = await fetch(STUDIO + "/wait?v=" + VERSION + "&key=" + encodeURIComponent(enabled() ? key : "off"));
      connected = r.ok;
      let have = "", place = [];
      try { const j = await r.json(); have = j.have || ""; place = j.place || []; } catch (e) {}
      for (const item of place) placeQueue(item);
      let now = "none";
      try { const d = app.activeDocument; if (d) now = docKey(d); } catch (e) {}
      if (connected && now !== "none" && enabled() && have !== now) {
        if (!sending) { lastKey = ""; await send(); }
        await new Promise((res) => setTimeout(res, 250));    // never spin if Photoshop is busy
      }
      show("Connected to Vistiq Studio", true);
    } catch (e) {
      connected = false;
      show("Vistiq Studio isn't open", false);
      await new Promise((res) => setTimeout(res, 1500));   // Studio closed: try again soon
    }
  }
}

setInterval(ping, 1000);      // backup
ping();
waitLoop();
