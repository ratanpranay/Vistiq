// Vistiq Studio link: after every change in Photoshop, the active document's
// visible canvas is sent to Vistiq Studio on this PC (nothing leaves the PC).
const { action, core, imaging, app } = require("photoshop");

const STUDIO = "http://127.0.0.1:8393";
const MAX_SIDE = 2048;

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
  } catch (e) {
    connected = false;
  }
  if (connected) show("Connected to Vistiq Studio", true);
  else show("Vistiq Studio isn't listening", false);
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
    let payload = null;
    await core.executeAsModal(async () => {
      const w = doc.width, h = doc.height;
      const opts = { documentID: doc.id };
      if (Math.max(w, h) > MAX_SIDE) opts.targetSize = w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE };
      const px = await imaging.getPixels(opts);
      const jpeg = await imaging.encodeImageData({ imageData: px.imageData, base64: true });
      payload = { name: doc.title || doc.name || "Photoshop", id: doc.id,
                  width: px.imageData.width, height: px.imageData.height, jpeg: jpeg };
      px.imageData.dispose();
    }, { commandName: "Vistiq Studio live view" });
    lastKey = docKey(doc);
    if (payload) {
      await fetch(STUDIO + "/frame", { method: "POST", headers: { "Content-Type": "application/json" },
                                       body: JSON.stringify(payload) });
      $("info").textContent = "Showing “" + payload.name + "” in Studio.";
    }
  } catch (e) {
    // Photoshop is busy (a dialog, a long filter): try again shortly.
    again = true;
  } finally {
    sending = false;
    if (again) { again = false; schedule(600); }
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
