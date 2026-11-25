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
    chev: '<path d="M6 15l6-6 6 6"/>',
    "3d": '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5"/><path d="M10 11v5M14 11v5"/>',
    projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
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
    words: '<path d="M4 6h16M4 11h16M4 16h10"/>',
    clip: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
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
  var MADE_HERE = /_(create|refine|paint|camera|cmf|style|reference|variation)|_[248]x\b|upscal/i;
  // A render: one of Studio's own results, or a picture the picture reader saw as a render (any file
  // name: a FLUX output read as a sketch was re-drawn from scratch and lost its detail, Nov 2026).
  function isRender(src) { return !!src && !src.live && !src.frozen && (MADE_HERE.test(src.name || src.path || "") || src.medium === "render"); }
  // Ask the picture reader once per opened picture; until it answers, the file name decides.
  function askMedium(p) {
    var m = p.src;
    if (!m || m.live || m.frozen || !m.path || m.medium !== undefined || MADE_HERE.test(m.name || m.path || "")) return;
    if (!api().studio_medium) return;
    m.medium = null;
    api().studio_medium(m.path).then(function (r) {
      m.medium = r || "";
      if (r !== "render") return;
      if (p.src === m && p.locksAuto) p.locks = defaultLocks(m);   // its own Keep, unless you set them already
      render();
    }, function () { m.medium = ""; });
  }
  // A result in view: Describe shows the words it was made with (edit them and
  // Create again); back on your picture, what you had typed comes back.
  // What a result was made with, when it had no words of its own.
  function madeWith(m) {
    if (m.instant) return "Made as an Instant render (no words).";
    var refs = (m.refs || []).map(function (r, i) { return "Ref " + (i + 1) + " " + ((RUSE[r.use] || ["reference"])[0]).toLowerCase(); });
    if (refs.length) return "Made from your picture + " + refs.join(" + ") + ".";
    return "Made without words.";
  }
  function showWords(p) {
    var c = current(p), key = c ? c.path : "";
    if (p.wordsFor === key) return;
    p.wordsFor = key;
    if (c) {
      if (!p.viewing) { p.draft = p.text; p.viewing = true; }
      var put = function (m) { if (p.wordsFor !== key || !p.viewing) return; p.text = (m && m.text) || ""; $("c-text").value = p.text; renderWarn(); setTimeout(render, 0); };
      if (c.meta && c.meta.text !== undefined && (c.meta.text || c.meta.instant !== undefined || c.meta.refs)) put(c.meta);
      else if (api() && api().studio_meta) api().studio_meta(c.path).then(function (m) { c.meta = Object.assign({}, c.meta || {}, m || {}); put(c.meta); });
    } else if (p.viewing) {
      p.viewing = false; p.text = p.draft || ""; $("c-text").value = p.text; renderWarn();
    }
  }
  // No words and no references: Create becomes Instant render (a studio CGI render
  // that follows the sketch as it is; words then only set the scene).
  function instantMode(p) { return !(p.text || "").trim() && !(p.refs || []).length; }
  function defaultLocks(src) { var r = isRender(src); return { design: true, materials: r, light: r, camera: true }; }
  // Reference images in Create: each gives exactly one thing.
  var RUSE = {
    camera: ["Camera view", "Show my design from this angle", "camera", "Camera"],
    materials: ["Materials & colours", "Its colours and materials on my design", "materials", "Materials"],
    style: ["Rendering style", "Its rendering technique and finish", "", "Style"],
    light: ["Lighting", "Its light and mood", "light", "Lighting"],
    design: ["Design", "Mix its shapes and design into mine", "", "Design"],
    describe: ["As I describe", "Say in the prompt what to take from it", "", "As I say"]
  };
  // Which locks a reference takes over: { camera: 1 } = the camera comes from Ref 1.
  function refLocks(p) {
    var by = {};
    (p.refs || []).forEach(function (r, i) { var k = RUSE[r.use] && RUSE[r.use][2]; if (k && !by[k]) by[k] = i + 1; });
    return by;
  }
  function effLocks(p) {
    var L = Object.assign({}, p.locks || defaultLocks(p.src)), by = refLocks(p);
    Object.keys(by).forEach(function (k) { L[k] = false; });
    return L;
  }
  var RPH = {
    camera: "How the camera sits, e.g. high overhead view from behind the front seats, looking steeply down",
    light: "The light, e.g. night, starry sky, warm amber ambient strips, dark cabin",
    style: "The rendering style, e.g. grey marker sketch with ink outlines on paper",
    materials: "Optional: the materials, e.g. cognac nappa seats, dark grey dashboard"
  };
  // The picture reader puts a reference's camera, light, style or materials into words.
  function readRef(r) {
    var st = S.status;
    if (!st || !st.reader_ready || !RPH[r.use] || r.typed) return;
    var key = r.path + "|" + r.use;
    if (r.descFor === key || r.reading === key) return;
    r.reading = key; render();
    api().studio_describe(r.path, r.use).then(function (res) {
      if (r.reading !== key) return;
      r.reading = "";
      if (res && res.text && r.use + "" === key.split("|")[1]) { r.desc = res.text; r.descFor = key; }
      else if (res && res.error) toast("Couldn't read the reference: " + res.error);
      render();
    });
  }
  function addRef(info) {
    if (!info) return;
    var p = S.create; p.refs = p.refs || [];
    // The same picture may come in twice (e.g. its materials and its light); it then takes the next free use.
    if (p.refs.length >= 6) { toast("Six references at most: remove one first"); return; }
    var used = p.refs.map(function (r) { return r.use; });
    var use = ["camera", "materials", "light", "style"].filter(function (u) { return used.indexOf(u) < 0; })[0] || "describe";
    var r = { path: info.path, name: info.name, w: info.w, h: info.h, preview: info.preview, use: use, desc: "" };
    p.refs.push(r);
    render(); readRef(r);
  }
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
    create: page({ source: load("c.source", "image"), area: "whole", preset: ["sketch", "cmf", "lighting", "photo"].indexOf(load("c.preset", "sketch")) >= 0 ? load("c.preset", "sketch") : "sketch", text: "", keep: load("c.keep", 0.8), vars: load("c.vars", 2), res: load("c.res", "2k"),
                   blend: load("c.blend2", 0.15), lora: load("c.lora", ""), juice: load("c.juice", 0), juiceLora: load("c.juiceLora", ""), refs: [] }),
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
      '<div class="s-acts3">' + (id === "c" ? '<button type="button" class="s-btn" id="c-to3d" title="Turn the camera around this picture">' + svg("3d") + '<span>3D</span></button>' +
        '<button type="button" class="s-btn" id="' + id + '-refine-this" hidden disabled></button>' :
        '<button type="button" class="s-btn" id="' + id + '-refine-this" title="Change this result with your words" disabled>' + svg("sketch") + '<span>Refine</span></button>') +
      '<button type="button" class="s-btn" id="' + id + '-toboard" title="Put this result on the board" disabled>' + svg("board") + '<span>To board</span></button>' +
      '<button type="button" class="s-btn" id="' + id + '-tops" title="Send this result to Photoshop as a new layer" disabled><span class="m-ico ps">Ps</span><span>Photoshop</span></button>' +
      '<button type="button" class="s-btn" id="' + id + '-up" title="Upscale this result" disabled>' + svg("upscale") + '<span>Upscale</span></button></div>' +
      (id === "c" ? '<label class="s-model" id="c-model" hidden><span>Render model</span><select id="c-modelsel"></select></label>' +
        '<label class="s-model" id="c-eng" hidden><span>Engine</span><select id="c-engsel"></select></label>' : "") +
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
      '<button type="button" data-d="-1" aria-label="Fewer">−</button><b id="' + id + '-vars-n">2</b><button type="button" data-d="1" aria-label="More">+</button></div></div>' +
      (id === "c" ? sizeSeg(id) : "");
  }
  // Output size: smaller draws faster (512 for quick tries). 4K = a 2K render, then Upscale ×2.
  var SIZES = [["512", "512", "Quickest tries"], ["1k", "1K", "Fast"], ["2k", "2K", "Full quality"], ["4k", "4K", "2K render, then Upscale ×2"]];
  var SIZE_TIME = { "512": 0.35, "1k": 0.55, "2k": 1, "4k": 1 };
  function sizeSeg(id) {
    return '<div class="s-sz"><div class="s-label">Size</div><div class="s-seg s-size" id="' + id + '-res">' +
      SIZES.map(function (z) { return '<button type="button" data-v="' + z[0] + '" title="' + z[2] + '">' + z[1] + "</button>"; }).join("") + "</div></div>";
  }

  function optionsRow(id) { return '<div class="s-opts">' + keepSlider(id) + varsChips(id) + "</div>"; }

  function promptBox(id, ph, extraStyle) {
    return '<div class="s-pbox"><textarea class="s-prompt" id="' + id + '-text"' + (extraStyle || "") + ' placeholder="' + ph + '"></textarea>' +
      '<div class="s-pbar" id="' + id + '-imp"' + (id === "c" ? "" : " hidden") + '><button type="button" class="s-impb">✨ Improve</button>' +
      (id === "c" ? '<button type="button" class="s-impb s-libb" id="c-libb" title="Tested prompts and your saved ones, by task">📚 Prompts</button>' +
        '<button type="button" class="s-impb" id="c-saveb" title="Keep these words in My prompts (Library › Assets)">💾 Save</button>' : "") +
      '<span class="s-impn"></span></div></div>' + (id === "c" ? '<div class="s-plib" id="c-plib" hidden></div>' : "");
  }

  // Prompt library (Nov 2026): generic helpers for any picture - cars, buildings, products, fashion, characters.
  // [words] are yours to change: shown in purple, the first one is selected when you pick the prompt.
  // Each sets the Keep locks the task needs (null = leave them as they are).
  var KEEP_LOOK = { materials: true, camera: true, light: false }, KEEP_ALL = { materials: true, camera: true, light: true };
  var PLIB = [
    ["render", "Sketch → render", "On a sketch or drawing. Leave the words empty for an Instant render.", [
      ["Photoreal render", "photorealistic render of this sketch, true-to-life materials, soft natural light, sharp detail", { materials: false, light: false }],
      ["Keep my colours", "photorealistic render, keep the colours and materials as drawn", { materials: true, light: false }],
      ["Clean studio render", "clean render on a seamless light backdrop, soft top light, crisp edges", { materials: false, light: false }],
      ["Clay model", "matte white clay model, soft studio light, no colour, shapes only", { materials: false, light: false }],
      ["Polished concept", "polished concept rendering in marker and pencil style, light shading", { materials: false, light: false }]
    ]],
    ["light", "Lighting", "On a render or photo. The design and materials stay; only the light changes.", [
      ["Golden hour", "warm golden hour sunlight from the side, long soft shadows", KEEP_LOOK],
      ["Soft overcast", "soft overcast daylight, even light, no hard shadows", KEEP_LOOK],
      ["Night", "night, warm practical lights, cool ambient glow", KEEP_LOOK],
      ["Studio key light", "studio lighting, large soft key light, gentle rim light, dark background", KEEP_LOOK],
      ["Bright and airy", "bright, airy daylight, every surface clearly visible", KEEP_LOOK]
    ]],
    ["mat", "Materials & colour", "Changes colours and materials. Purple words are yours to change. Select an area first to change only that part.", [
      ["Change a colour", "make the [main body] [deep forest green]", { materials: false, camera: true, light: true }],
      ["Swap a material", "make the [top surface] out of [brushed aluminium]", { materials: false, camera: true, light: true }],
      ["Matte finish", "make every surface matte, keep the colours", { materials: false, camera: true, light: true }],
      ["Premium finish", "premium materials: fine textures, subtle reflections, precise seams", { materials: false, camera: true, light: true }],
      ["Selected area only", "[walnut wood]", { materials: false, camera: true, light: true }, "Select the area with the selection tool first"]
    ]],
    ["bg", "Background & scene", "Puts the design somewhere else; the subject itself stays.", [
      ["Studio backdrop", "on a seamless light grey backdrop with a soft floor shadow", KEEP_LOOK],
      ["Outdoors", "outdoors in [a mountain landscape], natural light matching the scene", KEEP_LOOK],
      ["Inside a space", "inside a [modern gallery], soft daylight", KEEP_LOOK],
      ["City street", "on a city street at [dusk]", KEEP_LOOK],
      ["Plain white", "plain white background, product-shot style", KEEP_LOOK]
    ]],
    ["view", "Camera & view", "Turns the camera. For several angles at once, use 3D views.", [
      ["Three-quarter", "three-quarter view from the front", { materials: true, camera: false }],
      ["Side / profile", "straight side view", { materials: true, camera: false }],
      ["Top-down", "top-down view from above", { materials: true, camera: false }],
      ["Close-up", "close-up of the [main detail]", { materials: true, camera: false }],
      ["Wide shot", "wide shot showing the surroundings", { materials: true, camera: false }]
    ]],
    ["edit", "Add / remove", "Select an area first; the change happens there.", [
      ["Add an object", "add a [plant] on the [left]", KEEP_ALL, "Select where it goes first"],
      ["Remove something", "remove the [object], fill with matching background", KEEP_ALL, "Select it first"],
      ["Clean up lines", "remove all sketch lines, labels and handwritten text; complete the surfaces cleanly", KEEP_ALL],
      ["Person for scale", "add a person standing next to it for scale", KEEP_ALL],
      ["Add text or a logo", "add the text \"[VISTIQ]\" on the [front]", KEEP_ALL]
    ]],
    ["style", "Style", "Restyles the whole picture; shapes and layout stay.", [
      ["Photoreal", "photorealistic, natural colours, real-world detail", { materials: false, camera: true, light: false }],
      ["Cinematic still", "cinematic film still, shallow depth of field, moody grade", { materials: false, camera: true, light: false }],
      ["Watercolour", "loose watercolour illustration, soft paper texture", { materials: false, camera: true, light: false }],
      ["Technical drawing", "clean technical line drawing on white, no shading", { materials: false, camera: true, light: false }],
      ["Minimal 3D", "minimal 3D style, soft pastel colours, simple shapes", { materials: false, camera: true, light: false }]
    ]]
  ];
  // Vistiq's tested prompts, plus the Assets folder's (Prompts.txt, My prompts.txt) by category.
  function plibAll() {
    var extra = {}, order = [];
    ((S.assets && S.assets.prompts) || []).forEach(function (p) {
      var k = "as:" + p.cat; if (!extra[k]) { extra[k] = [k, p.cat, p.mine ? "Prompts you saved (Assets › My prompts.txt)." : "From the Assets folder (Prompts.txt).", []]; order.push(k); }
      extra[k][3].push([p.name, p.text, null, p.mine ? "mine" : ""]);
    });
    return PLIB.concat(order.map(function (k) { return extra[k]; }));
  }
  function plibHtml(cat) {
    var L = plibAll(), c = L.filter(function (x) { return x[0] === cat; })[0] || L[0];
    return '<div class="s-plt">' + L.map(function (x) { return '<button type="button" data-plc="' + x[0] + '"' + (x[0] === c[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>" +
      '<p class="s-plh">' + c[2] + "</p>" +
      c[3].map(function (it, i) {
        var shown = esc(it[1]).replace(/\[([^\]]+)\]/g, "<u>$1</u>");
        return '<button type="button" class="s-pli" data-pli="' + i + '"><b>' + it[0] + "</b>" +
          "<span>" + shown + "</span>" + (it[3] ? "<small>" + it[3] + "</small>" : "") + "</button>";
      }).join("");
  }
  function plibUse(cat, i) {
    var c = plibAll().filter(function (x) { return x[0] === cat; })[0], it = c && c[3][i]; if (!it) return;
    var p = S.create, box = $("c-text");
    var first = it[1].indexOf("["), firstEnd = first >= 0 ? it[1].indexOf("]", first) - 1 : -1;
    var plain = it[1].replace(/[\[\]]/g, "");
    p.text = plain; box.value = plain; p.viewing = false; p.libText = plain;
    if (it[2]) {
      p.locks = Object.assign({}, p.locks || defaultLocks(p.src));
      Object.keys(it[2]).forEach(function (k) { p.locks[k] = it[2][k]; });
      p.locksFor = keyOfSrc(p.src); p.locksAuto = false;
    }
    $("c-plib").hidden = true; $("c-libb").classList.remove("on");
    if (it[3]) toast(it[3]);
    box.dispatchEvent(new Event("input")); box.focus(); render();
    if (first >= 0) box.setSelectionRange(first, firstEnd);      // the first [word] selected: just type over it
  }

  function stage(id, extra) {
    return '<section class="s-stage" id="' + id + '-stage">' +
      '<div class="s-top"><div class="s-ttl" id="' + id + '-ttl"></div><div class="s-acts2">' +
      '<button type="button" class="s-btn" id="' + id + '-reveal" disabled>Show in folder</button>' +
      '<button type="button" class="s-btn s-x" id="' + id + '-clear" hidden style="display:none" aria-hidden="true"></button></div></div>' +
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
      ["projects", "3d", "upscale", "library"].map(function (p) {      // no Create tab (Nov 2026): open a picture from a project
        return '<button type="button" data-page="' + p + '">' + svg(p) + (p === "3d" ? "3D views" : p.charAt(0).toUpperCase() + p.slice(1)) + "</button>";
      }).join("") + '<div class="s-sp"></div><button type="button" data-page="trash">' + svg("trash") + 'Trash</button><button type="button" data-page="settings">' + svg("settings") + "Settings</button>" +
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
      '<div class="s-grow"><div class="s-label" id="c-prompt-l">Describe the result</div>' + promptBox("c", "Describe the change") + '<div class="s-warn" id="c-warn" hidden></div></div>' +
      '<div id="c-refs-w" data-slot="ref"><div class="s-label">References <em class="s-opt">optional</em></div><div class="s-refs" id="c-refs"></div>' +
      '<div class="s-refd" id="c-refd"></div><p class="s-hint s-rhint" id="c-refs-hint"></p></div>' +
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
      '<div class="s-filters" id="l-filters">' + ["all", "create", "reference", "upscale", "assets"].map(function (f) {
        return '<button type="button" data-v="' + f + '"' + (f === "assets" ? ' class="l-astab"' : "") + ">" + f.charAt(0).toUpperCase() + f.slice(1) + "</button>";
      }).join("") + '</div><div class="s-grid" id="l-grid"></div><div id="l-assets" hidden></div></div>';
    document.body.appendChild(lib);

    var set = document.createElement("div");
    set.className = "s-page"; set.id = "p-settings";
    set.innerHTML = '<div class="s-scroll"><div class="s-col" id="s-body"></div>' +
      '<div class="s-sec">Upscaler</div><div class="s-up" id="s-up"></div>' +
      '<div class="s-sec s-danger-h">Delete everything</div><p class="s-hint">Removes all downloaded models, everything you made, your projects and settings, then closes Vistiq Studio. Use this only to remove Studio or set it up fresh.</p>' +
      '<div class="s-btns"><button type="button" class="s-btn s-danger" data-su="wipe">Delete everything…</button></div></div>';
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
      nav.insertBefore(heart, nav.querySelector(".s-navmin"));      // Trash · Settings · heart
    }
    var gear = $("open-settings"); if (gear) gear.hidden = true;
    var sup = $("support"); if (sup) document.body.appendChild(sup);

    var projects = document.createElement("div");
    projects.className = "s-page"; projects.id = "p-projects";
    projects.innerHTML = '<div class="s-scroll"><div class="pj-top"><div class="s-ttl">Projects<small>Each project is a board of pictures with its own Photoshop / Affinity tab</small></div>' +
      '<button type="button" class="s-btn p" data-pj="new">＋ New project</button></div><div class="pj-grid" id="pj-grid"></div></div>';
    document.body.appendChild(projects);
    var trash = document.createElement("div");
    trash.className = "s-page"; trash.id = "p-trash";
    trash.innerHTML = '<div class="s-scroll"><div class="pj-top"><div class="s-ttl">Trash<small>Deleted projects stay here for 30 days. Their pictures are never deleted: they stay in the Library.</small></div>' +
      '<button type="button" class="s-btn" data-tr="empty">Empty trash</button></div><div class="pj-grid" id="tr-grid"></div></div>';
    document.body.appendChild(trash);
    var board = document.createElement("div");
    board.className = "s-page"; board.id = "p-board";
    document.body.appendChild(board);
    if (window.VSBoard) window.VSBoard.build(board);
    var td = document.createElement("div");
    td.className = "s-page"; td.id = "p-3d";
    document.body.appendChild(td);
    if (window.VS3D) window.VS3D.build(td);
    loadStrip();
    var mach = document.createElement("div"); mach.id = "s-machine"; mach.className = "s-machine"; document.body.appendChild(mach);
    var ub = document.createElement("div"); ub.id = "s-usage"; ub.className = "s-usage"; document.body.appendChild(ub);
    ub.addEventListener("click", usageClick);
    document.addEventListener("pointerdown", function (e) { if (S.usageOpen && !e.target.closest("#s-usage")) { S.usageOpen = false; usageRender(); } });
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
        '<button type="button" class="s-btn" id="u-tops" title="Send the upscaled picture to Photoshop"><span class="m-ico ps">Ps</span><span>Photoshop</span></button>';
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
    wireProjects();
    painter.init();
    go("projects");          // Studio opens on the Projects page: you pick what to work on
    refresh();
  }

  // ------------------------------------------------------------------ actions

  // ------------------------------------------------------------------ projects
  // Each project is one board of pictures (tiles) plus its Photoshop / Affinity tab.
  function ago(t) {
    var s = Math.max(0, Date.now() / 1000 - (t || 0));
    return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : s < 172800 ? "yesterday" : Math.round(s / 86400) + " days ago";
  }
  var pjThumbs = {};
  function pjThumb(path) {
    if (!path) return BLANK;
    if (pjThumbs[path] === undefined) { pjThumbs[path] = null; api().studio_thumb(path).then(function (d) { pjThumbs[path] = d || "missing"; renderProjects(); }); }
    return pjThumbs[path] && pjThumbs[path] !== "missing" ? pjThumbs[path] : BLANK;
  }
  function loadProjects() {
    if (!api() || !api().studio_projects) return;
    api().studio_projects().then(function (list) { S.projects = list || []; renderProjects(); });
  }
  function renderProjects() {
    var g = $("pj-grid"); if (!g) return;
    var list = (S.projects || []).slice().sort(function (a, b) { return (b.edited || 0) - (a.edited || 0); });
    var cur = window.VSBoard && window.VSBoard.project().id;
    var h = list.map(function (pr) {
      var cov = [pr.cover || pr.covers[0]].concat(pr.covers.filter(function (c) { return c !== pr.cover; })).filter(Boolean).slice(0, 3);
      var pics = cov.length ? cov.map(function (c) { return '<img src="' + pjThumb(c) + '" alt="">'; }).join("") : '<span class="pj-empty">No pictures yet</span>';
      return '<div class="pj-card' + (pr.id === cur ? " cur" : "") + '" data-pid="' + esc(pr.id) + '"><div class="pj-col n' + cov.length + '">' + pics + "</div>" +
        '<div class="pj-meta"><b data-pj="name">' + esc(pr.name) + "</b><small>" + pr.count + " picture" + (pr.count === 1 ? "" : "s") + " · edited " + ago(pr.edited) + "</small></div>" +
        '<button type="button" class="pj-more" data-pj="more" title="Rename, delete">⋯</button></div>';
    }).join("") + '<button type="button" class="pj-card pj-new" data-pj="new"><i>＋</i>New project</button>';
    if (g.getAttribute("data-h") !== h) { g.innerHTML = h; g.setAttribute("data-h", h); }
  }
  // New project: a small floating window with the name.
  // Settings › Delete everything: two checks, the second needs DELETE typed.
  function wipeDialog() {
    if ($("pj-modal")) return;
    var m = document.createElement("div"); m.className = "pj-modal"; m.id = "pj-modal";
    var close = function () { m.remove(); };
    var step2 = function () {
      m.innerHTML = '<div class="pj-dlg" role="dialog" aria-label="Confirm delete"><b>Type DELETE to confirm</b>' +
        '<small>Vistiq Studio closes and deletes everything. To use it again, open it and set it up from the start.</small>' +
        '<input id="wipe-word" placeholder="DELETE" maxlength="20" autocomplete="off" spellcheck="false">' +
        '<small class="wipe-err" id="wipe-err"></small>' +
        '<div class="pj-btns"><button type="button" class="s-btn" data-dlg="cancel">Cancel</button><button type="button" class="s-btn s-danger" data-dlg="go" disabled>OK</button></div></div>';
      var inp = $("wipe-word"), go = m.querySelector('[data-dlg="go"]');
      setTimeout(function () { inp.focus(); }, 30);
      inp.addEventListener("input", function () { go.disabled = inp.value.trim() !== "DELETE"; });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !go.disabled) go.click(); if (e.key === "Escape") close(); e.stopPropagation(); });
    };
    m.innerHTML = '<div class="pj-dlg" role="dialog" aria-label="Delete everything"><b>Delete everything?</b>' +
      '<small>Are you sure you want to delete all files and downloaded models? This is not a reversible process and you will lose all created files. Do this only if you want to set up the application fresh.</small>' +
      '<div class="pj-btns"><button type="button" class="s-btn" data-dlg="cancel">Cancel</button><button type="button" class="s-btn s-danger" data-dlg="ok">OK</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) {
      var b = e.target.closest("[data-dlg]");
      if (!b) { if (e.target === m) close(); return; }
      var a = b.getAttribute("data-dlg");
      if (a === "cancel") close();
      else if (a === "ok") step2();
      else if (a === "go") {
        b.disabled = true; b.textContent = "Deleting…";
        api().studio_wipe_all($("wipe-word").value).then(function (r) {
          if (r && r.ok) { m.querySelector(".pj-dlg").innerHTML = "<b>Deleting…</b><small>Vistiq Studio is closing. The files are removed in the background.</small>"; return; }
          $("wipe-err").textContent = (r && r.error) || "Couldn't delete."; b.disabled = false; b.textContent = "OK";
        });
      }
    });
  }

  function newProjectDialog() {
    if ($("pj-modal")) return;
    var m = document.createElement("div"); m.className = "pj-modal"; m.id = "pj-modal";
    m.innerHTML = '<div class="pj-dlg" role="dialog" aria-label="New project"><b>New project</b><small>A board for its pictures, with its own Photoshop / Affinity tab.</small>' +
      '<input id="pj-name" placeholder="Project name, e.g. Pickup interior" maxlength="60" autocomplete="off">' +
      '<div class="pj-btns"><button type="button" class="s-btn" data-dlg="cancel">Cancel</button><button type="button" class="s-btn p" data-dlg="ok">Create project</button></div></div>';
    document.body.appendChild(m);
    var inp = $("pj-name"); setTimeout(function () { inp.focus(); }, 30);
    var close = function () { m.remove(); };
    var ok = function () {
      var name = inp.value.trim() || "New project"; close();
      api().studio_project_new(name).then(function (pr) {
        if (!pr) return;
        api().studio_projects().then(function (list) { S.projects = list || []; renderProjects(); openProject(pr.id); });
      });
    };
    m.addEventListener("click", function (e) {
      var b = e.target.closest("[data-dlg]");
      if (b) { if (b.getAttribute("data-dlg") === "ok") ok(); else close(); return; }
      if (e.target === m) close();
    });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") ok(); if (e.key === "Escape") close(); e.stopPropagation(); });
  }
  function openProject(pid) {
    var pr = (S.projects || []).filter(function (x) { return x.id === pid; })[0]; if (!pr || !window.VSBoard) return;
    window.VSBoard.load(pr.id, pr.name).then(function () { go("board"); });
  }
  function wireProjects() {
    var page = $("p-projects");
    page.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pj]"), card = e.target.closest("[data-pid]");
      var a = b && b.getAttribute("data-pj");
      if (a === "new") { newProjectDialog(); return; }
      if (a === "more" && card) { projectMenu(card.getAttribute("data-pid"), b); return; }
      // One click picks a project; a double click opens it (Nov 2026).
      if (card && !e.target.closest("input")) {
        S.pjSel = card.getAttribute("data-pid");
        page.querySelectorAll(".pj-card[data-pid]").forEach(function (c) { c.classList.toggle("sel", c.getAttribute("data-pid") === S.pjSel); });
      }
    });
    page.addEventListener("dblclick", function (e) {
      var card = e.target.closest("[data-pid]");
      if (card && !e.target.closest("[data-pj=more]")) openProject(card.getAttribute("data-pid"));
    });
    page.addEventListener("contextmenu", function (e) {
      var card = e.target.closest("[data-pid]"); if (!card) return;
      e.preventDefault(); projectMenu(card.getAttribute("data-pid"), card.querySelector(".pj-more"));
    });
    $("p-trash").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tr]"); if (!b) return;
      var a = b.getAttribute("data-tr"), card = b.closest("[data-tid]"), id = card ? card.getAttribute("data-tid") : "";
      if (a === "restore") api().studio_trash_restore(id).then(function (pr) { if (pr) { toast("“" + pr.name + "” is back in Projects"); loadTrash(); } });
      else if (a === "forget" || a === "empty") {
        if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = a === "empty" ? "Click again: delete all for good" : "Click again: delete for good"; return; }
        api().studio_trash_forget(a === "empty" ? "" : id).then(function () { loadTrash(); });
      }
    });
  }
  function loadTrash() {
    if (!api() || !api().studio_trash) return;
    api().studio_trash().then(function (list) {
      var g = $("tr-grid"); if (!g) return;
      list = list || [];
      var h = list.length ? list.map(function (t) {
        var pics = t.covers.length ? t.covers.map(function (c) { return '<img src="' + pjThumb(c) + '" alt="">'; }).join("") : '<span class="pj-empty">No pictures</span>';
        return '<div class="pj-card tr" data-tid="' + esc(t.id) + '"><div class="pj-col n' + t.covers.length + '">' + pics + "</div>" +
          '<div class="pj-meta"><b>' + esc(t.name) + "</b><small>" + t.count + " picture" + (t.count === 1 ? "" : "s") + " · deleted " + ago(t.deleted) + " · " + t.days_left + " days left</small>" +
          '<div class="tr-btns"><button type="button" class="s-btn p" data-tr="restore">Restore</button><button type="button" class="s-btn" data-tr="forget">Delete for good</button></div></div></div>';
      }).join("") : '<p class="tr-none">The Trash is empty.</p>';
      g.innerHTML = h;
      var eb = document.querySelector('#p-trash [data-tr="empty"]'); if (eb) { eb.hidden = !list.length; eb.classList.remove("sure"); eb.textContent = "Empty trash"; }
    });
  }
  function projectMenu(pid, anchor) {
    var pr = (S.projects || []).filter(function (x) { return x.id === pid; })[0]; if (!pr) return;
    pop(anchor, '<button type="button" class="it" data-p="open"><span>Open</span></button><button type="button" class="it" data-p="rename"><span>Rename</span></button><hr>' +
      '<button type="button" class="it red" data-p="del"><span>Move to Trash</span></button>', function (v, btn) {
      if (v === "open") openProject(pid);
      else if (v === "rename") {
        var b = document.querySelector('[data-pid="' + pid + '"] [data-pj=name]'); if (!b) return;
        b.setAttribute("contenteditable", "true"); b.focus();
        var r = document.createRange(); r.selectNodeContents(b); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r);
        var done = function () { b.removeAttribute("contenteditable"); var n = b.textContent.trim();
          if (n && n !== pr.name) api().studio_project_rename(pid, n).then(function () { pr.name = n; if (window.VSBoard && window.VSBoard.project().id === pid) window.VSBoard.load(pid, n); loadProjects(); }); else renderProjects(); };
        b.addEventListener("blur", done, { once: true });
        b.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); b.blur(); } e.stopPropagation(); });
      } else if (v === "del") {
        api().studio_project_delete(pid).then(function (ok) {
          if (!ok) return;
          toast("“" + pr.name + "” moved to the Trash (30 days to restore)");
          api().studio_projects().then(function (list) {
            S.projects = list || [];
            if (window.VSBoard && window.VSBoard.project().id === pid) {
              // the open board was deleted: the next one (or a fresh "My board" when pictures arrive)
              if (S.projects[0]) window.VSBoard.load(S.projects[0].id, S.projects[0].name);
              else window.VSBoard.load("p" + Date.now().toString(36), "My board");
            }
            renderProjects();
          });
        });
      }
    });
  }

  // First run: until the models are downloaded, the setup page is the whole app (Nov 2026).
  function needsSetup(st) {
    if (!st) return false;
    if (S.skipSetup || st.onboarded) return false;           // "Skip for now": look around first (Nov 2026)
    return st.needs_setup !== undefined ? !!st.needs_setup : !(st.create_ready && st.engine_installed);
  }
  function applyGate() {
    var need = needsSetup(S.status) || !!(S.setup.run && document.body.classList.contains("s-gated"));
    var was = document.body.classList.contains("s-gated");
    document.body.classList.toggle("s-gated", need);
    if (need && S.page !== "create") go("create");
    else if (was && !need) go("projects");
  }

  function go(p) {
    if (document.body.classList.contains("s-gated")) p = "create";      // only the setup page until it's done
    if (p === "reference") p = "create";          // references live in Create now
    if (["projects", "board", "3d", "create", "upscale", "library", "settings", "trash"].indexOf(p) < 0) p = "projects";
    S.page = p; keep("page", p);
    if (p === "board" || (p === "create" && S.create.src)) S.lastWork = p;      // where Projects brings you back to
    else if (p === "projects") S.lastWork = null;
    document.body.setAttribute("data-page", p);
    document.querySelectorAll(".s-nav button").forEach(function (b) { var bp = b.getAttribute("data-page"); b.classList.toggle("on", bp === p || (bp === "projects" && (p === "board" || p === "create"))); });
    document.querySelectorAll(".s-page").forEach(function (el) { el.classList.toggle("on", el.id === "p-" + p); });
    if (api()) api().studio_drop_target(p);
    if (p === "library") loadLibrary();
    if (p === "projects") loadProjects();
    if (p === "trash") loadTrash();
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
      applyGate();
      if (st.setup_running && !S.setup.run) S.setup.run = { label: "Setting up", fraction: null };
      // Camera angles: small, fetched by itself once Qwen is there (no button to find).
      if (st.qwenedit && st.engine_choice === "qwenedit" && (st.angles === false || st.realism === false) && !st.setup_running && !S.anglesAsked && api().studio_get_qwenedit) {
        S.anglesAsked = true; api().studio_get_qwenedit();
      }
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
    if (popEl && popEl._anchor === anchor) { closePop(); return null; }      // same button again: close
    closePop();
    popEl = document.createElement("div"); popEl.className = "s-pop"; popEl.innerHTML = html; popEl._anchor = anchor;
    document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect(), w = popEl.offsetWidth, h = popEl.offsetHeight;
    var x = side === "right" ? r.right + 8 : r.left, y = side === "right" ? r.top : r.bottom + 8;
    if (side !== "right" && y + h > window.innerHeight - 8 && r.top - h - 8 > 8) y = r.top - h - 8;   // no room below: open above
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
  // later(getInfo, name): optional, shows where the picture lands while it's read (the board).
  function plusMenu(anchor, onAdd, later) {
    var fmt = load("blankFmt", "a4p");
    var html = function () {
      // One click per size: each is its own button, drawn in its shape.
      return '<div class="ttl s-blankt">New blank canvas<span class="k">N</span></div><div class="s-sizes">' + Object.keys(FORMATS).map(function (k) {
          var f = FORMATS[k], r = f[0] / f[1], w = r >= 1 ? 30 : Math.round(30 * r), hh = r >= 1 ? Math.round(30 / r) : 30;
          return '<button type="button" data-p="fmt:' + k + '" class="' + (k === fmt ? "on" : "") + '"><i style="width:' + w + "px;height:" + hh + 'px"></i><b>' +
            (k.indexOf("a4") === 0 ? "A4 " : "") + f[2] + "</b><small>" + f[0] + " × " + f[1] + "</small></button>";
        }).join("") + "</div>" +
        '<hr><button type="button" class="it" data-p="pick">' + svg("image") + '<span>Upload an image</span><span class="k">I</span></button>' +
        '<button type="button" class="it" data-p="paste">' + svg("clip") + '<span>Paste from clipboard</span><span class="k">Ctrl V</span></button>' +
        '<button type="button" class="it" data-p="phone">' + svg("phone") + '<span>Upload from phone<small>Scan a QR code · same Wi-Fi</small></span><span class="k">/</span></button>';
    };
    var el = pop(anchor, html(), function (v) {
      if (v.indexOf("fmt:") === 0) { fmt = v.slice(4); keep("blankFmt", fmt); v = "blank"; }
      if (v === "blank") api().studio_blank(FORMATS[fmt][0], FORMATS[fmt][1]).then(function (i) { if (i) onAdd(i); });
      else if (v === "pick" && later) api().studio_pick_path().then(function (p) { if (p) later(function () { return api().studio_image(p); }, p.split(/[\\/]/).pop()); });
      else if (v === "pick") api().studio_pick().then(function (i) { if (i) onAdd(i); });
      else if (v === "paste" && later) later(function () { return api().studio_paste().then(function (i) { if (!i) toast("Nothing to paste: copy a picture first."); return i; }); }, "Pasted picture");
      else if (v === "paste") api().studio_paste().then(function (i) { if (i) onAdd(i); else toast("Nothing to paste: copy a picture first."); });
      else if (v === "phone") phoneDialog();
    });
    if (el) el.classList.add("s-plus");
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

  // -- smooth progress: the model works in a few big steps (4 steps = 25% jumps); between
  // steps the bar keeps moving at the pace of the last step, never past the next one.
  function stepIn(p, f) {
    var now = Date.now();
    if (f !== p.raw) {
      if (p.raw != null && f > p.raw) { p.stepSize = f - p.raw; if (p.rawAt) p.stepDur = Math.max(1500, Math.min(60000, now - p.rawAt)); }
      else if (f < (p.raw || 0)) { p.stepSize = 0; p.stepDur = 0; }        // a new picture of the run
      p.raw = f; p.rawAt = now;
    }
    p.frac = Math.max(f, p.frac && p.frac < f + (p.stepSize || 0) && p.frac >= f ? p.frac : f);
  }
  // Every progress number shows the picture being made now (Nov 2026: the ring said 4% of the whole
  // run while the strip said 9% of variation 1).
  function varFrac(p) {
    var tot = (p.pending || 0) + (p.jobDone || 0) || 1;
    if (tot <= 1) return p.frac || 0;
    return Math.max(0, Math.min(1, (p.frac || 0) * tot - (p.jobDone || 0)));     // the one being made now
  }
  function smooth(p) {
    if (!p.job || p.raw == null || !p.stepSize || !p.stepDur) return false;
    var t = Math.min(0.95, (Date.now() - p.rawAt) / p.stepDur), f = Math.min(1, p.raw + p.stepSize * t);
    if (f - (p.frac || 0) < 0.004) return false;
    p.frac = f; return true;
  }
  setInterval(function () {
    [S.create, S.ref].forEach(function (p) {
      if (!smooth(p)) return;
      var id = p === S.create ? "c" : "r", v = $(id + "-view"), pct = Math.round(varFrac(p) * 100);
      if ($(id + "-fill")) $(id + "-fill").style.width = pct + "%";
      if (!v) return;
      var ring = v.querySelector(".s-pring"); if (ring) { ring.querySelector(".fg").style.strokeDashoffset = String(125.7 * (1 - Math.max(0.02, varFrac(p)))); ring.querySelector("b").textContent = Math.max(2, pct) + "%"; }
      var bz = v.querySelector(".s-busy b"); if (bz) bz.style.width = pct + "%";
    });
  }, 400);

  // -- the machine line: graphics card, processor, memory (tiny, live) ------------------
  var statsT = 0;
  function bar(p, cls) { return '<i class="' + (cls || "") + '"><u style="width:' + Math.max(0, Math.min(100, p || 0)) + '%"></u></i>'; }
  function statsLoop() {
    clearTimeout(statsT);
    var busy = !!(S.create.job || S.ref.job);
    statsT = setTimeout(statsLoop, document.hidden ? 6000 : busy ? 1200 : 3000);
    if (document.hidden || !api() || !api().studio_stats) return;
    api().studio_stats().then(function (m) {
      var el = $("s-machine"); if (m) S.mstats = m; if (!el) return; m = m || {};
      var p = S.page === "reference" ? S.ref : S.create, parts = [];
      var oo = S.status && S.status.online;
      if (!S.monthAt || Date.now() - S.monthAt > 60000) { S.monthAt = Date.now(); if (api().studio_month) api().studio_month().then(function (mm) { S.month = mm; usageRender(); }); }
      usageRender();
      if (p.job) parts.push('<span class="job">● ' + esc(p.stage || "Working") + (p.frac ? " · " + Math.round(varFrac(p) * 100) + "%" : "") + "</span><span class=\"sep\"></span>");
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
        return { path: r.path, name: r.name, w: r.w, h: r.h, srcKey: r.srcKey || "", made: r.made || 0,
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
          return { path: r.path, name: r.name, w: r.w, h: r.h, srcKey: r.srcKey, source: r.source, meta: r.meta, made: r.made || 0,
                   preview: BLANK, thin: true };
        });
        p.results = back.concat(p.results);         // anything made already this session stays after
        if (p.sel >= 0) p.sel += back.length;
        back.forEach(function (r) {
          a.studio_thumb(r.path).then(function (t) { if (t) { r.preview = t; render(); } else dropResult(p, r); });
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
  // A result whose file was deleted or moved simply leaves the strip.
  function dropResult(p, r) {
    var i = p.results.indexOf(r); if (i < 0) return;
    p.results.splice(i, 1);
    if (p.sel === i) p.sel = -1; else if (p.sel > i) p.sel--;
    render();
  }
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAO7v8wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  // Clicking a result kept from an earlier session reads the full picture from its folder.
  function pickResult(p, i) {
    if (p.job) p.follow = i === -2;           // looking elsewhere during a run: stay there
    if (i >= 0 && i === p.sel && p === S.create) { p.sel = -1; render(); return; }
    var r = i >= 0 ? p.results[i] : null;
    if (!r || !r.thin) { p.sel = i; render(); return; }
    api().studio_image(r.path).then(function (info) {
      if (!info) {
        dropResult(p, r);
        toast("That picture was deleted or moved, so it's gone from the strip");
        return;
      }
      r.preview = info.preview; r.w = info.w; r.h = info.h; r.thin = false; r.missing = false;
      p.sel = i; render();
    });
  }
  function current(p) { return p.sel >= 0 ? p.results[p.sel] : null; }
  // The picture on screen, for finding objects in it (Nov 2026: snapping looked at the sketch under a
  // render layer and found pencil speckles): the result in view, else the picture with its layers.
  function shownPic() {
    var p = S.create, c = current(p); if (c && c.path) return c.path;
    var lk = window.VSSketch && window.VSSketch.look && window.VSSketch.look(p.src);
    return lk || (p.src && p.src.path);
  }
  // What the bar above Create acts on: the chosen result, else the picture you opened
  // (not the live canvas, which isn't a file of its own).
  function target(p) {
    var c = current(p); if (c) return c;
    var s = p.src; return s && !s.live && !s.frozen && s.path ? s : null;
  }

  // What the bar acts on, as a file: the chosen result; else the open picture,
  // flattened with its visible Studio layers (at full size) when it has any.
  function withTarget(p, cb) {
    var c = target(p); if (!c) return;
    var lay = !current(p) && p === S.create && window.VSSketch && window.VSSketch.payload(p.src);
    if (!lay) { cb(c, false); return; }
    toast("Flattening your layers…");
    api().studio_flatten(p.src.path, lay).then(function (info) {
      if (!info) { toast("Couldn't flatten the layers."); return; }
      cb(info, true);
    });
  }

  // The current file in Create as a picture file, for 3D views: the chosen result; else the
  // picture (a Live one is copied from Photoshop/Affinity), flattened with its Studio layers.
  // cb(info, origin): origin = { src, app, key } says where "Add as layer" goes back to.
  function currentFile(cb) {
    var p = S.create, c = current(p);
    if (c) { api().studio_image(c.path).then(function (info) { if (info) cb(info, { src: p.src, app: "", key: c.path }); }); return; }
    var src = p.src; if (!src) { cb(null); return; }
    var lay = window.VSSketch && window.VSSketch.payload(src), app = src.live ? (S.live.app || "photoshop") : "";
    var key = (src.live ? "live:" + (src.n || "") : src.path) + (lay ? ":" + JSON.stringify(lay).length : "");
    function flat(info) {
      if (!lay) return api().studio_image(info.path);
      return api().studio_flatten(info.path, lay).then(function (f) { return f && api().studio_image(f.path); });
    }
    var first = src.live ? api().studio_freeze(src.path, src.name) : Promise.resolve(src);
    first.then(function (info) { return info ? flat(info) : null; }).then(function (info) {
      if (!info) { toast("Couldn't take the picture from Create."); cb(null); return; }
      cb(info, { src: src, app: app, key: key });
    });
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

  // The engine Create uses: Auto (Local) or Standard / Pro online (own key), Nov 2026.
  function engineNow() {
    var st = S.status, oo = st && st.online;
    if (!oo || !oo.on) return "";
    var e = S.engineSel != null && S.engineSel !== undefined ? S.engineSel : load("engine", "");
    if (e && !oo.engines[e]) e = "";
    if (!e && !st.local_ready) e = "standard";
    return e;
  }
  function onlineCost(eng, n, res) {
    var oo = S.status && S.status.online; if (!oo || !oo.engines[eng]) return "";
    var e = oo.engines[eng], sz = /^(2k|4k)$/i.test(res || "2k") ? "2K" : "1K";
    var cr = e.credits[sz] * n, usd = e.usd[sz] * n;
    return e.label + " · " + n + (n > 1 ? " pictures" : " picture") + " at " + sz + " · " + cr + (cr === 1 ? " credit" : " credits") + " · about " + money(usd) +
      (/4k/i.test(res || "") ? " (made at 2K: upscale here for 4K, free)" : "");
  }
  function job(id, extra) {
    var p = P(id);
    var st = S.status;
    var queueIt = !!p.job && id === "c" && !extra;          // Create while a run is going: queued, starts by itself (Nov 2026)
    if (!p.src || (p.job && !queueIt) || !st || !st.create_ready) return;
    if (id === "r" && !p.refimg) return;
    if (id === "c" && !extra && (p.refs || []).some(function (r) { return r.reading; })) { toast("Studio is still reading a reference: a moment"); return; }
    var j = {
      mode: id === "c" ? "create" : "reference", image: p.src.path, name: p.src.name, live_app: p.src.live ? S.live.app : "",
      // An improved prompt already is the whole instruction: send it as it is.
      preset: p.improved && p.text === p.improved ? "" : p.preset, text: p.text, keep: p.keep, variations: p.vars
    };
    if (id === "c") j.res = p.res || "2k";
    if (id === "c" && engineNow()) j.engine = engineNow();
    if (id === "r") j.reference = p.refimg.path;
    if (id === "c" && !extra && instantMode(p)) j.instant = true;
    if (id === "c") {
      // A selection (lasso, pen, object, Photoshop…) limits the change to that area.
      var m = painter.export();
      if (m) { j.mask = m; j.blend = p.blend; }
      else if (p.src.live && S.psSel && S.useSel !== false) { j.mask = "ps-selection"; j.blend = p.blend; }
      // Painted layers: Create works on all visible layers, flattened.
      var lay = window.VSSketch && window.VSSketch.payload(p.src);
      if (lay) j.layers = lay;
      j.lora = p.lora || null;
      j.locks = effLocks(p);
      j.locks.design = true; j.keep = 1;    // the design always follows the sketch exactly; words change only what they name
      j.refs = (p.refs || []).map(function (r) { return { path: r.path, use: r.use, desc: (r.desc || "").trim() }; });
    }
    // Words on a result in view work on that result (sketch → Instant render → "night" on the render);
    // click Original first to start again from your picture.
    var cur = id === "c" && !extra ? current(p) : null;
    // What you see is what changes (Nov 2026): a selection drawn on a result, or words, change that
    // result, also when its own words are still in the box. (A selection on the result ran on the sketch.)
    if (cur && ((p.text || "").trim() || j.mask)) {
      j.image = cur.path; j.name = cur.name || j.name; j.live_app = ""; j.preset = "photo"; j.from_result = true;
      delete j.layers; delete j.instant;
      j.locks = Object.assign(defaultLocks(cur), { design: true, camera: (j.locks || {}).camera !== false });
    }
    Object.assign(j, extra || {});
    if (queueIt) {
      if (j.instant === undefined) delete j.instant;
      p.queue = (p.queue || []).concat([{ j: j, src: p.src }]);
      toast("Queued · " + p.queue.length + (p.queue.length > 1 ? " runs" : " run") + " waiting"); render(); return;
    }
    startJob(id, p, j);
  }
  function startJob(id, p, j) {
    p.error = ""; p.stage = "Starting"; p.frac = 0; p.raw = null; p.rawAt = 0; p.stepSize = 0; p.stepDur = 0; p.pending = j.variations; p.started = Date.now(); p.estimate = 0;
    p.jobKey = srcKey(p.src); p.jobRes = j.res || "";
    // Create works on the sketch as it is now: freeze a copy. Live keeps
    // updating in the background and comes back when the run is done.
    p.jobOrig = (id === "c" && window.VSSketch && window.VSSketch.look && window.VSSketch.look(p.src)) || p.src.preview; p.preview = null; p.previewN = 0;
    p.follow = true; p.jobDone = 0;
    if (p.src.live) p.src = Object.assign({}, p.src, { live: false, frozen: true });
    p.sel = -2;
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
              variations: 1, refine_of: base.path, reference: null, refs: [] });
  }

  function hasConsistency() {
    var st = S.status;
    return !!(st && st.files.some(function (f) { return f.key === "consistency" && f.ready; }));
  }

  // ------------------------------------------------------------------ wiring

  function wire() {
    document.querySelector(".s-nav").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-page]");
      if (b && b.getAttribute("data-page") === "3d" && window.VS3D) { go("3d"); }   // empty until you press 3D on a picture (Nov 2026)
      else if (b && b.getAttribute("data-page") === "projects") {
        // Projects with work open (Nov 2026): first click goes back to the picture or board you were on;
        // from there, a second click shows all projects.
        var back = S.lastWork && S.page !== "create" && S.page !== "board" && S.page !== "projects" ? S.lastWork : "projects";
        go(back);
      }
      else if (b) go(b.getAttribute("data-page"));
    });
    // Create
    $("c-slot").addEventListener("click", function () { pick("c", "src"); });
    $("c-engsel").addEventListener("change", function (e) { S.engineSel = e.target.value; keep("engine", S.engineSel); render(); });
    $("c-modelsel").addEventListener("change", function (e) {
      api().studio_mac_engine(e.target.value).then(function (st) { if (st) S.status = st; render(); });
    });
    $("c-source").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) useSource(b.getAttribute("data-v")); });
    $("c-area").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      S.create.area = b.getAttribute("data-v"); if (S.create.area === "paint") S.create.sel = -1; render();
    });
    $("c-locks").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var p = S.create, k = b.getAttribute("data-v");
      p.locks = Object.assign({}, p.locks || defaultLocks(p.src)); p.locks[k] = !p.locks[k]; p.locksFor = keyOfSrc(p.src); p.locksAuto = false; render();
    });
    $("c-refs").addEventListener("click", function (e) {
      var p = S.create, b;
      if ((b = e.target.closest("[data-rx]"))) { p.refs.splice(+b.getAttribute("data-rx"), 1); render(); return; }
      if ((b = e.target.closest("[data-rn]"))) {
        // "Ref 2" into the description, where the cursor is.
        var ta = $("c-text"), t = "ref " + b.getAttribute("data-rn") + " ", a = ta.selectionStart || ta.value.length;
        if (document.activeElement !== ta) a = ta.value.length;
        var pre = ta.value.slice(0, a), sp = pre && !/\s$/.test(pre) ? " " : "";
        ta.value = pre + sp + t + ta.value.slice(a); p.text = ta.value; ta.focus();
        ta.selectionStart = ta.selectionEnd = (pre + sp + t).length; renderWarn(); return;
      }
      if ((b = e.target.closest("[data-ru]"))) {
        var i = +b.getAttribute("data-ru");
        pop(b, Object.keys(RUSE).map(function (k) {
          return '<button type="button" class="it' + (p.refs[i].use === k ? " on" : "") + '" data-p="' + k + '"><span>' + RUSE[k][0] + "<small>" + RUSE[k][1] + "</small></span></button>";
        }).join(""), function (v) { var r = p.refs[i]; if (r.use !== v) { r.use = v; r.desc = ""; r.descFor = ""; r.typed = false; r.reading = ""; } render(); readRef(r); });
        return;
      }
      if ((b = e.target.closest("[data-radd]"))) {
        pop(b, '<button type="button" class="it" data-p="pick">' + svg("image") + "<span>Upload an image</span></button>" +
          '<button type="button" class="it" data-p="paste">' + svg("clip") + "<span>Paste from clipboard</span></button>" +
          '<button type="button" class="it" data-p="assets">' + svg("image") + "<span>From Assets<small>Your reference library</small></span></button>", function (v) {
          if (v === "assets") { assetPicker(b); return; }
          if (v === "pick") api().studio_pick().then(addRef);
          else api().studio_paste().then(function (i) { if (i) addRef(i); else toast("Nothing to paste: copy a picture first."); });
        });
      }
    });
    $("c-refd").addEventListener("input", function (e) {
      var t = e.target.closest("[data-rd]"); if (!t) return;
      var r = S.create.refs[+t.getAttribute("data-rd")]; if (!r) return;
      r.desc = t.value; r.typed = true;
    });
    $("c-refd").addEventListener("click", function (e) {
      var b = e.target.closest("[data-rr]"); if (b) { var r = S.create.refs[+b.getAttribute("data-rr")]; if (r) { r.typed = false; r.descFor = ""; readRef(r); } return; }
      if (e.target.closest("[data-rget]")) go("settings");
    });
    $("c-warn").addEventListener("click", function (e) {
      var b = e.target.closest("[data-unlock]"); if (!b) return;
      var p = S.create; p.locks = Object.assign({}, p.locks || defaultLocks(p.src));
      b.getAttribute("data-unlock").split(",").forEach(function (k) { p.locks[k] = false; }); p.locksFor = keyOfSrc(p.src); p.locksAuto = false; render();
    });
    $("c-work").addEventListener("click", function (e) {
      if (e.target.closest("[data-w=board]")) { go("board"); return; }
      pick("c", "src");
    });
    $("c-presets").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var v = b.getAttribute("data-v"); S.create.preset = S.create.preset === v ? "" : v; keep("c.preset", S.create.preset); render();
    });
    $("c-text").addEventListener("input", function () { S.create.text = this.value; S.create.viewing = false; renderWarn(); });
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
      if ($(id + "-res")) $(id + "-res").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        p.res = b.getAttribute("data-v"); keep(pre + "res", p.res); render();
      });
      $(id + "-go").addEventListener("click", function () { job(id); });
      $(id + "-cancel").addEventListener("click", function () { p.queue = []; api().studio_cancel(); });
      $(id + "-refine-go").addEventListener("click", function () { refine(id); });
      $(id + "-refine").addEventListener("keydown", function (e) { if (e.key === "Enter") refine(id); });
      $(id + "-up").addEventListener("click", function () {
        withTarget(p, function (c) { api().studio_to_upscale(c.path).then(function () { go("upscale"); }); });
      });
      // (No Clear: each picture always keeps everything made from it.)
      $(id + "-reveal").addEventListener("click", function () { withTarget(p, function (c) { api().reveal(c.path); }); });
      $(id + "-refine-this").addEventListener("click", function () {
        var t = (p.text || "").trim();
        if (!t) { var box = $(id + "-text"); if (box) box.focus(); toast("Type what to change in the prompt, then Refine this"); return; }
        $(id + "-refine").value = t; refine(id);
      });
      if ($(id + "-to3d")) $(id + "-to3d").addEventListener("click", function () {
        currentFile(function (info, origin) { if (info && window.VS3D) window.VS3D.open(info, origin); });
      });
      $(id + "-toboard").addEventListener("click", function () {
        if (!window.VSBoard) return;
        withTarget(p, function (c, flat) {
          window.VSBoard.addResult(c, current(p) || flat ? (id === "c" ? S.boardFrom : S.boardFromRef) : null);
          toast("Added to the board");
        });
      });
      $(id + "-tops").addEventListener("click", function () { withTarget(p, function (c) { sendPS(c.path); }); });
      // Floating on a result: Add (as a layer over your picture) and Export (PNG / JPEG).
      $(id + "-view").addEventListener("click", function (e) {
        var b = e.target.closest("[data-ra]"); if (!b) return;
        var c = current(p) || (p.src && !p.src.frozen && p.src.path ? p.src : null); if (!c) return;
        if (b.getAttribute("data-ra") === "add") { if (id === "c" && current(p)) addAsLayer(); return; }
        if (id === "u" && current(p)) {
          // the upscaled picture: pick the format
          pop(b, '<div class="ttl">Export the upscaled picture</div><button type="button" class="it" data-p="png">' + svg("image") + '<span>PNG<small>Full quality, larger file</small></span></button>' +
            '<button type="button" class="it" data-p="jpg">' + svg("image") + '<span>JPEG<small>Smaller file, for sharing</small></span></button>' +
            '<button type="button" class="it" data-p="webp">' + svg("image") + '<span>WebP<small>Smallest, for the web</small></span></button>', function (fmt) {
            api().studio_export(c.path, fmt).then(function (r) { if (r) toast("Saved " + r); });
          });
          return;
        }
        pop(b, '<div class="ttl">Export this picture</div><button type="button" class="it" data-p="orig">' + svg("download") + '<span>Export original<small>Full size, its own format</small></span></button>' +
          '<button type="button" class="it" data-p="up">' + svg("image") + '<span>Upscale and export<small>Bigger and sharper · PNG, JPEG or WebP</small></span></button>', function (what) {
          var run = function (t) {
            if (what === "orig") api().studio_save_copy(t.path).then(function (r) { if (r) toast("Saved " + r); });
            else api().studio_to_upscale(t.path).then(function () { go("upscale"); });
          };
          if (current(p)) run(c); else withTarget(p, function (t) { run(t); });   // the original, with its layers
        });
      });
      var addAsLayer = function () {
        var c = current(p); if (!c || !p.src || !window.VSSketch) return;
        // The layer gets the result at full preview size, never the small strip thumbnail.
        var put = function () {
          api().studio_image(c.path).then(function (info) {
            if (!info) { toast("That result isn't in its folder any more."); return; }
            window.VSSketch.addImageLayer(p.src, info.preview, short(c.name)); p.sel = -1; render(); toast("On a layer over your picture · the board shows it too");
          });
        };
        if (p.src.live || p.src.frozen) window.VSSketch.branch(function () { setTimeout(put, 50); }); else put();
      };
      // The mouse wheel slides the results sideways.
      $(id + "-strip").addEventListener("wheel", function (e) {
        var el = this; el.__userAt = Date.now();
        if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault(); e.stopPropagation();
        el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 40 : 1.6);   // lines (some mice) or pixels, a bit faster
      }, { passive: false });
      ["pointerdown", "touchstart", "keydown"].forEach(function (k) {
        $(id + "-strip").addEventListener(k, function () { this.__userAt = Date.now(); }, { passive: true });
      });
      $(id + "-strip").addEventListener("click", function (e) {
        var t = e.target.closest("[data-i]"); if (t) { pickResult(p, +t.getAttribute("data-i")); return; }
        if (e.target.closest(".s-more")) job(id, { variations: 1 });
        if (e.target.closest(".s-earlier")) { p.showEarlier = !p.showEarlier; render(); }
      });
      // Hold on a result to see what it started from.
      var view = $(id + "-view");
      zoom.wire(view);
      // Layers and sketch tools always work: touching them while a result shows goes back to your picture.
      if (id === "c") view.addEventListener("pointerdown", function (e) {
        if (p.sel === -1 || !view.querySelector(".s-pane") || !e.target.closest(".sk-bar,.sk-opts,.sk-panel")) return;
        // A selection tool on a render in view: that render becomes the picture worked on, so the
        // selection (and Create) apply to the CGI (mask a part, change its CMF or add something there).
        var c = current(p), sb = e.target.closest('[data-k="sel"],[data-sel]');
        if (c && sb && c.path) {
          setImage(p, "src", { path: c.path, name: c.name, w: c.w, h: c.h, preview: c.preview });
          toast("Working on this render: select the area to change");
          return;
        }
        p.sel = -1; render();
      }, true);
      view.addEventListener("pointerdown", function (e) { if (e.button !== 0 || zoom.space || zoom.pan || e.target.closest(".s-zpill,.s-paintbtn,.s-ra")) return; var img = view.querySelector("img.s-res"), c = current(p), o = (c && c.orig) || (p.src && p.src.preview); if (img && o) { img.src = o; view.classList.add("hold"); } });
      var up = function () { var img = view.querySelector("img.s-res"), c = current(p); if (img && c) img.src = c.preview; };
      // A click beside the picture (not on it, its buttons or the tools) closes the result, like Escape (Nov 2026).
      var downAt = null;
      view.addEventListener("pointerdown", function (e) { downAt = e.button === 0 ? [e.clientX, e.clientY] : null; }, true);
      view.addEventListener("click", function (e) {
        var d = downAt; downAt = null;
        if (p.sel === -1 || !d || Math.abs(e.clientX - d[0]) + Math.abs(e.clientY - d[1]) > 5 || zoom.space || zoom.pan) return;
        if (e.target.closest("img,canvas,button,a,input,textarea,select,.sk-bar,.sk-opts,.sk-panel,.s-zpill,.s-ra,.s-paintbtn,.s-res,.s-fit,[data-ra]")) return;
        if (p.job) p.follow = false;
        p.sel = -1; render();
      });
      view.addEventListener("pointerup", up); view.addEventListener("pointerleave", up);
    });
    // Library
    $("l-filters").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; S.lib.filter = b.getAttribute("data-v"); if (S.lib.filter === "assets") loadAssets(); render();
    });
    $("l-open").addEventListener("click", function () { if (S.lib.filter === "assets") api().studio_open_assets(); else api().studio_open_outputs(); });
    $("l-assets").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ac]");
      if (b) { S.assetCat = b.getAttribute("data-ac"); render(); return; }
      b = e.target.closest("[data-aact]");
      if (b) {
        var path = b.closest("[data-apath]").getAttribute("data-apath"), act = b.getAttribute("data-aact");
        if (act === "ref") api().studio_image(path).then(function (info) { addRef(info); go("create"); toast("Added as a reference: pick what to take from it"); });
        else if (act === "edit") api().studio_image(path).then(function (info) { setImage(S.create, "src", info); go("create"); });
        else if (act === "folder") api().reveal(path);
        return;
      }
      b = e.target.closest("[data-apr]");
      if (b) { var pr = (S.assets.prompts || [])[+b.getAttribute("data-apr")]; if (pr) usePrompt(pr.text); }
    });
    $("l-grid").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]"); if (!b) return;
      var path = b.closest(".s-card").getAttribute("data-path"), act = b.getAttribute("data-act");
      if (act === "folder") api().reveal(path);
      else if (act === "ps") sendPS(path);
      else if (act === "upscale") api().studio_to_upscale(path).then(function () { go("upscale"); });
      else if (act === "edit") api().studio_image(path).then(function (info) { setImage(S.create, "src", info); go("create"); });
      else if (act === "ref") api().studio_image(path).then(function (info) { addRef(info); go("create"); });
    });
    var psClick = function (e) {
      var b = e.target.closest("[data-ps]"); if (!b) return;
      var a = b.getAttribute("data-ps");
      if (a === "app") { S.liveApp = b.getAttribute("data-app"); keep("liveApp", S.liveApp); if (S.live.on && S.live.app !== S.liveApp) {
          api().studio_live(true, S.liveApp).then(function (r) { S.live.on = !!(r && r.on); S.live.app = S.liveApp; S.live.frames = 0; S.live.state = ""; S.live.msg = r && r.error || ""; render(); }); } else render(); }
      else if (a === "on") { var app = b.getAttribute("data-app"); S.live.stopped = false; api().studio_live(true, app).then(function (r) { S.live.on = !!(r && r.on); S.live.app = app; S.liveApp = app; S.live.frames = 0; S.live.state = ""; S.live.msg = r && r.error || ""; render(); }); }
      else if (a === "sel") { S.useSel = S.useSel === false; render(); }
      else if (a === "off") api().studio_live(false, S.live.app).then(function () { S.live.on = false; S.live.stopped = true; S.live.msg = ""; S.create.liveSrc = null; if (S.create.source === "live") S.create.src = null; render(); });
      else if (a === "back") useSource("live");
      else if (a === "install") {
        S.live.msg = "Installing the plugin…"; S.live.installing = true; render();
        api().studio_install_panel().then(function (r) {
          S.live.installing = false; S.live.msg = r ? r.message : "";
          if (r && r.ok && S.status) S.status.ps_panel = true;
          render();
        });
      }
    };
    $("c-ps").addEventListener("click", psClick);
    $("c-gate").addEventListener("click", psClick);
    S.plibCat = "sketch";
    $("c-libb").addEventListener("click", function () {
      var el = $("c-plib"), open = el.hidden;
      if (open) { S.plibCat = isRender(S.create.src) ? (S.plibCat === "sketch" ? "light" : S.plibCat) : S.plibCat; el.innerHTML = plibHtml(S.plibCat);
        loadAssets(function () { if (!el.hidden) el.innerHTML = plibHtml(S.plibCat); }); }
      el.hidden = !open; this.classList.toggle("on", open);
    });
    $("c-saveb").addEventListener("click", function () {
      var t = ($("c-text").value || "").trim(); if (!t) { toast("Write the prompt first"); return; }
      api().studio_prompt_save("", t, "Mine").then(function (ok) { toast(ok ? "Saved in My prompts (Library › Assets)" : "Couldn't save it"); if (ok) loadAssets(); });
    });
    $("c-plib").addEventListener("click", function (e) {
      var b = e.target.closest("[data-plc]");
      if (b) { S.plibCat = b.getAttribute("data-plc"); this.innerHTML = plibHtml(S.plibCat); return; }
      b = e.target.closest("[data-pli]"); if (b) plibUse(S.plibCat, +b.getAttribute("data-pli"));
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
    document.body.addEventListener("change", function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute("data-nblimit")) api().studio_online_set(null, parseFloat(e.target.value) || 0).then(refresh);
    });
    // Settings and setup (the same buttons appear in both)
    document.body.addEventListener("click", function (e) {
      var b = e.target.closest("[data-su]"); if (!b) return;
      var a = b.getAttribute("data-su");
      if (a === "nb-add") {
        var kin = document.querySelector('[data-nbkey]:not([hidden])'), key = kin ? kin.value.trim() : "";
        if (!key) { S.nbMsg = "Paste your key first."; render(); return; }
        S.nbMsg = "Checking the key with Google…"; render();
        api().studio_online_key(key).then(function (r) {
          S.nbMsg = r && r.ok ? "" : ((r && r.error) || "Google didn't accept the key.");
          if (r && r.ok) { toast("Your key works: Standard and Pro are ready"); if (api().studio_onboarded) api().studio_onboarded(); }
          refresh();
        });
        return;
      }
      if (a === "nb-open") { S.keyOpen = true; render(); setTimeout(function () { var k = document.querySelector("[data-nbkey]"); if (k) k.focus(); }, 30); return; }
      if (a === "nb-remove") { api().studio_online_key("").then(function () { S.engineSel = null; refresh(); }); return; }
      if (a === "nb-toggle") { var oo = S.status && S.status.online; api().studio_online_set(!(oo && oo.on), null).then(refresh); return; }
      if (a === "nb-guide") { var ap = api(); if (ap && ap.open_url) ap.open_url("https://aistudio.google.com/apikey"); else window.open("https://aistudio.google.com/apikey"); return; }
      if (a === "skip-setup") { if (api().studio_onboarded) api().studio_onboarded().then(refresh); S.skipSetup = true; applyGate(); render(); return; }
      if (a === "take") api().studio_take_from(b.getAttribute("data-path") || "");
      else if (a === "take-other") api().studio_take_from("");
      else if (a === "wipe") wipeDialog();
      else if (a === "download-all") { S.setup.error = ""; api().studio_get_all(); S.setup.run = { label: "Starting", fraction: null }; render(); }
      else if (a === "download") {
        var go = function () { S.setup.error = ""; api().studio_setup(false); S.setup.run = { label: "Starting", fraction: null }; render(); };
        if (S.pickTier) api().studio_set_tier(S.pickTier).then(function (st) { if (st) S.status = st; go(); }); else go();
      }
      else if (a === "tier") {
        S.pickTier = b.getAttribute("data-t"); S.setup.done = "";
        api().studio_set_tier(S.pickTier).then(function (st) { if (st) S.status = st; applyGate(); render(); });
        render();
      }
      else if (a === "download-juice") { S.setup.error = ""; api().studio_setup(true); S.setup.run = { label: "Starting", fraction: null }; render(); }
      else if (a === "cancel") api().studio_cancel();
      else if (a === "page") api().open_url(b.getAttribute("data-url"));
      else if (a === "home") api().studio_choose_home().then(function (st) { if (st) S.status = st; render(); });
      else if (a === "models") api().studio_open_models();
      else if (a === "outputs") api().studio_open_outputs();
      else if (a === "refresh") refresh();
      else if (a === "get-metaview") { S.setup.error = ""; api().studio_get_metaview(); S.setup.run = { label: "MetaView", fraction: null }; render(); }
      else if (a === "get-workflow") { S.setup.error = ""; api().studio_get_workflow(); S.setup.run = { label: "Your ComfyUI workflow", fraction: null }; render(); }
      else if (a === "get-fibo") { S.setup.error = ""; api().studio_get_fibo(); S.setup.run = { label: "Fibo 2.0", fraction: null }; render(); }
      else if (a === "get-qwen21") { S.setup.error = ""; api().studio_get_qwen21(); S.setup.run = { label: "Qwen-Image 2.1", fraction: null }; render(); }
      else if (a === "get-qwenedit") { S.setup.error = ""; api().studio_get_qwenedit(); S.setup.run = { label: "Qwen Image Edit", fraction: null }; render(); }
      else if (a === "engine") { api().studio_set_engine(b.getAttribute("data-e")).then(function (st2) { if (st2) S.status = Object.assign(S.status || {}, st2); render(); }); }
      else if (a === "get-reader-xl") { S.setup.error = ""; api().studio_get_reader_xl(); S.setup.run = { label: "Picture reader XL", fraction: null }; render(); }
      else if (a === "get-mac-model") { S.setup.error = ""; api().studio_get_mac_model(b.getAttribute("data-m")); S.setup.run = { label: "Render model", fraction: null }; render(); }
      else if (a === "smart") api().studio_smart_read(!(S.status && S.status.smart_read !== false)).then(function (st) { if (st) S.status = st; render(); });
      else if (a === "get-reader") { S.setup.error = ""; api().studio_get_reader(); S.setup.run = { label: "Picture reader", fraction: null }; render(); }
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
      document.querySelectorAll("[data-slot].drag").forEach(function (x) { if (x !== s) x.classList.remove("drag"); });
      if (s) s.classList.add("drag");
      S.dropSlot = s ? s.getAttribute("data-slot") : "";
    });
    window.addEventListener("drop", function () { setTimeout(function () { document.querySelectorAll("[data-slot].drag").forEach(function (x) { x.classList.remove("drag"); }); }, 50); });
    document.addEventListener("keydown", function (e) {
      var pg = S.page; if (pg !== "create" && pg !== "reference") return;
      var inText = /^(TEXTAREA|INPUT)$/.test((document.activeElement || {}).tagName || "");
      var id = pg === "create" ? "c" : "r";
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); job(id); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !inText) {
        e.preventDefault();
        var osPaste = function () {
          api().studio_paste().then(function (info) {
            if (!info) return;
            var p = P(id), slot = id === "r" ? (S.dropSlot || (p.src ? "refimg" : "src")) : "src";
            setImage(p, slot, info);
          });
        };
        // A tile copied on a board: onto the open picture as a new layer.
        var clip = S.tileClip;
        if (id === "c" && clip && S.create.src && window.VSSketch && api().studio_clip_seq) {
          api().studio_clip_seq().then(function (n) {
            if (clip.seq > 0 && n && n !== clip.seq) { S.tileClip = null; osPaste(); return; }
            clip.tiles.forEach(function (t) {
              api().studio_image(t.path).then(function (info) {
                if (!info) return;
                var put = function () { window.VSSketch.addImageLayer(S.create.src, info.preview, short(t.name || "Pasted")); S.create.sel = -1; render(); };
                if (S.create.src.live || S.create.src.frozen) window.VSSketch.branch(function () { setTimeout(put, 50); }); else put();
              });
            });
            toast(clip.tiles.length === 1 ? "Pasted as a new layer" : "Pasted " + clip.tiles.length + " pictures as layers");
          });
          return;
        }
        osPaste();
        return;
      }
      // Esc: from a result (or the run being made) back to your picture.
      if (pg === "create" && !inText && e.key === "Escape" && S.create.sel !== -1 && !popEl) { e.preventDefault(); if (S.create.job) S.create.follow = false; S.create.sel = -1; render(); return; }
      if (pg === "create" && !inText && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.ctrlKey && !e.altKey) { e.preventDefault(); cycle(S.create, e.key === "ArrowRight" ? 1 : -1); return; }
      if (pg === "create" && !inText && window.VSSketch && S.create.src && window.VSSketch.key(e)) e.preventDefault();
    });
    new ResizeObserver(function () { layout(); }).observe(document.body);
  }

  // ------------------------------------------------------------------ the brush

  var painter = {
    w: 0, h: 0, size: load("brush", 60), erase: false, selecting: false, busy: false, undo: [], canvas: null, ctx: null, ring: null, drawing: false, last: null, any: false,
    // The selection: the area Create may change. Drawn by the sketch tools
    // (lasso, rectangle, pen, object, Photoshop); the brushes paint on layers.
    tool: "lasso", mode: "new", path: null, cost: null, rect: null, snapObj: (function () { try { return localStorage.getItem("sk.snapObj") !== "false"; } catch (e) { return true; } })(),
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
      var ctx = this.ctx, sub = cut || this.mode === "sub", self = this;
      var prev = this.w && this.h ? ctx.getImageData(0, 0, this.w, this.h) : null;
      if (this.mode === "new" && !cut) ctx.clearRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = sub ? "destination-out" : "source-over";
      ctx.fillStyle = "#8A2BF2"; ctx.fill(new Path2D(d));
      ctx.globalCompositeOperation = "source-over";
      this.check(); this.hint(); render();
      // Snap to object (Nov 2026): what you drew is tightened to the object it covers, so the change
      // stays on it and doesn't stop half-way across it or spill onto what's next to it.
      if (!sub && this.snapObj && S.create.src && S.create.src.path && api().studio_snap) {
        var one = document.createElement("canvas"); one.width = this.w; one.height = this.h;
        var oc = one.getContext("2d"); oc.fillStyle = "#8A2BF2"; oc.fill(new Path2D(d));
        var mode = this.mode;
        this.hint("Snapping to the object…");
        api().studio_snap(shownPic(), one.toDataURL("image/png"), this.w, this.h).then(function (res) {
          self.hint();
          if (!res || !res.mask) return;
          var img = new Image();
          img.onload = function () {
            var c = self.ctx;
            if (mode === "new" || !prev) c.clearRect(0, 0, self.w, self.h);
            else c.putImageData(prev, 0, 0);                   // the selection as it was, plus the snapped shape
            c.drawImage(img, 0, 0, self.w, self.h);
            self.check(); render();
          };
          img.src = res.mask;
        });
      }
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
    scale: function () { var f = this.canvas.parentNode; if (!f || !f.offsetWidth) return 1; return this.w / (f.offsetWidth * zoom.of(f.parentNode).z); },
    point: function (e) {
      var q = zoom.local(e, this.canvas.parentNode), u = q[0], v = q[1], f = window.VSSketch ? window.VSSketch.flip() : {};
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
      var q = zoom.local(e, this.canvas.parentNode), self = this;
      var u = q[0], v = q[1], fl = window.VSSketch ? window.VSSketch.flip() : {};
      if (fl.h) u = 1 - u; if (fl.v) v = 1 - v;
      var add = !(e.altKey || e.button === 2 || this.mode === "sub");
      this.busy = true; this.hint("Selecting…"); this.canvas.style.cursor = "progress";
      api().studio_select(shownPic(), [[u, v, true]], this.w, this.h).then(function (res) {
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
      if (t === "lasso") return "Hold and draw round it; let go to close · Alt+click: snaps to edges · Esc cancels";
      if (t === "poly") return "Click corners · click the start or double-click to close · Alt: cut out · Esc cancels";
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
        // Lasso (Nov 2026): free hand by default, drawn while the button is down; Alt snaps to edges.
        var kind = this.tool === "lasso" && !e.altKey ? "free" : this.tool;
        this.path = { kind: kind, pts: [pt], live: [], nodes: [{ x: pt[0], y: pt[1], hx: pt[0], hy: pt[1] }], down: null };
        if (kind === "lasso") this.costMap();
        if (kind === "free") { this.path.drawing = true; try { e.target.setPointerCapture(e.pointerId); } catch (x) {} }
        this.drawPath(); this.hint(); return;
      }
      if (this.path.kind === "poly") {
        var P0 = this.path;
        if (P0.pts.length > 2 && this.near(pt, P0.pts[0])) { this.close(e.altKey); return; }
        P0.pts.push(pt); this.drawPath(); return;
      }
      var P = this.path, first = P.kind === "pen" ? [P.nodes[0].x, P.nodes[0].y] : P.pts[0];
      if ((P.kind === "pen" ? P.nodes.length > 2 : P.pts.length > 3) && this.near(pt, first)) { this.close(e.altKey); return; }
      if (P.kind === "lasso") { P.pts = P.pts.concat(P.live.length ? P.live.slice(1) : [pt]); P.live = []; }
      else { P.nodes.push({ x: pt[0], y: pt[1], hx: pt[0], hy: pt[1] }); P.down = pt; this.canvas.setPointerCapture(e.pointerId); }
      this.drawPath();
    },
    pathMove: function (e) {
      var P = this.path, pt = this.point(e);
      if (P.kind === "free") {
        if (!P.drawing) return;
        var last = P.pts[P.pts.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 1.5 * this.scale()) { P.pts.push(pt); this.drawPath(); }
        return;
      }
      if (P.kind === "poly") { P.hover = pt; this.drawPath(); return; }
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
    pathUp: function (e) {
      if (this.path && this.path.kind === "pen") this.path.down = null;
      if (this.path && this.path.kind === "free" && this.path.drawing) {
        this.path.drawing = false;
        if (this.path.pts.length > 3) this.close(false); else this.cancelPath();
      }
    },
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
      if (P.kind === "free" || P.kind === "poly") {
        d = P.pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("");
        if (P.kind === "poly" && !closed && P.hover) d += "L" + P.hover[0].toFixed(1) + " " + P.hover[1].toFixed(1);
      } else if (P.kind === "lasso") {
        // The snapped path runs on a coarse edge map, in pixel steps: smoothed into a clean curve
        // (it looked jagged, Nov 2026), drawn through the midpoints with quadratic curves.
        var raw = P.pts.concat(P.live.slice(1)), pts = [], W = 4;
        for (var j = 0; j < raw.length; j++) {
          var sx = 0, sy = 0, c = 0;
          for (var o = -W; o <= W; o++) {
            var q2 = closed ? raw[(j + o + raw.length) % raw.length] : raw[Math.max(0, Math.min(raw.length - 1, j + o))];
            sx += q2[0]; sy += q2[1]; c++;
          }
          pts.push(j === 0 && !closed ? raw[0] : [sx / c, sy / c]);
        }
        if (pts.length < 3) d = pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("");
        else {
          d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
          for (var k2 = 1; k2 < pts.length - 1; k2++) {
            var mx2 = (pts[k2][0] + pts[k2 + 1][0]) / 2, my2 = (pts[k2][1] + pts[k2 + 1][1]) / 2;
            d += "Q" + pts[k2][0].toFixed(1) + " " + pts[k2][1].toFixed(1) + " " + mx2.toFixed(1) + " " + my2.toFixed(1);
          }
          d += "L" + pts[pts.length - 1][0].toFixed(1) + " " + pts[pts.length - 1][1].toFixed(1);
        }
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
      var marks = (P.kind === "pen" ? P.nodes.map(function (n) { return [n.x, n.y]; }) : P.kind === "poly" ? P.pts : [P.pts[0]]).map(function (q, i) {
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
      if (!d || (P.kind === "pen" ? P.nodes.length < 3 : P.pts.length < 3)) return;
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
    var can = ready && p.src && (id === "c" || p.refimg) && (!busy || id === "c");
    $(id + "-go").disabled = !can;
    $(id + "-cancel").hidden = !busy;
    $(id + "-fill").style.width = busy ? Math.round(varFrac(p) * 100) + "%" : "0";
    var inst = id === "c" && !painter.any && instantMode(p);
    var label = id === "c" ? (painter.any ? "Change selected area" : inst ? "Instant render" : "Create") : "Transfer";
    var qn = (p.queue || []).length;
    var gl = $(id + "-golabel"), gh = busy ? (id === "c" ? "Queue another" + (qn ? " · " + qn + " waiting" : "") : esc(p.stage || "Working")) : esc(label);
    $(id + "-go").title = inst ? "A studio-quality CGI render that follows your sketch as it is. Words, if you add them, set the scene." : "";
    if (gl.getAttribute("data-h") !== gh) { gl.innerHTML = gh; gl.setAttribute("data-h", gh); }
    if (id === "c") $("c-go").classList.toggle("s-inst", inst && !busy);
    if (id === "c" && $("c-model")) {
      var me = (S.status && S.status.mac && S.status.mac.engines || []).filter(function (x) { return x.ready; });
      $("c-model").hidden = true;          // FLUX only (Nov 2026)
      if (me.length >= 2) {
        var oh = me.map(function (x) { return '<option value="' + x.key + '"' + (x.key === S.status.mac.engine ? " selected" : "") + ">" + esc(x.label) + "</option>"; }).join("");
        var sel = $("c-modelsel"); if (sel.getAttribute("data-h") !== oh) { sel.innerHTML = oh; sel.setAttribute("data-h", oh); }
        sel.disabled = busy;
      }
    }
    var eng = id === "c" ? engineNow() : "";
    if (id === "c" && $("c-eng")) {
      var oo = st && st.online, showE = !!(oo && oo.on);
      $("c-eng").hidden = !showE;
      if (showE) {
        var eh = (st.local_ready ? '<option value="">Auto (Local) · free</option>' : "") + ["standard", "pro"].map(function (k) {
          var e = oo.engines[k]; return '<option value="' + k + '"' + (eng === k ? " selected" : "") + ">" + e.label + " · " + e.credits["1K"] + (e.credits["1K"] === 1 ? " credit" : " credits") + " · " + money(e.usd["1K"]) + "</option>";
        }).join("");
        var es = $("c-engsel"); if (es.getAttribute("data-h") !== eh) { es.innerHTML = eh; es.setAttribute("data-h", eh); } es.value = eng; es.disabled = busy;
      }
    }
    var meta = "", t = st && st.times;
    if (busy && S.engine.state === "starting") meta = S.engine.message;
    else if (!ready) meta = st ? "Set up image generation first" : "";
    else if (t && t.per) meta = "About " + mmss(t.per * (id === "c" ? (SIZE_TIME[p.res] || 1) : 1) * p.vars + (t.warm ? 0 : (t.load || 0))) + " for " + p.vars + (p.vars > 1 ? " variations" : " variation");
    else meta = "The first run loads the models, so it takes a little longer";
    if (eng && ready) meta = onlineCost(eng, p.vars, p.res);
    $(id + "-meta").textContent = meta;
    $(id + "-err").hidden = !p.error; $(id + "-err").textContent = p.error;
    $(id + "-vars-n").textContent = p.vars;
    if ($(id + "-res")) [].forEach.call($(id + "-res").children, function (b) { b.classList.toggle("on", b.getAttribute("data-v") === (p.res || "2k")); });
    var cons = hasConsistency();
    $(id + "-keep-w").hidden = id === "c";   // Create: always exact, no slider
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
      var have = {}; p.results.forEach(function (r) { have[(r.path || "").toLowerCase()] = r; });
      var k = srcKey(src), add = [];
      list.forEach(function (r) {
        var old = have[r.path.toLowerCase()];
        if (old) { old.made = r.made; return; }             // the file's own time sets the order
        add.push({ path: r.path, name: r.name, w: r.w, h: r.h, preview: r.thumb || BLANK, thin: true, srcKey: k, meta: r.meta, made: r.made });
      });
      var selPath = p.sel >= 0 && p.results[p.sel] ? p.results[p.sel].path : null;
      p.results = p.results.concat(add).sort(function (a, b) { return (a.made || 0) - (b.made || 0); });
      if (selPath) p.sel = p.results.map(function (r) { return r.path; }).indexOf(selPath);
      render();
    });
  }
  // Create: the picture (with its layers) stays on the left; the chosen result
  // (or the one being made) shows beside it, a fifth smaller. Click results or
  // use the arrow keys to flip through them; the original never goes away.
  function renderPane(id, p, c, origOf, view) {
    var pane = view.querySelector(".s-pane"), what = null;
    var hideTag = function (on) { var mt = view.querySelector(":scope > .s-tag"); if (mt) mt.hidden = on; };
    if (c) what = { k: "r:" + c.path + (c.thin ? ":thin" : ""), img: c.preview, w: c.w, h: c.h, res: true };
    else if (p.job && p.sel === -2) what = { k: "job:" + (p.jobOrig || "").length, img: p.jobOrig || p.src.preview, w: p.src.w, h: p.src.h, job: true };
    else if (origOf) what = { k: "orig:" + origOf.length, img: origOf, w: p.src.w, h: p.src.h };
    var mt = view.querySelector(":scope > .s-tag"); if (mt) mt.hidden = !!what;
    // the original (with its layers) can be exported too, when no result is showing
    var oe = view.querySelector(":scope > .s-oexp"), wantOe = !what && p.src && !p.src.frozen && !!p.src.path && !p.job;
    if (wantOe && !oe) { oe = document.createElement("div"); oe.className = "s-ra s-oexp"; oe.innerHTML = '<button type="button" data-ra="export" title="Export the original, or upscale and export">' + svg("download") + "Export</button>"; view.appendChild(oe); }
    else if (!wantOe && oe) oe.remove();
    if (!what) { if (pane) { pane.remove(); layout(); } return; }
    if (!pane) { pane = document.createElement("div"); pane.className = "s-pane"; view.appendChild(pane); }
    if (pane.getAttribute("data-k") !== what.k) {
      pane.setAttribute("data-k", what.k); pane.setAttribute("data-w", what.w); pane.setAttribute("data-h", what.h);
      var mine = p.results.map(function (r, i) { return r.srcKey === srcKey(p.src) ? i : -1; }).filter(function (i) { return i >= 0; });
      var n = c ? mine.indexOf(p.sel) + 1 : 0;
      pane.innerHTML = '<div class="s-pfit"><img class="' + (what.res ? "s-res" : "") + '" src="' + what.img + '" alt=""></div>' +
        '<span class="s-tag">' + (what.res ? "Result" + (n ? " " + n + " of " + mine.length : "") + " · click it again for your picture" : what.job ? "Making…" : "Sketch these were made from") + "</span>" +
        (what.res ? '<div class="s-ra">' + '<button type="button" data-ra="add" title="Put this result on a layer over your picture">' + svg("plus") + "Add</button>" +
          '<button type="button" data-ra="export" title="Export the original, or upscale and export">' + svg("download") + "Export</button></div>" : "");
      layout();
    }
    // While making: the sketch blurred, the steps coming through, a progress ring and the stage.
    var pf = pane.querySelector(".s-pfit");
    pf.classList.toggle("s-loading", !!what.job);
    // Only the blurred sketch and the ring while it's made: the in-between steps look messy.
    var ring = pane.querySelector(".s-pring");
    if (what.job) {
      if (!ring) { ring = document.createElement("div"); ring.className = "s-pring";
        ring.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" class="bg"/><circle cx="24" cy="24" r="20" class="fg"/></svg><b></b>'; pane.appendChild(ring); }
      var fr = Math.max(0.02, varFrac(p));
      ring.querySelector(".fg").style.strokeDashoffset = String(125.7 * (1 - fr));
      ring.querySelector("b").textContent = Math.round(fr * 100) + "%";
      pf.style.setProperty("--blur", "16px");
    } else if (ring) ring.remove();
  }
  // Flip through this picture's results (← →).
  function cycle(p, d) {
    var mine = p.results.map(function (r, i) { return r.srcKey === srcKey(p.src) && !r.missing ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!mine.length) return;
    var at = mine.indexOf(p.sel), next = at < 0 ? (d > 0 ? mine[0] : mine[mine.length - 1]) : mine[Math.max(0, Math.min(mine.length - 1, at + d))];
    pickResult(p, next);
  }
  // Which Create a result came from: the job, or the _vN in its file name.
  function runOf(r) {
    if (r.run) return r.run;
    var n = /Vistiq_(\d{4,})_/i.exec(r.name || r.path || "");
    if (n) return "n" + n[1];                       // numbered runs: one number per Create
    var m = /_(create|refine|paint|reference|camera|cmf|style)_v(\d+)/i.exec(r.name || r.path || "");
    return m ? m[1].toLowerCase() + m[2] : r.path;
  }
  function keyOfSrc(src) { return src ? (src.live ? "live" : src.path) : ""; }
  // A word in the prompt that changes something locked: say so, with one click to unlock.
  function renderRefs() {
    var p = S.create, refs = p.refs || [], el = $("c-refs");
    var h = refs.map(function (r, i) {
      return '<div class="s-ref"><div class="s-rimg"><img src="' + r.preview + '" alt="" title="' + esc(r.name || "") + '">' +
        '<button type="button" class="s-rn" data-rn="' + (i + 1) + '" title="Put \'ref ' + (i + 1) + '\' in the description">Ref ' + (i + 1) + "</button>" +
        '<button type="button" class="s-rx" data-rx="' + i + '" title="Remove">×</button></div>' +
        '<button type="button" class="s-ru" data-ru="' + i + '" title="' + RUSE[r.use][0] + '">' + RUSE[r.use][3] + "</button></div>";
    }).join("") + (refs.length < 6 ? '<button type="button" class="s-radd" data-radd="1"><span>+</span>' + (refs.length ? "Add" : "Add a reference") + "</button>" : "");
    if (el.getAttribute("data-h") !== h) { el.innerHTML = h; el.setAttribute("data-h", h); }
    // Under the tiles: each reference's camera, light or style in words (read, or typed).
    var st = S.status || {}, dk = refs.map(function (r, i) { return i + r.use + (r.reading ? "r" : "") + (RPH[r.use] ? 1 : 0); }).join(",") + (st.reader_ready ? "R" : "");
    var dEl = $("c-refd");
    if (dEl.getAttribute("data-k") !== dk) {
      dEl.setAttribute("data-k", dk);
      dEl.innerHTML = refs.map(function (r, i) {
        if (!RPH[r.use]) return "";
        var need = r.use !== "materials";
        return '<div class="s-rd"><div class="l"><b>Ref ' + (i + 1) + " · " + RUSE[r.use][3] + "</b>" +
          (r.reading ? '<em class="busy">Reading the picture…</em>' : st.reader_ready ? '<button type="button" class="s-link" data-rr="' + i + '">Read again</button>'
            : need ? '<button type="button" class="s-link" data-rget="1">Let Studio read it</button>' : "") + "</div>" +
          '<textarea class="s-rdt" data-rd="' + i + '" rows="2" placeholder="' + esc(RPH[r.use]) + '"></textarea></div>';
      }).join("");
    }
    dEl.querySelectorAll("[data-rd]").forEach(function (t) {
      var r = refs[+t.getAttribute("data-rd")];
      if (r && document.activeElement !== t && t.value !== (r.desc || "")) t.value = r.desc || "";
      t.disabled = !!(r && r.reading);
    });
    var by = refLocks(p), names = { camera: "Camera", materials: "Materials", light: "Light" };
    var note = Object.keys(by).map(function (k) { return names[k] + " comes from Ref " + by[k]; }).join(" · ");
    $("c-refs-hint").textContent = refs.length ? (note ? note + ", so it is unlocked. " : "") + "Type ref 1, ref 2 in the description to point at one." +
        (refs.length > 3 && !engineNow() ? " Local uses the first 3; Standard and Pro use all 6." : "")
      : "Take the camera, materials, style, light or design from up to 6 pictures. Several Design references mix their designs.";
  }

  function renderWarn() {
    var p = S.create, el = $("c-warn"), L = effLocks(p), hit = [];
    // "maintain the original camera view" asks to keep it: not a clash (Nov 2026)
    var t = (p.text || "").replace(/\b(keep|keeps|keeping|maintain\w*|preserv\w*|retain\w*|same|original|do not change|don'?t change)\b[^.,;!?]*/gi, " ");
    Object.keys(LOCK_WORDS).forEach(function (k) { var m = L[k] && t.match(LOCK_WORDS[k]); if (m) hit.push([k, m[0]]); });
    // A sketch is rendered: describing its materials and light is the point, not a clash.
    // Your words win over the Design, Materials and Light locks (Nov 2026), so only Camera can clash.
    hit = hit.filter(function (h) { return h[0] === "camera"; });
    if (p.libText && p.libText === p.text) hit = [];      // a library prompt comes with its own locks
    var names = { design: "Design", materials: "Materials", light: "Light", camera: "Camera" };
    var h = hit.length ? svg("lock") + '<span><b>"' + hit.map(function (x) { return esc(x[1]); }).join('", "') + '"</b> would change ' +
      hit.map(function (x) { return names[x[0]]; }).join(" and ") + ', which ' + (hit.length > 1 ? "are" : "is") + ' locked. <button type="button" class="s-link" data-unlock="' +
      hit.map(function (x) { return x[0]; }).join(",") + '">Unlock</button> or keep it.</span>' : "";
    el.hidden = !h; if (el.getAttribute("data-h") !== h) { el.innerHTML = h; el.setAttribute("data-h", h); }
  }

  function renderCreate() {
    var p = S.create, st = S.status;
    askMedium(p);
    $("c-imp").querySelector(".s-impb").hidden = !(st && st.helper_ready);
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
    var w = p.src, wk = w ? keyOfSrc(w) + (w.preview || "").length + ":" + (w.medium || "") : "";
    if ($("c-work").getAttribute("data-k") !== wk) {
      $("c-work").setAttribute("data-k", wk);
      $("c-work").innerHTML = w ? '<img src="' + w.preview + '" alt=""><span><b>' + esc(short(w.name || "")) + "</b><small>" +
        (w.live ? "Live from " + ((APPS[w.app] || APPS.photoshop)[1]) : isRender(w) ? "Render · " + w.w + " × " + w.h : (/sketch \d/i.test(w.name) ? "Sketch · " : "Picture · ") + w.w + " × " + w.h) +
        '</small></span><button type="button" class="s-link" data-w="board">← Board</button>' :
        (p.source === "live" ? '<span class="s-none">Live: not connected yet. Follow the steps beside.</span>' : '<span class="s-none">Open a tile on the board, or click here to pick a picture</span>');
    }
    $("c-ps").hidden = !(w && w.live);
    if (w && p.resultsFor !== keyOfSrc(w)) { p.resultsFor = keyOfSrc(w); loadResultsFor(p, w); }
    if (p.locksFor !== keyOfSrc(w)) { p.locks = defaultLocks(w); p.locksFor = keyOfSrc(w); p.locksAuto = true; }
    // Each picture keeps its own words: another picture starts with its own (empty when new).
    var tk = w && (w.live || w.frozen) ? "live" : keyOfSrc(w);
    if (p.textFor !== tk) {
      p.texts = p.texts || {};
      if (p.textFor) p.texts[p.textFor] = p.viewing ? (p.draft || "") : (p.text || "");
      p.text = p.texts[tk] || ""; p.viewing = false; p.wordsFor = null; p.textFor = tk; $("c-text").value = p.text;
    }
    var LK = p.locks || defaultLocks(w), BY = refLocks(p);
    $("c-locks").querySelectorAll("button").forEach(function (b) {
      var k = b.getAttribute("data-v");
      if (!b.hasAttribute("data-t")) b.setAttribute("data-t", b.title);
      b.classList.toggle("on", !!LK[k] && !BY[k]); b.classList.toggle("s-byref", !!BY[k]); b.disabled = !!BY[k];
      b.title = BY[k] ? "Comes from Ref " + BY[k] : b.getAttribute("data-t") || b.title;
    });
    renderRefs();
    p.preset = presetFor(p);
    showWords(p);
    $("c-prompt-l").textContent = isRender(w) ? "Describe the change" : "Describe the result";
    $("c-keep-w").hidden = true;          // no strictness slider: always exact
    var dl = $("c-locks").querySelector('[data-v="design"]'); if (dl) dl.hidden = true;   // no Design lock: always kept
    $("c-keep-l").firstChild.textContent = "How strictly · Design ";
    renderWarn();
    var cur = p.viewing && current(p), cm = cur && cur.meta;
    if (cur && cm && !(cm.text || "").trim()) $("c-text").placeholder = madeWith(cm);
    else $("c-text").placeholder = isRender(p.src) ? "What should change? (e.g. make the seats red leather). Leave empty for an Instant render."
      : "What should it look like? (e.g. yellow nappa seats, soft morning light). Leave empty for an Instant render.";
    $("c-imp").querySelector(".s-impb").hidden = !(st && st.helper_ready);
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
    // Live is its own page: only your Photoshop / Affinity file, once connected (Nov 2026: it showed the
    // last picture you had open, as if that were live).
    var livePage = !show && id === "c" && S.create.source === "live" && !S.create.src;
    g.hidden = !(show || livePage); stg.hidden = !!(show || livePage);
    g.classList.toggle("s-livepage", !!livePage);
    if (show || livePage) { var h = show ? setupCard() : liveSetup(); if (g.getAttribute("data-h") !== h) { g.innerHTML = h; g.setAttribute("data-h", h); } }
    return show || livePage;
  }

  // The Live page before a file shows up: install the plugin, connect, open a file.
  function liveSetup() {
    var L = S.live, st = S.status || {}, apps = st.apps || {};
    var have = Object.keys(APPS).filter(function (k) { return apps[k]; }); if (!have.length) have = Object.keys(APPS);
    var cur = L.on && L.app ? L.app : (have.indexOf(S.liveApp) >= 0 ? S.liveApp : have[0]);
    var nm = APPS[cur][1], ps = cur === "photoshop", inst = !ps || !!st.ps_panel;
    var step = function (n, state, title, sub, btn) {
      return '<li class="s-lstep ' + state + '"><i>' + (state === "done" ? "✓" : n) + "</i><span><b>" + title + "</b><small>" + sub + "</small></span>" + (btn || "") + "</li>";
    };
    var h = '<div class="s-livecard"><div class="s-lhd"><span class="s-live-dot' + (L.on ? "" : " off") + '"></span><b>Live from ' + nm + "</b></div>" +
      "<p>Your open " + nm + " file appears here and updates as you draw. Create works on it, and the results go back into your file as layers.</p>" +
      '<div class="m-apps">' + have.map(function (k) {
        return '<button type="button" data-ps="app" data-app="' + k + '" class="' + (k === cur ? "on" : "") + '"><span class="m-ico ' + APPS[k][2] + '">' + APPS[k][0] + "</span>" + APPS[k][1] + "</button>";
      }).join("") + "</div><ol>";
    if (ps) h += step(1, inst ? "done" : "now", "Install the Studio plugin for Photoshop",
      inst ? "Installed. In Photoshop: Window → Plugins → Vistiq Studio." : "One time. Then restart Photoshop and open Window → Plugins → Vistiq Studio.",
      '<button type="button" class="s-btn' + (inst ? "" : " p") + '" data-ps="install"' + (L.installing ? " disabled" : "") + ">" + (L.installing ? "Installing…" : inst ? "Reinstall" : "Install plugin") + "</button>");
    else h += step(1, "now", "Turn on Affinity's connection", "In Affinity: Settings → Model Context Protocol → Enable Affinity MCP.", "");
    h += step(2, L.on ? "done" : inst ? "now" : "", "Connect", L.on ? "Connected. Waiting for " + nm + "…" : "Links Studio to " + nm + ".",
      L.on ? '<button type="button" class="s-btn" data-ps="off">Stop</button>' : '<button type="button" class="s-btn' + (inst ? " p" : "") + '" data-ps="on" data-app="' + cur + '">Connect</button>');
    h += step(3, L.on ? "now" : "", "Open a file in " + nm, esc(L.state || "It shows up here by itself."), "");
    h += "</ol>" + (L.msg ? '<p class="s-hint">' + esc(L.msg) + "</p>" : "") + "</div>";
    return h;
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
    $(id + "-toboard").querySelector("span").textContent = onB ? "On board" : "To board";
    $(id + "-refine-this").hidden = id === "c"; $(id + "-refine-this").disabled = !c || !!p.job;
    if ($(id + "-to3d")) $(id + "-to3d").disabled = !tg || !!p.job;
    $(id + "-tops").hidden = false; $(id + "-tops").disabled = !tg;
    $(id + "-tops").title = S.psOn ? "Put this picture in your open Photoshop file as a new layer" : "Open this picture in Photoshop";
    $(id + "-clear").hidden = true;          // results are never cleared: each picture always shows all it made
    $(id + "-refine-go").disabled = !!p.job || !(c || p.src);

    // The big view.
    var view = $(id + "-view"), mode, key;
    var origOf = p.sel === -2 ? (p.job ? p.jobOrig : (p.results.length ? p.results[p.results.length - 1].orig : null)) : null;
    var split = id === "c" && p.src && window.VSSketch;
    if (split) { mode = "paint"; key = p.src.live || p.src.frozen ? "live" : p.src.path; }
    else if (c) { mode = "result"; key = c.path + (c.thin ? ":thin" : ""); }
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
          (mode === "result" ? '<span class="s-tag">Result · hold to see the original</span>' +
            '<div class="s-ra">' + (id === "c" ? '<button type="button" data-ra="add" title="Put this result on a layer over your picture">' + svg("plus") + "Add</button>" : "") +
            '<button type="button" data-ra="export" title="Export the original, or upscale and export">' + svg("download") + "Export</button></div>" : '<span class="s-tag' + (info.live ? " s-livetag" : "") + '">' + (info.live ? '<i class="s-ldot"></i>' : "") + (info.live ? "Live from " + ((APPS[info.app] || APPS.photoshop)[1]) : info.frozen ? (mode === "orig" && p.job ? "Making…" : mode === "orig" && !p.job ? "Sketch · what these results were made from" : "Sketch · frozen while creating") : "Original") + "</span>" +
            (mode === "src" && !info.frozen && info.path ? '<div class="s-ra"><button type="button" data-ra="export" title="Export the original, or upscale and export">' + svg("download") + "Export</button></div>" : ""));
      }
    }
    if (mode === "paint") {
      var showLive = p.job && p.liveSrc && p.sel === -1 && p.src.frozen;     // Live tile during a run: the live canvas
      var mtag = view.querySelector(":scope > .s-tag"), tt = p.src.live || showLive ? '<i class="s-ldot"></i>Live from ' + ((APPS[p.src.app] || APPS.photoshop)[1]) : p.src.frozen ? "Sketch · frozen while making" : "Original";
      if (mtag && mtag.getAttribute("data-t") !== tt) { mtag.setAttribute("data-t", tt); mtag.innerHTML = tt; mtag.classList.toggle("s-livetag", !!(p.src.live || showLive)); }
      var bsrc = showLive ? p.liveSrc.preview : p.src.preview;
      var bimg = view.querySelector(".sk-base"); if (bimg && bimg.getAttribute("src") !== bsrc) bimg.setAttribute("src", bsrc);
      // Photoshop's selection, tinted on the live picture.
      var fitP = view.querySelector(".s-fit"), ov = fitP && fitP.querySelector(".s-selov");
      var want = p.src.live && S.psSel && S.useSel !== false ? S.psSel.preview : "";
      if (want && !ov) { ov = document.createElement("div"); ov.className = "s-selov"; ov.style.zIndex = 40; fitP.appendChild(ov); }
      if (ov && !want) ov.remove();
      else if (ov && ov.getAttribute("data-m") !== want.slice(-40)) { ov.setAttribute("data-m", want.slice(-40)); ov.style.webkitMaskImage = ov.style.maskImage = "url(" + want + ")"; }
    }
    if (split) renderPane(id, p, c, origOf, view);
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
    var fitEl = split ? null : view.querySelector(".s-fit"), loading = !split && !!(p.job && fitEl && mode === "orig");
    if (fitEl) fitEl.classList.toggle("s-loading", loading);
    var ring = split ? null : view.querySelector(".s-pring");
    // Next variation still being made while you look at a finished one: the ring shows too, in the corner.
    var corner = !split && !!p.job && !loading && !!fitEl;
    if (ring) ring.classList.toggle("s-corner", corner);
    if (loading || corner) {
      if (!ring) { ring = document.createElement("div"); ring.className = "s-pring";
        ring.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" class="bg"/><circle cx="24" cy="24" r="20" class="fg"/></svg><b></b>'; view.appendChild(ring); }
      var fr = Math.max(0.02, varFrac(p));
      ring.querySelector(".fg").style.strokeDashoffset = String(125.7 * (1 - fr));
      ring.querySelector("b").textContent = Math.round(fr * 100) + "%";
      if (fitEl && loading) fitEl.style.setProperty("--blur", Math.max(2, 18 - 2.5 * (p.previewN || 0)) + "px");
      ring.classList.toggle("s-corner", corner);
    } else if (ring) ring.remove();
    var busy = view.querySelector(".s-busy");
    if (p.job) {
      if (!busy) { busy = document.createElement("div"); busy.className = "s-busy"; busy.innerHTML = '<span></span><i><b></b></i>'; view.appendChild(busy); }
      busy.querySelector("span").textContent = ((S.engine.state === "starting" ? S.engine.message : p.stage) || "Working") + clock(p);
      busy.querySelector("b").style.width = Math.round(varFrac(p) * 100) + "%";
    } else if (busy) busy.remove();

    // The strip: original, results, placeholders, + Another.
    // Only results made from what's in Create now; results of earlier
    // pictures fold into "Earlier" (and are all in the Library).
    var key = srcKey(p.src), mine = [], earlier = [];
    p.results.forEach(function (r, i) { (r.srcKey === key ? mine : earlier).push(i); });
    var tile = function (i) {
      var r = p.results[i];
      if (r.missing) return '<span class="s-miss' + (i === p.sel ? " sel" : "") + '" data-i="' + i + '" title="Missing from its original location: ' + esc(r.path) + '">Missing</span>';
      var no = mine.indexOf(i) + 1;
      return '<span class="s-rt"><img data-i="' + i + '" class="' + (i === p.sel ? "sel" : "") + '" src="' + r.preview + '" title="' + esc(short(r.name)) + '" alt="">' +
        (no ? "<b>" + no + "</b>" : "") + "</span>";
    };
    var strip = "";
    // Live: first tile, always the current canvas (it keeps updating, even during a run).
    // Then a divider, then the sketch these results were made from (frozen at Create), then the results.
    var live = id === "c" && p.source === "live" ? (p.liveSrc || (p.src && (p.src.live || p.src.frozen) ? p.src : null)) : null;
    var origPrev = p.job ? p.jobOrig : (mine.length ? p.results[mine[mine.length - 1]].orig : null);
    if (p.src && (mine.length || earlier.length || p.job)) {
      strip += '<span class="s-pin">';
      if (live) {
        strip += '<span class="s-tilewrap"><img data-i="-1" class="' + (p.sel === -1 ? "sel" : "") + '" src="' + live.preview + '" alt="">' +
          '<em class="live"><i class="ld"></i>Live</em></span><span class="s-div" aria-hidden="true"></span>';
        if (origPrev && p.job) {
          var pct = Math.max(2, Math.round(varFrac(p) * 100));
          strip += '<span class="s-tilewrap s-fillt' + (p.sel === -2 ? " sel" : "") + '" data-i="-2" title="Creating from this sketch"><img src="' + origPrev + '" alt="">' +
            '<span class="s-fillc" style="width:' + pct + '%"><img src="' + origPrev + '" alt=""></span>' +
            '<span class="s-fillb"><i style="width:' + pct + '%"></i></span><em>Creating · ' + pct + "%</em></span>";
        } else if (origPrev && mine.length) strip += '<span class="s-tilewrap"><img data-i="-2" class="' + (p.sel === -2 ? "sel" : "") + '" src="' + origPrev + '" alt="" title="The sketch these were made from">' +
          "<em>Sketch</em></span>";
      } else {
        strip += '<span class="s-tilewrap"><img data-i="-1" class="' + (p.sel < 0 ? "sel" : "") + '" src="' + p.src.preview + '" alt="">' +
          "<em>Original</em></span>";
      }
      strip += '<span class="s-div" aria-hidden="true"></span></span>';
    }
    // Results in their runs: a divider after each Create (2 made, then 4 made: | 1 2 | 1 2 3 4 |).
    var lastRun = null;
    mine.forEach(function (i) {
      var run = runOf(p.results[i]);
      if (lastRun !== null && run !== lastRun) strip += '<span class="s-div s-rundiv" aria-hidden="true"></span>';
      lastRun = run; strip += tile(i);
    });
    if (mine.length) strip += '<span class="s-div s-rundiv" aria-hidden="true"></span>';
    // Still to come: the first shows the progress; click any to watch it being made.
    for (var k = 0; k < (p.job ? p.pending : 0); k++) {
      var tot = (p.pending || 0) + (p.jobDone || 0) || 1;
      var pc = k === 0 ? Math.max(2, Math.min(99, Math.round(varFrac(p) * 100))) : 0;
      strip += '<span class="s-ph' + (p.sel === -2 && k === 0 ? " sel" : "") + '" data-i="-2" title="Being made · click to watch">' +
        (k === 0 ? '<i class="s-phbar" style="width:' + pc + '%"></i><em>' + pc + "%</em>" : '<em class="w">Next</em>') + "</span>";
    }
    // Results of other pictures stay in the Library (no "Earlier" fold here).
    var sk = $(id + "-strip");
    if (sk.getAttribute("data-h") !== strip) {
      // Progress redraws the strip many times a second: keep where the person scrolled to, and only
      // bring a tile into view when the pick or the run changes, never while they scroll (Nov 2026:
      // with 30 results the strip kept jumping back while a render ran).
      var keepX = sk.scrollLeft, busy = Date.now() - (sk.__userAt || 0) < 5000;
      sk.innerHTML = strip; sk.setAttribute("data-h", strip);
      sk.scrollLeft = keepX;
      var on = sk.querySelector("img.sel,.s-miss.sel,.s-ph.sel");
      var selk = on ? (on.getAttribute("data-i") || "") + ":" + (p.sel) : "";
      if (on && !busy && sk.getAttribute("data-selk") !== selk && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "nearest" });
      sk.setAttribute("data-selk", selk);
      // A run in progress: bring its tiles into view when it starts or a result lands.
      var rk = p.job ? (p.jobKey || "") + ":" + (p.jobDone || 0) + ":" + (p.pending || 0) : "";
      if (rk && !busy && sk.getAttribute("data-run") !== rk) { var lastPh = sk.querySelector(".s-ph:last-of-type") || sk.lastElementChild; if (lastPh && lastPh.scrollIntoView) lastPh.scrollIntoView({ block: "nearest", inline: "end" }); }
      sk.setAttribute("data-run", rk);
    }
    layout();
  }

  // -- zoom and pan: every picture floats on the canvas --------------------------------
  // Mouse wheel or trackpad pinch zooms around the pointer, middle button (or Space +
  // drag) pans, the pill bottom-left shows the zoom and Fit. Results of the same size
  // keep the zoom, so they can be compared at the same spot.
  var zoom = {
    st: {},
    of: function (v) { var id = v.id; return this.st[id] || (this.st[id] = { z: 1, x: 0, y: 0, r: 0, wh: "" }); },
    apply: function (v, f, w, h) {
      var z = this.of(v), wh = w + "x" + h;
      if (z.wh !== wh) { z.wh = wh; z.z = 1; z.x = 0; z.y = 0; z.r = 0; }
      f.style.transformOrigin = "50% 50%";
      var fl = window.VSSketch && v.id === "c-view" ? window.VSSketch.flip() : {};
      f.style.transform = "translate(" + z.x + "px," + z.y + "px) rotate(" + (z.r || 0) + "deg) scale(" + z.z * (fl.h ? -1 : 1) + "," + z.z * (fl.v ? -1 : 1) + ")";
      f.classList.toggle("s-zoomed", z.z !== 1);
      f.classList.toggle("s-flh", !!fl.h); f.classList.toggle("s-flv", !!fl.v);   // flip the picture, not the labels and buttons
      f.style.setProperty("--zr", ((!!fl.h !== !!fl.v) ? 1 : -1) * (z.r || 0) + "deg");                           // and turn them back upright
      var pill = v.querySelector(".s-zpill");
      if (!pill) {
        pill = document.createElement("div"); pill.className = "s-zpill";
        pill.innerHTML = '<button type="button" data-z="out" title="Zoom out">−</button><b></b><button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="fit" title="Fit the picture (double-click the canvas)">Fit</button>';
        v.appendChild(pill);
      }
      pill.querySelector("b").textContent = Math.round(z.z * 100) + "%" + (z.r ? " · " + Math.round(z.r) + "°" : "");
      try { sharpView(v); } catch (e) { /* only a nicer zoom */ }
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
    fit: function (v) { var z = this.of(v); z.z = 1; z.x = 0; z.y = 0; z.r = 0; layout(); },
    // Where a pointer is on the picture (0..1 across and down), whatever the zoom and turn.
    local: function (e, f) {
      var v = f.parentNode, z = this.of(v), r = f.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var a = -(z.r || 0) * Math.PI / 180, dx = e.clientX - cx, dy = e.clientY - cy;
      var x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
      return [0.5 + x / (f.offsetWidth * z.z), 0.5 + y / (f.offsetHeight * z.z), f.offsetWidth * z.z];
    },
    rot: false,
    pan: null, space: false,
    wire: function (v) {
      var self = this;
      v.addEventListener("wheel", function (e) {
        if (!v.querySelector(".s-fit")) return;
        e.preventDefault();
        var r = v.getBoundingClientRect();
        // Touchpad: two fingers sliding pan, a pinch (Ctrl+wheel) zooms. A mouse wheel zooms.
        var now = Date.now();
        var pad = !e.ctrlKey && (now < (self.padUntil || 0) || e.deltaX !== 0 || (e.wheelDeltaY !== undefined && e.wheelDeltaY % 120 !== 0) || (e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && e.deltaY % 1 !== 0));
        // Once two fingers are sliding, the whole gesture (and its glide at the end) stays a pan.
        if (pad) self.padUntil = now + 350;
        if (pad) { var zz = self.of(v); zz.x -= e.deltaX; zz.y -= e.deltaY; layout(); painter.refreshRing && painter.refreshRing(); return; }
        var step = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.15 : 1 / 1.15);   // pinch arrives as Ctrl+wheel
        self.by(v, step, e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      v.addEventListener("pointerdown", function (e) {
        if (self.rot && e.button === 0 && v.querySelector(".s-fit")) {
          e.preventDefault(); e.stopPropagation();
          var f = v.querySelector(".s-fit"), rc = f.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2, z = self.of(v);
          var a0 = Math.atan2(e.clientY - cy, e.clientX - cx), r0 = z.r || 0;
          v.setPointerCapture(e.pointerId);
          var mv = function (ev) {
            var d = (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI, r = r0 + d;
            if (ev.shiftKey) r = Math.round(r / 15) * 15;
            r = ((r + 540) % 360) - 180; if (Math.abs(r) < 1.5) r = 0;
            z.r = r; layout();
          };
          var up = function () { v.removeEventListener("pointermove", mv); v.removeEventListener("pointerup", up); };
          v.addEventListener("pointermove", mv); v.addEventListener("pointerup", up);
          return;
        }
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
  document.addEventListener("keyup", function (e) {
    if (e.code === "Space") { zoom.space = false; document.body.classList.remove("s-space"); }
    if (e.code === "KeyR") { zoom.rot = false; document.body.classList.remove("s-rot"); }
  });
  // Hold R and drag to turn the view (Shift snaps to 15°); Fit straightens it again.
  document.addEventListener("keydown", function (e) {
    if (e.code !== "KeyR" || e.ctrlKey || e.altKey || e.metaKey || /^(TEXTAREA|INPUT|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
    if (!document.querySelector(".s-page.on .s-view .s-fit")) return;
    e.preventDefault(); e.stopPropagation();
    if (!zoom.rot) { zoom.rot = true; document.body.classList.add("s-rot"); }
  }, true);

  // Sharp zoom (Nov 2026): past the preview's resolution, the part on screen is read again from the full
  // picture and laid over the preview (inside the same box, so it moves and scales with it).
  var sharpT = {};
  function sharpen(box, path, w, h, under) {
    if (!box || !path || !api() || !api().studio_region) return;
    var key = box.getAttribute("data-sk") || (box.setAttribute("data-sk", "k" + Math.random().toString(36).slice(2)), box.getAttribute("data-sk"));
    clearTimeout(sharpT[key]);
    sharpT[key] = setTimeout(function () {
      var old = box.querySelector(":scope > img.s-sharp");
      var ref = under && under.parentNode === box ? under : box, r = ref.getBoundingClientRect(), clip = (box.closest(".b-cv,.s-view,[id$='-view']") || document.body).getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1, shownW = r.width * dpr, prev = under && under.naturalWidth ? under.naturalWidth : 1600;
      if (!r.width || shownW <= prev * 1.15 || (old && old.getAttribute("data-sp") !== path && (old.remove(), false))) { if (old) old.remove(); return; }
      var x0 = Math.max(r.left, clip.left), y0 = Math.max(r.top, clip.top), x1 = Math.min(r.right, clip.right), y1 = Math.min(r.bottom, clip.bottom);
      if (x1 <= x0 || y1 <= y0) { if (old) old.remove(); return; }
      var u0 = (x0 - r.left) / r.width, v0 = (y0 - r.top) / r.height, u1 = (x1 - r.left) / r.width, v1 = (y1 - r.top) / r.height;
      var pad = 0.08 * (u1 - u0); u0 = Math.max(0, u0 - pad); u1 = Math.min(1, u1 + pad); pad = 0.08 * (v1 - v0); v0 = Math.max(0, v0 - pad); v1 = Math.min(1, v1 + pad);
      var outW = Math.round((u1 - u0) * shownW);
      api().studio_region(path, u0, v0, u1, v1, outW).then(function (g) {
        if (!g || !box.isConnected) return;
        var im = box.querySelector(":scope > img.s-sharp");
        if (!im) { im = document.createElement("img"); im.className = "s-sharp"; im.alt = ""; if (under && under.parentNode === box) under.insertAdjacentElement("afterend", im); else box.appendChild(im); }
        im.setAttribute("data-sp", path);
        var ox = ref === box ? 0 : ref.offsetLeft, oy = ref === box ? 0 : ref.offsetTop, rw = ref === box ? box.clientWidth : ref.offsetWidth, rh = ref === box ? box.clientHeight : ref.offsetHeight;
        im.style.left = ox + g.u0 * rw + "px"; im.style.top = oy + g.v0 * rh + "px"; im.style.width = (g.u1 - g.u0) * rw + "px"; im.style.height = (g.v1 - g.v0) * rh + "px";
        im.src = g.src;
      });
    }, 280);
  }
  function sharpView(v) {
    var p = v.id === "c-view" ? S.create : v.id === "r-view" ? S.ref : null; if (!p) return;
    var c = current(p), pane = v.querySelector(".s-pane"), f = v.querySelector(":scope > .s-fit");
    if (zoom.of(v).r) { v.querySelectorAll("img.s-sharp").forEach(function (x) { x.remove(); }); return; }
    if (c && pane && !pane.hidden) { var pi = pane.querySelector("img"); if (pi) sharpen(pi.parentNode, c.path, c.w, c.h, pi); }
    else if (f && p.src && p.src.path && !p.src.live && !p.src.frozen) { var bi = f.querySelector("img"); sharpen(f, p.src.path, p.src.w, p.src.h, bi); }
    else if (f && c) { var ri = f.querySelector("img"); sharpen(f, c.path, c.w, c.h, ri); }
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
      var pad = /-view$/.test(v.id) ? 28 : 0;          // floating: a margin of canvas round the picture
      var k = Math.min((W - 2 * pad) / w, (aH - 2 * pad) / h), fw = Math.round(w * k), fh = Math.round(h * k);
      f.style.width = fw + "px"; f.style.height = fh + "px";
      f.style.left = Math.round((W - fw) / 2) + "px"; f.style.top = Math.round(top + (aH - fh) / 2) + "px";
      if (pad) zoom.apply(v, f, w, h);
      // A result shown over the picture: same place, same size, same zoom.
      var pane = pad && v.querySelector(".s-pane");
      if (pane) { ["left", "top", "width", "height", "transform", "transformOrigin"].forEach(function (q) { pane.style[q] = f.style[q]; });
        pane.classList.toggle("s-flh", f.classList.contains("s-flh")); pane.classList.toggle("s-flv", f.classList.contains("s-flv")); pane.style.setProperty("--zr", f.style.getPropertyValue("--zr")); }
      // The "Variation 1 of 2" pill sits on the picture, near its bottom edge.
      // Add / Export float at the picture's bottom-right corner.
      var ra = pad && v.querySelector(":scope > .s-ra");
      if (ra) { ra.style.left = "auto"; ra.style.right = Math.max(8, Math.round(W - (f.offsetLeft + fw) + 12)) + "px"; ra.style.top = Math.max(8, Math.round(f.offsetTop + fh - 46)) + "px"; }
      var busy = pad && v.querySelector(":scope > .s-busy");
      if (busy) { busy.style.bottom = "auto"; busy.style.top = Math.max(8, Math.round(f.offsetTop + fh - 52)) + "px"; }
    });
  }

  function gb(n) { return n >= 10 ? Math.round(n) + " GB" : (Math.round(n * 10) / 10) + " GB"; }

  // Which image model makes the pictures: FLUX 3, or Qwen Image Edit (experimental).
  function engineChoice(st, running) {
    var e = st.engine_choice === "qwen21" && st.qwen21 ? "qwen21" : st.engine_choice === "qwenedit" && st.qwenedit ? "qwenedit" : "flux3";
    return '<div class="s-engines s-engines3"><button type="button" class="s-tier' + (e === "flux3" ? " on" : "") + '" data-su="engine" data-e="flux3"' + (st.flux3 ? "" : " disabled") + '><b>FLUX 3</b><small>' + (st.flux3 ? "Fast, follows the drawing closely" : "Not downloaded (Image model below)") + '</small></button>' +
      '<button type="button" class="s-tier' + (e === "qwenedit" ? " on" : "") + '" data-su="engine" data-e="qwenedit"' + (st.qwenedit ? "" : " disabled") + '><b>Qwen Image Edit 2511</b><small>' +
      (st.qwenedit ? "Understands context: new views, scene changes" : "Not downloaded yet") + "</small></button>" +
      '<button type="button" class="s-tier' + (e === "qwen21" ? " on" : "") + '" data-su="engine" data-e="qwen21"' + (st.qwen21 ? "" : " disabled") + '><b>Qwen-Image 2.1 <em class="s-opt">new</em></b><small>' +
      (st.qwen21 ? "Renders that stay on your sketch. 3D views use 2511" : "Not downloaded yet") + "</small></button></div>" +
      (st.qwen21 ? "" : '<div class="s-row"><div class="n"><b>Qwen-Image 2.1</b><small>Newer Qwen with a Consistency LoRA and a sketch ControlNet: the render keeps your sketch\'s lines, proportions and frame.</small></div><span class="s-pill">22 GB</span>' +
        '<button type="button" class="s-btn p" data-su="get-qwen21"' + (running ? " disabled" : "") + ">Download</button></div>") +
      (st.qwenedit ? "" : '<div class="s-row"><div class="n"><b>Qwen Image Edit 2511</b><small>Reads the picture itself, so it understands what a sketch shows and what a change means. About a minute a picture.</small></div><span class="s-pill">31 GB</span>' +
        '<button type="button" class="s-btn p" data-su="get-qwenedit"' + (running ? " disabled" : "") + ">Download</button></div>") +
      (st.workflow ? '<div class="s-row"><div class="n"><b>Your ComfyUI workflow</b><small>Ready. FLUX.2 Klein 9B + Klein-consistency 0.8, 2 MP, 4 steps: used for renders, light, materials and edits in a selection.</small></div></div>' :
        '<div class="s-row"><div class="n"><b>Your ComfyUI workflow</b><small>FLUX.2 Klein 9B + Klein-consistency 0.8, exactly as in your ComfyUI. ' +
        (st.klein9 ? "Klein 9B found. " : "Klein 9B: copy flux-2-klein-9b-fp8mixed.safetensors into Models\\diffusion_models (free sign-in at huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8). ") +
        '</small></div>' + (st.consist ? "" : '<span class="s-pill">0.3 GB</span><button type="button" class="s-btn p" data-su="get-workflow"' + (running ? " disabled" : "") + ">Download</button>") + "</div>") +
      (st.fibo ? '<div class="s-row"><div class="n"><b>Fibo 2.0 <em class="s-opt">testing</em></b><small>Ready. Used for design requests (imagine, inspired by, redesign, variations).</small></div></div>' :
        '<div class="s-row"><div class="n"><b>Fibo 2.0 <em class="s-opt">testing</em></b><small>Bria\'s 8B model: imagines new designs from short requests. Non-commercial licence.</small></div><span class="s-pill">13 GB</span>' +
        '<button type="button" class="s-btn p" data-su="get-fibo"' + (running ? " disabled" : "") + ">Download</button></div>") +
      (!st.qwenedit ? "" : st.angles ? '<div class="s-row"><div class="n"><b>Camera angles</b><small>Helps 3D views turn to the view you chose. Ready.</small></div></div>' :
        '<div class="s-row"><div class="n"><b>Camera angles</b><small>Helps 3D views turn to the view you chose (outside views).</small></div><span class="s-pill">0.3 GB</span>' +
        '<button type="button" class="s-btn p" data-su="get-qwenedit"' + (running ? " disabled" : "") + ">Download</button></div>");
  }
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
  // Mac: Light / Studio / Pro by memory. A Mac's memory never changes, so the
  // setups above it are greyed out; the highest one that fits is suggested.
  function macPick(st) {
    var p = S.pickTier, ok = (st.mac.tiers || []).filter(function (x) { return x.key === p && x.allowed; })[0];
    return ok ? p : st.mac.tier;
  }
  // Mac: the other render model, to compare (Create shows a picker once both are here).
  function macModelRows(st, running) {
    return (st.mac.engines || []).filter(function (x) { return x.key !== "mage" && (x.key !== st.mac.engine || !x.ready); }).map(function (x) {
      var size = x.key === "mage" ? "9.8 GB" : "5.8 GB";
      var about = x.key === "mage" ? "Microsoft's editor: follows instructions closely, fast." : "FLUX.2 Klein 4B: another look, a little slower.";
      return '<div class="s-row"><div class="n"><b>' + esc(x.label) + ' (second render model)</b><small>' + about + ' Pick it in Create under Render model.</small></div><span class="s-pill">' + size + "</span>" +
        (x.ready ? '<span class="s-ok">Ready</span>' : '<button type="button" class="s-btn p" data-su="get-mac-model" data-m="' + x.key + '"' + (running ? " disabled" : "") + ">Download</button>") + "</div>";
    }).join("");
  }
  // Smart reading: the picture reader works out what the words ask for before each run.
  function smartRow(st, running, mac) {
    var on = st.smart_read !== false;
    return '<div class="s-row"><div class="n"><b>Smart reading</b><small>Before each run, the picture reader works out what the picture is (sketch, render, photo) and what you ask for (render, relight, edit, new scene, new view, restyle), so the prompt fits. Adds about ' + (mac ? "10–20" : "3–5") + " seconds." +
      (st.reader_ready || st.reader_xl_ready ? "" : " Needs the picture reader (" + (mac ? "2.6 GB" : "below") + ").") + '</small></div>' +
      (st.reader_ready || st.reader_xl_ready ? '<button type="button" class="s-btn' + (on ? " p" : "") + '" data-su="smart">' + (on ? "On" : "Off") + "</button>" :
        (mac ? '<button type="button" class="s-btn p" data-su="get-reader"' + (running ? " disabled" : "") + ">Download</button>" : "")) + "</div>";
  }
  // Optional downloads, folded away: Studio works without them (Nov 2026).
  function extras(rows) {
    return '<details class="s-extras"' + (S.extrasOpen ? " open" : "") + '><summary>Optional extras <small>for advanced use · Studio works without them</small></summary>' +
      '<div class="s-list">' + rows + "</div></details>";
  }
  // Settings: the picked setup isn't downloaded -> one button gets all of it.
  function macSwitch(st, running) {
    if (st.create_ready || !st.mac.can_generate) return "";
    if (running) return progressHTML();
    var cur = (st.mac.tiers || []).filter(function (x) { return x.key === st.mac.tier; })[0] || {};
    var need = st.files.filter(function (f) { return !f.ready; }).reduce(function (a, f) { return a + f.gb; }, 0);
    return '<button type="button" class="s-go m-switch" data-su="download"><span>Download ' + esc(cur.name || "") + " · " + gb(need) + "</span></button>" +
      (S.setup.error ? '<div class="s-err">' + esc(S.setup.error) + "</div>" : "");
  }
  function macTierCards(st) {
    var pick = macPick(st);
    return '<div class="m-tiers">' + (st.mac.tiers || []).map(function (x) {
      var off = !x.allowed;
      return '<button type="button" class="m-tier' + (x.key === pick ? " on" : "") + (off ? " off" : "") + '" data-su="tier" data-t="' + x.key + '"' + (off ? " disabled" : "") + ">" +
        (x.recommended ? '<span class="m-rec">Recommended</span>' : "") +
        '<small class="m-range">' + esc(x.range) + "</small><b>" + esc(x.name) + "</b><small>" + esc(x.speed) + "</small>" +
        "<ul>" + x.has.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + x["not"].map(function (t) { return '<li class="no">' + esc(t) + "</li>"; }).join("") + "</ul>" +
        '<span class="m-foot"><span>' + (off ? "" : x.ready ? "Downloaded" : gb(x.gb) + " download") + "</span><span>" +
        (off ? (x.engine === "mage" && !st.mac.mage_supported && st.mac.ram >= x.min ? "Needs macOS 26.2+" : "Needs more memory") : x.key === st.mac.tier && st.create_ready ? "In use" : "Fits") + "</span></span></button>";
    }).join("") + "</div>";
  }

  // -- online (Nov 2026): Nano Banana with your own Google key; Vistiq Plus comes later (shown, not active) --
  // -- the usage pill (bottom centre) and its panel --------------------------------
  function usageRender() {
    var el = $("s-usage"); if (!el) return;
    var o = (S.status && S.status.online) || {}, u = o.usage || {}, own = !!o.on, loc = !!(S.status && S.status.local_ready);
    if (!own && !loc) { el.innerHTML = ""; return; }
    var pill = own
      ? '<button type="button" class="su-pill" data-us="t"><i class="d on"></i>Own key · <b>' + money(u.usd) + "</b>" + (o.limit ? " of $" + o.limit : "") + " this month" + svg("chev") + "</button>"
      : '<button type="button" class="su-pill" data-us="t"><i class="d"></i>Local · <b>' + (S.month ? S.month.local : "–") + "</b> pictures this month" + svg("chev") + "</button>";
    var h = pill;
    if (S.usageOpen) {
      var E = o.engines || {}, st = E.standard || { usd: { "1K": 0.0336, "2K": 0.0504 } }, pr = E.pro || { usd: { "1K": 0.134 } };
      h += '<div class="su-pan" role="dialog" aria-label="Making images">';
      if (own) {
        var left = Math.max(0, (o.limit || 0) - (u.usd || 0)), pct = o.limit ? Math.min(100, 100 * (u.usd || 0) / o.limit) : 0, by = u.by || {};
        var row = function (k, lab) { var b = by[k] || { n: 0, usd: 0 }; return "<tr><td>" + lab + "</td><td>" + b.n + "</td><td>" + money(b.usd) + "</td></tr>"; };
        h += '<div class="su-hd"><b>Making images</b><span class="su-tag">Own key</span><small>resets 1st of the month</small></div>' +
          '<div class="su-row"><span><b>' + money(left) + "</b> left of your $" + (o.limit || 0) + ' limit</span><span>' + money(u.usd) + " used</span></div>" +
          '<div class="su-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="su-tiles"><div><small>≈ Standard 1K</small><b>' + Math.floor(left / st.usd["1K"]) + '</b></div><div><small>≈ Standard 2K</small><b>' + Math.floor(left / st.usd["2K"]) +
          '</b></div><div><small>≈ Pro</small><b>' + Math.floor(left / pr.usd["1K"]) + "</b></div></div>" +
          '<table class="su-t"><tr><th>This month</th><th>Pictures</th><th>Cost</th></tr>' + row("standard", "Standard") + row("pro", "Pro") + "</table>" +
          '<div class="su-lim"><span>Monthly limit</span><span class="su-in">$<input type="number" min="1" step="1" value="' + (o.limit || 10) + '" data-us="lim"></span><small>Online pictures stop here. Vistiq counts; Google bills your key.</small></div>' +
          '<div class="su-btns"><button type="button" class="su-p" data-us="bill">Add balance</button><button type="button" class="su-g" data-us="settings">Key settings</button></div>' +
          '<div class="su-plus off"><div><b>Vistiq Plus</b><small>from €10/month · 150 credits · coming soon</small></div><button type="button" class="su-p" disabled>Subscribe</button></div>';
      } else {
        h += '<div class="su-hd"><b>Making images</b><span class="su-tag">On this computer</span></div>' +
          '<div class="su-tiles"><div><small>This month</small><b>' + (S.month ? S.month.local : "–") + '</b><small>pictures</small></div><div><small>Cost</small><b>€0</b><small>free, offline</small></div><div><small>Upscaling</small><b>Free</b><small>up to 16K</small></div></div>' +
          '<p class="su-q">Want Nano Banana online — stronger at new designs and light?</p>' +
          '<div class="su-plus"><div><b>Your own key</b><small>Use your Google AI Studio key · Google bills you</small></div><button type="button" class="su-g" data-us="settings">Add my key</button></div>' +
          '<div class="su-plus off"><div><b>Vistiq Plus</b><small>from €10/month · 150 credits · coming soon</small></div><button type="button" class="su-p" disabled>Subscribe</button></div>';
      }
      h += "</div>";
    }
    if (el.getAttribute("data-h") !== h) { el.setAttribute("data-h", h); el.innerHTML = h; }
  }
  function usageClick(e) {
    var b = e.target.closest("[data-us]"); if (!b) return;
    var a = b.getAttribute("data-us");
    if (a === "t") {
      S.usageOpen = !S.usageOpen;
      if (S.usageOpen && api() && api().studio_month) api().studio_month().then(function (m) { S.month = m; usageRender(); });
      usageRender(); return;
    }
    if (a === "bill") { var u = "https://aistudio.google.com/usage"; if (api() && api().open_url) api().open_url(u); else window.open(u); return; }
    if (a === "settings") { S.usageOpen = false; usageRender(); go("settings"); return; }
  }
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.matches || !t.matches('#s-usage [data-us="lim"]')) return;
    var v = Math.max(1, parseFloat(t.value) || 10);
    api().studio_online_set(null, v).then(function () { if (S.status && S.status.online) S.status.online.limit = v; usageRender(); toast("Monthly limit: $" + v); });
  });

  function money(x) { return "$" + (Math.round((x || 0) * 100) / 100).toFixed(2); }
  function keyCard(compact) {
    var o = (S.status && S.status.online) || {}, u = o.usage || {};
    var h = '<div class="s-oc' + (o.has_key ? " on" : "") + '"><div class="s-och"><b>Your own key</b>' +
      (o.has_key ? '<span class="s-octag ok">' + (o.on ? "● In use" : "Off") + "</span>" : '<span class="s-octag">Advanced</span>') +
      (o.has_key ? '<button type="button" class="s-tgl' + (o.on ? " on" : "") + '" data-su="nb-toggle" title="Use online pictures"></button>' : "") + "</div>" +
      "<small>Nano Banana with your Google AI Studio key: Standard (Nano Banana 2.1) and Pro. Google bills you directly; the key stays on this computer.</small>";
    if (o.has_key) {
      h += '<div class="s-ocr"><span>Google key</span><code>' + esc(o.key_hint || "••••") + '</code><span class="s-ok">✓ Works</span><button type="button" class="s-btn" data-su="nb-remove">Remove</button></div>' +
        '<div class="s-ocr"><span>This month</span><i class="s-ocbar"><u style="width:' + Math.min(100, o.limit ? 100 * (u.usd || 0) / o.limit : 0) + '%"></u></i><small>' + (u.n || 0) + " pictures · about " + money(u.usd) + " at Google's prices</small></div>" +
        '<div class="s-ocr"><span>Limit</span><input type="number" min="0" step="1" data-nblimit value="' + (o.limit || 0) + '"><small>USD a month: online pictures stop there (Vistiq counts, Google bills)</small></div>';
    } else {
      h += '<div class="s-ocr"><input type="password" data-nbkey placeholder="Paste your Google AI Studio key (AIza…)" autocomplete="off"><button type="button" class="s-btn p" data-su="nb-add">Add my key</button></div>' +
        '<small class="s-ocg">No key yet? <button type="button" class="s-link" data-su="nb-guide">Get one at aistudio.google.com</button> › sign in › Get API key (2 minutes, needs billing set up at Google for image models).</small>';
    }
    if (S.nbMsg) h += '<div class="s-err">' + esc(S.nbMsg) + "</div>";
    return h + "</div>";
  }
  function plusCard() {
    return '<div class="s-oc s-plus off"><div class="s-och"><b>Vistiq Plus</b><span class="s-octag">Coming soon</span><span class="s-ocp">from €10<small>/month</small></span></div>' +
      "<small>No key, no download: Nano Banana online with credits every month. 150 credits ≈ 150 Standard 1K · 100 Standard 2K · 37 Pro pictures. " +
      "Up to 2K on Plus (4K with the free upscaler on your PC). Top up any time, cancel any time.</small>" +
      '<button type="button" class="s-btn" disabled>Not available yet</button></div>';
  }
  function welcome() {
    var st = S.status, m = S.mstats || {}, g = m.gpu;
    var spec = '<div class="s-wspec"><span><small>Graphics card</small><b>' + (g ? esc(g.name) + " · " + Math.round(g.total) + " GB" : "—") + "</b></span>" +
      "<span><small>Memory</small><b>" + (m.ram ? m.ram.total + " GB" : "—") + "</b></span>" +
      "<span><small>Free disk</small><b>" + (st.free_gb != null ? Math.round(st.free_gb) + " GB" : "—") + "</b></span>" +
      (g && g.total >= 12 ? '<em class="ok">✓ Runs everything on this computer</em>' : g ? '<em>Smaller card: Good quality fits</em>' : "") + "</div>";
    return '<div class="s-wel"><h1>Welcome. Let\'s set up Vistiq for this computer.</h1><p>We checked what this computer can run. Pick a way to make images; you can add the others any time in Settings.</p>' + spec;
  }
  // The first start (Nov 2026): three ways side by side, like the person's mockup.
  function welcomePage() {
    var st = S.status, m = S.mstats || {}, g = m.gpu, mac = st.mac;
    var t = S.pickTier || st.chosen || st.tier || "best", err = S.setup.error ? '<div class="s-err">' + esc(S.setup.error) + "</div>" : "";
    var need, name;
    if (mac) { var mt = macPick(st), cur = (mac.tiers || []).filter(function (x) { return x.key === mt; })[0] || {};
      need = cur.ready ? 0 : st.files.filter(function (f) { return !f.ready; }).reduce(function (a, f) { return a + f.gb; }, 0) + (st.select_ready ? 0 : 0.1); name = cur.name || ""; }
    else { need = setupGB(st, t); name = TIER_TEXT[t] ? TIER_TEXT[t][0] : ""; }
    var big = mac ? mac.can_generate : !g || g.total >= 12;
    var ck = function (on, txt) { return '<li class="' + (on ? "y" : "d") + '"><i>' + (on ? "✓" : "·") + "</i>" + txt + "</li>"; };
    var spec = '<div class="w-spec">' + (mac ? '<span><small>Chip</small><b>' + esc(mac.chip) + "</b></span><span><small>Memory</small><b>" + mac.ram + " GB</b></span>" :
      '<span><small>Graphics card</small><b>' + (g ? esc(g.name) + " · " + Math.round(g.total) + " GB" : "Checking…") + "</b></span><span><small>Memory</small><b>" + (m.ram ? m.ram.total + " GB" : "—") + "</b></span>") +
      "<span><small>Free disk</small><b>" + (st.free_gb != null ? Math.round(st.free_gb) + " GB" : "—") + "</b></span>" +
      "<span><small>System</small><b>" + (mac ? "macOS" : "Windows") + "</b></span>" +
      (big ? '<em class="ok">✓ Runs everything locally</em>' : '<em>Smaller ' + (mac ? "Mac" : "graphics card") + ": online is the better fit</em>") + "</div>";
    var o = st.online || {};
    var local = '<div class="w-card' + (big ? " rec" : "") + '"><span class="w-tag' + (big ? " rec" : "") + '">' + (big ? "Recommended for this computer" : "Free") + "</span><h2>On this computer</h2>" +
      "<p>Free, offline and private. Your pictures never leave the " + (mac ? "Mac" : "PC") + ".</p><ul>" +
      ck(1, "Sketch to render, materials, light, views") + ck(1, "Selections, board, Photoshop / Affinity live") + ck(1, "Upscale up to 16K") +
      ck(0, (mac ? esc(name) + " package for this Mac" : esc(name) + " package" + (g ? " for " + Math.round(g.total) + " GB cards" : ""))) + "</ul>" +
      (mac ? macTierCards(st) : "") + (!mac ? '<div class="w-tiers">' + ["best", "good"].map(function (k) { return '<button type="button" class="s-tier' + (t === k ? " on" : "") + '" data-su="tier" data-t="' + k + '"><b>' + TIER_TEXT[k][0] + "</b><small>about " + gb(setupGB(st, k)) + "</small></button>"; }).join("") + "</div>" : "") +
      '<button type="button" class="w-btn grad" data-su="download">Download · ' + gb(need) + "</button><small class=\"w-sub\">runs in the background · resumes after a restart</small>" + err + "</div>";
    var plus = '<div class="w-card off"><span class="w-tag g">No download</span><h2>Vistiq Plus</h2><p>Nano Banana online — the strongest at new designs and lighting. Works on any computer.</p>' +
      '<div class="w-price">from €10 <small>/ month · 150 credits included</small></div><ul>' +
      ck(1, "Standard 1 credit · Pro 4 credits") + ck(1, "≈ 150 Standard 1K · 100 Standard 2K · 37 Pro") + ck(1, "Up to 2K · Upscaling stays free on your PC") + "</ul>" +
      '<button type="button" class="w-btn dark" disabled>Coming soon</button><small class="w-sub">pay with PayPal or card</small></div>';
    var keyc = '<div class="w-card"><span class="w-tag n">Advanced</span><h2>Your own key</h2><p>Already have a Google AI Studio key? Use Nano Banana with it and pay Google directly.</p><ul>' +
      ck(1, "No subscription") + ck(0, "You manage billing at Google") + ck(0, "The key stays on this computer") + "</ul>" +
      (S.keyOpen ? '<input type="password" class="w-key" data-nbkey placeholder="Paste your key (AIza…)" autocomplete="off">' +
        '<button type="button" class="w-btn light" data-su="nb-add">Add my key</button><small class="w-sub">No key yet? <button type="button" class="s-link" data-su="nb-guide">aistudio.google.com</button> › Get API key</small>'
        : '<button type="button" class="w-btn light" data-su="nb-open">Add my key</button><small class="w-sub">2-minute guide included</small>') +
      (S.nbMsg ? '<div class="s-err">' + esc(S.nbMsg) + "</div>" : "") + "</div>";
    return '<div class="w-page"><div class="w-logo"><i></i>VISTIQ STUDIO</div><h1>Welcome. Let\'s set up Vistiq for this computer.</h1>' +
      "<p class=\"w-lead\">We checked what your computer can run. Pick one way to make images — you can add the others any time in Settings.</p>" + spec +
      '<div class="w-cards">' + local + plus + keyc + "</div>" +
      '<div class="w-foot"><span class="w-up"><i>✓</i>The free upscaler comes with every option — needed for <b>Upscale</b></span>' +
      (st.comfy_models || true ? '<span><button type="button" class="s-link" data-su="take-other">Have the files already?</button> · <button type="button" class="s-link" data-su="skip-setup">Skip for now ›</button></span>' : "") + "</div></div>";
  }
  function setupCard() {
    var st = S.status, running = !!S.setup.run;
    if (!running && !(S.setup.done && st.tier && !st.mac && tierFiles(st, S.pickTier || st.chosen || st.tier).some(function (f) { return !f.ready && !f.can_download; }))) return welcomePage();
    var t = S.pickTier || st.chosen || st.tier || "";
    var err = S.setup.error ? '<div class="s-err">' + esc(S.setup.error) + "</div>" : "";
    var h = '<div class="s-su"><h1>Set up Vistiq Studio</h1>';
    if (st.mac && !running) {
      var mt = macPick(st), cur = (st.mac.tiers || []).filter(function (x) { return x.key === mt; })[0] || {};
      var need = cur.ready ? 0 : st.files.filter(function (f) { return !f.ready; }).reduce(function (a, f) { return a + f.gb; }, 0);
      h += '<div class="s-oc s-local rec"><div class="s-och"><b>On this Mac</b><span class="s-octag rec">Free · offline</span></div>' +
        "<p>We checked your Mac and suggest the fastest setup it can run. Only that setup's files are downloaded; after that everything runs on this Mac, also without internet.</p>" +
        '<div class="m-hw"><span>' + esc(st.mac.chip) + "</span><span>" + st.mac.ram + " GB memory</span></div>" +
        macTierCards(st) +
        (st.mac.can_generate ? "" : '<div class="s-err">Image generation needs a Mac with 16 GB of memory or more. Upscaling and the rest still work.</div>') +
        '<button type="button" class="s-go" style="height:50px" data-su="download"><span>Download ' + esc(cur.name || "") + " · " + gb(need + (st.select_ready ? 0 : 0.1)) + "</span></button>" + err +
        '</div><div class="s-wcards s-wmac">' + plusCard() + keyCard() + '</div><p class="s-wskip"><button type="button" class="s-link" data-su="skip-setup">Skip for now ›</button></p></div>';
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
        h = '<div class="s-su s-wwrap">' + welcome() + '<div class="s-wcards"><div class="s-oc s-local rec"><div class="s-och"><b>On this computer</b><span class="s-octag rec">Recommended</span></div>' +
          "<small>Free, offline and private. Your pictures never leave this PC.</small>" +
        "<p>A one-time setup. After that everything runs on this PC, also without internet. Pick one; you can switch later in Settings.</p>" +
          '<div class="s-tiers">' + ["best", "good"].map(function (k) {
            return '<button type="button" class="s-tier' + (t === k ? " on" : "") + '" data-su="tier" data-t="' + k + '"><b>' + TIER_TEXT[k][0] +
              (st.tiers[k].ready ? ' <span class="s-ok">Ready</span>' : "") + "</b><small>" + TIER_TEXT[k][1] + "</small><em>about " + gb(setupGB(st, k)) + "</em></button>";
          }).join("") + "</div>" +
          '<button type="button" class="s-go" style="height:50px" data-su="download"' + (t ? "" : " disabled") + "><span>Set up</span></button>" + err +
          "</div>" + plusCard() + keyCard() + "</div>" +
          '<p class="s-wskip"><button type="button" class="s-link" data-su="skip-setup">Skip for now ›</button></p>';
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
    var readerRow = '<div class="s-row"><div class="n"><b>Picture reader (optional)</b><small>Reads a reference picture\'s camera, light and style into words, so Create can follow them.</small></div><span class="s-pill">2.6 GB</span>' +
      (st.reader_ready ? '<span class="s-ok">Ready</span>' : '<button type="button" class="s-btn p" data-su="get-reader"' + (running ? " disabled" : "") + ">Download</button>") + "</div>";
    readerRow += '<div class="s-row"><div class="n"><b>Picture reader XL (optional)</b><small>A bigger reader that understands sketches far better (what each drawn part is). Used instead of the small one once it is here.</small></div><span class="s-pill">6.2 GB</span>' +
      (st.reader_xl_ready ? '<span class="s-ok">Ready</span>' : '<button type="button" class="s-btn p" data-su="get-reader-xl"' + (running ? " disabled" : "") + ">Download</button>") + "</div>";
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
      '<div class="s-sec">Online models</div><div class="s-ocs">' + keyCard() + plusCard() + "</div>" +
      '<div class="s-sec">Vistiq Studio folder</div>' +
      '<button type="button" class="s-folder" data-su="home"><code>' + esc(st.home) + "</code><em>Change</em></button>" +
      '<p class="s-hint"><b>Outputs</b> every result, by date · <b>Models</b> the model files · <b>Models/loras</b> your own styles</p>' +
      '<div class="s-btns"><button type="button" class="s-btn" data-su="outputs">Open Outputs</button><button type="button" class="s-btn" data-su="models">Open Models</button>' +
      '<button type="button" class="s-btn" data-su="take-other"' + (running ? " disabled" : "") + ">Take files from a folder…</button>" +
      (st.comfy_models ? '<button type="button" class="s-btn" data-su="take" data-path="' + esc(st.comfy_models) + '"' + (running ? " disabled" : "") + ">Take from my ComfyUI</button>" : "") + "</div>" +
      progressHTML() +
      (st.mac ? '<div class="s-sec">Setup</div><p class="s-hint">Pick a setup to switch. One that isn\'t downloaded yet downloads with one click.</p>' + macTierCards(st) + macSwitch(st, running) : "") +
      (st.mac ? '<div class="s-sec">This Mac</div><p class="s-hint">' + esc(st.mac.chip) + " · " + st.mac.ram + " GB memory · creates at up to " + st.mac.work_side + " px, upscales up to " + st.mac.max_side + " px" +
        (st.mac.can_generate ? "" : " · image generation needs 16 GB or more") + '</p><div class="s-list">' + fileRows(st.files) + selectRow + "</div>" + extras(macModelRows(st, running) + smartRow(st, running, true) + helperRow) : "") +
      // shown even without FLUX 3: a PC can run on Qwen Image Edit alone (Nov 2026, new office PC)
      (st.mac ? "" : '<div class="s-sec">Image model</div><p class="s-hint">Qwen Image Edit makes Create, Instant render and 3D views. FLUX 3 is optional.</p>' + engineChoice(st, running)) +
      (st.mac ? "" : '<div class="s-sec">Quality</div><div class="s-tiers">' + ["best", "good"].map(function (k) {
        var tt = st.chosen || st.tier;
        return '<button type="button" class="s-tier' + (tt === k ? " on" : "") + '" data-su="tier" data-t="' + k + '"' + (running ? " disabled" : "") + "><b>" + TIER_TEXT[k][0] +
          (st.tiers[k].ready ? ' <span class="s-ok">Ready</span>' : "") + "</b><small>" + TIER_TEXT[k][1] + "</small></button>";
      }).join("") + "</div>" +
      '<div class="s-list">' + fileRows(tierFiles(st, st.chosen || st.tier || "best").concat(st.files.filter(function (f) { return f.key === "consistency" && (st.chosen || st.tier || "best") === "best"; }))) + selectRow + "</div>" + extras(smartRow(st, running, false) + helperRow + readerRow) +
      (function () { var miss = setupGB(st, st.chosen || st.tier || "best") - (st.engine_installed ? 0 : 2.1) - (st.select_ready ? 0 : 0.1);
        return miss > 0.05 && !running ? '<div class="s-btns"><button type="button" class="s-btn p" data-su="download">Download (' + gb(miss) + ")</button>" +
          '<button type="button" class="s-btn" data-su="download-all" title="The engine, the image models, Qwen Image Edit, both picture readers, the prompt helper, Select and the magic eraser, one after another">Download everything (about 55 GB)</button></div>' : ""; })()) +
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
      el.querySelectorAll(".s-extras").forEach(function (d) { d.addEventListener("toggle", function () { S.extrasOpen = d.open; }); });
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
    var asv = f === "assets";
    g.hidden = asv; $("l-assets").hidden = !asv; $("l-open").textContent = asv ? "Open Assets folder" : "Open folder";
    if (asv) { $("l-sub").textContent = "References and prompts to use in Create · " + ((S.assets && S.assets.dir) || "Vistiq Studio\\Assets") + " · add folders and pictures there"; renderAssets(); return; }
    if (g.getAttribute("data-h") !== h) { g.innerHTML = h; g.setAttribute("data-h", h); }
  }
  // -- Assets (Nov 2026): Documents\Vistiq Studio\Assets — one folder per category, plus prompts ------
  function loadAssets(then) {
    if (!api() || !api().studio_assets) return;
    if (!S.assets) S.assets = { loading: true, cats: [], prompts: [] };
    api().studio_assets().then(function (a) { S.assets = a || { cats: [], prompts: [] }; render(); if (then) then(); });
  }
  function assetGrid(cat, pick) {
    var A = S.assets || { cats: [] }, cats = A.cats.filter(function (c) { return c.items.length; });
    var all = [].concat.apply([], cats.map(function (c) { return c.items.map(function (i) { return Object.assign({ cat: c.name }, i); }); }));
    var items = cat && cat !== "All" ? (cats.filter(function (c) { return c.name === cat; })[0] || { items: [] }).items : all;
    var chips = '<div class="as-chips">' + ["All"].concat(cats.map(function (c) { return c.name; })).map(function (n) {
      var k = n === "All" ? all.length : (cats.filter(function (c) { return c.name === n; })[0] || { items: [] }).items.length;
      return '<button type="button" data-ac="' + esc(n) + '"' + ((cat || "All") === n ? ' class="on"' : "") + ">" + esc(n) + " <small>" + k + "</small></button>";
    }).join("") + "</div>";
    var grid = items.length ? '<div class="as-grid">' + items.map(function (i) {
      return '<div class="as-card" data-apath="' + esc(i.path) + '" title="' + esc(i.name + (i.desc ? " · " + i.desc : "")) + '"><img src="' + i.thumb + '" alt="" loading="lazy">' +
        (pick ? '<span class="as-add">+ Reference</span>' : '<div class="as-hover"><button type="button" data-aact="ref">Use as reference</button><button type="button" data-aact="edit">Open in Create</button><button type="button" data-aact="folder">Folder</button></div>') +
        "</div>";
    }).join("") + "</div>" : '<div class="s-none">' + (A.loading ? "Loading…" : "No pictures here yet. Put pictures in the Assets folder, one folder per category.") + "</div>";
    return chips + grid;
  }
  function renderAssets() {
    var A = S.assets || {}, el = $("l-assets");
    var pr = (A.prompts || []).map(function (p, i) {
      return '<button type="button" class="as-pr" data-apr="' + i + '"><span><b>' + esc(p.name) + "</b><em>" + esc(p.cat) + (p.mine ? " · mine" : "") + "</em></span><small>" + esc(p.text) + "</small></button>";
    }).join("");
    var h = assetGrid(S.assetCat, false) + '<div class="as-sec">Prompts <small>Click one to use it in Create · save your own from Create › Save prompt</small></div>' +
      (pr ? '<div class="as-prs">' + pr + "</div>" : '<div class="s-none">No prompts yet. Save one from Create, or add Prompts.txt to the Assets folder.</div>');
    if (el.getAttribute("data-h") !== h) { el.innerHTML = h; el.setAttribute("data-h", h); }
  }
  function usePrompt(text) {
    var p = S.create; p.text = text; p.viewing = false; var box = $("c-text"); if (box) box.value = text; go("create"); toast("Prompt in Create");
  }
  // Create › References › Browse assets: the same pictures as a picker.
  function assetPicker(anchor) {
    var show = function () {
      closePop();
      var m = document.createElement("div"); m.className = "as-modal"; m.id = "as-modal";
      m.innerHTML = '<div class="as-dlg" role="dialog" aria-label="Assets"><div class="as-h"><b>Assets</b><small>Click a picture to add it as a reference (up to 6)</small><button type="button" class="as-x" data-asx>×</button></div><div class="as-body"></div></div>';
      document.body.appendChild(m);
      var paint = function () { m.querySelector(".as-body").innerHTML = assetGrid(S.assetCat, true); };
      paint();
      m.addEventListener("click", function (e) {
        if (e.target === m || e.target.closest("[data-asx]")) { m.remove(); return; }
        var b = e.target.closest("[data-ac]"); if (b) { S.assetCat = b.getAttribute("data-ac"); paint(); return; }
        var c = e.target.closest("[data-apath]");
        if (c) {
          if ((S.create.refs || []).length >= 6) { toast("Six references at most: remove one first"); return; }
          api().studio_image(c.getAttribute("data-apath")).then(function (info) { addRef(info); toast("Added · pick what to take from it under the picture"); });
          c.classList.add("on");
        }
      });
    };
    loadAssets(show);                // read the folder again each time: new folders and pictures show at once
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
      if (kind === "studio-online") { if (S.status && S.status.online) S.status.online.usage = data.usage; statsLoop(); render(); return; }
      if (kind === "studio-sel") { S.psSel = data.on ? data : null; render(); return; }
      if (kind === "studio-note") { S.create.note = data.message; render(); return; }
      if (kind === "studio-engine") S.engine = data;
      else if (kind === "studio-job") {
        var p = byJob(data.id);
        if (!p) return;
        if (data.state === "running") { p.stage = data.stage; if (data.fraction != null) stepIn(p, data.fraction); if (data.estimate) p.estimate = data.estimate; if (!p.started) p.started = Date.now(); }
        else {
          p.job = null; p.pending = 0; p.stage = ""; p.frac = 0; p.raw = null; p.rawAt = 0; p.stepSize = 0; p.stepDur = 0; p.started = 0; p.estimate = 0; p.preview = null; p.previewN = 0;
          // The run is over: live takes over again with the newest sketch.
          if (p === S.create && p.source === "live" && p.src && p.src.frozen) {
            var keepSel2 = p.sel; if (p.liveSrc) p.src = p.liveSrc; p.sel = keepSel2;
          }
          p.error = data.state === "error" ? (data.message || "Something went wrong.") : (p.note || "");
          p.note = "";
          // the next queued run starts by itself (a cancel clears the queue)
          if (p.queue && p.queue.length) {
            if (data.state === "cancelled" || /cancel/i.test(data.message || "")) p.queue = [];
            else { var nx = p.queue.shift(), pid = p === S.create ? "c" : "r"; setTimeout(function () { if (!p.job) startJob(pid, p, nx.j); }, 300); }
          }
        }
      } else if (kind === "studio-preview") {
        var pv = byJob(data.id); if (!pv) return;
        // In-between steps look messy: only the blurred picture and the ring show while making.
        return;
      } else if (kind === "studio-note") {
        toast(data.text || "");
      } else if (kind === "studio-result") {
        var q = byJob(data.id); if (!q) return;
        data.result.srcKey = q.jobKey; data.result.orig = q.jobOrig; data.result.made = Date.now(); data.result.run = data.result.run || runOf(data.result); q.results.push(data.result);
        if (q === S.create && window.VS3D) window.VS3D.onResult(data.result);       // a 3D view: shown on the 3D page too
        q.preview = null; q.previewN = 0; q.pending = Math.max(0, q.pending - 1); q.jobDone = (q.jobDone || 0) + 1;
        // Watching the run: each new result comes into view as it lands.
        if (q.follow !== false) q.sel = q.results.length - 1;
        // 4K: the 2K render goes to Upscale (×2) to finish at 4K.
        if (q === S.create && q.jobRes === "4k" && q.jobDone === 1 && api().studio_to_upscale) {
          api().studio_to_upscale(data.result.path); toast("4K: the render is in Upscale, ready to finish at 4K");
        }
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
      } else if (kind === "studio-uploading") {
        // A picture on its way to the board: show where it will land, with a bar.
        if (data.target === "board" && window.VSBoard) {
          if (data.failed) window.VSBoard.upFail(data.token);
          else {
            window.VSBoard.upStart(data.token, data.names);          // once per token
            if (data.fraction != null) window.VSBoard.upProgress(data.token, data.fraction);
          }
        }
      } else if (kind === "studio-dropped") {
        var imgs = (data.images || []).filter(Boolean);
        if (data.token && data.target === "board" && window.VSBoard) {
          window.VSBoard.upDone(data.token, imgs);
          if (imgs.length && data.from === "phone") { S.phoneN = (S.phoneN || 0) + imgs.length; phoneGot(S.phoneN); toast("From your phone: on the board"); }
          return;
        }
        if (!imgs.length) return;
        if (data.target === "reference") {
          if (imgs.length > 1) { setImage(S.ref, "src", imgs[0]); setImage(S.ref, "refimg", imgs[1]); }
          else setImage(S.ref, S.dropSlot || (S.ref.src && !S.ref.refimg ? "refimg" : "src"), imgs[0]);
        } else if (data.target === "board" && window.VSBoard) {
          window.VSBoard.addImages(imgs);
          if (data.from === "phone") { S.phoneN = (S.phoneN || 0) + imgs.length; phoneGot(S.phoneN); toast("From your phone: on the board"); }
        } else if (data.target === "create" && S.dropSlot === "ref") {
          imgs.forEach(addRef);
        } else if (data.target === "create" || data.target === "library") {
          setImage(S.create, "src", imgs[0]); if (data.target === "library") go("create");
        }
      }
      render();
    };
  }

  // For the board (board.js): the shared state and the actions it reuses.
  window.VS = { sharpen: function () { return sharpen.apply(null, arguments); }, useSource: function (v) { useSource(v); }, currentFile: currentFile, addRef: addRef, local: function (e, f) { return zoom.local(e, f); }, layout: function () { layout(); }, zoomSpace: function () { return zoom.space || !!zoom.pan; }, plusMenu: plusMenu, pop: pop, closePop: closePop, painter: painter, S: S, api: api, esc: esc, short: short, go: go, render: render, setImage: setImage, sendPS: sendPS,
                toast: toast, refresh: refresh, current: current, P: P, job: job, readRef: readRef, engineNow: engineNow, onlineCost: onlineCost };

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

