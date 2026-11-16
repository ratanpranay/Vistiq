/* Vistiq Studio — 3D: turn the camera around a picture.
   Drag the picture (or pick an angle) to set where the camera goes; the picture
   tilts with you as a preview. "Render this view" asks the image model to show
   the same design from there, at full quality (the move goes in as precise words). */
(function () {
  "use strict";
  var T = { yaw: 0, pitch: 0, dist: 0, lens: "normal", src: null, text: "" }, root, drag = null;
  var ANGLES = [
    ["front", "Front", 0, 0], ["l34", "¾ left", -35, 5], ["r34", "¾ right", 35, 5], ["left", "Left side", -80, 0],
    ["right", "Right side", 80, 0], ["rear", "From behind", 180, 10], ["top", "From above", 0, 60], ["low", "Low angle", 0, -20]
  ];
  function VS() { return window.VS; }
  function esc(t) { return VS().esc(t); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function words() {
    // The camera move, put into the words the image model follows best.
    var y = Math.round(T.yaw), p = Math.round(T.pitch), d = T.dist, w = [];
    if (Math.abs(y) >= 150) w.push("the camera moves around to the opposite side and looks back at it");
    else if (Math.abs(y) >= 3) w.push("the camera orbits " + Math.abs(y) + " degrees to the " + (y < 0 ? "left" : "right") + " around it");
    if (p >= 45) w.push("the camera is high above, looking steeply down");
    else if (p >= 3) w.push("the camera rises " + p + " degrees, looking down slightly");
    else if (p <= -3) w.push("the camera drops " + Math.abs(p) + " degrees, looking up from low");
    if (d <= -0.25) w.push("the camera moves in closer");
    else if (d >= 0.25) w.push("the camera moves further back to show more");
    if (T.lens === "wide") w.push("wide-angle lens"); else if (T.lens === "tele") w.push("long telephoto lens, flat perspective");
    if (!w.length) return "";
    return "Show this exact same design from a new camera position: " + w.join(", ") + ". Keep every part, material, colour and the lighting; only the camera moves.";
  }
  function label(v, neg, pos, unit) { v = Math.round(v); return v === 0 ? "—" : Math.abs(v) + (unit || "°") + " " + (v < 0 ? neg : pos); }

  function build(el) {
    root = el;
    el.innerHTML =
      '<div class="t-main"><div class="t-stage" id="t-stage"><div class="t-card" id="t-card"><img id="t-img" alt="" draggable="false"></div>' +
      '<div class="t-orbit" id="t-orbit"><i></i></div><div class="t-tip">Drag to turn the camera · scroll to move closer</div>' +
      '<div class="t-empty" id="t-empty">Drop or paste a picture, or open one from the board</div></div></div>' +
      '<aside class="s-rail t-rail"><div class="s-rh"><h3>3D</h3></div>' +
      '<div><div class="s-label">Working on</div><div class="s-work" id="t-work"></div></div>' +
      '<div><div class="s-label">Pick an angle</div><div class="t-angles">' + ANGLES.map(function (a) {
        return '<button type="button" data-a="' + a[0] + '"><span class="t-ico" style="--y:' + a[2] + "deg;--p:" + a[3] + 'deg"><i></i></span>' + a[1] + "</button>"; }).join("") + "</div></div>" +
      '<div><div class="s-label">Or fine-tune</div>' +
      '<div class="t-sl"><span>Turn</span><input type="range" id="t-yaw" min="-180" max="180" step="1"><em id="t-yaw-v"></em></div>' +
      '<div class="t-sl"><span>Height</span><input type="range" id="t-pitch" min="-30" max="75" step="1"><em id="t-pitch-v"></em></div>' +
      '<div class="t-sl"><span>Distance</span><input type="range" id="t-dist" min="-1" max="1" step="0.05"><em id="t-dist-v"></em></div>' +
      '<div class="t-lens"><span>Lens</span><button type="button" data-l="wide">Wide</button><button type="button" data-l="normal">Normal</button><button type="button" data-l="tele">Tele</button></div></div>' +
      '<div><div class="s-label">Anything else <em class="s-opt">optional</em></div><textarea id="t-text" rows="2" placeholder="e.g. evening light, doors open"></textarea></div>' +
      '<div class="t-go"><button type="button" class="s-go" id="t-go">Render this view</button><button type="button" class="s-btn t-reset" id="t-reset">Reset</button>' +
      '<p class="s-hint" id="t-hint"></p></div></aside>';
    wire();
    render();
  }

  function render() {
    if (!root) return;
    var img = root.querySelector("#t-img"), has = !!(T.src && T.src.preview);
    root.querySelector("#t-empty").hidden = has;
    if (has && img.getAttribute("src") !== T.src.preview) img.src = T.src.preview;
    root.querySelector("#t-card").hidden = !has;
    root.querySelector("#t-work").innerHTML = has ? '<img src="' + T.src.preview + '" alt=""><div><b>' + esc(VS().short(T.src.name || "")) + "</b><small>" + (T.src.w || "") + " × " + (T.src.h || "") + "</small></div>" : "<small>Nothing yet</small>";
    // The preview: the picture turns with the camera (the image model then draws the real view).
    var c = root.querySelector("#t-card"), s = 1 - T.dist * 0.18;
    c.style.transform = "rotateY(" + (-T.yaw * 0.45) + "deg) rotateX(" + (T.pitch * 0.45) + "deg) scale(" + s + ")";
    var o = root.querySelector("#t-orbit i");
    o.style.left = (50 + T.yaw / 180 * 46) + "%"; o.style.top = (50 - T.pitch / 75 * 46) + "%";
    root.querySelector("#t-yaw").value = T.yaw; root.querySelector("#t-pitch").value = T.pitch; root.querySelector("#t-dist").value = T.dist;
    root.querySelector("#t-yaw-v").textContent = label(T.yaw, "left", "right");
    root.querySelector("#t-pitch-v").textContent = label(T.pitch, "lower", "higher");
    root.querySelector("#t-dist-v").textContent = T.dist === 0 ? "—" : (T.dist < 0 ? "closer" : "further");
    root.querySelectorAll(".t-lens button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-l") === T.lens); });
    root.querySelectorAll(".t-angles button").forEach(function (b) {
      var a = ANGLES.filter(function (x) { return x[0] === b.getAttribute("data-a"); })[0];
      b.classList.toggle("on", Math.round(T.yaw) === a[2] && Math.round(T.pitch) === a[3]);
    });
    var w = words();
    root.querySelector("#t-go").disabled = !has || !w;
    root.querySelector("#t-hint").textContent = w ? "Same design, new camera. About 2 minutes." : "Drag the picture or pick an angle.";
  }

  function wire() {
    var st = root.querySelector("#t-stage");
    st.addEventListener("pointerdown", function (e) { if (!T.src) return; drag = { x: e.clientX, y: e.clientY, yaw: T.yaw, pitch: T.pitch }; st.setPointerCapture(e.pointerId); st.classList.add("grab"); });
    st.addEventListener("pointermove", function (e) {
      if (!drag) return;
      T.yaw = clamp(Math.round(drag.yaw + (e.clientX - drag.x) * 0.35), -180, 180);
      T.pitch = clamp(Math.round(drag.pitch - (e.clientY - drag.y) * 0.25), -30, 75);
      render();
    });
    st.addEventListener("pointerup", function () { drag = null; st.classList.remove("grab"); });
    st.addEventListener("wheel", function (e) { if (!T.src) return; e.preventDefault(); T.dist = clamp(Math.round((T.dist + e.deltaY * 0.001) * 20) / 20, -1, 1); render(); }, { passive: false });
    root.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]"), l = e.target.closest("[data-l]");
      if (a) { var x = ANGLES.filter(function (q) { return q[0] === a.getAttribute("data-a"); })[0]; T.yaw = x[2]; T.pitch = x[3]; render(); }
      else if (l) { T.lens = l.getAttribute("data-l"); render(); }
      else if (e.target.closest("#t-reset")) { T.yaw = 0; T.pitch = 0; T.dist = 0; T.lens = "normal"; render(); }
      else if (e.target.closest("#t-go")) go();
    });
    root.addEventListener("input", function (e) {
      if (e.target.id === "t-yaw") T.yaw = +e.target.value;
      else if (e.target.id === "t-pitch") T.pitch = +e.target.value;
      else if (e.target.id === "t-dist") T.dist = +e.target.value;
      else if (e.target.id === "t-text") { T.text = e.target.value; return; }
      render();
    });
  }

  function go() {
    // Render in Create: same picture, camera unlocked, the move in words.
    var V = VS(), p = V.S.create, txt = words() + (T.text.trim() ? " " + T.text.trim() : "");
    V.setImage(p, "src", T.src);
    p.refs = [];
    V.go("create");
    setTimeout(function () {          // after the picture's own words are restored
      p.text = txt; p.locks = Object.assign({}, p.locks || {}, { camera: false });
      var box = document.getElementById("c-text"); if (box) box.value = txt;
      V.render(); V.job("c");
    }, 250);
  }

  function open(info) { if (!info) return; T.src = info; T.yaw = 0; T.pitch = 0; T.dist = 0; T.lens = "normal"; render(); VS().go("3d"); }

  window.VS3D = { build: build, render: render, open: open, words: words, _state: function () { return T; } };
})();
