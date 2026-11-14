/* Vistiq Studio — the board: one infinite canvas where everything lives.
   The Live tile (Photoshop / Affinity) is always there; pasted, dropped or
   added images become tiles; results added from the Focus view sit next to
   what they were made from, joined by a line. Double-click opens Focus view,
   right-click gives the actions, Organize lays it all out in creation order. */
(function () {
  "use strict";
  var W = 300;                       // tile width on the board, in board units
  var GAP_X = 90, GAP_Y = 46;
  var B = { tiles: [], view: { x: 60, y: 40, z: 0.8 } }, thumbs = {}, root, world, svgEl, menu, loaded = false, saveT = 0;

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
  function tileH() { return PH + 30; }

  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { call("studio_board_save", B); }, 400);
  }

  function ensureLive() {
    if (!live()) B.tiles.unshift({ id: "live", kind: "live", x: 0, y: 0, w: 16, h: 9, made: 0 });
  }

  // ---------------------------------------------------------------- build

  function build(el) {
    root = el;
    root.innerHTML =
      '<div class="b-cv" id="b-cv"><div class="b-world" id="b-world"><svg class="b-links" id="b-links"></svg></div></div>' +
      '<div class="b-top"><div class="b-title">Board</div></div>' +
      '<div class="b-bar"><button type="button" class="b-plus" data-b="plus" title="Add: blank canvas, image, paste, phone">' +
      '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button><span class="b-sep"></span>' +
      '<button type="button" data-b="organize" title="Lay the board out neatly, in the order things were made">' +
      '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="3" y="12" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/></svg>Organize</button>' +
      '<button type="button" data-b="fit">Fit</button><span class="b-zoom" id="b-zoom">80%</span></div>' +
      '<div class="b-hint" id="b-hint">Click + for a blank canvas, an image or your phone · paste with Ctrl V or drop images here. Double-click a tile to work on it.</div>' +
      '<div class="b-menu" id="b-menu" hidden></div>';
    world = root.querySelector("#b-world"); svgEl = root.querySelector("#b-links"); menu = root.querySelector("#b-menu");
    wire();
    call("studio_board_get").then(function (b) {
      if (b && b.tiles) B = b;
      if (!B.view) B.view = { x: 60, y: 40, z: 0.8 };
      ensureLive(); loaded = true; render();
    });
  }

  // ---------------------------------------------------------------- render

  function liveInfo() {
    var S = VS().S, src = S.create.liveSrc || (S.create.src && S.create.src.live ? S.create.src : null);
    return { on: !!(S.live && S.live.on && src), src: src, doc: S.live && S.live.doc, state: S.live && S.live.state, msg: S.live && S.live.msg };
  }

  function tileHTML(t) {
    var sel = t.id === B.sel ? " sel" : "";
    if (t.kind === "live") {
      var L = liveInfo();
      var img = L.on ? '<div class="b-pic"><img src="' + L.src.preview + '" alt=""></div>' :
        '<div class="b-empty b-off"><span>' + (L.state ? esc(L.state) : "Photoshop or Affinity, live") + '</span><button type="button" data-b="connect">Connect</button>' + (L.msg ? "<small>" + esc(L.msg) + "</small>" : "") + "</div>";
      return '<div class="b-tile b-live' + (L.on ? " on" : "") + sel + '" data-id="live" style="left:' + t.x + "px;top:" + t.y + "px;width:" + W + 'px">' +
        '<div class="b-h"><span><i class="b-dot"></i>Live' + (L.on && L.doc ? " · " + esc(L.doc) : "") + "</span><small>" + (L.on ? "Photoshop" : "") + "</small></div>" + img +
        "</div>";
    }
    var th = thumbs[t.path];
    if (th === undefined) { thumbs[t.path] = null; call("studio_thumb", t.path).then(function (d) { thumbs[t.path] = d || "missing"; render(); }); }
    var pic = th && th !== "missing" ? '<div class="b-pic"><img src="' + th + '" alt=""></div>' : '<div class="b-empty">' + (th === "missing" ? "File moved or deleted" : "") + "</div>";
    return '<div class="b-tile' + sel + '" data-id="' + t.id + '" style="left:' + t.x + "px;top:" + t.y + "px;width:" + W + 'px">' +
      '<div class="b-h"><span>' + esc(VS().short(t.name || "")) + "</span><small>" + (t.w ? t.w + " × " + t.h : "") + "</small></div>" + pic + "</div>";
  }

  function linksSVG() {
    var d = "";
    B.tiles.forEach(function (t) {
      var p = t.from && byId(t.from); if (!p) return;
      var x1 = p.x + W, y1 = p.y + tileH(p) / 2, x2 = t.x, y2 = t.y + tileH(t) / 2, mx = (x1 + x2) / 2;
      d += '<path d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + "," + mx + " " + y2 + "," + x2 + " " + y2 + '"/>';
    });
    return d;
  }

  var lastHTML = "";
  function render() {
    if (!root || !loaded) return;
    ensureLive();
    var h = B.tiles.map(tileHTML).join("");
    if (h !== lastHTML) {
      lastHTML = h;
      world.querySelectorAll(".b-tile").forEach(function (n) { n.remove(); });
      world.insertAdjacentHTML("beforeend", h);
    }
    svgEl.innerHTML = linksSVG();
    applyView();
    root.querySelector("#b-hint").hidden = B.tiles.length > 1;
  }

  function applyView() {
    var v = B.view;
    world.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.z + ")";
    var cv = root.querySelector("#b-cv");
    cv.style.backgroundSize = (22 * v.z) + "px " + (22 * v.z) + "px";
    cv.style.backgroundPosition = v.x + "px " + v.y + "px";
    root.querySelector("#b-zoom").textContent = Math.round(v.z * 100) + "%";
  }

  // ---------------------------------------------------------------- tiles

  function place(t, from) {
    var p = from && byId(from);
    if (p) {
      var kids = B.tiles.filter(function (k) { return k.from === from && k !== t; });
      t.x = p.x + W + GAP_X;
      t.y = kids.length ? Math.max.apply(null, kids.map(function (k) { return k.y + tileH(k); })) + GAP_Y : p.y;
    } else {
      var maxY = Math.max.apply(null, B.tiles.map(function (k) { return k.y + tileH(k); }).concat([0]));
      t.x = 0; t.y = maxY + GAP_Y;
    }
  }

  function add(info, from) {
    if (!info) return null;
    var t = { id: uid(), kind: from ? "result" : "image", path: info.path, name: info.name, w: info.w, h: info.h,
              from: from || null, made: Date.now() };
    place(t, from);
    if (info.preview) thumbs[t.path] = info.preview;
    B.tiles.push(t); B.sel = t.id; save(); render();
    return t;
  }

  function addImages(list) { (list || []).forEach(function (i) { add(i, null); }); }

  function addResult(c, from) {
    if (!c || has(c.path)) return;
    add({ path: c.path, name: c.name, w: c.w, h: c.h }, from && byId(from) ? from : null);
  }

  function has(path) { return B.tiles.some(function (t) { return t.path === path; }); }

  function open(t) {
    var V = VS(), S = V.S;
    if (t.kind === "live") {
      S.create.source = "live";
      var src = S.create.liveSrc; if (src) V.setImage(S.create, "src", src);
      S.boardFrom = "live"; V.go("create"); return;
    }
    call("studio_image", t.path).then(function (info) {
      if (!info) { V.toast("That file was moved or deleted."); return; }
      S.create.source = "image"; V.setImage(S.create, "src", info); S.boardFrom = t.id; V.go("create");
    });
  }

  // ---------------------------------------------------------------- menu

  function showMenu(t, x, y) {
    var V = VS(), isLive = t.kind === "live", ps = V.S.psOn;
    var items = [["open", "Open in Focus view"]];
    if (!isLive) items.push(["refine", "Refine…"], ["variations", "More like this"], ["upscale", "Upscale"]);
    if (!isLive && ps) items.push(["ps", "Send to Photoshop"]);
    if (!isLive) items.push(["ref", "Use as reference"], ["folder", "Show in folder"], ["export", "Save a copy…"], ["-"], ["remove", "Remove from board"]);
    menu.innerHTML = items.map(function (i) { return i[0] === "-" ? "<hr>" : '<button type="button" data-m="' + i[0] + '">' + i[1] + "</button>"; }).join("");
    menu.hidden = false;
    var r = root.getBoundingClientRect();
    menu.style.left = Math.min(x - r.left, r.width - 210) + "px";
    menu.style.top = Math.min(y - r.top, r.height - menu.offsetHeight - 10) + "px";
    menu.setAttribute("data-id", t.id);
  }

  function menuAction(a, t) {
    var V = VS(), S = V.S;
    menu.hidden = true;
    if (a === "open") open(t);
    else if (a === "refine") { open(t); setTimeout(function () { var el = document.getElementById("c-refine"); if (el) el.focus(); }, 300); }
    else if (a === "variations") {
      call("studio_image", t.path).then(function (info) {
        if (!info) return;
        S.create.source = "image"; V.setImage(S.create, "src", info); S.boardFrom = t.id; S.create.preset = "photo"; V.go("create");
        setTimeout(function () { var b = document.getElementById("c-go"); if (b) b.click(); }, 300);
      });
    }
    else if (a === "upscale") call("studio_to_upscale", t.path).then(function () { V.go("upscale"); });
    else if (a === "ps") V.sendPS(t.path);
    else if (a === "ref") call("studio_image", t.path).then(function (info) { if (info) { V.setImage(S.ref, "refimg", info); V.go("reference"); } });
    else if (a === "folder") { var x = api(); if (x && x.reveal) x.reveal(t.path); }
    else if (a === "export") call("studio_save_copy", t.path).then(function (r) { if (r) V.toast("Saved " + r); });
    else if (a === "remove") { B.tiles = B.tiles.filter(function (k) { return k !== t; }); B.tiles.forEach(function (k) { if (k.from === t.id) k.from = t.from || null; }); save(); render(); }
  }

  // ---------------------------------------------------------------- organize

  function organize() {
    var kids = {};
    B.tiles.forEach(function (t) { var f = t.from && byId(t.from) ? t.from : ""; (kids[f] = kids[f] || []).push(t); });
    Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return (a.kind === "live" ? -1 : 0) - (b.kind === "live" ? -1 : 0) || (a.made || 0) - (b.made || 0); }); });
    var y = 0;
    function lay(t, depth, top) {
      t.x = depth * (W + GAP_X); t.y = top;
      var bottom = top + tileH(t), cy = top;
      (kids[t.id] || []).forEach(function (c) { var b = lay(c, depth + 1, cy); cy = b + GAP_Y; bottom = Math.max(bottom, b); });
      return bottom;
    }
    (kids[""] || []).forEach(function (t) { y = lay(t, 0, y) + GAP_Y * 1.6; });
    world.classList.add("anim"); setTimeout(function () { world.classList.remove("anim"); }, 450);
    lastHTML = ""; save(); render(); fit();
  }

  function fit() {
    if (!B.tiles.length) return;
    var cv = root.querySelector("#b-cv").getBoundingClientRect();
    var x0 = Math.min.apply(null, B.tiles.map(function (t) { return t.x; })), y0 = Math.min.apply(null, B.tiles.map(function (t) { return t.y; }));
    var x1 = Math.max.apply(null, B.tiles.map(function (t) { return t.x + W; })), y1 = Math.max.apply(null, B.tiles.map(function (t) { return t.y + tileH(t); }));
    var z = Math.max(0.15, Math.min(1.2, Math.min((cv.width - 120) / (x1 - x0), (cv.height - 160) / (y1 - y0))));
    B.view = { z: z, x: (cv.width - (x1 - x0) * z) / 2 - x0 * z, y: 70 + (cv.height - 110 - (y1 - y0) * z) / 2 - y0 * z };
    save(); applyView();
  }

  // ---------------------------------------------------------------- input

  function wire() {
    var cv = root.querySelector("#b-cv"), drag = null;
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-b]");
      if (b) {
        var a = b.getAttribute("data-b");
        if (a === "add") call("studio_pick").then(function (i) { if (i) add(i, null); });
        else if (a === "plus") VS().plusMenu(b, function (info) { add(info, null); });
        else if (a === "fit") fit();
        else if (a === "organize") organize();
        else if (a === "connect") {
          var S = VS().S, app = S.liveApp || "photoshop"; S.live.stopped = false;
          call("studio_live", true, app).then(function (r) { S.live.on = !!(r && r.on); S.live.app = app; S.live.frames = 0; S.live.msg = r && r.error || "Open a file in Photoshop; it appears here."; render(); });
        }
        return;
      }
      var m = e.target.closest("[data-m]");
      if (m) { var t = byId(menu.getAttribute("data-id")); if (t) menuAction(m.getAttribute("data-m"), t); return; }
      if (!e.target.closest("#b-menu")) menu.hidden = true;
    });
    cv.addEventListener("dblclick", function (e) {
      // The canvas holds the pointer while dragging, so find the tile under it.
      var hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest(".b-tile");
      if (el) open(byId(el.getAttribute("data-id")));
    });
    cv.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var el = e.target.closest(".b-tile"); if (!el) { menu.hidden = true; return; }
      var t = byId(el.getAttribute("data-id")); B.sel = t.id; render(); showMenu(t, e.clientX, e.clientY);
    });
    cv.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target.closest("button")) return;
      menu.hidden = true;
      var el = e.button === 0 && e.target.closest(".b-tile");
      var t = el && byId(el.getAttribute("data-id"));
      if (t) { B.sel = t.id; el.parentNode && world.querySelectorAll(".b-tile.sel").forEach(function (n) { n.classList.remove("sel"); }); el.classList.add("sel"); }
      drag = { t: t, sx: e.clientX, sy: e.clientY, x: t ? t.x : B.view.x, y: t ? t.y : B.view.y, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      if (drag.t) {
        drag.t.x = Math.round(drag.x + dx / B.view.z); drag.t.y = Math.round(drag.y + dy / B.view.z);
        var n = world.querySelector('.b-tile[data-id="' + drag.t.id + '"]');
        if (n) { n.style.left = drag.t.x + "px"; n.style.top = drag.t.y + "px"; }
        svgEl.innerHTML = linksSVG(); lastHTML = "";
      } else { B.view.x = drag.x + dx; B.view.y = drag.y + dy; applyView(); }
      cv.classList.add("grab");
    });
    cv.addEventListener("pointerup", function (e) {
      if (drag && drag.moved) save();
      drag = null; cv.classList.remove("grab");
      try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
    });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect(), v = B.view;
      if (e.ctrlKey || Math.abs(e.deltaY) >= 40 && !e.shiftKey && Math.abs(e.deltaX) < 1) {
        var z = Math.max(0.1, Math.min(3, v.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        var mx = e.clientX - r.left, my = e.clientY - r.top;
        v.x = mx - (mx - v.x) * z / v.z; v.y = my - (my - v.y) * z / v.z; v.z = z;
      } else { v.x -= e.deltaX; v.y -= e.deltaY; }        // trackpad: two fingers pan
      applyView(); save();
    }, { passive: false });
    document.addEventListener("keydown", function (e) {
      if (VS().S.page !== "board") return;
      if (e.key === "Escape") { menu.hidden = true; return; }
      var inText = /^(TEXTAREA|INPUT)$/.test((document.activeElement || {}).tagName || "");
      if (inText) return;
      if (e.ctrlKey && e.key.toLowerCase() === "v") { e.preventDefault(); call("studio_paste").then(function (i) { if (i) add(i, null); }); }
      else if ((e.key === "Delete" || e.key === "Backspace") && B.sel && B.sel !== "live") { var t = byId(B.sel); if (t) menuAction("remove", t); }
      else if (e.key === "Enter" && B.sel) { var s = byId(B.sel); if (s) open(s); }
    });
  }

  // A new picture from the + menu in Focus view: on the board, and open it.
  // A sketch branched off another tile (Live): sits next to it, joined by a line.
  function addFrom(info, fromId) { return add(info, byId(fromId) ? fromId : null); }
  function addAndOpen(info) { var t = add(info, null); if (t) open(t); return t; }

  window.VSBoard = { build: build, render: render, addImages: addImages, addResult: addResult, has: has, organize: organize, add: add, addAndOpen: addAndOpen, addFrom: addFrom, open: function (id) { var t = byId(id); if (t) open(t); },
                     _state: function () { return B; } };
})();
