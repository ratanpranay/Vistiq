(function () {
  "use strict";

  var LIMIT = 7000;
  var MODEL_HINTS = [
    [/7b.*sharp/i, "Largest model, sharpest detail. Slowest."],
    [/7b/i, "Largest model, natural detail."],
    [/3b.*sharp/i, "Smaller and faster, with crisp edges."],
    [/3b/i, "Smaller and faster. Good for big batches."]
  ];

  var state = { settings: {}, engine: { state: "idle", message: "", models: [] },
                items: [], sel: null, running: false, version: "" };
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
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  function outputSize(w, h, scale) {
    if (!w || !h) return [0, 0];
    var longSide = Math.max(w, h), f;
    if (scale === "max") f = LIMIT / longSide;
    else { f = parseFloat(scale); if (longSide * f > LIMIT) f = LIMIT / longSide; }
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

    var sel = $("model"), models = state.engine.models.length ? state.engine.models : (s.model ? [s.model] : []);
    var html = models.map(function (m) {
      var label = m.replace(/\.safetensors$|\.gguf$/i, "").replace(/^seedvr2_ema_/, "SeedVR2 ").replace(/_/g, " ");
      return '<option value="' + m.replace(/"/g, "&quot;") + '">' + label + "</option>";
    }).join("");
    if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
    sel.value = models.indexOf(s.model) >= 0 ? s.model : models[0];
    var hint = "";
    for (var i = 0; i < MODEL_HINTS.length; i++) if (MODEL_HINTS[i][0].test(sel.value || "")) { hint = MODEL_HINTS[i][1]; break; }
    $("model-hint").textContent = hint;

    $("out-dir-text").textContent = s.out_dir || "";
    $("out-dir").title = s.out_dir || "";

    var cur = current();
    if (cur) {
      var o = outputSize(cur.w, cur.h, s.scale);
      $("size").hidden = false;
      $("size-in").textContent = fmt(cur.w) + " × " + fmt(cur.h);
      $("size-out").textContent = fmt(o[0]) + " × " + fmt(o[1]);
    } else $("size").hidden = true;

    var go = $("go"), n = pending().length;
    if (state.running) {
      go.disabled = false; go.classList.add("cancel");
      $("go-label").textContent = "Cancel";
    } else {
      go.classList.remove("cancel");
      go.disabled = !n || state.engine.state !== "ready";
      $("go-label").textContent = n > 1 ? "Upscale " + n + " images" : "Upscale";
    }

    var st = $("status"), e = state.engine;
    st.className = "status" + (e.state === "ready" ? " ok" : (e.state === "error" || e.state === "missing") ? " bad" : "");
    var text = e.state === "ready" ? "Engine ready" : e.state === "starting" ? (e.message || "Starting the engine") : e.state === "idle" ? "Starting" : "Engine not running";
    if (state.running) {
      var all = state.items.filter(function (i) { return i.status !== "ready"; });
      var done = all.filter(function (i) { return i.status === "done" || i.status === "error"; }).length;
      text = "Working on " + Math.min(done + 1, all.length) + " of " + all.length;
    }
    st.innerHTML = '<span class="dot"></span><span></span>';
    st.lastChild.textContent = text;
  }

  // ---------------------------------------------------------------- banner
  function renderBanner() {
    var e = state.engine, b = $("banner");
    if (e.state === "ready") { b.hidden = true; return; }
    b.hidden = false;
    var bad = e.state === "error" || e.state === "missing";
    b.classList.toggle("bad", bad);
    $("banner-spin").hidden = bad;
    $("banner-text").textContent = e.message || (bad ? "The engine isn't running." : "Starting the engine");
    $("banner-retry").hidden = !bad;
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
        '" aria-label="' + it.name.replace(/"/g, "&quot;") + '"><img alt="" src="' + (it.out_preview || it.preview) + '">' + badge + "</button>" +
        (it.status === "running" ? "" : '<button type="button" class="remove" data-remove="' + it.id + '" aria-label="Remove">' + cross + "</button>") + "</li>";
    });
    html += '<li><button type="button" class="add" id="add-more" aria-label="Add images"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></li>';
    strip.innerHTML = html;
  }

  function renderStage() {
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
      meta.textContent = "Saved, " + fmt(cur.out_w) + " × " + fmt(cur.out_h) + ", in " + cur.seconds + " s";
    } else if (cur.status === "error") {
      meta.className = "meta bad";
      meta.textContent = "Didn't finish";
    } else if (cur.status === "running") {
      meta.textContent = cur.stage || "Working";
    } else if (cur.status === "queued") {
      meta.textContent = "Waiting its turn";
    } else if (Math.max(o[0], o[1]) <= Math.max(cur.w, cur.h)) {
      meta.textContent = "Already at the " + fmt(LIMIT) + " px limit";
    } else {
      meta.textContent = fmt(cur.w) + " × " + fmt(cur.h) + " → " + fmt(o[0]) + " × " + fmt(o[1]);
    }
    $("show-file").hidden = cur.status !== "done";

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
      var ring = $("ring-bar").parentNode.parentNode, p = cur.progress || 0;
      var exact = cur.status === "running" && p > 0;
      ring.classList.toggle("indeterminate", !exact);
      $("ring-bar").style.strokeDashoffset = exact ? String(327 * (1 - p)) : "";
      $("ring-text").textContent = exact ? Math.round(p * 100) + "%" : "";
      $("veil-stage").textContent = cur.status === "queued" ? "Waiting its turn" : (cur.stage || "Working");
    }
    $("err").hidden = cur.status !== "error";
    $("err").textContent = cur.error || "";
  }

  function placeCompare() {
    var v = $("compare").value;
    $("before-clip").style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
    $("divider").style.left = v + "%";
  }

  function render() {
    state.running = state.batch || state.items.some(function (i) { return i.status === "running" || i.status === "queued"; });
    renderRail(); renderBanner(); renderStrip(); renderStage(); }

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
    if (api()) api().set_setting(k, v).then(function (s) { state.settings = s; render(); });
  }
  function go() {
    if (!api()) return;
    if (state.running) { api().cancel(); return; }
    if ($("go").disabled) return;
    api().start().then(function (ok) { if (ok) { state.batch = true; render(); } });
  }

  $("scales").addEventListener("click", function (e) {
    var t = e.target.closest(".tile"); if (t) setSetting("scale", t.dataset.scale);
  });
  $("formats").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (c) setSetting("format", c.dataset.format);
  });
  $("model").addEventListener("change", function () { setSetting("model", this.value); });
  $("out-dir").addEventListener("click", function () {
    if (api()) api().choose_output().then(function (p) { state.settings.out_dir = p; render(); });
  });
  $("go").addEventListener("click", go);
  $("cancel").addEventListener("click", function () { if (api()) api().cancel(); });
  $("choose").addEventListener("click", choose);
  $("choose-folder").addEventListener("click", chooseFolder);
  $("open-folder").addEventListener("click", function () { if (api()) api().open_output(); });
  $("show-file").addEventListener("click", function () { var c = current(); if (c && api()) api().reveal(c.out_path); });
  $("compare").addEventListener("input", placeCompare);
  $("strip").addEventListener("click", function (e) {
    var rm = e.target.closest("[data-remove]");
    if (rm) {
      var id = rm.dataset.remove;
      state.items = state.items.filter(function (i) { return i.id !== id; });
      if (state.sel === id) state.sel = state.items.length ? state.items[0].id : null;
      if (api()) api().remove(id);
      render(); return;
    }
    if (e.target.closest("#add-more")) { choose(); return; }
    var th = e.target.closest(".thumb");
    if (th) { state.sel = th.dataset.id; $("compare").value = 50; render(); }
  });
  $("banner-retry").addEventListener("click", function () { if (api()) api().retry_engine(); });
  $("banner-folder").addEventListener("click", function () { if (api()) api().choose_comfy(); });

  // settings sheet
  function openSheet() {
    $("sheet").hidden = false;
    var e = state.engine;
    $("engine-line").textContent = (state.settings.comfy_path ? state.settings.comfy_path + ". " : "Found automatically. ") + (e.message || "");
    $("version").textContent = "Vistiq " + state.version;
    $("close-settings").focus();
  }
  $("open-settings").addEventListener("click", openSheet);
  $("close-settings").addEventListener("click", function () { $("sheet").hidden = true; });
  $("sheet").addEventListener("click", function (e) { if (e.target === this) this.hidden = true; });
  $("pick-comfy").addEventListener("click", function () {
    if (api()) api().choose_comfy().then(function (p) { state.settings.comfy_path = p; openSheet(); });
  });
  $("reconnect").addEventListener("click", function () { if (api()) api().retry_engine(); $("sheet").hidden = true; });
  $("logs").addEventListener("click", function () { if (api()) api().open_logs(); });

  // keys
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("sheet").hidden) { $("sheet").hidden = true; return; }
    if (!e.ctrlKey) return;
    var k = e.key.toLowerCase();
    if (k === "o") { e.preventDefault(); choose(); }
    else if (k === "v") { e.preventDefault(); if (api()) api().paste().then(merge); }
    else if (k === "enter") { e.preventDefault(); go(); }
  });

  // drag and drop: the files themselves arrive through Python
  var depth = 0;
  window.addEventListener("dragenter", function (e) { e.preventDefault(); depth++; $("drop-hint").hidden = false; });
  window.addEventListener("dragleave", function (e) { e.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) $("drop-hint").hidden = true; });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); depth = 0; $("drop-hint").hidden = true; });

  // ---------------------------------------------------------------- from Python
  window.vistiq = {
    event: function (kind, data) {
      if (kind === "engine") state.engine = data;
      else if (kind === "item") {
        var found = false;
        state.items = state.items.map(function (i) { if (i.id === data.id) { found = true; return data; } return i; });
        if (!found) state.items.push(data);
        if (data.status === "running") state.sel = data.id;
      } else if (kind === "added") merge(data);
      else if (kind === "batch") state.batch = data.state === "running";
      render();
    }
  };

  function boot() {
    api().init().then(function (s) {
      state.settings = s.settings; state.engine = s.engine; state.items = s.items; state.version = s.version;
      render();
    });
  }
  render();
  if (api()) boot(); else window.addEventListener("pywebviewready", boot);
})();
