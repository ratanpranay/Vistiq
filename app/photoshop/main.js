// Vistiq Studio link: after every change in Photoshop, the active document's
// visible canvas is sent to Vistiq Studio on this PC (nothing leaves the PC).
const { action, core, imaging, app } = require("photoshop");

const STUDIO = "http://127.0.0.1:38393";
const MAX_SIDE = 2048;
const VERSION = "1.0.3";
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
    let have = "";
    try { have = (await r.json()).have || ""; } catch (e) {}
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
setInterval(ping, 1000);
ping();
