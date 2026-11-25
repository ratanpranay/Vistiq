/* Vistiq Studio — the board: one infinite canvas where everything lives.
   The Live tile (Photoshop / Affinity) is always there; pasted, dropped or
   added images become tiles; results added from the Focus view sit next to
   what they were made from, joined by a line. Double-click opens Focus view,
   right-click gives the actions, Organize lays it all out in creation order. */
(function () {
  "use strict";
  var W = 300;                       // tile width on the board, in board units
  var GAP_X = 90, GAP_Y = 46;
  var B = { tiles: [], view: { x: 60, y: 90, z: 0.8 } }, thumbs = {}, root, world, svgEl, menu, loaded = false, saveT = 0;
  var P = { id: "myboard", name: "My board" };     // the project this board belongs to

  function VS() { return window.VS; }
  function api() { return VS().api(); }
  function esc(t) { return VS().esc(t); }
  function call(name) {
    var a = api(), args = [].slice.call(arguments, 1);
    return a && a[name] ? a[name].apply(a, args) : Promise.resolve(null);
  }
  function uid() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function byId(id) { for (var i = 0; i < B.tiles.length; i++) if (B.tiles[i].id === id) return B.tiles[i]; return null; }
  function live() { return byId("live"); }
  var PH = Math.round(W * 9 / 16);       // every tile's picture box: the same size, whatever the shape
  // A tile takes its picture's shape (Nov 2026): landscape keeps the width, portrait keeps a taller box.
  function shape(t) {
    if (!t || !t.w || !t.h || t.frame || (t.kind !== "image" && t.kind !== "result")) return [W, PH];   // 3D frames keep their grid
    var r = t.h / t.w;
    if (r <= 1) return [W, Math.round((W - 12) * Math.max(r, 0.35))];
    var ph = Math.round(W * 1.25);
    return [Math.max(190, Math.round(ph / r) + 12), ph];
  }
  function tileW(t) { return shape(t)[0]; }
  function tileH(t) { return shape(t)[1] + 30; }

  function save() {
    clearTimeout(saveT);
    var pid = P.id, b = B;
    saveT = setTimeout(function () {
      saveT = 0;
      call("studio_board_save", Object.assign({}, b, { tiles: b.tiles.filter(function (k) { return k.kind !== "upload"; }) }), pid);
    }, 400);
  }

  function ensureLive() {
    if (!live()) B.tiles.unshift({ id: "live", kind: "live", x: 0, y: 0, w: 16, h: 9, made: 0 });
  }

  // ---------------------------------------------------------------- build

  var padUntil = 0;
  function build(el) {
    root = el;
    root.innerHTML =
      '<div class="b-cv" id="b-cv"><div class="b-world" id="b-world"><svg class="b-links" id="b-links"></svg></div></div>' +
      '<div class="b-top"><button type="button" class="b-back" data-b="projects">← Projects</button><div class="b-title" id="b-title">My board</div>' +
      '<div class="b-pswrap"><div class="b-tabs"><button type="button" class="b-tab" data-b="pstab" title="Your open Photoshop or Affinity file, live, in this project">' +
      '<span class="m-ico ps">Ps</span><span>Photoshop / Affinity</span><i class="b-tdot" id="b-tdot"></i></button><span class="b-psact" id="b-psact"></span></div>' +
      '<div class="b-psmsg" id="b-psmsg" hidden></div><div class="b-livefloat" id="b-livefloat"></div></div></div>' +
      '<div class="b-bar"><button type="button" class="b-plus" data-b="plus" title="Add: blank canvas, image, paste, phone">' +
      '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button><span class="b-sep"></span>' +
      '<button type="button" data-b="fit">Fit</button><span class="b-zoom" id="b-zoom">80%</span></div>' +
      '<div class="b-hint" id="b-hint">Click + for a blank canvas, an image or your phone · paste with Ctrl V or drop images here. Double-click a tile to work on it, or drag its + out for Refine, Relight, Variations, 3D views and Upscale. Drag to select · hold Space or the middle button to pan.</div>' +
      '<div class="b-menu" id="b-menu" hidden></div><div class="b-group" id="b-group" hidden></div>' +
      '<div class="b-mix" id="b-mix" hidden></div><div class="b-marq" id="b-marq" hidden></div><div class="b-acts" id="b-acts" hidden></div>';
    world = root.querySelector("#b-world"); svgEl = root.querySelector("#b-links"); menu = root.querySelector("#b-menu");
    wire();
    load(P.id, P.name, true);
  }

  // Open a project's board (saving the one that was open first).
  function load(pid, name, first) {
    if (!first && loaded && (pid || "myboard") === P.id) {        // already open: just the name may have changed
      P.name = name || P.name; if (root) root.querySelector("#b-title").textContent = P.name;
      if (VS() && VS().S) VS().S.project = { id: P.id, name: P.name };
      return Promise.resolve();
    }
    if (!first && saveT) { clearTimeout(saveT); saveT = 0; call("studio_board_save", B, P.id); }
    P = { id: pid || "myboard", name: name || P.name };
    if (VS() && VS().S) VS().S.project = { id: P.id, name: P.name };
    loaded = false; multi = []; lastHTML = ""; B = { tiles: [], view: { x: 60, y: 90, z: 0.8 } };
    if (root) root.querySelector("#b-title").textContent = P.name;
    return call("studio_board_get", P.id).then(function (b) {
      B = b && b.tiles ? b : { tiles: [], view: { x: 60, y: 90, z: 0.8 } };
      // No more "3D" frame (confusing): its views stay where they are, as ordinary results.
      if (B.tiles.some(function (k) { return k.kind === "frame"; })) {
        B.tiles = B.tiles.filter(function (k) { return k.kind !== "frame"; });
        B.tiles.forEach(function (k) { delete k.frame; }); save();
      }
      if (!B.view) B.view = { x: 60, y: 90, z: 0.8 };
      (B.nodes || []).forEach(function (n) { n.busy = false; n.status = ""; n.job = null; });
      ensureLive(); loaded = true; lastHTML = ""; render();
    });
  }

  // ---------------------------------------------------------------- render

  function liveInfo() {
    var S = VS().S, src = S.create.liveSrc || (S.create.src && S.create.src.live ? S.create.src : null);
    return { on: !!(S.live && S.live.on && src), src: src, doc: S.live && S.live.doc, state: S.live && S.live.state, msg: S.live && S.live.msg };
  }

  // The Live tile (Nov 2026): hangs below the Photoshop bar ("always on top", pinned) or sits on the
  // board like any tile (unpinned); the bar's arrow folds it away. Only there while a file is linked.
  var psAsked = false;
  function livePinned() { return true; }      // always on top, below the bar (Nov 2026: no pin)
  function liveOpen() { return B.liveOpen !== false; }
  function liveInWorld() { return liveInfo().on && liveOpen() && !livePinned(); }
  function liveCard(t, sel, float) {
    var L = liveInfo();
    return '<div class="b-tile b-live on' + (float ? " b-float" : "") + sel + '" data-id="live"' +
      (float ? "" : ' style="left:' + t.x + "px;top:" + t.y + "px;width:" + W + 'px"') + ">" +
      '<div class="b-h"><span><i class="b-dot"></i>Live' + (L.doc ? " · " + esc(L.doc) : "") + "</span></div>" +
      '<div class="b-pic"><img src="' + L.src.preview + '" alt=""></div></div>';
  }
  function psBar() {
    if (!root) return;
    var L = liveInfo(), act = root.querySelector("#b-psact"), msg = root.querySelector("#b-psmsg"), fl = root.querySelector("#b-livefloat");
    if (!act) return;
    var a = L.on ? '<button type="button" class="b-fold' + (liveOpen() ? " open" : "") + '" data-b="livefold" title="' + (liveOpen() ? "Hide" : "Show") + ' the live file">' +
      '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' :
      '<button type="button" class="b-psconnect" data-b="connect">Connect</button>';
    if (act.innerHTML !== a) act.innerHTML = a;
    if (L.on) psAsked = false;
    var m = !L.on && psAsked ? (L.msg || "Open the file you want to work on in Photoshop or Affinity") : "";
    msg.hidden = !m; if (msg.textContent !== m) msg.textContent = m;
    var f = L.on && liveOpen() && livePinned() ? liveCard(live(), B.sel === "live" ? " sel" : "", true) : "";
    if (fl.getAttribute("data-h") !== f) { fl.setAttribute("data-h", f); fl.innerHTML = f; }
  }

  // Several tiles picked together (Ctrl or Shift click, up to 4): numbered in the order picked.
  var multi = [];
  function tileHTML(t) {
    if (t.kind === "frame") {
      var fb = frameBox(t);
      return '<div class="b-frame" data-fid="' + t.id + '" style="left:' + t.x + "px;top:" + t.y + "px;width:" + fb.w + "px;height:" + fb.h + 'px">' +
        '<div class="b-fh" data-fid="' + t.id + '">' + esc(t.title || "") + "</div></div>";
    }
    var mi = multi.indexOf(t.id), sel = (t.id === B.sel && !multi.length ? " sel" : "") + (mi >= 0 ? " msel" : "");
    var badge = mi >= 0 ? '<b class="b-no">' + (mi + 1) + "</b>" : "";

    if (t.kind === "upload") {               // where a picture being added will appear
      var known = typeof t.frac === "number";
      return '<div class="b-tile b-up" data-up="' + t.id + '" style="left:' + t.x + "px;top:" + t.y + "px;width:" + W + 'px">' +
        '<div class="b-h"><span>' + esc(VS().short(t.name || "Picture")) + "</span><small>" + (t.failed ? "Couldn't add" : "Adding…") + "</small></div>" +
        '<div class="b-upbox"><div class="b-upbar' + (known ? "" : " creep") + (t.failed ? " bad" : "") + '"><i style="' + (known ? "width:" + Math.round(t.frac * 100) + "%" : "") + '"></i></div></div></div>';
    }
    if (t.kind === "live") return liveInWorld() ? liveCard(t, sel, false) : "";   // or below the bar, or folded away
    var th = thumbs[t.path];
    if (th === undefined) { thumbs[t.path] = null; call("studio_thumb", t.path).then(function (d) { thumbs[t.path] = d || "missing"; render(); }); }
    var pic = th && th !== "missing" ? '<div class="b-pic"><img data-p="' + esc(t.path) + '" src="' + th + '" alt=""></div>' : '<div class="b-empty">' + (th === "missing" ? "File moved or deleted" : "") + "</div>";
    pic = pic.replace('class="b-pic"', 'class="b-pic" style="height:' + shape(t)[1] + 'px"').replace('class="b-empty"', 'class="b-empty" style="height:' + shape(t)[1] + 'px"');
    return '<div class="b-tile' + sel + '" data-id="' + t.id + '" style="left:' + t.x + "px;top:" + t.y + "px;width:" + tileW(t) + 'px">' +
      '<div class="b-h"><span>' + esc(VS().short(t.name || "")) + "</span><small>" + (t.w ? t.w + " × " + t.h : "") + "</small></div>" + pic + badge +
      (t.path ? '<button type="button" class="b-port" data-port="' + t.id + '" title="Drag out for Refine, Relight, Variations, 3D views, Upscale"><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg></button>' : "") + "</div>";
  }

  function linksSVG() {
    var d = "";
    B.tiles.forEach(function (t) {
      var nv = t.via && nodeById(t.via);
      if (nv) {
        var firstOf = B.tiles.filter(function (k) { return k.via === nv.id; })[0];
        if (firstOf !== t) return;
        var a1 = nv.x + NODE_W, b1 = nv.y + 22, a2 = t.x, b2 = t.y + tileH(t) / 2, am = (a1 + a2) / 2;
        d += '<path class="' + (nv.id === selNodeId() ? "on dk" : "on gr") + '" d="M' + a1 + " " + b1 + " C" + am + " " + b1 + "," + am + " " + b2 + "," + a2 + " " + b2 + '"/>';
        return;
      }
      var p = t.from && byId(t.from); if (!p || (p.kind === "live" && !liveInWorld())) return;
      var x1 = p.x + tileW(p), y1 = p.y + tileH(p) / 2, x2 = t.x, y2 = t.y + tileH(t) / 2, mx = (x1 + x2) / 2;
      d += '<path d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + "," + mx + " " + y2 + "," + x2 + " " + y2 + '"/>';
    });
    return d + nodeLinks() + (portDrag && portDrag.moved ? portDrag.path : "");
  }

  var lastHTML = "", portDrag = null;
  function render() {
    if (!root || !loaded) return;
    ensureLive();
    var h = B.tiles.map(tileHTML).join("");
    if (h !== lastHTML) {
      lastHTML = h;
      world.querySelectorAll(".b-tile,.b-frame").forEach(function (n) { n.remove(); });
      world.insertAdjacentHTML("beforeend", h);
    }
    renderNodes();
    svgEl.innerHTML = linksSVG();
    if (pendingShow && root.querySelector("#b-cv").getBoundingClientRect().width) { var ps = pendingShow; pendingShow = null; show(ps); }
    var L = liveInfo(), dot = root.querySelector("#b-tdot"); if (dot) dot.className = "b-tdot" + (L.on ? " on" : "");
    psBar();
    groupBar();
    applyView();
    root.querySelector("#b-hint").hidden = B.tiles.length > 1;
  }

  function groupBar() {
    var g = root.querySelector("#b-group");
    if (multi.length < 2) { g.hidden = true; return; }
    g.hidden = false;
    var few = multi.length <= 4, off = few ? "" : " disabled title=\"Up to 4 pictures\"";
    var h = "<b>" + multi.length + ' selected</b><button type="button" data-g="mix"' + off + '>✦ Mix<small>Q · 1 main, others as references</small></button>' +
      '<button type="button" data-g="compare"' + off + '>⇆ Compare</button><button type="button" data-g="remove" title="Remove from the board (Delete). The files stay.">Remove</button>' +
      '<button type="button" data-g="clear" title="Deselect (Esc)">×</button>';
    if (g.getAttribute("data-h") !== h) { g.innerHTML = h; g.setAttribute("data-h", h); }
  }
  function clearMulti() { if (multi.length) { multi = []; lastHTML = ""; render(); } }
  function groupAction(a) {
    var tiles = multi.map(byId).filter(Boolean);
    if (a === "clear") { clearMulti(); return; }
    if (a === "remove") { removeTiles(tiles); return; }
    if (tiles.length > 4) { VS().toast("Up to 4 pictures for this"); return; }
    if (a === "compare") { compare(tiles); return; }
    if (a === "mix" || a === "create") mixOpen(tiles);
  }
  function removeTiles(tiles) {
    var ids = tiles.filter(function (t) { return t.kind !== "live"; }).map(function (t) { return t.id; });
    if (!ids.length) return;
    B.tiles.forEach(function (k) { if (ids.indexOf(k.from) >= 0) { var p = byId(k.from); k.from = p && p.from || null; } });
    B.tiles = B.tiles.filter(function (k) { return ids.indexOf(k.id) < 0; });
    multi = []; if (ids.indexOf(B.sel) >= 0) B.sel = null; mixClose();
    lastHTML = ""; save(); render();
    if (ids.length > 1) VS().toast("Removed " + ids.length + " from the board (the files stay)");
  }

  // ---------------------------------------------------------------- mix
  // Up to 4 pictures: one is the main one (worked on), the others give one thing each.
  var mix = null;
  var MIX_USES = [["camera", "Camera view"], ["materials", "Materials & colours"], ["style", "Rendering style"], ["light", "Lighting"], ["describe", "As I describe"]];
  function mixOpen(tiles) {
    tiles = tiles.filter(function (t) { return t.kind !== "live"; }).slice(0, 4);
    if (tiles.length < 2) return;
    var uses = ["materials", "light", "style", "camera"];
    mix = { ids: tiles.map(function (t) { return t.id; }), main: tiles[0].id, use: {}, text: "", vars: 1, busy: false };
    tiles.slice(1).forEach(function (t, i) { mix.use[t.id] = uses[i] || "describe"; });
    mixRender();
  }
  function mixClose() { mix = null; var el = root && root.querySelector("#b-mix"); if (el) el.hidden = true; }
  function mixRender() {
    var el = root.querySelector("#b-mix");
    if (!mix) { el.hidden = true; return; }
    var tiles = mix.ids.map(byId).filter(Boolean), refs = tiles.filter(function (t) { return t.id !== mix.main; });
    var V = VS(), p = V.S.create, run = mix.busy && p.job;
    var thumb = function (t) { var th = thumbs[t.path]; return th && th !== "missing" ? '<img src="' + th + '" alt="">' : "<i></i>"; };
    el.innerHTML = '<div class="bm-h"><b>✦ Mix</b><button type="button" class="bm-x" data-x="close" title="Close (Esc)">×</button></div>' +
      '<div class="bm-sec">Main picture <small>what gets worked on · click another to swap</small></div><div class="bm-main">' +
      tiles.map(function (t) { return '<button type="button" class="bm-t' + (t.id === mix.main ? " on" : "") + '" data-main="' + t.id + '">' + thumb(t) + "</button>"; }).join("") + "</div>" +
      '<div class="bm-sec">From the others</div>' + refs.map(function (t, i) {
        return '<div class="bm-ref"><span class="bm-n">' + (i + 1) + "</span>" + thumb(t) + '<select data-use="' + t.id + '">' +
          MIX_USES.map(function (u) { return '<option value="' + u[0] + '"' + (mix.use[t.id] === u[0] ? " selected" : "") + ">" + u[1] + "</option>"; }).join("") + "</select></div>";
      }).join("") +
      '<textarea id="bm-text" rows="3" placeholder="Describe the result (optional). Say ref 1, ref 2… to point at a reference.">' + esc(mix.text) + "</textarea>" +
      '<div class="bm-go"><span class="bm-v"><button type="button" data-v="-1">−</button><b>' + mix.vars + '</b><button type="button" data-v="1">+</button></span>' +
      '<button type="button" class="bm-run" data-x="run"' + (run ? " disabled" : "") + ">" + (run ? esc(mix.status || "Working") : "Mix") + "</button></div>" +
      '<div class="bm-note">' + (run ? "Results appear to the right of the main picture." : "Results appear to the right of the main picture.") + "</div>";
    el.hidden = false;
    // Next to the pictures, on screen.
    var v = B.view, r = root.getBoundingClientRect(), x1 = -1e9, y0 = 1e9;
    tiles.forEach(function (t) { x1 = Math.max(x1, t.x + tileW(t)); y0 = Math.min(y0, t.y); });
    var sx = x1 * v.z + v.x + 24, sy = y0 * v.z + v.y;
    el.style.left = Math.max(12, Math.min(sx, r.width - el.offsetWidth - 12)) + "px";
    el.style.top = Math.max(60, Math.min(sy, r.height - el.offsetHeight - 12)) + "px";
  }
  function mixRun() {
    var V = VS(), S = V.S, p = S.create;
    var tiles = mix.ids.map(byId).filter(Boolean), main = byId(mix.main), refs = tiles.filter(function (t) { return t !== main; });
    if (p.job) { V.toast("Studio is still working on something"); return; }
    mix.busy = true; mix.status = "Reading references"; mixRender();
    Promise.all([main].concat(refs).map(function (t) { return call("studio_image", t.path); })).then(function (infos) {
      if (!infos[0]) { mix.busy = false; V.toast("The main picture was moved or deleted."); mixRender(); return; }
      S.create.source = "image";
      V.setImage(p, "src", infos[0]); S.boardFrom = main.id;
      p.refs = [];
      infos.slice(1).forEach(function (info, i) {
        if (!info) return;
        V.addRef(info);
        var r = p.refs[p.refs.length - 1];
        if (r && r.path === info.path && r.use !== mix.use[refs[i].id]) { r.use = mix.use[refs[i].id]; r.desc = ""; r.descFor = ""; V.readRef(r); }
      });
      p.text = mix.text; p.vars = mix.vars;
      var tries = 0;
      (function wait() {
        if (!mix) return;
        if ((p.refs || []).some(function (r) { return r.reading; }) && tries++ < 240) { setTimeout(wait, 500); return; }
        mix.status = "Starting"; V.job("c"); mixWatch();
      })();
    });
  }
  function mixWatch() {
    if (!mix || !mix.busy) return;
    var p = VS().S.create;
    if (p.job) { mix.status = (p.stage || "Working") + (p.frac ? " · " + Math.round(p.frac * 100) + "%" : ""); mixRender(); setTimeout(mixWatch, 700); }
    else { mix.busy = false; mixRender(); }
  }

  function compare(tiles) {
    var old = document.getElementById("b-compare"); if (old) old.remove();
    var el = document.createElement("div"); el.id = "b-compare"; el.className = "b-compare";
    el.innerHTML = '<button type="button" class="x" title="Close (Esc)">×</button><div class="row">' + tiles.map(function (t, i) {
      var th = thumbs[t.path];
      return '<figure><img alt="" data-p="' + esc(t.path) + '" src="' + (th && th !== "missing" ? th : "") + '"><figcaption><b>' + (i + 1) + "</b>" + esc(VS().short(t.name || "")) + "</figcaption></figure>";
    }).join("") + "</div>";
    document.body.appendChild(el);
    // Full pictures, not the board's small ones.
    tiles.forEach(function (t) { call("studio_image", t.path).then(function (info) { var im = el.querySelector('img[data-p="' + CSS.escape(t.path) + '"]'); if (im && info && info.preview) im.src = info.preview; }); });
    el.addEventListener("click", function (e) { if (e.target === el || e.target.closest(".x")) el.remove(); });
  }
  function applyView() {
    var v = B.view;
    world.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.z + ")";
    var cv = root.querySelector("#b-cv");
    cv.style.backgroundSize = (22 * v.z) + "px " + (22 * v.z) + "px";
    cv.style.backgroundPosition = v.x + "px " + v.y + "px";
    root.querySelector("#b-zoom").textContent = Math.round(v.z * 100) + "%";
    // sharp zoom: tiles shown bigger than their small preview get the on-screen part from the full picture
    if (VS().sharpen) root.querySelectorAll(".b-pic > img[data-p]").forEach(function (im) { VS().sharpen(im.parentNode, im.getAttribute("data-p"), 0, 0, im); });
  }

  // ---------------------------------------------------------------- tiles

  function place(t, from) {
    // Freeform: a new picture goes into free space to the right of what's there (a result
    // next to what it was made from), loosely scattered rather than in a line or a column.
    var p = from && byId(from);
    var v = B.view, cv = root && root.querySelector("#b-cv"), r = cv ? cv.getBoundingClientRect() : { width: 1200, height: 800 };
    var vx0 = -v.x / v.z, vy0 = -v.y / v.z, vx1 = vx0 + r.width / v.z, vy1 = vy0 + r.height / v.z;
    var s = B.sel && byId(B.sel), lv = liveInWorld() && live(), minX = lv ? lv.x + W + GAP_X : -1e9;
    var tx, ty;
    if (p) { tx = p.x + tileW(p) + GAP_X; ty = p.y; }
    else if (s && userSel && s !== t && s.kind !== "frame" && s.x < vx1 && s.x + tileW(s) > vx0 && s.y < vy1 && s.y + tileH(s) > vy0) { tx = s.x + tileW(s) + GAP_X; ty = s.y; }
    else { tx = Math.round((vx0 + vx1) / 2 - tileW(t) / 2); ty = Math.round((vy0 + vy1) / 2 - tileH(t) / 2); }   // where you look
    var sx = Math.max(W, tileW(t)) + GAP_X, sy = tileH(t) + GAP_Y, best = null;
    function free(x, y) {
      return x >= minX && !B.tiles.some(function (k) { return k !== t && k.kind !== "frame" && k.x < x + tileW(t) + 30 && k.x + tileW(k) + 30 > x && k.y < y + tileH(k) + 30 && k.y + tileH(k) + 30 > y; });
    }
    for (var rr = 0; rr < 14 && (!best || rr < 3); rr++) {      // weigh the nearby spots too, not just the first free one
      for (var i = -rr; i <= rr; i++) for (var j = -rr; j <= rr; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== rr) continue;
        var x = tx + i * sx, y = ty + j * sy;
        if (!free(x, y)) continue;
        // nearest free spot, a bit to the right rather than the left, picked loosely: scattered, not a line
        var d = (p && i < 0 ? 1e6 : 0) + Math.abs(i) * sx * (i < 0 ? 1.6 : 0.8) + Math.abs(j) * sy * 1.3 + Math.random() * sx * 0.9;
        if (!best || d < best[2]) best = [x, y, d];
      }
    }
    t.x = best ? best[0] : tx; t.y = best ? best[1] : ty;
    // a little loose, like pictures put down by hand
    var jx = Math.round((Math.random() - 0.5) * 60), jy = Math.round((Math.random() - 0.5) * 70);
    if (free(t.x + jx, t.y + jy)) { t.x += jx; t.y += jy; }
  }
  // Keep a new picture in view.
  var pendingShow = null;
  function show(t) {
    var cv = root && root.querySelector("#b-cv"); if (!cv) return;
    var r = cv.getBoundingClientRect(), v = B.view, sx = t.x * v.z + v.x, sy = t.y * v.z + v.y;
    if (!r.width) { pendingShow = t; return; }          // the board isn't on screen: bring it into view when it is
    if (sx < 0 || sy < 64 || sx + tileW(t) * v.z > r.width || sy + tileH(t) * v.z > r.height) {      // 64: below the project bar
      v.x = r.width / 2 - (t.x + tileW(t) / 2) * v.z; v.y = r.height / 2 - (t.y + tileH(t) / 2) * v.z; applyView();
    }
  }

  // ---------------------------------------------------------------- the 3D frame
  // Views made in 3D gather in a frame named "3D", in rows, joined to their picture.
  var F3D = "f3d", FPAD = 40, FCOLS = 3;
  function frame3d() {
    var f = byId(F3D);
    if (!f) {
      var xs = B.tiles.map(function (k) { return k.x + tileW(k); }), ys = B.tiles.map(function (k) { return k.y; });
      f = { id: F3D, kind: "frame", title: "3D", x: (xs.length ? Math.max.apply(null, xs) : 0) + GAP_X * 2, y: ys.length ? Math.min.apply(null, ys) : 0 };
      B.tiles.push(f);
    }
    return f;
  }
  function frameBox(f) {
    var kids = B.tiles.filter(function (k) { return k.frame === f.id; });
    var n = Math.max(1, kids.length), cols = Math.min(FCOLS, n), rows = Math.ceil(n / FCOLS);
    return { w: FPAD * 2 + cols * W + (cols - 1) * GAP_X, h: FPAD + 34 + rows * tileH() + (rows - 1) * GAP_Y + FPAD };
  }

  function add(info, from) {
    if (!info) return null;
    var t = { id: uid(), kind: from ? "result" : "image", path: info.path, name: info.name, w: info.w, h: info.h,
              from: from || null, made: Date.now() };
    place(t, from);
    if (info.preview) thumbs[t.path] = info.preview;
    B.tiles.push(t); B.sel = t.id; save(); render(); show(t);
    return t;
  }

  function addImages(list) { (list || []).forEach(function (i) { add(i, null); }); }

  // ---------------------------------------------------------------- adding, with a placeholder
  // A picture being added shows at once as an outlined tile with a bar, where it will land;
  // when it is read, the real tile takes that same spot (Nov 2026).
  var ups = {};
  function upStart(token, names) {
    names = names && names.length ? names : [""];
    if (ups[token]) return;
    ups[token] = names.map(function (n) {
      var t = { id: uid(), kind: "upload", name: n, made: Date.now() };
      place(t, null); B.tiles.push(t);
      return t;
    });
    render(); show(ups[token][0]);
  }
  function upProgress(token, frac) {
    (ups[token] || []).forEach(function (t) { t.frac = Math.max(0, Math.min(1, frac)); });
    render();
  }
  function upDone(token, infos) {
    var hold = ups[token] || []; delete ups[token];
    infos = (infos || []).filter(Boolean);
    var last = null;
    infos.forEach(function (info, i) {
      var ph = hold[i], t = { id: uid(), kind: "image", path: info.path, name: info.name, w: info.w, h: info.h, from: null, made: Date.now() };
      if (info.preview) thumbs[t.path] = info.preview;
      if (ph) { t.x = ph.x; t.y = ph.y; B.tiles[B.tiles.indexOf(ph)] = t; }
      else { place(t, null); B.tiles.push(t); }
      last = t;
    });
    hold.slice(infos.length).forEach(function (ph) { var k = B.tiles.indexOf(ph); if (k >= 0) B.tiles.splice(k, 1); });
    if (last) { B.sel = last.id; save(); }
    render();
    if (last) show(last);
  }
  function upFail(token) {
    var hold = ups[token] || []; delete ups[token];
    hold.forEach(function (t) { t.failed = true; t.frac = 1; });
    render();
    setTimeout(function () { hold.forEach(function (ph) { var k = B.tiles.indexOf(ph); if (k >= 0) B.tiles.splice(k, 1); }); render(); }, 1600);
  }
  // From this page (Add, paste): the placeholder first, then read the picture.
  function addWith(getInfo, name) {
    var tok = "u" + uid();
    upStart(tok, [name || ""]);
    return Promise.resolve(getInfo()).then(function (i) { if (i) upDone(tok, [i]); else upDone(tok, []); return i; },
      function () { upFail(tok); });
  }

  function addResult(c, from) {
    if (!c || has(c.path)) return;
    add({ path: c.path, name: c.name, w: c.w, h: c.h }, from && byId(from) ? from : null);
  }

  function has(path) { return B.tiles.some(function (t) { return t.path === path; }); }

  function open(t) {
    var V = VS(), S = V.S;
    if (t.kind === "live") {
      // The Live page: only the live file, or the steps to connect (never the last picture you had open).
      V.useSource("live");
      S.boardFrom = "live"; V.go("create"); return;
    }
    call("studio_image", t.path).then(function (info) {
      if (!info) { V.toast("That file was moved or deleted."); return; }
      S.create.source = "image"; V.setImage(S.create, "src", info); S.boardFrom = t.id; V.go("create");
    });
  }

  // ---------------------------------------------------------------- tool windows (Nov 2026)
  // Drag the + out of a tile (or right-click it) and pick a tool: a small window opens next to the
  // tile, joined to it by a line, with only that tool's settings. Results land at the end of the line,
  // each with its own +, so the steps chain: photo → Refine → a result → 3D views.
  var NODE_W = 250;
  var TOOLS = [
    ["refine", "✎", "Refine", "words · an area", "change"], ["relight", "☀", "Relight", "", "change"],
    ["variations", "✦", "Variations", "new designs", "change"],
    ["3d", "⬡", "3D views", "", "make"], ["upscale", "↑", "Upscale", "", "make"],
    ["ps", "Ps", "Send to Photoshop", "", "do"], ["open", "⤢", "Open in Create", "", "do"]
  ];
  // Studio words these into interior or exterior lighting, a different light direction for each variation.
  var LIGHTS = [["studio", "Studio", "studio lighting"], ["airy", "Bright & airy", "bright and airy daylight"],
                ["golden", "Golden hour", "golden hour sunlight"], ["overcast", "Overcast", "overcast daylight"],
                ["sunset", "Sunset", "sunset light"], ["city", "Cityscape", "city lights at dusk"], ["night", "Night", "night lighting"]];
  var VIEWS3 = [["front-left", "Front ¾ L"], ["front", "Front"], ["front-right", "Front ¾ R"], ["left", "Side L"],
                ["right", "Side R"], ["rear-left", "Rear ¾ L"], ["rear", "Rear"], ["rear-right", "Rear ¾ R"]];
  var UPS = [["2", "2×"], ["4", "4×"], ["max", "Max"]];
  function nodes() { if (!B.nodes) B.nodes = []; return B.nodes; }
  function nodeById(id) { return nodes().filter(function (n) { return n.id === id; })[0] || null; }
  function toolOf(k) { return TOOLS.filter(function (x) { return x[0] === k; })[0]; }
  var acts = null;      // the tool list: { from, x, y } (board units for where the window goes)

  function actsOpen(t, sx, sy, wx, wy) {
    var el = root.querySelector("#b-acts"), ps = VS().S.psOn;
    acts = { from: t.id, x: wx, y: wy, q: "", at: Date.now() };
    var list = TOOLS.filter(function (x) { return x[0] !== "ps" || ps; });
    var grp = function (g, title) {
      var it = list.filter(function (x) { return x[4] === g; });
      return it.length ? '<div class="ba-g">' + title + "</div>" + it.map(function (x) {
        return '<button type="button" data-tool="' + x[0] + '"><span class="ba-ic">' + x[1] + "</span>" + x[2] + (x[3] ? "<small>" + x[3] + "</small>" : "") + "</button>";
      }).join("") : "";
    };
    el.innerHTML = '<input id="ba-q" placeholder="What do you want to do?" autocomplete="off">' +
      grp("change", "Change it") + grp("make", "Make from it") + grp("do", "");
    el.hidden = false; svgEl.innerHTML = linksSVG();
    var r = root.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(sx - r.left, r.width - el.offsetWidth - 8)) + "px";
    el.style.top = Math.max(60, Math.min(sy - r.top - 20, r.height - el.offsetHeight - 8)) + "px";
    setTimeout(function () { var q = el.querySelector("#ba-q"); if (q) q.focus(); }, 0);
  }
  function actsClose() { var had = acts && acts.x != null; acts = null; var el = root && root.querySelector("#b-acts"); if (el) el.hidden = true; if (had && svgEl) svgEl.innerHTML = linksSVG(); }
  function actsFilter(q) {
    var el = root.querySelector("#b-acts"), first = null;
    el.querySelectorAll("[data-tool]").forEach(function (b) {
      var on = !q || b.textContent.toLowerCase().indexOf(q.toLowerCase()) >= 0; b.hidden = !on; if (on && !first) first = b;
    });
    el.querySelectorAll(".ba-g").forEach(function (g) {
      var n = g.nextElementSibling, any = false;
      while (n && !n.classList.contains("ba-g")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
      g.hidden = !any;
    });
    return first;
  }
  function actsPick(kind) {
    var a = acts; actsClose();
    var t = a && byId(a.from); if (!t) return;
    if (kind === "ps") { VS().sendPS(t.path); return; }
    if (kind === "open") { open(t); return; }
    nodeOpen(kind, t, a.x, a.y);
  }

  function nodeOpen(kind, t, x, y) {
    if (x == null) { x = t.x + tileW(t) + 70; y = t.y; }
    var n = { id: "n" + uid(), kind: kind, from: t.id, x: Math.round(x), y: Math.round(y), text: "", vars: kind === "variations" ? 2 : 1,
              light: "golden", view: "front-left", height: "eye", scale: "2" };
    nodes().push(n); B.sel = null; save(); render();
    setTimeout(function () { var ta = root.querySelector('.b-node[data-nid="' + n.id + '"] textarea'); if (ta) ta.focus(); }, 30);
    return n;
  }
  function nodeClose(n) {
    if (n.busy) { VS().toast("Still working: it closes when done"); return; }
    B.nodes = nodes().filter(function (k) { return k !== n; });
    B.tiles.forEach(function (k) { if (k.via === n.id) delete k.via; });
    save(); render();
  }

  function seg(attr, list, on) {
    return '<span class="bn-seg">' + list.map(function (o) { return '<button type="button" data-' + attr + '="' + o[0] + '"' + (String(on) === String(o[0]) ? ' class="on"' : "") + ">" + o[1] + "</button>"; }).join("") + "</span>";
  }
  function nodeHTML(n) {
    var tl = toolOf(n.kind) || ["", "•", n.kind], body = "", label = "Run", can = true;
    var vars = '<div class="bn-row"><span>Variations</span>' + seg("nv", [[1, "1"], [2, "2"], [4, "4"]], n.vars) + "</div>";
    if (n.kind === "refine") {
      body = '<textarea rows="3" data-nt placeholder="What to change, e.g. tan leather seats, matte black wheels">' + esc(n.text || "") + "</textarea>" + vars;
      label = "Refine"; can = !!(n.text || "").trim();
    } else if (n.kind === "relight") {
      body = '<div class="bn-chips">' + LIGHTS.map(function (l) { return '<button type="button" data-nl="' + l[0] + '"' + (n.light === l[0] ? ' class="on"' : "") + ">" + l[1] + "</button>"; }).join("") + "</div>" +
        '<textarea rows="2" data-nt placeholder="Anything more (optional)">' + esc(n.text || "") + "</textarea>" + vars;
      label = "Relight";
    } else if (n.kind === "variations") {
      body = '<textarea rows="2" data-nt placeholder="Which part, or a direction (optional), e.g. the door handle, sportier">' + esc(n.text || "") + "</textarea>" + vars;
      label = "Make variations";
    } else if (n.kind === "3d") {
      body = '<div class="bn-chips">' + VIEWS3.map(function (v) { return '<button type="button" data-n3="' + v[0] + '"' + (n.view === v[0] ? ' class="on"' : "") + ">" + v[1] + "</button>"; }).join("") + "</div>" +
        '<div class="bn-row"><span>Height</span>' + seg("nh", [["eye", "Eye"], ["high", "Above"], ["low", "Low"]], n.height) + "</div>" +
        '<div class="bn-row"><span>Variations</span>' + seg("nv", [[1, "1"], [2, "2"], [4, "4"]], n.vars || 1) + "</div>";
      label = "Make view";
    } else if (n.kind === "upscale") {
      body = '<div class="bn-row"><span>Size</span>' + seg("nu", UPS, n.scale) + "</div>";
      label = "Upscale";
    }
    var oo = VS().S.status && VS().S.status.online;
    if (oo && oo.on) {
      // the engine as three tiles (Nov 2026: was a plain dropdown)
      var en = nodeEngine(n), up = n.kind === "upscale", k = up ? 1 : (n.vars || 1);
      var opts = [];
      if (up || VS().S.status.local_ready) opts.push(["", up ? "Only upscale" : "Local", "Free"]);
      ["standard", "pro"].forEach(function (e) {
        var cr = oo.engines[e].credits[up ? "2K" : (/2k|4k/i.test(VS().S.create.res || "2k") ? "2K" : "1K")] * k;
        opts.push([e, oo.engines[e].label, (up ? "Enhance · " : "") + (Math.round(cr * 10) / 10) + (up ? " cr" : cr === 1 ? " credit" : " credits")]);
      });
      body += '<div class="bn-eng"><span class="bn-lab">Engine</span><div class="bn-engs">' + opts.map(function (o) {
        return '<button type="button" data-neng="' + o[0] + '"' + (en === o[0] ? ' class="on"' : "") + "><b>" + o[1] + "</b><small>" + o[2] + "</small></button>";
      }).join("") + "</div></div>";
    }
    var st = n.busy ? '<div class="bn-prog"><i style="width:' + Math.round((n.frac || 0) * 100) + '%"></i></div><div class="bn-est">' + esc(n.status || "Working") + "</div>" :
      (n.err ? '<div class="bn-err">' + esc(n.err) + "</div>" : '<div class="bn-est">' + esc(nodeEta(n)) + "</div>");
    var done = (n.made || 0) > 0;
    return '<div class="b-node' + (n.busy ? " busy" : "") + '" data-nid="' + n.id + '" style="left:' + n.x + "px;top:" + n.y + "px;width:" + NODE_W + 'px">' +
      '<div class="bn-h" data-nh="' + n.id + '"><button type="button" class="bn-back" data-nback title="Back to the tools (pick another)"' + (n.busy ? " disabled" : "") + '>‹</button><span class="bn-ic">' + tl[1] + "</span><b>" + tl[2] +
      '</b><button type="button" class="bn-x" data-nx title="Close">×</button></div>' +
      '<div class="bn-b">' + body + '<button type="button" class="bn-run" data-nr' + (n.busy || !can ? " disabled" : "") + ">" + (n.busy ? "Working…" : done ? label + " again" : label) + "</button>" + st + "</div></div>";
  }
  // How long a run takes, from earlier runs on this computer (as Create shows it).
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2); }
  function nodeEngine(n) {
    var oo = VS().S.status && VS().S.status.online;
    if (!oo || !oo.on) return "";
    if (n.kind === "upscale") return oo.engines[n.engine] ? n.engine : "";
    var e = n.engine != null ? n.engine : VS().engineNow();
    if (!e && !VS().S.status.local_ready) e = "standard";
    return oo.engines[e] ? e : "";
  }
  function nodeEta(n) {
    if (n.kind === "upscale") return nodeEngine(n) ? VS().onlineCost(nodeEngine(n), 1, "2k") + " · sharper textures, stitching and light, then upscaled here for free" : "";
    if (nodeEngine(n)) return VS().onlineCost(nodeEngine(n), n.vars || 1, VS().S.create.res);
    var t = VS().S.status && VS().S.status.times, k = n.vars || 1;
    if (!t || !t.per) return "The first run loads the models, so it takes a little longer";
    return "About " + mmss(t.per * k + (t.warm ? 0 : (t.load || 0))) + " · " + k + (k > 1 ? " pictures" : " picture") + " · free";
  }
  function left(n) {
    var p = VS().S.create;
    if (n.kind === "upscale" || runNode !== n || !p.started) return "";
    var el = (Date.now() - p.started) / 1000;
    return p.estimate ? (p.estimate > el ? " · about " + mmss(p.estimate - el) + " left" : " · almost done") : " · " + mmss(el);
  }
  // A window's pictures sit in rows of 4 to its right (1 2 3 4, then 5 6 7 8 below), Nov 2026.
  function slot(n, i) {
    var src = byId(n.from), w = src ? tileW(src) : W, h = src ? tileH(src) : PH + 30;
    return { x: n.x + NODE_W + 70 + (i % 4) * (w + 30), y: n.y + Math.floor(i / 4) * (h + 30), w: w, h: h - 30 };
  }
  // Where a run's pictures go (Nov 2026): a new run starts on a new row below the window's earlier pictures, and the
  // whole block moves down until it is clear of every tile and window (also ones you moved into the way).
  function planRun(n, want) {
    var src = byId(n.from), w = src ? tileW(src) : W, h = src ? tileH(src) : PH + 30;
    var mine = B.tiles.filter(function (k) { return k.via === n.id; });
    var x0 = n.x + NODE_W + 70, y0 = mine.length ? Math.max.apply(null, mine.map(function (k) { return k.y + tileH(k); })) + 30 : n.y;
    var rects = B.tiles.filter(function (k) { return k.kind !== "frame" && (k.kind !== "live" || liveInWorld()); })
      .map(function (k) { return [k.x, k.y, tileW(k), tileH(k)]; })
      .concat(nodes().filter(function (m) { return m !== n; }).map(function (m) { return [m.x, m.y, NODE_W, 300]; }))
      .concat([].concat.apply([], nodes().filter(function (m) { return m !== n && m.busy && m.slots; }).map(function (m) {
        return m.slots.slice(m.got || 0).map(function (g) { return [g.x, g.y, g.w, g.h + 30]; }); })));
    var hit = function (x, y) { return rects.some(function (r) { return r[0] < x + w + 15 && r[0] + r[2] + 15 > x && r[1] < y + h + 15 && r[1] + r[3] + 15 > y; }); };
    for (var tries = 0; tries < 80; tries++) {
      var clear = true;
      for (var i = 0; i < want && clear; i++) if (hit(x0 + (i % 4) * (w + 30), y0 + Math.floor(i / 4) * (h + 30))) clear = false;
      if (clear) break;
      y0 += 40;
    }
    var out = [];
    for (var j = 0; j < want; j++) out.push({ x: x0 + (j % 4) * (w + 30), y: y0 + Math.floor(j / 4) * (h + 30), w: w, h: h - 30 });
    n.slots = out;
  }
  // Where the pictures of a run will land: a placeholder each, at the end of the line, until they come.
  function ghosts(n) {
    if (!n.busy) return [];
    var want = n.kind === "upscale" ? 1 : (n.vars || 1), got = n.got || 0, out = [];
    if (!n.slots || n.slots.length < want) planRun(n, want);
    for (var i = got; i < want; i++) out.push({ x: n.slots[i].x, y: n.slots[i].y, w: n.slots[i].w, h: n.slots[i].h, first: i === got, i: i });
    return out;
  }
  function renderNodes() {
    var box = world.querySelector("#b-nodes");
    if (!box) { box = document.createElement("div"); box.id = "b-nodes"; world.appendChild(box); }
    var ids = {};
    nodes().forEach(function (n) {
      ids[n.id] = 1;
      var h = nodeHTML(n), el = box.querySelector('[data-nid="' + n.id + '"]');
      if (el && el.getAttribute("data-h") === h) { el.style.left = n.x + "px"; el.style.top = n.y + "px"; return; }
      var foc = document.activeElement, keep = foc && el && el.contains(foc) && foc.tagName === "TEXTAREA" ? [foc.selectionStart, foc.selectionEnd] : null;
      var tmp = document.createElement("div"); tmp.innerHTML = h; var nu = tmp.firstChild; nu.setAttribute("data-h", h);
      if (el) el.replaceWith(nu); else box.appendChild(nu);
      if (keep) { var ta = nu.querySelector("textarea"); if (ta) { ta.focus(); ta.setSelectionRange(keep[0], keep[1]); } }
    });
    box.querySelectorAll(".b-node").forEach(function (el) { if (!ids[el.getAttribute("data-nid")]) el.remove(); });
    var gh = "";
    nodes().forEach(function (n) {
      ghosts(n).forEach(function (g) {
        gh += '<div class="b-ghost" data-gn="' + n.id + '" data-gi="' + g.i + '" style="left:' + g.x + "px;top:" + g.y + "px;width:" + g.w + 'px"><div class="b-h"><span>' + (g.first ? "Making…" : "Next") + "</span></div>" +
          '<div class="bg-ph" style="height:' + g.h + 'px"><span>' + (g.first ? esc((n.status || "Starting").replace(/ · \d+%$/, "")) : "waiting") + "</span>" +
          (g.first ? '<i style="width:' + Math.round((n.frac || 0) * 100) + '%"></i>' : "") + "</div></div>";
      });
    });
    var gb = world.querySelector("#b-ghosts");
    if (!gb) { gb = document.createElement("div"); gb.id = "b-ghosts"; world.appendChild(gb); }
    if (gb.getAttribute("data-h") !== gh) { gb.innerHTML = gh; gb.setAttribute("data-h", gh); }
  }
  function selNodeId() {
    var ns = nodes(); if (!ns.length) return null;
    return nodeById(B.selNode) ? B.selNode : ns[ns.length - 1].id;
  }
  function nodeLinks() {
    var d = "";
    // one dot where the lines leave each tile (they all start from the same point, as in Vizcom)
    var from = {};
    nodes().forEach(function (n) { var p = byId(n.from); if (p) from[p.id] = p; });
    Object.keys(from).forEach(function (id) {
      var p = from[id];
      d += '<circle class="b-jn" cx="' + (p.x + tileW(p)) + '" cy="' + (p.y + tileH(p) / 2) + '" r="4.5"/>';
    });
    nodes().forEach(function (n) {
      var p = byId(n.from); if (!p) return;
      var x1 = p.x + tileW(p), y1 = p.y + tileH(p) / 2, x2 = n.x, y2 = n.y + 22, mx = (x1 + x2) / 2;
      var cls = n.id === selNodeId() ? "on dk" : "on gr";
      d += '<path class="' + cls + '" d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + "," + mx + " " + y2 + "," + x2 + " " + y2 + '"/>';
      var g0 = ghosts(n)[0];
      if (g0 && !B.tiles.some(function (k) { return k.via === n.id; })) {
        var a1 = n.x + NODE_W, b1 = n.y + 22, a2 = g0.x, b2 = g0.y + (g0.h + 30) / 2, am = (a1 + a2) / 2;
        d += '<path class="on drag" d="M' + a1 + " " + b1 + " C" + am + " " + b1 + "," + am + " " + b2 + "," + a2 + " " + b2 + '"/>';
      }
    });
    // The line you dragged out stays while you pick a tool.
    var at = acts && acts.x != null && byId(acts.from);
    if (at) {
      var c1 = at.x + tileW(at), e1 = at.y + tileH(at) / 2, c2 = acts.x, e2 = acts.y + 22, cm = (c1 + c2) / 2;
      d += '<path class="on drag" d="M' + c1 + " " + e1 + " C" + cm + " " + e1 + "," + cm + " " + e2 + "," + c2 + " " + e2 + '"/>';
    }
    return d;
  }

  // Running: words tools go through Create's own run (the picture of the tile, these words);
  // Upscale through the upscaler. Results come back to this window's end of the line.
  var hooked = false, runNode = null;
  function hook() {
    if (hooked || !window.vistiq) return; hooked = true;
    var base = window.vistiq.event;
    window.vistiq.event = function (kind, data) {
      try { nodeEvent(kind, data); } catch (e) {}
      return base.apply(this, arguments);
    };
  }
  function nodeEvent(kind, data) {
    if (kind === "studio-result" && runNode && data && data.result) {
      var p = VS().S.create;
      if (runNode.job && data.id !== runNode.job && data.id !== p.job) return;
      if (runNode.enhancing) { runNode.enhPath = data.result.path; return; }
      nodeResult(runNode, data.result);
    } else if (kind === "item" && data) {
      nodes().forEach(function (n) {
        if (!n.busy || n.kind !== "upscale" || data.path !== n.upPath) return;
        if (data.status === "done" && data.out_path) {
          n.busy = false; n.status = ""; nodeResult(n, { path: data.out_path, name: data.out_path.split(/[\\/]/).pop(), w: data.out_w, h: data.out_h, preview: data.out_preview });
        } else if (data.status === "error") { n.busy = false; n.err = data.error || "Couldn't upscale it."; }
        else { n.frac = data.progress || 0; n.status = (data.stage || "Upscaling") + (data.progress ? " · " + Math.round(data.progress * 100) + "%" : ""); }
        render();
      });
    }
  }
  function nodeResult(n, res) {
    if (!res || !res.path || has(res.path)) return;
    var src = byId(n.from);
    var t = { id: uid(), kind: "result", path: res.path, name: res.name, w: res.w, h: res.h, from: src ? src.id : null, via: n.id, made: Date.now() };
    var g = n.slots && n.slots[n.got || 0] || slot(n, B.tiles.filter(function (k) { return k.via === n.id; }).length);
    t.x = g.x; t.y = g.y;
    if (res.preview) thumbs[t.path] = res.preview;
    B.tiles.push(t); n.made = (n.made || 0) + 1; n.got = (n.got || 0) + 1; save(); render(); show(t);
  }
  function nodeText(n) {
    var w = (n.text || "").trim();
    if (n.kind === "refine") return w;
    if (n.kind === "relight") { var l = LIGHTS.filter(function (x) { return x[0] === n.light; })[0] || LIGHTS[2]; return l[2] + (w ? ", " + w : ""); }
    if (n.kind === "variations") return "imagine new design variations" + (w ? " of " + w : " of this design");
    return w;
  }
  function nodeRun(n) {
    var V = VS(), S = V.S, p = S.create, t = byId(n.from);
    if (!t || !t.path) { V.toast("The picture for this is gone from the board."); return; }
    n.err = "";
    if (n.kind === "upscale" && nodeEngine(n) && !n.enhPath) {
      // Enhance first (Nano Banana repaints it at 2K, same design), then the free upscaler takes it further.
      if (p.job || runNode) { V.toast("Studio is still working on something"); return; }
      hook(); runNode = n; n.enhancing = true; n.busy = true; n.frac = 0; n.got = 0; n.status = "Enhancing"; n.job = null; n.seen = false; n.wait = 0;
      B.selNode = n.id; planRun(n, 1); render();
      call("studio_image", t.path).then(function (info) {
        if (!info) { runNode = null; n.busy = false; n.enhancing = false; n.err = "That file was moved or deleted."; render(); return; }
        S.create.source = "image"; V.setImage(p, "src", info); S.boardFrom = t.id; p.refs = [];
        V.job("c", { mask: null, refs: [], instant: false, text: "", preset: "", variations: 1, res: "2k", enhance: true, engine: nodeEngine(n) });
        if (!p.job) { runNode = null; n.busy = false; n.enhancing = false; n.err = "Studio is busy: try again in a moment."; render(); return; }
        nodeWatch(n);
      });
      return;
    }
    if (n.kind === "upscale") {
      if (n.busy && !n.enhPath) return;
      var upFrom = n.enhPath || t.path; n.enhPath = null;
      call("set_setting", "scale", n.scale).then(function () { return call("studio_to_upscale", upFrom); }).then(function (added) {
        var it = (added || [])[0];
        if (!it) { n.err = "Couldn't add it to Upscale."; render(); return; }
        hook(); n.upPath = it.path; n.busy = true; n.frac = 0; n.got = 0; n.status = "Starting"; B.selNode = n.id; planRun(n, 1); render();
        if (it.status === "done" && it.out_path) { nodeEvent("item", it); return; }
        call("start").then(function (ok) { if (!ok && n.busy && it.status !== "running" && it.status !== "queued") { n.busy = false; n.err = "Upscale is busy: try again when it's done."; render(); } });
      });
      return;
    }
    if (p.job || runNode) { V.toast("Studio is still working on something"); return; }
    var text = nodeText(n);
    if (n.kind === "refine" && !text) { V.toast("Type what to change first"); return; }
    hook(); runNode = n; n.busy = true; n.frac = 0; n.got = 0; n.status = "Starting"; n.job = null; n.seen = false; n.wait = 0;
    B.selNode = n.id; planRun(n, n.vars || 1); render();
    call("studio_image", t.path).then(function (info) {
      if (!info) { runNode = null; n.busy = false; n.err = "That file was moved or deleted."; render(); return; }
      S.create.source = "image"; V.setImage(p, "src", info); S.boardFrom = t.id; p.refs = [];
      var extra = { mask: null, refs: [], instant: false };
      if (n.kind === "3d") {
        var hgt = { eye: 0, high: 25, low: -20 }[n.height] || 0;
        extra = Object.assign(extra, { view: { yaw: 0, pitch: hgt, dist: 0, lens: "normal", target: n.view, cabin: null }, text: "", preset: "", variations: n.vars || 1,
                                       res: p.res === "512" ? "1k" : p.res });
      } else {
        p.text = text; p.vars = n.vars; extra = Object.assign(extra, { text: text, variations: n.vars });
        if (n.kind === "relight") extra = Object.assign(extra, { light: n.light || "golden", light_more: (n.text || "").trim() });
      }
      if (V.S.status && V.S.status.online && V.S.status.online.on) extra.engine = nodeEngine(n);
      V.job("c", extra);
      if (!p.job) {           // Create couldn't start (still setting up, or busy)
        runNode = null; n.busy = false; n.err = (S.status && S.status.create_ready) ? "Studio is busy: try again in a moment." : "Image making isn't set up yet: open Create once.";
        render(); return;
      }
      nodeWatch(n);
    });
  }
  function nodeWatch(n) {
    var p = VS().S.create;
    if (runNode !== n) return;
    if (p.job && p.job !== "starting" && !n.job) n.job = p.job;
    if (p.job) n.seen = true;
    if (p.job) {
      n.frac = p.frac || 0; n.status = (p.stage || "Working") + left(n);
      renderNodes(); svgEl.innerHTML = linksSVG(); setTimeout(function () { nodeWatch(n); }, 600);
    } else if (n.busy && !n.seen && (n.wait = (n.wait || 0) + 1) < 20) { setTimeout(function () { nodeWatch(n); }, 300); }
    else if (n.enhancing) {
      n.enhancing = false; n.wait = 0; runNode = null;
      if (n.enhPath && !p.error) { n.status = "Upscaling"; nodeRun(n); }
      else { n.busy = false; n.status = ""; n.enhPath = null; n.err = p.error || "Enhance didn't make a picture."; render(); }
    }
    else { n.busy = false; n.wait = 0; n.status = ""; if (p.error) n.err = p.error; runNode = null; render(); }
  }

  // ---------------------------------------------------------------- menu

  function showMenu(t, x, y) {
    var V = VS(), isLive = t.kind === "live", ps = V.S.psOn;
    var items = [["open", "Open in Focus view"]];
    if (!isLive) items.push(["refine", "Refine…"], ["relight", "Relight…"], ["variations", "Variations…"], ["3d", "3D views…"], ["upscale", "Upscale…"]);
    if (!isLive && ps) items.push(["ps", "Send to Photoshop"]);
    if (!isLive) items.push(["ref", "Use as reference"], ["folder", "Show in folder"], ["export", "Save a copy…"], ["-"],
                            ["copy", "Copy<k>Ctrl C</k>"], ["move", "Move to project…"], ["cover", "Use as project cover"], ["-"], ["remove", "Remove from board"]);
    menu.onclick = null;
    menu.innerHTML = items.map(function (i) { return i[0] === "-" ? "<hr>" : '<button type="button" data-m="' + i[0] + '">' + i[1] + "</button>"; }).join("");
    menu.hidden = false;
    var r = root.getBoundingClientRect();
    menu.style.left = Math.min(x - r.left, r.width - 210) + "px";
    menu.style.top = Math.min(y - r.top, r.height - menu.offsetHeight - 10) + "px";
    menu.setAttribute("data-id", t.id);
  }

  function showGroupMenu(x, y) {
    var few = multi.length <= 4;
    menu.innerHTML = (few ? '<button type="button" data-g="mix">✦ Mix…<kbd>Q</kbd></button><button type="button" data-g="compare">⇆ Compare side by side</button><hr>' : "") +
      '<button type="button" data-g="remove">Remove ' + multi.length + " from board<kbd>Del</kbd></button>";
    menu.hidden = false;
    var r = root.getBoundingClientRect();
    menu.style.left = Math.min(x - r.left, r.width - 210) + "px";
    menu.style.top = Math.min(y - r.top, r.height - menu.offsetHeight - 10) + "px";
  }

  function menuAction(a, t) {
    var V = VS(), S = V.S;
    menu.hidden = true;
    if (a === "open") open(t);
    // The tools open as a small window next to the tile (as when dragging its + out).
    else if (a === "refine" || a === "relight" || a === "variations" || a === "upscale" || a === "3d") nodeOpen(a, t);
    else if (a === "ps") V.sendPS(t.path);
    else if (a === "ref") call("studio_image", t.path).then(function (info) { if (info) { V.addRef(info); V.go("create"); } });
    else if (a === "folder") { var x = api(); if (x && x.reveal) x.reveal(t.path); }
    else if (a === "export") call("studio_save_copy", t.path).then(function (r) { if (r) V.toast("Saved " + r); });
    else if (a === "copy") copyTiles(chosen(t));
    else if (a === "cover") call("studio_project_cover", P.id, t.path).then(function () { V.toast("Cover of “" + P.name + "”"); });
    else if (a === "move") moveMenu(chosen(t));
    else if (a === "remove") { B.tiles = B.tiles.filter(function (k) { return k !== t; }); B.tiles.forEach(function (k) { if (k.from === t.id) k.from = t.from || null; }); save(); render(); }
  }

  // ---------------------------------------------------------------- copy, paste, move between projects
  // Tiles (a picture and its layers; layers are kept per picture, so they come along) go from one
  // project to another; what was made from them stays behind unless it is copied too.
  function chosen(t) { return multi.length > 1 && multi.indexOf(t.id) >= 0 ? multi.map(byId).filter(Boolean) : [t]; }
  function clean(t) { return { kind: t.kind, path: t.path, name: t.name, w: t.w, h: t.h, x: t.x, y: t.y, made: t.made, from: t.from || null, id: t.id }; }
  function copyTiles(list) {
    list = list.filter(function (t) { return t.path; }); if (!list.length) return;
    var S = VS().S;
    S.tileClip = { from: P.id, tiles: list.map(clean), seq: -1 };
    call("studio_clip_seq").then(function (n) { if (S.tileClip) S.tileClip.seq = n || 0; });
    VS().toast(list.length === 1 ? "Copied · open a project and press Ctrl V (or Ctrl V on a picture: as a layer)" : "Copied " + list.length + " pictures · Ctrl V in another project");
  }
  function fresh(list) {          // new ids; links kept only inside the copied set
    var map = {};
    list.forEach(function (t) { map[t.id] = uid(); });
    return list.map(function (t) { var c = clean(t); c.id = map[t.id]; c.from = t.from && map[t.from] ? map[t.from] : null; c.kind = c.from ? "result" : "image"; return c; });
  }
  function pasteTiles() {
    var clip = VS().S.tileClip; if (!clip) return;
    var list = fresh(clip.tiles).filter(function (t) { return !has(t.path); });
    if (!list.length) { VS().toast("Those pictures are already on this board"); return; }
    var minX = Math.min.apply(null, list.map(function (t) { return t.x; })), minY = Math.min.apply(null, list.map(function (t) { return t.y; }));
    var rest = B.tiles.filter(function (t) { return t.path; });
    var x0 = rest.length ? Math.max.apply(null, rest.map(function (t) { return t.x; })) + W + GAP_X : 0, y0 = rest.length ? Math.min.apply(null, rest.map(function (t) { return t.y; })) : 0;
    list.forEach(function (t) { t.x = x0 + t.x - minX; t.y = y0 + t.y - minY; B.tiles.push(t); });
    multi = list.length > 1 ? list.map(function (t) { return t.id; }) : []; B.sel = list[0].id;
    save(); lastHTML = ""; render(); show(list[0]);
    VS().toast(list.length === 1 ? "Pasted" : "Pasted " + list.length + " pictures");
  }
  function moveMenu(list) {
    call("studio_projects").then(function (ps) {
      var others = (ps || []).filter(function (p) { return p.id !== P.id; });
      if (!others.length) { VS().toast("Make another project first (Projects → New project)"); return; }
      menu.innerHTML = '<div class="b-mt">Move ' + (list.length > 1 ? list.length + " pictures" : "to") + "</div>" + others.map(function (p) {
        return '<button type="button" data-mp="' + esc(p.id) + '">' + esc(p.name) + "<small>" + p.count + "</small></button>"; }).join("");
      menu.hidden = false;
      menu.onclick = function (e) {
        var b = e.target.closest("[data-mp]"); if (!b) return;
        menu.hidden = true; menu.onclick = null;
        var pid = b.getAttribute("data-mp"), name = b.firstChild.textContent;
        call("studio_board_append", pid, fresh(list)).then(function (ok) {
          if (!ok) { VS().toast("Couldn't move them"); return; }
          var gone = list.map(function (t) { return t.id; });
          B.tiles = B.tiles.filter(function (k) { return gone.indexOf(k.id) < 0; });
          B.tiles.forEach(function (k) { if (gone.indexOf(k.from) >= 0) k.from = null; });
          multi = []; save(); lastHTML = ""; render();
          VS().toast("Moved to “" + name + "”");
        });
      };
    });
  }

  // ---------------------------------------------------------------- organize

  function organize() {
    // Like Vizcom: the Live tile on the far left; pictures flow to the right in creation
    // order, each with what was made from it to its right; a new row only when it gets wide.
    var kids = {};
    B.tiles.forEach(function (t) { var f = t.from && byId(t.from) ? t.from : ""; (kids[f] = kids[f] || []).push(t); });
    Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return (a.made || 0) - (b.made || 0); }); });
    function lay(t, x, top) {               // returns [right edge, bottom]
      t.x = x; t.y = top;
      var right = x + tileW(t), bottom = top + tileH(t), cy = top;
      (kids[t.id] || []).forEach(function (c) { var r = lay(c, x + tileW(t) + GAP_X, cy); cy = r[1] + GAP_Y; right = Math.max(right, r[0]); bottom = Math.max(bottom, r[1]); });
      return [right, bottom];
    }
    var lv0 = live(), lv = liveInWorld() ? lv0 : null;
    var roots = (kids[""] || []).filter(function (t) { return t !== lv0; });
    if (!lv && lv0) roots = roots.concat(kids[lv0.id] || []);     // Live isn't on the board: what came from it starts rows
    if (lv) { lv.x = 0; lv.y = 0; }
    // Lay the groups out in a block about as wide as the screen is (16:9), not one long line.
    var area = 0;
    roots.forEach(function (t) { var r = lay(t, 0, 0); area += (r[0] + GAP_X) * (r[1] + GAP_Y); });
    var x0 = lv ? W + GAP_X * 1.5 : 0, maxW = x0 + Math.max(W * 2 + GAP_X, 1.35 * Math.sqrt(area * 16 / 9)), x = x0, y = 0, rowB = 0;
    roots.forEach(function (t) {
      var r = lay(t, x, y);
      if (r[0] > maxW && x > x0) { x = x0; y = rowB + GAP_Y * 1.6; r = lay(t, x, y); }
      x = r[0] + GAP_X; rowB = Math.max(rowB, r[1]);
    });
    if (lv) (kids[lv.id] || []).forEach(function (c, i) { lay(c, 0, tileH(lv) + GAP_Y + i * (tileH(c) + GAP_Y)); });
    world.classList.add("anim"); setTimeout(function () { world.classList.remove("anim"); }, 450);
    lastHTML = ""; save(); render(); fit();
  }

  function fit() {
    var tiles = B.tiles.filter(function (t) { return t.kind !== "live" || liveInWorld(); });
    if (!tiles.length) return;
    var cv = root.querySelector("#b-cv").getBoundingClientRect();
    var x0 = Math.min.apply(null, tiles.map(function (t) { return t.x; })), y0 = Math.min.apply(null, tiles.map(function (t) { return t.y; }));
    var x1 = Math.max.apply(null, tiles.map(function (t) { return t.x + tileW(t); })), y1 = Math.max.apply(null, tiles.map(function (t) { return t.y + tileH(t); }));
    var z = Math.max(0.15, Math.min(1.2, Math.min((cv.width - 120) / (x1 - x0), (cv.height - 160) / (y1 - y0))));
    B.view = { z: z, x: (cv.width - (x1 - x0) * z) / 2 - x0 * z, y: 70 + (cv.height - 110 - (y1 - y0) * z) / 2 - y0 * z };
    save(); applyView();
  }

  // ---------------------------------------------------------------- input

  var spaceDown = false, userSel = false;     // a tile picked by the user (not just the newest)
  function wire() {
    var cv = root.querySelector("#b-cv"), drag = null;
    document.addEventListener("keyup", function (e) { if (e.key === " ") { spaceDown = false; cv.classList.remove("pan"); } });
    root.addEventListener("input", function (e) {
      if (e.target.id === "bm-text" && mix) mix.text = e.target.value;
      if (e.target.id === "ba-q") actsFilter(e.target.value);
      if (e.target.hasAttribute && e.target.hasAttribute("data-nt")) {
        var nn = nodeById(e.target.closest(".b-node").getAttribute("data-nid"));
        if (nn) { nn.text = e.target.value; save(); var rb = e.target.closest(".b-node").querySelector("[data-nr]"); if (rb && nn.kind === "refine" && !nn.busy) rb.disabled = !nn.text.trim(); }
      }
    });
    root.addEventListener("change", function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute("data-ne")) {
        var nn = nodeById(e.target.closest(".b-node").getAttribute("data-nid")); if (nn) { nn.engine = e.target.value; save(); renderNodes(); }
      }
    });
    root.addEventListener("keydown", function (e) {
      if (e.target.id === "ba-q") {
        if (e.key === "Enter") { var f = actsFilter(e.target.value); if (f) actsPick(f.getAttribute("data-tool")); e.preventDefault(); }
        else if (e.key === "Escape") { actsClose(); e.stopPropagation(); }
      }
      if (e.target.hasAttribute && e.target.hasAttribute("data-nt") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        var n2 = nodeById(e.target.closest(".b-node").getAttribute("data-nid")); if (n2) nodeRun(n2); e.preventDefault();
      }
    });
    root.addEventListener("change", function (e) { var u = e.target.getAttribute && e.target.getAttribute("data-use"); if (u && mix) mix.use[u] = e.target.value; });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-b]");
      if (b) {
        var a = b.getAttribute("data-b");
        if (a === "add") call("studio_pick_path").then(function (p) {
          if (p) addWith(function () { return call("studio_image", p); }, p.split(/[\\/]/).pop());
        });
        else if (a === "plus") VS().plusMenu(b, function (info) { add(info, null); }, addWith);
        else if (a === "fit") fit();
        else if (a === "projects") VS().go("projects");
        else if (a === "pstab") { VS().useSource("live"); VS().S.boardFrom = "live"; VS().go("create"); }
        else if (a === "organize") organize();
        else if (a === "connect") {
          // Links by itself once a file is open; until then, says what to do.
          var S = VS().S, app = S.liveApp || "photoshop"; S.live.stopped = false; psAsked = true;
          call("studio_live", true, app).then(function (r) { S.live.on = !!(r && r.on); S.live.app = app; S.live.frames = 0; S.live.msg = r && r.error || ""; render(); });
          render();
        }
        else if (a === "livefold") { B.liveOpen = !liveOpen(); lastHTML = ""; save(); render(); }

        return;
      }
      var g = e.target.closest("[data-g]");
      if (g) { menu.hidden = true; groupAction(g.getAttribute("data-g")); return; }
      var tb = e.target.closest("#b-acts [data-tool]");
      if (tb) { actsPick(tb.getAttribute("data-tool")); return; }
      if (e.target.closest("#b-acts") || e.target.closest(".b-port")) return;
      if (acts && Date.now() - (acts.at || 0) > 250) actsClose();      // (not the click that ends the drag that opened it)
      var ne = e.target.closest(".b-node");
      if (ne) {
        var n = nodeById(ne.getAttribute("data-nid")), nb = e.target.closest("button");
        if (!n || !nb) return;
        if (nb.hasAttribute("data-nx")) nodeClose(n);
        else if (nb.hasAttribute("data-nback")) {           // back to the tool list, where the window was
          if (n.busy) return;
          var tt = byId(n.from), rr = root.getBoundingClientRect(), vz = B.view, wx = n.x, wy = n.y;
          nodeClose(n);
          if (tt) actsOpen(tt, rr.left + wx * vz.z + vz.x, rr.top + wy * vz.z + vz.y + 20, wx, wy);
          return;
        }
        else if (nb.hasAttribute("data-nr")) nodeRun(n);
        else if (n.busy) return;
        else if (nb.hasAttribute("data-nv")) n.vars = +nb.getAttribute("data-nv");
        else if (nb.hasAttribute("data-nl")) n.light = nb.getAttribute("data-nl");
        else if (nb.hasAttribute("data-n3")) n.view = nb.getAttribute("data-n3");
        else if (nb.hasAttribute("data-nh")) n.height = nb.getAttribute("data-nh");
        else if (nb.hasAttribute("data-nu")) n.scale = nb.getAttribute("data-nu");
        else if (nb.hasAttribute("data-neng")) n.engine = nb.getAttribute("data-neng");
        save(); renderNodes(); return;
      }
      var mx = e.target.closest("#b-mix");
      if (mx) {
        var b2 = e.target.closest("[data-main],[data-x],[data-v]");
        if (!b2 || !mix) return;
        if (b2.hasAttribute("data-main") && !mix.busy) {
          var nm = b2.getAttribute("data-main"), old = mix.main;
          if (nm !== old) { mix.use[old] = mix.use[nm] || "describe"; delete mix.use[nm]; mix.main = nm; }
        }
        else if (b2.getAttribute("data-x") === "close") { mixClose(); return; }
        else if (b2.getAttribute("data-x") === "run") { mixRun(); return; }
        else if (b2.hasAttribute("data-v")) mix.vars = Math.max(1, Math.min(4, mix.vars + +b2.getAttribute("data-v")));
        mixRender(); return;
      }
      var m = e.target.closest("[data-m]");
      if (m) { var t = byId(menu.getAttribute("data-id")); if (t) menuAction(m.getAttribute("data-m"), t); return; }
      if (!e.target.closest("#b-menu")) menu.hidden = true;
    });
    root.querySelector("#b-livefloat").addEventListener("dblclick", function (e) {
      if (!e.target.closest("button")) open(live());
    });
    cv.addEventListener("dblclick", function (e) {
      // The canvas holds the pointer while dragging, so find the tile under it.
      var hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest(".b-tile");
      if (el) open(byId(el.getAttribute("data-id")));
    });
    cv.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var el = e.target.closest(".b-tile"); if (!el) { menu.hidden = true; return; }
      var t = byId(el.getAttribute("data-id"));
      if (multi.length > 1 && multi.indexOf(t.id) >= 0) { showGroupMenu(e.clientX, e.clientY); return; }
      B.sel = t.id; render(); showMenu(t, e.clientX, e.clientY);
    });
    cv.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.button !== 1) return;
      var pt = e.button === 0 && e.target.closest(".b-port");
      if (pt) {                       // drag a line out of a tile: the tools open where you let go
        e.preventDefault(); menu.hidden = true; actsClose();
        var src = byId(pt.getAttribute("data-port")); if (!src) return;
        portDrag = { t: src, sx: e.clientX, sy: e.clientY, moved: false, path: "" };
        cv.setPointerCapture(e.pointerId); return;
      }
      var nh = e.button === 0 && e.target.closest(".bn-h");
      if (nh && !e.target.closest("button")) {          // a tool window moves by its title
        var nd = nodeById(nh.getAttribute("data-nh")); if (nd) B.selNode = nd.id;
        if (nd) { drag = { node: nd, sx: e.clientX, sy: e.clientY, x: nd.x, y: nd.y, moved: false }; cv.setPointerCapture(e.pointerId); }
        return;
      }
      var gst = e.button === 0 && e.target.closest(".b-ghost");
      if (gst) {                     // a placeholder moves like a tile; the picture then lands where it is
        var gn = nodeById(gst.getAttribute("data-gn")), gi = +gst.getAttribute("data-gi");
        if (gn && gn.slots && gn.slots[gi]) { drag = { ghost: gn.slots[gi], node: null, sx: e.clientX, sy: e.clientY, x: gn.slots[gi].x, y: gn.slots[gi].y, moved: false }; cv.setPointerCapture(e.pointerId); }
        return;
      }
      var tn = e.target.closest(".b-node");
      if (tn) { menu.hidden = true; if (B.selNode !== tn.getAttribute("data-nid")) { B.selNode = tn.getAttribute("data-nid"); svgEl.innerHTML = linksSVG(); } return; }      // typing and buttons in a tool window
      if (e.target.closest("button")) return;
      menu.hidden = true;
      var fh = e.button === 0 && e.target.closest(".b-fh");
      if (fh) {                      // the frame's name: drag the frame and everything in it
        var fr = byId(fh.getAttribute("data-fid"));
        var mem = [fr].concat(B.tiles.filter(function (k) { return k.frame === fr.id; }));
        drag = { t: null, group: mem.map(function (k) { return { k: k, x: k.x, y: k.y }; }), sx: e.clientX, sy: e.clientY, moved: false, frame: fr };
        cv.setPointerCapture(e.pointerId); return;
      }
      var el = e.button === 0 && e.target.closest(".b-tile");
      var t = el && byId(el.getAttribute("data-id"));
      if (t && (e.ctrlKey || e.shiftKey || e.metaKey) && t.kind !== "live") {
        // Ctrl or Shift click: add to (or take out of) the group, up to 4.
        if (!multi.length && B.sel && B.sel !== t.id && B.sel !== "live" && byId(B.sel)) multi.push(B.sel);
        var k = multi.indexOf(t.id);
        if (k >= 0) multi.splice(k, 1); else multi.push(t.id);
        lastHTML = ""; render(); return;
      }
      if (t && multi.length && multi.indexOf(t.id) < 0) { multi = []; lastHTML = ""; }
      if (t) userSel = true;
      if (t) { B.sel = t.id; el.parentNode && world.querySelectorAll(".b-tile.sel").forEach(function (n) { n.classList.remove("sel"); }); el.classList.add("sel"); }
      // Empty canvas: drag selects (a box); Space or the middle button pans.
      var pan = !t && (e.button === 1 || spaceDown);
      var group = t && multi.length > 1 && multi.indexOf(t.id) >= 0 ? multi.map(byId).filter(Boolean).map(function (k) { return { k: k, x: k.x, y: k.y }; }) : null;
      drag = { t: t, group: group, box: !t && !pan, add: e.shiftKey || e.ctrlKey, keep: multi.slice(), sx: e.clientX, sy: e.clientY,
               x: t ? t.x : B.view.x, y: t ? t.y : B.view.y, moved: false };
      if (drag.box && !drag.add) { if (multi.length) { multi = []; lastHTML = ""; render(); } B.sel = null; world.querySelectorAll(".b-tile.sel").forEach(function (n) { n.classList.remove("sel"); }); }
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", function (e) {
      if (portDrag) {
        var qx = e.clientX - portDrag.sx, qy = e.clientY - portDrag.sy;
        if (!portDrag.moved && Math.abs(qx) + Math.abs(qy) < 5) return;
        portDrag.moved = true;
        var rr = root.getBoundingClientRect(), vv = B.view, s0 = portDrag.t;
        var ex = (e.clientX - rr.left - vv.x) / vv.z, ey = (e.clientY - rr.top - vv.y) / vv.z;
        var p1 = s0.x + tileW(s0), q1 = s0.y + tileH(s0) / 2, pm = (p1 + ex) / 2;
        portDrag.path = '<path class="on drag" d="M' + p1 + " " + q1 + " C" + pm + " " + q1 + "," + pm + " " + ey + "," + ex + " " + ey + '"/>';
        portDrag.wx = ex; portDrag.wy = ey;
        svgEl.innerHTML = linksSVG(); return;
      }
      if (!drag) return;
      if (drag.ghost) {
        var gx = e.clientX - drag.sx, gy = e.clientY - drag.sy;
        if (!drag.moved && Math.abs(gx) + Math.abs(gy) < 3) return;
        drag.moved = true; drag.ghost.x = Math.round(drag.x + gx / B.view.z); drag.ghost.y = Math.round(drag.y + gy / B.view.z);
        renderNodes(); svgEl.innerHTML = linksSVG(); return;
      }
      if (drag.node) {
        var ddx = e.clientX - drag.sx, ddy = e.clientY - drag.sy;
        if (!drag.moved && Math.abs(ddx) + Math.abs(ddy) < 3) return;
        drag.moved = true; drag.node.x = Math.round(drag.x + ddx / B.view.z); drag.node.y = Math.round(drag.y + ddy / B.view.z);
        var ne2 = world.querySelector('.b-node[data-nid="' + drag.node.id + '"]'); if (ne2) { ne2.style.left = drag.node.x + "px"; ne2.style.top = drag.node.y + "px"; }
        svgEl.innerHTML = linksSVG(); return;
      }
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      if (drag.box) {
        var r = root.getBoundingClientRect(), v = B.view, mq = root.querySelector("#b-marq");
        var ax = Math.min(drag.sx, e.clientX) - r.left, ay = Math.min(drag.sy, e.clientY) - r.top, bw = Math.abs(dx), bh = Math.abs(dy);
        mq.hidden = false; mq.style.left = ax + "px"; mq.style.top = ay + "px"; mq.style.width = bw + "px"; mq.style.height = bh + "px";
        var wx0 = (ax - v.x) / v.z, wy0 = (ay - v.y) / v.z, wx1 = (ax + bw - v.x) / v.z, wy1 = (ay + bh - v.y) / v.z;
        var inBox = B.tiles.filter(function (k) { return k.kind !== "live" && k.kind !== "frame" && k.x < wx1 && k.x + tileW(k) > wx0 && k.y < wy1 && k.y + tileH(k) > wy0; }).map(function (k) { return k.id; });
        var next = drag.add ? drag.keep.concat(inBox.filter(function (id) { return drag.keep.indexOf(id) < 0; })) : inBox;
        if (next.join() !== multi.join()) { multi = next; lastHTML = ""; render(); }
        return;
      }
      if (drag.group) {
        drag.group.forEach(function (g) {
          g.k.x = Math.round(g.x + dx / B.view.z); g.k.y = Math.round(g.y + dy / B.view.z);
          var n = world.querySelector('[data-id="' + g.k.id + '"],.b-frame[data-fid="' + g.k.id + '"]'); if (n) { n.style.left = g.k.x + "px"; n.style.top = g.k.y + "px"; }
        });
        svgEl.innerHTML = linksSVG(); lastHTML = "";
      } else if (drag.t) {
        drag.t.x = Math.round(drag.x + dx / B.view.z); drag.t.y = Math.round(drag.y + dy / B.view.z);
        var n = world.querySelector('.b-tile[data-id="' + drag.t.id + '"]');
        if (n) { n.style.left = drag.t.x + "px"; n.style.top = drag.t.y + "px"; }
        svgEl.innerHTML = linksSVG(); lastHTML = "";
      } else { B.view.x = drag.x + dx; B.view.y = drag.y + dy; applyView(); }
      if (mix) mixRender();
      cv.classList.add("grab");
    });
    cv.addEventListener("pointerup", function (e) {
      if (portDrag) {
        var pd2 = portDrag; portDrag = null;
        try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
        if (pd2.moved) { svgEl.innerHTML = linksSVG(); actsOpen(pd2.t, e.clientX, e.clientY, pd2.wx, pd2.wy - 22); }
        else VS().toast("Drag the + out to a free spot to pick a tool");
        return;
      }
      if (drag && (drag.node || drag.ghost)) { if (drag.moved) save(); drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (x) {} return; }
      if (drag && drag.box) {
        root.querySelector("#b-marq").hidden = true;
        if (multi.length === 1) { B.sel = multi[0]; multi = []; lastHTML = ""; render(); }
      } else if (drag && drag.moved) save();
      drag = null; cv.classList.remove("grab");
      try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
    });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect(), v = B.view;
      var now = Date.now(), mouse = !e.ctrlKey && now >= (padUntil || 0) && Math.abs(e.deltaX) < 1 &&
        (e.wheelDeltaY !== undefined ? e.wheelDeltaY % 120 === 0 : Math.abs(e.deltaY) >= 40) && !e.shiftKey;
      if (!e.ctrlKey && !mouse) padUntil = now + 350;      // a touchpad slide, glide included, stays a pan
      if (e.ctrlKey || mouse) {
        var z = Math.max(0.1, Math.min(10, v.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        var mx = e.clientX - r.left, my = e.clientY - r.top;
        v.x = mx - (mx - v.x) * z / v.z; v.y = my - (my - v.y) * z / v.z; v.z = z;
      } else { v.x -= e.deltaX; v.y -= e.deltaY; }        // trackpad: two fingers pan
      applyView(); save(); if (mix) mixRender();
    }, { passive: false });
    document.addEventListener("keydown", function (e) {
      if (VS().S.page !== "board") return;
      if (e.key === "Escape" && acts) { actsClose(); return; }
      if (e.key === "Escape") { menu.hidden = true; var cmp = document.getElementById("b-compare"); if (cmp) cmp.remove(); else if (mix && !mix.busy) mixClose(); else clearMulti(); return; }
      var inText = /^(TEXTAREA|INPUT|SELECT)$/.test((document.activeElement || {}).tagName || "");
      if (inText) return;
      if (e.key === " " && !spaceDown) { spaceDown = true; cv.classList.add("pan"); e.preventDefault(); return; }
      if ((e.key === "q" || e.key === "Q") && !e.ctrlKey && multi.length > 1) { e.preventDefault(); groupAction("mix"); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && multi.length > 1) { removeTiles(multi.map(byId).filter(Boolean)); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { var sel = multi.length ? multi.map(byId).filter(Boolean) : (B.sel && byId(B.sel) ? [byId(B.sel)] : []); if (sel.length) { e.preventDefault(); copyTiles(sel); } return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        var clip = VS().S.tileClip, img = function () { addWith(function () { return call("studio_paste"); }, "Pasted picture"); };
        if (!clip) img();
        else call("studio_clip_seq").then(function (n) { if (clip.seq > 0 && n && n !== clip.seq) { VS().S.tileClip = null; img(); } else pasteTiles(); });
      }
      else if ((e.key === "Delete" || e.key === "Backspace") && B.sel && B.sel !== "live") { var t = byId(B.sel); if (t) menuAction("remove", t); }
      else if (e.key === "Enter" && B.sel) { var s = byId(B.sel); if (s) open(s); }
    });
  }

  // A new picture from the + menu in Focus view: on the board, and open it.
  // A sketch branched off another tile (Live): sits next to it, joined by a line.
  function refreshThumb(path) { if (thumbs[path] !== undefined) { delete thumbs[path]; lastHTML = ""; render(); } }
  // A 3D view: next to the picture it was made from, joined by a line, like any result.
  function addBeside(res, src) {
    if (!res || has(res.path)) return;
    var t0 = B.tiles.filter(function (k) { return k.path === src.path; })[0];
    if (!t0) t0 = add({ path: src.path, name: src.name, w: src.w, h: src.h, preview: src.preview }, null);
    var keep = B.view && { x: B.view.x, y: B.view.y, z: B.view.z }, sel = B.sel;
    add({ path: res.path, name: res.name, w: res.w, h: res.h, preview: res.preview }, t0 ? t0.id : null);
    B.sel = sel; if (keep && VS().S.page !== "board") { B.view = keep; save(); }   // made on the 3D page: don't move the board
  }
  function addFrom(info, fromId) { return add(info, byId(fromId) ? fromId : null); }
  function addAndOpen(info) { var t = add(info, null); if (t) open(t); return t; }

  window.VSBoard = { load: load, project: function () { return { id: P.id, name: P.name }; }, paste: pasteTiles, multi: function () { return multi.slice(); }, build: build, render: render, addImages: addImages, upStart: upStart, upProgress: upProgress, upDone: upDone, upFail: upFail, addResult: addResult, has: has, organize: organize, add: add, addAndOpen: addAndOpen, addFrom: addFrom, addBeside: addBeside, refreshThumb: refreshThumb, open: function (id) { var t = byId(id); if (t) open(t); },
                     _state: function () { return B; } };
})();
