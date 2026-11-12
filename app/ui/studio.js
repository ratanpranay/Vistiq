/* Vistiq Studio: Create, Reference, Library and Settings around the
   upscaler (index.html + app.js stay the Upscale page). Does nothing in
   plain Vistiq. */
(function () {
  "use strict";
  var api = function () { return window.pywebview && window.pywebview.api; };
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load(k, d) { try { var v = localStorage.getItem("vs." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function keep(k, v) { try { localStorage.setItem("vs." + k, JSON.stringify(v)); } catch (e) { } }
  function short(n) { return String(n || "").replace(/^Vistiq_/, "").replace(/\.(png|jpe?g|webp)$/i, ""); }

  var ICON = {
    create: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    reference: '<rect x="3" y="5" width="8" height="14" rx="2"/><rect x="13" y="5" width="8" height="14" rx="2"/>',
    upscale: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    library: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    brush: '<path d="M4 20c2 0 4-1 4-3s2-3 3-3l7-7-3-3-7 7c0 1-1 3-3 3s-3 2-3 4z"/>',
    erase: '<path d="M7 20h10M5 15l9-9 5 5-9 9H6z"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + "</svg>"; }

  var PRESETS = [
    ["sketch", "Sketch to photo", "e.g. black nappa leather seats, open-pore walnut, warm afternoon light"],
    ["lighting", "Lighting", "e.g. golden hour sun from the left, soft shadows"],
    ["cmf", "CMF", "e.g. seats in cognac leather, dashboard in dark walnut, satin aluminium trim"],
    ["style", "Style", "e.g. clean studio photograph, white background"],
    ["design", "Design", "e.g. a wider centre screen floating above the dashboard"],
    ["photo", "Photoreal", "e.g. make it look like a real photo from a magazine"]
  ];
  var REF = {
    camera: ["Camera", "Shows your design from the reference's camera position, angle and field of view."],
    cmf: ["CMF", "Puts the reference's colours, materials and finishes on your design."],
    style: ["Style", "Gives your design the reference's mood, light and look."]
  };

  function page(defaults) {
    return Object.assign({ src: null, results: [], sel: -1, job: null, stage: "", frac: 0, error: "", pending: 0 }, defaults);
  }
  var S = {
    page: "create", status: null, engine: { state: "idle", message: "" },
    setup: { run: null, error: "", done: "" },
    lib: { items: [], filter: "all", loading: false },
    create: page({ area: "whole", preset: load("c.preset", "sketch"), text: "", keep: load("c.keep", 0.8), vars: load("c.vars", 2),
                   blend: load("c.blend", 0.35), lora: load("c.lora", ""), juice: load("c.juice", 0), juiceLora: load("c.juiceLora", "") }),
    ref: page({ refimg: null, preset: load("r.preset", "camera"), text: "", keep: load("r.keep", 0.8), vars: load("r.vars", 1) }),
    dropSlot: ""
  };

  // ------------------------------------------------------------------ build

  function rail(id, title, inner, goText) {
    return '<aside class="s-rail"><div class="s-rail-body"><h3>' + title + "</h3>" + inner + "</div>" +
      '<div class="s-rail-foot"><div class="s-err" id="' + id + '-err" hidden></div>' +
      '<button type="button" class="s-go" id="' + id + '-go"><span class="s-go-fill" id="' + id + '-fill" style="width:0"></span><span id="' + id + '-golabel">' + goText + "</span></button>" +
      '<button type="button" class="s-cancel" id="' + id + '-cancel" hidden>Cancel</button>' +
      '<div class="s-meta" id="' + id + '-meta"></div></div></aside>';
  }

  function keepSlider(id) {
    return '<div class="s-label" id="' + id + '-keep-l">Keep my design <em id="' + id + '-keep-v"></em></div>' +
      '<input class="s-range" type="range" min="0" max="1" step="0.05" id="' + id + '-keep">' +
      '<div class="s-ends" id="' + id + '-keep-e"><span>Free</span><span>Exact</span></div>' +
      '<p class="s-hint" id="' + id + '-keep-none" hidden>Add Klein-consistency in Settings to hold the design more tightly.</p>';
  }

  function varsChips(id) {
    return '<div class="s-label">Variations</div><div class="s-seg" id="' + id + '-vars">' +
      [1, 2, 3, 4].map(function (n) { return '<button type="button" data-n="' + n + '">' + n + "</button>"; }).join("") + "</div>";
  }

  function stage(id, extra) {
    return '<section class="s-stage" id="' + id + '-stage">' +
      '<div class="s-ttl" id="' + id + '-ttl"></div>' +
      '<div class="s-acts"><button type="button" id="' + id + '-reveal" disabled>Show in folder</button><button type="button" class="p" id="' + id + '-up" disabled>Upscale this</button></div>' +
      (extra || "") +
      '<div class="s-view" id="' + id + '-view"></div>' +
      '<div class="s-vars" id="' + id + '-strip"></div>' +
      '<div class="s-refine"><input type="text" id="' + id + '-refine" placeholder="Refine: e.g. make the seats lighter, keep everything else"><button type="button" id="' + id + '-refine-go">Refine</button></div>' +
      "</section>" +
      '<div class="s-center" id="' + id + '-gate" hidden></div>';
  }

  function build() {
    document.body.classList.add("studio");
    var nav = document.createElement("nav");
    nav.className = "s-nav";
    nav.innerHTML = '<div class="s-logo"></div>' +
      ["create", "reference", "upscale", "library"].map(function (p) {
        return '<button type="button" data-page="' + p + '">' + svg(p) + p.charAt(0).toUpperCase() + p.slice(1) + "</button>";
      }).join("") + '<div class="s-sp"></div><button type="button" data-page="settings">' + svg("settings") + "Settings</button>";
    document.body.insertBefore(nav, document.body.firstChild);

    var create = document.createElement("div");
    create.className = "s-page"; create.id = "p-create";
    create.innerHTML = rail("c", "Create",
      '<div class="s-label">Start from</div><button type="button" class="s-slot empty" id="c-slot" data-slot="src"></button>' +
      '<div class="s-label">Where to change</div><div class="s-seg" id="c-area"><button type="button" data-v="whole">Whole image</button><button type="button" data-v="paint">Painted area only</button></div>' +
      '<p class="s-hint" id="c-area-hint" hidden>Paint over what should change. Everything outside the paint stays exactly the same, pixel for pixel.</p>' +
      '<div class="s-label">What to change</div><div class="s-presets" id="c-presets">' +
      PRESETS.map(function (p) { return '<button type="button" data-v="' + p[0] + '">' + p[1] + "</button>"; }).join("") + "</div>" +
      '<textarea class="s-prompt" id="c-text" placeholder="Describe the change"></textarea>' +
      keepSlider("c") +
      '<div id="c-blend-w" hidden><div class="s-label">Blend edges <em id="c-blend-v"></em></div><input class="s-range" type="range" min="0" max="1" step="0.05" id="c-blend"><div class="s-ends"><span>Sharp</span><span>Soft</span></div></div>' +
      '<div id="c-look-w" hidden><div class="s-label">Look</div><select class="s-select" id="c-lora"></select></div>' +
      '<div id="c-juice-w" hidden><div class="s-label">Juice <em id="c-juice-v"></em></div><input class="s-range" type="range" min="0" max="1" step="0.05" id="c-juice"><div class="s-ends"><span>Off</span><span>Rich</span></div><select class="s-select" id="c-juice-lora" style="margin-top:8px"></select><p class="s-hint" style="margin-top:6px">A light second pass that adds atmosphere and richer materials. Higher can change small details.</p></div>' +
      varsChips("c"), "Create") + stage("c");
    document.body.appendChild(create);

    var ref = document.createElement("div");
    ref.className = "s-page"; ref.id = "p-reference";
    ref.innerHTML = rail("r", "Reference",
      '<div class="s-label">Your design</div><button type="button" class="s-slot empty" id="r-slot-src" data-slot="src"></button>' +
      '<div class="s-label">Reference</div><button type="button" class="s-slot empty" id="r-slot-ref" data-slot="refimg"></button>' +
      '<div class="s-label">Take from the reference</div><div class="s-seg" id="r-mode">' +
      Object.keys(REF).map(function (k) { return '<button type="button" data-v="' + k + '">' + REF[k][0] + "</button>"; }).join("") + "</div>" +
      '<p class="s-hint" id="r-mode-hint"></p>' +
      '<div class="s-label">Extra instructions (optional)</div><textarea class="s-prompt" id="r-text" style="min-height:60px" placeholder="e.g. the floor console must match the reference view"></textarea>' +
      keepSlider("r") + varsChips("r"), "Transfer") +
      stage("r", '<div class="s-twin"><div class="box" id="r-twin-a"></div><div class="box" id="r-twin-b"></div></div>');
    document.body.appendChild(ref);

    var lib = document.createElement("div");
    lib.className = "s-page"; lib.id = "p-library";
    lib.innerHTML = '<div class="s-scroll"><div class="s-ttl">Library<small id="l-sub"></small></div>' +
      '<div class="s-acts"><button type="button" id="l-open">Open folder</button></div>' +
      '<div class="s-filters" id="l-filters">' + ["all", "create", "reference", "upscale"].map(function (f) {
        return '<button type="button" data-v="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + "</button>";
      }).join("") + '</div><div class="s-grid" id="l-grid"></div></div>';
    document.body.appendChild(lib);

    var set = document.createElement("div");
    set.className = "s-page"; set.id = "p-settings";
    set.innerHTML = '<div class="s-scroll" id="s-body"></div>';
    document.body.appendChild(set);

    wire();
    painter.init();
    go(load("page", "create"));
    refresh();
  }

  // ------------------------------------------------------------------ actions

  function go(p) {
    if (["create", "reference", "upscale", "library", "settings"].indexOf(p) < 0) p = "create";
    S.page = p; keep("page", p);
    document.body.setAttribute("data-page", p);
    document.querySelectorAll(".s-nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-page") === p); });
    document.querySelectorAll(".s-page").forEach(function (el) { el.classList.toggle("on", el.id === "p-" + p); });
    if (api()) api().studio_drop_target(p);
    if (p === "library") loadLibrary();
    if (p === "settings" || p === "create" || p === "reference") refresh();
    render();
  }

  function refresh() {
    if (!api()) return;
    api().studio_status().then(function (st) {
      if (!st) return;
      S.status = st; S.engine = st.engine || S.engine;
      if (st.setup_running && !S.setup.run) S.setup.run = { label: "Setting up", fraction: null };
      render();
    });
  }

  function loadLibrary() {
    S.lib.loading = true; render();
    api().studio_library().then(function (items) { S.lib.items = items || []; S.lib.loading = false; render(); });
  }

  function P(id) { return id === "c" ? S.create : S.ref; }
  function current(p) { return p.sel >= 0 ? p.results[p.sel] : null; }

  function setImage(p, slot, info) {
    if (!info) return;
    p[slot] = info;
    if (p === S.create && slot === "src") { p.results = []; p.sel = -1; painter.reset(info); }
    render();
  }

  function pick(id, slot) {
    api().studio_pick().then(function (info) { setImage(P(id), slot, info); });
  }

  function job(id, extra) {
    var p = P(id);
    var st = S.status;
    if (!p.src || p.job || !st || !st.create_ready) return;
    if (id === "r" && !p.refimg) return;
    var j = {
      mode: id === "c" ? "create" : "reference", image: p.src.path, name: p.src.name,
      preset: p.preset, text: p.text, keep: hasConsistency() ? p.keep : 0, variations: p.vars
    };
    if (id === "r") j.reference = p.refimg.path;
    if (id === "c") {
      if (p.area === "paint") {
        var m = painter.export();
        if (!m) { p.error = "Paint over the part that should change first."; render(); return; }
        j.mask = m; j.blend = p.blend;
      }
      j.lora = p.lora || null;
      if (p.juice > 0 && p.juiceLora && st.juice_ready) { j.juice = p.juice; j.juice_lora = p.juiceLora; }
    }
    Object.assign(j, extra || {});
    p.error = ""; p.stage = "Starting"; p.frac = 0; p.pending = j.variations;
    api().studio_run(j).then(function (jid) {
      if (jid) { if (p.job === "starting") p.job = jid; } else { p.job = null; p.pending = 0; refresh(); }
      render();
    });
    p.job = "starting";
    render();
  }

  function refine(id) {
    var p = P(id), input = $(id + "-refine"), text = input.value.trim();
    if (!text || p.job) return;
    var base = current(p) || p.src;
    if (!base) return;
    input.value = "";
    job(id, { mode: "create", image: base.path, preset: "", text: "Keep everything else exactly the same. " + text,
              variations: 1, refine_of: base.path, reference: null });
  }

  function hasConsistency() {
    var st = S.status;
    return !!(st && st.files.some(function (f) { return f.key === "consistency" && f.ready; }));
  }

  // ------------------------------------------------------------------ wiring

  function wire() {
    document.querySelector(".s-nav").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-page]"); if (b) go(b.getAttribute("data-page"));
    });
    // Create
    $("c-slot").addEventListener("click", function () { pick("c", "src"); });
    $("c-area").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      S.create.area = b.getAttribute("data-v"); if (S.create.area === "paint") S.create.sel = -1; render();
    });
    $("c-presets").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var v = b.getAttribute("data-v"); S.create.preset = S.create.preset === v ? "" : v; keep("c.preset", S.create.preset); render();
    });
    $("c-text").addEventListener("input", function () { S.create.text = this.value; });
    $("c-blend").addEventListener("input", function () { S.create.blend = +this.value; keep("c.blend", S.create.blend); renderValues(); });
    $("c-lora").addEventListener("change", function () { S.create.lora = this.value; keep("c.lora", this.value); });
    $("c-juice").addEventListener("input", function () { S.create.juice = +this.value; keep("c.juice", S.create.juice); renderValues(); });
    $("c-juice-lora").addEventListener("change", function () { S.create.juiceLora = this.value; keep("c.juiceLora", this.value); });
    // Reference
    $("r-slot-src").addEventListener("click", function () { pick("r", "src"); });
    $("r-slot-ref").addEventListener("click", function () { pick("r", "refimg"); });
    $("r-mode").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      S.ref.preset = b.getAttribute("data-v"); keep("r.preset", S.ref.preset); render();
    });
    $("r-text").addEventListener("input", function () { S.ref.text = this.value; });
    ["c", "r"].forEach(function (id) {
      var p = P(id), pre = id === "c" ? "c." : "r.";
      $(id + "-keep").addEventListener("input", function () { p.keep = +this.value; keep(pre + "keep", p.keep); renderValues(); });
      $(id + "-vars").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return; p.vars = +b.getAttribute("data-n"); keep(pre + "vars", p.vars); render();
      });
      $(id + "-go").addEventListener("click", function () { job(id); });
      $(id + "-cancel").addEventListener("click", function () { api().studio_cancel(); });
      $(id + "-refine-go").addEventListener("click", function () { refine(id); });
      $(id + "-refine").addEventListener("keydown", function (e) { if (e.key === "Enter") refine(id); });
      $(id + "-up").addEventListener("click", function () {
        var c = current(p); if (!c) return;
        api().studio_to_upscale(c.path).then(function () { go("upscale"); });
      });
      $(id + "-reveal").addEventListener("click", function () { var c = current(p); if (c) api().reveal(c.path); });
      $(id + "-strip").addEventListener("click", function (e) {
        var t = e.target.closest("[data-i]"); if (t) { p.sel = +t.getAttribute("data-i"); render(); return; }
        if (e.target.closest(".s-more")) job(id, { variations: 1 });
      });
      // Hold on a result to see what it started from.
      var view = $(id + "-view");
      view.addEventListener("pointerdown", function () { var img = view.querySelector("img.s-res"); if (img && p.src) { img.src = p.src.preview; view.classList.add("hold"); } });
      var up = function () { var img = view.querySelector("img.s-res"), c = current(p); if (img && c) img.src = c.preview; };
      view.addEventListener("pointerup", up); view.addEventListener("pointerleave", up);
    });
    // Library
    $("l-filters").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; S.lib.filter = b.getAttribute("data-v"); render();
    });
    $("l-open").addEventListener("click", function () { api().studio_open_outputs(); });
    $("l-grid").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]"); if (!b) return;
      var path = b.closest(".s-card").getAttribute("data-path"), act = b.getAttribute("data-act");
      if (act === "folder") api().reveal(path);
      else if (act === "upscale") api().studio_to_upscale(path).then(function () { go("upscale"); });
      else if (act === "edit") api().studio_image(path).then(function (info) { setImage(S.create, "src", info); go("create"); });
      else if (act === "ref") api().studio_image(path).then(function (info) { setImage(S.ref, "src", info); go("reference"); });
    });
    // Settings and setup (the same buttons appear in both)
    document.body.addEventListener("click", function (e) {
      var b = e.target.closest("[data-su]"); if (!b) return;
      var a = b.getAttribute("data-su");
      if (a === "take") api().studio_take_from(b.getAttribute("data-path") || "");
      else if (a === "take-other") api().studio_take_from("");
      else if (a === "download") { S.setup.error = ""; api().studio_setup(false); S.setup.run = { label: "Starting", fraction: null }; render(); }
      else if (a === "download-juice") { S.setup.error = ""; api().studio_setup(true); S.setup.run = { label: "Starting", fraction: null }; render(); }
      else if (a === "cancel") api().studio_cancel();
      else if (a === "page") api().open_url(b.getAttribute("data-url"));
      else if (a === "home") api().studio_choose_home().then(function (st) { if (st) S.status = st; render(); });
      else if (a === "models") api().studio_open_models();
      else if (a === "outputs") api().studio_open_outputs();
      else if (a === "refresh") refresh();
    });
    // Which slot a drop lands in.
    window.addEventListener("dragover", function (e) {
      var s = e.target.closest && e.target.closest("[data-slot]");
      document.querySelectorAll(".s-slot.drag").forEach(function (x) { if (x !== s) x.classList.remove("drag"); });
      if (s) s.classList.add("drag");
      S.dropSlot = s ? s.getAttribute("data-slot") : "";
    });
    window.addEventListener("drop", function () { setTimeout(function () { document.querySelectorAll(".s-slot.drag").forEach(function (x) { x.classList.remove("drag"); }); }, 50); });
    document.addEventListener("keydown", function (e) {
      var pg = S.page; if (pg !== "create" && pg !== "reference") return;
      var inText = /^(TEXTAREA|INPUT)$/.test((document.activeElement || {}).tagName || "");
      var id = pg === "create" ? "c" : "r";
      if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); job(id); return; }
      if (e.ctrlKey && e.key.toLowerCase() === "v" && !inText) {
        e.preventDefault();
        api().studio_paste().then(function (info) {
          if (!info) return;
          var p = P(id), slot = id === "r" ? (S.dropSlot || (p.src ? "refimg" : "src")) : "src";
          setImage(p, slot, info);
        });
        return;
      }
      if (pg === "create" && S.create.area === "paint" && !inText) painter.key(e);
    });
    new ResizeObserver(function () { layout(); }).observe(document.body);
  }

  // ------------------------------------------------------------------ the brush

  var painter = {
    w: 0, h: 0, size: load("brush", 60), erase: false, undo: [], canvas: null, ctx: null, ring: null, drawing: false, last: null, any: false,
    init: function () {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.ring = document.createElement("div"); this.ring.className = "s-ring"; this.ring.hidden = true;
      var self = this, c = this.canvas;
      c.style.opacity = ".5";
      c.addEventListener("pointerdown", function (e) { c.setPointerCapture(e.pointerId); self.push(); self.drawing = true; self.last = null; self.stroke(e); });
      c.addEventListener("pointermove", function (e) { self.moveRing(e); if (self.drawing) self.stroke(e); });
      c.addEventListener("pointerup", function () { self.drawing = false; render(); });
      c.addEventListener("pointerleave", function () { self.ring.hidden = true; });
      c.addEventListener("pointerenter", function () { self.ring.hidden = false; });
      c.addEventListener("wheel", function (e) { e.preventDefault(); self.resize(e.deltaY < 0 ? 1.15 : 1 / 1.15); self.moveRing(e); }, { passive: false });
    },
    reset: function (info) {
      var f = Math.min(1, 2048 / Math.max(info.w, info.h));
      this.w = Math.max(1, Math.round(info.w * f)); this.h = Math.max(1, Math.round(info.h * f));
      this.canvas.width = this.w; this.canvas.height = this.h;
      this.ctx.clearRect(0, 0, this.w, this.h); this.undo = []; this.any = false;
    },
    scale: function () { var r = this.canvas.getBoundingClientRect(); return r.width ? this.w / r.width : 1; },
    point: function (e) { var r = this.canvas.getBoundingClientRect(), k = this.scale(); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; },
    stroke: function (e) {
      var ctx = this.ctx, pt = this.point(e), rad = this.size * this.scale() / 2;
      ctx.globalCompositeOperation = this.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = ctx.fillStyle = "#8A2BF2"; ctx.lineCap = ctx.lineJoin = "round"; ctx.lineWidth = rad * 2;
      ctx.beginPath();
      if (this.last) { ctx.moveTo(this.last[0], this.last[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); }
      else { ctx.arc(pt[0], pt[1], rad, 0, Math.PI * 2); ctx.fill(); }
      this.last = pt; if (!this.erase) this.any = true;
    },
    moveRing: function (e) {
      // The ring lives in the view, not in the picture's box: measure from there.
      var r = (this.ring.parentNode || this.canvas).getBoundingClientRect();
      this.ring.style.left = (e.clientX - r.left) + "px"; this.ring.style.top = (e.clientY - r.top) + "px";
      this.ring.style.width = this.ring.style.height = this.size + "px";
    },
    resize: function (f) { this.size = Math.max(6, Math.min(400, Math.round(this.size * f))); keep("brush", this.size); var s = $("c-size"); if (s) s.value = this.size; },
    push: function () { if (this.w) { this.undo.push(this.ctx.getImageData(0, 0, this.w, this.h)); if (this.undo.length > 25) this.undo.shift(); } },
    back: function () { var d = this.undo.pop(); if (d) this.ctx.putImageData(d, 0, 0); this.check(); render(); },
    clear: function () { this.push(); this.ctx.clearRect(0, 0, this.w, this.h); this.any = false; render(); },
    invert: function () {
      this.push();
      var t = document.createElement("canvas"); t.width = this.w; t.height = this.h;
      var tc = t.getContext("2d"); tc.fillStyle = "#8A2BF2"; tc.fillRect(0, 0, this.w, this.h);
      tc.globalCompositeOperation = "destination-out"; tc.drawImage(this.canvas, 0, 0);
      this.ctx.globalCompositeOperation = "source-over"; this.ctx.clearRect(0, 0, this.w, this.h); this.ctx.drawImage(t, 0, 0);
      this.check(); render();
    },
    check: function () {
      if (!this.w) { this.any = false; return; }
      var d = this.ctx.getImageData(0, 0, this.w, this.h).data, step = 4 * 7;
      for (var i = 3; i < d.length; i += step) if (d[i] > 20) { this.any = true; return; }
      this.any = false;
    },
    export: function () { this.check(); return this.any ? this.canvas.toDataURL("image/png") : null; },
    key: function (e) {
      if (e.key === "[") this.resize(1 / 1.2);
      else if (e.key === "]") this.resize(1.2);
      else if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); this.back(); }
      else if (e.key.toLowerCase() === "b") { this.erase = false; render(); }
      else if (e.key.toLowerCase() === "e") { this.erase = true; render(); }
    },
    tools: function () {
      return '<div class="s-tools" id="c-tools">' +
        '<button type="button" data-t="brush" class="' + (this.erase ? "" : "on") + '">' + svg("brush") + "Brush</button>" +
        '<button type="button" data-t="erase" class="' + (this.erase ? "on" : "") + '">' + svg("erase") + "Erase</button>" +
        '<span class="sep"></span><label>Size <input type="range" id="c-size" min="6" max="400" value="' + this.size + '"></label><span class="sep"></span>' +
        '<button type="button" data-t="undo">' + svg("undo") + "Undo</button>" +
        '<button type="button" data-t="clear">Clear</button><button type="button" data-t="invert">Invert</button></div>' +
        '<div class="s-maskhint">Paint what should change · [ ] or mouse wheel: brush size</div>';
    }
  };

  // ------------------------------------------------------------------ render

  function slotHTML(info, hint, emptyText) {
    if (!info) return emptyText;
    return '<img src="' + info.preview + '" alt=""><span><b>' + esc(info.name) + "</b><small>" + info.w + " × " + info.h + " · " + hint + "</small></span>";
  }

  function setSlot(el, info, hint, emptyText) {
    var key = info ? info.path : "";
    if (el.getAttribute("data-k") === key) return;
    el.setAttribute("data-k", key);
    el.classList.toggle("empty", !info);
    el.innerHTML = slotHTML(info, hint, emptyText);
  }

  function on(el, attr, v) { el.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.getAttribute(attr) === String(v)); }); }

  function renderValues() {
    ["c", "r"].forEach(function (id) {
      var p = P(id);
      $(id + "-keep").value = p.keep;
      $(id + "-keep-v").textContent = p.keep >= 0.95 ? "Exact" : p.keep <= 0.05 ? "Off" : Math.round(p.keep * 100) + "%";
    });
    $("c-blend").value = S.create.blend; $("c-blend-v").textContent = Math.round(S.create.blend * 100) + "%";
    $("c-juice").value = S.create.juice; $("c-juice-v").textContent = S.create.juice > 0 ? Math.round(S.create.juice * 100) + "%" : "Off";
  }

  function options(sel, list, value, none) {
    var html = '<option value="">' + none + "</option>" + list.map(function (l) {
      return '<option value="' + esc(l.name) + '"' + (l.name === value ? " selected" : "") + ">" + esc(l.name.replace(/\.safetensors$/, "")) + "</option>";
    }).join("");
    if (sel.getAttribute("data-h") !== html) { sel.innerHTML = html; sel.setAttribute("data-h", html); }
    sel.value = list.some(function (l) { return l.name === value; }) ? value : "";
  }

  function renderRail(id) {
    var p = P(id), st = S.status, ready = st && st.create_ready;
    var busy = !!p.job;
    var can = ready && p.src && (id === "c" || p.refimg) && !busy;
    $(id + "-go").disabled = !can;
    $(id + "-cancel").hidden = !busy;
    $(id + "-fill").style.width = busy ? Math.round((p.frac || 0) * 100) + "%" : "0";
    var label = id === "c" ? (S.create.area === "paint" ? "Change painted area" : "Create") : "Transfer";
    $(id + "-golabel").textContent = busy ? (p.stage || "Working") : label;
    var meta = "";
    if (busy && S.engine.state === "starting") meta = S.engine.message;
    else if (!ready) meta = st ? "Set up image generation first" : "";
    else meta = p.vars + (p.vars > 1 ? " variations" : " variation") + " · the first run of a session loads the models (about a minute)";
    $(id + "-meta").textContent = meta;
    $(id + "-err").hidden = !p.error; $(id + "-err").textContent = p.error;
    on($(id + "-vars"), "data-n", p.vars);
    var cons = hasConsistency();
    [id + "-keep-l", id + "-keep", id + "-keep-e"].forEach(function (k) { $(k).hidden = !cons; });
    $(id + "-keep-none").hidden = cons || !st;
  }

  function renderCreate() {
    var p = S.create, st = S.status;
    setSlot($("c-slot"), p.src, "click to change", "Drop a sketch or render here, or click");
    on($("c-area"), "data-v", p.area);
    $("c-area-hint").hidden = p.area !== "paint";
    on($("c-presets"), "data-v", p.preset);
    var pr = PRESETS.filter(function (x) { return x[0] === p.preset; })[0];
    $("c-text").placeholder = pr ? pr[2] : "Describe the image you want";
    if ($("c-text").value !== p.text && document.activeElement !== $("c-text")) $("c-text").value = p.text;
    $("c-blend-w").hidden = p.area !== "paint";
    var looks = st ? st.loras.filter(function (l) { return l.family === "klein9b" && !/klein-consistency/i.test(l.name); }) : [];
    $("c-look-w").hidden = !looks.length;
    options($("c-lora"), looks, p.lora, "Klein only");
    var juicy = st ? st.loras.filter(function (l) { return l.family === "flux1"; }) : [];
    $("c-juice-w").hidden = !(st && st.juice_ready && juicy.length);
    if (!p.juiceLora && juicy.length) p.juiceLora = juicy[0].name;
    options($("c-juice-lora"), juicy, p.juiceLora, "Choose a Flux.1 LoRA");
    renderRail("c");
    renderStage("c");
  }

  function renderReference() {
    var p = S.ref;
    setSlot($("r-slot-src"), p.src, "the design to keep", "Drop your design here, or click");
    setSlot($("r-slot-ref"), p.refimg, "what to copy", "Drop the reference here, or click");
    on($("r-mode"), "data-v", p.preset);
    $("r-mode-hint").textContent = (REF[p.preset] || REF.camera)[1];
    if ($("r-text").value !== p.text && document.activeElement !== $("r-text")) $("r-text").value = p.text;
    var tw = function (el, info, tag) {
      var k = info ? info.path : "";
      if (el.getAttribute("data-k") === k) return;
      el.setAttribute("data-k", k);
      el.innerHTML = info ? '<img src="' + info.preview + '" alt=""><span class="s-tag">' + tag + "</span>" : '<span class="s-tag">' + tag + "</span>";
    };
    tw($("r-twin-a"), p.src, "Your design"); tw($("r-twin-b"), p.refimg, "Reference");
    renderRail("r");
    renderStage("r");
  }

  function gate(id) {
    var st = S.status, g = $(id + "-gate"), stg = $(id + "-stage");
    var show = st && !st.create_ready;
    g.hidden = !show; stg.hidden = !!show;
    if (show) { var h = setupCard(); if (g.getAttribute("data-h") !== h) { g.innerHTML = h; g.setAttribute("data-h", h); } }
    return show;
  }

  function renderStage(id) {
    if (gate(id)) return;
    var p = P(id), c = current(p);
    var name = c ? short(c.name) : (p.src ? p.src.name : (id === "c" ? "Create" : "Reference"));
    var sub = c ? c.w + " × " + c.h + (c.meta && c.meta.text ? " · " + esc(c.meta.text).slice(0, 90) : "")
      : p.src ? (id === "c" && p.area === "paint" ? "Paint over what should change" : p.src.w + " × " + p.src.h) : "";
    var ttl = esc(name) + "<small>" + sub + "</small>";
    if ($(id + "-ttl").getAttribute("data-h") !== ttl) { $(id + "-ttl").innerHTML = ttl; $(id + "-ttl").setAttribute("data-h", ttl); }
    $(id + "-up").disabled = !c; $(id + "-reveal").disabled = !c;
    $(id + "-refine-go").disabled = !!p.job || !(c || p.src);

    // The big view.
    var view = $(id + "-view"), mode, key;
    if (c) { mode = "result"; key = c.path; }
    else if (id === "c" && p.src && p.area === "paint") { mode = "paint"; key = p.src.path; }
    else if (p.src && id === "c") { mode = "src"; key = p.src.path; }
    else { mode = "empty"; key = id + (p.src ? "1" : "0"); }
    key = mode + ":" + key + (mode === "paint" ? ":" + painter.erase : "");
    if (view.getAttribute("data-k") !== key) {
      view.setAttribute("data-k", key);
      if (mode === "empty") {
        view.innerHTML = id === "c"
          ? '<div class="s-empty"><b>Start from a sketch or a render</b>Drop it anywhere on this page, paste it with Ctrl V, or click Start from.</div>'
          : '<div class="s-empty"><b>' + (p.src ? "Now add a reference" : "Add your design and a reference") + "</b>The result appears here.</div>";
      } else if (mode === "paint") {
        view.innerHTML = '<div class="s-fit" data-w="' + p.src.w + '" data-h="' + p.src.h + '"><img src="' + p.src.preview + '" alt=""></div>' + painter.tools();
        var fit = view.querySelector(".s-fit");
        fit.appendChild(painter.canvas);
        view.appendChild(painter.ring);
        view.querySelector("#c-tools").addEventListener("click", function (e) {
          var b = e.target.closest("button[data-t]"); if (!b) return;
          var t = b.getAttribute("data-t");
          if (t === "brush" || t === "erase") { painter.erase = t === "erase"; render(); }
          else if (t === "undo") painter.back(); else if (t === "clear") painter.clear(); else if (t === "invert") painter.invert();
        });
        $("c-size").addEventListener("input", function () { painter.size = +this.value; keep("brush", painter.size); });
      } else {
        var info = mode === "result" ? c : p.src;
        view.innerHTML = '<div class="s-fit" data-w="' + info.w + '" data-h="' + info.h + '"><img class="' + (mode === "result" ? "s-res" : "") + '" src="' + info.preview + '" alt=""></div>' +
          (mode === "result" ? '<span class="s-tag">Result · hold to see the original</span>' : '<span class="s-tag">Original</span>');
      }
    }
    var busy = view.querySelector(".s-busy");
    if (p.job) {
      if (!busy) { busy = document.createElement("div"); busy.className = "s-busy"; busy.innerHTML = '<span></span><i><b></b></i>'; view.appendChild(busy); }
      busy.querySelector("span").textContent = (S.engine.state === "starting" ? S.engine.message : p.stage) || "Working";
      busy.querySelector("b").style.width = Math.round((p.frac || 0) * 100) + "%";
    } else if (busy) busy.remove();

    // The strip: original, results, placeholders, + Another.
    var strip = "";
    if (p.src && p.results.length) strip += '<img data-i="-1" class="' + (p.sel < 0 ? "sel" : "") + '" src="' + p.src.preview + '" title="Original" alt="">';
    p.results.forEach(function (r, i) { strip += '<img data-i="' + i + '" class="' + (i === p.sel ? "sel" : "") + '" src="' + r.preview + '" title="' + esc(short(r.name)) + '" alt="">'; });
    for (var k = 0; k < (p.job ? p.pending : 0); k++) strip += '<span class="s-ph"></span>';
    if (p.results.length && !p.job) strip += '<button type="button" class="s-more">+ Another</button>';
    var sk = $(id + "-strip");
    if (sk.getAttribute("data-h") !== strip) { sk.innerHTML = strip; sk.setAttribute("data-h", strip); }
    layout();
  }

  function layout() {
    document.querySelectorAll(".s-page.on .s-fit").forEach(function (f) {
      var v = f.parentNode, W = v.clientWidth, H = v.clientHeight, w = +f.getAttribute("data-w"), h = +f.getAttribute("data-h");
      if (!W || !H || !w || !h) return;
      var k = Math.min(W / w, H / h), fw = Math.round(w * k), fh = Math.round(h * k);
      f.style.width = fw + "px"; f.style.height = fh + "px";
      f.style.left = Math.round((W - fw) / 2) + "px"; f.style.top = Math.round((H - fh) / 2) + "px";
    });
  }

  function gb(n) { return n >= 10 ? Math.round(n) + " GB" : (Math.round(n * 10) / 10) + " GB"; }

  function fileRows(files) {
    return files.map(function (f) {
      var right;
      if (f.ready) right = '<span class="s-ok">Ready</span>';
      else if (f.can_download) right = '<span class="s-miss">Missing</span>';
      else if (f.page) right = '<button type="button" class="s-link" data-su="page" data-url="' + esc(f.page) + '">Get it</button>';
      else right = '<span class="s-miss">' + (f.optional ? "Optional" : "Missing") + "</span>";
      return '<div class="s-row"><div class="n"><b>' + esc(f.label) + "</b><small>" + esc(f.about) + (f.ready ? "" : " · " + esc(f.file)) + '</small></div><span class="s-pill">' + gb(f.gb) + "</span>" + right + "</div>";
    }).join("");
  }

  function progressHTML() {
    var r = S.setup.run;
    if (!r) return S.setup.error ? '<div class="s-err">' + esc(S.setup.error) + "</div>" : (S.setup.done ? '<p class="s-ok">' + esc(S.setup.done) + "</p>" : "");
    var ind = r.fraction == null;
    return '<div><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:var(--ink)">' + esc(r.label) + '</p><div class="s-bar' + (ind ? " ind" : "") + '"><i style="width:' + Math.round((r.fraction || 0) * 100) + '%"></i></div></div>' +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="cancel">Stop</button></div>';
  }

  function setupCard() {
    var st = S.status, files = st.files.filter(function (f) { return f.part === "create"; });
    var dl = files.filter(function (f) { return !f.ready && f.can_download; }).reduce(function (a, f) { return a + f.gb; }, 0) + (st.engine_installed ? 0 : 2.1);
    var needHand = files.filter(function (f) { return !f.ready && !f.can_download && !f.optional; });
    var running = !!S.setup.run;
    var take = st.comfy_models
      ? '<button type="button" class="s-btn p" data-su="take" data-path="' + esc(st.comfy_models) + '"' + (running ? " disabled" : "") + '>Take files from my ComfyUI</button><button type="button" class="s-btn" data-su="take-other"' + (running ? " disabled" : "") + ">Another folder…</button>"
      : '<button type="button" class="s-btn p" data-su="take-other"' + (running ? " disabled" : "") + ">Take files from a folder…</button>";
    return '<div class="s-su"><h1>Set up image generation</h1>' +
      "<p>A one-time setup. Afterwards everything runs on this PC, also without internet. " + (st.free_gb ? st.free_gb + " GB free where Vistiq Studio keeps its files." : "") + "</p>" +
      (st.comfy_models ? "<p>Found ComfyUI models in <b>" + esc(st.comfy_models) + "</b>. Files are linked from there, so they take no extra space.</p>" : "<p>If you already have these files in a ComfyUI folder, take them from there: no download, no extra space.</p>") +
      '<div class="s-btns">' + take + "</div>" +
      '<div class="s-list">' + fileRows(files) + "</div>" +
      (needHand.length ? "<p>" + esc(needHand.map(function (f) { return f.label; }).join(", ")) + " can't be downloaded for you: its maker asks you to accept their licence first. Click Get it, sign in, download the file, then take it from your Downloads folder.</p>" : "") +
      (dl > 0 ? '<div class="s-btns"><button type="button" class="s-go" style="height:48px" data-su="download"' + (running ? " disabled" : "") + "><span>Download the rest · about " + gb(dl) + "</span></button></div>" : "") +
      progressHTML() + "</div>";
  }

  function renderSettings() {
    var st = S.status, el = $("s-body");
    if (!st) { el.innerHTML = '<div class="s-ttl">Settings</div>'; return; }
    var juice = st.files.filter(function (f) { return f.part === "juice"; });
    var jdl = juice.filter(function (f) { return !f.ready && f.can_download; }).length;
    var running = !!S.setup.run;
    var loras = st.loras.length ? st.loras.map(function (l) {
      var use = l.family === "klein9b" ? (/klein-consistency/i.test(l.name) ? "Keep my design" : "Create · Look") : l.family === "flux1" ? "Create · Juice" : "Not usable here";
      return '<div class="s-row"><div class="n"><b>' + esc(l.name.replace(/\.safetensors$/, "")) + "</b><small>Made for " + esc(familyLabel(l.family)) + " · " + use + '</small></div><span class="s-pill">' + gb(l.gb) + "</span></div>";
    }).join("") : '<div class="s-row"><div class="n"><small>No LoRAs yet. Put .safetensors files in the LoRAs folder, or take them from your ComfyUI.</small></div></div>';
    var h = '<div class="s-ttl">Settings</div>' +
      '<div class="s-sec">Vistiq Studio folder</div>' +
      '<button type="button" class="s-folder" data-su="home"><code>' + esc(st.home) + "</code><em>Change</em></button>" +
      '<div class="s-tree">' + esc(st.home.split(/[\\/]/).pop()) + "<br>├─ <b>Outputs</b> — every result, by date<br>└─ <b>Models</b> — image model, text encoders, LoRAs<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ <b>loras</b> — drop your own LoRAs here</div>" +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="outputs">Open Outputs</button><button type="button" class="s-btn" data-su="models">Open Models</button>' +
      '<button type="button" class="s-btn" data-su="take-other"' + (running ? " disabled" : "") + ">Take files from a folder…</button>" +
      (st.comfy_models ? '<button type="button" class="s-btn" data-su="take" data-path="' + esc(st.comfy_models) + '"' + (running ? " disabled" : "") + ">Take from my ComfyUI</button>" : "") + "</div>" +
      progressHTML() +
      '<div class="s-sec">Image generation</div><div class="s-list">' + fileRows(st.files.filter(function (f) { return f.part === "create"; })) + "</div>" +
      '<div class="s-sec">Juice (optional)</div><p class="s-hint">A second, light pass with Flux.1 and a style LoRA, for richer light and materials. Needs Flux.1 dev and a Flux.1 LoRA.</p>' +
      '<div class="s-list">' + fileRows(juice) + "</div>" +
      (jdl ? '<div class="s-btns"><button type="button" class="s-btn p" data-su="download-juice"' + (running ? " disabled" : "") + ">Download the Juice text encoders and VAE</button></div>" : "") +
      '<div class="s-sec">LoRAs</div><div class="s-list">' + loras + "</div>" +
      '<div class="s-sec">Image engine</div><p class="s-hint">' + (st.engine_installed ? "Installed. " : "Not set up yet. ") + esc(S.engine.message || "") +
      " The upscaler keeps its own engine; they take turns on the graphics card.</p>" +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="refresh">Check again</button></div>';
    if (el.getAttribute("data-h") !== h) { el.innerHTML = h; el.setAttribute("data-h", h); }
  }

  function familyLabel(f) {
    return { klein9b: "FLUX.2 Klein 9B", klein4b: "FLUX.2 Klein 4B", flux1: "Flux.1", sdxl: "SDXL", sd15: "SD 1.5" }[f] || "an unknown model";
  }

  function renderLibrary() {
    var f = S.lib.filter, items = S.lib.items.filter(function (i) { return f === "all" || i.kind === f; });
    on($("l-filters"), "data-v", f);
    $("l-sub").textContent = S.status ? "Everything you made, newest first · " + S.status.home + "\\Outputs" : "";
    var h = items.length ? items.map(function (i) {
      var pill = i.kind.charAt(0).toUpperCase() + i.kind.slice(1);
      return '<div class="s-card" data-path="' + esc(i.path) + '" title="' + esc(i.text || i.name) + '"><img src="' + i.thumb + '" alt="" loading="lazy">' +
        '<div class="s-hover"><button type="button" data-act="edit">Edit</button><button type="button" data-act="ref">Use as design</button><button type="button" data-act="upscale">Upscale</button><button type="button" data-act="folder">Folder</button></div>' +
        '<div class="s-cap"><span>' + esc(short(i.name)) + '</span><span class="s-pill">' + pill + "</span></div></div>";
    }).join("") : '<div class="s-none">' + (S.lib.loading ? "Loading…" : "Nothing here yet. What you create and upscale shows up here.") + "</div>";
    var g = $("l-grid");
    if (g.getAttribute("data-h") !== h) { g.innerHTML = h; g.setAttribute("data-h", h); }
  }

  function render() {
    if (!document.body.classList.contains("studio")) return;
    renderValues();
    if (S.page === "create") renderCreate();
    else if (S.page === "reference") renderReference();
    else if (S.page === "library") renderLibrary();
    else if (S.page === "settings") renderSettings();
  }

  // ------------------------------------------------------------------ from Python

  function byJob(id) {
    var p = S.create.job === id ? S.create : S.ref.job === id ? S.ref : null;
    if (!p) p = S.create.job === "starting" ? S.create : S.ref.job === "starting" ? S.ref : null;
    if (p && id) p.job = id;
    return p;
  }

  function hook() {
    var base = window.vistiq.event;
    window.vistiq.event = function (kind, data) {
      if (kind.indexOf("studio-") !== 0) return base(kind, data);
      if (kind === "studio-engine") S.engine = data;
      else if (kind === "studio-job") {
        var p = byJob(data.id);
        if (!p) return;
        if (data.state === "running") { p.stage = data.stage; p.frac = data.fraction == null ? p.frac : data.fraction; }
        else {
          p.job = null; p.pending = 0; p.stage = ""; p.frac = 0;
          p.error = data.state === "error" ? (data.message || "Something went wrong.") : "";
        }
      } else if (kind === "studio-result") {
        var q = byJob(data.id); if (!q) return;
        q.results.push(data.result); q.pending = Math.max(0, q.pending - 1);
        if (data.index === 0) q.sel = q.results.length - 1;
      } else if (kind === "studio-setup") {
        if (data.state === "running") { S.setup.run = { label: data.label, fraction: data.fraction }; S.setup.error = ""; S.setup.done = ""; }
        else {
          S.setup.run = null;
          S.setup.error = data.state === "error" ? data.message : "";
          if (data.state === "done") {
            S.setup.done = data.taken ? (data.taken.length ? "Took " + data.taken.length + " file" + (data.taken.length > 1 ? "s" : "") + "." : "Nothing new to take from there.") : "Done.";
          }
          if (data.status) S.status = Object.assign(S.status || {}, data.status);
          refresh();
        }
      } else if (kind === "studio-dropped") {
        var imgs = (data.images || []).filter(Boolean);
        if (!imgs.length) return;
        if (data.target === "reference") {
          if (imgs.length > 1) { setImage(S.ref, "src", imgs[0]); setImage(S.ref, "refimg", imgs[1]); }
          else setImage(S.ref, S.dropSlot || (S.ref.src && !S.ref.refimg ? "refimg" : "src"), imgs[0]);
        } else if (data.target === "create" || data.target === "library") {
          setImage(S.create, "src", imgs[0]); if (data.target === "library") go("create");
        }
      }
      render();
    };
  }

  function start() {
    api().init().then(function (s) {
      if (!s || s.flavor !== "studio") return;
      document.title = "Vistiq Studio";
      hook();
      build();
    });
  }
  if (api()) start(); else window.addEventListener("pywebviewready", start);
})();
