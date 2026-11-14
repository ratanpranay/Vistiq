/* Vistiq Studio — sketching in Focus view.
   Every picture you open gets a stack of layers: the picture itself at the
   bottom, paint layers on top. Brushes really paint (colour, opacity, flow,
   smoothing, pen pressure); selections (lasso, rectangle, pen, object,
   Photoshop) only say which area Create may change. Create uses all visible
   layers flattened into one picture. A Live (Photoshop) picture is never
   painted on: the first stroke branches off a frozen copy as a new sketch. */
(function () {
  "use strict";
  function V() { return window.VS; }
  function load(k, d) { try { var v = localStorage.getItem("sk." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function keep(k, v) { try { localStorage.setItem("sk." + k, JSON.stringify(v)); } catch (e) {} }
  function uid() { return "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  var MAXRES = 1600;                                  // paint layers: up to this many pixels on the long side

  var T = {
    tool: load("tool", "brush"),
    brush: load("brush", "sketch"),                   // sketch | soft | hard
    eraser: load("eraser", "soft"),                   // soft | hard | magic
    sizes: load("sizes", { brush: 6, erase: 40, magic: 50 }),
    opacity: load("opacity", 1), flow: load("flow", 0.85), smooth: load("smooth", 0.35), pressure: load("pressure", true),
    color: load("color", "#14161f"), recents: load("recents", ["#14161f", "#ffffff", "#e8562a", "#6d5df5", "#2a9d8f", "#e9c46a"]),
    selTool: load("selTool", "lasso"), selMode: "new", flipH: false, flipV: false, folded: true
  };
  var docs = {}, doc = null, fit = null, view = null, catcher = null, ring = null, buf = null, magicBuf = null, stroke = null, tf = null;

  // -------------------------------------------------------------------- documents

  function keyOf(src) { return src ? (src.live ? "live" : src.path) : ""; }
  function get(src) {
    var k = keyOf(src);
    if (!docs[k]) {
      var f = Math.min(1, MAXRES / Math.max(src.w, src.h));
      docs[k] = { key: k, w: Math.max(1, Math.round(src.w * f)), h: Math.max(1, Math.round(src.h * f)), src: src,
                  base: { id: "base", kind: "base", name: src.live ? "Live · " + src.name : (src.name || "Picture"), visible: true, opacity: 1, blend: "normal" },
                  layers: [], active: null, hist: [], redo: [] };
      docs[k].layers.push(docs[k].base);
      addLayer(docs[k], "Layer 1", true);
      if (!src.live) restore(docs[k]);
    }
    var d = docs[k]; d.src = src;
    return d;
  }
  function addLayer(d, name, quiet) {
    var c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
    var L = { id: uid(), kind: "paint", name: name || "Layer " + d.layers.length, canvas: c, visible: true, opacity: 1, blend: "normal", locked: false };
    var at = d.active ? d.layers.indexOf(byId(d, d.active)) + 1 : d.layers.length;
    d.layers.splice(at, 0, L); d.active = L.id;
    if (!quiet) { d.hist.push({ t: "add", L: L, at: at }); d.redo = []; }
    return L;
  }
  function byId(d, id) { for (var i = 0; i < d.layers.length; i++) if (d.layers[i].id === id) return d.layers[i]; return null; }
  function active() { return doc && byId(doc, doc.active); }
  function hasPaint(L) {
    if (!L.canvas) return false;
    var x = L.canvas.getContext("2d").getImageData(0, 0, L.canvas.width, L.canvas.height).data;
    for (var i = 3; i < x.length; i += 4 * 13) if (x[i] > 3) return true;
    return false;
  }
  // Is there anything beyond the picture itself? Then Create gets the flattened layers.
  function edited(d) {
    d = d || doc; if (!d) return false;
    if (!d.base.visible || d.base.opacity < 1 || d.base.blend !== "normal") return true;
    return d.layers.some(function (L) { return L.kind !== "base" && L.visible && L.opacity > 0 && hasPaint(L); });
  }

  // -------------------------------------------------------------------- mounting in the view

  function mount(viewEl, fitEl, src) {
    view = viewEl; fit = fitEl; doc = get(src);
    fit.classList.add("sk-fit");
    var base = fit.querySelector("img"); base.classList.add("sk-base");
    doc.layers.forEach(function (L) { if (L.canvas) { L.canvas.className = "sk-layer"; fit.appendChild(L.canvas); } });
    buf = buf || document.createElement("canvas"); buf.className = "sk-buf";
    magicBuf = magicBuf || document.createElement("canvas"); magicBuf.className = "sk-magic";
    fit.appendChild(buf); fit.appendChild(magicBuf);
    order();
    catcher = document.createElement("div"); catcher.className = "sk-catch"; fit.appendChild(catcher); order();
    ring = ring || document.createElement("div"); ring.className = "sk-ring"; ring.hidden = true; view.appendChild(ring);
    wireCatcher();
    view.insertAdjacentHTML("beforeend", toolbarHTML() + '<div class="sk-panel" id="sk-panel"></div>' + optsHTML());
    wireToolbar();
    panel();
    cursor();
  }
  // Stack order and looks of the layers (CSS does the blending on screen).
  function order() {
    if (!fit) return;
    var base = fit.querySelector(".sk-base"), z = 1;
    doc.layers.forEach(function (L) {
      var el = L.kind === "base" ? base : L.canvas;
      if (!el) return;
      el.style.zIndex = z++;
      el.style.opacity = L.visible ? L.opacity : 0;
      el.style.mixBlendMode = L.blend === "normal" ? "" : L.blend;
      if (L.id === doc.active) { buf.style.zIndex = z++; magicBuf.style.zIndex = z++; }
    });
    var top = z + 1;
    fit.querySelectorAll(".s-pathov").forEach(function (e) { e.style.zIndex = top + 1; });
    var sel = V().painter.canvas; if (sel) sel.style.zIndex = top;
    if (catcher) catcher.style.zIndex = top + 2;
    fit.style.background = doc.base.visible ? "" : "#fff";
    scheduleSave();
  }

  // -------------------------------------------------------------------- toolbar

  var I = {
    brush: '<path d="M4 20c2 0 4-1 4-3s2-3 3-3l7-7-3-3-7 7c0 1-1 3-3 3s-3 2-3 4z"/>',
    pencil: '<path d="M15 4l5 5L9 20H4v-5z"/>',
    soft: '<circle cx="12" cy="12" r="7" opacity=".35"/><circle cx="12" cy="12" r="4"/>', hard: '<circle cx="12" cy="12" r="7"/>',
    erase: '<path d="M7 20h10M5 15l9-9 5 5-9 9H6z"/>',
    magic: '<path d="M7 20h10M5 15l9-9 5 5-9 9H6z"/><path d="M18 2l.7 1.8 1.8.7-1.8.7L18 7l-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor"/>',
    pick: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
    lasso: '<path d="M7 18c-2.5-1-4-3-4-5.5C3 8 7.5 5 12 5s9 3 9 7-4 6.5-9 6.5c-1.4 0-2.7-.2-3.8-.6"/><path d="M8.5 17.5c0 2-1.5 3.5-3 3.5"/>',
    rect: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/>',
    pen: '<path d="M12 3l5 9-5 9-5-9z"/><path d="M12 12v9"/>',
    object: '<path d="M4 20L15 9M14 4v3M18 6l-2 2M20 10h-3M12 3l1 2"/>',
    tr: '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z"/>',
    hand: '<path d="M9 11V5a2 2 0 0 1 4 0v5M13 10V4a2 2 0 0 1 4 0v8M9 10a2 2 0 0 0-4 0v4a7 7 0 0 0 14 0v-2"/>',
    flip: '<path d="M12 3v18"/><path d="M9 7L4 12l5 5zM15 7l5 5-5 5z"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-2"/>', redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h2"/>',
    chev: '<path d="M6 9l6 6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5 9-10"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.3-1"/>',
    dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', deselect: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9l6 6M15 9l-6 6"/>',
    pressure: '<path d="M4 18c3-8 5-12 8-12s3 6 8 12"/>'
  };
  function ic(n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 17) + '" height="' + (s || 17) + '" aria-hidden="true">' + I[n] + "</svg>"; }
  var SEL = { lasso: ["Lasso", "L", "Snaps to edges · Alt: free hand"], rect: ["Rectangle", "M", ""], pen: ["Pen (curves)", "P", "Click: corner · drag: curve"],
              object: ["Object", "S", "Click a part, it selects itself"] };
  function isSel(t) { return !!SEL[t]; }
  function brushIcon() { return T.brush === "sketch" ? "pencil" : T.brush; }
  function eraseIcon() { return T.eraser === "magic" ? "magic" : "erase"; }

  function toolbarHTML() {
    var b = function (k, icon, title, dd) {
      var on = k === T.tool || (k === "sel" && isSel(T.tool));
      return '<button type="button" class="sk-b' + (on ? " on" : "") + '" data-k="' + k + '" title="' + title + '">' + ic(icon) + (dd ? '<span class="cv" data-dd="' + k + '">' + ic("chev", 11) + "</span>" : "") + "</button>";
    };
    return '<div class="sk-bar" id="sk-bar">' +
      '<button type="button" class="sk-b sk-plus" data-k="plus" title="Add: blank canvas, image, paste, phone">' + ic("plus") + "</button><i></i>" +
      b("hand", "hand", "Move the view (H, or hold Space)") + b("tr", "tr", "Transform the layer (T)") + "<i></i>" +
      b("brush", brushIcon(), "Brush (B)", true) + b("erase", eraseIcon(), "Eraser (E)", true) +
      '<button type="button" class="sk-sw" data-k="color" title="Colour" style="background:' + T.color + '"></button>' +
      b("pick", "pick", "Pick a colour from the picture (I, or Alt with the brush)") + "<i></i>" +
      b("sel", SEL[T.selTool] ? T.selTool : "lasso", "Selection: the area Create changes", true) +
      '<button type="button" class="sk-b" data-k="deselect" title="Deselect (Ctrl D)">' + ic("deselect") + "</button><i></i>" +
      b("flip", "flip", "Flip the view to check proportions", true) + "<i></i>" +
      '<button type="button" class="sk-b" data-k="undo" title="Undo (Ctrl Z)">' + ic("undo") + "</button>" +
      '<button type="button" class="sk-b" data-k="redo" title="Redo (Ctrl Shift Z)">' + ic("redo") + "</button></div>";
  }
  function slider(k, label, v, max, unit) {
    var p = Math.round(100 * v / max);
    return '<label class="sk-sl" data-s="' + k + '">' + label + '<span class="tr"><u style="width:' + p + '%"></u><b style="left:' + p + '%"></b></span><em>' + (unit === "px" ? Math.round(v) + " px" : Math.round(v * 100) + "%") + "</em></label>";
  }
  function sizeKey() { return T.tool === "erase" ? (T.eraser === "magic" ? "magic" : "erase") : "brush"; }
  function optsHTML() {
    var h = "";
    if (T.tool === "brush" || T.tool === "erase") {
      var names = { sketch: "Sketching", soft: "Soft", hard: "Hard", magic: "Magic eraser" };
      h = '<span class="tg">' + ic(T.tool === "brush" ? brushIcon() : eraseIcon(), 14) + (T.tool === "brush" ? names[T.brush] : names[T.eraser] || "") + "</span>" +
        slider("size", "Size", T.sizes[sizeKey()], 300, "px");
      if (!(T.tool === "erase" && T.eraser === "magic")) h += slider("opacity", "Opacity", T.opacity, 1) + slider("flow", "Flow", T.flow, 1) + slider("smooth", "Smoothing", T.smooth, 1) +
        '<button type="button" class="tg' + (T.pressure ? " on" : "") + '" data-o="pressure" title="Pen tablet pressure changes size and opacity">' + ic("pressure", 14) + "Pressure</button>";
      else h += '<span class="note">Paint over what should go; it disappears when you let go</span>';
    } else if (isSel(T.tool)) {
      h = ["new", "add", "sub"].map(function (m) { return '<button type="button" class="tg' + (T.selMode === m ? " on" : "") + '" data-o="mode:' + m + '">' + { new: "New", add: "Add", sub: "Subtract" }[m] + "</button>"; }).join("") +
        '<button type="button" class="tg" data-o="invert">Invert</button><button type="button" class="tg" data-o="deselect">Deselect · Ctrl D</button>' +
        (V().S.create.src && V().S.create.src.live ? '<button type="button" class="tg" data-o="pssel"' + (V().S.psSel ? "" : " disabled") + '><span class="m-ico ps">Ps</span>Photoshop selection</button>' : "") +
        '<span class="note">' + SEL[T.tool][2] + "</span>";
    } else if (T.tool === "tr") {
      h = '<span class="note">Drag to move · corners scale · top dot rotates</span><button type="button" class="tg" data-o="tf:fh">Flip H</button><button type="button" class="tg" data-o="tf:fv">Flip V</button>' +
        '<button type="button" class="tg" data-o="tf:reset">Reset</button><button type="button" class="tg dark" data-o="tf:apply">Apply · Enter</button>';
    } else if (T.tool === "pick") h = '<span class="note">Click the picture to take its colour</span>';
    else if (T.tool === "hand") h = '<span class="note">Drag to move the view · wheel zooms</span>';
    return '<div class="sk-opts" id="sk-opts">' + h + "</div>";
  }
  function refreshBars() {
    if (!view) return;
    var bar = view.querySelector("#sk-bar"), o = view.querySelector("#sk-opts");
    if (bar) bar.outerHTML = toolbarHTML();
    if (o) o.outerHTML = optsHTML();
    wireToolbar(); cursor();
  }
  function setTool(t) {
    if (tf && t !== "tr") applyTf();
    T.tool = t; keep("tool", t);
    if (isSel(t)) { T.selTool = t; keep("selTool", t); V().painter.setTool(t === "object" ? "object" : t); }
    if (t === "tr") startTf();
    refreshBars();
  }

  function wireToolbar() {
    var bar = view && view.querySelector("#sk-bar"); if (!bar || bar._w) return; bar._w = 1;
    bar.addEventListener("click", function (e) {
      var dd = e.target.closest("[data-dd]"), b = e.target.closest("[data-k]"); if (!b) return;
      var k = b.getAttribute("data-k");
      if (dd || (k === "flip")) { menuFor(dd ? dd.getAttribute("data-dd") : k, b); return; }
      if (k === "plus") V().plusMenu(b, function (info) { if (window.VSBoard) window.VSBoard.addAndOpen(info); });
      else if (k === "color") colorPop(b);
      else if (k === "deselect") deselect();
      else if (k === "undo") undo(); else if (k === "redo") redo();
      else if (k === "sel") setTool(T.selTool);
      else setTool(k);
    });
    var o = view.querySelector("#sk-opts");
    o.addEventListener("click", function (e) {
      var b = e.target.closest("[data-o]"); if (!b || b.disabled) return;
      var a = b.getAttribute("data-o");
      if (a === "pressure") { T.pressure = !T.pressure; keep("pressure", T.pressure); refreshBars(); }
      else if (a.indexOf("mode:") === 0) { T.selMode = a.slice(5); V().painter.mode = T.selMode; refreshBars(); }
      else if (a === "invert") V().painter.invert();
      else if (a === "deselect") deselect();
      else if (a === "pssel") V().painter.psSelection();
      else if (a.indexOf("tf:") === 0) tfAction(a.slice(3));
    });
    o.addEventListener("pointerdown", function (e) {
      var s = e.target.closest("[data-s]"); if (!s) return;
      var tr = s.querySelector(".tr"), k = s.getAttribute("data-s");
      var setv = function (ev) {
        var r = tr.getBoundingClientRect(), u = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        if (k === "size") { T.sizes[sizeKey()] = Math.max(1, Math.round(u * 300)); keep("sizes", T.sizes); }
        else { T[k] = Math.round(u * 100) / 100; keep(k, T[k]); }
        var p = Math.round(100 * (k === "size" ? T.sizes[sizeKey()] / 300 : T[k]));
        tr.querySelector("u").style.width = p + "%"; tr.querySelector("b").style.left = p + "%";
        s.querySelector("em").textContent = k === "size" ? T.sizes[sizeKey()] + " px" : Math.round(T[k] * 100) + "%";
      };
      setv(e); s.setPointerCapture(e.pointerId);
      var mv = function (ev) { setv(ev); }, up = function () { s.removeEventListener("pointermove", mv); s.removeEventListener("pointerup", up); };
      s.addEventListener("pointermove", mv); s.addEventListener("pointerup", up);
    });
  }

  function menuFor(k, anchor) {
    var it = function (v, icon, label, on, key, sub) {
      return '<button type="button" class="it' + (on ? " on" : "") + '" data-p="' + v + '"><span class="ck">' + (on ? ic("check", 14) : "") + "</span>" + (icon ? ic(icon) : "") +
        "<span>" + label + (sub ? "<small>" + sub + "</small>" : "") + "</span>" + (key ? '<span class="k">' + key + "</span>" : "") + "</button>";
    };
    var html = "";
    if (k === "brush") html = '<div class="ttl">Brush</div>' + it("sketch", "pencil", "Sketching", T.brush === "sketch", "B", "Pencil feel; thins with light pressure") +
      it("soft", "soft", "Soft brush", T.brush === "soft", "", "Airbrush edges for shading") + it("hard", "hard", "Hard brush", T.brush === "hard", "", "Clean solid edges, fills");
    else if (k === "erase") html = '<div class="ttl">Eraser</div>' + it("soft", "soft", "Soft eraser", T.eraser === "soft", "E") + it("hard", "hard", "Hard eraser", T.eraser === "hard") +
      "<hr>" + it("magic", "magic", 'Magic eraser<span class="ai">AI</span>', T.eraser === "magic", "", "Paint over an object: it disappears and the background fills in");
    else if (k === "sel") html = '<div class="ttl">Selection · the area Create changes</div>' + Object.keys(SEL).map(function (s) { return it(s, s, SEL[s][0] + (s === "object" ? '<span class="ai">AI</span>' : ""), T.selTool === s, SEL[s][1], SEL[s][2]); }).join("") +
      (V().S.create.src && V().S.create.src.live ? "<hr>" + it("pssel", "", '<span class="m-ico ps" style="margin-right:8px">Ps</span>Photoshop selection', false, "", "Uses what you selected in Photoshop") : "");
    else if (k === "flip") html = '<div class="ttl">Flip the view</div>' + it("fh", "flip", "Flip horizontally", T.flipH, "H") + it("fv", "flip", "Flip vertically", T.flipV, "Shift H") +
      '<div class="ttl" style="padding-bottom:6px">Only the view: checks proportions, the picture is not flipped</div>';
    V().pop(anchor, html, function (v) {
      if (k === "brush") { T.brush = v; keep("brush", v); setTool("brush"); }
      else if (k === "erase") { T.eraser = v; keep("eraser", v); setTool("erase"); }
      else if (k === "sel") { if (v === "pssel") { setTool(T.selTool); V().painter.psSelection(); } else setTool(v); }
      else if (k === "flip") flipView(v);
    });
  }
  function flipView(v) { if (v === "fh") T.flipH = !T.flipH; else T.flipV = !T.flipV; V().layout(); refreshBars(); }

  // -------------------------------------------------------------------- colour

  function hexToHsv(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
  }
  function hsvToHex(h, s, v) {
    var f = function (n) { var k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return "#" + [f(5), f(3), f(1)].map(function (x) { return ("0" + Math.round(x * 255).toString(16)).slice(-2); }).join("");
  }
  function setColor(hex, remember) {
    T.color = hex.toLowerCase(); keep("color", T.color);
    if (remember) { T.recents = [T.color].concat(T.recents.filter(function (c) { return c !== T.color; })).slice(0, 10); keep("recents", T.recents); }
    var sw = view && view.querySelector(".sk-sw"); if (sw) sw.style.background = T.color;
  }
  function colorPop(anchor) {
    var hsv = hexToHsv(T.color);
    var html = '<div class="sk-cp"><div class="sq" style="background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,' + hsvToHex(hsv[0], 1, 1) + ')"><b style="left:' + hsv[1] * 100 + "%;top:" + (1 - hsv[2]) * 100 + '%"></b></div>' +
      '<div class="hue"><b style="left:' + hsv[0] / 3.6 + '%"></b></div>' +
      '<div class="rw"><button type="button" class="pk" data-p="pick" title="Pick from the picture (I)">' + ic("pick", 15) + '</button><input class="hex" value="' + T.color + '" maxlength="7" spellcheck="false"></div>' +
      '<div class="lbl">Recent</div><div class="sws">' + T.recents.map(function (c) { return '<button type="button" data-p="c' + c + '" style="background:' + c + '"></button>'; }).join("") + "</div></div>";
    var el = V().pop(anchor, html, function (v) {
      if (v === "pick") { setTool("pick"); return; }
      if (v.charAt(0) === "c") { setColor(v.slice(1), true); return true; }
      return true;
    });
    var sq = el.querySelector(".sq"), hue = el.querySelector(".hue"), hex = el.querySelector(".hex");
    var upd = function (remember) {
      var c = hsvToHex(hsv[0], hsv[1], hsv[2]); setColor(c, remember);
      sq.style.background = "linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff," + hsvToHex(hsv[0], 1, 1) + ")";
      sq.querySelector("b").style.left = hsv[1] * 100 + "%"; sq.querySelector("b").style.top = (1 - hsv[2]) * 100 + "%";
      hue.querySelector("b").style.left = hsv[0] / 3.6 + "%"; hex.value = c;
    };
    var drag = function (target, fn) {
      target.addEventListener("pointerdown", function (e) {
        target.setPointerCapture(e.pointerId); fn(e);
        var mv = function (ev) { fn(ev); }, up = function () { target.removeEventListener("pointermove", mv); target.removeEventListener("pointerup", up); upd(true); };
        target.addEventListener("pointermove", mv); target.addEventListener("pointerup", up);
      });
    };
    drag(sq, function (e) { var r = sq.getBoundingClientRect(); hsv[1] = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); hsv[2] = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); upd(); });
    drag(hue, function (e) { var r = hue.getBoundingClientRect(); hsv[0] = 360 * Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)); upd(); });
    hex.addEventListener("change", function () { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { hsv = hexToHsv(hex.value); upd(true); } });
  }
  // The colour under a point of the picture, from all visible layers.
  function sample(x, y) {
    var c = document.createElement("canvas"); c.width = c.height = 1;
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1, 1);
    var base = fit.querySelector(".sk-base");
    doc.layers.forEach(function (L) {
      if (!L.visible) return;
      var src = L.kind === "base" ? base : L.canvas, sw = L.kind === "base" ? base.naturalWidth / doc.w : 1;
      ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend === "normal" ? "source-over" : L.blend;
      try { ctx.drawImage(src, x * sw, y * sw, sw, sw, 0, 0, 1, 1); } catch (e) {}
    });
    var p = ctx.getImageData(0, 0, 1, 1).data;
    return "#" + [p[0], p[1], p[2]].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
  }

  // -------------------------------------------------------------------- painting

  var grain = null;
  function grainPattern(ctx) {
    if (!grain) {
      grain = document.createElement("canvas"); grain.width = grain.height = 64;
      var g = grain.getContext("2d"), d = g.createImageData(64, 64);
      for (var i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; d.data[i + 3] = 120 + Math.random() * 135; }
      g.putImageData(d, 0, 0);
    }
    return ctx.createPattern(grain, "repeat");
  }
  function point(e) {
    var r = catcher.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (T.flipH) u = 1 - u;
    if (T.flipV) v = 1 - v;
    return [u * doc.w, v * doc.h];
  }
  function scale() { var r = catcher.getBoundingClientRect(); return r.width ? doc.w / r.width : 1; }
  function dab(ctx, x, y, rad, a, kind) {
    if (rad < 0.3) rad = 0.3;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    if (kind === "soft") {
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, ctx._col); g.addColorStop(1, ctx._col0);
      ctx.fillStyle = g;
    } else ctx.fillStyle = ctx._col;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  function rgba(hex, a) { return "rgba(" + parseInt(hex.slice(1, 3), 16) + "," + parseInt(hex.slice(3, 5), 16) + "," + parseInt(hex.slice(5, 7), 16) + "," + a + ")"; }

  function strokeStart(e) {
    var L = active();
    if (!L || L.kind === "base" || L.locked) {
      // Paint goes on a paint layer: make one above the picture when needed.
      L = addLayer(doc, null); order(); fit.appendChild(L.canvas); L.canvas.className = "sk-layer"; order(); panel();
    }
    var magic = T.tool === "erase" && T.eraser === "magic", erase = T.tool === "erase" && !magic;
    var target = magic ? magicBuf : erase ? L.canvas : buf;
    if (target === buf || target === magicBuf) { target.width = doc.w; target.height = doc.h; }
    var ctx = target.getContext("2d");
    var kind = magic ? "hard" : erase ? T.eraser : T.brush;
    ctx._col = magic ? "rgba(232,72,72,1)" : erase ? "rgba(0,0,0,1)" : rgba(T.color, 1);
    ctx._col0 = magic ? "rgba(232,72,72,0)" : erase ? "rgba(0,0,0,0)" : rgba(T.color, 0);
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    if (kind === "sketch" && !erase) { ctx._col = rgba(T.color, 1); }
    stroke = { L: L, ctx: ctx, target: target, kind: kind, erase: erase, magic: magic, before: L.canvas.getContext("2d").getImageData(0, 0, doc.w, doc.h),
               last: null, pos: null, left: 0, pen: e.pointerType === "pen" };
    buf.style.opacity = magic ? 0 : T.opacity; magicBuf.style.opacity = magic ? 0.45 : 0;
    // A selection keeps the paint inside it.
    var sel = V().painter;
    if (sel.any && !magic) { try { var m = "url(" + sel.canvas.toDataURL() + ")"; buf.style.webkitMaskImage = buf.style.maskImage = m; buf.style.maskSize = buf.style.webkitMaskSize = "100% 100%"; } catch (x) {} }
    else buf.style.webkitMaskImage = buf.style.maskImage = "";
    strokeMove(e, true);
  }
  function strokeMove(e, first) {
    if (!stroke) return;
    var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!events.length) events = [e];
    events.forEach(function (ev) { strokeTo(point(ev), ev.pointerType === "pen" && T.pressure ? (ev.pressure || 0.5) : 1, first); first = false; });
  }
  function strokeTo(p, pr, first) {
    var s = stroke, size = T.sizes[s.magic ? "magic" : s.erase ? "erase" : "brush"];
    // Smoothing: the brush follows the pointer a little behind, like a lazy string.
    if (!s.pos) s.pos = p.slice();
    else if (!s.magic) { var k = 1 - T.smooth * 0.85; s.pos[0] += (p[0] - s.pos[0]) * k; s.pos[1] += (p[1] - s.pos[1]) * k; }
    else s.pos = p.slice();
    var q = s.pos.slice();
    var rad = size / 2 * (s.kind === "sketch" ? 0.12 + 0.88 * pr : 0.35 + 0.65 * pr);
    var a = s.magic ? 1 : T.flow * (s.kind === "sketch" ? 0.25 + 0.75 * pr : 0.55 + 0.45 * pr) * (s.erase ? T.opacity : 1);
    if (s.kind === "sketch" && !s.erase) a *= 0.9;
    var step = Math.max(0.6, rad * (s.kind === "soft" ? 0.18 : 0.3));
    var ctx = s.ctx;
    if (s.kind === "sketch" && !s.erase && !s.magic) { ctx.save(); }
    if (!s.last) { dab(ctx, q[0], q[1], rad, a, s.kind); s.last = q; }
    else {
      var dx = q[0] - s.last[0], dy = q[1] - s.last[1], dist = Math.hypot(dx, dy), t = s.left;
      while (t <= dist) { var f = dist ? t / dist : 0; dab(ctx, s.last[0] + dx * f, s.last[1] + dy * f, rad, a, s.kind); t += step; }
      s.left = t - dist; s.last = q;
    }
    if (s.kind === "sketch" && !s.erase && !s.magic) {
      // Pencil grain: knock some tooth out of what was just laid down.
      ctx.restore();
    }
  }
  function strokeEnd() {
    var s = stroke; if (!s) return; stroke = null;
    var Lc = s.L.canvas.getContext("2d");
    if (s.magic) { magicErase(); return; }
    if (!s.erase) {
      if (s.kind === "sketch") {
        var g = buf.getContext("2d"); g.globalCompositeOperation = "destination-out"; g.globalAlpha = 0.35; g.fillStyle = grainPattern(g); g.fillRect(0, 0, doc.w, doc.h);
        g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      }
      var sel = V().painter;
      if (sel.any) { var g2 = buf.getContext("2d"); g2.globalCompositeOperation = "destination-in"; g2.globalAlpha = 1; g2.drawImage(sel.canvas, 0, 0, doc.w, doc.h); g2.globalCompositeOperation = "source-over"; }
      Lc.globalAlpha = T.opacity; Lc.globalCompositeOperation = "source-over"; Lc.drawImage(buf, 0, 0); Lc.globalAlpha = 1;
      buf.getContext("2d").clearRect(0, 0, doc.w, doc.h);
    } else {
      var sel2 = V().painter;
      if (sel2.any) {
        // Erasing respects the selection too: put back what was outside it.
        var keepOut = document.createElement("canvas"); keepOut.width = doc.w; keepOut.height = doc.h;
        var ko = keepOut.getContext("2d"); ko.putImageData(s.before, 0, 0); ko.globalCompositeOperation = "destination-out"; ko.drawImage(sel2.canvas, 0, 0, doc.w, doc.h);
        Lc.globalCompositeOperation = "source-over"; Lc.drawImage(keepOut, 0, 0);
      }
      Lc.globalCompositeOperation = "source-over";
    }
    doc.hist.push({ t: "px", L: s.L, before: s.before, after: Lc.getImageData(0, 0, doc.w, doc.h) }); if (doc.hist.length > 30) doc.hist.shift();
    doc.redo = [];
    thumbs(); V().render();
  }

  // The flattened visible picture at paint size (for the magic eraser).
  function flatten() {
    var c = document.createElement("canvas"); c.width = doc.w; c.height = doc.h;
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, doc.w, doc.h);
    var base = fit.querySelector(".sk-base");
    doc.layers.forEach(function (L) {
      if (!L.visible) return;
      ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend === "normal" ? "source-over" : L.blend;
      ctx.drawImage(L.kind === "base" ? base : L.canvas, 0, 0, doc.w, doc.h);
    });
    return c;
  }
  function magicErase() {
    var mask = document.createElement("canvas"); mask.width = doc.w; mask.height = doc.h;
    var mc = mask.getContext("2d"); mc.fillStyle = "#000"; mc.fillRect(0, 0, doc.w, doc.h); mc.drawImage(magicBuf, 0, 0);
    var md = mc.getImageData(0, 0, doc.w, doc.h), any = false;
    for (var i = 0; i < md.data.length; i += 4) { var on = md.data[i] > 100 && md.data[i + 1] < 120; md.data[i] = md.data[i + 1] = md.data[i + 2] = on ? 255 : 0; md.data[i + 3] = 255; if (on) any = true; }
    if (!any) { magicBuf.getContext("2d").clearRect(0, 0, doc.w, doc.h); return; }
    mc.putImageData(md, 0, 0);
    var img = flatten().toDataURL("image/png"), m = mask.toDataURL("image/png");
    V().toast("Magic eraser: removing…");
    view.classList.add("sk-busy");
    V().api().studio_magic_erase(img, m).then(function (r) {
      view && view.classList.remove("sk-busy");
      magicBuf.getContext("2d").clearRect(0, 0, doc.w, doc.h);
      if (!r || r.error) { V().toast(r && r.error ? r.error : "The magic eraser didn't work this time."); return; }
      var im = new Image();
      im.onload = function () {
        var L = addLayer(doc, "Magic erase");
        // Magic results sit on top of everything they cover.
        doc.layers.splice(doc.layers.indexOf(L), 1); doc.layers.push(L);
        L.canvas.getContext("2d").drawImage(im, 0, 0, doc.w, doc.h);
        L.canvas.className = "sk-layer"; fit.appendChild(L.canvas); order(); panel(); thumbs(); V().render();
        V().toast("Erased · on its own layer “Magic erase”");
      };
      im.src = r.patch;
    });
  }

  // -------------------------------------------------------------------- undo

  function undo() {
    var h = doc && doc.hist.pop(); if (!h) return;
    if (h.t === "px") h.L.canvas.getContext("2d").putImageData(h.before, 0, 0);
    else if (h.t === "add") { doc.layers.splice(doc.layers.indexOf(h.L), 1); if (h.L.canvas.parentNode) h.L.canvas.remove(); if (doc.active === h.L.id) doc.active = doc.layers[Math.max(0, h.at - 1)].id; }
    else if (h.t === "del") { doc.layers.splice(h.at, 0, h.L); if (fit) fit.appendChild(h.L.canvas); doc.active = h.L.id; }
    doc.redo.push(h); order(); panel(); thumbs(); V().render();
  }
  function redo() {
    var h = doc && doc.redo.pop(); if (!h) return;
    if (h.t === "px") h.L.canvas.getContext("2d").putImageData(h.after, 0, 0);
    else if (h.t === "add") { doc.layers.splice(h.at, 0, h.L); if (fit) fit.appendChild(h.L.canvas); doc.active = h.L.id; }
    else if (h.t === "del") { doc.layers.splice(doc.layers.indexOf(h.L), 1); if (h.L.canvas.parentNode) h.L.canvas.remove(); }
    doc.hist.push(h); order(); panel(); thumbs(); V().render();
  }
  function deselect() { var p = V().painter; p.cancelPath(); p.clear(); }

  // -------------------------------------------------------------------- transform

  function bbox(L) {
    var c = L.canvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (var y = 0; y < c.height; y += 2) for (var x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : [x0, y0, x1 + 2, y1 + 2];
  }
  function startTf() {
    var L = active();
    if (!L || L.kind === "base") { V().toast("Pick a paint layer to transform (the picture itself stays put)."); T.tool = "brush"; return; }
    var b = bbox(L); if (!b) { V().toast("That layer is empty."); T.tool = "brush"; return; }
    tf = { L: L, box: b, cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, tx: 0, ty: 0, s: 1, r: 0, fh: 1, fv: 1 };
    drawTf();
  }
  function tfMatrix(t) { return "translate(" + t.tx + "px," + t.ty + "px) rotate(" + t.r + "rad) scale(" + t.s * t.fh + "," + t.s * t.fv + ")"; }
  function drawTf() {
    if (!tf || !fit) return;
    var k = fit.clientWidth / doc.w, L = tf.L;
    L.canvas.style.transformOrigin = (tf.cx / doc.w * 100) + "% " + (tf.cy / doc.h * 100) + "%";
    L.canvas.style.transform = "translate(" + tf.tx * k + "px," + tf.ty * k + "px) rotate(" + tf.r + "rad) scale(" + tf.s * tf.fh + "," + tf.s * tf.fv + ")";
    var box = fit.querySelector(".sk-tf");
    if (!box) { box = document.createElement("div"); box.className = "sk-tf"; box.innerHTML = '<i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i><span data-h="rot"></span>'; fit.appendChild(box);
      box.addEventListener("pointerdown", function (e) { if (e.target.getAttribute("data-h") && tf) { e.preventDefault(); e.stopPropagation(); tfDown(e); } }); }
    var w = (tf.box[2] - tf.box[0]) * k, h = (tf.box[3] - tf.box[1]) * k;
    box.style.left = tf.box[0] * k + "px"; box.style.top = tf.box[1] * k + "px"; box.style.width = w + "px"; box.style.height = h + "px";
    box.style.transformOrigin = (tf.cx - tf.box[0]) * k + "px " + (tf.cy - tf.box[1]) * k + "px";
    box.style.transform = "translate(" + tf.tx * k + "px," + tf.ty * k + "px) rotate(" + tf.r + "rad) scale(" + tf.s + ")";
    box.style.zIndex = 60;
  }
  function tfAction(a) {
    if (!tf) return;
    if (a === "fh") tf.fh *= -1; else if (a === "fv") tf.fv *= -1;
    else if (a === "reset") { tf.tx = tf.ty = tf.r = 0; tf.s = 1; tf.fh = tf.fv = 1; }
    else if (a === "apply") { applyTf(); T.tool = "brush"; refreshBars(); return; }
    drawTf();
  }
  function applyTf() {
    if (!tf) return;
    var L = tf.L, c = L.canvas, old = document.createElement("canvas"); old.width = c.width; old.height = c.height; old.getContext("2d").drawImage(c, 0, 0);
    var before = c.getContext("2d").getImageData(0, 0, c.width, c.height), ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height); ctx.save();
    ctx.translate(tf.cx + tf.tx, tf.cy + tf.ty); ctx.rotate(tf.r); ctx.scale(tf.s * tf.fh, tf.s * tf.fv); ctx.translate(-tf.cx, -tf.cy);
    ctx.drawImage(old, 0, 0); ctx.restore();
    c.style.transform = ""; var box = fit && fit.querySelector(".sk-tf"); if (box) box.remove();
    doc.hist.push({ t: "px", L: L, before: before, after: ctx.getImageData(0, 0, c.width, c.height) }); doc.redo = [];
    tf = null; thumbs(); V().render();
  }
  function cancelTf() { if (!tf) return; tf.L.canvas.style.transform = ""; var box = fit && fit.querySelector(".sk-tf"); if (box) box.remove(); tf = null; }
  function tfDown(e) {
    var h = e.target.getAttribute && e.target.getAttribute("data-h"), p = point(e), k = scale();
    var start = { x: p[0], y: p[1], tx: tf.tx, ty: tf.ty, s: tf.s, r: tf.r, h: h };
    var cx = tf.cx + tf.tx, cy = tf.cy + tf.ty, d0 = Math.hypot(p[0] - cx, p[1] - cy) || 1, a0 = Math.atan2(p[1] - cy, p[0] - cx);
    var mv = function (ev) {
      var q = point(ev);
      if (!h) { tf.tx = start.tx + q[0] - start.x; tf.ty = start.ty + q[1] - start.y; }
      else if (h === "rot") { tf.r = start.r + Math.atan2(q[1] - cy, q[0] - cx) - a0; if (ev.shiftKey) tf.r = Math.round(tf.r / (Math.PI / 12)) * Math.PI / 12; }
      else tf.s = Math.max(0.05, start.s * Math.hypot(q[0] - cx, q[1] - cy) / d0);
      drawTf();
    };
    var up = function () { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); };
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
    void k;
  }

  // -------------------------------------------------------------------- pointer input

  function cursor() {
    if (!view) return;
    view.setAttribute("data-tool", T.tool);
    if (ring) ring.hidden = !(T.tool === "brush" || T.tool === "erase");
  }
  function moveRing(e) {
    if (!ring || ring.hidden || !view) return;
    var r = view.getBoundingClientRect(), d = T.sizes[sizeKey()] / scale();
    ring.style.left = (e.clientX - r.left) + "px"; ring.style.top = (e.clientY - r.top) + "px";
    ring.style.width = ring.style.height = Math.max(4, d) + "px";
  }
  function wireCatcher() {
    var c = catcher;
    c.addEventListener("pointerdown", function (e) {
      if (e.button === 1 || window.VS.zoomSpace()) return;            // the view pans
      if (T.tool === "hand") return;
      e.preventDefault();
      var src = V().S.create.src;
      if (src && src.live && (T.tool === "brush" || T.tool === "erase" || T.tool === "tr")) { branch(); return; }
      if ((T.tool === "brush" && e.altKey) || T.tool === "pick") { setColor(sample.apply(null, point(e).map(Math.floor)), true); if (T.tool === "pick") setTool("brush"); return; }
      if (T.tool === "tr") { if (tf) tfDown(e); return; }
      if (isSel(T.tool)) { V().painter.pointerDown(e); return; }
      if (e.button !== 0) return;
      c.setPointerCapture(e.pointerId); strokeStart(e);
    });
    c.addEventListener("pointermove", function (e) { moveRing(e); if (stroke) strokeMove(e); else if (isSel(T.tool)) V().painter.pointerMove(e); });
    c.addEventListener("pointerup", function (e) { if (stroke) strokeEnd(); else if (isSel(T.tool)) V().painter.pointerUp(e); });
    c.addEventListener("dblclick", function (e) { if (isSel(T.tool)) V().painter.dblclick(e); });
    c.addEventListener("pointerenter", function (e) { cursor(); moveRing(e); });
    c.addEventListener("pointerleave", function () { if (ring) ring.hidden = true; });
    c.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  // A Live picture is Photoshop's: drawing on it starts a new sketch from a frozen copy.
  var branching = false;
  function branch(then) {
    if (branching) return; branching = true;
    var S = V().S, src = S.create.src;
    V().toast("Starting a sketch from Live…");
    V().api().studio_freeze(src.path, src.name).then(function (info) {
      branching = false;
      if (!info) { V().toast("Couldn't copy the Live picture."); return; }
      var t = window.VSBoard && window.VSBoard.addFrom(info, "live");
      S.create.source = "image"; V().setImage(S.create, "src", info); if (t) S.boardFrom = t.id;
      V().toast("New sketch from Live · Photoshop stays as it is");
      if (then) then(info);
    });
  }

  function key(e) {
    if (!doc || !view) return false;
    var k = e.key.toLowerCase();
    if (e.ctrlKey && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return true; }
    if (e.ctrlKey && k === "y") { e.preventDefault(); redo(); return true; }
    if (e.ctrlKey && k === "d") { e.preventDefault(); deselect(); return true; }
    if (tf && e.key === "Enter") { e.preventDefault(); tfAction("apply"); return true; }
    if (tf && e.key === "Escape") { cancelTf(); T.tool = "brush"; refreshBars(); return true; }
    if (isSel(T.tool) && V().painter.key(e)) return true;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === "[" || e.key === "]") {
      var sk = sizeKey(); T.sizes[sk] = Math.max(1, Math.min(300, Math.round(T.sizes[sk] * (e.key === "]" ? 1.2 : 1 / 1.2)) + (e.key === "]" ? 1 : 0)));
      keep("sizes", T.sizes); refreshBars(); return true;
    }
    var map = { b: "brush", e: "erase", i: "pick", t: "tr", l: "lasso", m: "rect", p: "pen", s: "object" };
    if (k === "h") { if (e.shiftKey) flipView("fv"); else flipView("fh"); return true; }
    if (map[k]) { setTool(map[k]); return true; }
    return false;
  }

  // -------------------------------------------------------------------- the layers panel

  var BLENDS = [["normal", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["darken", "Darken"], ["lighten", "Lighten"]];
  function thumbs() {
    scheduleSave();
    if (!view) return;
    view.querySelectorAll("#sk-panel canvas[data-th]").forEach(function (t) {
      var L = byId(doc, t.getAttribute("data-th")); if (!L || !L.canvas) return;
      var g = t.getContext("2d"); g.clearRect(0, 0, t.width, t.height); g.drawImage(L.canvas, 0, 0, t.width, t.height);
    });
  }
  function panel() {
    var el = view && view.querySelector("#sk-panel"); if (!el) return;
    var base = fit.querySelector(".sk-base");
    var rows = doc.layers.slice().reverse().map(function (L) {
      var th = L.kind === "base" ? '<img src="' + base.getAttribute("src") + '" alt="">' : '<canvas data-th="' + L.id + '" width="88" height="' + Math.round(88 * doc.h / doc.w) + '"></canvas>';
      return '<div class="row' + (L.id === doc.active ? " on" : "") + (L.visible ? "" : " off") + '" data-l="' + L.id + '">' +
        '<span class="g" data-a="drag" title="Drag to reorder">⋮⋮</span>' +
        '<button type="button" class="e" data-a="eye" title="Show / hide">' + ic(L.visible ? "eye" : "eyeoff", 15) + "</button>" +
        '<span class="t">' + th + (L.locked ? '<i class="lk">' + ic("lock", 10) + "</i>" : "") + "</span>" +
        '<span class="n"><b data-a="name">' + V().esc(L.name) + "</b><small>" + Math.round(L.opacity * 100) + "% · " + (BLENDS.filter(function (x) { return x[0] === L.blend; })[0] || BLENDS[0])[1] + "</small>" +
        '<span class="op" data-a="op" title="Drag across to change opacity"><u style="width:' + L.opacity * 100 + '%"></u></span></span>' +
        '<button type="button" class="m" data-a="menu" title="More">' + ic("dots", 15) + "</button></div>";
    }).join("");
    el.innerHTML = '<div class="hd">' + ic("layers", 15) + "<span>Layers</span></div>" + rows +
      '<div class="ft"><button type="button" data-a="add">' + ic("plus", 13) + "<span>Layer</span></button><button type=\"button\" data-a=\"merge\"><span>Merge down</span></button></div>";
    el.classList.toggle("open", !T.folded || el.matches(":hover"));
    thumbs();
    if (!el._w) wirePanel(el);
  }
  function wirePanel(el) {
    el._w = 1;
    el.addEventListener("mouseenter", function () { el.classList.add("open"); });
    el.addEventListener("mouseleave", function () { if (T.folded && !el.querySelector(".n b[contenteditable]")) el.classList.remove("open"); });
    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]"), row = e.target.closest("[data-l]");
      var L = row && byId(doc, row.getAttribute("data-l")), act = a && a.getAttribute("data-a");
      if (act === "add") { var n = addLayer(doc); n.canvas.className = "sk-layer"; fit.appendChild(n.canvas); order(); panel(); return; }
      if (act === "merge") { mergeDown(active()); return; }
      if (!L) return;
      if (act === "eye") { L.visible = !L.visible; order(); panel(); V().render(); return; }
      if (act === "menu") { layerMenu(L, a); return; }
      if (act === "op" || act === "drag") return;
      doc.active = L.id; order(); panel();
    });
    el.addEventListener("dblclick", function (e) {
      var b = e.target.closest("[data-a=name]"), row = e.target.closest("[data-l]"); if (!b || !row) return;
      rename(byId(doc, row.getAttribute("data-l")), b);
    });
    el.addEventListener("pointerdown", function (e) {
      var a = e.target.closest("[data-a]"), row = e.target.closest("[data-l]"); if (!a || !row) return;
      var L = byId(doc, row.getAttribute("data-l")), act = a.getAttribute("data-a");
      if (act === "op") {
        var bar = a, set = function (ev) { var r = bar.getBoundingClientRect(); L.opacity = Math.round(100 * Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))) / 100; bar.querySelector("u").style.width = L.opacity * 100 + "%"; row.querySelector("small").textContent = Math.round(L.opacity * 100) + "% · " + (BLENDS.filter(function (x) { return x[0] === L.blend; })[0] || BLENDS[0])[1]; order(); };
        set(e); bar.setPointerCapture(e.pointerId);
        var mv = function (ev) { set(ev); }, up = function () { bar.removeEventListener("pointermove", mv); bar.removeEventListener("pointerup", up); V().render(); };
        bar.addEventListener("pointermove", mv); bar.addEventListener("pointerup", up);
      } else if (act === "drag") {
        e.preventDefault(); row.classList.add("dragging");
        var rows = [].slice.call(el.querySelectorAll(".row"));
        var mv2 = function (ev) {
          rows.forEach(function (r) { r.classList.remove("drop-above", "drop-below"); });
          var over = rows.filter(function (r) { var b = r.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; })[0];
          if (over && over !== row) { var b2 = over.getBoundingClientRect(); over.classList.add(ev.clientY < b2.top + b2.height / 2 ? "drop-above" : "drop-below"); }
        };
        var up2 = function (ev) {
          document.removeEventListener("pointermove", mv2); document.removeEventListener("pointerup", up2);
          var over = rows.filter(function (r) { return r.classList.contains("drop-above") || r.classList.contains("drop-below"); })[0];
          if (over) {
            var O = byId(doc, over.getAttribute("data-l")), above = over.classList.contains("drop-above");
            doc.layers.splice(doc.layers.indexOf(L), 1);
            var at = doc.layers.indexOf(O) + (above ? 1 : 0);      // the panel lists top first
            doc.layers.splice(Math.max(0, at), 0, L);
          }
          order(); panel(); V().render(); void ev;
        };
        document.addEventListener("pointermove", mv2); document.addEventListener("pointerup", up2);
      }
    });
  }
  function rename(L, b) {
    b.setAttribute("contenteditable", "true"); b.focus();
    var r = document.createRange(); r.selectNodeContents(b); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    var done = function () { b.removeAttribute("contenteditable"); L.name = b.textContent.trim() || L.name; panel(); };
    b.addEventListener("blur", done, { once: true });
    b.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); b.blur(); } e.stopPropagation(); });
  }
  function layerMenu(L, anchor) {
    var base = L.kind === "base", i = doc.layers.indexOf(L), under = doc.layers[i - 1];
    var it = function (v, label, dis, key, cls) { return '<button type="button" class="it' + (cls ? " " + cls : "") + '" data-p="' + v + '"' + (dis ? " disabled" : "") + "><span>" + label + "</span>" + (key ? '<span class="k">' + key + "</span>" : "") + "</button>"; };
    var html = it("rename", "Rename") + it("dup", "Duplicate", base, "Ctrl J") + it("merge", "Merge down", base || !under || under.kind === "base" && false, "Ctrl E") +
      "<hr><div class=\"ttl\">Blend mode</div>" + BLENDS.map(function (b) { return '<button type="button" class="it' + (L.blend === b[0] ? " on" : "") + '" data-p="blend:' + b[0] + '"><span class="ck">' + (L.blend === b[0] ? ic("check", 14) : "") + "</span><span>" + b[1] + "</span></button>"; }).join("") +
      "<hr>" + it("lock", L.locked ? "Unlock" : "Lock", base) + it("fh", "Flip horizontal", base) + it("fv", "Flip vertical", base) + it("clear", "Clear layer", base) +
      "<hr>" + it("del", "Delete", base, "Del", "red");
    V().pop(anchor, html, function (v) {
      if (v === "rename") { var row = view.querySelector('#sk-panel [data-l="' + L.id + '"] [data-a=name]'); if (row) rename(L, row); }
      else if (v === "dup") { var n = addLayer(doc, L.name + " copy"); n.canvas.getContext("2d").drawImage(L.canvas, 0, 0); n.opacity = L.opacity; n.blend = L.blend; n.canvas.className = "sk-layer"; fit.appendChild(n.canvas); }
      else if (v === "merge") mergeDown(L);
      else if (v.indexOf("blend:") === 0) L.blend = v.slice(6);
      else if (v === "lock") L.locked = !L.locked;
      else if (v === "fh" || v === "fv") flipLayer(L, v === "fh");
      else if (v === "clear") { var c = L.canvas.getContext("2d"), b = c.getImageData(0, 0, doc.w, doc.h); c.clearRect(0, 0, doc.w, doc.h); doc.hist.push({ t: "px", L: L, before: b, after: c.getImageData(0, 0, doc.w, doc.h) }); }
      else if (v === "del") delLayer(L);
      order(); panel(); thumbs(); V().render();
    }, "right");
  }
  function flipLayer(L, h) {
    var c = L.canvas, ctx = c.getContext("2d"), before = ctx.getImageData(0, 0, c.width, c.height), t = document.createElement("canvas");
    t.width = c.width; t.height = c.height; t.getContext("2d").drawImage(c, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height); ctx.save(); ctx.translate(h ? c.width : 0, h ? 0 : c.height); ctx.scale(h ? -1 : 1, h ? 1 : -1); ctx.drawImage(t, 0, 0); ctx.restore();
    doc.hist.push({ t: "px", L: L, before: before, after: ctx.getImageData(0, 0, c.width, c.height) });
  }
  function delLayer(L) {
    if (L.kind === "base") return;
    var at = doc.layers.indexOf(L); doc.layers.splice(at, 1); if (L.canvas.parentNode) L.canvas.remove();
    doc.hist.push({ t: "del", L: L, at: at });
    if (doc.active === L.id) doc.active = doc.layers[Math.max(0, at - 1)].id;
  }
  function mergeDown(L) {
    if (!L || L.kind === "base") return;
    var i = doc.layers.indexOf(L), U = doc.layers[i - 1];
    if (!U || U.kind === "base") { V().toast("Nothing to merge into: the picture itself stays separate."); return; }
    var c = U.canvas.getContext("2d"), before = c.getImageData(0, 0, doc.w, doc.h);
    c.globalAlpha = L.visible ? L.opacity : 0; c.globalCompositeOperation = L.blend === "normal" ? "source-over" : L.blend; c.drawImage(L.canvas, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    doc.hist.push({ t: "px", L: U, before: before, after: c.getImageData(0, 0, doc.w, doc.h) });
    delLayer(L); doc.active = U.id; order(); panel(); thumbs(); V().render();
  }

  // -------------------------------------------------------------------- kept on disk
  // Each picture's layers are saved next to Studio's data, so they come back after a
  // restart, and the board shows the picture as you left it (all visible layers).
  var saveT = 0;
  function scheduleSave() {
    if (!doc || doc.key === "live" || doc.restoring) return;
    clearTimeout(saveT);
    var d = doc;
    saveT = setTimeout(function () { save(d); }, 1200);
  }
  function save(d) {
    var a = V().api(); if (!a || !a.studio_doc_save || d !== doc || !fit) return;
    var flat = "", ed = edited(d);
    if (!ed && !d.saved) return;                 // nothing to keep, nothing kept before
    d.saved = ed;
    if (ed) {
      var full = flatten(), t = document.createElement("canvas"), w = 640, h = Math.round(640 * d.h / d.w);
      t.width = w; t.height = h; t.getContext("2d").drawImage(full, 0, 0, w, h); flat = t.toDataURL("image/jpeg", 0.88);
    }
    var data = { w: d.w, h: d.h, active: d.active, flat: flat,
      layers: d.layers.map(function (L) {
        return { id: L.id, kind: L.kind, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: !!L.locked,
                 png: L.kind === "base" ? "" : (hasPaint(L) ? L.canvas.toDataURL("image/png") : "") };
      }) };
    a.studio_doc_save(d.src.path, data).then(function () { if (window.VSBoard && window.VSBoard.refreshThumb) window.VSBoard.refreshThumb(d.src.path); });
  }
  function restore(d) {
    var a = V().api(); if (!a || !a.studio_doc_get) return;
    d.restoring = true;
    a.studio_doc_get(d.src.path).then(function (data) {
      if (!data || !data.layers || d.hist.length) { d.restoring = false; return; }
      d.saved = true;
      var left = 0, list = [];
      data.layers.forEach(function (S) {
        if (S.kind === "base") { Object.assign(d.base, { visible: S.visible, opacity: S.opacity, blend: S.blend }); list.push(d.base); return; }
        var c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
        var L = { id: S.id, kind: "paint", name: S.name, canvas: c, visible: S.visible, opacity: S.opacity, blend: S.blend, locked: S.locked };
        list.push(L);
        if (S.png) { left++; var im = new Image(); im.onload = function () { c.getContext("2d").drawImage(im, 0, 0, d.w, d.h); if (--left === 0) done(); }; im.src = S.png; }
      });
      var done = function () {
        d.layers.forEach(function (L) { if (L.canvas && L.canvas.parentNode) L.canvas.remove(); });
        d.layers = list; d.active = byId(d, data.active) ? data.active : list[list.length - 1].id; d.restoring = false;
        if (d === doc && fit) { d.layers.forEach(function (L) { if (L.canvas) { L.canvas.className = "sk-layer"; fit.appendChild(L.canvas); } }); order(); panel(); }
        V().render();
      };
      if (!left) done();
    });
  }
  // A result you like, as a layer over the picture it came from.
  function addImageLayer(src, url, name) {
    var d = get(src), im = new Image();
    im.onload = function () {
      var L = addLayer(d, name || "Render");
      d.layers.splice(d.layers.indexOf(L), 1); d.layers.push(L); d.active = L.id;
      L.canvas.getContext("2d").drawImage(im, 0, 0, d.w, d.h);
      if (d === doc && fit) { L.canvas.className = "sk-layer"; fit.appendChild(L.canvas); order(); panel(); thumbs(); }
      V().render();
    };
    im.src = url;
  }

  // -------------------------------------------------------------------- what Create gets

  function payload(src) {
    var d = docs[keyOf(src)]; if (!d || !edited(d)) return null;
    return {
      base: { visible: d.base.visible, opacity: d.base.opacity, blend: d.base.blend },
      layers: d.layers.filter(function (L) { return L.kind !== "base" && L.visible && L.opacity > 0 && hasPaint(L); })
        .map(function (L) { return { png: L.canvas.toDataURL("image/png"), opacity: L.opacity, blend: L.blend, below_base: d.layers.indexOf(L) < d.layers.indexOf(d.base) }; })
    };
  }

  window.VSSketch = {
    mount: mount, key: key, payload: payload, addImageLayer: addImageLayer, branch: branch, edited: function (src) { var d = docs[keyOf(src)]; return !!(d && edited(d)); },
    flip: function () { return { h: T.flipH, v: T.flipV }; }, tool: function () { return T.tool; },
    isSelTool: function () { return isSel(T.tool); }, unmount: function () { if (tf) applyTf(); view = fit = catcher = null; },
    _state: function () { return { T: T, doc: doc, docs: docs }; }, setTool: setTool, undo: undo, redo: redo, sample: function (x, y) { return sample(x, y); }
  };
})();
