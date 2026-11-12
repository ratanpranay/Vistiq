// Vistiq Studio link: after every change in Photoshop, the active document's
// visible canvas is sent to Vistiq Studio on this PC (nothing leaves the PC).
const { action, core, imaging, app } = require("photoshop");

const STUDIO = "http://127.0.0.1:38393";
const MAX_SIDE = 2048;
const VERSION = "1.0.2";
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

async function ping() {
  try {
    const r = await fetch(STUDIO + "/ping");
    const was = connected;
    connected = r.ok;
    if (connected && !was) { lastKey = ""; schedule(0); }
    lastError = connected ? "" : "answered " + r.status;
  } catch (e) {
    connected = false;
    lastError = String(e && e.message || e);
  }
  if (connected) show("Connected to Vistiq Studio", true);
  else show("Vistiq Studio isn't listening", false);
  $("ver").textContent = "Panel " + VERSION + " · " + STUDIO + (lastError ? " · " + lastError : "");
}

function schedule(delay) {
  if (!connected || !enabled()) return;
  clearTimeout(timer);
  timer = setTimeout(send, delay == null ? 300 : delay);
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
  try {
    let frame = null;
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
    }, { commandName: "Vistiq Studio live view" });
    lastKey = docKey(doc);
    if (frame) {
      const name = doc.title || doc.name || "Photoshop";
      const r = await fetch(STUDIO + "/raw?w=" + frame.width + "&h=" + frame.height + "&c=" + frame.components +
                            "&name=" + encodeURIComponent(name),
                            { method: "POST", headers: { "Content-Type": "application/octet-stream" },
                              body: frame.bytes.buffer || frame.bytes });
      sendError = r.ok ? "" : "Studio answered " + r.status;
      $("info").textContent = r.ok ? "Showing “" + name + "” in Studio." : sendError;
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
  () => schedule());

// A safety net for changes that send no notice: look every second.
setInterval(() => {
  const doc = app.activeDocument;
  if (doc && connected && enabled() && docKey(doc) !== lastKey) schedule(0);
}, 1000);

$("send").addEventListener("change", () => { lastKey = ""; schedule(0); });
setInterval(ping, 2000);
ping();
