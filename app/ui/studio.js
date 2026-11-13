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
    cmf: '<circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/><path d="M14 6h6v6"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    photo: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M8 6l2-3h4l2 3"/>',
    sketch: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    brush: '<path d="M4 20c2 0 4-1 4-3s2-3 3-3l7-7-3-3-7 7c0 1-1 3-3 3s-3 2-3 4z"/>',
    erase: '<path d="M7 20h10M5 15l9-9 5 5-9 9H6z"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
    select: '<path d="M4 4l6 16 2.5-6.5L19 11z"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + "</svg>"; }

  var PRESETS = [
    ["sketch", "Sketch to photo", "Turn this sketch into a photo of… (e.g. a pickup truck, matte olive paint, desert light)", "sketch"],
    ["cmf", "CMF", "Change the materials to… (e.g. brushed brass base, linen shade)", "cmf"],
    ["lighting", "Lighting", "Change the lighting to… (e.g. golden hour from the left, soft shadows)", "light"],
    ["photo", "Photoreal", "Make it look like a real photo, with… (e.g. magazine lighting)", "photo"]
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
    create: page({ source: load("c.source", "image"), area: "whole", preset: ["sketch", "cmf", "lighting", "photo"].indexOf(load("c.preset", "sketch")) >= 0 ? load("c.preset", "sketch") : "sketch", text: "", keep: load("c.keep", 0.8), vars: load("c.vars", 2),
                   blend: load("c.blend2", 0.15), lora: load("c.lora", ""), juice: load("c.juice", 0), juiceLora: load("c.juiceLora", "") }),
    ref: page({ refimg: null, preset: load("r.preset", "camera"), text: "", keep: load("r.keep", 0.8), vars: load("r.vars", 1) }),
    dropSlot: "", liveApp: load("liveApp", ""),
    live: { on: false, doc: "", frames: 0, msg: "" },
    update: { state: "idle" }, version: ""
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
    return '<div class="s-k" id="' + id + '-keep-w"><div class="s-label" id="' + id + '-keep-l">Follow my sketch <em id="' + id + '-keep-v"></em></div>' +
      '<input class="s-range" type="range" min="0" max="1" step="0.05" id="' + id + '-keep">' +
      '<div class="s-ends2" id="' + id + '-keep-e"><span>Creative</span><span>Exact</span></div><span id="' + id + '-keep-none" hidden></span></div>';
  }

  function varsChips(id) {
    return '<div class="s-v"><div class="s-label">Variations</div><div class="s-step" id="' + id + '-vars">' +
      '<button type="button" data-d="-1" aria-label="Fewer">−</button><b id="' + id + '-vars-n">2</b><button type="button" data-d="1" aria-label="More">+</button></div></div>';
  }

  function optionsRow(id) { return '<div class="s-opts">' + keepSlider(id) + varsChips(id) + "</div>"; }

  function promptBox(id, ph, extraStyle) {
    return '<div class="s-pbox"><textarea class="s-prompt" id="' + id + '-text"' + (extraStyle || "") + ' placeholder="' + ph + '"></textarea>' +
      '<div class="s-pbar" id="' + id + '-imp" hidden><button type="button" class="s-impb">✨ Improve</button><span class="s-impn"></span></div></div>';
  }

  function stage(id, extra) {
    return '<section class="s-stage" id="' + id + '-stage">' +
      '<div class="s-ttl" id="' + id + '-ttl"></div>' +
      (extra || "") +
      '<div class="s-view" id="' + id + '-view"></div>' +
      // Under the picture: the results, then what to do with the chosen one.
      '<div class="s-under"><div class="s-vars" id="' + id + '-strip"></div>' +
      '<div class="s-acts2"><button type="button" class="s-btn" id="' + id + '-reveal" disabled>Show in folder</button>' +
      '<button type="button" class="s-btn" id="' + id + '-ps" hidden>' + '<span class="m-ico ps">Ps</span>To Photoshop</button>' +
      '<button type="button" class="s-btn p" id="' + id + '-up" disabled>Upscale this</button>' +
      '<button type="button" class="s-btn s-x" id="' + id + '-clear" title="Clear" aria-label="Clear" hidden>×</button></div></div>' +
      '<div class="s-refine"><input type="text" id="' + id + '-refine" placeholder="Refine: e.g. make the seats lighter, keep everything else"><button type="button" id="' + id + '-refine-go">Refine</button></div>' +
      "</section>" +
      '<div class="s-center" id="' + id + '-gate" hidden></div>';
  }

  function build() {
    document.body.classList.add("studio");
    var nav = document.createElement("nav");
    nav.className = "s-nav";
    nav.innerHTML = '<div class="s-logo" title="Vistiq Studio"><img src="assets/mark.png" alt=""></div>' +
      ["create", "reference", "upscale", "library"].map(function (p) {
        return '<button type="button" data-page="' + p + '">' + svg(p) + p.charAt(0).toUpperCase() + p.slice(1) + "</button>";
      }).join("") + '<div class="s-sp"></div><button type="button" data-page="settings">' + svg("settings") + "Settings</button>";
    document.body.insertBefore(nav, document.body.firstChild);

    var create = document.createElement("div");
    create.className = "s-page"; create.id = "p-create";
    create.innerHTML = rail("c", "Create",
      '<div><div class="s-label">Start from</div><div class="m-src" id="c-source"><button type="button" data-v="live"><span class="m-dot"></span>Live from app</button><button type="button" data-v="image">Image</button></div>' +
      '<button type="button" class="s-slot s-slim empty" id="c-slot" data-slot="src"></button>' +
      '<div class="s-ps" id="c-ps"></div></div>' +
      '<div class="s-seg" id="c-area" hidden><button type="button" data-v="whole"></button><button type="button" data-v="paint"></button></div>' +
      '<div><div class="s-label">What to change</div><div class="s-tiles4" id="c-presets">' +
      PRESETS.map(function (p) { return '<button type="button" data-v="' + p[0] + '">' + svg(p[3]) + "<span>" + p[1] + "</span></button>"; }).join("") + "</div></div>" +
      promptBox("c", "Describe the change") +
      '<div id="c-blend-w" hidden><div class="s-label">Blend edges <em id="c-blend-v"></em></div><input class="s-range" type="range" min="0" max="1" step="0.05" id="c-blend"></div>' +
      '<div id="c-look-w" hidden><div class="s-label">Style</div><select class="s-select" id="c-lora"></select></div>' +
      '<div id="c-juice-w" class="s-fin" hidden><div class="s-label">Finishing pass</div>' +
      '<p class="s-fin-hint">A second, light pass for richer light and materials.</p>' +
      '<select class="s-select" id="c-juice-lora"></select>' +
      '<div class="s-fin-row"><span>Strength</span><em id="c-juice-v"></em></div>' +
      '<input class="s-range" type="range" min="0" max="1" step="0.05" id="c-juice"></div>' +
      optionsRow("c"), "Create") + stage("c");
    document.body.appendChild(create);

    var ref = document.createElement("div");
    ref.className = "s-page"; ref.id = "p-reference";
    ref.innerHTML = rail("r", "Reference",
      '<div class="s-label">Your design</div><button type="button" class="s-slot empty" id="r-slot-src" data-slot="src"></button>' +
      '<div class="s-label">Reference</div><button type="button" class="s-slot empty" id="r-slot-ref" data-slot="refimg"></button>' +
      '<div class="s-label">Take from the reference</div><div class="s-seg" id="r-mode">' +
      Object.keys(REF).map(function (k) { return '<button type="button" data-v="' + k + '">' + REF[k][0] + "</button>"; }).join("") + "</div>" +
      '<p class="s-hint" id="r-mode-hint"></p>' +
      '<div><div class="s-label">Extra instructions (optional)</div>' + promptBox("r", "e.g. the floor console must match the reference view") + "</div>" +
      optionsRow("r"), "Transfer") +
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
    set.innerHTML = '<div class="s-scroll"><div class="s-col" id="s-body"></div>' +
      '<div class="s-sec">Upscaler</div><div class="s-up" id="s-up"></div></div>';
    document.body.appendChild(set);
    // One settings page for everything: the upscaler's own settings (engine,
    // largest size, logs) move in here; its updates are the card at the top.
    var sheet = $("sheet");
    if (sheet) {
      sheet.querySelectorAll(".sheet > .group").forEach(function (g) {
        if (g.querySelector("#upd-check")) return;
        $("s-up").appendChild(g);
      });
    }
    // The support heart lives in the side bar, above Settings.
    var heart = $("open-support");
    if (heart) {
      heart.classList.add("s-heart");
      nav.insertBefore(heart, nav.querySelector('button[data-page="settings"]'));
    }
    var gear = $("open-settings"); if (gear) gear.hidden = true;
    var sup = $("support"); if (sup) document.body.appendChild(sup);

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
    markSizes();
    var eg = $("s-up") && $("s-up").firstElementChild;
    if (eg && S.status && S.status.mac && eg.querySelector("#keep-engine")) eg.hidden = true;
    render();
  }

  function refresh() {
    if (!api()) return;
    api().studio_status().then(function (st) {
      if (!st) return;
      S.status = st; S.engine = st.engine || S.engine;
      markSizes();
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
    if (p === S.create && slot === "src") {
      if (info.live) p.liveSrc = info; else { p.imageSrc = info; p.source = "image"; }
      var same = info.live && p.liveSize === info.w + "x" + info.h;
      if (!info.live) { p.results = []; p.sel = -1; }
      if (!same) painter.reset(info);
      p.liveSize = info.live ? info.w + "x" + info.h : "";
    }
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
      mode: id === "c" ? "create" : "reference", image: p.src.path, name: p.src.name, live_app: p.src.live ? S.live.app : "",
      // An improved prompt already is the whole instruction: send it as it is.
      preset: p.improved && p.text === p.improved ? "" : p.preset, text: p.text, keep: p.keep, variations: p.vars
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
    p.error = ""; p.stage = "Starting"; p.frac = 0; p.pending = j.variations; p.started = Date.now(); p.estimate = 0;
    p.jobKey = srcKey(p.src);
    // Create works on the sketch as it is now: freeze a copy. Live keeps
    // updating in the background and comes back when the run is done.
    p.jobOrig = p.src.preview;
    if (p.src.live) p.src = Object.assign({}, p.src, { live: false, frozen: true });
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
    $("c-source").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) useSource(b.getAttribute("data-v")); });
    $("c-area").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      S.create.area = b.getAttribute("data-v"); if (S.create.area === "paint") S.create.sel = -1; render();
    });
    $("c-presets").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var v = b.getAttribute("data-v"); S.create.preset = S.create.preset === v ? "" : v; keep("c.preset", S.create.preset); render();
    });
    $("c-text").addEventListener("input", function () { S.create.text = this.value; });
    $("c-blend").addEventListener("input", function () { S.create.blend = +this.value; keep("c.blend2", S.create.blend); renderValues(); });
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
        var b = e.target.closest("button"); if (!b) return;
        p.vars = Math.max(1, Math.min(4, p.vars + +b.getAttribute("data-d"))); keep(pre + "vars", p.vars); render();
      });
      $(id + "-go").addEventListener("click", function () { job(id); });
      $(id + "-cancel").addEventListener("click", function () { api().studio_cancel(); });
      $(id + "-refine-go").addEventListener("click", function () { refine(id); });
      $(id + "-refine").addEventListener("keydown", function (e) { if (e.key === "Enter") refine(id); });
      $(id + "-up").addEventListener("click", function () {
        var c = current(p); if (!c) return;
        api().studio_to_upscale(c.path).then(function () { go("upscale"); });
      });
      $(id + "-clear").addEventListener("click", function () {
        p.results = []; p.sel = -1;
        if (id === "c" && !(p.src && p.src.live)) { p.src = null; p.imageSrc = null; }
        if (id === "r") { p.src = null; p.refimg = null; }
        render();
      });
      $(id + "-reveal").addEventListener("click", function () { var c = current(p); if (c) api().reveal(c.path); });
      $(id + "-ps").addEventListener("click", function () { var c = current(p); if (c) sendPS(c.path); });
      $(id + "-strip").addEventListener("click", function (e) {
        var t = e.target.closest("[data-i]"); if (t) { p.sel = +t.getAttribute("data-i"); render(); return; }
        if (e.target.closest(".s-more")) job(id, { variations: 1 });
        if (e.target.closest(".s-earlier")) { p.showEarlier = !p.showEarlier; render(); }
      });
      // Hold on a result to see what it started from.
      var view = $(id + "-view");
      view.addEventListener("pointerdown", function () { var img = view.querySelector("img.s-res"), c = current(p), o = (c && c.orig) || (p.src && p.src.preview); if (img && o) { img.src = o; view.classList.add("hold"); } });
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
      else if (act === "ps") sendPS(path);
      else if (act === "upscale") api().studio_to_upscale(path).then(function () { go("upscale"); });
      else if (act === "edit") api().studio_image(path).then(function (info) { setImage(S.create, "src", info); go("create"); });
      else if (act === "ref") api().studio_image(path).then(function (info) { setImage(S.ref, "src", info); go("reference"); });
    });
    $("c-ps").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ps]"); if (!b) return;
      var a = b.getAttribute("data-ps");
      if (a === "app") { S.liveApp = b.getAttribute("data-app"); keep("liveApp", S.liveApp); if (S.live.on && S.live.app !== S.liveApp) {
          api().studio_live(true, S.liveApp).then(function (r) { S.live.on = !!(r && r.on); S.live.app = S.liveApp; S.live.frames = 0; S.live.state = ""; S.live.msg = r && r.error || ""; render(); }); } else render(); }
      else if (a === "on") { var app = b.getAttribute("data-app"); S.live.stopped = false; api().studio_live(true, app).then(function (r) { S.live.on = !!(r && r.on); S.live.app = app; S.liveApp = app; S.live.frames = 0; S.live.state = ""; S.live.msg = r && r.error || ""; render(); }); }
      else if (a === "off") api().studio_live(false, S.live.app).then(function () { S.live.on = false; S.live.stopped = true; S.live.msg = ""; S.create.liveSrc = null; if (S.create.source === "live") S.create.src = null; render(); });
      else if (a === "back") useSource("live");
      else if (a === "install") {
        S.live.msg = "Installing the panel…"; render();
        api().studio_install_panel().then(function (r) { S.live.msg = r ? r.message : ""; render(); });
      }
    });
    ["c", "r"].forEach(function (id) {
      $(id + "-imp").querySelector(".s-impb").addEventListener("click", function () {
        var p = P(id), box = $(id + "-text"), note = $(id + "-imp").querySelector(".s-impn"), btn = this;
        if (!box.value.trim()) { note.textContent = "Write a few words first."; return; }
        btn.disabled = true; btn.classList.add("busy"); note.textContent = "Improving…";
        api().studio_improve(p.preset, box.value).then(function (r) {
          btn.disabled = false; btn.classList.remove("busy");
          if (r && r.text) { p.undoText = box.value; box.value = r.text; p.text = r.text; p.improved = r.text; note.innerHTML = '<button type="button" class="s-link">Undo</button>'; 
            note.querySelector("button").onclick = function () { box.value = p.undoText; p.text = p.undoText; note.textContent = ""; }; }
          else note.textContent = (r && r.error) || "Couldn't improve it.";
        });
      });
    });
    // Settings and setup (the same buttons appear in both)
    document.body.addEventListener("click", function (e) {
      var b = e.target.closest("[data-su]"); if (!b) return;
      var a = b.getAttribute("data-su");
      if (a === "take") api().studio_take_from(b.getAttribute("data-path") || "");
      else if (a === "take-other") api().studio_take_from("");
      else if (a === "download") {
        var go = function () { S.setup.error = ""; api().studio_setup(false); S.setup.run = { label: "Starting", fraction: null }; render(); };
        if (S.pickTier) api().studio_set_tier(S.pickTier).then(function (st) { if (st) S.status = st; go(); }); else go();
      }
      else if (a === "tier") {
        S.pickTier = b.getAttribute("data-t"); S.setup.done = "";
        api().studio_set_tier(S.pickTier).then(function (st) { if (st) S.status = st; render(); });
        render();
      }
      else if (a === "download-juice") { S.setup.error = ""; api().studio_setup(true); S.setup.run = { label: "Starting", fraction: null }; render(); }
      else if (a === "cancel") api().studio_cancel();
      else if (a === "page") api().open_url(b.getAttribute("data-url"));
      else if (a === "home") api().studio_choose_home().then(function (st) { if (st) S.status = st; render(); });
      else if (a === "models") api().studio_open_models();
      else if (a === "outputs") api().studio_open_outputs();
      else if (a === "refresh") refresh();
      else if (a === "get-helper") { S.setup.error = ""; api().studio_get_helper(); S.setup.run = { label: "Prompt helper", fraction: null }; render(); }
      else if (a === "get-select") { S.setup.error = ""; api().studio_get_select(); S.setup.run = { label: "Selection tool", fraction: null }; render(); }
      else if (a === "check") { api().check_updates(); S.update = Object.assign({}, S.update, { state: "checking" }); render(); }
      else if (a === "restart") api().restart().then(function (r) {
        S.restartMsg = r === "ok" ? "" : r === "busy" ? "Wait for the current job to finish, then restart." : r; render();
      });
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
    w: 0, h: 0, size: load("brush", 60), erase: false, selecting: false, busy: false, undo: [], canvas: null, ctx: null, ring: null, drawing: false, last: null, any: false,
    init: function () {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.ring = document.createElement("div"); this.ring.className = "s-ring"; this.ring.hidden = true;
      var self = this, c = this.canvas;
      c.style.opacity = ".5";
      c.addEventListener("pointerdown", function (e) {
        if (self.selecting) { e.preventDefault(); self.pick(e); return; }
        c.setPointerCapture(e.pointerId); self.push(); self.drawing = true; self.last = null; self.stroke(e);
      });
      c.addEventListener("contextmenu", function (e) { if (self.selecting) e.preventDefault(); });
      c.addEventListener("pointermove", function (e) { self.moveRing(e); if (self.drawing) self.stroke(e); });
      c.addEventListener("pointerup", function () { self.drawing = false; render(); });
      c.addEventListener("pointerleave", function () { self.ring.hidden = true; });
      c.addEventListener("pointerenter", function (e) { self.ring.hidden = self.selecting; self.moveRing(e); });
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
    // Select object: a click adds the object under it, Alt+click or a
    // right click takes it away. The outline comes from the selection model.
    pick: function (e) {
      if (this.busy || !S.create.src) return;
      var r = this.canvas.getBoundingClientRect(), self = this;
      var u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      var add = !(e.altKey || e.button === 2);
      this.busy = true; this.hint("Selecting…"); this.canvas.style.cursor = "progress";
      api().studio_select(S.create.src.path, [[u, v, true]], this.w, this.h).then(function (res) {
        self.busy = false; self.canvas.style.cursor = "";
        if (!res || res.error) { self.hint(res && res.error ? res.error : "Couldn't select that."); return; }
        var img = new Image();
        img.onload = function () {
          self.push();
          var ctx = self.ctx;
          ctx.globalCompositeOperation = add ? "source-over" : "destination-out";
          ctx.drawImage(img, 0, 0, self.w, self.h);
          ctx.globalCompositeOperation = "source-over";
          self.check(); self.hint(); render();
        };
        img.src = res.mask;
      });
    },
    hint: function (text) {
      var el = document.querySelector("#c-view .s-maskhint");
      if (el) el.textContent = text || this.hintText();
    },
    hintText: function () {
      return this.selecting ? "Click a part to select it · Alt+click or right click removes · fix edges with the brush"
        : "Paint what should change · [ ] or mouse wheel: brush size";
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
      else if (e.key.toLowerCase() === "b") { this.erase = false; this.selecting = false; render(); }
      else if (e.key.toLowerCase() === "e") { this.erase = true; this.selecting = false; render(); }
      else if (e.key.toLowerCase() === "s") { this.selecting = true; render(); }
    },
    tools: function () {
      return '<div class="s-tools" id="c-tools">' +
        '<button type="button" data-t="select" class="' + (this.selecting ? "on" : "") + '">' + svg("select") + "Select</button>" +
        '<button type="button" data-t="brush" class="' + (!this.selecting && !this.erase ? "on" : "") + '">' + svg("brush") + "Brush</button>" +
        '<button type="button" data-t="erase" class="' + (!this.selecting && this.erase ? "on" : "") + '">' + svg("erase") + "Erase</button>" +
        '<span class="sep"></span><label>Size <input type="range" id="c-size" min="6" max="400" value="' + this.size + '"></label><span class="sep"></span>' +
        '<button type="button" data-t="undo">' + svg("undo") + "Undo</button>" +
        '<button type="button" data-t="clear">Clear</button><button type="button" data-t="invert">Invert</button>' +
        '<span class="sep"></span><button type="button" data-t="done" class="done">Done</button></div>' +
        '<div class="s-maskhint">' + this.hintText() + "</div>";
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
      $(id + "-keep-v").textContent = p.keep >= 0.999 ? "Exact" : p.keep <= 0.25 ? "Creative" : Math.round(p.keep * 100) + "%";
    });
    $("c-blend").value = S.create.blend; $("c-blend-v").textContent = Math.round(S.create.blend * 100) + "%";
    $("c-juice").value = S.create.juice; $("c-juice-v").textContent = S.create.juice > 0 ? (S.create.juice < 0.35 ? "Subtle · " : S.create.juice < 0.7 ? "Medium · " : "Strong · ") + Math.round(S.create.juice * 100) + "%" : "Off";
  }

  function options(sel, list, value, none) {
    var html = '<option value="">' + none + "</option>" + list.map(function (l) {
      return '<option value="' + esc(l.name) + '"' + (l.name === value ? " selected" : "") + ">" + esc(l.label || l.name) + "</option>";
    }).join("");
    if (sel.getAttribute("data-h") !== html) { sel.innerHTML = html; sel.setAttribute("data-h", html); }
    sel.value = list.some(function (l) { return l.name === value; }) ? value : "";
  }

  // Put a picture into the open Photoshop file as a new layer.
  function sendPS(path) {
    toast("Sending to Photoshop…");
    api().studio_send(path, "photoshop").then(function (r) {
      if (!(r && r.ok)) toast((r && r.error) || "Couldn't send it.");
    });
  }

  function toast(msg) {
    var t = document.querySelector(".s-toast");
    if (!t) { t = document.createElement("div"); t.className = "s-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 5000);
  }

  function srcKey(src) { return src ? (src.live || src.frozen ? "live:" + src.name : src.path) : ""; }

  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2); }
  // " · 0:42 · about 1:10 left" while a job runs (the estimate comes from earlier runs)
  function clock(p) {
    if (!p.started) return "";
    var el = (Date.now() - p.started) / 1000, s = " · " + mmss(el);
    if (p.estimate) s += p.estimate > el ? " · about " + mmss(p.estimate - el) + " left" : " · almost done";
    return s;
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
    var meta = "", t = st && st.times;
    if (busy && S.engine.state === "starting") meta = S.engine.message;
    else if (!ready) meta = st ? "Set up image generation first" : "";
    else if (t && t.per) meta = "About " + mmss(t.per * p.vars + (t.warm ? 0 : (t.load || 0))) + " for " + p.vars + (p.vars > 1 ? " variations" : " variation");
    else meta = "The first run loads the models, so it takes a little longer";
    $(id + "-meta").textContent = meta;
    $(id + "-err").hidden = !p.error; $(id + "-err").textContent = p.error;
    $(id + "-vars-n").textContent = p.vars;
    var cons = hasConsistency();
    $(id + "-keep-w").hidden = false;
  }

  var APPS = { photoshop: ["Ps", "Photoshop", "ps"], affinity: ["Af", "Affinity", "af"] };

  // "Live from app": your drawing app's canvas, live. "Image": a file.
  // Switching to Image keeps the app connected, ready to be brought back.
  function renderPS() {
    var L = S.live, p = S.create, st = S.status || {}, apps = st.apps || {}, h = "";
    var src = p.source || "image";
    on($("c-source"), "data-v", src);
    $("c-source").querySelector(".m-dot").className = "m-dot" + (L.on ? "" : " g");
    $("c-slot").hidden = src === "live";
    if (src === "live") {
      var have = Object.keys(APPS).filter(function (k) { return apps[k]; });
      if (!have.length) have = Object.keys(APPS);
      var cur = L.app || (have.indexOf(S.liveApp) >= 0 ? S.liveApp : have[0]);
      h += '<div class="m-apps">' + have.map(function (k) {
        return '<button type="button" data-ps="app" data-app="' + k + '" class="' + (k === cur ? "on" : "") + '"><span class="m-ico ' + APPS[k][2] + '">' + APPS[k][0] + "</span>" + APPS[k][1] + "</button>";
      }).join("") + "</div>";
      if (L.on && L.frames && p.liveSrc) {
        h += '<div class="m-card"><img src="' + p.liveSrc.preview + '"><span>' + esc(L.doc) + "<small>" + APPS[L.app][1] +
          ' · updates as you draw</small></span><button type="button" class="s-link" data-ps="off">Stop</button></div>';
      } else if (L.on) {
        h += '<div class="s-ps-on"><span class="s-live-dot"></span><span><b>' + (L.state ? "Waiting for " : "Connecting to ") + APPS[L.app][1] + "</b><small>" +
          esc(L.state || (L.app === "photoshop" ? "Open Photoshop with the Vistiq Studio panel; your current file shows up here by itself."
                                                 : "Waiting for Affinity… turn on Settings → Model Context Protocol → Enable Affinity MCP.")) +
          '</small></span><button type="button" class="s-link" data-ps="off">Stop</button></div>';
      } else {
        h += '<button type="button" class="s-btn p" data-ps="on" data-app="' + cur + '" style="width:100%">Connect ' + APPS[cur][1] + "</button>";
      }
      if (cur === "photoshop") h += '<p class="s-hint" style="margin-top:6px">' + (L.msg || L.note ? esc(L.msg || L.note) : 'First time? <button type="button" class="s-link" data-ps="install">Install the Photoshop plugin</button>') + "</p>";
      else if (L.msg) h += '<p class="s-hint" style="margin-top:6px">' + esc(L.msg) + "</p>";
    } else if (L.on && L.frames) {
      h += '<div class="m-back"><span class="m-dot"></span><span><b>' + APPS[L.app][1] + " is still live</b><br>" + esc(L.doc) +
        ' keeps updating</span><button type="button" data-ps="back">Bring back</button></div>';
    }
    var el = $("c-ps");
    if (el.getAttribute("data-h") !== h) { el.innerHTML = h; el.setAttribute("data-h", h); }
  }

  // Largest size: say which one fits this computer; on a Mac, bigger ones are off.
  function markSizes() {
    var sel = $("max-size"), sz = S.status && S.status.sizes;
    if (!sel || !sz) return;
    Array.prototype.forEach.call(sel.options, function (o) {
      if (!o.getAttribute("data-t")) o.setAttribute("data-t", o.textContent);
      var v = +o.value, t = o.getAttribute("data-t");
      o.disabled = v > sz.allowed;
      o.textContent = t + (v === sz.recommended ? " · recommended for this " + (S.status.mac ? "Mac" : "PC") : v > sz.allowed ? " · too big for this Mac" : "");
    });
    var hint = sel.closest(".group").querySelector(".hint");
    if (hint) hint.textContent = "Recommended for " + sz.why + ": " + sz.recommended + " px. Max goes up to this, and 2× and 4× never go past it.";
  }

  function useSource(src) {
    var p = S.create;
    p.source = src; keep("c.source", src);
    var info = src === "live" ? p.liveSrc : p.imageSrc;
    p.src = info || null;
    if (info) { p.liveSize = ""; painter.reset(info); }
    render();
  }

  function renderCreate() {
    var p = S.create, st = S.status;
    $("c-imp").hidden = !(st && st.helper_ready);
    // One part failing to draw must not leave the rest of the panel stale.
    try { renderPS(); } catch (e) { if (window.console) console.error(e); }
    try { setSlot($("c-slot"), p.src, "click to change", "Drop a sketch or render here, or click"); } catch (e) { if (window.console) console.error(e); }
    on($("c-area"), "data-v", p.area);
    on($("c-presets"), "data-v", p.preset);
    var pr = PRESETS.filter(function (x) { return x[0] === p.preset; })[0];
    $("c-text").placeholder = pr ? pr[2] : "Describe the image you want";
    $("c-imp").hidden = !(st && st.helper_ready);
    if ($("c-text").value !== p.text && document.activeElement !== $("c-text")) $("c-text").value = p.text;
    $("c-blend-w").hidden = p.area !== "paint";
    var looks = st ? st.loras.filter(function (l) { return l.family === "klein9b" && !/klein-consistency/i.test(l.name); }) : [];
    $("c-look-w").hidden = !looks.length;
    options($("c-lora"), looks, p.lora, "Standard");
    var juicy = st ? st.loras.filter(function (l) { return l.family === "flux1"; }) : [];
    $("c-juice-w").hidden = !(st && st.juice_ready && juicy.length);
    if (!p.juiceLora && juicy.length) p.juiceLora = juicy[0].name;
    options($("c-juice-lora"), juicy, p.juiceLora, "Pick a finishing style");
    renderRail("c");
    renderStage("c");
  }

  function renderReference() {
    var p = S.ref;
    $("r-imp").hidden = !(S.status && S.status.helper_ready);
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
    var show = st && (!st.create_ready || !st.engine_installed);
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
    $(id + "-ps").hidden = !(c && S.psOn);
    $(id + "-clear").hidden = !(p.results.length && !p.job);
    $(id + "-refine-go").disabled = !!p.job || !(c || p.src);

    // The big view.
    var view = $(id + "-view"), mode, key;
    if (c) { mode = "result"; key = c.path; }
    else if (id === "c" && p.src && p.area === "paint") { mode = "paint"; key = p.src.path; }
    else if (p.src && id === "c") { mode = "src"; key = p.src.path; }
    else { mode = "empty"; key = id + (p.src ? "1" : "0"); }
    key = mode + ":" + key + (mode === "paint" ? ":" + painter.erase + ":" + painter.selecting : "");
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
        // The ring only shows over the picture, never over the tools.
        view.addEventListener("pointermove", function (e) { painter.ring.hidden = painter.selecting || e.target !== painter.canvas; });
        painter.canvas.classList.toggle("sel", painter.selecting);
        view.querySelector("#c-tools").addEventListener("click", function (e) {
          var b = e.target.closest("button[data-t]"); if (!b) return;
          var t = b.getAttribute("data-t");
          if (t === "brush" || t === "erase") { painter.erase = t === "erase"; painter.selecting = false; render(); }
          else if (t === "select") { painter.selecting = true; render(); }
          else if (t === "done") { S.create.area = "whole"; render(); }
          else if (t === "undo") painter.back(); else if (t === "clear") painter.clear(); else if (t === "invert") painter.invert();
        });
        $("c-size").addEventListener("input", function () { painter.size = +this.value; keep("brush", painter.size); });
      } else {
        var info = mode === "result" ? c : p.src;
        view.innerHTML = '<div class="s-fit" data-w="' + info.w + '" data-h="' + info.h + '"><img class="' + (mode === "result" ? "s-res" : "") + '" src="' + info.preview + '" alt=""></div>' +
          (mode === "result" ? '<span class="s-tag">Result · hold to see the original</span>' : '<span class="s-tag">' + (info.live ? "Live from " + ((APPS[info.app] || APPS.photoshop)[1]) : "Original") + "</span>");
      }
    }
    var oldpb = view.querySelector(".s-paintbtn");
    if (oldpb && (p.area === "paint" || c || !p.src)) oldpb.remove();
    if (id === "c" && p.src && !c && p.area !== "paint") {
      var pb = view.querySelector(".s-paintbtn");
      if (!pb) { pb = document.createElement("button"); pb.type = "button"; pb.className = "s-paintbtn";
        pb.onclick = function () { S.create.area = S.create.area === "paint" ? "whole" : "paint"; S.create.sel = -1; render(); }; view.appendChild(pb); }
      pb.innerHTML = p.area === "paint" ? "Stop painting" : svg("brush") + "Paint an area";
      pb.classList.toggle("on", p.area === "paint");
    }
    var busy = view.querySelector(".s-busy");
    if (p.job) {
      if (!busy) { busy = document.createElement("div"); busy.className = "s-busy"; busy.innerHTML = '<span></span><i><b></b></i>'; view.appendChild(busy); }
      busy.querySelector("span").textContent = ((S.engine.state === "starting" ? S.engine.message : p.stage) || "Working") + clock(p);
      busy.querySelector("b").style.width = Math.round((p.frac || 0) * 100) + "%";
    } else if (busy) busy.remove();

    // The strip: original, results, placeholders, + Another.
    // Only results made from what's in Create now; results of earlier
    // pictures fold into "Earlier" (and are all in the Library).
    var key = srcKey(p.src), mine = [], earlier = [];
    p.results.forEach(function (r, i) { (r.srcKey === key ? mine : earlier).push(i); });
    var tile = function (i) { var r = p.results[i]; return '<img data-i="' + i + '" class="' + (i === p.sel ? "sel" : "") + '" src="' + r.preview + '" title="' + esc(short(r.name)) + '" alt="">'; };
    var strip = "";
    if (p.src && (mine.length || earlier.length)) strip += '<span class="s-tilewrap"><img data-i="-1" class="' + (p.sel < 0 ? "sel" : "") + '" src="' + p.src.preview + '" alt="">' +
      '<em class="' + (p.src.live ? "live" : "") + '">' + (p.src.live ? '<i class="ld"></i>Live' : "Original") + "</em></span>";
    mine.forEach(function (i) { strip += tile(i); });
    for (var k = 0; k < (p.job ? p.pending : 0); k++) strip += '<span class="s-ph"></span>';
    if (mine.length && !p.job) strip += '<button type="button" class="s-more">+ Another</button>';
    if (earlier.length) {
      strip += '<button type="button" class="s-earlier">' + (p.showEarlier ? "Hide earlier" : "Earlier · " + earlier.length) + "</button>";
      if (p.showEarlier) earlier.slice().reverse().forEach(function (i) { strip += '<span class="s-old">' + tile(i) + "</span>"; });
    }
    var sk = $(id + "-strip");
    if (sk.getAttribute("data-h") !== strip) { sk.innerHTML = strip; sk.setAttribute("data-h", strip); }
    layout();
  }

  function layout() {
    document.querySelectorAll(".s-page.on .s-fit").forEach(function (f) {
      var v = f.parentNode, W = v.clientWidth, H = v.clientHeight, w = +f.getAttribute("data-w"), h = +f.getAttribute("data-h");
      if (!W || !H || !w || !h) return;
      // While painting, the tools sit above the picture and the hint below
      // it, never on top of it, so every part of it can be painted.
      var top = 0, bottom = 0;
      if (v.querySelector(".s-tools")) { top = 64; bottom = 50; }
      var aH = H - top - bottom;
      var k = Math.min(W / w, aH / h), fw = Math.round(w * k), fh = Math.round(h * k);
      f.style.width = fw + "px"; f.style.height = fh + "px";
      f.style.left = Math.round((W - fw) / 2) + "px"; f.style.top = Math.round(top + (aH - fh) / 2) + "px";
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
      return '<div class="s-row"><div class="n"><b>' + esc(f.label) + "</b><small>" + esc(f.about) + '</small></div><span class="s-pill">' + gb(f.gb) + "</span>" + right + "</div>";
    }).join("");
  }

  function progressHTML() {
    var r = S.setup.run;
    if (!r) return S.setup.error ? '<div class="s-err">' + esc(S.setup.error) + "</div>" : (S.setup.done ? '<p class="s-ok">' + esc(S.setup.done) + "</p>" : "");
    var ind = r.fraction == null;
    return '<div><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:var(--ink)">' + esc(r.label) + '</p><div class="s-bar' + (ind ? " ind" : "") + '"><i style="width:' + Math.round((r.fraction || 0) * 100) + '%"></i></div></div>' +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="cancel">Stop</button></div>';
  }

  // First run: one button. It takes what is already on this PC (a ComfyUI,
  // the Downloads folder), sets up the image engine and downloads the rest.
  // The only thing left by hand is the one file whose maker wants a sign-in.
  var TIER_TEXT = {
    best: ["Best quality", "Needs a free sign-up with the model's maker (about 2 minutes)."],
    good: ["Good quality", "Free, no sign-up. Downloads by itself."],
    "true": ["Realistic (True V2)", "Klein 9B tuned for realism by the community. Free, about 10 GB. On trial."]
  };

  function tierFiles(st, t) {
    return st.files.filter(function (f) { return f.part === "create" && !f.optional && (f.tier === t || !f.tier || (Array.isArray(f.tier) && f.tier.indexOf(t) >= 0)); });
  }

  function setupGB(st, t) {
    return tierFiles(st, t).filter(function (f) { return !f.ready && f.can_download; })
      .reduce(function (a, f) { return a + f.gb; }, 0) + (st.engine_installed ? 0 : 2.1) + (st.select_ready ? 0 : 0.1);
  }

  // First run: pick the quality, then one button. It takes what is already on
  // this PC (a ComfyUI, the Downloads folder), sets up the engine and downloads
  // the rest. Only "Best quality" leaves one file to fetch by hand.
  function setupCard() {
    var st = S.status, running = !!S.setup.run;
    var t = S.pickTier || st.chosen || st.tier || "";
    var err = S.setup.error ? '<div class="s-err">' + esc(S.setup.error) + "</div>" : "";
    var h = '<div class="s-su"><h1>Set up Vistiq Studio</h1>';
    if (st.mac && !running) {
      var need = st.files.filter(function (f) { return !f.ready; }).reduce(function (a, f) { return a + f.gb; }, 0);
      h += '<div class="m-hw"><span>' + esc(st.mac.chip) + "</span><span>" + st.mac.ram + " GB memory</span></div>" +
        "<p>A one-time download of about " + gb(need + (st.select_ready ? 0 : 0.1)) + ". After that everything runs on this Mac, also without internet.</p>" +
        '<div class="s-list">' + fileRows(st.files) + "</div>" +
        (st.mac.can_generate ? "" : '<div class="s-err">Image generation needs a Mac with 16 GB of memory or more. Upscaling and the rest still work.</div>') +
        '<button type="button" class="s-go" style="height:50px" data-su="download"><span>Set up</span></button>' + err +
        "</div>";
      return h;
    }
    if (running) {
      h += "<p>Setting up. You can leave this open; it carries on by itself.</p>" + progressHTML();
    } else {
      var byHand = t ? tierFiles(st, t).filter(function (f) { return !f.ready && !f.can_download; }) : [];
      var dl = t ? setupGB(st, t) : 0;
      if (t && S.setup.done && byHand.length && dl <= 0.2) {
        var f = byHand[0];
        h += "<p>Almost done. The model's maker asks everyone to accept their free licence first:</p>" +
          '<ol class="s-steps"><li><button type="button" class="s-btn p" data-su="page" data-url="' + esc(f.page) + '">Open the sign-up page</button></li>' +
          "<li>Sign in, accept, and download the file (" + gb(f.gb) + ").</li>" +
          '<li>When it is in your Downloads folder: <button type="button" class="s-btn p" data-su="download">Finish setup</button></li></ol>' +
          '<p style="font-size:12px">Rather not sign up? <button type="button" class="s-link" data-su="tier" data-t="good">Use Good quality instead</button></p>' + err;
      } else {
        h += "<p>A one-time setup. After that everything runs on this PC, also without internet. Pick one; you can switch later in Settings.</p>" +
          '<div class="s-tiers">' + ["best", "good"].map(function (k) {
            return '<button type="button" class="s-tier' + (t === k ? " on" : "") + '" data-su="tier" data-t="' + k + '"><b>' + TIER_TEXT[k][0] +
              (st.tiers[k].ready ? ' <span class="s-ok">Ready</span>' : "") + "</b><small>" + TIER_TEXT[k][1] + "</small><em>about " + gb(setupGB(st, k)) + "</em></button>";
          }).join("") + "</div>" +
          '<button type="button" class="s-go" style="height:50px" data-su="download"' + (t ? "" : " disabled") + "><span>Set up</span></button>" + err;
      }
    }
    h += '<p style="font-size:12px">Already have the files somewhere? <button type="button" class="s-link" data-su="take-other">Choose a folder</button></p></div>';
    return h;
  }

  function renderSettings() {
    var st = S.status, el = $("s-body");
    if (!st) { el.innerHTML = '<div class="s-ttl">Settings</div>'; return; }
    var juice = st.files.filter(function (f) { return f.part === "juice"; });
    var jdl = juice.filter(function (f) { return !f.ready && f.can_download; }).length;
    var running = !!S.setup.run;
    // Styles people can use: Looks for Create (made for the image model) and,
    // under Juice, styles for the Juice pass. Files that work with neither
    // aren't listed; the design lock is listed with the model files.
    var looks = st.loras.filter(function (l) { return l.family === "klein9b" && !/klein-consistency/i.test(l.name); });
    var juiceStyles = st.loras.filter(function (l) { return l.family === "flux1"; });
    var styleRows = function (list, empty) {
      return list.length ? list.map(function (l) {
        return '<div class="s-row" title="' + esc(l.name) + '"><div class="n"><b>' + esc(l.label || l.name) + '</b></div><span class="s-pill">' + gb(l.gb) + "</span></div>";
      }).join("") : '<div class="s-row"><div class="n"><small>' + empty + "</small></div></div>";
    };
    var selectRow = '<div class="s-row"><div class="n"><b>Object selection</b><small>The Select tool: click a part to select it along its edges.</small></div><span class="s-pill">0.1 GB</span>' +
      (st.select_ready ? '<span class="s-ok">Ready</span>' : '<button type="button" class="s-btn p" data-su="get-select"' + (running ? " disabled" : "") + ">Download</button>") + "</div>";
    var helperRow = '<div class="s-row"><div class="n"><b>Prompt helper (optional)</b><small>Adds “Improve my prompt”: turns a few words into a clear instruction.</small></div><span class="s-pill">1.1 GB</span>' +
      (st.helper_ready ? '<span class="s-ok">Ready</span>' : '<button type="button" class="s-btn p" data-su="get-helper"' + (running ? " disabled" : "") + ">Download</button>") + "</div>";
    var u = S.update || {}, us = u.state;
    var upd = '<div class="s-upd"><div class="n"><b>Vistiq Studio ' + esc(S.version) + "</b><small>" +
      (us === "ready" ? "Version " + esc(u.latest) + " is ready." :
       us === "downloading" ? "Downloading version " + esc(u.latest) + "…" :
       us === "checking" ? "Checking for updates…" :
       us === "current" ? "Up to date." :
       us === "error" ? esc(u.message || "Couldn't check for updates.") : "Checks for updates by itself.") + "</small></div>" +
      (us === "ready" ? '<button type="button" class="s-btn p" data-su="restart">Restart to update</button>'
                      : '<button type="button" class="s-btn" data-su="check"' + (us === "checking" || us === "downloading" ? " disabled" : "") + ">Check for updates</button>") +
      (S.restartMsg ? '<small class="s-miss">' + esc(S.restartMsg) + "</small>" : "") + "</div>";
    var h = '<div class="s-ttl">Settings</div>' + upd +
      '<div class="s-sec">Vistiq Studio folder</div>' +
      '<button type="button" class="s-folder" data-su="home"><code>' + esc(st.home) + "</code><em>Change</em></button>" +
      '<p class="s-hint"><b>Outputs</b> every result, by date · <b>Models</b> the model files · <b>Models/loras</b> your own styles</p>' +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="outputs">Open Outputs</button><button type="button" class="s-btn" data-su="models">Open Models</button>' +
      '<button type="button" class="s-btn" data-su="take-other"' + (running ? " disabled" : "") + ">Take files from a folder…</button>" +
      (st.comfy_models ? '<button type="button" class="s-btn" data-su="take" data-path="' + esc(st.comfy_models) + '"' + (running ? " disabled" : "") + ">Take from my ComfyUI</button>" : "") + "</div>" +
      progressHTML() +
      (st.mac ? '<div class="s-sec">This Mac</div><p class="s-hint">' + esc(st.mac.chip) + " · " + st.mac.ram + " GB memory · creates at up to " + st.mac.work_side + " px, upscales up to " + st.mac.max_side + " px" +
        (st.mac.can_generate ? "" : " · image generation needs 16 GB or more") + '</p><div class="s-list">' + fileRows(st.files) + selectRow + helperRow + "</div>" : "") +
      (st.mac ? "" : '<div class="s-sec">Quality</div><div class="s-tiers">' + ["best", "good", "true"].map(function (k) {
        var tt = st.chosen || st.tier;
        return '<button type="button" class="s-tier' + (tt === k ? " on" : "") + '" data-su="tier" data-t="' + k + '"' + (running ? " disabled" : "") + "><b>" + TIER_TEXT[k][0] +
          (st.tiers[k].ready ? ' <span class="s-ok">Ready</span>' : "") + "</b><small>" + TIER_TEXT[k][1] + "</small></button>";
      }).join("") + "</div>" +
      '<div class="s-list">' + fileRows(tierFiles(st, st.chosen || st.tier || "best").concat(st.files.filter(function (f) { return f.key === "consistency" && ["best", "true"].indexOf(st.chosen || st.tier || "best") >= 0; }))) + selectRow + helperRow + "</div>" +
      (function () { var miss = setupGB(st, st.chosen || st.tier || "best") - (st.engine_installed ? 0 : 2.1) - (st.select_ready ? 0 : 0.1);
        return miss > 0.05 && !running ? '<div class="s-btns"><button type="button" class="s-btn p" data-su="download">Download (' + gb(miss) + ")</button></div>" : ""; })()) +
      (st.mac ? "" : '<div class="s-sec">Looks</div><p class="s-hint">Extra styles for Create, shown under Style. To add one, put its file in Models › loras; it shows up when you come back to Studio.</p>' +
      '<div class="s-list">' + styleRows(looks, "None yet.") + "</div>" +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="models">Open the loras folder</button></div>' +
      '<details class="s-adv"' + (S.advOpen ? " open" : "") + '><summary>Advanced: Finishing pass (optional, about 29 GB)</summary>' +
      '<p class="s-hint">A second, light pass with a style, for richer light and materials. Not needed for anything else.</p>' +
      '<div class="s-list">' + fileRows(juice) + "</div>" +
      '<p class="s-hint">Styles for the finishing pass:</p><div class="s-list">' + styleRows(juiceStyles, "None yet.") + "</div>" +
      (jdl ? '<div class="s-btns"><button type="button" class="s-btn p" data-su="download-juice"' + (running ? " disabled" : "") + ">Download the finishing-pass files</button></div>" : "") + "</details>") +

      (st.mac ? "" : '<div class="s-sec">Image engine</div><p class="s-hint">' + (st.engine_installed ? "Installed. " : "Not set up yet. ") + esc(S.engine.message || "") +
      " The upscaler keeps its own engine; they take turns on the graphics card.</p>" +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="refresh">Check again</button></div>');
    if (el.getAttribute("data-h") !== h) {
      el.innerHTML = h; el.setAttribute("data-h", h);
      var adv = el.querySelector(".s-adv");
      if (adv) adv.addEventListener("toggle", function () { S.advOpen = adv.open; });
    }
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
        '<div class="s-hover"><button type="button" data-act="edit">Create</button><button type="button" data-act="ref">Reference</button><button type="button" data-act="upscale">Upscale</button><button type="button" data-act="folder">Folder</button>' +
        (S.psOn ? '<button type="button" data-act="ps" class="s-psb">To Photoshop</button>' : "") + "</div>" +
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
      if (kind === "update") S.update = data;
      if (kind.indexOf("studio-") !== 0) { var r = base(kind, data); if (kind === "update") render(); return r; }
      if (kind === "studio-live") {
        // Photoshop works like a navigator: its current file shows up by itself,
        // unless you pressed Stop or are live with another app.
        if (!S.live.on && data.app === "photoshop" && !S.live.stopped) {
          S.live.on = true; S.live.app = "photoshop"; S.live.frames = 0; S.live.msg = "";
          if (!S.create.src) S.create.source = "live";
        }
        if (data.app === "photoshop") S.psOn = true;
        if (!S.live.on || (data.app && data.app !== S.live.app)) return;
        S.live.doc = data.name; S.live.frames++; S.live.state = "";
        data.live = true;
        var keepSel = S.create.sel;
        if (S.create.source !== "live" || S.create.job) { S.create.liveSrc = data; render(); return; }   // stays ready in the background
        setImage(S.create, "src", data);
        S.create.sel = keepSel;   // keep looking at the result you picked; the live tile updates quietly
        render();
        return;
      }
      if (kind === "studio-live-state") {
        if (data.state === "note") { S.live.note = data.message; render(); return; }
        if (data.app === "photoshop") S.psOn = data.state === "live" || data.state === "nodoc";
        if (data.app === "photoshop" && (data.state === "closed" || data.state === "nodoc") && S.live.app === "photoshop") {
          S.live.frames = 0; S.create.liveSrc = null;
          if (S.create.source === "live" && S.create.src && S.create.src.live) S.create.src = null;
        }
        if (S.live.on && data.app === S.live.app) S.live.state = data.message;
        render(); return;
      }
      if (kind === "studio-sent") { toast(data.message); return; }
      if (kind === "studio-note") { S.create.note = data.message; render(); return; }
      if (kind === "studio-engine") S.engine = data;
      else if (kind === "studio-job") {
        var p = byJob(data.id);
        if (!p) return;
        if (data.state === "running") { p.stage = data.stage; p.frac = data.fraction == null ? p.frac : data.fraction; if (data.estimate) p.estimate = data.estimate; if (!p.started) p.started = Date.now(); }
        else {
          p.job = null; p.pending = 0; p.stage = ""; p.frac = 0; p.started = 0; p.estimate = 0;
          // The run is over: live takes over again with the newest sketch.
          if (p === S.create && p.source === "live" && p.src && p.src.frozen) {
            var keepSel2 = p.sel; if (p.liveSrc) { p.src = p.liveSrc; p.liveSrc = null; } p.sel = keepSel2;
          }
          p.error = data.state === "error" ? (data.message || "Something went wrong.") : (p.note || "");
          p.note = "";
        }
      } else if (kind === "studio-result") {
        var q = byJob(data.id); if (!q) return;
        data.result.srcKey = q.jobKey; data.result.orig = q.jobOrig; q.results.push(data.result); q.pending = Math.max(0, q.pending - 1);
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
      S.update = s.update || S.update; S.version = s.version;
      hook();
      build();
      setInterval(function () { if (S.create.job || S.ref.job) render(); }, 1000);
      window.addEventListener("focus", function () { try { refresh(); } catch (e) {} });
    });
  }
  if (api()) start(); else window.addEventListener("pywebviewready", start);
})();
