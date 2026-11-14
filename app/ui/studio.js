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
    board: '<rect x="3" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="8" width="8" height="6" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/><path d="M11 6h2v5M11 17h4v-3"/>',
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
    select: '<path d="M4 4l6 16 2.5-6.5L19 11z"/>',
    page: '<rect x="6" y="3" width="12" height="18" rx="1"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
    clip: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    lasso: '<path d="M7 18c-2.5-1-4-3-4-5.5C3 8 7.5 5 12 5s9 3 9 7-4 6.5-9 6.5c-1.4 0-2.7-.2-3.8-.6"/><path d="M8.5 17.5c0 2-1.5 3.5-3 3.5"/><circle cx="8.2" cy="17.7" r="1.3"/>',
    pen: '<path d="M12 3l5 9-5 9-5-9z"/><path d="M12 12v9M12 12h.01"/>',
    deselect: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9l6 6M15 9l-6 6"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + "</svg>"; }

  var PRESETS = [
    ["sketch", "Sketch to photo", "Turn this sketch into a photo of… (e.g. a pickup truck, matte olive paint, desert light)", "sketch"],
    ["cmf", "CMF", "Change the materials to… (e.g. brushed brass base, linen shade)", "cmf"],
    ["lighting", "Lighting", "Change the lighting to… (e.g. golden hour from the left, soft shadows)", "light"],
    ["photo", "Photoreal", "Make it look like a real photo, with… (e.g. magazine lighting)", "photo"]
  ];
  // What must not change. A sketch starts with its design and camera locked (it is
  // rendered); a render starts with everything locked (you unlock what to change).
  var LOCKS = [["design", "Design", "shapes", "Every shape, part, line and proportion"], ["materials", "Materials", "CMF", "Colours, materials and finishes"],
               ["light", "Light", "", "Direction, softness and time of day"], ["camera", "Camera", "view", "Viewpoint, angle and framing"]];
  var LOCK_WORDS = {
    materials: /\b(leather|nappa|alcantara|suede|fabric|textile|wood|veneer|chrome|metal|aluminium|aluminum|carbon|plastic|matte|glossy|satin|paint|colou?r|red|blue|green|yellow|orange|purple|pink|black|white|grey|gray|beige|tan|brown|burgund\w*|cmf|material|finish)\b/i,
    light: /\b(light|lighting|lit|sun|sunny|sunset|sunrise|golden hour|blue hour|night|dusk|dawn|evening|morning|noon|overcast|shadow|shadows|studio light|ambient|bright|dark|moody)\b/i,
    design: /\b(redesign|reshape|new shape|change the (shape|form|design)|add (a|an|the)?\s*\w+|remove|bigger|smaller|wider|narrower|taller|shorter|more aggressive|sportier)\b/i,
    camera: /\b(angle|view from|side view|front view|rear view|top view|from above|from below|camera|zoom out|zoom in|close-?up|wide shot|perspective)\b/i
  };
  function isRender(src) { return !!src && !src.live && !src.frozen && /_(create|refine|paint|camera|cmf|style|reference|variation)/i.test(src.name || src.path || ""); }
  function defaultLocks(src) { var r = isRender(src); return { design: true, materials: r, light: r, camera: true }; }
  // The old preset that matches the locks (its wording is tested on the engine).
  function presetFor(p) {
    var L = p.locks || defaultLocks(p.src);
    if (!isRender(p.src)) return "sketch";
    if (!L.light && L.materials) return "lighting";
    if (!L.materials && L.light) return "cmf";
    return "photo";
  }
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
    return '<aside class="s-rail"><div class="s-rh"><h3>' + title + '</h3><button type="button" class="s-min" data-min="rail" title="Collapse / expand">' +
      '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button></div><div class="s-rail-body">' + inner + "</div>" +
      '<div class="s-rail-foot"><div class="s-err" id="' + id + '-err" hidden></div>' +
      // What to do with the chosen result, right above Create.
      '<div class="s-acts3"><button type="button" class="s-btn" id="' + id + '-refine-this" title="Change this result with your words" disabled>' + svg("sketch") + '<span>Refine</span></button>' +
      (id === "c" ? '<button type="button" class="s-btn" id="c-tolayer" title="Put this result on a layer over your picture" disabled>' + svg("layers") + "<span>Layer</span></button>" : "") +
      '<button type="button" class="s-btn" id="' + id + '-toboard" title="Put this result on the board" disabled>' + svg("board") + '<span>Board</span></button>' +
      '<button type="button" class="s-btn" id="' + id + '-tops" title="Send this result to Photoshop as a new layer" disabled><span class="m-ico ps">Ps</span><span>Export</span></button>' +
      '<button type="button" class="s-btn" id="' + id + '-up" title="Upscale this result" disabled>' + svg("upscale") + '<span>Upscale</span></button></div>' +
      '<div class="s-gorow">' +
      '<button type="button" class="s-go" id="' + id + '-go"><span class="s-go-fill" id="' + id + '-fill" style="width:0"></span><span id="' + id + '-golabel">' + goText + "</span></button>" +
      '</div><button type="button" class="s-cancel" id="' + id + '-cancel" hidden>Cancel</button>' +
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
      '<div class="s-top"><div class="s-ttl" id="' + id + '-ttl"></div><div class="s-acts2">' +
      '<button type="button" class="s-btn" id="' + id + '-reveal" disabled>Show in folder</button>' +
      '<button type="button" class="s-btn s-x" id="' + id + '-clear" title="Clear the results" aria-label="Clear" hidden>×</button></div></div>' +
      (extra || "") +
      '<div class="s-view" id="' + id + '-view"></div>' +
      '<div class="s-under"><div class="s-vars" id="' + id + '-strip"></div></div>' +
      // Refine runs from the panel (the prompt + "Refine this"); the input stays as its carrier.
      '<div class="s-refine" hidden><input type="text" id="' + id + '-refine"><button type="button" id="' + id + '-refine-go">Refine</button></div>' +
      "</section>" +
      '<div class="s-center" id="' + id + '-gate" hidden></div>';
  }

  function build() {
    document.body.classList.add("studio");
    var nav = document.createElement("nav");
    nav.className = "s-nav";
    nav.innerHTML = '<div class="s-logo" title="Vistiq Studio"><img src="assets/mark.png" alt=""></div>' +
      ["board", "create", "reference", "upscale", "library"].map(function (p) {
        return '<button type="button" data-page="' + p + '">' + svg(p) + p.charAt(0).toUpperCase() + p.slice(1) + "</button>";
      }).join("") + '<div class="s-sp"></div><button type="button" data-page="settings">' + svg("settings") + "Settings</button>" +
      '<button type="button" class="s-min s-navmin" data-min="nav" title="Collapse / expand"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>';
    document.body.insertBefore(nav, document.body.firstChild);

    var create = document.createElement("div");
    create.className = "s-page"; create.id = "p-create";
    create.innerHTML = rail("c", "Create",
      '<div><div class="s-label">Working on</div><div class="s-work" id="c-work"></div>' +
      '<div class="s-old"><div class="m-src" id="c-source"><button type="button" data-v="live"><span class="m-dot"></span>Live from app</button><button type="button" data-v="image">Image</button></div>' +
      '<button type="button" class="s-slot s-slim empty" id="c-slot" data-slot="src"></button></div>' +
      '<div class="s-ps" id="c-ps"></div></div>' +
      '<div class="s-seg" id="c-area" hidden><button type="button" data-v="whole"></button><button type="button" data-v="paint"></button></div>' +
      '<div class="s-old"><div class="s-tiles4" id="c-presets">' +
      PRESETS.map(function (p) { return '<button type="button" data-v="' + p[0] + '">' + svg(p[3]) + "<span>" + p[1] + "</span></button>"; }).join("") + "</div></div>" +
      '<div><div class="s-label" id="c-prompt-l">Describe the result</div>' + promptBox("c", "Describe the change") + '<div class="s-warn" id="c-warn" hidden></div></div>' +
      '<div><div class="s-label s-lockl"><span>Keep</span><em>Studio never changes what is locked</em></div><div class="s-locks" id="c-locks">' +
      LOCKS.map(function (l) { return '<button type="button" data-v="' + l[0] + '" title="' + l[3] + '">' + svg("lock") + svg("unlock") + "<span>" + l[1] + "</span><small>" + l[2] + "</small></button>"; }).join("") + "</div></div>" +
      '<div id="c-blend-w" hidden><div class="s-label">Blend edges <em id="c-blend-v"></em></div><input class="s-range" type="range" min="0" max="1" step="0.05" id="c-blend"></div>' +
      '<div id="c-look-w" hidden><div class="s-label">Style</div><select class="s-select" id="c-lora"></select></div>' +
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

    var board = document.createElement("div");
    board.className = "s-page"; board.id = "p-board";
    document.body.appendChild(board);
    if (window.VSBoard) window.VSBoard.build(board);
    loadStrip();
    var mach = document.createElement("div"); mach.id = "s-machine"; mach.className = "s-machine"; document.body.appendChild(mach);
    statsLoop();

    // Upscale's panel gets the same header (title + fold button) as the others.
    var urail = document.querySelector(".shell .rail");
    if (urail && !urail.querySelector(".s-rh")) {
      var uh = document.createElement("div"); uh.className = "s-rh";
      uh.innerHTML = '<h3>Upscale</h3><button type="button" class="s-min" data-min="rail" title="Collapse / expand"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>';
      urail.insertBefore(uh, urail.firstChild);
    }
    // Upscale gets the same bar above its button: Refine · To board · Photoshop.
    var ufoot = document.querySelector(".shell .rail .rail-foot");
    if (ufoot && !$("u-acts")) {
      var ua = document.createElement("div"); ua.className = "s-acts3"; ua.id = "u-acts";
      ua.innerHTML = '<button type="button" class="s-btn" id="u-refine" title="Open the upscaled picture in Create to change it">' + svg("sketch") + "<span>Refine</span></button>" +
        '<button type="button" class="s-btn" id="u-toboard" title="Put the upscaled picture on the board">' + svg("board") + "<span>To board</span></button>" +
        '<button type="button" class="s-btn" id="u-tops" title="Send the upscaled picture to Photoshop"><span class="m-ico ps">Ps</span><span>Export</span></button>';
      ufoot.insertBefore(ua, ufoot.firstChild);
      var upic = function () {
        var c = window.VUpscale && window.VUpscale.current();
        return c && c.status === "done" && c.out_path ? c.out_path : null;
      };
      $("u-refine").addEventListener("click", function () {
        var path = upic(); if (!path) return;
        api().studio_image(path).then(function (info) {
          if (!info) { toast("That picture isn't there any more."); return; }
          S.create.source = "image"; setImage(S.create, "src", info); go("create");
          setTimeout(function () { var b = $("c-text"); if (b) b.focus(); }, 250);
        });
      });
      $("u-toboard").addEventListener("click", function () {
        var path = upic(); if (!path || !window.VSBoard) return;
        api().studio_image(path).then(function (info) {
          if (!info) { toast("That picture isn't there any more."); return; }
          window.VSBoard.addResult(info, null); toast("Added to the board"); uState();
        });
      });
      $("u-tops").addEventListener("click", function () { var path = upic(); if (path) sendPS(path); });
      var uState = function () {
        var path = upic(), onB = !!(path && window.VSBoard && window.VSBoard.has(path));
        $("u-refine").disabled = !path; $("u-tops").disabled = !path; $("u-toboard").disabled = !path || onB;
        $("u-toboard").querySelector("span").textContent = onB ? "On board" : "To board";
      };
      if (window.VUpscale) window.VUpscale.onRender = uState;
      uState();
    }
    // Floating side panels fold away for more room; remembered.
    document.body.classList.toggle("nav-min", !!load("navMin", false));
    document.body.classList.toggle("rail-min", !!load("railMin", false));
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-min]"); if (!b) return;
      e.stopPropagation();
      var k = b.getAttribute("data-min") === "nav" ? "nav-min" : "rail-min";
      var onNow = document.body.classList.toggle(k);
      keep(k === "nav-min" ? "navMin" : "railMin", onNow);
      setTimeout(layout, 220);
    }, true);

    wire();
    painter.init();
    go("board");             // Studio always opens on the board
    refresh();
  }

  // ------------------------------------------------------------------ actions

  function go(p) {
    if (["board", "create", "reference", "upscale", "library", "settings"].indexOf(p) < 0) p = "board";
    S.page = p; keep("page", p);
    document.body.setAttribute("data-page", p);
    document.querySelectorAll(".s-nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-page") === p); });
    document.querySelectorAll(".s-page").forEach(function (el) { el.classList.toggle("on", el.id === "p-" + p); });
    if (api()) api().studio_drop_target(p);
    if (p === "library") loadLibrary();
    if (p === "settings" || p === "create" || p === "reference" || p === "board") refresh();
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

  // -- pop-up menus (the + menu, tool drop-downs, the layer menu) ----------------------
  var popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  // Opens html under (or beside) an element; clicks on [data-p] go to onPick(value, element).
  function pop(anchor, html, onPick, side) {
    closePop();
    popEl = document.createElement("div"); popEl.className = "s-pop"; popEl.innerHTML = html;
    document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect(), w = popEl.offsetWidth, h = popEl.offsetHeight;
    var x = side === "right" ? r.right + 8 : r.left, y = side === "right" ? r.top : r.bottom + 8;
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x)) + "px";
    popEl.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y)) + "px";
    popEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-p]"); if (!b || b.disabled) return;
      var keep = onPick(b.getAttribute("data-p"), b, e);
      if (keep !== true) closePop();
    });
    var me = popEl;
    setTimeout(function () {
      var off = function (e) {
        if (!popEl || popEl !== me) { document.removeEventListener("pointerdown", off, true); return; }
        if (!popEl.contains(e.target) && !anchor.contains(e.target)) { closePop(); document.removeEventListener("pointerdown", off, true); }
      };
      document.addEventListener("pointerdown", off, true);
    }, 0);
    return popEl;
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && popEl) { closePop(); e.stopPropagation(); }
    else if (e.key === "Escape" && $("s-phone")) { closePhone(); e.stopPropagation(); }
  }, true);

  // The + menu: a blank canvas, a picture from disk, the clipboard or the phone.
  var FORMATS = { a4p: [1240, 1754, "Portrait"], a4l: [1754, 1240, "Landscape"], wide: [1920, 1080, "16 : 9"], sq: [1600, 1600, "Square"] };
  function plusMenu(anchor, onAdd) {
    var fmt = load("blankFmt", "a4p");
    var html = function () {
      return '<button type="button" class="it" data-p="blank">' + svg("page") + '<span>Blank canvas<small>' +
        (fmt.indexOf("a4") === 0 ? "A4 · 150 DPI · " : "") + FORMATS[fmt][0] + " × " + FORMATS[fmt][1] + ' px</small></span><span class="k">N</span></button>' +
        '<div class="chips">' + Object.keys(FORMATS).map(function (k) { return '<button type="button" data-p="fmt:' + k + '" class="' + (k === fmt ? "on" : "") + '">' + FORMATS[k][2] + "</button>"; }).join("") + "</div>" +
        '<hr><button type="button" class="it" data-p="pick">' + svg("image") + '<span>Upload an image</span><span class="k">I</span></button>' +
        '<button type="button" class="it" data-p="paste">' + svg("clip") + '<span>Paste from clipboard</span><span class="k">Ctrl V</span></button>' +
        '<button type="button" class="it" data-p="phone">' + svg("phone") + '<span>Upload from phone<small>Scan a QR code · same Wi-Fi</small></span><span class="k">/</span></button>';
    };
    var el = pop(anchor, html(), function (v) {
      if (v.indexOf("fmt:") === 0) { fmt = v.slice(4); keep("blankFmt", fmt); el.innerHTML = html(); return true; }
      if (v === "blank") api().studio_blank(FORMATS[fmt][0], FORMATS[fmt][1]).then(function (i) { if (i) onAdd(i); });
      else if (v === "pick") api().studio_pick().then(function (i) { if (i) onAdd(i); });
      else if (v === "paste") api().studio_paste().then(function (i) { if (i) onAdd(i); else toast("Nothing to paste: copy a picture first."); });
      else if (v === "phone") phoneDialog();
    });
    el.classList.add("s-plus");
  }
  // Upload from phone: a QR code; whatever the phone sends lands on the board.
  function phoneDialog() {
    closePhone();
    var veil = document.createElement("div"); veil.className = "s-phone"; veil.id = "s-phone";
    veil.innerHTML = '<div class="box"><button type="button" class="x" data-ph="close" aria-label="Close">×</button><h3>Send a sketch from your phone</h3>' +
      "<p>Scan with the phone's camera. Phone and PC on the same Wi-Fi.<br>Photos and scans land on the board.</p>" +
      '<div class="qr"><span class="wait">Starting…</span></div><div class="st"><i></i><span>Waiting for your phone…</span></div><small class="u"></small></div>';
    document.body.appendChild(veil);
    veil.addEventListener("click", function (e) { if (e.target === veil || e.target.closest("[data-ph=close]")) closePhone(); });
    api().studio_phone(true).then(function (r) {
      if (!$("s-phone")) return;
      if (!r || r.error) { veil.querySelector(".qr").innerHTML = '<span class="wait">' + esc((r && r.error) || "Couldn't start.") + "</span>"; return; }
      veil.querySelector(".qr").innerHTML = '<img src="' + r.qr + '" alt="QR code">';
      veil.querySelector(".u").textContent = r.url.split("?")[0];
    });
  }
  function closePhone() { var v = $("s-phone"); if (v) { v.remove(); if (api() && api().studio_phone) api().studio_phone(false); } }
  function phoneGot(n) {
    var v = $("s-phone"); if (!v) return;
    v.querySelector(".st span").textContent = n + (n > 1 ? " pictures" : " picture") + " on the board ✓ Send more, or close this.";
    v.querySelector(".st").classList.add("ok");
  }

  // -- the machine line: graphics card, processor, memory (tiny, live) ------------------
  var statsT = 0;
  function bar(p, cls) { return '<i class="' + (cls || "") + '"><u style="width:' + Math.max(0, Math.min(100, p || 0)) + '%"></u></i>'; }
  function statsLoop() {
    clearTimeout(statsT);
    var busy = !!(S.create.job || S.ref.job);
    statsT = setTimeout(statsLoop, document.hidden ? 6000 : busy ? 1200 : 3000);
    if (document.hidden || !api() || !api().studio_stats) return;
    api().studio_stats().then(function (m) {
      var el = $("s-machine"); if (!el || !m) return;
      var p = S.page === "reference" ? S.ref : S.create, parts = [];
      if (p.job) parts.push('<span class="job">● ' + esc(p.stage || "Working") + (p.frac ? " · " + Math.round(p.frac * 100) + "%" : "") + "</span><span class=\"sep\"></span>");
      if (m.gpu) parts.push("<span>GPU <b>" + esc(m.gpu.name) + "</b>" + bar(m.gpu.load, "g") + "<b>" + m.gpu.load + "%</b> <b class=\"" + (m.gpu.temp >= 80 ? "hot" : "") + "\">" + m.gpu.temp + "°</b></span>" +
        "<span>VRAM" + bar(100 * m.gpu.used / m.gpu.total, "g") + "<b>" + m.gpu.used.toFixed(1) + "/" + Math.round(m.gpu.total) + " GB</b></span><span class=\"sep\"></span>");
      if (m.cpu) parts.push("<span>CPU" + (m.cpu.name ? " <b>" + esc(m.cpu.name) + "</b>" : "") + bar(m.cpu.load) + "<b>" + (m.cpu.load == null ? "–" : m.cpu.load + "%") + "</b>" + (m.cpu.temp ? " <b>" + m.cpu.temp + "°</b>" : "") + "</span>");
      if (m.ram) parts.push("<span>RAM" + bar(100 * m.ram.used / m.ram.total) + "<b>" + m.ram.used.toFixed(0) + "/" + m.ram.total + " GB</b></span>");
      el.innerHTML = parts.join("");
    });
  }

  // -- the results strips survive a restart -----------------------------------------
  // Only paths are kept (strip.json); thumbnails are made again on start, the full
  // picture is read from its folder when a result is clicked. A file that was moved
  // or deleted shows as missing.
  var stripSig = null;
  window.VSStrip = { load: function () { stripSig = null; loadStrip(); } };   // for the screen tests
  function stripData() {
    function one(p) {
      return p.results.slice(-80).map(function (r) {
        return { path: r.path, name: r.name, w: r.w, h: r.h, srcKey: r.srcKey || "",
                 source: (r.meta && r.meta.source) || r.source || "", meta: r.meta ? { text: r.meta.text || "", preset: r.meta.preset || "" } : null };
      });
    }
    return { v: 1, create: one(S.create), ref: one(S.ref),
             imageSrc: S.create.imageSrc && !S.create.imageSrc.live ? S.create.imageSrc.path : "",
             source: S.create.source || "" };
  }
  function saveStrip() {
    if (stripSig === null) return;                 // not loaded yet: don't overwrite with an empty strip
    var d = stripData(), sig = JSON.stringify(d);
    if (sig === stripSig) return;
    stripSig = sig;
    if (api() && api().studio_strip_save) api().studio_strip_save(d);
  }
  function loadStrip() {
    var a = api(); if (!a || !a.studio_strip_get) { stripSig = ""; return; }
    a.studio_strip_get().then(function (d) {
      d = d || {};
      [[S.create, d.create], [S.ref, d.ref]].forEach(function (pair) {
        var p = pair[0], list = pair[1] || [];
        var back = list.map(function (r) {
          return { path: r.path, name: r.name, w: r.w, h: r.h, srcKey: r.srcKey, source: r.source, meta: r.meta,
                   preview: BLANK, thin: true };
        });
        p.results = back.concat(p.results);         // anything made already this session stays after
        if (p.sel >= 0) p.sel += back.length;
        back.forEach(function (r) {
          a.studio_thumb(r.path).then(function (t) { if (t) r.preview = t; else r.missing = true; render(); });
          if (r.source) a.studio_thumb(r.source).then(function (t) { if (t) { r.orig = t; render(); } });
        });
      });
      stripSig = JSON.stringify(stripData());
      if (d.imageSrc && !S.create.src && d.source === "image") {
        a.studio_image(d.imageSrc).then(function (info) { if (info && !S.create.src) setImage(S.create, "src", info); });
      }
      render();
    });
  }
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAO7v8wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  // Clicking a result kept from an earlier session reads the full picture from its folder.
  function pickResult(p, i) {
    var r = i >= 0 ? p.results[i] : null;
    if (!r || !r.thin) { p.sel = i; render(); return; }
    api().studio_image(r.path).then(function (info) {
      if (!info) {
        r.missing = true; render();
        toast("This image is missing from its original location: " + r.path);
        return;
      }
      r.preview = info.preview; r.w = info.w; r.h = info.h; r.thin = false; r.missing = false;
      p.sel = i; render();
    });
  }
  function current(p) { return p.sel >= 0 ? p.results[p.sel] : null; }
  // What the bar above Create acts on: the chosen result, else the picture you opened
  // (not the live canvas, which isn't a file of its own).
  function target(p) {
    var c = current(p); if (c) return c;
    var s = p.src; return s && !s.live && !s.frozen && s.path ? s : null;
  }

  function setImage(p, slot, info) {
    if (!info) return;
    p[slot] = info;
    if (p === S.create && slot === "src" && !info.live) S.boardFrom = null;   // board.js sets it after, when opened from a tile
    if (p === S.ref && slot === "src") S.boardFromRef = null;
    if (p === S.create && slot === "src") {
      if (info.live) p.liveSrc = info; else { p.imageSrc = info; p.source = "image"; }
      var same = info.live && p.liveSize === info.w + "x" + info.h;
      // Never drop results when the picture changes: the strip shows the ones made
      // from this picture, the rest stay under "Earlier" (opening a board tile used to lose them).
      if (!info.live) p.sel = -1;
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
      // A selection (lasso, pen, object, Photoshop…) limits the change to that area.
      var m = painter.export();
      if (m) { j.mask = m; j.blend = p.blend; }
      else if (p.src.live && S.psSel && S.useSel !== false) { j.mask = "ps-selection"; j.blend = p.blend; }
      // Painted layers: Create works on all visible layers, flattened.
      var lay = window.VSSketch && window.VSSketch.payload(p.src);
      if (lay) j.layers = lay;
      j.lora = p.lora || null;
      j.locks = Object.assign({}, p.locks || defaultLocks(p.src));
      if (!j.locks.design) j.keep = Math.min(j.keep, 0.35);        // design unlocked: free to change shapes
    }
    Object.assign(j, extra || {});
    p.error = ""; p.stage = "Starting"; p.frac = 0; p.pending = j.variations; p.started = Date.now(); p.estimate = 0;
    p.jobKey = srcKey(p.src);
    // Create works on the sketch as it is now: freeze a copy. Live keeps
    // updating in the background and comes back when the run is done.
    p.jobOrig = p.src.preview; p.preview = null; p.previewN = 0;
    if (p.src.live) { p.src = Object.assign({}, p.src, { live: false, frozen: true }); p.sel = -2; }
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
    $("c-locks").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var p = S.create, k = b.getAttribute("data-v");
      p.locks = Object.assign({}, p.locks || defaultLocks(p.src)); p.locks[k] = !p.locks[k]; p.locksFor = keyOfSrc(p.src); render();
    });
    $("c-warn").addEventListener("click", function (e) {
      var b = e.target.closest("[data-unlock]"); if (!b) return;
      var p = S.create; p.locks = Object.assign({}, p.locks || defaultLocks(p.src));
      b.getAttribute("data-unlock").split(",").forEach(function (k) { p.locks[k] = false; }); p.locksFor = keyOfSrc(p.src); render();
    });
    $("c-work").addEventListener("click", function (e) {
      if (e.target.closest("[data-w=board]")) { go("board"); return; }
      pick("c", "src");
    });
    $("c-presets").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var v = b.getAttribute("data-v"); S.create.preset = S.create.preset === v ? "" : v; keep("c.preset", S.create.preset); render();
    });
    $("c-text").addEventListener("input", function () { S.create.text = this.value; renderWarn(); });
    $("c-blend").addEventListener("input", function () { S.create.blend = +this.value; keep("c.blend2", S.create.blend); renderValues(); });
    $("c-lora").addEventListener("change", function () { S.create.lora = this.value; keep("c.lora", this.value); });
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
        var c = target(p); if (!c) return;
        api().studio_to_upscale(c.path).then(function () { go("upscale"); });
      });
      $(id + "-clear").addEventListener("click", function () {
        p.results = []; p.sel = -1;
        if (id === "c" && !(p.src && p.src.live)) { p.src = null; p.imageSrc = null; }
        if (id === "r") { p.src = null; p.refimg = null; }
        render();
      });
      $(id + "-reveal").addEventListener("click", function () { var c = target(p); if (c) api().reveal(c.path); });
      $(id + "-refine-this").addEventListener("click", function () {
        var t = (p.text || "").trim();
        if (!t) { var box = $(id + "-text"); if (box) box.focus(); toast("Type what to change in the prompt, then Refine this"); return; }
        $(id + "-refine").value = t; refine(id);
      });
      $(id + "-toboard").addEventListener("click", function () {
        var c = target(p); if (!c || !window.VSBoard) return;
        window.VSBoard.addResult(c, current(p) ? (id === "c" ? S.boardFrom : S.boardFromRef) : null);
        toast("Added to the board");
      });
      $(id + "-tops").addEventListener("click", function () { var c = target(p); if (c) sendPS(c.path); });
      if (id === "c") $("c-tolayer").addEventListener("click", function () {
        var c = current(p); if (!c || !p.src || !window.VSSketch) return;
        var put = function () { window.VSSketch.addImageLayer(p.src, c.preview, short(c.name)); p.sel = -1; render(); toast("On a layer over your picture · the board shows it too"); };
        if (p.src.live || p.src.frozen) window.VSSketch.branch(function () { setTimeout(put, 50); }); else put();
      });
      $(id + "-strip").addEventListener("click", function (e) {
        var t = e.target.closest("[data-i]"); if (t) { pickResult(p, +t.getAttribute("data-i")); return; }
        if (e.target.closest(".s-more")) job(id, { variations: 1 });
        if (e.target.closest(".s-earlier")) { p.showEarlier = !p.showEarlier; render(); }
      });
      // Hold on a result to see what it started from.
      var view = $(id + "-view");
      zoom.wire(view);
      view.addEventListener("pointerdown", function (e) { if (e.button !== 0 || zoom.space || zoom.pan || e.target.closest(".s-zpill,.s-paintbtn")) return; var img = view.querySelector("img.s-res"), c = current(p), o = (c && c.orig) || (p.src && p.src.preview); if (img && o) { img.src = o; view.classList.add("hold"); } });
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
      else if (a === "sel") { S.useSel = S.useSel === false; render(); }
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
      if (pg === "create" && !inText && window.VSSketch && S.create.src && !current(S.create) && window.VSSketch.key(e)) e.preventDefault();
    });
    new ResizeObserver(function () { layout(); }).observe(document.body);
  }

  // ------------------------------------------------------------------ the brush

  var painter = {
    w: 0, h: 0, size: load("brush", 60), erase: false, selecting: false, busy: false, undo: [], canvas: null, ctx: null, ring: null, drawing: false, last: null, any: false,
    // The selection: the area Create may change. Drawn by the sketch tools
    // (lasso, rectangle, pen, object, Photoshop); the brushes paint on layers.
    tool: "lasso", mode: "new", path: null, cost: null, rect: null,
    init: function () {
      this.canvas = document.createElement("canvas"); this.canvas.className = "s-selmask";
      this.ctx = this.canvas.getContext("2d");
      this.ring = document.createElement("div"); this.ring.className = "s-ring"; this.ring.hidden = true;
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); this.svg.setAttribute("class", "s-pathov");
      this.svg.setAttribute("preserveAspectRatio", "none");
    },
    pointerDown: function (e) {
      if (this.tool === "object") { this.pick(e); return; }
      if (this.tool === "rect") { if (e.button !== 0) return; var p = this.point(e); this.rect = { a: p, b: p, cut: e.altKey }; this.drawRect(); return; }
      this.pathDown(e);
    },
    pointerMove: function (e) {
      if (this.rect) { this.rect.b = this.point(e); this.rect.shift = e.shiftKey; this.drawRect(); return; }
      if (this.path) this.pathMove(e);
    },
    pointerUp: function (e) {
      if (this.rect) {
        var R = this.rect; this.rect = null; this.svg.innerHTML = "";
        var x = Math.min(R.a[0], R.b[0]), y = Math.min(R.a[1], R.b[1]), w = Math.abs(R.b[0] - R.a[0]), h = Math.abs(R.b[1] - R.a[1]);
        if (w < 3 || h < 3) return;
        this.fillShape("M" + x + " " + y + "h" + w + "v" + h + "h" + -w + "Z", R.cut || e.altKey);
        return;
      }
      if (this.path) this.pathUp(e);
    },
    dblclick: function (e) { if (this.path) { e.preventDefault(); e.stopPropagation(); this.close(e.altKey); } },
    drawRect: function () {
      var R = this.rect, k = this.scale() || 1, x = Math.min(R.a[0], R.b[0]), y = Math.min(R.a[1], R.b[1]), w = Math.abs(R.b[0] - R.a[0]), h = Math.abs(R.b[1] - R.a[1]);
      this.svg.innerHTML = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="none" stroke="#fff" stroke-width="' + 2.6 * k + '"/>' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="none" stroke="#14161f" stroke-width="' + 1.6 * k + '" stroke-dasharray="' + 5 * k + " " + 4 * k + '" class="ants"/>';
    },
    // Puts a closed shape into the selection: replace, add or cut out (Alt or Subtract).
    fillShape: function (d, cut) {
      this.push();
      var ctx = this.ctx, sub = cut || this.mode === "sub";
      if (this.mode === "new" && !cut) ctx.clearRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = sub ? "destination-out" : "source-over";
      ctx.fillStyle = "#8A2BF2"; ctx.fill(new Path2D(d));
      ctx.globalCompositeOperation = "source-over";
      this.check(); this.hint(); render();
    },
    brushy: function () { return this.tool === "brush" || this.tool === "erase"; },
    setTool: function (t) { this.cancelPath(); this.tool = t; this.selecting = t === "object"; },
    refreshRing: function () {},
    reset: function (info) {
      var f = Math.min(1, 2048 / Math.max(info.w, info.h));
      this.w = Math.max(1, Math.round(info.w * f)); this.h = Math.max(1, Math.round(info.h * f));
      this.canvas.width = this.w; this.canvas.height = this.h;
      this.ctx.clearRect(0, 0, this.w, this.h); this.undo = []; this.any = false;
      this.svg.setAttribute("viewBox", "0 0 " + this.w + " " + this.h); this.path = null; this.cost = null; this.drawPath();
    },
    scale: function () { var r = this.canvas.getBoundingClientRect(); return r.width ? this.w / r.width : 1; },
    point: function (e) {
      var r = this.canvas.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height, f = window.VSSketch ? window.VSSketch.flip() : {};
      if (f.h) u = 1 - u; if (f.v) v = 1 - v;
      return [u * this.w, v * this.h];
    },
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
      var u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height, fl = window.VSSketch ? window.VSSketch.flip() : {};
      if (fl.h) u = 1 - u; if (fl.v) v = 1 - v;
      var add = !(e.altKey || e.button === 2 || this.mode === "sub");
      this.busy = true; this.hint("Selecting…"); this.canvas.style.cursor = "progress";
      api().studio_select(S.create.src.path, [[u, v, true]], this.w, this.h).then(function (res) {
        self.busy = false; self.canvas.style.cursor = "";
        if (!res || res.error) { self.hint(res && res.error ? res.error : "Couldn't select that."); return; }
        var img = new Image();
        img.onload = function () {
          self.push();
          var ctx = self.ctx;
          if (add && self.mode === "new" && !e.shiftKey) ctx.clearRect(0, 0, self.w, self.h);
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
      var t = this.tool;
      if (t === "object") return "Click a part to select it · Alt+click or right click removes · fix edges with the brush";
      if (t === "lasso") return "Click, then follow an edge: it snaps · click the start or double-click to close · Alt: cut out · Esc cancels";
      if (t === "pen") return "Click: corner · drag: curve · click the start or Enter to close · Alt: cut out · Backspace: undo point";
      return "Paint what should change · [ ] brush size · wheel zooms · middle button or Space pans";
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
    // Keys while a selection tool is on; true when the key was used.
    key: function (e) {
      if (e.key === "Escape" && (this.path || this.rect)) { e.preventDefault(); this.cancelPath(); this.rect = null; this.svg.innerHTML = ""; return true; }
      if (e.key === "Enter" && this.path) { e.preventDefault(); this.close(e.altKey); return true; }
      if (e.key === "Backspace" && this.path) { e.preventDefault(); this.dropPoint(); return true; }
      return false;
    },
    tools: function () {
      var t = this.tool, b = function (k, icon, label, key) {
        return '<button type="button" data-t="' + k + '" class="' + (t === k ? "on" : "") + '" title="' + label + " (" + key + ')">' + svg(icon) + label + "</button>";
      };
      var live = S.create.src && (S.create.src.live || S.create.src.frozen);
      return '<div class="s-tools" id="c-tools">' +
        b("brush", "brush", "Brush", "B") + b("erase", "erase", "Erase", "E") + b("lasso", "lasso", "Lasso", "L") + b("pen", "pen", "Pen", "P") + b("object", "select", "Object", "S") +
        '<span class="sep"></span><label title="[ and ]">Size <input type="range" id="c-size" min="6" max="400" value="' + this.size + '"></label><span class="sep"></span>' +
        (live ? '<button type="button" data-t="pssel" title="Use the selection you made in Photoshop"' + (S.psSel ? "" : " disabled") + '><span class="m-ico ps">Ps</span>Selection</button>' : "") +
        '<button type="button" data-t="undo" title="Ctrl Z">' + svg("undo") + "Undo</button>" +
        '<button type="button" data-t="clear" title="Ctrl D">' + svg("deselect") + "Deselect</button><button type=\"button\" data-t=\"invert\">Invert</button>" +
        '<span class="sep"></span><button type="button" data-t="done" class="done">Done</button></div>' +
        '<div class="s-maskhint">' + this.hintText() + "</div>";
    },

    // -- lasso (snaps to edges) and pen (corners and curves) ------------------------
    near: function (a, b) { var k = this.scale(); return Math.hypot(a[0] - b[0], a[1] - b[1]) < 9 * k; },
    pathDown: function (e) {
      var pt = this.point(e);
      if (e.button === 2) { this.dropPoint(); return; }
      if (!this.path) {
        this.path = { kind: this.tool, pts: [pt], live: [], nodes: [{ x: pt[0], y: pt[1], hx: pt[0], hy: pt[1] }], down: null };
        if (this.tool === "lasso") this.costMap();
        this.drawPath(); this.hint(); return;
      }
      var P = this.path, first = P.kind === "pen" ? [P.nodes[0].x, P.nodes[0].y] : P.pts[0];
      if ((P.kind === "pen" ? P.nodes.length > 2 : P.pts.length > 3) && this.near(pt, first)) { this.close(e.altKey); return; }
      if (P.kind === "lasso") { P.pts = P.pts.concat(P.live.length ? P.live.slice(1) : [pt]); P.live = []; }
      else { P.nodes.push({ x: pt[0], y: pt[1], hx: pt[0], hy: pt[1] }); P.down = pt; this.canvas.setPointerCapture(e.pointerId); }
      this.drawPath();
    },
    pathMove: function (e) {
      var P = this.path, pt = this.point(e);
      if (P.kind === "pen") {
        if (P.down) { var n = P.nodes[P.nodes.length - 1]; n.hx = pt[0]; n.hy = pt[1]; }   // dragging out a curve
        P.hover = pt; this.drawPath(); return;
      }
      // Lasso: the live part runs along the edges from the last point to the pointer;
      // a long run pins itself, so you can just follow an edge.
      var a = P.pts[P.pts.length - 1];
      P.live = this.snap(a, pt);
      if (P.live.length > 1) {
        var run = 0; for (var i = 1; i < P.live.length; i++) run += Math.hypot(P.live[i][0] - P.live[i - 1][0], P.live[i][1] - P.live[i - 1][1]);
        if (run > 70 * this.scale()) { P.pts = P.pts.concat(P.live.slice(1)); P.live = []; }
      }
      this.drawPath();
    },
    pathUp: function () { if (this.path && this.path.kind === "pen") this.path.down = null; },
    dropPoint: function () {
      var P = this.path; if (!P) return;
      if (P.kind === "pen") { P.nodes.pop(); if (!P.nodes.length) this.path = null; }
      else { P.pts.splice(Math.max(1, P.pts.length - 12)); P.live = []; if (P.pts.length < 2) this.path = null; }
      this.drawPath();
    },
    cancelPath: function () { this.path = null; if (this.svg) this.drawPath(); },
    shape: function (closed) {
      var P = this.path, d = "";
      if (!P) return "";
      if (P.kind === "lasso") {
        var pts = P.pts.concat(P.live.slice(1));
        d = pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("");
      } else {
        var N = P.nodes;
        d = "M" + N[0].x + " " + N[0].y;
        var seg = function (a, b) {
          var ox = a.hx, oy = a.hy, ix = 2 * b.x - b.hx, iy = 2 * b.y - b.hy;     // a's handle out, b's handle in (mirrored)
          return "C" + ox + " " + oy + " " + ix + " " + iy + " " + b.x + " " + b.y;
        };
        for (var i = 1; i < N.length; i++) d += seg(N[i - 1], N[i]);
        if (closed) d += seg(N[N.length - 1], N[0]);
        else if (P.hover && !P.down) d += "L" + P.hover[0] + " " + P.hover[1];
      }
      return d + (closed ? "Z" : "");
    },
    drawPath: function () {
      if (!this.svg) return;
      var P = this.path, k = this.scale() || 1;
      if (!P) { this.svg.innerHTML = ""; return; }
      var d = this.shape(false), sw = 1.6 * k;
      var marks = (P.kind === "pen" ? P.nodes.map(function (n) { return [n.x, n.y]; }) : [P.pts[0]]).map(function (q, i) {
        var r = (i ? 3.2 : 4.5) * k;
        return '<rect x="' + (q[0] - r) + '" y="' + (q[1] - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="' + (i ? "#fff" : "#6d5df5") + '" stroke="#14161f" stroke-width="' + k + '"/>';
      }).join("");
      var handles = P.kind === "pen" ? P.nodes.filter(function (n) { return n.hx !== n.x || n.hy !== n.y; }).map(function (n) {
        return '<line x1="' + (2 * n.x - n.hx) + '" y1="' + (2 * n.y - n.hy) + '" x2="' + n.hx + '" y2="' + n.hy + '" stroke="#6d5df5" stroke-width="' + k + '"/>' +
          '<circle cx="' + n.hx + '" cy="' + n.hy + '" r="' + 3 * k + '" fill="#6d5df5"/>';
      }).join("") : "";
      this.svg.innerHTML = '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="' + 2.6 * k + '"/>' +
        '<path d="' + d + '" fill="none" stroke="#14161f" stroke-width="' + sw + '" stroke-dasharray="' + 5 * k + " " + 4 * k + '" class="ants"/>' + handles + marks;
    },
    close: function (cut) {
      var P = this.path; if (!P) return;
      var d = this.shape(true); this.path = null; this.drawPath();
      if (!d || (P.kind === "lasso" ? P.pts.length < 3 : P.nodes.length < 3)) return;
      this.fillShape(d, cut);
    },
    // Edge strength of the picture, once per picture: where the lasso likes to run.
    costMap: function () {
      if (this.cost) return;
      var img = document.querySelector("#c-view .s-fit img"); if (!img || !img.naturalWidth) return;
      var ds = Math.min(1, 900 / Math.max(this.w, this.h)), cw = Math.max(2, Math.round(this.w * ds)), ch = Math.max(2, Math.round(this.h * ds));
      var t = document.createElement("canvas"); t.width = cw; t.height = ch;
      var tc = t.getContext("2d"); tc.drawImage(img, 0, 0, cw, ch);
      var px = tc.getImageData(0, 0, cw, ch).data, g = new Float32Array(cw * ch), L = new Float32Array(cw * ch), i, x, y, mx = 1e-6;
      for (i = 0; i < cw * ch; i++) L[i] = 0.3 * px[4 * i] + 0.59 * px[4 * i + 1] + 0.11 * px[4 * i + 2];
      for (y = 1; y < ch - 1; y++) for (x = 1; x < cw - 1; x++) {
        i = y * cw + x;
        var gx = L[i - cw + 1] + 2 * L[i + 1] + L[i + cw + 1] - L[i - cw - 1] - 2 * L[i - 1] - L[i + cw - 1];
        var gy = L[i + cw - 1] + 2 * L[i + cw] + L[i + cw + 1] - L[i - cw - 1] - 2 * L[i - cw] - L[i - cw + 1];
        g[i] = Math.sqrt(gx * gx + gy * gy); if (g[i] > mx) mx = g[i];
      }
      var cost = new Float32Array(cw * ch);
      for (i = 0; i < cw * ch; i++) cost[i] = 0.04 + Math.pow(1 - Math.min(1, g[i] / (mx * 0.6)), 2);
      this.cost = { cw: cw, ch: ch, ds: ds, c: cost };
    },
    // The cheapest way along edges from a to b (Dijkstra in a box round both).
    snap: function (a, b) {
      var C = this.cost; if (!C) return [a, b];
      var ds = C.ds, ax = Math.round(a[0] * ds), ay = Math.round(a[1] * ds), bx = Math.round(b[0] * ds), by = Math.round(b[1] * ds);
      var m = 24, x0 = Math.max(0, Math.min(ax, bx) - m), y0 = Math.max(0, Math.min(ay, by) - m);
      var x1 = Math.min(C.cw - 1, Math.max(ax, bx) + m), y1 = Math.min(C.ch - 1, Math.max(ay, by) + m);
      var W = x1 - x0 + 1, H = y1 - y0 + 1;
      if (W * H > 160000 || (ax === bx && ay === by)) return [a, b];
      var dist = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
      var heap = [], push = function (n, d) {
        heap.push([d, n]); var i = heap.length - 1;
        while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; }
      }, pop = function () {
        var top = heap[0], last = heap.pop();
        if (heap.length) { heap[0] = last; var i = 0;
          for (;;) { var l = 2 * i + 1, r = l + 1, s = i;
            if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
            if (s === i) break; var t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s; } }
        return top;
      };
      var start = (ay - y0) * W + (ax - x0), goal = (by - y0) * W + (bx - x0);
      dist[start] = 0; push(start, 0);
      var dx = [1, -1, 0, 0, 1, 1, -1, -1], dy = [0, 0, 1, -1, 1, -1, 1, -1], dw = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];
      while (heap.length) {
        var it = pop(), n = it[1]; if (done[n]) continue; done[n] = 1; if (n === goal) break;
        var nx = n % W, ny = (n - nx) / W;
        for (var k = 0; k < 8; k++) {
          var qx = nx + dx[k], qy = ny + dy[k]; if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          var q = qy * W + qx; if (done[q]) continue;
          var nd = it[0] + dw[k] * C.c[(qy + y0) * C.cw + qx + x0];
          if (nd < dist[q]) { dist[q] = nd; from[q] = n; push(q, nd); }
        }
      }
      if (from[goal] < 0) return [a, b];
      var out = [], cur = goal;
      while (cur >= 0) { out.push([(cur % W + x0) / ds, (Math.floor(cur / W) + y0) / ds]); if (cur === start) break; cur = from[cur]; }
      out.reverse(); out[0] = a;
      return out;
    },
    psSelection: function () {
      if (!S.psSel) return;
      var self = this, img = new Image();
      img.onload = function () {
        self.push();
        // Photoshop's mask: white = selected. Turn it into brush colour where white.
        var t = document.createElement("canvas"); t.width = self.w; t.height = self.h;
        var tc = t.getContext("2d"); tc.drawImage(img, 0, 0, self.w, self.h);
        var d = tc.getImageData(0, 0, self.w, self.h), a = d.data;
        for (var i = 0; i < a.length; i += 4) { var v = a[i]; a[i] = 138; a[i + 1] = 43; a[i + 2] = 242; a[i + 3] = v; }
        tc.putImageData(d, 0, 0);
        self.ctx.globalCompositeOperation = "source-over"; self.ctx.drawImage(t, 0, 0);
        self.check(); render();
      };
      img.src = S.psSel.preview;
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
    toast(S.psOn ? "Sending to Photoshop…" : "Opening in Photoshop…");
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
    var label = id === "c" ? (painter.any ? "Change selected area" : "Create") : "Transfer";
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
      if (L.app && !APPS[L.app]) L.app = "";
      var cur = L.app || (have.indexOf(S.liveApp) >= 0 ? S.liveApp : have[0]);
      var nm = APPS[L.app || cur][1];
      h += '<div class="m-apps">' + have.map(function (k) {
        return '<button type="button" data-ps="app" data-app="' + k + '" class="' + (k === cur ? "on" : "") + '"><span class="m-ico ' + APPS[k][2] + '">' + APPS[k][0] + "</span>" + APPS[k][1] + "</button>";
      }).join("") + "</div>";
      var lv = p.liveSrc || (p.src && (p.src.live || p.src.frozen) ? p.src : null);
      if (L.on && L.frames && lv) {
        h += '<div class="m-card"><img src="' + lv.preview + '"><span>' + esc(L.doc) + "<small>" + nm +
          ' · updates as you draw</small></span><button type="button" class="s-link" data-ps="off">Stop</button></div>';
      } else if (L.on) {
        h += '<div class="s-ps-on"><span class="s-live-dot"></span><span><b>' + (L.state ? "Waiting for " : "Connecting to ") + nm + "</b><small>" +
          esc(L.state || (L.app === "photoshop" ? "Open Photoshop with the Vistiq Studio panel; your current file shows up here by itself."
                                                 : "Waiting for Affinity… turn on Settings → Model Context Protocol → Enable Affinity MCP.")) +
          '</small></span><button type="button" class="s-link" data-ps="off">Stop</button></div>';
      } else {
        h += '<button type="button" class="s-btn p" data-ps="on" data-app="' + cur + '" style="width:100%">Connect ' + APPS[cur][1] + "</button>";
      }
      if (cur === "photoshop" && L.on && S.psSel) h += '<div class="s-selnote"><span class="s-selsw"></span><span><b>' +
        (S.useSel !== false ? "Only your Photoshop selection changes" : "Whole picture (selection ignored)") +
        '</b></span><button type="button" class="s-link" data-ps="sel">' + (S.useSel !== false ? "Use whole picture" : "Use selection") + "</button></div>";
      if (cur === "photoshop") h += '<p class="s-hint" style="margin-top:6px">' + (L.msg || L.note ? esc(L.msg || L.note) : 'First time? <button type="button" class="s-link" data-ps="install">Install the Photoshop plugin</button>') + "</p>";
      else if (L.msg) h += '<p class="s-hint" style="margin-top:6px">' + esc(L.msg) + "</p>";
    }   // When an image is chosen, the live app keeps running quietly: the Live tab brings it back.
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

  // Page errors go into Studio's log, so problems can be found.
  function report(where, e) {
    try { if (window.console) console.error(e); api().js_log(where + ": " + (e && (e.stack || e.message) || e)); } catch (x) {}
  }
  window.addEventListener("error", function (ev) { report("page", ev.error || ev.message); });

  // Everything ever made from this picture comes back into its strip (from the
  // output folders), so the strip is complete after a restart too.
  function loadResultsFor(p, src) {
    var a = api(); if (!a || !a.studio_results_for) return;
    a.studio_results_for(src.name || "").then(function (list) {
      if (!list || !list.length || keyOfSrc(p.src) !== keyOfSrc(src)) return;
      var have = {}; p.results.forEach(function (r) { have[(r.path || "").toLowerCase()] = 1; });
      var k = srcKey(src), add = [];
      list.forEach(function (r) {
        if (have[r.path.toLowerCase()]) return;
        add.push({ path: r.path, name: r.name, w: r.w, h: r.h, preview: r.thumb || BLANK, thin: true, srcKey: k, meta: r.meta, made: r.made });
      });
      if (!add.length) return;
      var selPath = p.sel >= 0 && p.results[p.sel] ? p.results[p.sel].path : null;
      p.results = p.results.concat(add).sort(function (a, b) { return (a.made || 0) - (b.made || 0); });
      if (selPath) p.sel = p.results.map(function (r) { return r.path; }).indexOf(selPath);
      render();
    });
  }
  function keyOfSrc(src) { return src ? (src.live ? "live" : src.path) : ""; }
  // A word in the prompt that changes something locked: say so, with one click to unlock.
  function renderWarn() {
    var p = S.create, el = $("c-warn"), t = p.text || "", L = p.locks || defaultLocks(p.src), hit = [];
    Object.keys(LOCK_WORDS).forEach(function (k) { var m = L[k] && t.match(LOCK_WORDS[k]); if (m) hit.push([k, m[0]]); });
    // A sketch is rendered: describing its materials and light is the point, not a clash.
    if (!isRender(p.src)) hit = hit.filter(function (h) { return h[0] === "camera"; });
    var names = { design: "Design", materials: "Materials", light: "Light", camera: "Camera" };
    var h = hit.length ? svg("lock") + '<span><b>"' + hit.map(function (x) { return esc(x[1]); }).join('", "') + '"</b> would change ' +
      hit.map(function (x) { return names[x[0]]; }).join(" and ") + ', which ' + (hit.length > 1 ? "are" : "is") + ' locked. <button type="button" class="s-link" data-unlock="' +
      hit.map(function (x) { return x[0]; }).join(",") + '">Unlock</button> or keep it.</span>' : "";
    el.hidden = !h; if (el.getAttribute("data-h") !== h) { el.innerHTML = h; el.setAttribute("data-h", h); }
  }

  function renderCreate() {
    var p = S.create, st = S.status;
    $("c-imp").hidden = !(st && st.helper_ready);
    // One part failing to draw must not leave the rest of the panel stale.
    try { renderPS(); } catch (e) {
      report("renderPS", e);
      // Never leave Live from app without a way to connect.
      var el = $("c-ps"), fb = '<button type="button" class="s-btn p" data-ps="on" data-app="photoshop" style="width:100%">Connect Photoshop</button>';
      if ((p.source || "image") === "live" && el.getAttribute("data-h") !== fb) { el.innerHTML = fb; el.setAttribute("data-h", fb); }
    }
    try { setSlot($("c-slot"), p.src, "click to change", "Drop a sketch or render here, or click"); } catch (e) { if (window.console) console.error(e); }
    on($("c-area"), "data-v", p.area);
    on($("c-presets"), "data-v", p.preset);
    // Working on: what is open, where it came from.
    var w = p.src, wk = w ? keyOfSrc(w) + (w.preview || "").length : "";
    if ($("c-work").getAttribute("data-k") !== wk) {
      $("c-work").setAttribute("data-k", wk);
      $("c-work").innerHTML = w ? '<img src="' + w.preview + '" alt=""><span><b>' + esc(short(w.name || "")) + "</b><small>" +
        (w.live ? "Live from " + ((APPS[w.app] || APPS.photoshop)[1]) : isRender(w) ? "Render · " + w.w + " × " + w.h : (/sketch \d/i.test(w.name) ? "Sketch · " : "Picture · ") + w.w + " × " + w.h) +
        '</small></span><button type="button" class="s-link" data-w="board">← Board</button>' : '<span class="s-none">Open a tile on the board, or click here to pick a picture</span>';
    }
    $("c-ps").hidden = !(w && w.live);
    if (w && p.resultsFor !== keyOfSrc(w)) { p.resultsFor = keyOfSrc(w); loadResultsFor(p, w); }
    if (p.locksFor !== keyOfSrc(w)) { p.locks = defaultLocks(w); p.locksFor = keyOfSrc(w); }
    var LK = p.locks || defaultLocks(w);
    $("c-locks").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", !!LK[b.getAttribute("data-v")]); });
    p.preset = presetFor(p);
    $("c-prompt-l").textContent = isRender(w) ? "Describe the change" : "Describe the result";
    $("c-keep-w").hidden = !LK.design;
    $("c-keep-l").firstChild.textContent = "How strictly · Design ";
    renderWarn();
    $("c-text").placeholder = isRender(p.src) ? "What should change? (e.g. make the seats red leather)" : "What should it look like? (e.g. yellow nappa seats, soft morning light)";
    $("c-imp").hidden = !(st && st.helper_ready);
    if ($("c-text").value !== p.text && document.activeElement !== $("c-text")) $("c-text").value = p.text;
    $("c-blend-w").hidden = !painter.any;
    var looks = st ? st.loras.filter(function (l) { return l.family === "klein9b" && !l.builtin && !/klein-consistency|distill/i.test(l.name); }) : [];
    $("c-look-w").hidden = !looks.length;
    options($("c-lora"), looks, p.lora, "Standard");
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
      : p.src ? p.src.w + " × " + p.src.h : "";
    var ttl = esc(name) + "<small>" + sub + "</small>";
    if ($(id + "-ttl").getAttribute("data-h") !== ttl) { $(id + "-ttl").innerHTML = ttl; $(id + "-ttl").setAttribute("data-h", ttl); }
    var tg = target(p), onB = !!(tg && window.VSBoard && window.VSBoard.has(tg.path));
    $(id + "-up").disabled = !tg || !!p.job; $(id + "-reveal").disabled = !tg;
    $(id + "-toboard").disabled = !tg || onB;
    $(id + "-toboard").querySelector("span").textContent = onB ? "On board" : "Board";
    if (id === "c") $("c-tolayer").disabled = !c || !p.src || !!p.job;
    $(id + "-refine-this").hidden = false; $(id + "-refine-this").disabled = !c || !!p.job;
    $(id + "-tops").hidden = false; $(id + "-tops").disabled = !tg;
    $(id + "-tops").title = S.psOn ? "Put this picture in your open Photoshop file as a new layer" : "Open this picture in Photoshop";
    $(id + "-clear").hidden = true;          // results are never cleared: each picture always shows all it made
    $(id + "-refine-go").disabled = !!p.job || !(c || p.src);

    // The big view.
    var view = $(id + "-view"), mode, key;
    var origOf = p.sel === -2 ? (p.job ? p.jobOrig : (p.results.length ? p.results[p.results.length - 1].orig : null)) : null;
    if (c) { mode = "result"; key = c.path + (c.thin ? ":thin" : ""); }
    else if (origOf) { mode = "orig"; key = origOf.length + ":" + origOf.slice(-40) + (p.job && p.preview ? ":dev" + (p.previewN || 0) : ""); }
    else if (id === "c" && p.src && !p.job && window.VSSketch) { mode = "paint"; key = p.src.live ? "live" : p.src.path; }
    else if (p.src && id === "c") { mode = "src"; key = (p.job && p.liveSrc ? p.liveSrc.path : p.src.path + (p.src.frozen ? ":frozen" : "")) + (S.psSel && S.useSel !== false ? ":sel" + S.psSel.preview.length + S.psSel.preview.slice(-24) : ""); }
    else { mode = "empty"; key = id + (p.src ? "1" : "0"); }
    key = mode + ":" + key;
    if (view.getAttribute("data-k") !== key) {
      view.setAttribute("data-k", key);
      if (mode === "empty") {
        view.innerHTML = id === "c"
          ? '<div class="s-empty"><b>Start from a sketch or a render</b>Drop it anywhere on this page, paste it with Ctrl V, or click Start from.</div>'
          : '<div class="s-empty"><b>' + (p.src ? "Now add a reference" : "Add your design and a reference") + "</b>The result appears here.</div>";
      } else if (mode === "paint") {
        // Sketching: the picture with its layers, the tools on top, the selection over it.
        if (window.VSSketch) window.VSSketch.unmount();
        if (painter.w !== Math.round(p.src.w * Math.min(1, 2048 / Math.max(p.src.w, p.src.h)))) painter.reset(p.src);
        view.innerHTML = '<div class="s-fit" data-w="' + p.src.w + '" data-h="' + p.src.h + '"><img src="' + p.src.preview + '" alt=""></div>';
        var fit = view.querySelector(".s-fit");
        fit.appendChild(painter.canvas); fit.appendChild(painter.svg); painter.drawPath();
        window.VSSketch.mount(view, fit, p.src);
        view.insertAdjacentHTML("beforeend", '<span class="s-tag' + (p.src.live ? " s-livetag" : "") + '">' + (p.src.live ? '<i class="s-ldot"></i>Live from ' + ((APPS[p.src.app] || APPS.photoshop)[1]) : "Original") + "</span>");
      } else {
        var info = mode === "result" ? c : mode === "orig" ? { preview: origOf, w: p.src.w, h: p.src.h, frozen: true } :
          (p.job && p.liveSrc ? p.liveSrc : p.src);
        var dev = mode === "orig" && p.job && p.preview
          ? '<img class="s-dev" src="' + p.preview + '" alt="" style="opacity:' + Math.min(1, 0.35 + 0.13 * (p.previewN || 1)) + '">' : "";
        var selOv = mode === "src" && info.live && S.psSel && S.useSel !== false && id === "c"
          ? '<div class="s-selov" style="-webkit-mask-image:url(' + S.psSel.preview + ');mask-image:url(' + S.psSel.preview + ')"></div>' : "";
        view.innerHTML = '<div class="s-fit" data-w="' + info.w + '" data-h="' + info.h + '"><img class="' + (mode === "result" ? "s-res" : "") + '" src="' + info.preview + '" alt="">' + dev + selOv + "</div>" +
          (mode === "result" ? '<span class="s-tag">Result · hold to see the original</span>' : '<span class="s-tag' + (info.live ? " s-livetag" : "") + '">' + (info.live ? '<i class="s-ldot"></i>' : "") + (info.live ? "Live from " + ((APPS[info.app] || APPS.photoshop)[1]) : info.frozen ? (dev ? "Developing · step " + (p.previewN || 1) : mode === "orig" && !p.job ? "Sketch · what these results were made from" : "Sketch · frozen while creating") : "Original") + "</span>");
      }
    }
    if (mode === "paint") {
      var bimg = view.querySelector(".sk-base"); if (bimg && bimg.getAttribute("src") !== p.src.preview) bimg.setAttribute("src", p.src.preview);
      // Photoshop's selection, tinted on the live picture.
      var fitP = view.querySelector(".s-fit"), ov = fitP && fitP.querySelector(".s-selov");
      var want = p.src.live && S.psSel && S.useSel !== false ? S.psSel.preview : "";
      if (want && !ov) { ov = document.createElement("div"); ov.className = "s-selov"; ov.style.zIndex = 40; fitP.appendChild(ov); }
      if (ov && !want) ov.remove();
      else if (ov && ov.getAttribute("data-m") !== want.slice(-40)) { ov.setAttribute("data-m", want.slice(-40)); ov.style.webkitMaskImage = ov.style.maskImage = "url(" + want + ")"; }
    }
    var oldpb = view.querySelector(".s-paintbtn");
    if (oldpb && (p.area === "paint" || c || !p.src || p.job)) oldpb.remove();
    if (false) {
      var pb = view.querySelector(".s-paintbtn");
      if (!pb) { pb = document.createElement("button"); pb.type = "button"; pb.className = "s-paintbtn";
        pb.onclick = function () { S.create.area = S.create.area === "paint" ? "whole" : "paint"; S.create.sel = -1; render(); }; view.appendChild(pb); }
      pb.innerHTML = p.area === "paint" ? "Stop painting" : svg("brush") + "Paint an area";
      pb.classList.toggle("on", p.area === "paint");
    }
    // While a picture is being made from the frozen sketch: it shows blurred,
    // with a progress ring in the middle that clears as the steps come in.
    var fitEl = view.querySelector(".s-fit"), loading = !!(p.job && fitEl && mode === "orig");
    if (fitEl) fitEl.classList.toggle("s-loading", loading);
    var ring = view.querySelector(".s-pring");
    if (loading) {
      if (!ring) { ring = document.createElement("div"); ring.className = "s-pring";
        ring.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" class="bg"/><circle cx="24" cy="24" r="20" class="fg"/></svg><b></b>'; view.appendChild(ring); }
      var fr = Math.max(0.02, p.frac || 0);
      ring.querySelector(".fg").style.strokeDashoffset = String(125.7 * (1 - fr));
      ring.querySelector("b").textContent = Math.round(fr * 100) + "%";
      if (fitEl) fitEl.style.setProperty("--blur", Math.max(2, 18 - 2.5 * (p.previewN || 0)) + "px");
    } else if (ring) ring.remove();
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
    var tile = function (i) {
      var r = p.results[i];
      if (r.missing) return '<span class="s-miss' + (i === p.sel ? " sel" : "") + '" data-i="' + i + '" title="Missing from its original location: ' + esc(r.path) + '">Missing</span>';
      return '<img data-i="' + i + '" class="' + (i === p.sel ? "sel" : "") + '" src="' + r.preview + '" title="' + esc(short(r.name)) + '" alt="">';
    };
    var strip = "";
    // Live: first tile, always the current canvas (it keeps updating, even during a run).
    // Then a divider, then the sketch these results were made from (frozen at Create), then the results.
    var live = id === "c" && p.source === "live" ? (p.liveSrc || (p.src && (p.src.live || p.src.frozen) ? p.src : null)) : null;
    var origPrev = p.job ? p.jobOrig : (mine.length ? p.results[mine[mine.length - 1]].orig : null);
    if (p.src && (mine.length || earlier.length || p.job)) {
      if (live) {
        strip += '<span class="s-tilewrap"><img data-i="-1" class="' + (p.sel === -1 ? "sel" : "") + '" src="' + live.preview + '" alt="">' +
          '<em class="live"><i class="ld"></i>Live</em></span><span class="s-div" aria-hidden="true"></span>';
        if (origPrev && p.job) {
          var pct = Math.max(2, Math.round((p.frac || 0) * 100));
          strip += '<span class="s-tilewrap s-fillt' + (p.sel === -2 ? " sel" : "") + '" data-i="-2" title="Creating from this sketch"><img src="' + origPrev + '" alt="">' +
            '<span class="s-fillc" style="width:' + pct + '%"><img src="' + (p.preview || origPrev) + '" alt=""></span>' +
            '<span class="s-fillb"><i style="width:' + pct + '%"></i></span><em>Creating · ' + pct + "%</em></span>";
        } else if (origPrev && mine.length) strip += '<span class="s-tilewrap"><img data-i="-2" class="' + (p.sel === -2 ? "sel" : "") + '" src="' + origPrev + '" alt="" title="The sketch these were made from">' +
          "<em>Sketch</em></span>";
      } else {
        strip += '<span class="s-tilewrap"><img data-i="-1" class="' + (p.sel < 0 ? "sel" : "") + '" src="' + p.src.preview + '" alt="">' +
          "<em>Original</em></span><span class=\"s-div\" aria-hidden=\"true\"></span>";
      }
    }
    mine.forEach(function (i) { strip += tile(i); });
    for (var k = 0; k < (p.job ? p.pending : 0); k++) strip += '<span class="s-ph"></span>';
    if (mine.length && !p.job) strip += '<button type="button" class="s-more">+ Another</button>';
    if (earlier.length) {
      if (mine.length || p.job) strip += '<span class="s-div" aria-hidden="true"></span>';
      strip += '<button type="button" class="s-earlier">' + (p.showEarlier ? "Hide earlier" : "Earlier · " + earlier.length) + "</button>";
      if (p.showEarlier) earlier.slice().reverse().forEach(function (i) { strip += '<span class="s-old">' + tile(i) + "</span>"; });
    }
    var sk = $(id + "-strip");
    if (sk.getAttribute("data-h") !== strip) { sk.innerHTML = strip; sk.setAttribute("data-h", strip); }
    layout();
  }

  // -- zoom and pan: every picture floats on the canvas --------------------------------
  // Mouse wheel or trackpad pinch zooms around the pointer, middle button (or Space +
  // drag) pans, the pill bottom-left shows the zoom and Fit. Results of the same size
  // keep the zoom, so they can be compared at the same spot.
  var zoom = {
    st: {},
    of: function (v) { var id = v.id; return this.st[id] || (this.st[id] = { z: 1, x: 0, y: 0, wh: "" }); },
    apply: function (v, f, w, h) {
      var z = this.of(v), wh = w + "x" + h;
      if (z.wh !== wh) { z.wh = wh; z.z = 1; z.x = 0; z.y = 0; }
      f.style.transformOrigin = "50% 50%";
      var fl = window.VSSketch && v.id === "c-view" ? window.VSSketch.flip() : {};
      f.style.transform = "translate(" + z.x + "px," + z.y + "px) scale(" + z.z * (fl.h ? -1 : 1) + "," + z.z * (fl.v ? -1 : 1) + ")";
      f.classList.toggle("s-zoomed", z.z !== 1);
      var pill = v.querySelector(".s-zpill");
      if (!pill) {
        pill = document.createElement("div"); pill.className = "s-zpill";
        pill.innerHTML = '<button type="button" data-z="out" title="Zoom out">−</button><b></b><button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="fit" title="Fit the picture (double-click the canvas)">Fit</button>';
        v.appendChild(pill);
      }
      pill.querySelector("b").textContent = Math.round(z.z * 100) + "%";
    },
    // Zoom by f around a point given in the view's coordinates.
    by: function (v, f, px, py) {
      var fit = v.querySelector(".s-fit"); if (!fit) return;
      var z = this.of(v), nz = Math.max(0.2, Math.min(16, z.z * f));
      var cx = fit.offsetLeft + fit.offsetWidth / 2, cy = fit.offsetTop + fit.offsetHeight / 2;
      if (px === undefined) { px = v.clientWidth / 2; py = v.clientHeight / 2; }
      var qx = (px - cx - z.x) / z.z, qy = (py - cy - z.y) / z.z;
      z.x = px - cx - nz * qx; z.y = py - cy - nz * qy; z.z = nz;
      if (Math.abs(z.z - 1) < 0.02 && Math.abs(z.x) < 4 && Math.abs(z.y) < 4) { z.z = 1; z.x = 0; z.y = 0; }
      layout(); painter.refreshRing();
    },
    fit: function (v) { var z = this.of(v); z.z = 1; z.x = 0; z.y = 0; layout(); },
    pan: null, space: false,
    wire: function (v) {
      var self = this;
      v.addEventListener("wheel", function (e) {
        if (!v.querySelector(".s-fit")) return;
        e.preventDefault();
        var r = v.getBoundingClientRect();
        var step = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.15 : 1 / 1.15);   // pinch arrives as Ctrl+wheel
        self.by(v, step, e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      v.addEventListener("pointerdown", function (e) {
        var hand = e.button === 0 && window.VSSketch && v.id === "c-view" && window.VSSketch.tool() === "hand" && e.target.closest(".s-fit");
        if (!(e.button === 1 || (e.button === 0 && self.space) || hand)) return;
        if (!v.querySelector(".s-fit") || e.target.closest(".s-tools,.s-zpill,.s-paintbtn,.sk-bar,.sk-opts,.sk-panel")) return;
        e.preventDefault(); e.stopPropagation();
        var z = self.of(v);
        self.pan = { v: v, x: e.clientX, y: e.clientY, ox: z.x, oy: z.y };
        v.setPointerCapture(e.pointerId); v.classList.add("s-panning");
      }, true);
      v.addEventListener("pointermove", function (e) {
        if (!self.pan || self.pan.v !== v) return;
        var z = self.of(v); z.x = self.pan.ox + e.clientX - self.pan.x; z.y = self.pan.oy + e.clientY - self.pan.y; layout();
      });
      var end = function () { if (self.pan && self.pan.v === v) { self.pan = null; v.classList.remove("s-panning"); } };
      v.addEventListener("pointerup", end); v.addEventListener("pointercancel", end);
      v.addEventListener("auxclick", function (e) { if (e.button === 1) e.preventDefault(); });
      v.addEventListener("mousedown", function (e) { if (e.button === 1) e.preventDefault(); });   // no autoscroll arrows
      v.addEventListener("dblclick", function (e) { if (e.target === v) self.fit(v); });
      v.addEventListener("click", function (e) {
        var b = e.target.closest(".s-zpill [data-z]"); if (!b) return;
        var a = b.getAttribute("data-z");
        if (a === "fit") self.fit(v); else self.by(v, a === "in" ? 1.25 : 0.8);
      });
    }
  };
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && !/^(TEXTAREA|INPUT|SELECT)$/.test((document.activeElement || {}).tagName || "")) {
      if (!zoom.space) { zoom.space = true; document.body.classList.add("s-space"); }
      // Space would also press the last clicked button (Deselect, Done…): never while panning.
      var ae = document.activeElement; if (ae && ae.tagName === "BUTTON" && document.querySelector(".s-page.on .s-view .s-fit")) ae.blur();
      if (document.querySelector(".s-page.on .s-view .s-fit")) e.preventDefault();
    }
  });
  document.addEventListener("keyup", function (e) { if (e.code === "Space") { zoom.space = false; document.body.classList.remove("s-space"); } });

  function layout() {
    document.querySelectorAll(".s-page.on .s-fit").forEach(function (f) {
      var v = f.parentNode, W = v.clientWidth, H = v.clientHeight, w = +f.getAttribute("data-w"), h = +f.getAttribute("data-h");
      if (!W || !H || !w || !h) return;
      // While painting, the tools sit above the picture and the hint below
      // it, never on top of it, so every part of it can be painted.
      var top = 0, bottom = 0;
      if (v.querySelector(".s-tools")) { top = 64; bottom = 50; }
      var aH = H - top - bottom;
      var pad = /-view$/.test(v.id) ? 28 : 0;          // floating: a margin of canvas round the picture
      var k = Math.min((W - 2 * pad) / w, (aH - 2 * pad) / h), fw = Math.round(w * k), fh = Math.round(h * k);
      f.style.width = fw + "px"; f.style.height = fh + "px";
      f.style.left = Math.round((W - fw) / 2) + "px"; f.style.top = Math.round(top + (aH - fh) / 2) + "px";
      if (pad) zoom.apply(v, f, w, h);
      // The "Variation 1 of 2" pill sits on the picture, near its bottom edge.
      var busy = pad && v.querySelector(".s-busy");
      if (busy) { busy.style.bottom = "auto"; busy.style.top = Math.max(8, Math.round(f.offsetTop + fh - 52)) + "px"; }
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
    good: ["Good quality", "Free, no sign-up. Downloads by itself."]
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
    var running = !!S.setup.run;
    // Styles people can use: Looks for Create (made for the image model) and,
    // under Juice, styles for the Juice pass. Files that work with neither
    // aren't listed; the design lock is listed with the model files.
    var looks = st.loras.filter(function (l) { return l.family === "klein9b" && !l.builtin && !/klein-consistency|distill/i.test(l.name); });
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
      (st.mac || !st.flux3 ? "" : '<div class="s-sec">Image model</div><p class="s-hint">FLUX 3 Klein, the newest model: results at about 2400 × 1300 with clean, refined lines and materials, about 40 seconds a picture. Below is the earlier model, used if FLUX 3 is removed.</p>') +
      (st.mac ? "" : '<div class="s-sec">Quality</div><div class="s-tiers">' + ["best", "good"].map(function (k) {
        var tt = st.chosen || st.tier;
        return '<button type="button" class="s-tier' + (tt === k ? " on" : "") + '" data-su="tier" data-t="' + k + '"' + (running ? " disabled" : "") + "><b>" + TIER_TEXT[k][0] +
          (st.tiers[k].ready ? ' <span class="s-ok">Ready</span>' : "") + "</b><small>" + TIER_TEXT[k][1] + "</small></button>";
      }).join("") + "</div>" +
      '<div class="s-list">' + fileRows(tierFiles(st, st.chosen || st.tier || "best").concat(st.files.filter(function (f) { return f.key === "consistency" && (st.chosen || st.tier || "best") === "best"; }))) + selectRow + helperRow + "</div>" +
      (function () { var miss = setupGB(st, st.chosen || st.tier || "best") - (st.engine_installed ? 0 : 2.1) - (st.select_ready ? 0 : 0.1);
        return miss > 0.05 && !running ? '<div class="s-btns"><button type="button" class="s-btn p" data-su="download">Download (' + gb(miss) + ")</button></div>" : ""; })()) +
      (st.mac ? "" : '<div class="s-sec">Looks</div><p class="s-hint">Extra styles for Create, shown under Style. To add one, put its file in Models › loras; it shows up when you come back to Studio.</p>' +
      '<div class="s-list">' + styleRows(looks, "None yet.") + "</div>" +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="models">Open the loras folder</button></div>' +
      "") +

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
    if (S.page === "board") { if (window.VSBoard) window.VSBoard.render(); }
    else if (S.page === "create") renderCreate();
    else if (S.page === "reference") renderReference();
    else if (S.page === "library") renderLibrary();
    else if (S.page === "settings") renderSettings();
    saveStrip();
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
      if (kind === "studio-sel") { S.psSel = data.on ? data : null; render(); return; }
      if (kind === "studio-note") { S.create.note = data.message; render(); return; }
      if (kind === "studio-engine") S.engine = data;
      else if (kind === "studio-job") {
        var p = byJob(data.id);
        if (!p) return;
        if (data.state === "running") { p.stage = data.stage; p.frac = data.fraction == null ? p.frac : data.fraction; if (data.estimate) p.estimate = data.estimate; if (!p.started) p.started = Date.now(); }
        else {
          p.job = null; p.pending = 0; p.stage = ""; p.frac = 0; p.started = 0; p.estimate = 0; p.preview = null; p.previewN = 0;
          // The run is over: live takes over again with the newest sketch.
          if (p === S.create && p.source === "live" && p.src && p.src.frozen) {
            var keepSel2 = p.sel; if (p.liveSrc) p.src = p.liveSrc; p.sel = keepSel2;
          }
          p.error = data.state === "error" ? (data.message || "Something went wrong.") : (p.note || "");
          p.note = "";
        }
      } else if (kind === "studio-preview") {
        var pv = byJob(data.id); if (!pv) return;
        pv.preview = data.preview; pv.previewN = (pv.previewN || 0) + 1;
      } else if (kind === "studio-note") {
        toast(data.text || "");
      } else if (kind === "studio-result") {
        var q = byJob(data.id); if (!q) return;
        data.result.srcKey = q.jobKey; data.result.orig = q.jobOrig; data.result.made = Date.now(); q.results.push(data.result);
        q.preview = null; q.previewN = 0; q.pending = Math.max(0, q.pending - 1);
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
        } else if (data.target === "board" && window.VSBoard) {
          window.VSBoard.addImages(imgs);
          if (data.from === "phone") { S.phoneN = (S.phoneN || 0) + imgs.length; phoneGot(S.phoneN); toast("From your phone: on the board"); }
        } else if (data.target === "create" || data.target === "library") {
          setImage(S.create, "src", imgs[0]); if (data.target === "library") go("create");
        }
      }
      render();
    };
  }

  // For the board (board.js): the shared state and the actions it reuses.
  window.VS = { layout: function () { layout(); }, zoomSpace: function () { return zoom.space || !!zoom.pan; }, plusMenu: plusMenu, pop: pop, closePop: closePop, painter: painter, S: S, api: api, esc: esc, short: short, go: go, render: render, setImage: setImage, sendPS: sendPS,
                toast: toast, refresh: refresh, current: current, P: P };

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
