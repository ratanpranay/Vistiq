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
    return { kind: kind, side: side };
  }
  // left <-> right, when the reading was mirrored
  function mirror(s) { return s.replace(/left|right/, function (w) { return w === "left" ? "right" : "left"; }); }
  function heightName() { return T.pitch >= 55 ? "high above" : T.pitch >= 15 ? "from above" : T.pitch <= -12 ? "low" : "eye level"; }
  function viewName(side) { return side ? (T.kind === "interior" ? CABIN[side] : NAME[side]) : ""; }
  function moved() { return Math.abs(T.yaw) >= 10 || Math.abs(T.pitch) >= 8 || Math.abs(T.dist) >= 0.25 || T.lens !== "normal"; }

  function build(el) {
    root = el;
    el.innerHTML =
      '<div class="t-main"><div class="t-stage" id="t-stage"><div class="t-card" id="t-card"><img id="t-img" alt="" draggable="false"><img class="t-dev" id="t-dev" alt="" draggable="false" hidden></div>' +
      '<img class="t-res" id="t-res" alt="" draggable="false" hidden>' +
      '<div class="t-tag" id="t-tag" hidden></div>' +
      '<div class="s-pring t-pring" id="t-ring" hidden><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" class="bg"/><circle cx="24" cy="24" r="20" class="fg"/></svg><b></b></div>' +
      '<div class="s-busy t-busy" id="t-prog" hidden><span></span><i><b></b></i></div>' +
      '<div class="t-orbit" id="t-orbit"><i></i></div><div class="t-tip" id="t-tip">Drag to turn the camera · scroll to move closer</div>' +
      '<div class="t-empty" id="t-empty">Open a picture from the board, or press 3D in Create</div></div>' +
      '<div class="t-strip" id="t-strip"></div></div>' +
      '<aside class="s-rail t-rail"><div class="s-rh"><h3>3D views</h3></div>' +
      '<div><div class="s-label">Working on</div><div class="s-work" id="t-work"></div><p class="s-hint t-seenrow"><span id="t-seen"></span><button type="button" class="t-swap" id="t-swap" title="The picture shows the other side: swap left and right" hidden>Wrong side? Swap</button></p></div>' +
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
    root.querySelector("#t-seen").textContent = !has ? "" : T.reading ? "Reading which side we see…" :
      T.base ? "Seen from: " + viewName(T.base).toLowerCase() + " (" + (T.kind || "picture") + ")" : "";
    var sw = root.querySelector("#t-swap"); sw.hidden = !T.base || T.reading || !/left|right/.test(T.base);
    // The preview: the picture turns with the camera.
    var c = root.querySelector("#t-card"), s = 1 - T.dist * 0.18;
    // camera above: the top edge comes nearer (wider); below: the bottom edge does
    c.style.transform = busy ? "none" : "rotateY(" + (-T.yaw * 0.45) + "deg) rotateX(" + (-T.pitch * 0.45) + "deg) scale(" + s + ")";
    c.classList.toggle("t-loading", busy);
    var dv = root.querySelector("#t-dev"), pv = busy && p.preview;
    dv.hidden = !pv; if (pv) { if (dv.getAttribute("src") !== p.preview) dv.src = p.preview; dv.style.opacity = Math.min(1, 0.35 + 0.13 * (p.previewN || 1)); }
    if (busy) c.style.setProperty("--blur", Math.max(2, 18 - 2.5 * (p.previewN || 0)) + "px");
    var o = root.querySelector("#t-orbit i");
    o.style.left = (50 + T.yaw / 180 * 46) + "%"; o.style.top = (50 - T.pitch / 75 * 46) + "%";
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
    root.querySelector("#t-will").innerHTML = tg && moved() ? "Will show: <b>" + esc(viewName(tg)) + "</b>, " + heightName() : "";
    var go = root.querySelector("#t-go");
    go.disabled = !has || !moved() || busy || !!p.job && !T.running;
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

  function wire() {
    var st = root.querySelector("#t-stage");
    st.addEventListener("pointerdown", function (e) {
      if (!T.src || e.target.closest("button")) return;
      var ri = root.querySelector("#t-res");
      if (!ri.hidden) {                       // a view: hold to see the original, as in Create
        hold = ri.getAttribute("src"); ri.src = T.src.preview; st.classList.add("hold");
        root.querySelector("#t-tag").textContent = "Original"; return;
      }
      if (T.running) return;
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
      if (a && T.base) { T.yaw = norm(SIDES.indexOf(T.base) * 45 - SIDES.indexOf(a.getAttribute("data-a")) * 45); T.sel = -1; render(); }
      else if (h) { T.pitch = HEIGHTS.filter(function (q) { return q[0] === h.getAttribute("data-h"); })[0][2]; T.sel = -1; render(); }
      else if (l) { T.lens = l.getAttribute("data-l"); render(); }
      else if (r) { var k = +r.getAttribute("data-r"); T.sel = k === T.sel ? -1 : k; render(); }   // again: back to your picture
      else if (x) act(x.getAttribute("data-x"));
      else if (e.target.closest("#t-swap")) { var tg = target(); T.base = mirror(T.base); if (tg) T.yaw = norm(SIDES.indexOf(T.base) * 45 - SIDES.indexOf(tg) * 45); render(); }
      else if (e.target.closest("#t-reset")) { T.yaw = 0; T.pitch = 0; T.dist = 0; T.lens = "normal"; T.sel = -1; render(); }
      else if (e.target.closest("#t-go")) go();
    });
    root.addEventListener("input", function (e) {
      if (e.target.id === "t-yaw") T.yaw = +e.target.value;
      else if (e.target.id === "t-pitch") T.pitch = +e.target.value;
      else if (e.target.id === "t-dist") T.dist = +e.target.value;
      else if (e.target.id === "t-text") { T.text = e.target.value; return; }
      T.sel = -1; render();
    });
  }

  function act(x) {
    var V = VS(), r = T.results[T.sel]; if (!r) return;
    if (x === "layer") {           // a layer over the picture (in Create's layers, as there)
      V.api().studio_image(r.path).then(function (info) {
        if (!info || !window.VSSketch) return;
        V.setImage(V.S.create, "src", T.src);
        window.VSSketch.addImageLayer(V.S.create.src, info.preview, V.short(r.name || ""));
        V.toast("Added as a layer over your picture (Create › Layers)");
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
    T.running = true; T.wantLabel = viewName(target()) + (heightName() === "eye level" ? "" : ", " + heightName());
    V.job("c", { view: { yaw: T.yaw, pitch: T.pitch, dist: T.dist, lens: T.lens, target: target() }, text: T.text, preset: "",
                 refs: [], mask: null, variations: 1, instant: false });
    render();
  }

  // A result of a 3D render: into this page's strip and onto the board, next to its picture.
  function onResult(res) {
    if (!res || !res.meta || !res.meta.view) return false;
    var r = Object.assign({}, res, { label: T.wantLabel || viewName(res.meta.view.target) });
    T.results.push(r); T.sel = T.results.length - 1;
    if (window.VSBoard && T.src) window.VSBoard.addBeside(r, T.src);
    render();
    return true;
  }

  function open(info) {
    if (!info) return;
    T.src = info; T.yaw = 0; T.pitch = 0; T.dist = 0; T.lens = "normal"; T.sel = -1; T.results = []; T.base = null; T.kind = ""; T.view = "res";
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
        T.results.push({ path: r.path, name: r.name, w: r.w, h: r.h, preview: r.thumb, meta: r.meta, made: r.made, label: viewName(r.meta.view.target) });
      });
      render();
    });
  }

  window.VS3D = { build: build, render: render, open: open, onResult: onResult, _state: function () { return T; } };
})();
