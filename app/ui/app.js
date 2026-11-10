(function () {
  "use strict";

  var LIMIT = 7000;
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
    return { name: "Vistiq " + name, hint: hint };
  }

  var state = { settings: {}, engine: { state: "idle", message: "", models: [] },
                items: [], sel: null, running: false, version: "",
                setup: { info: null, choice: null, run: null, error: "", loading: false },
                update: { state: "idle" }, toastHidden: false, notice: "" };
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
    var seen = {};
    var html = models.map(function (m) {
      var label = modelInfo(m).name;
      seen[label] = (seen[label] || 0) + 1;
      if (seen[label] > 1) label += " " + seen[label];
      return '<option value="' + m.replace(/"/g, "&quot;") + '">' + label + "</option>";
    }).join("");
    if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
    sel.value = models.indexOf(s.model) >= 0 ? s.model : models[0];
    $("model-hint").textContent = sel.value ? modelInfo(sel.value).hint : "";

    $("out-dir-text").textContent = s.out_dir || "";
    $("out-dir").title = s.out_dir || "";

    var cur = current();
    // Each tile shows what it would actually produce for this image, so the
    // 7000 px limit is visible before anything runs.
    Array.prototype.forEach.call(document.querySelectorAll("#scales .tile"), function (t) {
      var sub = t.querySelector("span");
      if (!cur) { sub.textContent = sub.dataset.sub; t.classList.remove("same"); return; }
      var o = outputSize(cur.w, cur.h, t.dataset.scale);
      sub.textContent = fmt(Math.max(o[0], o[1])) + " px";
    });
    if (cur) {
      var o = outputSize(cur.w, cur.h, s.scale);
      $("size").hidden = false;
      $("size-in").textContent = fmt(cur.w) + " × " + fmt(cur.h);
      $("size-out").textContent = fmt(o[0]) + " × " + fmt(o[1]);
      var note = "", k = parseFloat(s.scale);
      if (s.scale !== "max" && Math.max(cur.w, cur.h) * k > LIMIT) {
        note = s.scale + "× would be " + fmt(cur.w * k) + " × " + fmt(cur.h * k) + ", so it's held to the " + fmt(LIMIT) + " px limit.";
      }
      if (Math.max(cur.w, cur.h) >= LIMIT) note = "This image is already at the " + fmt(LIMIT) + " px limit.";
      $("size-note").hidden = !note;
      $("size-note").textContent = note;
      // Dim choices that come out the same as the one selected.
      Array.prototype.forEach.call(document.querySelectorAll("#scales .tile"), function (t) {
        var other = outputSize(cur.w, cur.h, t.dataset.scale);
        t.classList.toggle("same", t.dataset.scale !== s.scale && other[0] === o[0] && other[1] === o[1]);
      });
    } else { $("size").hidden = true; $("size-note").hidden = true; }

    var go = $("go"), n = pending().length;
    if (state.running) {
      go.disabled = false; go.classList.add("cancel");
      $("go-label").textContent = "Cancel";
    } else {
      go.classList.remove("cancel");
      go.disabled = !n || (state.engine.state !== "ready" && state.engine.state !== "stopped");
      $("go-label").textContent = n > 1 ? "Upscale " + n + " images" : "Upscale";
    }

    var st = $("status"), e = state.engine;
    st.className = "status" + (e.state === "ready" ? " ok" : (e.state === "error" || e.state === "missing") ? " bad" : "");
    var text = state.setup.run ? "Setting up the engine" : e.state === "stopped" ? "Engine stopped" : e.state === "setup" ? "Engine not set up yet" : e.state === "ready" ? "Engine ready" : e.state === "starting" ? (e.message || "Starting the engine") : e.state === "idle" ? "Starting" : "Engine not running";
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
        '" aria-label="' + it.name.replace(/"/g, "&quot;") + '"><img alt="" src="' + (it.out_preview || it.preview) + '">' + badge + "</button>" +
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
        state.items = state.items.map(function (i) { if (i.id === data.id) { found = true; return data; } return i; });
        if (!found) state.items.push(data);
        if (data.status === "running") state.sel = data.id;
      } else if (kind === "added") { hideDrop(); merge(data); }
      else if (kind === "dropped") hideDrop();
      else if (kind === "batch") state.batch = data.state === "running";
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

  function boot() {
    api().init().then(function (s) {
      state.settings = s.settings; state.engine = s.engine; state.items = s.items; state.version = s.version;
      state.update = s.update || state.update; state.notice = s.notice || "";
      if (state.notice) setTimeout(function () { if (state.update.state !== "ready") { state.notice = ""; render(); } }, 8000);
      render();
    });
  }
  render();
  if (api()) boot(); else window.addEventListener("pywebviewready", boot);
})();
