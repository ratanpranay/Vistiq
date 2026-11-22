/* Vistiq Studio — 3D: see your design from another camera.
   The picture reader first tells which side the picture shows; pick a view (or drag),
   and "Render this view" draws the same design from there, right here: results stay
   on this page (compare with the original), and go on the board next to the picture. */
(function () {
  "use strict";
  var SIDES = ["front", "front-right", "right", "rear-right", "rear", "rear-left", "left", "front-left"];
  var NAME = { "front": "Front", "front-right": "Front ¾ right", "right": "Right side", "rear-right": "Rear ¾ right",
               "rear": "Rear", "rear-left": "Rear ¾ left", "left": "Left side", "front-left": "Front ¾ left" };
  var CABIN = { "front": "From the windscreen", "front-right": "Passenger front corner", "right": "Passenger door", "rear-right": "Behind passenger",
                "rear": "From the rear seat", "rear-left": "Behind driver", "left": "Driver's door", "front-left": "Driver's front corner" };
  var ANGLES = ["front-left", "front", "front-right", "left", "right", "rear-left", "rear", "rear-right"];
  var HEIGHTS = [["eye", "Eye level", 0], ["high", "From above", 25], ["low", "Low", -20]];
  var T = { yaw: 0, pitch: 0, dist: 0, lens: "normal", src: null, text: "", base: null, kind: "", reading: false,
            results: [], sel: -1, cmp: false }, root, drag = null, hold = null;
  function VS() { return window.VS; }
  function esc(t) { return VS().esc(t); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function norm(a) { a = ((a % 360) + 540) % 360 - 180; return a; }
  function target() {
    if (!T.base) return null;
    if (inCab()) return SIDES[((Math.round(azOf(T.cam) / 45) % 8) + 8) % 8];
    var az = ((SIDES.indexOf(T.base) * 45 - T.yaw) % 360 + 360) % 360;
    return SIDES[Math.round(az / 45) % 8];
  }
  // Same as studio.parse_view: outside a cabin, the side follows from where the nose points.
  function parseView(text) {
    var t = text.toLowerCase(), m = t.match(/side\s*=\s*([a-z-]+)/), n = t.match(/nose\s*=\s*([a-z]+)/), e = t.match(/end\s*=\s*([a-z]+)/);
    var kind = /interior/.test(t) ? "interior" : /product/.test(t) ? "product" : "exterior";
    var side = m && SIDES.indexOf(m[1]) >= 0 ? m[1] : "front-left";
    if (kind !== "interior" && n) {
      n = n[1]; e = e && e[1];
      if (n === "toward") side = "front"; else if (n === "away") side = "rear";
      else if (n === "left" || n === "right") side = e === "front" || e === "rear" ? e + "-" + n : n;
    }
    if (kind === "interior" && side === "front") side = "rear";     // as studio.parse_view
    return { kind: kind, side: side };
  }
  // The card turns with the camera, but never edge-on: past a side it shows its back (mirrored),
  // as the far side of the design would face you.
  function cardTurn(f) { var a = Math.abs(f), g = a <= 90 ? a * 0.6 : 180 - (180 - a) * 0.6; return (f < 0 ? -1 : 1) * g; }
  function heightName() { return T.pitch >= 55 ? "high above" : T.pitch >= 15 ? "from above" : T.pitch <= -12 ? "low" : "eye level"; }
  function viewName(side) { return side ? (T.kind === "interior" ? CABIN[side] : NAME[side]) : ""; }
  function moved() { return (T.kind === "interior" && T.cam && T.base && (function () { var b = camOf(SIDES.indexOf(T.base) * 45); return Math.hypot(T.cam.x - b.x, T.cam.y - b.y) > 6 || Math.abs(norm(T.cam.look - b.look)) > 10; })()) || Math.abs(T.yaw) >= 10 || Math.abs(T.pitch) >= 8 || Math.abs(T.dist) >= 0.25 || T.lens !== "normal"; }

  function build(el) {
    root = el;
    el.innerHTML =
      '<div class="t-main"><div class="t-stage" id="t-stage"><div class="t-card" id="t-card"><img id="t-img" alt="" draggable="false"><img class="t-dev" id="t-dev" alt="" draggable="false" hidden></div>' +
      '<img class="t-res" id="t-res" alt="" draggable="false" hidden>' +
      '<div class="t-tag" id="t-tag" hidden></div>' +
      '<div class="s-pring t-pring" id="t-ring" hidden><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" class="bg"/><circle cx="24" cy="24" r="20" class="fg"/></svg><b></b></div>' +
      '<div class="s-busy t-busy" id="t-prog" hidden><span></span><i><b></b></i></div>' +
      '<div class="t-orbit t-plan" id="t-orbit" title="Drag the dot to place the camera (seen from above, front at the top)"><div class="t-ph" id="t-ph"></div><div class="t-pload" id="t-pload" hidden><i></i>Loading view navigator…</div><canvas id="t-plan" width="340" height="440"></canvas></div>' +
      '<div class="t-tip" id="t-tip">Drag the picture or the dot to turn the camera · scroll to move closer</div>' +
      '<div class="t-empty" id="t-empty">Open a picture from the board, or press 3D in Create</div></div>' +
      '<div class="t-strip" id="t-strip"></div></div>' +
      '<aside class="s-rail t-rail"><div class="s-rh"><h3>3D views</h3></div>' +
      '<div><div class="s-label">Working on</div><div class="s-work" id="t-work"></div><p class="s-hint" id="t-seen"></p></div>' +
      '<div><div class="s-label">Show it from</div><div class="t-angles" id="t-angles"></div>' +
      '<div class="t-heights">' + HEIGHTS.map(function (h) { return '<button type="button" data-h="' + h[0] + '">' + h[1] + "</button>"; }).join("") + "</div></div>" +
      '<div><div class="s-label">Or fine-tune</div>' +
      '<div class="t-sl"><span>Turn</span><input type="range" id="t-yaw" min="-180" max="180" step="1"><em id="t-yaw-v"></em></div>' +
      '<div class="t-sl"><span>Height</span><input type="range" id="t-pitch" min="-30" max="75" step="1"><em id="t-pitch-v"></em></div>' +
      '<div class="t-sl"><span>Distance</span><input type="range" id="t-dist" min="-1" max="1" step="0.05"><em id="t-dist-v"></em></div>' +
      '<div class="t-lens"><span>Lens</span><button type="button" data-l="wide">Wide</button><button type="button" data-l="normal">Normal</button><button type="button" data-l="tele">Tele</button></div></div>' +
      '<div><div class="s-label">Anything else <em class="s-opt">optional</em></div><textarea id="t-text" rows="2" placeholder="e.g. evening light, doors open"></textarea></div>' +
      '<div class="s-acts3 t-acts" id="t-acts">' +
      '<button type="button" class="s-btn" data-x="layer" title="Add this view as a layer over your picture (Create › Layers)" disabled><svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg><span>Add as layer</span></button>' +
      '<button type="button" class="s-btn" data-x="create" title="Open this view in Create" disabled><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg><span>Open in Create</span></button>' +
      '<button type="button" class="s-btn" data-x="ps" title="Send this view to Photoshop as a new layer" disabled><span class="m-ico ps">Ps</span><span>Photoshop</span></button>' +
      '<button type="button" class="s-btn" data-x="up" title="Upscale this view" disabled><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg><span>Upscale</span></button></div>' +
      '<div class="t-go"><div class="t-will" id="t-will"></div><button type="button" class="s-go" id="t-go">Render this view</button><button type="button" class="s-btn t-reset" id="t-reset">Reset</button>' +
      '<p class="s-hint" id="t-hint"></p></div></aside>';
    wire();
    setInterval(tick, 600);
    render();
  }

  var lastJob = null;
  function tick() {                         // progress of a render started here
    var p = VS() && VS().S.create;
    if (!root || !p) return;
    var busy = !!(p.job && T.running);
    if (busy || lastJob !== busy) { lastJob = busy; if (!busy) T.running = false; render(); }
  }

  function render() {
    if (!root) return;
    var V = VS(), p = V.S.create, has = !!(T.src && T.src.preview), res = T.sel >= 0 ? T.results[T.sel] : null;
    var busy = !!(p.job && T.running);
    if (busy) res = null;
    var showRes = !!res;
    root.querySelector("#t-empty").hidden = has;
    var img = root.querySelector("#t-img");
    if (has && img.getAttribute("src") !== T.src.preview) img.src = T.src.preview;
    root.querySelector("#t-card").hidden = !has || showRes;
    var ri = root.querySelector("#t-res");
    ri.hidden = !showRes; if (res && ri.getAttribute("src") !== (res.preview || "")) ri.src = res.preview || "";
    var tag = root.querySelector("#t-tag"); tag.hidden = !res;
    if (res) tag.textContent = (res.label || "New view") + " · hold to see the original";
    root.querySelector("#t-orbit").hidden = showRes || busy; root.querySelector("#t-tip").hidden = showRes || !has || busy;
    root.querySelector("#t-work").innerHTML = has ? '<img src="' + T.src.preview + '" alt=""><div><b>' + esc(V.short(T.src.name || "")) + "</b><small>" + (T.src.w || "") + " × " + (T.src.h || "") + "</small></div>" : "<small>Nothing yet</small>";
    var rd = has && T.reading;
    root.querySelector("#t-pload").hidden = !rd; root.querySelector("#t-plan").style.visibility = rd ? "hidden" : "";
    root.classList.toggle("t-reading", rd);
    root.querySelector("#t-seen").textContent = !has ? "" : T.reading ? "Loading view navigator…" :
      T.base ? "Your picture: " + viewName(T.base).toLowerCase() + " (the grey ring on the plan; drag it if that's wrong)" : "";
    // The picture stays flat and still; the camera plan beside it shows the new view (Nov 2026).
    var c = root.querySelector("#t-card");
    c.style.transform = "none";
    c.classList.toggle("t-loading", busy);
    var dv = root.querySelector("#t-dev"), pv = busy && p.preview;
    dv.hidden = !pv; if (pv) { if (dv.getAttribute("src") !== p.preview) dv.src = p.preview; dv.style.opacity = Math.min(1, 0.35 + 0.13 * (p.previewN || 1)); }
    if (busy) c.style.setProperty("--blur", Math.max(2, 18 - 2.5 * (p.previewN || 0)) + "px");
    drawPlan();
    root.querySelector("#t-yaw").value = T.yaw; root.querySelector("#t-pitch").value = T.pitch; root.querySelector("#t-dist").value = T.dist;
    root.querySelector("#t-yaw-v").textContent = Math.round(T.yaw) === 0 ? "—" : Math.abs(Math.round(T.yaw)) + "°";
    root.querySelector("#t-pitch-v").textContent = heightName();
    root.querySelector("#t-dist-v").textContent = T.dist === 0 ? "—" : (T.dist < 0 ? "closer" : "further");
    root.querySelectorAll(".t-lens button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-l") === T.lens); });
    var tg = target();
    var ah = ANGLES.map(function (a) {
      return '<button type="button" data-a="' + a + '" class="' + (tg === a ? "on" : "") + (T.base === a ? " now" : "") + '"' + (T.base ? "" : " disabled") + ">" +
        esc(viewName(a) || NAME[a]) + "</button>"; }).join("");
    var ae = root.querySelector("#t-angles"); if (ae.getAttribute("data-k") !== ah) { ae.innerHTML = ah; ae.setAttribute("data-k", ah); }
    root.querySelectorAll(".t-heights button").forEach(function (b) { var h = HEIGHTS.filter(function (x) { return x[0] === b.getAttribute("data-h"); })[0]; b.classList.toggle("on", T.pitch === h[2]); });
    root.querySelector("#t-will").innerHTML = tg && moved() ? "Will show: <b>" + esc(inCab() ? cabinLabel(T.cam) : viewName(tg)) + "</b>, " + heightName() : "";
    var go = root.querySelector("#t-go");
    go.disabled = !has || T.reading || !moved() || busy || !!p.job && !T.running;
    go.textContent = busy ? (p.stage || "Working") + (p.frac ? " · " + Math.round(p.frac * 100) + "%" : "") : "Render this view";
    root.querySelector("#t-hint").textContent = busy ? "" : !moved() ? "Pick a view or drag the picture." : "Same design, new camera. About 2 minutes.";
    var pr = root.querySelector("#t-prog"), rg = root.querySelector("#t-ring"), fr = Math.max(0.02, p.frac || 0);
    pr.hidden = rg.hidden = !busy;
    if (busy) {
      pr.querySelector("span").textContent = (V.S.engine && V.S.engine.state === "starting" ? V.S.engine.message : p.stage) || "Working";
      pr.querySelector("b").style.width = Math.round((p.frac || 0) * 100) + "%";
      rg.querySelector(".fg").style.strokeDashoffset = String(125.7 * (1 - fr)); rg.querySelector("b").textContent = Math.round(fr * 100) + "%";
    }
    root.querySelectorAll("#t-acts [data-x]").forEach(function (b) { b.disabled = !res; });
    var sh = T.results.map(function (r, i) { return '<button type="button" data-r="' + i + '" class="' + (i === T.sel ? "on" : "") + '"><img src="' + (r.preview || "") + '" alt=""><small>' + esc(r.label || "") + "</small></button>"; }).join("");
    sh = has ? '<button type="button" data-r="-1" class="t-orig' + (T.sel < 0 ? " on" : "") + '"><img src="' + T.src.preview + '" alt=""><small>Original</small></button>' + (sh ? '<span class="t-gap"></span>' + sh : "") : "";
    var st = root.querySelector("#t-strip"); if (st.getAttribute("data-k") !== sh) { st.innerHTML = sh; st.setAttribute("data-k", sh); }
  }

  // The plan: the design (or the cabin) seen from above, front at the top. The dot is the camera,
  // the cone where it looks, the grey ring where your picture was taken. Outside, the camera goes
  // around the design and looks at it. Inside, drag the dot anywhere in the cabin and turn the cone
  // with its handle.
  var PL = { w: 170, h: 220, cx: 85, cy: 122 }, CAB = { x: 38, y: 82 };
  function ring() { return T.kind === "interior" ? { rx: 30, ry: 62 } : { rx: 68, ry: 86 }; }
  function camAz() { return (T.base ? SIDES.indexOf(T.base) * 45 : 315) - T.yaw; }
  function onRing(az) { var a = az * Math.PI / 180, R = ring(); return { x: R.rx * Math.sin(a), y: -R.ry * Math.cos(a) }; }
  function lookAt(p, q) { return Math.atan2(q.x - p.x, -(q.y - p.y)) * 180 / Math.PI; }     // 0 = toward the front, clockwise
  function camOf(az) { var p = onRing(az); p.look = lookAt(p, { x: 0, y: 0 }); return p; }
  function cam() { return T.kind === "interior" && T.cam ? T.cam : camOf(camAz()); }
  function inCab() { return T.kind === "interior" && !!T.cam; }
  // Where the camera stands in the cabin, and where it looks: short (labels) and in words (the model).
  var LOOKS = ["forward", "to the front right", "to the passenger door", "to the rear right", "backward", "to the rear left", "to the driver's door", "to the front left"];
  function cabinLabel(c) {
    var v = c.y / CAB.y, u = c.x / CAB.x;
    var row = v < -0.5 ? "Dashboard" : v < 0.1 ? "Front row" : v < 0.5 ? "Behind the front seats" : "Rear seats";
    var side = u < -0.35 ? "driver side" : u > 0.35 ? "passenger side" : "middle";
    return row + ", " + side + " · looking " + LOOKS[((Math.round(c.look / 45) % 8) + 8) % 8];
  }
  function drawPlan() {
    var cv = root.querySelector("#t-plan"); if (!cv) return;
    var g = cv.getContext("2d"), k = cv.width / PL.w, inT = T.kind === "interior", cx = PL.cx, cy = PL.cy;
    root.querySelector("#t-ph").textContent = (inT ? "Cabin" : "Camera") + " · from above";
    g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, PL.w, PL.h);
    function rr(x, y, w, h, r, f, st) { g.beginPath(); g.roundRect(x, y, w, h, r); if (f) { g.fillStyle = f; g.fill(); } if (st) { g.strokeStyle = st; g.lineWidth = 1.5; g.stroke(); } }
    g.font = "700 9px sans-serif"; g.fillStyle = "#8a90a2"; g.textAlign = "center";
    if (inT) {
      rr(cx - 46, cy - 92, 92, 184, 28, "#f3f4f8", "#9aa1b2");
      rr(cx - 36, cy - 80, 72, 22, 8, "#dcdfe7");                                   // dashboard
      rr(cx - 34, cy - 40, 28, 36, 6, "#e7e2d9"); rr(cx + 6, cy - 40, 28, 36, 6, "#e7e2d9");   // front seats
      rr(cx - 34, cy + 40, 68, 30, 6, "#e7e2d9");                                   // rear bench
      g.fillText("front", cx, cy - 98);
    } else {
      rr(cx - 26, cy - 50, 52, 100, 18, "#e9ebf0", "#9aa1b2");                       // the design
      rr(cx - 19, cy - 22, 38, 40, 8, "#cfd3dc");                                   // glasshouse
      g.fillText("front", cx, cy - 56);
    }
    if (!T.base) return;
    var b = camOf(SIDES.indexOf(T.base) * 45), c = cam(), la = (c.look - 90) * Math.PI / 180, half = inT ? 0.55 : 0.38, len = inT ? 110 : 70;
    g.save(); g.beginPath(); g.rect(0, 0, PL.w, PL.h); g.clip();
    g.fillStyle = "rgba(109,93,245,.18)"; g.beginPath(); g.moveTo(cx + c.x, cy + c.y); g.arc(cx + c.x, cy + c.y, len, la - half, la + half); g.closePath(); g.fill(); g.restore();
    g.beginPath(); g.arc(cx + b.x, cy + b.y, 5.5, 0, 7); g.fillStyle = "#fff"; g.fill(); g.strokeStyle = "#9aa1b2"; g.lineWidth = 2; g.stroke();
    if (inT) {                                                                  // the handle that turns the cone
      var h = handle(c); g.strokeStyle = "#6d5df5"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + c.x, cy + c.y); g.lineTo(cx + h.x, cy + h.y); g.stroke();
      g.beginPath(); g.arc(cx + h.x, cy + h.y, 5, 0, 7); g.fillStyle = "#fff"; g.fill(); g.stroke();
    }
    g.beginPath(); g.arc(cx + c.x, cy + c.y, 7, 0, 7); g.fillStyle = "#6d5df5"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
  }
  function handle(c) { var a = c.look * Math.PI / 180; return { x: c.x + 30 * Math.sin(a), y: c.y - 30 * Math.cos(a) }; }
  var pmode = null, raf = 0;
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }
  function planPoint(e) { var r = root.querySelector("#t-plan").getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * PL.w - PL.cx, y: (e.clientY - r.top) / r.height * PL.h - PL.cy }; }
  function azOf(q) { var R = ring(); return Math.atan2(q.x / R.rx, -q.y / R.ry) * 180 / Math.PI; }
  function planDown(e) {
    var q = planPoint(e), c = cam(), d = function (p) { return Math.hypot(p.x - q.x, p.y - q.y); }, b = camOf(SIDES.indexOf(T.base) * 45);
    pmode = T.kind === "interior" && d(handle(c)) < 11 ? "look" : d(c) < 11 ? "move" : d(b) < 9 ? "base" : "move";
    planMove(e);
  }
  function planMove(e) {
    var q = planPoint(e), c = cam();
    if (pmode === "look") { T.cam = { x: c.x, y: c.y, look: Math.round(lookAt(c, q)) }; }
    else if (pmode === "base") {                     // your picture was read wrong: put the ring where it was taken
      var tg = target(), nb = SIDES[((Math.round(azOf(q) / 45) % 8) + 8) % 8];
      if (nb !== T.base) { T.base = nb; if (tg && !inCab()) T.yaw = norm(SIDES.indexOf(T.base) * 45 - SIDES.indexOf(tg) * 45); }
    }
    else if (T.kind === "interior") { T.cam = { x: clamp(q.x, -CAB.x, CAB.x), y: clamp(q.y, -CAB.y, CAB.y), look: c.look }; }
    else {
      var az = azOf(q), snap = Math.round(az / 45) * 45; if (Math.abs(az - snap) < 5) az = snap;   // named views: a gentle snap
      T.yaw = norm(Math.round((T.base ? SIDES.indexOf(T.base) * 45 : 315) - az));
    }
    T.sel = -1; later();
  }

  function wire() {
    var pl = root.querySelector("#t-plan"), pd = false;
    pl.addEventListener("pointerdown", function (e) { if (!T.base || T.running || T.reading) return; e.stopPropagation(); e.preventDefault(); pd = true; pl.setPointerCapture(e.pointerId); planDown(e); });
    pl.addEventListener("pointermove", function (e) { if (pd) planMove(e); });
    pl.addEventListener("pointerup", function () { pd = false; pmode = null; });
    pl.addEventListener("pointercancel", function () { pd = false; pmode = null; });
    var st = root.querySelector("#t-stage");
    st.addEventListener("pointerdown", function (e) {
      if (!T.src || e.target.closest("button")) return;
      var ri = root.querySelector("#t-res");
      if (!ri.hidden) {                       // a view: hold to see the original, as in Create
        hold = ri.getAttribute("src"); ri.src = T.src.preview; st.classList.add("hold");
        root.querySelector("#t-tag").textContent = "Original"; return;
      }
      if (T.running || T.reading) return;
      drag = { x: e.clientX, y: e.clientY, yaw: T.yaw, pitch: T.pitch }; st.setPointerCapture(e.pointerId); st.classList.add("grab");
    });
    st.addEventListener("pointermove", function (e) {
      if (!drag || T.running) return;
      T.yaw = clamp(Math.round(drag.yaw + (e.clientX - drag.x) * 0.35), -180, 180);
      T.pitch = clamp(Math.round(drag.pitch - (e.clientY - drag.y) * 0.25), -30, 75);
      render();
    });
    function up() {
      drag = null; st.classList.remove("grab");
      if (hold != null) { root.querySelector("#t-res").src = hold; hold = null; st.classList.remove("hold"); render(); }
    }
    st.addEventListener("pointerup", up); st.addEventListener("pointerleave", up); st.addEventListener("pointercancel", up);
    st.addEventListener("wheel", function (e) { if (!T.src) return; e.preventDefault(); T.dist = clamp(Math.round((T.dist + e.deltaY * 0.001) * 20) / 20, -1, 1); render(); }, { passive: false });
    root.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]"), l = e.target.closest("[data-l]"), h = e.target.closest("[data-h]"), r = e.target.closest("[data-r]"),
          x = e.target.closest("[data-x]");
      if (a && T.base) { T.cam = null; T.yaw = norm(SIDES.indexOf(T.base) * 45 - SIDES.indexOf(a.getAttribute("data-a")) * 45); T.sel = -1; render(); }
      else if (h) { T.pitch = HEIGHTS.filter(function (q) { return q[0] === h.getAttribute("data-h"); })[0][2]; T.sel = -1; render(); }
      else if (l) { T.lens = l.getAttribute("data-l"); render(); }
      else if (r) { var k = +r.getAttribute("data-r"); T.sel = k === T.sel ? -1 : k; full(T.results[T.sel]); render(); }   // again: back to your picture
      else if (x) act(x.getAttribute("data-x"));
      else if (e.target.closest("#t-reset")) { T.cam = null; T.yaw = 0; T.pitch = 0; T.dist = 0; T.lens = "normal"; T.sel = -1; render(); }
      else if (e.target.closest("#t-go")) go();
    });
    root.addEventListener("input", function (e) {
      if (e.target.id === "t-yaw") { T.yaw = +e.target.value; T.cam = null; }
      else if (e.target.id === "t-pitch") T.pitch = +e.target.value;
      else if (e.target.id === "t-dist") T.dist = +e.target.value;
      else if (e.target.id === "t-text") { T.text = e.target.value; return; }
      T.sel = -1; render();
    });
  }

  function act(x) {
    var V = VS(), r = T.results[T.sel]; if (!r) return;
    if (x === "layer") {
      // Back into the same program: a Live picture's app (Photoshop) gets it as a layer;
      // a picture from Create gets it as a layer there, on that picture.
      var o = T.origin;
      if (o && o.app) { V.api().studio_send(r.path, o.app).then(function (res) { V.toast(res && res.ok ? (res.how === "layer" ? "Added as a layer in " + (o.app === "affinity" ? "Affinity" : "Photoshop") : "Opened in Photoshop") : (res && res.error) || "Couldn't send it."); }); return; }
      var to = o && o.src || T.src;
      V.api().studio_image(r.path).then(function (info) {
        if (!info || !window.VSSketch) return;
        if (V.S.create.src !== to) V.setImage(V.S.create, "src", to);
        window.VSSketch.addImageLayer(to, info.preview, V.short(r.label || r.name || "3D view"));
        V.toast("Added as a layer on your picture in Create");
      });
    }
    else if (x === "ps") V.sendPS(r.path);
    else if (x === "up") V.api().studio_to_upscale(r.path).then(function () { V.go("upscale"); });
    else if (x === "create") V.api().studio_image(r.path).then(function (info) { if (info) { V.setImage(V.S.create, "src", info); V.go("create"); } });
  }

  function go() {
    // Rendered by the image model here; Create's picture is set to this one so the run is the same as there.
    var V = VS(), p = V.S.create;
    if (p.job) { V.toast("Studio is still working on something"); return; }
    V.setImage(p, "src", T.src);
    T.running = true; T.wantLabel = (inCab() ? cabinLabel(T.cam) : viewName(target())) + (heightName() === "eye level" ? "" : ", " + heightName());
    V.job("c", { view: { yaw: T.yaw, pitch: T.pitch, dist: T.dist, lens: T.lens, target: target(),
                       cabin: inCab() ? { u: T.cam.x / CAB.x, v: T.cam.y / CAB.y, look: T.cam.look } : null }, text: T.text, preset: "",
                 refs: [], mask: null, variations: 1, instant: false });
    render();
  }

  // A result of a 3D render: into this page's strip and onto the board, next to its picture.
  // Views made earlier come with a thumbnail only: load the picture itself when one is shown.
  function full(r) {
    if (!r || !r.thumbOnly || r.loading) return;
    r.loading = true;
    VS().api().studio_image(r.path).then(function (info) { r.loading = false; if (info && info.preview) { r.preview = info.preview; r.thumbOnly = false; render(); } });
  }

  function onResult(res) {
    if (!res || !res.meta || !res.meta.view) return false;
    var r = Object.assign({}, res, { label: T.wantLabel || viewName(res.meta.view.target) });
    T.results.push(r); T.sel = T.results.length - 1;
    // (not on the board: views stay with their picture here; Add as layer puts one in its layers)
    render();
    return true;
  }

  // The 3D views button: take Create's current file (flattened), unless it's the one here already.
  function fromCreate() {
    var V = VS(); if (T.running || !V.currentFile || !V.S.create.src && !(V.S.create.sel >= 0)) return;
    V.currentFile(function (info, origin) { if (info && !(T.origin && origin && T.origin.key === origin.key && T.src)) open(info, origin); });
  }

  function open(info, origin) {
    if (!info) return;
    T.origin = origin || null;
    T.src = info; T.cam = null; T.yaw = 0; T.pitch = 0; T.dist = 0; T.lens = "normal"; T.sel = -1; T.results = []; T.base = null; T.kind = ""; T.view = "res";
    VS().go("3d"); render();
    var a = VS().api();
    // Which side the picture shows (the picture reader, a few seconds).
    if (a && a.studio_describe) {
      T.reading = true; render();
      a.studio_describe(info.path, "view").then(function (res) {
        T.reading = false;
        var r = parseView(res && res.text || ""); T.base = r.side; T.kind = r.kind;
        render();
      });
    } else { T.base = "front-left"; T.kind = "exterior"; }
    // Views made before from this picture.
    if (a && a.studio_results_for) a.studio_results_for(info.name || "").then(function (list) {
      if (T.src !== info || !list) return;
      list.forEach(function (r) {
        if (!r.meta || !r.meta.view || T.results.some(function (x) { return x.path === r.path; })) return;
        T.results.push({ path: r.path, name: r.name, w: r.w, h: r.h, preview: r.thumb, thumbOnly: true, meta: r.meta, made: r.made, label: viewName(r.meta.view.target) });
      });
      render();
    });
  }

  window.VS3D = { fromCreate: fromCreate, build: build, render: render, open: open, onResult: onResult, _state: function () { return T; } };
})();
