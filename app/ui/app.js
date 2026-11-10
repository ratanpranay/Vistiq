(function () {
  "use strict";

  var SIZES = [4096, 7000, 8192, 12000, 16384];
  function limitPx() {
    var v = parseInt(state.settings && state.settings.max_res, 10);
    return SIZES.indexOf(v) >= 0 ? v : 7000;
  }
  function dur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + " s";
    var m = Math.floor(sec / 60), r = sec % 60;
    if (m < 60) return m + " min" + (r ? " " + r + " s" : "");
    return Math.floor(m / 60) + " h " + (m % 60) + " min";
  }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  // Friendly names. The files keep their own names on disk; nobody using
  // the app needs to see them.
  function modelInfo(file) {
    var f = (file || "").toLowerCase();
    var big = /7b/.test(f), small = /3b/.test(f), sharp = /sharp/.test(f);
    var lite = /fp8|gguf|q[2-8]_|nf4|int8/.test(f);
    var name, hint;
    if (big) { name = "Ultra"; hint = sharp ? "Most detail, crispest edges. Slowest." : "Most detail, natural look."; }
    else if (small) { name = "Swift"; hint = sharp ? "Faster, with crisp edges." : "Faster. Good for big batches."; }
    else { name = "Custom"; hint = "A model added to the engine by hand."; }
    if (sharp && (big || small)) name += " Sharp";
    if (lite) { name += " Lite"; hint += " Uses less graphics memory."; }
    return { name: name, hint: hint };
  }

  var state = { settings: {}, engine: { state: "idle", message: "", models: [] },
                items: [], sel: null, running: false, version: "",
                setup: { info: null, choice: null, run: null, error: "", loading: false },
                update: { state: "idle" }, toastHidden: false, notice: "",
                models: { catalog: null, engine_models: [], download: null },
                menu: { open: false, confirm: null, msg: "" }, dlError: "" };
  var $ = function (id) { return document.getElementById(id); };
  var api = function () { return window.pywebview && window.pywebview.api; };

  // ---------------------------------------------------------------- brand
  (function brand() {
    var b = $("brand"), word = $("logo");
    b.addEventListener("mousemove", function (e) {
      var r = word.getBoundingClientRect();
      word.style.setProperty("--x", (e.clientX - r.left) + "px");
      word.style.setProperty("--y", (e.clientY - r.top) + "px");
    });
    b.addEventListener("click", function () { b.classList.add("revealed"); });
    b.addEventListener("mouseleave", function () {
      b.classList.remove("revealed");
      word.style.setProperty("--x", "-200px");
      word.style.setProperty("--y", "-200px");
    });
  })();

  // empty-state art: soft pixels
  (function pixels() {
    var tones = ["#E9EBF0", "#DEE1E8", "#D2D6DF", "#C6CBD6", "#BAC0CC", "#AEB5C3"];
    var html = "";
    for (var i = 0; i < 24; i++) {
      var row = Math.floor(i / 6), col = i % 6;
      html += '<i style="background:' + tones[Math.min(5, Math.max(0, row + ((col * 7 + row * 3) % 3) - 1))] + '"></i>';
    }
    $("pixels").innerHTML = html;
  })();

  // ---------------------------------------------------------------- helpers
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"); }

  function outputSize(w, h, scale) {
    if (!w || !h) return [0, 0];
    var longSide = Math.max(w, h), f;
    if (scale === "max") f = limitPx() / longSide;
    else { f = parseFloat(scale); if (longSide * f > limitPx()) f = limitPx() / longSide; }
    return [Math.round(w * f / 2) * 2, Math.round(h * f / 2) * 2];
  }

  function current() {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === state.sel) return state.items[i];
    return state.items[0] || null;
  }

  function pending() {
    return state.items.filter(function (i) { return i.status === "ready" || i.status === "error"; });
  }

  // ---------------------------------------------------------------- rail
  function renderRail() {
    var s = state.settings;
    Array.prototype.forEach.call(document.querySelectorAll("#scales .tile"), function (t) {
      t.setAttribute("aria-checked", String(t.dataset.scale === s.scale));
    });
    Array.prototype.forEach.call(document.querySelectorAll("#formats .chip"), function (c) {
      c.setAttribute("aria-checked", String(c.dataset.format === s.format));
    });

    renderModel();

    $("out-dir-text").textContent = s.out_dir || "";
    $("out-dir").title = s.out_dir || "";

    var cur = current();
    // Each tile shows what it would actually produce for this image, so the
    // 7000 px limit is visible before anything runs.
    Array.prototype.forEach.call(document.querySelectorAll("#scales .tile"), function (t) {
      var sub = t.querySelector("span");
      if (!cur) {
        sub.textContent = t.dataset.scale === "max" ? fmt(limitPx()) + " px" : sub.dataset.sub;
        t.classList.remove("same"); return;
      }
      var o = outputSize(cur.w, cur.h, t.dataset.scale);
      sub.textContent = fmt(Math.max(o[0], o[1])) + " px";
    });
    if (cur) {
      var o = outputSize(cur.w, cur.h, s.scale);
      $("size").hidden = false;
      $("size-in").textContent = fmt(cur.w) + " × " + fmt(cur.h);
      $("size-out").textContent = fmt(o[0]) + " × " + fmt(o[1]);
      var note = "", k = parseFloat(s.scale);
      if (s.scale !== "max" && Math.max(cur.w, cur.h) * k > limitPx()) {
        note = s.scale + "× would be " + fmt(cur.w * k) + " × " + fmt(cur.h * k) + ", so it's held to the " + fmt(limitPx()) + " px limit.";
      }
      if (Math.max(cur.w, cur.h) >= limitPx()) note = "This image is already at the " + fmt(limitPx()) + " px limit.";
      $("size-note").hidden = !note;
      $("size-note").textContent = note;
      if (note && limitPx() < 16384) {
        // Point at the setting, and make "Settings" open it.
        $("size-note").appendChild(document.createTextNode(" You can raise the limit in "));
        var link = document.createElement("button");
        link.type = "button"; link.className = "inline-link"; link.textContent = "Settings";
        link.addEventListener("click", function () { openSheet(); setTimeout(function () { $("max-size").focus(); }, 0); });
        $("size-note").appendChild(link);
        $("size-note").appendChild(document.createTextNode(" (up to 16\u202f384 px)."));
      }
      // Dim choices that come out the same as the one selected.
      Array.prototype.forEach.call(document.querySelectorAll("#scales .tile"), function (t) {
        var other = outputSize(cur.w, cur.h, t.dataset.scale);
        t.classList.toggle("same", t.dataset.scale !== s.scale && other[0] === o[0] && other[1] === o[1]);
      });
    } else { $("size").hidden = true; $("size-note").hidden = true; }

    renderGo();

    var st = $("status"), e = state.engine;
    st.className = "status" + (e.state === "ready" ? " ok" : (e.state === "error" || e.state === "missing") ? " bad" : "");
    var text = state.setup.run ? "Setting up the engine" : e.state === "stopped" ? "Engine stopped" : e.state === "setup" ? "Engine not set up yet" : e.state === "ready" ? "Engine ready" : e.state === "starting" ? (e.message || "Starting the engine") : e.state === "idle" ? "Starting" : "Engine not running";
    st.innerHTML = '<span class="dot"></span><span></span>';
    st.lastChild.textContent = text;
  }

  // The Upscale button turns into the progress bar while work runs: the
  // logo's gradient fills it from the left, the label flips to white where
  // the fill has reached, and the × beside it cancels.
  // Real progress when the engine reports it; otherwise an estimate from
  // how long this model took before, held below 97% until it's done.
  // Progress the bar can show without ever stopping or jumping back.
  //
  // The upscaler only reports at phase boundaries (about 20%, 45% and 95%
  // for one image), and nothing in between. So between reports the bar
  // keeps creeping toward the next boundary on its own, slowing as it gets
  // close, and a learned time estimate takes over once there is one. What
  // is drawn then eases toward that target every frame, so it moves in one
  // continuous motion.
  var PHASES = [0.2, 0.45, 0.95, 0.99];
  function targetOf(item) {
    if (!item || item.status !== "running" || !item.started) return 0;
    // Vistiq's own engine: the app reads the upscaler's own log and sends
    // real, phase-and-tile progress several times a second. Just follow it.
    if (item.fine) return item.progress || 0;
    var now = Date.now(), real = item.progress || 0;
    var o = outputSize(item.w, item.h, state.settings.scale);
    var mpx = Math.max(1, o[0] * o[1] / 1e6);
    if (item.estimate > 0) {
      return Math.max(real, Math.min(0.97, (now - item.started) / 1000 / item.estimate));
    }
    var cap = 0.99;
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i] > real + 0.001) { cap = PHASES[i]; break; }
    var since = (now - (item.realAt || item.started)) / 1000;
    var T = Math.max(4, mpx * 0.5);
    return real + (cap - real) * 0.92 * (1 - Math.exp(-since / T));
  }
  function phaseLabel(p) {
    return p < 0.2 ? "Preparing" : p < 0.45 ? "Upscaling" : p < 0.95 ? "Finishing details" : "Saving";
  }
  var anim = { item: null, shown: 0 };
  function progressOf(item) {
    return item && anim.item === item.id ? anim.shown : 0;
  }

  function tick() {
    var run = state.items.filter(function (i) { return i.status === "running"; })[0];
    if (run) {
      if (anim.item !== run.id) { anim.item = run.id; anim.shown = 0; }
      var t = Math.max(anim.shown, targetOf(run));
      anim.shown += (t - anim.shown) * 0.04;
      paintProgress(run);
    } else if (anim.item) {
      anim.item = null; anim.shown = 0;
    }
    requestAnimationFrame(tick);
  }

  function paintProgress(run) {
    var go = $("go");
    if (!go.classList.contains("running")) return;
    var finished = state.items.filter(function (i) { return i.status === "done" && i.inBatch; }).length;
    var working = state.items.filter(function (i) { return i.status === "running" || i.status === "queued"; }).length;
    var total = finished + working;
    var overall = total ? (finished + anim.shown) / total : anim.shown;
    var pct = Math.max(2, overall * 100);
    var width = go.clientWidth || 256;
    go.style.setProperty("--p", pct + "%");
    go.style.setProperty("--fillpx", Math.max(0, pct / 100 * width - 22) + "px");
    var label = (run.fine && run.stage ? run.stage.replace(/, part (\d+) of (\d+)/, " $1/$2") : run.stage && /memory/i.test(run.stage) ? run.stage : phaseLabel(anim.shown)) + " " + Math.floor(overall * 100) + "%";
    if ($("go-label").textContent !== label) { $("go-label").textContent = label; $("go-label-on").textContent = label; }
    var cur = current();
    if (cur && cur.id === run.id && !$("veil").hidden) {
      $("ring-bar").style.strokeDashoffset = String(327 * (1 - anim.shown));
      $("ring-text").textContent = Math.floor(anim.shown * 100) + "%";
    }
  }

  function renderGo() {
    var go = $("go"), n = pending().length;
    var working = state.items.filter(function (i) { return i.status === "running" || i.status === "queued"; });
    if (state.running) {
      var run = state.items.filter(function (i) { return i.status === "running"; })[0];
      var finished = state.items.filter(function (i) { return i.status === "done" && i.inBatch; }).length;
      var total = finished + working.length;
      go.disabled = false;
      go.classList.add("running");
      go.setAttribute("aria-disabled", "true");
      go.style.setProperty("--bw", (go.clientWidth || 256) + "px");
      if (run) paintProgress(run);
      else { $("go-label").textContent = "Starting"; $("go-label-on").textContent = "Starting"; }
      $("go-x").hidden = false;
      $("go-meta").hidden = false;
      $("go-count").textContent = "Image " + Math.min(finished + 1, total) + " of " + total;
      var el = run && run.started ? (Date.now() - run.started) / 1000 : 0;
      $("go-clock").textContent = run && run.started
        ? clock(el) + (run.left != null ? ", about " + clock(run.left) + " left"
          : run.estimate > 0 ? " of about " + clock(Math.max(run.estimate, el)) : "") : "";
    } else {
      go.classList.remove("running");
      go.removeAttribute("aria-disabled");
      go.style.removeProperty("--p");
      go.disabled = !n || (state.engine.state !== "ready" && state.engine.state !== "stopped");
      $("go-label").textContent = n > 1 ? "Upscale " + n + " images" : "Upscale";
      $("go-x").hidden = true;
      $("go-meta").hidden = true;
    }
  }


  // ---------------------------------------------------------------- model picker
  var ICON_DL = '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/></svg>';
  var ICON_BIN = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
  var ICON_CHECK = '<svg class="check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function byKey(key) { var c = state.models.catalog; return c && c.models.filter(function (m) { return m.key === key; })[0]; }
  function byFile(file) { var c = state.models.catalog; return c && c.models.filter(function (m) { return m.file === file; })[0]; }
  function isAuto() { return !state.settings.model || state.settings.model === "auto"; }

  function renderModel() {
    var c = state.models.catalog, dl = state.models.download;
    var badge = $("mdl-auto"), name = $("mdl-name"), sub = $("mdl-sub"), note = $("mdl-note");
    badge.hidden = !isAuto() || !c;
    note.className = "mdl-note"; note.hidden = true; note.innerHTML = "";
    if (!c) {
      // Someone else's ComfyUI: list what it has, no downloads.
      var f = state.settings.model && state.settings.model !== "auto" ? state.settings.model : (state.engine.models[0] || "");
      name.textContent = f ? modelInfo(f).name : "No model";
      sub.textContent = f ? modelInfo(f).hint : "";
      $("mdl-btn").title = f;
      return;
    }
    var vram = c.vram ? c.vram + " GB" : "this";
    var target = byKey(c.auto_target), now = byKey(c.auto_now), pick;
    if (isAuto()) {
      pick = now;
      name.textContent = now ? now.name : "No model yet";
      sub.textContent = c.auto_ready ? "Fits your " + vram + " card" : "Slower on this card";
    } else {
      pick = byFile(state.settings.model);
      name.textContent = pick ? pick.name : modelInfo(state.settings.model).name;
      sub.textContent = pick ? (pick.fits ? "Fits your " + vram + " card" : "Bigger than this card, slower") : "";
    }
    $("mdl-btn").title = "";

    if (dl) {
      var m = byKey(dl.key), f2 = dl.fraction || 0;
      note.className = "mdl-note plain"; note.hidden = false;
      var amount = (dl.detail || "").replace(/^[^:]*: /, "").replace(/, about.*$/, "").replace(" GB of ", " of ");
      var left = /about (.*) left/.test(dl.detail || "") ? ", about " + RegExp.$1 + " left" : "";
      note.innerHTML = '<span class="row2"><span>Getting ' + esc(m ? m.name : "the model") + '</span><span>' + Math.round(f2 * 100) + '%</span></span>' +
        '<div class="mini"><span style="width:' + Math.round(f2 * 100) + '%"></span></div>' +
        '<span>' + esc(amount + left + ".") + (isAuto() && m && m.auto ? " Auto switches to it when done." : "") + '</span>';
    } else if (state.dlError) {
      note.className = "mdl-note bad"; note.hidden = false; note.textContent = state.dlError;
    } else if (isAuto() && !c.auto_ready && target) {
      note.className = "mdl-note plain"; note.hidden = false;
      note.innerHTML = '<span>' + esc(target.name) + ' is the best fit for this PC. </span><button type="button" class="lnk" data-dl="' + target.key + '">Download it (' + target.gb + ' GB)</button>';
    } else if (pick) {
      note.hidden = false;
      note.textContent = (pick.fits ? "Tuned for this PC: runs fully in graphics memory."
        : "Tuned for this PC: the model is brought in from RAM as it works.") +
        " Very large results are made in parts and joined seamlessly.";
    }
    if (state.menu.open) renderMenu();
  }

  function renderMenu() {
    var c = state.models.catalog, menu = $("mdl-menu"), html = "", dl = state.models.download;
    if (c) {
      var now = byKey(c.auto_now), target = byKey(c.auto_target);
      html += '<div class="opt' + (isAuto() ? " on" : "") + '" role="option" aria-selected="' + isAuto() + '" data-pick="auto">' +
        '<span class="auto-badge">AUTO</span><span class="t"><b>Let Vistiq choose</b><small>' +
        esc(c.auto_ready ? "Uses " + target.name + " on this PC" : (now ? "Uses " + now.name + " until " + target.name + " is downloaded" : "Picks " + target.name + " once it's downloaded")) +
        '</small></span>' + (isAuto() ? ICON_CHECK : "") + '</div><div class="sep"></div>';
      c.models.forEach(function (m) {
        var chosen = !isAuto() && state.settings.model === m.file;
        var right;
        if (state.menu.confirm === m.key) {
          right = '<span class="acts"><button type="button" class="pill danger" data-rm-yes="' + m.key + '">Remove ' + m.on_disk_gb + ' GB</button><button type="button" class="pill" data-rm-no="1">Keep</button></span>';
        } else if (dl && dl.key === m.key) {
          right = '<span class="acts"><span class="dlbar"><span>' + Math.round((dl.fraction || 0) * 100) + '%</span><span class="mini"><span style="width:' + Math.round((dl.fraction || 0) * 100) + '%"></span></span></span><button type="button" class="bin" data-dl-cancel="1" aria-label="Stop download">' + ICON_X + '</button></span>';
        } else if (m.installed) {
          right = '<span class="acts">' + (chosen ? ICON_CHECK : '<span class="gbsz">' + m.on_disk_gb + ' GB</span>') +
            '<button type="button" class="bin" data-rm="' + m.key + '" aria-label="Remove ' + esc(m.name) + '" title="Remove from this PC">' + ICON_BIN + '</button></span>';
        } else {
          right = '<span class="acts"><button type="button" class="pill" data-dl="' + m.key + '"' + (dl ? " disabled" : "") + '>' + ICON_DL + m.gb + ' GB</button></span>';
        }
        html += '<div class="opt' + (chosen ? " on" : "") + (m.installed ? "" : " off") + '" role="option" aria-selected="' + chosen + '"' +
          (m.installed ? ' data-pick="' + esc(m.file) + '"' : "") + '><span class="t"><b>' + esc(m.name) +
          (m.installed ? ' <span class="here">Installed</span>' : "") + '</b><small>' + esc(m.note) + '</small></span>' + right + '</div>';
      });
      if (state.menu.msg) html += '<p class="menu-msg">' + esc(state.menu.msg) + '</p>';
    } else {
      (state.engine.models || []).forEach(function (f) {
        var chosen = state.settings.model === f;
        html += '<div class="opt' + (chosen ? " on" : "") + '" role="option" data-pick="' + esc(f) + '"><span class="t"><b>' + esc(modelInfo(f).name) +
          '</b><small>' + esc(modelInfo(f).hint) + '</small></span>' + (chosen ? ICON_CHECK : "") + '</div>';
      });
    }
    menu.innerHTML = html;
    placeMenu();
  }

  function placeMenu() {
    var r = $("mdl-btn").getBoundingClientRect(), menu = $("mdl-menu");
    menu.style.left = Math.max(12, r.left) + "px";
    var h = menu.offsetHeight, below = window.innerHeight - r.bottom - 12;
    menu.style.top = (h <= below ? r.bottom + 6 : Math.max(12, r.top - h - 6)) + "px";
  }

  function openMenu(open) {
    state.menu.open = open; state.menu.confirm = null; state.menu.msg = "";
    $("mdl-menu").hidden = !open;
    $("mdl-btn").setAttribute("aria-expanded", String(open));
    if (open) {
      renderMenu();
      if (api()) api().model_info().then(function (m) { if (m) { state.models = m; renderModel(); } });
    }
  }

  function startDownload(key) {
    state.dlError = "";
    if (api()) api().download_model(key).then(function (ok) {
      if (ok) { state.models.download = { key: key, fraction: 0, detail: "Starting" }; render(); }
    });
  }

  $("mdl-btn").addEventListener("click", function (e) { e.stopPropagation(); openMenu(!state.menu.open); });
  $("mdl-note").addEventListener("click", function (e) {
    var d = e.target.closest("[data-dl]"); if (d) startDownload(d.dataset.dl);
  });
  $("mdl-menu").addEventListener("click", function (e) {
    e.stopPropagation();
    var t;
    if ((t = e.target.closest("[data-dl]"))) { startDownload(t.dataset.dl); return; }
    if ((t = e.target.closest("[data-dl-cancel]"))) { if (api()) api().cancel_model_download(); return; }
    if ((t = e.target.closest("[data-rm]"))) { state.menu.confirm = t.dataset.rm; state.menu.msg = ""; renderMenu(); return; }
    if ((t = e.target.closest("[data-rm-no]"))) { state.menu.confirm = null; renderMenu(); return; }
    if ((t = e.target.closest("[data-rm-yes]"))) {
      var key = t.dataset.rmYes;
      if (api()) api().remove_model(key).then(function (msg) {
        state.menu.confirm = null; state.menu.msg = msg || "";
        var m = byKey(key);
        if (!msg && m && state.settings.model === m.file) setSetting("model", "auto");
        render();
      });
      return;
    }
    if ((t = e.target.closest("[data-pick]"))) { setSetting("model", t.dataset.pick); openMenu(false); }
  });
  document.addEventListener("click", function () { if (state.menu.open) openMenu(false); });
  window.addEventListener("resize", function () { if (state.menu.open) placeMenu(); });

  // ---------------------------------------------------------------- banner
  function renderBanner() {
    var e = state.engine, b = $("banner");
    if (e.state === "ready" || showingSetup()) { b.hidden = true; return; }
    b.hidden = false;
    var bad = e.state === "error" || e.state === "missing", stopped = e.state === "stopped";
    b.classList.toggle("bad", bad);
    $("banner-spin").hidden = bad || stopped;
    $("banner-text").textContent = e.message || (bad ? "The engine isn't running." : "Starting the engine");
    $("banner-retry").hidden = !bad && !stopped;
    $("banner-retry").textContent = stopped ? "Start engine" : "Try again";
    $("banner-folder").hidden = e.state !== "missing" && !/folder|found/i.test(e.message || "");
  }

  // ---------------------------------------------------------------- stage
  var check = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var cross = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';

  function renderStrip() {
    var strip = $("strip"), html = "";
    state.items.forEach(function (it) {
      var badge = it.status === "done" ? '<span class="badge done">' + check + "</span>"
        : it.status === "error" ? '<span class="badge error">' + cross + "</span>"
        : (it.status === "running" || it.status === "queued") ? '<span class="badge running"></span>' : "";
      html += '<li><button type="button" class="thumb" data-id="' + it.id + '" aria-current="' + (it.id === state.sel) +
        '" aria-label="' + it.name.replace(/"/g, "&quot;") + '" title="' + it.name.replace(/"/g, "&quot;") +
        (it.status === "done" ? ", took " + dur(it.seconds) : "") + '"><img alt="" src="' + (it.out_preview || it.preview) + '">' + badge + "</button>" +
        (it.status === "running" ? "" : '<button type="button" class="remove" data-remove="' + it.id + '" aria-label="Remove">' + cross + "</button>") + "</li>";
    });
    html += '<li><button type="button" class="add" id="add-more" aria-label="Add images"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></li>';
    strip.innerHTML = html;
  }

  function showingSetup() {
    return state.engine.state === "setup" || !!state.setup.run;
  }

  var STEPS = [["check", "Checking this PC"], ["engine", "Downloading the engine"],
               ["unpack", "Unpacking the engine"], ["nodes", "Adding the upscaler"],
               ["model", "Downloading the model"]];

  function gb(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(n / 1e6)) + " MB"; }

  function renderSetup() {
    var su = state.setup, info = su.info;
    $("setup").hidden = false;
    var up = !!(su.run && su.run.upgrade);
    $("setup-h").textContent = up ? "Updating the engine" : "Set up the engine";
    $("setup-lead").textContent = up
      ? "A faster, steadier engine build, downloaded once. Your models stay where they are."
      : "A one-time download. Vistiq keeps its own private copy, so nothing else on this PC changes.";
    $("empty").hidden = true;
    $("work").hidden = true;
    if (!info) {
      if (!su.loading && api()) {
        su.loading = true;
        api().setup_info().then(function (i) {
          su.info = i; su.loading = false; su.choice = su.choice || i.suggested; render();
        });
      }
      $("gpu-line").textContent = "Checking this PC…";
      $("setup-models").innerHTML = "";
      return;
    }
    var g = $("gpu-line");
    g.className = "gpu" + (info.gpu ? "" : " bad");
    g.textContent = info.gpu ? info.gpu + ", " + info.vram + " GB graphics memory"
      : "No NVIDIA graphics card found. Vistiq needs one to upscale.";

    var html = "";
    info.models.forEach(function (m) {
      html += '<button type="button" class="model" role="radio" data-key="' + m.key + '" aria-checked="' + (m.key === su.choice) + '">' +
        '<span class="radio"></span><span class="txt"><b>' + m.name +
        (m.key === info.suggested ? '<span class="pick">Best for this PC</span>' : "") +
        "</b><small>" + m.about + '</small></span><span class="gb">' + (m.size ? gb(m.size) : "Already here") + "</span></button>";
    });
    var models = $("setup-models");
    if (models.dataset.html !== html) { models.innerHTML = html; models.dataset.html = html; }

    var chosen = info.models.filter(function (m) { return m.key === su.choice; })[0] || info.models[0];
    var total = (info.engine_size || 0) + (chosen.size || 0);
    $("setup-total").textContent = total ? "Download about " + gb(total) + " in total. " + info.free + " GB free on this drive."
      : "Nothing left to download. Setup only needs to finish.";

    var run = su.run;
    $("setup-choose").hidden = !!run;
    $("setup-run").hidden = !run;
    $("setup-err").hidden = !su.error;
    $("setup-err").textContent = su.error;
    $("setup-go").textContent = su.error ? "Try again" : su.paused ? "Continue setup" : "Set up";
    if (run) {
      var at = STEPS.map(function (x) { return x[0]; }).indexOf(run.step), list = "";
      STEPS.forEach(function (x, i) {
        var cls = i < at ? "done" : i === at ? "now" : "";
        list += '<li class="' + cls + '"><span class="st">' + (i < at ? check : "") + "</span>" + x[1] + "</li>";
      });
      $("setup-steps").innerHTML = list;
      var bar = $("setup-bar").parentNode, f = run.fraction;
      bar.classList.toggle("indeterminate", f === null || f === undefined);
      $("setup-bar").style.width = (f === null || f === undefined) ? "" : Math.round(f * 100) + "%";
      $("setup-detail").textContent = run.detail || "";
    }
  }

  function renderStage() {
    if (showingSetup()) { renderSetup(); return; }
    $("setup").hidden = true;
    var cur = current();
    $("empty").hidden = !!cur;
    $("work").hidden = !cur;
    if (!cur) return;
    if (!state.sel) state.sel = cur.id;

    $("cur-name").textContent = cur.name;
    var meta = $("cur-meta");
    meta.className = "meta";
    var o = outputSize(cur.w, cur.h, state.settings.scale);
    if (cur.status === "done") {
      meta.className = "meta ok";
      meta.textContent = "Saved, " + fmt(cur.out_w) + " × " + fmt(cur.out_h) + ". Took " + dur(cur.seconds) + ".";
    } else if (cur.status === "error") {
      meta.className = "meta bad";
      meta.textContent = "Didn't finish";
    } else if (cur.status === "running") {
      meta.textContent = (cur.stage || "Working") + (cur.started ? ", " + clock((Date.now() - cur.started) / 1000) : "");
    } else if (cur.status === "queued") {
      meta.textContent = "Waiting its turn";
    } else if (Math.max(o[0], o[1]) <= Math.max(cur.w, cur.h)) {
      meta.textContent = "Already at the " + fmt(limitPx()) + " px limit";
    } else {
      meta.textContent = fmt(cur.w) + " × " + fmt(cur.h) + " → " + fmt(o[0]) + " × " + fmt(o[1]);
    }
    $("show-file").hidden = cur.status !== "done";
    $("remove-cur").disabled = cur.status === "running";

    var done = cur.status === "done" && cur.out_preview;
    $("img-after").src = done ? cur.out_preview : cur.preview;
    $("img-before").src = cur.preview;
    $("before-clip").hidden = !done;
    $("divider").hidden = !done;
    $("compare").hidden = !done;
    $("tag-before").hidden = !done;
    $("tag-after").hidden = !done;
    if (done) placeCompare();

    var busy = cur.status === "running" || cur.status === "queued";
    $("veil").hidden = !busy;
    if (busy) {
      var ring = $("ring-bar").parentNode.parentNode, p = progressOf(cur);
      var queued = cur.status === "queued";
      ring.classList.toggle("indeterminate", queued);
      $("ring-bar").style.strokeDashoffset = queued ? "" : String(327 * (1 - p));
      $("ring-text").textContent = queued ? "" : Math.floor(p * 100) + "%";
      $("veil-stage").textContent = queued ? "Waiting its turn"
        : (cur.fine && cur.stage ? cur.stage : cur.stage && /memory/i.test(cur.stage) ? cur.stage : phaseLabel(p)) + (cur.started ? "  ·  " + clock((Date.now() - cur.started) / 1000) : "");
    }
    $("err").hidden = cur.status !== "error";
    $("err").textContent = cur.error || "";
  }

  function placeCompare() {
    var v = $("compare").value;
    $("before-clip").style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
    $("divider").style.left = v + "%";
  }

  function renderUpdate() {
    var u = state.update, ready = u.state === "ready";
    $("open-settings").classList.toggle("has-update", ready);
    $("upd-version").textContent = "Vistiq " + (u.current || state.version);
    var st = $("upd-status"), text = "", cls = "hint";
    if (u.state === "checking") text = "Checking…";
    else if (u.state === "current") { text = "Up to date"; cls += " ok"; }
    else if (u.state === "downloading") text = "Downloading " + u.latest + "…";
    else if (ready) { text = u.latest + " is ready to install"; cls += " ok"; }
    else if (u.state === "error") { text = u.message || "Couldn't check for updates"; cls += " bad"; }
    else text = "Checks for updates automatically";
    st.className = cls; st.textContent = text;
    $("upd-check").hidden = ready;
    $("upd-check").disabled = u.state === "checking" || u.state === "downloading";
    $("upd-restart").hidden = !ready;
    $("upd-restart").textContent = ready ? "Restart to " + u.latest : "Restart";
    $("upd-notes").hidden = !u.latest || u.state === "current";

    var t = $("toast");
    if (ready && !state.toastHidden) {
      t.hidden = false;
      $("toast-title").textContent = "Vistiq " + u.latest + " is ready";
      $("toast-body").textContent = state.running ? "Restart once the current images are done." : "Restart to start using it.";
      $("toast-go").hidden = false; $("toast-later").textContent = "Later";
    } else if (state.notice && !state.toastHidden) {
      t.hidden = false;
      $("toast-title").textContent = state.notice;
      $("toast-body").textContent = "You're on the newest version.";
      $("toast-go").hidden = true; $("toast-later").textContent = "OK";
    } else t.hidden = true;
    $("toast-go").disabled = state.running;
    $("upd-restart").disabled = state.running;
  }

  function render() {
    state.running = state.batch || state.items.some(function (i) { return i.status === "running" || i.status === "queued"; });
    renderRail(); renderUpdate(); renderBanner(); renderStrip(); renderStage(); }

  // ---------------------------------------------------------------- actions
  function merge(added) {
    (added || []).forEach(function (a) { state.items.push(a); });
    if (added && added.length) state.sel = added[0].id;
    render();
  }

  function choose() { if (api()) api().choose_files().then(merge); }
  function chooseFolder() { if (api()) api().choose_folder_images().then(merge); }
  function setSetting(k, v) {
    state.settings[k] = v; render();
    if (api()) api().set_setting(k, v).then(function (s) { if (s) state.settings = s; render(); });
  }
  function go() {
    if (!api()) return;
    if (state.running) return;
    if ($("go").disabled) return;
    state.items.forEach(function (i) { i.inBatch = i.status === "ready" || i.status === "error"; });
    api().start().then(function (ok) { if (ok) { state.batch = true; render(); } });
  }

  $("scales").addEventListener("click", function (e) {
    var t = e.target.closest(".tile"); if (t) setSetting("scale", t.dataset.scale);
  });
  $("formats").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (c) setSetting("format", c.dataset.format);
  });
  $("out-dir").addEventListener("click", function () {
    if (api()) api().choose_output().then(function (p) { state.settings.out_dir = p; render(); });
  });
  $("go").addEventListener("click", go);
  $("go-x").addEventListener("click", function () { if (api()) api().cancel(); });
  $("cancel").addEventListener("click", function () { if (api()) api().cancel(); });
  $("choose").addEventListener("click", choose);
  $("choose-folder").addEventListener("click", chooseFolder);
  $("open-folder").addEventListener("click", function () { if (api()) api().open_output(); });
  $("show-file").addEventListener("click", function () { var c = current(); if (c && api()) api().reveal(c.out_path); });
  $("compare").addEventListener("input", placeCompare);
  function removeItem(id) {
    var idx = -1;
    state.items.forEach(function (i, n) { if (i.id === id) idx = n; });
    if (idx < 0 || state.items[idx].status === "running") return;
    state.items.splice(idx, 1);
    if (state.sel === id) {
      var next = state.items[Math.min(idx, state.items.length - 1)];
      state.sel = next ? next.id : null;
    }
    if (api()) api().remove(id);
    render();
  }
  $("remove-cur").addEventListener("click", function () { var c = current(); if (c) removeItem(c.id); });
  $("strip").addEventListener("click", function (e) {
    var rm = e.target.closest("[data-remove]");
    if (rm) { removeItem(rm.dataset.remove); return; }
    if (e.target.closest("#add-more")) { choose(); return; }
    var th = e.target.closest(".thumb");
    if (th) { state.sel = th.dataset.id; $("compare").value = 50; render(); }
  });
  $("banner-retry").addEventListener("click", function () { if (api()) api().retry_engine(); });
  $("banner-folder").addEventListener("click", function () { if (api()) api().choose_comfy(); });

  // engine setup
  $("setup-models").addEventListener("click", function (e) {
    var m = e.target.closest(".model"); if (m) { state.setup.choice = m.dataset.key; render(); }
  });
  $("setup-go").addEventListener("click", function () {
    if (!api()) return;
    state.setup.error = "";
    api().install_engine(state.setup.choice).then(function (ok) {
      if (ok) { state.setup.run = { step: "check", fraction: null, detail: "" }; render(); }
    });
  });
  $("setup-cancel").addEventListener("click", function () { if (api()) api().cancel_install(); });
  $("setup-import").addEventListener("click", function () {
    if (!api()) return;
    api().import_models().then(function (names) {
      state.setup.info = null;
      state.setup.error = names && names.length ? "" : "No model files were found in that folder.";
      render();
    });
  });
  $("setup-own").addEventListener("click", function () { if (api()) api().choose_comfy(); });

  // settings sheet
  function openSheet() {
    $("sheet").hidden = false;
    var e = state.engine;
    $("keep-engine").checked = state.settings.keep_engine !== false;
    $("max-size").value = String(limitPx());
    $("stop-engine").disabled = state.engine.state !== "ready" || state.running;
    $("engine-line").textContent = (state.settings.comfy_path ? "Using the ComfyUI in " + state.settings.comfy_path + ". " : "Vistiq's own engine. ") + (e.message || "");
    $("close-settings").focus();
  }
  $("open-settings").addEventListener("click", openSheet);
  $("close-settings").addEventListener("click", function () { $("sheet").hidden = true; });
  $("sheet").addEventListener("click", function (e) { if (e.target === this) this.hidden = true; });
  $("pick-comfy").addEventListener("click", function () {
    if (api()) api().choose_comfy().then(function (p) { state.settings.comfy_path = p; openSheet(); });
  });
  $("max-size").addEventListener("change", function () { setSetting("max_res", parseInt(this.value, 10)); });
  $("keep-engine").addEventListener("change", function () { setSetting("keep_engine", this.checked); });
  $("stop-engine").addEventListener("click", function () {
    if (api()) api().stop_engine().then(function (ok) { if (ok) $("sheet").hidden = true; });
  });
  $("reconnect").addEventListener("click", function () { if (api()) api().retry_engine(); $("sheet").hidden = true; });
  $("logs").addEventListener("click", function () { if (api()) api().open_logs(); });

  // support
  var PAYPAL = "https://www.paypal.com/donate/?business=pranayratan%40gmail.com&no_recurring=0&item_name=Vistiq&currency_code=EUR";
  $("open-support").addEventListener("click", function () { $("support").hidden = false; $("close-support").focus(); });
  $("close-support").addEventListener("click", function () { $("support").hidden = true; });
  $("support").addEventListener("click", function (e) { if (e.target === this) this.hidden = true; });
  $("open-paypal").addEventListener("click", function () { if (api()) api().open_url(PAYPAL); });
  $("paypal-mail").addEventListener("click", function () { if (api()) api().open_url(PAYPAL); });

  // updates
  function restart() {
    if (!api()) return;
    api().restart().then(function (r) {
      if (r === "busy") { state.update.message = "Finish or cancel the current work first."; render(); }
    });
  }
  $("upd-check").addEventListener("click", function () {
    if (api()) { state.update.state = "checking"; render(); api().check_updates(); }
  });
  $("upd-restart").addEventListener("click", restart);
  $("toast-go").addEventListener("click", restart);
  $("toast-later").addEventListener("click", function () { state.toastHidden = true; state.notice = ""; render(); });
  $("upd-notes").addEventListener("click", function () { if (api() && state.update.url) api().open_url(state.update.url); });

  // keys
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("sheet").hidden) { $("sheet").hidden = true; return; }
    if (e.key === "Escape" && !$("support").hidden) { $("support").hidden = true; return; }
    if (e.key === "Escape" && state.menu.open) { openMenu(false); return; }
    if (e.key === "Delete" && $("sheet").hidden && $("support").hidden) { var c = current(); if (c) removeItem(c.id); return; }
    if (!e.ctrlKey) return;
    var k = e.key.toLowerCase();
    if (k === "o") { e.preventDefault(); choose(); }
    else if (k === "v") { e.preventDefault(); if (api()) api().paste().then(merge); }
    else if (k === "enter") { e.preventDefault(); go(); }
  });

  // drag and drop: the files themselves arrive through Python
  // The hint hides on drop, on leaving the window, and also by itself if
  // the drag goes quiet, so it can never be left on screen.
  var dragTimer = null;
  function hideDrop() { clearTimeout(dragTimer); $("drop-hint").hidden = true; }
  function showDrop() {
    $("drop-hint").hidden = false;
    clearTimeout(dragTimer);
    dragTimer = setTimeout(hideDrop, 400);
  }
  window.addEventListener("dragenter", function (e) { e.preventDefault(); showDrop(); });
  window.addEventListener("dragover", function (e) { e.preventDefault(); showDrop(); });
  window.addEventListener("dragleave", function (e) { if (!e.relatedTarget) hideDrop(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); hideDrop(); });
  window.addEventListener("dragend", hideDrop);

  // ---------------------------------------------------------------- from Python
  window.vistiq = {
    event: function (kind, data) {
      if (kind === "engine") state.engine = data;
      else if (kind === "item") {
        var found = false;
        state.items = state.items.map(function (i) {
          if (i.id === data.id) {
            found = true;
            data.inBatch = i.inBatch || data.status === "queued" || data.status === "running";
            data.realAt = (data.progress || 0) !== (i.progress || 0) ? Date.now() : i.realAt;
            return data;
          }
          return i;
        });
        if (!found) state.items.push(data);
        if (data.status === "running") state.sel = data.id;
      } else if (kind === "added") { hideDrop(); merge(data); }
      else if (kind === "dropped") hideDrop();
      else if (kind === "batch") state.batch = data.state === "running";
      else if (kind === "models") { state.models = data; }
      else if (kind === "model-dl") {
        if (data.state === "running") state.models.download = data;
        else {
          state.models.download = null;
          state.dlError = data.state === "error" ? (data.message || "The download stopped.") : "";
        }
      }
      else if (kind === "update") {
        if (data.state === "ready" && state.update.state !== "ready") state.toastHidden = false;
        state.update = data;
      }
      else if (kind === "setup") {
        var su = state.setup;
        if (data.state === "running") { su.run = data; su.error = ""; }
        else {
          su.run = null;
          su.error = data.state === "error" ? data.message : "";
          su.paused = data.state === "cancelled";
          su.info = null;
          if (data.state === "done") state.engine = { state: "starting", message: "Starting the engine", models: [] };
        }
      }
      render();
    }
  };

  requestAnimationFrame(tick);

  setInterval(function () {
    var c = current();
    if (c && c.status === "running" && c.started) renderStage();
    if (state.running) renderGo();
  }, 1000);

  function boot() {
    api().init().then(function (s) {
      state.settings = s.settings; state.engine = s.engine; state.items = s.items; state.version = s.version;
      state.update = s.update || state.update; state.notice = s.notice || "";
      if (s.models) state.models = s.models;
      if (state.notice) setTimeout(function () { if (state.update.state !== "ready") { state.notice = ""; render(); } }, 8000);
      render();
    });
  }
  render();
  if (api()) boot(); else window.addEventListener("pywebviewready", boot);
})();
