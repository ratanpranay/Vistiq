// Screen tests for Vistiq Studio's window: the basic things that must work
// every single time. Run: node tests/ui/run.js   (needs: npm i playwright)
// Any failure exits with code 1, so a build that breaks one of these stops.
const path = require("path");
const { chromium } = require("playwright");
const { mock, img } = require("./mock");

const PAGE = "file:///" + path.resolve(__dirname, "../../app/ui/index.html").replace(/\\/g, "/");
let failed = 0;

function check(name, ok, detail) {
  console.log((ok ? "ok    " : "FAIL  ") + name + (ok ? "" : "  -> " + detail));
  if (!ok) failed++;
}

async function open(browser, before, opts) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (before) await page.addInitScript(before);
  await page.addInitScript(mock(true));
  await page.goto(PAGE);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const api = window.pywebview.api;
    window.__board = null;
    api.studio_thumb = () => Promise.resolve("data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    api.studio_image = (p) => Promise.resolve({ path: p, name: p.split("/").pop(), w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
    api.studio_run = (j) => { window.__lastJob = j; return Promise.resolve("j1"); };
    api.studio_send = () => Promise.resolve({ ok: true });
    api.js_log = () => Promise.resolve();
    // projects: a little in-memory store, like the real one
    window.__boards = window.__boards || {};
    window.__projects = [{ id: "myboard", name: "My board", created: 1, edited: 2, cover: "", cover_set: false }];
    const cnt = (id) => (((id === "myboard" ? window.__board : window.__boards[id]) || {}).tiles || []).filter((t) => t.path);
    api.studio_projects = () => Promise.resolve(window.__projects.map((p) => Object.assign({}, p, { count: cnt(p.id).length, covers: cnt(p.id).map((t) => t.path).slice(0, 3) })));
    api.studio_project_new = (name) => { const p = { id: "p" + window.__projects.length, name, created: 3, edited: 3, cover: "", cover_set: false }; window.__projects.push(p); window.__boards[p.id] = { tiles: [] }; return Promise.resolve(p); };
    api.studio_project_rename = (id, n) => { window.__projects.find((p) => p.id === id).name = n; return Promise.resolve(true); };
    window.__trash = [];
    api.studio_project_delete = (id) => { const p = window.__projects.find((x) => x.id === id); window.__projects = window.__projects.filter((p) => p.id !== id); if (p) window.__trash.push(Object.assign({}, p, { deleted: Date.now() / 1000 })); return Promise.resolve(true); };
    api.studio_trash = () => Promise.resolve(window.__trash.map((t) => Object.assign({}, t, { count: 0, covers: [], days_left: 30 })));
    api.studio_trash_restore = (id) => { const t = window.__trash.find((x) => x.id === id); window.__trash = window.__trash.filter((x) => x.id !== id); if (t) window.__projects.push(t); return Promise.resolve(t || false); };
    api.studio_wipe_all = (w) => { window.__wiped = w; return Promise.resolve(w === "DELETE" ? { ok: true } : { ok: false, error: "Type DELETE to confirm." }); };
    api.studio_trash_forget = (id) => { window.__trash = window.__trash.filter((x) => id && x.id !== id); return Promise.resolve(true); };
    api.studio_project_cover = (id, path) => { window.__projects.find((p) => p.id === id).cover = path; return Promise.resolve(true); };
    api.studio_board_get = (pid) => Promise.resolve(!pid || pid === "myboard" ? window.__board : window.__boards[pid]);
    api.studio_board_save = (b, pid) => { const c = JSON.parse(JSON.stringify(b)); if (!pid || pid === "myboard") window.__board = c; else window.__boards[pid] = c; return Promise.resolve(true); };
    api.studio_board_append = (pid, tiles) => { const b = (!pid || pid === "myboard" ? window.__board : window.__boards[pid]) || { tiles: [] }; b.tiles = (b.tiles || []).concat(tiles); if (!pid || pid === "myboard") window.__board = b; else window.__boards[pid] = b; return Promise.resolve(true); };
    api.studio_clip_seq = () => Promise.resolve(0);
  });
  page.ev = (k, d) => page.evaluate(([k, d]) => window.vistiq.event(k, d), [k, d]);
  page.text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText : ""; }, sel);
  page.errors = errors;
  // The board now lives inside a project: Projects → the project's card.
  page.board = async (pid) => {
    await page.click(".s-nav button[data-page=projects]"); await page.waitForTimeout(150);
    await page.dblclick('.pj-card[data-pid="' + (pid || "myboard") + '"]'); await page.waitForTimeout(250);
  };
  page.startPage = await page.evaluate(() => document.body.getAttribute("data-page"));
  if (!opts || !opts.board) { await page.evaluate(() => window.VS.go("create")); await page.waitForTimeout(150); }
  else await page.board();
  return page;
}

const frame = (n, name) => ({ path: "live://photoshop/" + n, name: name || "flat 2.psd", w: 1600, h: 900, n, app: "photoshop", preview: img });

(async () => {
  const browser = await chromium.launch();

  // 1. Live from app always offers a way to connect.
  {
    const p = await open(browser, () => localStorage.setItem("vs.c.source", '"live"'));
    const t = await p.text("#c-ps");
    check("Live from app shows Connect", /Connect Photoshop/.test(t), t);
    check("no page errors on start", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 2. A Photoshop file shows up by itself (navigator), with its card.
  {
    const p = await open(browser);
    await p.ev("studio-live", frame(1));
    const t = await p.text("#c-ps");
    check("Photoshop file appears by itself", /flat 2\.psd/.test(t) && /updates as you draw/.test(t), t);
    check("stage shows it live", /Live from Photoshop/.test(await p.text("#c-stage .s-tag")), await p.text("#c-stage .s-tag"));

    // 3. Create freezes the sketch; drawing on doesn't change the run's picture.
    await p.click("#c-go");
    await p.waitForTimeout(100);
    const tagDuring = await p.text("#c-view > .s-tag");
    await p.ev("studio-live", frame(2));
    const tagAfter = await p.text("#c-view > .s-tag");
    check("sketch is frozen during a run", /frozen/.test(tagDuring) && /frozen/.test(tagAfter), tagDuring + " / " + tagAfter);

    // 3b. Watch it develop: step pictures show on the main view; the Sketch tile fills in.
    await p.ev("studio-job", { id: "j1", state: "running", stage: "Creating", fraction: 0.5 / Math.max(1, await p.evaluate(() => (window.VS.S.create.pending || 0) + (window.VS.S.create.jobDone || 0))) });
    await p.ev("studio-preview", { id: "j1", index: 0, preview: img });
    await p.ev("studio-preview", { id: "j1", index: 0, preview: img });
    await p.waitForTimeout(100);
    check("while making: only the blurred sketch and the ring, no step pictures", /Making/.test(await p.text("#c-view .s-pane .s-tag")) &&
      await p.evaluate(() => !document.querySelector("#c-view .s-pane .s-dev") && !!document.querySelector("#c-view .s-pane .s-pring")), await p.text("#c-view .s-pane .s-tag"));
    check("developing happens on the Sketch copy, which is selected", await p.evaluate(() => {
      const t = document.querySelector("#c-strip .s-fillt"); return !!t && t.classList.contains("sel"); }), "Sketch tile not selected");
    await p.click('#c-strip img[data-i="-1"]');
    await p.waitForTimeout(100);
    check("Live during a run shows the live canvas, not the developing picture",
      /Live from Photoshop/.test(await p.text("#c-view > .s-tag")) && await p.evaluate(() => !document.querySelector("#c-view .s-pane")),
      await p.text("#c-view > .s-tag"));
    await p.click("#c-strip .s-fillt");
    await p.waitForTimeout(100);
    check("Sketch tile fills in with progress", /Creating · 50%/.test(await p.text("#c-strip")) &&
      await p.evaluate(() => document.querySelector("#c-strip .s-fillc").style.width === "50%"), await p.text("#c-strip"));

    // 4. The result shows, Live comes back, the card stays on the file.
    await p.ev("studio-result", { id: "j1", index: 0, of: 1, result: { path: "C:/o/r.png", name: "r.png", w: 1600, h: 900, preview: img } });
    await p.ev("studio-job", { id: "j1", state: "done", count: 1 });
    await p.waitForTimeout(100);
    check("result is shown after the run", /Result/.test(await p.text("#c-view .s-pane .s-tag")) && !!(await p.evaluate(() => document.querySelector("#c-view > .s-fit .sk-base"))), await p.text("#c-view .s-pane .s-tag"));
    check("Live is back after the run", /Live/.test(await p.text("#c-strip")), await p.text("#c-strip"));
    check("card stays on the file after the run", /flat 2\.psd/.test(await p.text("#c-ps")) && /updates as you draw/.test(await p.text("#c-ps")), await p.text("#c-ps"));
    check("strip order: Live | Sketch | results, the first part pinned", await p.evaluate(() => {
      const pin = document.querySelector("#c-strip .s-pin"), kids = [...pin.children].map((e) => e.classList.contains("s-div") ? "|" : (e.innerText || "").trim() || e.tagName);
      return kids.join(",") + "/" + getComputedStyle(pin).position + "/" + (pin.nextElementSibling && pin.nextElementSibling.tagName);
    }) === "Live,|,Sketch,|/sticky/SPAN", await p.evaluate(() => [...document.getElementById("c-strip").children].map((e) => e.className + ":" + (e.innerText || "").trim()).join(" ")));
    await p.click('#c-strip img[data-i="-2"]');
    check("clicking Sketch shows the frozen sketch", /made from/.test(await p.text("#c-view .s-pane .s-tag")), await p.text("#c-view .s-pane .s-tag"));
    check("strip has a divider after Live", await p.evaluate(() => {
      const w = document.querySelector("#c-strip .s-tilewrap");
      return !!(w && w.nextElementSibling && w.nextElementSibling.classList.contains("s-div"));
    }), "no divider");

    // 5. To Photoshop is offered while Photoshop is connected.
    await p.click('#c-strip img[data-i="0"]');
    const toPS = await p.evaluate(() => { const b = document.getElementById("c-tops"); return !!b && !b.hidden; });
    check("To Photoshop button visible", toPS, "missing");

    // 6. Photoshop closed: the card says so instead of showing an old picture.
    await p.ev("studio-live-state", { app: "photoshop", state: "closed", message: "Photoshop is closed." });
    check("Photoshop closed is shown", /Photoshop is closed/.test(await p.text("#c-ps")), await p.text("#c-ps"));
    check("no page errors in the live flow", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 6b. A Photoshop selection becomes the mask: shown, used by Create, can be switched off.
  {
    const p = await open(browser);
    await p.ev("studio-live", frame(1));
    await p.ev("studio-sel", { on: true, preview: img });
    check("selection note shows", /Only your Photoshop selection changes/.test(await p.text("#c-ps")), await p.text("#c-ps"));
    check("selection is tinted on the picture", await p.evaluate(() => !!document.querySelector("#c-view .s-selov")), "no overlay");
    await p.click("#c-go");
    await p.waitForTimeout(100);
    check("Create uses the selection", await p.evaluate(() => window.__lastJob && window.__lastJob.mask === "ps-selection"), JSON.stringify(await p.evaluate(() => window.__lastJob)));
    await p.ev("studio-job", { id: "j1", state: "done", count: 0 });
    await p.click('[data-ps="sel"]');
    await p.waitForTimeout(100);
    await p.click("#c-go");
    await p.waitForTimeout(100);
    check("whole picture when switched off", await p.evaluate(() => !window.__lastJob.mask), JSON.stringify(await p.evaluate(() => window.__lastJob.mask)));
    await p.ev("studio-sel", { on: false });
    check("note goes when the selection does", !/selection/.test(await p.text("#c-ps")), await p.text("#c-ps"));
    check("no finishing pass in Create", await p.evaluate(() => !document.getElementById("c-juice-w")), "still there");
    check("no page errors with a selection", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 7. Settings: headings line up with their boxes.
  {
    const p = await open(browser);
    await p.click(".s-nav button[data-page=settings]");
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const s = [...document.querySelectorAll("#p-settings .s-sec")].find((x) => x.textContent === "Upscaler");
      const u = document.getElementById("s-up");
      return s && u ? [Math.round(s.getBoundingClientRect().left), Math.round(u.getBoundingClientRect().left)] : null;
    });
    check("Settings: Upscaler heading lines up", r && r[0] === r[1], JSON.stringify(r));
    check("no page errors in Settings", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 8. No two elements share an id (two did once, and the connector vanished).
  {
    const p = await open(browser);
    const dup = await p.evaluate(() => {
      const seen = {}, d = [];
      document.querySelectorAll("[id]").forEach((e) => { if (seen[e.id]) d.push(e.id); seen[e.id] = 1; });
      return d;
    });
    check("no duplicate ids", dup.length === 0, dup.join(", "));
    await p.close();
  }

  // 9. Every page opens without errors.
  {
    const p = await open(browser);
    check("no Create tab in the left bar", !(await p.$(".s-nav button[data-page=create]")), "");
    for (const pg of ["projects", "upscale", "library", "settings"]) {
      await p.click(".s-nav button[data-page=" + pg + "]");
      await p.waitForTimeout(150);
    }
    check("all pages open without errors", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 10. The board: opens first, Live tile with Connect, images become tiles,
  // double-click opens Focus, results go back on the board, right-click, Organize.
  {
    const p = await open(browser, null, { board: true });
    check("Studio opens on Projects", p.startPage === "projects", p.startPage);
    check("a project's card opens its board", await p.evaluate(() => document.body.getAttribute("data-page")) === "board" && /My board/.test(await p.text("#b-title")), await p.text("#b-title"));
    await p.waitForTimeout(200);
    check("the Photoshop / Affinity tab shows not connected", await p.evaluate(() => !document.querySelector("#b-tdot.on")), "");
    check("the Photoshop bar has Connect while not linked", await p.isVisible('.b-tabs [data-b="connect"]'), "");
    check("no Live tile until a file is linked", await p.evaluate(() => !document.querySelector('.b-tile[data-id="live"]')), "");
    check("no Board button next to the Photoshop tab", await p.evaluate(() => !/Board/.test(document.querySelector(".b-tabs").textContent.replace("Connect", ""))), "");
    await p.click('.b-tabs [data-b="connect"]'); await p.waitForTimeout(100);
    check("Connect with no file open says what to do", /Open the file you want to work on in Photoshop/.test(await p.text("#b-psmsg")) && await p.isVisible("#b-psmsg"), await p.text("#b-psmsg"));
    await p.ev("studio-live", frame(1));
    await p.waitForTimeout(100);
    check("the tab turns green when Photoshop is live", await p.evaluate(() => !!document.querySelector("#b-tdot.on")), "");
    check("linked: the message goes, Connect becomes the fold arrow", !(await p.isVisible("#b-psmsg")) && await p.isVisible('.b-tabs [data-b="livefold"]') && !(await p.isVisible('.b-tabs [data-b="connect"]')), "");
    check("the Live tile hangs below the Photoshop bar", await p.evaluate(() => {
      const f = document.querySelector('#b-livefloat .b-tile[data-id="live"]'), bar = document.querySelector(".b-tabs").getBoundingClientRect();
      return !!f && f.getBoundingClientRect().top > bar.bottom && !document.querySelector('#b-world .b-tile[data-id="live"]');
    }), "");
    const panBefore = await p.evaluate(() => document.querySelector("#b-livefloat").getBoundingClientRect().left);
    await p.evaluate(() => { const v = window.VSBoard._state().view; v.x += 200; window.VSBoard.render(); });
    check("pinned, it stays put when the board moves", await p.evaluate(() => document.querySelector("#b-livefloat").getBoundingClientRect().left) === panBefore, "");
    await p.click('.b-tabs [data-b="livefold"]'); await p.waitForTimeout(80);
    check("the arrow folds the Live tile away", await p.evaluate(() => !document.querySelector('.b-tile[data-id="live"]')), "");
    await p.click('.b-tabs [data-b="livefold"]'); await p.waitForTimeout(80);
    check("and opens it again", await p.isVisible('#b-livefloat .b-tile[data-id="live"]'), "");
    check("no pin on the Live tile (always on top)", !(await p.evaluate(() => !!document.querySelector('[data-b="livepin"], .b-pin'))), "");
    await p.ev("studio-dropped", { target: "board", images: [{ path: "C:/a/sketch.png", name: "sketch.png", w: 1600, h: 900, preview: img }] });
    await p.waitForTimeout(150);
    check("a dropped image becomes a tile", await p.evaluate(() => document.querySelectorAll(".b-tile:not([data-id=live])").length) === 1, await p.evaluate(() => document.querySelectorAll(".b-tile").length));
    // a new, empty project shows an empty board (it showed the last project's tiles, Nov 2026)
    await p.evaluate(() => { window.__boards = window.__boards || {}; window.__boards.pempty = { tiles: [], view: { x: 60, y: 40, z: 0.8 } }; });
    await p.evaluate(() => window.VSBoard.load("pempty", "Empty")); await p.waitForTimeout(200);
    check("an empty project shows no tiles from another board", await p.evaluate(() => document.querySelectorAll('#b-world .b-tile:not([data-id="live"])').length === 0), String(await p.evaluate(() => document.querySelectorAll("#b-world .b-tile").length)));
    await p.evaluate(() => window.VSBoard.load("myboard", "My board")); await p.waitForTimeout(200);
    await p.evaluate(() => { window.__reg = null; window.pywebview.api.studio_region = (path, u0, v0, u1, v1, w) => { window.__reg = [path, w]; const c = document.createElement("canvas"); c.width = 8; c.height = 8; return Promise.resolve({ src: c.toDataURL(), u0, v0, u1, v1 }); };
      const st = window.VSBoard._state(), v = st.view; window.__v0 = Object.assign({}, v); const t = st.tiles.filter((k) => k.id !== "live")[0]; v.z = 9; v.x = -(t.x + 40) * 9 + 100; v.y = -(t.y + 60) * 9 + 100; window.VSBoard.render(); });
    await p.waitForTimeout(700);
    check("zoomed in, a board tile gets a sharp piece from the full picture", await p.evaluate(() => !!window.__reg && window.__reg[0] === "C:/a/sketch.png" && !!document.querySelector(".b-pic img.s-sharp")), JSON.stringify(await p.evaluate(() => window.__reg)));
    await p.evaluate(() => { Object.assign(window.VSBoard._state().view, window.__v0); window.VSBoard.render(); });
    await p.waitForTimeout(500);
    await p.dblclick('.b-tile:not([data-id="live"])');
    await p.waitForTimeout(250);
    check("double-click opens Focus view with that image", await p.evaluate(() => document.body.getAttribute("data-page")) === "create" && /sketch/.test(await p.text("#c-ttl")), await p.text("#c-ttl"));
    await p.ev("studio-result", { id: "", index: 0, of: 1, result: { path: "C:/o/r1.png", name: "r1.png", w: 1600, h: 900, preview: img } });
    await p.evaluate(() => { window.VS.S.create.results = [{ path: "C:/o/r1.png", name: "r1.png", w: 1600, h: 900, preview: "x" }]; window.VS.S.create.sel = 0; window.VS.render(); });
    await p.evaluate(() => document.getElementById("c-toboard").click());   // (hidden in the rail since Nov 2026; layers send to board)
    await p.waitForTimeout(100);
    check("Add to board puts the result on the board", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.path === "C:/o/r1.png" && t.from)), JSON.stringify(await p.evaluate(() => window.VSBoard._state().tiles)));
    await p.board();
    await p.waitForTimeout(150);
    check("Back to board, with a line from the sketch to the result", await p.evaluate(() => document.querySelectorAll("#b-links path").length) === 1, "no link");
    await p.click('.b-tile[data-id]:last-child', { button: "right" });
    await p.waitForTimeout(100);
    check("right-click shows the actions", /Upscale/.test(await p.text("#b-menu")) && /Save a copy/.test(await p.text("#b-menu")), await p.text("#b-menu"));
    await p.keyboard.press("Escape");
    check("Escape closes the menu", await p.evaluate(() => document.getElementById("b-menu").hidden), "still open");
    // A tile takes its picture's shape: a portrait picture gets a tall tile.
    await p.ev("studio-dropped", { target: "board", images: [{ path: "C:/a/portrait.jpg", name: "portrait.jpg", w: 1440, h: 2160, preview: img }] });
    await p.waitForTimeout(150);
    const pr = await p.evaluate(() => { const t = window.VSBoard._state().tiles.find((x) => x.path === "C:/a/portrait.jpg"); const el = document.querySelector('.b-tile[data-id="' + t.id + '"]'); const pic = el.querySelector(".b-pic"); return [el.offsetWidth, pic.offsetHeight]; });
    check("a portrait picture gets a tall tile", pr[1] > pr[0], JSON.stringify(pr));
    await p.evaluate(() => { const B = window.VSBoard._state(); B.tiles = B.tiles.filter((x) => x.path !== "C:/a/portrait.jpg"); window.VSBoard.render(); });
    // Projects tab with work open: first back to that work, then (again) all projects.
    await p.dblclick('.b-tile[data-id]:not([data-id="live"])'); await p.waitForTimeout(250);
    await p.click(".s-nav button[data-page=upscale]"); await p.waitForTimeout(150);
    await p.click(".s-nav button[data-page=projects]"); await p.waitForTimeout(150);
    check("Projects brings you back to the picture you were working on", await p.evaluate(() => document.body.getAttribute("data-page")) === "create", await p.evaluate(() => document.body.getAttribute("data-page")));
    await p.click(".s-nav button[data-page=projects]"); await p.waitForTimeout(150);
    check("clicking Projects again shows all projects", await p.evaluate(() => document.body.getAttribute("data-page")) === "projects", "");
    await p.board(); await p.waitForTimeout(150);
    check("no Organize button (freeform board)", await p.evaluate(() => !document.querySelector(".b-bar [data-b=organize]")), "");
    check("a result sits to the right of its source", await p.evaluate(() => {
      const t = window.VSBoard._state().tiles, live = t.find((x) => x.id === "live"), s = t.find((x) => x.path === "C:/a/sketch.png"), r = t.find((x) => x.path === "C:/o/r1.png");
      return r.x > s.x;
    }), JSON.stringify(await p.evaluate(() => window.VSBoard._state().tiles.map((x) => [x.id, x.x, x.y]))));
    check("the board is saved", await p.evaluate(() => !!(window.__board && window.__board.tiles.length === 3)), "not saved");
    // Opening another tile must not lose the results made from the first one.
    await p.evaluate(() => { const S = window.VS.S.create; ["r1", "r2", "r3"].forEach((n, i) => { if (!S.results[i]) S.results[i] = {}; Object.assign(S.results[i], { path: "C:/o/" + n + ".png", name: n + ".png", w: 1600, h: 900, preview: "x", srcKey: "C:/a/sketch.png" }); }); });
    await p.click(".b-bar [data-b=fit]"); await p.waitForTimeout(300);
    await p.dblclick('.b-tile[data-id="' + await p.evaluate(() => window.VSBoard._state().tiles.find((x) => x.path === "C:/o/r1.png").id) + '"]');
    await p.waitForTimeout(250);
    await p.board();
    await p.waitForTimeout(150);
    await p.dblclick('.b-tile[data-id="' + await p.evaluate(() => window.VSBoard._state().tiles.find((x) => x.path === "C:/a/sketch.png").id) + '"]');
    await p.waitForTimeout(250);
    check("results stay after opening another board tile and coming back", await p.evaluate(() => document.querySelectorAll("#c-strip img[data-i]:not([data-i='-1']):not([data-i='-2'])").length) === 3,
      await p.evaluate(() => document.getElementById("c-strip").innerHTML.slice(0, 300)));
    check("no page errors on the board", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Tool windows on the board (Nov 2026): drag the + out of a tile, pick a tool, a window opens joined
  // to the tile; Run makes the results at the end of its line. Right-click opens the same windows.
  {
    const p = await open(browser, null, { board: true });
    const img = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    await p.evaluate(() => { window.VS.S.status = Object.assign(window.VS.S.status || {}, { create_ready: true }); });
    await p.ev("studio-dropped", { target: "board", images: [{ path: "C:/a/truck.png", name: "truck.png", w: 1600, h: 900, preview: img }] });
    await p.waitForTimeout(150);
    const tsel = '.b-tile[data-id]:not([data-id="live"])';
    await p.click(tsel); await p.waitForTimeout(60);
    const port = await p.evaluate(() => { const r = document.querySelector(".b-tile.sel .b-port").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await p.mouse.move(port[0], port[1]); await p.mouse.down(); await p.mouse.move(port[0] + 80, port[1] - 30, { steps: 5 });
    check("dragging the + draws a line", await p.evaluate(() => !!document.querySelector("#b-links path.drag")), "");
    await p.mouse.move(port[0] + 160, port[1] - 40, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(100);
    check("letting go opens the tool list", await p.isVisible("#b-acts"), "");
    check("the dragged line stays while the list is open", await p.evaluate(() => !!document.querySelector("#b-links path.drag")), "");
    await p.keyboard.type("refi"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    check("typing picks a tool: a Refine window opens, joined to the tile", await p.evaluate(() => (window.VSBoard._state().nodes || []).length === 1 && !!document.querySelector(".b-node") && document.querySelectorAll("#b-links path.on").length === 1),
      await p.evaluate(() => JSON.stringify(window.VSBoard._state().nodes)));
    check("Refine needs words before it runs", await p.evaluate(() => document.querySelector(".b-node [data-nr]").disabled), "");
    await p.fill(".b-node textarea", "golden hour light");
    await p.click('.b-node [data-nv="2"]');
    await p.evaluate(() => { const S = window.VS.S; S.status = Object.assign(S.status || {}, { local_ready: true, online: { on: true, has_key: true, limit: 10, usage: { n: 0, usd: 0 }, engines: { standard: { label: "Standard", usd: { "1K": 0.0336, "2K": 0.0504 }, credits: { "1K": 1, "2K": 1.5 } }, pro: { label: "Pro", usd: { "1K": 0.134, "2K": 0.134 }, credits: { "1K": 4, "2K": 4 } } } } }); window.VSBoard.render(); });
    await p.waitForTimeout(100);
    await p.locator(".b-node").screenshot({ path: (process.env.SHOT_DIR || "/tmp") + "/node.png" });
    check("tool window: engine as tiles", await p.evaluate(() => document.querySelectorAll(".b-node [data-neng]").length === 3), "");
    await p.evaluate(() => { window.VS.S.status.online = null; window.VSBoard.render(); });
    await p.evaluate(() => { window.__lastJob = null; });
    await p.click(".b-node [data-nr]"); await p.waitForTimeout(300);
    const job = await p.evaluate(() => window.__lastJob);
    check("Run sends the tile's picture and the words", !!job && job.image === "C:/a/truck.png" && job.text === "golden hour light" && job.variations === 2 && !job.mask, JSON.stringify(job));
    if (process.env.NSHOT) await p.screenshot({ path: "/tmp/claude-0/-home-claude/dcd924c8-68bd-54b8-af15-65d2e5e10346/scratchpad/board_ghost.png" });
    check("2 placeholders wait at the end of the line", await p.evaluate(() => document.querySelectorAll(".b-ghost").length) === 2, "");
    check("while working, the window's button queues another run", await p.evaluate(() => /Queue another/.test(document.querySelector(".b-node [data-nr]").textContent) && !document.querySelector(".b-node [data-nr]").disabled), "");
    await p.click(".b-node [data-nr]"); await p.waitForTimeout(100);
    check("a second run waits in the queue", await p.evaluate(() => (window.VSBoard._state().q || []).length === 1 && /1 waiting/.test(document.querySelector(".b-node [data-nr]").textContent)), await p.evaluate(() => document.querySelector(".b-node [data-nr]").textContent));
    await p.evaluate(() => { window.VSBoard._state().q = []; window.VSBoard._state().nodes.forEach((n) => { n.queued = 0; }); window.VSBoard.render(); });
    check("the board stays open", await p.evaluate(() => document.body.getAttribute("data-page")) === "board", "");
    await p.ev("studio-result", { id: "j1", index: 0, of: 2, result: { path: "C:/o/g1.png", name: "g1.png", w: 1600, h: 900, preview: img } });
    await p.waitForTimeout(100);
    check("a result takes a placeholder's place", await p.evaluate(() => document.querySelectorAll(".b-ghost").length) === 1, "");
    await p.ev("studio-result", { id: "j1", index: 1, of: 2, result: { path: "C:/o/g2.png", name: "g2.png", w: 1600, h: 900, preview: img } });
    await p.ev("studio-job", { id: "j1", state: "done" }); await p.waitForTimeout(800);
    const st = await p.evaluate(() => { const B = window.VSBoard._state(), n = B.nodes[0]; return { n, res: B.tiles.filter((t) => t.via === n.id).map((t) => [t.x, t.y]) }; });
    check("results land in a row to the right of the window", st.res.length === 2 && st.res[0][0] > st.n.x && st.res[1][0] > st.res[0][0] && st.res[1][1] === st.res[0][1], JSON.stringify(st));
    check("the window is free again: Refine again", await p.evaluate(() => /again/.test(document.querySelector(".b-node [data-nr]").textContent) && !document.querySelector(".b-node [data-nr]").disabled),
      await p.evaluate(() => document.querySelector(".b-node").outerHTML.slice(0, 300)));
    if (process.env.NSHOT) await p.screenshot({ path: "/tmp/claude-0/-home-claude/dcd924c8-68bd-54b8-af15-65d2e5e10346/scratchpad/board_nodes.png" });
    // A second run starts on a new row below the first, clear of a tile moved into the way.
    await p.evaluate(() => { const B = window.VSBoard._state(), n = B.nodes[0];
      const blocker = { id: "blk", kind: "image", path: "C:/a/blk.png", name: "blk.png", w: 1600, h: 900, x: n.x + 320, y: Math.max(...B.tiles.filter((t) => t.via === n.id).map((t) => t.y)) + 230, made: 1 };
      B.tiles.push(blocker); window.VSBoard.render(); window.__lastJob = null; });
    await p.click(".b-node [data-nr]"); await p.waitForTimeout(300);
    const plan = await p.evaluate(() => { const B = window.VSBoard._state(), n = B.nodes[0], blk = B.tiles.find((t) => t.id === "blk");
      const prev = Math.max(...B.tiles.filter((t) => t.via === n.id).map((t) => t.y));
      return { slots: n.slots, prev, blk: [blk.x, blk.y] }; });
    check("a new run starts below the earlier results and clear of a tile in the way", plan.slots[0].y > plan.prev && plan.slots.every((g) => !(g.x < plan.blk[0] + 300 && g.x + g.w > plan.blk[0] && g.y < plan.blk[1] + 200 && g.y + g.h + 30 > plan.blk[1])), JSON.stringify(plan));
    const gb = await p.evaluate(() => { const r = document.querySelector(".b-ghost").getBoundingClientRect(); return [r.x + 40, r.y + 60]; });
    await p.mouse.move(gb[0], gb[1]); await p.mouse.down(); await p.mouse.move(gb[0] + 120, gb[1] + 90, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(80);
    check("a placeholder can be dragged", await p.evaluate((pl) => window.VSBoard._state().nodes[0].slots[0].x > pl.slots[0].x, plan), "");
    await p.ev("studio-result", { id: "j1", index: 0, of: 2, result: { path: "C:/o/g3.png", name: "g3.png", w: 1600, h: 900, preview: img } });
    await p.waitForTimeout(100);
    check("the picture lands where the placeholder was dragged", await p.evaluate(() => { const B = window.VSBoard._state(), n = B.nodes[0], t = B.tiles.find((x) => x.path === "C:/o/g3.png"); return t.x === n.slots[0].x && t.y === n.slots[0].y; }), "");
    await p.ev("studio-result", { id: "j1", index: 1, of: 2, result: { path: "C:/o/g4.png", name: "g4.png", w: 1600, h: 900, preview: img } });
    await p.ev("studio-job", { id: "j1", state: "done" }); await p.waitForTimeout(700);
    await p.evaluate(() => { const B = window.VSBoard._state(); B.tiles = B.tiles.filter((t) => !["C:/o/g3.png", "C:/o/g4.png", "C:/a/blk.png"].includes(t.path)); window.VSBoard.render(); });
    check("lines: tile → window → its results (one line)", await p.evaluate(() => document.querySelectorAll("#b-links path.on").length) === 2, "");
    // Right-click a result → 3D views: same kind of window, chained.
    const rid = await p.evaluate(() => window.VSBoard._state().tiles.find((t) => t.path === "C:/o/g2.png").id);
    await p.click('.b-tile[data-id="' + rid + '"]', { button: "right" }); await p.waitForTimeout(80);
    await p.click('#b-menu [data-m="3d"]'); await p.waitForTimeout(100);
    check("right-click → 3D views opens a window next to that result", await p.evaluate((id) => window.VSBoard._state().nodes.some((n) => n.kind === "3d" && n.from === id), rid), "");
    await p.evaluate(() => { window.__lastJob = null; });
    const n3 = '.b-node[data-nid="' + await p.evaluate(() => window.VSBoard._state().nodes.find((n) => n.kind === "3d").id) + '"]';
    await p.evaluate((sel) => { document.querySelector(sel + ' [data-n3="rear"]').click(); document.querySelector(sel + " [data-nr]").click(); }, n3); await p.waitForTimeout(300);
    const j3 = await p.evaluate(() => window.__lastJob);
    check("3D views runs that result to the view picked", !!j3 && j3.image === "C:/o/g2.png" && j3.view && j3.view.target === "rear", JSON.stringify(j3));
    await p.ev("studio-job", { id: "j1", state: "done" }); await p.waitForTimeout(700);
    // Upscale through the upscaler.
    await p.evaluate(() => { const a = window.pywebview.api; window.__ups = [];
      a.set_setting = (k, v) => { window.__ups.push(k + "=" + v); return Promise.resolve(null); };
      a.studio_to_upscale = (path) => Promise.resolve([{ id: "u1", path, status: "ready" }]);
      a.start = () => { window.__ups.push("start"); return Promise.resolve(true); }; });
    await p.click('.b-tile[data-id="' + rid + '"]', { button: "right" }); await p.waitForTimeout(80);
    await p.click('#b-menu [data-m="upscale"]'); await p.waitForTimeout(100);
    const nu = '.b-node[data-nid="' + await p.evaluate(() => window.VSBoard._state().nodes.find((n) => n.kind === "upscale").id) + '"]';
    await p.evaluate((sel) => { document.querySelector(sel + ' [data-nu="4"]').click(); document.querySelector(sel + " [data-nr]").click(); }, nu); await p.waitForTimeout(200);
    check("Upscale sets the size and starts", (await p.evaluate(() => window.__ups.join(","))) === "scale=4,start", await p.evaluate(() => window.__ups.join(",")));
    await p.ev("item", { id: "u1", name: "g2.png", preview: img, path: "C:/o/g2.png", status: "done", out_path: "C:/o/g2_x4.png", out_w: 6400, out_h: 3600, out_preview: img });
    await p.waitForTimeout(150);
    check("the upscaled picture lands at the end of the Upscale window", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.path === "C:/o/g2_x4.png" && t.via)), "");
    check("the selected window's line is dark, the others grey", await p.evaluate(() => document.querySelectorAll("#b-links path.dk").length >= 1 && document.querySelectorAll("#b-links path.gr").length >= 1), "");
    // ‹ goes back to the tool list where the window was.
    await p.evaluate((sel) => document.querySelector(sel + " [data-nback]").click(), nu); await p.waitForTimeout(100);
    check("‹ closes the window and opens the tool list", await p.evaluate(() => !window.VSBoard._state().nodes.some((n) => n.kind === "upscale") && !document.getElementById("b-acts").hidden), "");
    await p.keyboard.press("Escape"); await p.waitForTimeout(50);
    await p.click('.b-tile[data-id="' + rid + '"]', { button: "right" }); await p.waitForTimeout(80);
    await p.click('#b-menu [data-m="upscale"]'); await p.waitForTimeout(100);
    const nu2 = '.b-node[data-nid="' + await p.evaluate(() => window.VSBoard._state().nodes.find((n) => n.kind === "upscale").id) + '"]';
    await p.evaluate((sel) => document.querySelector(sel + " [data-nx]").click(), nu2); await p.waitForTimeout(80);
    check("× closes the window; its pictures stay", await p.evaluate(() => !window.VSBoard._state().nodes.some((n) => n.kind === "upscale") && window.VSBoard._state().tiles.some((t) => t.path === "C:/o/g2_x4.png")), "");
    check("windows are saved with the board", await p.evaluate(() => (window.__board.nodes || []).length === 2), await p.evaluate(() => JSON.stringify((window.__board || {}).nodes)));
    check("no page errors with tool windows", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // A click beside the picture closes a result in view (like Escape); board zoom goes to 1000%.
  {
    const p = await open(browser, null, {});
    const g = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    await p.evaluate((g) => { const S = window.VS.S.create; S.source = "image"; window.VS.setImage(S, "src", { path: "C:/i/a.png", name: "a.png", w: 1600, h: 900, preview: g });
      S.results = [{ path: "C:/o/r1.png", name: "r1.png", w: 1600, h: 900, preview: g, srcKey: "C:/i/a.png" }]; S.sel = 0; window.VS.render(); }, g);
    await p.waitForTimeout(150);
    const spot = await p.evaluate(() => { const v = document.getElementById("c-view").getBoundingClientRect(), f = document.querySelector("#c-view .s-fit, #c-view img.s-res");
      const r = f ? f.getBoundingClientRect() : { left: v.left, right: v.left, top: v.top, bottom: v.top };
      return [Math.round((v.left + r.left) / 2) || v.left + 10, Math.round(v.top + v.height * 0.5)]; });
    await p.mouse.click(spot[0], spot[1]); await p.waitForTimeout(100);
    check("a click beside the picture shows your picture again (like Escape)", await p.evaluate(() => window.VS.S.create.sel) === -1, JSON.stringify(spot));
    await p.evaluate(() => { window.VS.S.create.sel = 0; window.VS.render(); }); await p.waitForTimeout(80);
    const on = await p.evaluate(() => { const f = document.querySelector("#c-view img.s-res") || document.querySelector("#c-view .s-fit"); const r = f.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.click(on[0], on[1]); await p.waitForTimeout(100);
    check("a click on the picture keeps the result", await p.evaluate(() => window.VS.S.create.sel) === 0, "");
    check("no page errors (click beside)", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }
  {
    const p = await open(browser, null, { board: true });
    const c = await p.evaluate(() => { const r = document.getElementById("b-cv").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.move(c[0], c[1]);
    for (let i = 0; i < 40; i++) await p.mouse.wheel(0, -400);
    await p.waitForTimeout(100);
    check("board zoom goes to 1000%", await p.evaluate(() => window.VSBoard._state().view.z) > 9.9, await p.evaluate(() => window.VSBoard._state().view.z));
    await p.close();
  }

  // An opened picture (no result yet) can go to Photoshop, the board or Upscale; Upscale has the bar too.
  {
    const p = await open(browser, null, {});
    await p.evaluate(() => { window.VS.S.create.source = "image"; window.VS.setImage(window.VS.S.create, "src", { path: "C:/i/01_end.jpg", name: "01_end.jpg", w: 1536, h: 652, preview: "x" }); });
    await p.waitForTimeout(100);
    check("an opened picture can go to Photoshop, the board and Upscale", await p.evaluate(() => !document.getElementById("c-tops").disabled && !document.getElementById("c-toboard").disabled && !document.getElementById("c-up").disabled && document.getElementById("c-refine-this").disabled),
      await p.evaluate(() => ["c-tops", "c-toboard", "c-up", "c-refine-this"].map((i) => i + ":" + document.getElementById(i).disabled).join(" ")));
    await p.evaluate(() => { window.__sent = null; window.pywebview.api.studio_send = (path) => { window.__sent = path; return Promise.resolve({ ok: true }); }; });
    await p.click("#c-tops"); await p.waitForTimeout(100);
    check("Photoshop gets the opened picture", await p.evaluate(() => window.__sent) === "C:/i/01_end.jpg", await p.evaluate(() => window.__sent));
    await p.click(".s-nav button[data-page=upscale]"); await p.waitForTimeout(200);
    check("Upscale has Refine, To board and Photoshop", await p.evaluate(() => !!(document.getElementById("u-refine") && document.getElementById("u-toboard") && document.getElementById("u-tops"))), "missing");
    check("no page errors with the action bars", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Pictures float: wheel zooms, middle button pans, Fit resets; lasso, pen and Deselect make and clear a mask.
  {
    const p = await open(browser, null, {});
    await p.evaluate(() => { window.VS.S.create.source = "image"; window.VS.setImage(window.VS.S.create, "src", { path: "C:/i/a.jpg", name: "a.jpg", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==" }); });
    await p.waitForTimeout(200);
    const vb = await p.locator("#c-view").boundingBox();
    await p.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
    await p.mouse.wheel(0, -100); await p.mouse.wheel(0, -100); await p.waitForTimeout(100);
    const z1 = await p.text("#c-view .s-zpill b");
    check("mouse wheel zooms the picture", z1 !== "100%" && /%/.test(z1), z1);
    const t0 = await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform);
    await p.mouse.down({ button: "middle" }); await p.mouse.move(vb.x + vb.width / 2 - 80, vb.y + vb.height / 2 - 40, { steps: 4 }); await p.mouse.up({ button: "middle" });
    check("middle button pans", await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform) !== t0, t0);
    await p.click("#c-view .s-zpill [data-z=fit]"); await p.waitForTimeout(50);
    check("Fit goes back to 100%", (await p.text("#c-view .s-zpill b")) === "100%", await p.text("#c-view .s-zpill b"));
    const st = () => p.evaluate(() => window.VSSketch._state().T);
    const size0 = (await st()).sizes.brush;
    await p.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
    await p.keyboard.press("]"); await p.waitForTimeout(50);
    check("] makes the brush bigger", (await st()).sizes.brush > size0, "same size");
    const fb = await p.locator("#c-view .s-fit").boundingBox(), at = (u, v) => [fb.x + fb.width * u, fb.y + fb.height * v];
    // The brush paints on a layer (not a mask).
    await p.keyboard.press("b");
    await p.mouse.move(...at(0.2, 0.5)); await p.mouse.down(); await p.mouse.move(...at(0.7, 0.55), { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(100);
    check("the brush paints on a layer", await p.evaluate(() => !!window.VSSketch.payload(window.VS.S.create.src)), "nothing painted");
    check("painting doesn't make a selection", !(await p.evaluate(() => { window.VS.painter.check(); return window.VS.painter.any; })), "a mask appeared");
    await p.evaluate(() => { window.__job = null; window.pywebview.api.studio_run = (j) => { window.__job = j; return Promise.resolve("j9"); }; window.VS.S.status = Object.assign(window.VS.S.status || {}, { create_ready: true }); });
    await p.click("#c-go"); await p.waitForTimeout(100);
    check("Create sends the painted layers", await p.evaluate(() => !!(window.__job && window.__job.layers && window.__job.layers.layers.length === 1)), JSON.stringify(await p.evaluate(() => window.__job && Object.keys(window.__job))));
    await p.evaluate(() => { const S = window.VS.S.create; S.job = null; S.pending = 0; window.VS.render(); });
    await p.waitForTimeout(100);
    // Layers: add one, hide it.
    await p.hover("#sk-panel"); await p.waitForTimeout(200);
    const n0 = await p.evaluate(() => window.VSSketch._state().doc.layers.length);
    await p.click("#sk-panel [data-a=add]"); await p.waitForTimeout(100);
    check("+ Layer adds a layer", await p.evaluate(() => window.VSSketch._state().doc.layers.length) === n0 + 1, "");
    await p.click("#sk-panel .row.on [data-a=eye]"); await p.waitForTimeout(100);
    check("the eye hides a layer", await p.evaluate(() => { const d = window.VSSketch._state().doc; return !d.layers.filter((L) => L.id === d.active)[0].visible; }), "still visible");
    await p.mouse.move(...at(0.5, 0.5));
    await p.keyboard.press("p");
    for (const q of [[0.2, 0.2], [0.5, 0.2], [0.5, 0.6], [0.2, 0.6]]) { await p.mouse.click(...at(...q)); await p.waitForTimeout(30); }
    await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    const anyMask = () => p.evaluate(() => { window.VS.painter.check(); return window.VS.painter.any; });
    check("the pen closes into a selection", await anyMask(), "no mask");
    check("Create then changes only the selected area", /selected area/i.test(await p.text("#c-go")), await p.text("#c-go"));
    await p.keyboard.press("Control+d"); await p.waitForTimeout(100);
    check("Ctrl D deselects", !(await anyMask()), "mask still there");
    await p.evaluate(() => { window.__snap = 0; window.pywebview.api.studio_snap = () => { window.__snap++; return Promise.resolve({ mask: null }); }; });
    await p.keyboard.press("l");
    // free hand: hold, draw round, let go
    await p.mouse.move(...at(0.3, 0.3)); await p.mouse.down();
    for (const q of [[0.6, 0.3], [0.6, 0.7], [0.3, 0.7]]) await p.mouse.move(...at(...q), { steps: 6 });
    await p.mouse.up(); await p.waitForTimeout(150);
    check("the lasso is free hand: draw round it and let go", await anyMask(), "no mask");
    check("a drawn selection is snapped to the object", await p.evaluate(() => window.__snap) === 1, String(await p.evaluate(() => window.__snap)));
    await p.keyboard.press("Control+d");
    // Alt: snaps to edges (click, follow, close)
    await p.keyboard.down("Alt"); await p.mouse.click(...at(0.3, 0.3)); await p.keyboard.up("Alt");
    for (const q of [[0.6, 0.3], [0.6, 0.7], [0.3, 0.7]]) await p.mouse.move(...at(...q), { steps: 6 });
    await p.mouse.move(...at(0.3, 0.3), { steps: 6 }); await p.mouse.click(...at(0.3, 0.3)); await p.waitForTimeout(100);
    check("Alt lasso snaps along edges and closes", await anyMask(), "no mask");
    await p.keyboard.press("Control+d");
    // polygon lasso: straight corners
    await p.evaluate(() => window.VSSketch.setTool ? window.VSSketch.setTool("poly") : window.VS.painter.setTool("poly"));
    await p.evaluate(() => { window.VS.painter.tool = "poly"; });
    for (const q of [[0.2, 0.2], [0.5, 0.25], [0.45, 0.6]]) { await p.mouse.click(...at(...q)); await p.waitForTimeout(30); }
    await p.mouse.click(...at(0.2, 0.2)); await p.waitForTimeout(100);
    check("the polygon lasso closes into a selection", await anyMask(), "no mask");
    await p.keyboard.press("Control+d");
    await p.keyboard.press("m");
    await p.mouse.move(...at(0.1, 0.1)); await p.mouse.down(); await p.mouse.move(...at(0.4, 0.4), { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(100);
    check("the rectangle makes a selection", await anyMask(), "no mask");
    // Colour pick from the picture (white test picture) and the colour pop-up.
    await p.keyboard.press("i"); await p.mouse.click(...at(0.7, 0.6)); await p.waitForTimeout(50);
    check("the eyedropper takes the picture's colour", (await st()).color === "#ffffff", (await st()).color);
    await p.click("#sk-bar .sk-sw"); await p.waitForTimeout(100);
    check("the colour pop-up opens", await p.evaluate(() => !!document.querySelector(".s-pop .sk-cp")), "no pop-up");
    await p.keyboard.press("Escape");
    // Drop-downs.
    await p.click('#sk-bar [data-dd=erase]'); await p.waitForTimeout(100);
    check("the eraser menu offers the magic eraser", /Magic eraser/.test(await p.evaluate(() => document.querySelector(".s-pop").innerText)), "");
    await p.click('#sk-bar [data-dd=erase]'); await p.waitForTimeout(100);
    check("clicking the same tool again closes its menu", await p.evaluate(() => !document.querySelector(".s-pop")), "still open");
    check("no page errors with zoom and selection tools", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Sketching, part 2: magic eraser, undo, transform, merge, branching off Live.
  {
    const p = await open(browser, null, {});
    const W1 = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    await p.evaluate((w) => { window.VS.S.create.source = "image"; window.VS.setImage(window.VS.S.create, "src", { path: "C:/i/b.jpg", name: "b.jpg", w: 1600, h: 900, preview: w }); }, W1);
    await p.waitForTimeout(200);
    const fb = await p.locator("#c-view .s-fit").boundingBox(), at = (u, v) => [fb.x + fb.width * u, fb.y + fb.height * v];
    const doc = () => p.evaluate(() => { const d = window.VSSketch._state().doc; return d.layers.map((L) => L.name); });
    await p.mouse.move(...at(0.5, 0.5)); await p.keyboard.press("b");
    await p.mouse.down(); await p.mouse.move(...at(0.6, 0.6), { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(50);
    await p.keyboard.press("Control+z"); await p.waitForTimeout(50);
    check("Ctrl Z undoes a stroke", !(await p.evaluate(() => !!window.VSSketch.payload(window.VS.S.create.src))), "still painted");
    await p.keyboard.press("Control+Shift+z"); await p.waitForTimeout(50);
    check("Ctrl Shift Z redoes it", await p.evaluate(() => !!window.VSSketch.payload(window.VS.S.create.src)), "not back");
    // Transform: move the stroke and apply.
    await p.keyboard.press("t"); await p.waitForTimeout(50);
    check("Transform shows its box", await p.evaluate(() => !!document.querySelector(".sk-tf")), "no box");
    await p.mouse.move(...at(0.55, 0.55)); await p.mouse.down(); await p.mouse.move(...at(0.3, 0.3), { steps: 5 }); await p.mouse.up();
    await p.keyboard.press("Enter"); await p.waitForTimeout(50);
    check("Enter applies the transform", await p.evaluate(() => !document.querySelector(".sk-tf") && window.VSSketch.tool() === "brush"), "still transforming");
    // Magic eraser: paints a red mask, gets a patch back, puts it on its own layer.
    await p.evaluate(() => { window.pywebview.api.studio_magic_erase = (img, m) => { window.__magic = [img.slice(0, 22), m.slice(0, 22)]; const c = document.createElement("canvas"); c.width = c.height = 8; const g = c.getContext("2d"); g.fillStyle = "#0f0"; g.fillRect(0, 0, 8, 8); return Promise.resolve({ patch: c.toDataURL() }); }; });
    await p.click("#sk-bar [data-dd=erase]"); await p.waitForTimeout(80);
    await p.click('.s-pop [data-p=magic]'); await p.waitForTimeout(50);
    await p.mouse.move(...at(0.4, 0.4)); await p.mouse.down(); await p.mouse.move(...at(0.5, 0.45), { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
    check("the magic eraser sends the picture and a mask", await p.evaluate(() => !!(window.__magic && /^data:image\/png/.test(window.__magic[0]) && /^data:image\/png/.test(window.__magic[1]))), JSON.stringify(await p.evaluate(() => window.__magic)));
    check("its result lands on a layer of its own", (await doc()).indexOf("Magic erase") >= 0, JSON.stringify(await doc()));
    // Merge down.
    const n0 = (await doc()).length;
    await p.evaluate(() => { const d = window.VSSketch._state().doc; d.active = d.layers[d.layers.length - 1].id; });
    await p.hover("#sk-panel"); await p.waitForTimeout(150);
    await p.click("#sk-panel [data-a=merge]"); await p.waitForTimeout(80);
    check("Merge down joins two layers", (await doc()).length === n0 - 1, JSON.stringify(await doc()));
    check("no page errors while sketching", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }
  {
    // Drawing on Live starts a new sketch from a frozen copy; Photoshop's picture is left alone.
    const p = await open(browser, null, {});
    await p.ev("studio-live", frame(1));
    await p.evaluate(() => { window.pywebview.api.studio_freeze = (path, name) => Promise.resolve({ path: "C:/s/flat 2 · sketch 1.png", name: "flat 2 · sketch 1.png", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==" }); });
    await p.waitForTimeout(200);
    const fb = await p.locator("#c-view .s-fit").boundingBox();
    await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await p.keyboard.press("b");
    await p.mouse.down(); await p.mouse.move(fb.x + fb.width / 2 + 30, fb.y + fb.height / 2, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(200);
    check("drawing on Live branches off a new sketch", await p.evaluate(() => /sketch 1/.test(window.VS.S.create.src.name) && !window.VS.S.create.src.live), await p.evaluate(() => window.VS.S.create.src.name));
    check("the sketch is on the board, joined to Live", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => /sketch 1/.test(t.name) && t.from === "live")), "");
    check("no page errors when branching", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }
  {
    // The + menu: a blank canvas lands on the board.
    const p = await open(browser, null, { board: true });
    await p.evaluate(() => { window.pywebview.api.studio_blank = (w, h) => { window.__blank = [w, h]; return Promise.resolve({ path: "C:/s/Sketch 1.png", name: "Sketch 1.png", w, h, preview: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==" }); }; });
    await p.click(".b-bar .b-plus"); await p.waitForTimeout(100);
    check("+ opens the add menu", /New blank canvas/.test(await p.evaluate(() => document.querySelector(".s-pop").innerText)), "");
    check("each canvas size is its own button", await p.evaluate(() => document.querySelectorAll(".s-pop .s-sizes button").length) === 4, "");
    await p.click(".s-pop [data-p='fmt:a4p']"); await p.waitForTimeout(150);
    check("a blank A4 canvas at 150 DPI", JSON.stringify(await p.evaluate(() => window.__blank)) === "[1240,1754]", JSON.stringify(await p.evaluate(() => window.__blank)));
    check("it lands on the board", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.name === "Sketch 1.png")), "");
    check("a portrait A4 canvas gets a portrait tile", await p.evaluate(() => { const t = window.VSBoard._state().tiles.find((x) => x.name === "Sketch 1.png"); const el = document.querySelector('.b-tile[data-id="' + t.id + '"] .b-pic, .b-tile[data-id="' + t.id + '"] .b-empty'); return el.offsetHeight > el.offsetWidth; }), "");
    // Upload from phone: a QR code, and what the phone sends lands on the board.
    await p.evaluate(() => { window.pywebview.api.studio_phone = (on) => { window.__phone = on; return Promise.resolve(on ? { on: true, url: "http://192.168.1.5:8395/drop?k=x", qr: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" } : { on: false }); }; });
    await p.click(".b-bar .b-plus"); await p.waitForTimeout(80);
    await p.click(".s-pop [data-p=phone]"); await p.waitForTimeout(120);
    check("Upload from phone shows a QR code", await p.evaluate(() => !!document.querySelector("#s-phone .qr img")), "no QR");
    await p.ev("studio-dropped", { target: "board", from: "phone", images: [{ path: "C:/d/phone_1.jpg", name: "phone_1.jpg", w: 1200, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==" }] });
    await p.waitForTimeout(100);
    check("a phone picture lands on the board", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.name === "phone_1.jpg")) && /on the board/.test(await p.text("#s-phone .st")), await p.text("#s-phone .st"));
    await p.keyboard.press("Escape"); await p.waitForTimeout(50);
    check("closing stops the phone link", await p.evaluate(() => !document.getElementById("s-phone") && window.__phone === false), "");
    check("no page errors with the + menu", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // The Create panel: Working on, prompt, Keep locks (with a warning when words clash).
  {
    const p = await open(browser, null, {});
    const W1 = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    await p.evaluate((w) => { window.VS.S.create.source = "image"; window.VS.setImage(window.VS.S.create, "src", { path: "C:/s/Sketch 1.png", name: "Sketch 1.png", w: 1240, h: 1754, preview: w }); }, W1);
    await p.waitForTimeout(150);
    const locks = () => p.evaluate(() => [...document.querySelectorAll("#c-locks button.on")].map((b) => b.getAttribute("data-v")).join(","));
    check("Working on shows the open picture", /Sketch 1/.test(await p.text("#c-work")), await p.text("#c-work"));
    check("a sketch starts with Design and Camera locked", (await locks()) === "design,camera", await locks());
    await p.evaluate((w) => { window.VS.setImage(window.VS.S.create, "src", { path: "C:/o/flat 2_create_v1.png", name: "flat 2_create_v1.png", w: 2368, h: 1328, preview: w }); }, W1);
    await p.waitForTimeout(150);
    check("a render starts with everything locked", (await locks()) === "design,materials,light,camera", await locks());
    await p.fill("#c-text", "make the seats red leather, at sunset"); await p.waitForTimeout(80);
    check("words win over Materials and Light: no warning", await p.evaluate(() => document.getElementById("c-warn").hidden), await p.text("#c-warn"));
    await p.fill("#c-text", "make the seats red leather, seen from a side view"); await p.waitForTimeout(80);
    check("words that move a locked camera show a warning", /locked/.test(await p.text("#c-warn")), await p.text("#c-warn"));
    await p.fill("#c-text", "red leather, maintain the original camera view and composition"); await p.waitForTimeout(80);
    check("keeping the camera is not a clash", await p.evaluate(() => document.getElementById("c-warn").hidden), await p.text("#c-warn"));
    await p.click("#c-locks button[data-v=materials]"); await p.click("#c-locks button[data-v=light]");
    await p.fill("#c-text", "make the seats red leather, at sunset"); await p.waitForTimeout(80);
    await p.evaluate(() => { window.__job = null; window.pywebview.api.studio_run = (j) => { window.__job = j; return Promise.resolve("j7"); }; window.VS.S.status = Object.assign(window.VS.S.status || {}, { create_ready: true }); });
    await p.click("#c-go"); await p.waitForTimeout(80);
    check("Create sends the locks", await p.evaluate(() => !!(window.__job && window.__job.locks && window.__job.locks.design && !window.__job.locks.materials)), JSON.stringify(await p.evaluate(() => window.__job && window.__job.locks)));
    // a second Create while the first runs is queued and starts when it's done
    await p.evaluate(() => { window.__n = 0; window.pywebview.api.studio_run = (j) => { window.__n++; return Promise.resolve("q" + window.__n); }; });
    await p.click("#c-go"); await p.waitForTimeout(80);
    check("Create while running queues the run", await p.evaluate(() => (window.VS.S.create.queue || []).length === 1 && window.__n === 0) && /Queue another · 1 waiting/.test(await p.text("#c-golabel")), await p.text("#c-golabel"));
    await p.ev("studio-job", { id: "j7", state: "done" }); await p.waitForTimeout(500);
    check("the queued run starts by itself", await p.evaluate(() => window.__n === 1 && (window.VS.S.create.queue || []).length === 0), String(await p.evaluate(() => window.__n)));
    // Assets: Library tab, the picker in References (up to 6), prompts in the Prompts list
    await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 40; c.height = 30; c.getContext("2d").fillStyle = "#a86"; c.getContext("2d").fillRect(0, 0, 40, 30); const u = c.toDataURL();
      const it = (n) => ({ path: "C:/A/Seats/" + n + ".jpg", name: n, desc: "", thumb: u });
      window.pywebview.api.studio_assets = () => Promise.resolve({ dir: "C:/A", cats: [{ name: "Seats", items: [it("s1"), it("s2"), it("s3"), it("s4"), it("s5"), it("s6"), it("s7")] }, { name: "Empty", items: [] }],
        prompts: [{ cat: "Interior", name: "Cognac CMF", text: "cognac leather everywhere", mine: false }, { cat: "Mine", name: "night", text: "night lines", mine: true }] });
      window.pywebview.api.studio_image = (path) => Promise.resolve({ path, name: path.split("/").pop(), w: 400, h: 300, preview: u });
      window.VS.S.create.refs = []; window.VS.go("library"); });
    await p.waitForTimeout(150);
    await p.click('#l-filters [data-v="assets"]'); await p.waitForTimeout(250);
    check("Library › Assets shows the categories and pictures", await p.evaluate(() => document.querySelectorAll("#l-assets .as-card").length === 7 && /Seats/.test(document.querySelector("#l-assets .as-chips").textContent) && !/Empty/.test(document.querySelector("#l-assets .as-chips").textContent)), "");
    check("Library › Assets lists the prompts", await p.evaluate(() => document.querySelectorAll("#l-assets .as-pr").length === 2), "");
    await p.screenshot({ path: (process.env.SHOT_DIR || "/tmp") + "/assets_lib.png" });
    await p.evaluate(() => window.VS.go("create")); await p.waitForTimeout(150);
    await p.click("#c-refs [data-radd]"); await p.waitForTimeout(80); await p.click('.s-pop [data-p="assets"]'); await p.waitForTimeout(150);
    for (let k = 0; k < 7; k++) { await p.click("#as-modal .as-card >> nth=" + k); await p.waitForTimeout(60); }
    check("References take up to 6 pictures from Assets", await p.evaluate(() => window.VS.S.create.refs.length === 6), String(await p.evaluate(() => window.VS.S.create.refs.length)));
    await p.click("#as-modal [data-asx]"); await p.waitForTimeout(80);
    await p.click("#c-refs [data-ru] >> nth=5"); await p.waitForTimeout(80);
    check("Design is a reference use", await p.evaluate(() => !!document.querySelector('.s-pop [data-p="design"]')), "");
    await p.click('.s-pop [data-p="design"]'); await p.waitForTimeout(80);
    await p.screenshot({ path: (process.env.SHOT_DIR || "/tmp") + "/assets_refs.png" });
    await p.click("#c-libb"); await p.waitForTimeout(200);
    check("Prompts lists the Assets prompts too", await p.evaluate(() => /Mine/.test(document.querySelector("#c-plib").textContent) && /Interior/.test(document.querySelector("#c-plib").textContent)), "");
    await p.click("#c-libb");
    await p.evaluate(() => { window.VS.S.create.refs = []; window.VS.render(); });
    check("no page errors in the Create panel", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // A result you like goes on a layer over the picture; the layers are kept for the board.
  {
    const p = await open(browser, null, {});
    const W1 = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    await p.evaluate(() => { window.__docs = {}; const a = window.pywebview.api; a.studio_doc_save = (path, d) => { window.__docs[path] = d; return Promise.resolve(true); }; a.studio_doc_get = (path) => Promise.resolve(window.__docs[path] || null); });
    await p.evaluate((w) => { window.VS.S.create.source = "image"; window.VS.setImage(window.VS.S.create, "src", { path: "C:/s/k.png", name: "k.png", w: 1600, h: 900, preview: w }); }, W1);
    await p.waitForTimeout(150);
    await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 16; c.height = 9; const g = c.getContext("2d"); g.fillStyle = "#c00"; g.fillRect(0, 0, 16, 9);
      const S = window.VS.S.create; S.results.push({ path: "C:/o/k_create_v1.png", name: "k_create_v1.png", w: 1600, h: 900, preview: c.toDataURL(), srcKey: "C:/s/k.png" }); S.sel = S.results.length - 1; window.VS.render(); });
    await p.waitForTimeout(100);
    check("a result shows Add and Export on the picture", await p.evaluate(() => !!document.querySelector("#c-view .s-ra [data-ra=add]") && !!document.querySelector("#c-view .s-ra [data-ra=export]")), "missing");
    await p.evaluate(() => { window.pywebview.api.studio_save_copy = (path) => { window.__exp = [path, "orig"]; return Promise.resolve("x.png"); };
      window.pywebview.api.studio_to_upscale = (path) => { window.__up = path; return Promise.resolve(true); }; });
    await p.click("#c-view .s-ra [data-ra=export]"); await p.waitForTimeout(80);
    check("Export offers original and upscale", await p.evaluate(() => !!document.querySelector(".s-pop [data-p=orig]") && !!document.querySelector(".s-pop [data-p=up]")), "");
    await p.click(".s-pop [data-p=orig]"); await p.waitForTimeout(80);
    check("Export original saves the result as it is", JSON.stringify(await p.evaluate(() => window.__exp)) === JSON.stringify(["C:/o/k_create_v1.png", "orig"]), JSON.stringify(await p.evaluate(() => window.__exp)));
    await p.evaluate(() => { const S = window.VS.S.create; S.sel = -1; window.VS.render(); });
    await p.waitForTimeout(80);
    check("the original shows Export too", await p.evaluate(() => !!document.querySelector("#c-view .s-ra [data-ra=export]")), "missing");
    await p.evaluate(() => { const S = window.VS.S.create; S.sel = S.results.length - 1; window.VS.render(); });
    await p.waitForTimeout(80);
    await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 16; c.height = 9; c.getContext("2d").fillRect(0, 0, 16, 9); const u = c.toDataURL();
      window.pywebview.api.studio_image = (path) => { window.__imgFor = path; return Promise.resolve({ path, name: "k_create_v1.png", w: 1600, h: 900, preview: u }); }; });
    await p.click("#c-view .s-ra [data-ra=add]"); await p.waitForTimeout(300);
    check("Add uses the full picture, not the strip thumbnail", await p.evaluate(() => window.__imgFor) === "C:/o/k_create_v1.png", "");
    await p.evaluate(() => { window.pywebview.api.studio_export = (path, fmt) => { window.__exp = [path, fmt]; return Promise.resolve("x." + fmt); }; });
    check("Layer puts the result on a layer over the picture", await p.evaluate(() => window.VS.S.create.sel === -1 && window.VSSketch._state().doc.layers.some((L) => /k_create_v1/.test(L.name))), JSON.stringify(await p.evaluate(() => window.VSSketch._state().doc.layers.map((L) => L.name))));
    await p.waitForTimeout(1500);
    // Upscale (and the rest of the bar) gets the picture flattened with its layers.
    await p.evaluate(() => { const a = window.pywebview.api; a.studio_flatten = (path, spec) => { window.__flat = [path, spec.layers.length]; return Promise.resolve({ path: "C:/s/k · flat.png", name: "k · flat.png", w: 1600, h: 900, preview: "x" }); };
      a.studio_to_upscale = (path) => { window.__up = path; return Promise.resolve(true); }; });
    await p.click("#c-up"); await p.waitForTimeout(150);
    check("Upscale gets the flattened picture when there are layers", await p.evaluate(() => window.__up) === "C:/s/k · flat.png" && (await p.evaluate(() => window.__flat[0])) === "C:/s/k.png", JSON.stringify(await p.evaluate(() => [window.__up, window.__flat])));
    await p.evaluate(() => window.VS.go("create")); await p.waitForTimeout(100);
    check("the layers are kept (with a flattened look for the board)", await p.evaluate(() => { const d = window.__docs["C:/s/k.png"]; return !!(d && d.flat && d.layers.some((L) => L.png)); }), "not saved");
    check("no page errors with result layers", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Each picture always shows everything made from it (from the output folders); no Clear.
  {
    const p = await open(browser, null, {});
    await p.evaluate(() => { window.pywebview.api.studio_results_for = (name) => Promise.resolve(/flat 2/.test(name) ? [
      { path: "C:/o/Vistiq_flat 2_create_v2.png", name: "Vistiq_flat 2_create_v2.png", w: 2368, h: 1328, thumb: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", made: 2 },
      { path: "C:/o/Vistiq_flat 2_create_v1.png", name: "Vistiq_flat 2_create_v1.png", w: 2368, h: 1328, thumb: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", made: 1 }] : []); });
    await p.evaluate(() => { window.VS.S.create.results = []; window.VS.S.create.source = "image"; window.VS.setImage(window.VS.S.create, "src", { path: "C:/i/flat 2.png", name: "flat 2.png", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }); });
    await p.waitForTimeout(200);
    await p.click("#c-strip [data-i='0']"); await p.waitForTimeout(80);
    check("a result shows in the main view; the layers stay", await p.evaluate(() => !!document.querySelector("#c-view .s-pane .s-res") && !!document.querySelector("#sk-panel")), "");
    check("the result covers the picture exactly", await p.evaluate(() => { const a = document.querySelector("#c-view > .s-fit").getBoundingClientRect(), b = document.querySelector("#c-view .s-pane").getBoundingClientRect(); return Math.abs(a.width - b.width) < 2 && Math.abs(a.left - b.left) < 2; }), "");
    await p.keyboard.press("ArrowRight"); await p.waitForTimeout(80);
    check("→ flips to the next result", await p.evaluate(() => window.VS.S.create.sel === 1), String(await p.evaluate(() => window.VS.S.create.sel)));
    await p.click("#c-strip [data-i='1']"); await p.waitForTimeout(80);
    await p.click("#c-strip [data-i='0']"); await p.waitForTimeout(60);
    await p.keyboard.press("Escape"); await p.waitForTimeout(60);
    check("Esc goes back to your picture", await p.evaluate(() => window.VS.S.create.sel === -1), "");
    await p.click("#c-strip [data-i='1']"); await p.waitForTimeout(60);
    await p.click("#c-strip [data-i='1']"); await p.waitForTimeout(60);
    check("clicking the chosen thumbnail again shows your picture", await p.evaluate(() => window.VS.S.create.sel === -1 && !document.querySelector("#c-view .s-pane")), "");
    check("no + Another", await p.evaluate(() => !document.querySelector("#c-strip .s-more")), "");
    await p.evaluate(() => { const S = window.VS.S.create; ["Vistiq_flat 2_create_v3.png", "Vistiq_flat 2_create_v3_2.png"].forEach((n, i) => S.results.push({ path: "C:/o/" + n, name: n, w: 2368, h: 1328, preview: "x", srcKey: S.results[0].srcKey, made: 10 + i })); window.VS.render(); });
    await p.waitForTimeout(80);
    check("a divider after each Create's results", await p.evaluate(() => [...document.getElementById("c-strip").children].filter((e) => !e.classList.contains("s-pin")).map((e) => e.classList.contains("s-div") ? "|" : "i").join("")) === "i|i|ii|", await p.evaluate(() => [...document.getElementById("c-strip").children].filter((e) => !e.classList.contains("s-pin")).map((e) => e.classList.contains("s-div") ? "|" : "i").join("")));
    await p.evaluate(() => { const S = window.VS.S.create; S.results = S.results.filter((r) => !/v3/.test(r.name)); window.VS.render(); });
    check("results are a fifth smaller than the picture's tile", await p.evaluate(() => { const a = document.querySelector("#c-strip .s-pin img").offsetWidth, b = document.querySelector("#c-strip > .s-rt > img").offsetWidth; return Math.abs(b / a - 0.8) < 0.03; }), "");
    check("results carry small numbers", await p.evaluate(() => [...document.querySelectorAll("#c-strip .s-rt > b")].map((b) => b.textContent).join(",")) === "1,2", "");
    check("results run oldest first", await p.evaluate(() => window.VS.S.create.results.map((r) => r.made).join(",")) === "1,2", "");
    check("a picture's strip shows everything made from it", await p.evaluate(() => document.querySelectorAll("#c-strip img[data-i]:not([data-i='-1']):not([data-i='-2'])").length) === 2, await p.evaluate(() => document.getElementById("c-strip").innerHTML.slice(0, 200)));
    check("there is no Clear button any more", await p.evaluate(() => document.getElementById("c-clear").hidden), "still there");
    check("no page errors with the full strip", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // The machine line: graphics card, processor, memory.
  {
    const p = await open(browser, (() => { window.__statsMock = 1; }), {});
    await p.evaluate(() => { window.pywebview.api.studio_stats = () => Promise.resolve({ gpu: { name: "RTX 4090", load: 97, temp: 74, used: 17, total: 24 }, cpu: { name: "i9-13900K", load: 18, temp: null }, ram: { used: 28, total: 64 } }); });
    await p.waitForTimeout(3300);
    const t = await p.text("#s-machine");
    check("the machine line shows GPU, VRAM, CPU and RAM", /RTX 4090/.test(t) && /97%/.test(t) && /17\.0\/24 GB/.test(t) && /i9-13900K/.test(t) && /28\/64 GB/.test(t), t);
    const a = await p.evaluate(() => { const m = document.getElementById("s-machine").getBoundingClientRect(), z = document.querySelector("#c-view .s-zpill"); const zr = z && z.getBoundingClientRect(); return [Math.round(m.top + m.height / 2), zr ? Math.round(zr.top + zr.height / 2) : -1]; });
    check("zoom box sits on the same line", Math.abs(a[0] - a[1]) <= 4 || a[1] === -1, JSON.stringify(a));
    check("no page errors with the machine line", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Upscale: the time estimate shows; while running, bar and × side by side with the timer visible below.
  {
    const p = await open(browser, null, {});
    await p.evaluate(() => { window.pywebview.api.estimates = () => Promise.resolve({ a: 70 }); });
    await p.click(".s-nav button[data-page=upscale]"); await p.waitForTimeout(200);
    const it = { id: "a", path: "C:/x/a.png", name: "a.png", w: 2368, h: 1328, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", status: "ready" };
    await p.evaluate((it) => window.vistiq.event("added", [it]), it); await p.waitForTimeout(400);
    check("Upscale shows the time estimate", /About 1:10/.test(await p.text("#go-meta")), await p.text("#go-meta"));
    await p.evaluate((it) => window.vistiq.event("item", Object.assign({}, it, { status: "running", stage: "Loading model", fraction: 0.04, started: Date.now() - 5000, estimate: 70 })), it);
    await p.waitForTimeout(300);
    check("while upscaling, × sits beside the bar and the timer is visible", await p.evaluate(() => {
      const g = document.getElementById("go").getBoundingClientRect(), x = document.getElementById("go-x").getBoundingClientRect(), m = document.getElementById("go-meta").getBoundingClientRect();
      return x.left >= g.right && Math.abs((x.top + x.height / 2) - (g.top + g.height / 2)) < 3 && m.top >= g.bottom && m.height > 0; }), "");
    check("the Upscale strip ends above the machine line", await p.evaluate(() => { const s = document.querySelector(".strip").getBoundingClientRect(), m = document.getElementById("s-machine").getBoundingClientRect(); return !m.height || s.bottom <= m.top + 2; }), "");
    check("no page errors on Upscale", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // The results strip comes back after a restart; a moved file shows as missing.
  {
    const p = await open(browser, null, {});
    await p.evaluate(() => {
      const api = window.pywebview.api;
      window.__strip = null;
      api.studio_strip_get = () => Promise.resolve({ v: 1, create: [
        { path: "C:/o/kept.png", name: "kept.png", w: 1600, h: 900, srcKey: "live:flat 2.psd", source: "C:/w/sk.jpg" },
        { path: "C:/o/gone.png", name: "gone.png", w: 1600, h: 900, srcKey: "live:flat 2.psd", source: "" }], ref: [], imageSrc: "", source: "live" });
      api.studio_strip_save = (d) => { window.__strip = d; return Promise.resolve(true); };
      api.studio_thumb = (path) => Promise.resolve(/gone/.test(path) ? null : "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
      api.studio_image = (path) => Promise.resolve(/gone/.test(path) ? null : { path, name: "kept.png", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
      window.VS.S.create.results = []; window.VSStrip.load();
    });
    await p.waitForTimeout(200);
    await p.ev("studio-live", frame(1));
    await p.waitForTimeout(150);
    check("results come back after a restart", await p.evaluate(() => window.VS.S.create.results.some((r) => r.path === "C:/o/kept.png") && !!document.querySelector("#c-strip [data-i]")),
      await p.evaluate(() => document.getElementById("c-strip").innerHTML.slice(0, 400)));
    check("a deleted or moved result just leaves the strip", await p.evaluate(() => !window.VS.S.create.results.some((r) => r.path === "C:/o/gone.png") && !document.querySelector("#c-strip .s-miss")), "still there");
    await p.click("#c-strip img[data-i='0']");
    await p.waitForTimeout(150);
    check("clicking a kept result opens the full picture", await p.evaluate(() => window.VS.S.create.sel === 0 && !window.VS.S.create.results[0].thin), JSON.stringify(await p.evaluate(() => window.VS.S.create.results[0])).slice(0, 200));
    await p.ev("studio-result", { id: "", index: 0, of: 1, result: { path: "C:/o/new.png", name: "new.png", w: 1600, h: 900, preview: "x", meta: { source: "C:/w/sk.jpg" } } });
    await p.evaluate(() => { const S = window.VS.S.create; S.results.push({ path: "C:/o/new.png", name: "new.png", w: 1600, h: 900, preview: "x", srcKey: "live:flat 2.psd", meta: { source: "C:/w/sk.jpg", text: "t" } }); window.VS.render(); });
    await p.waitForTimeout(100);
    check("new results are saved for next time", await p.evaluate(() => !!(window.__strip && window.__strip.create.some((r) => r.path === "C:/o/new.png") && window.__strip.create.length >= 2)), JSON.stringify(await p.evaluate(() => window.__strip)).slice(0, 300));
    await p.evaluate(() => { const S = window.VS.S.create; S.results.push({ path: "C:/o/old.png", name: "old.png", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", srcKey: "other" }); window.VS.render(); });
    await p.waitForTimeout(50);
    check("no Earlier fold in the strip", await p.evaluate(() => !document.querySelector("#c-strip .s-earlier")), "still there");
    check("no page errors with the kept strip", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // References live in Create: no Reference tab; each reference gives one thing.
  {
    const p = await open(browser, null, {});
    await p.ev("studio-live", frame(1));
    await p.evaluate(() => window.VS.go("create"));
    await p.waitForTimeout(300);
    check("no Reference tab", await p.evaluate(() => !document.querySelector(".s-nav button[data-page=reference]")), "");
    const G = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    await p.evaluate((g) => { window.VS.addRef({ path: "C:/r/a.png", name: "a.png", w: 100, h: 60, preview: g }); window.VS.addRef({ path: "C:/r/b.png", name: "b.png", w: 100, h: 60, preview: g }); }, G);
    await p.waitForTimeout(100);
    check("references show as tiles with what they give", await p.evaluate(() => [...document.querySelectorAll("#c-refs .s-ru")].map((b) => b.textContent).join("|")) === "Camera|Materials",
      await p.evaluate(() => document.getElementById("c-refs").textContent));
    check("a camera reference unlocks the camera lock", await p.evaluate(() => { const b = document.querySelector("#c-locks [data-v=camera]"); return b.disabled && !b.classList.contains("on"); }), "");
    await p.click("#c-refs [data-ru='1']"); await p.waitForTimeout(100);
    await p.click(".s-pop [data-p=light]"); await p.waitForTimeout(100);
    check("the menu changes what a reference gives", await p.evaluate(() => window.VS.S.create.refs[1].use) === "light", "");
    await p.click("#c-refs [data-rn='2']"); await p.waitForTimeout(50);
    check("clicking Ref 2 puts it in the description", /ref 2/.test(await p.evaluate(() => document.getElementById("c-text").value)), "");
    await p.evaluate(() => { window.__job = null; window.pywebview.api.studio_run = (j) => { window.__job = j; return Promise.resolve("j8"); }; window.VS.S.status = Object.assign(window.VS.S.status || {}, { create_ready: true }); });
    await p.click("#c-go"); await p.waitForTimeout(100);
    const j = await p.evaluate(() => window.__job);
    check("Create sends the references", j && j.refs && j.refs.length === 2 && j.refs[0].use === "camera" && j.refs[1].use === "light" && j.locks.camera === false && j.locks.light === false, JSON.stringify(j && { refs: j.refs, locks: j.locks }));
    await p.evaluate(() => { const S = window.VS.S.create; S.job = null; S.pending = 0; window.VS.render(); });
    await p.click("#c-refs [data-rx='0']"); await p.waitForTimeout(100);
    check("× removes a reference", await p.evaluate(() => window.VS.S.create.refs.length === 1 && document.querySelectorAll("#c-refs .s-ref").length === 1), "");
    // The picture reader fills in the words; they go with Create.
    await p.evaluate(() => { window.VS.S.status = Object.assign(window.VS.S.status || {}, { reader_ready: true, create_ready: true });
      window.pywebview.api.studio_describe = (path, use) => Promise.resolve({ text: "WORDS-" + use }); window.VS.S.create.refs = []; window.VS.render(); });
    await p.evaluate((g) => window.VS.addRef({ path: "C:/r/c.png", name: "c.png", w: 100, h: 60, preview: g }), G);
    await p.waitForTimeout(150);
    check("the picture reader puts the camera into words", await p.evaluate(() => document.querySelector("#c-refd [data-rd='0']").value) === "WORDS-camera", await p.evaluate(() => document.getElementById("c-refd").innerHTML.slice(0, 300)));
    await p.fill("#c-refd [data-rd='0']", "my own camera words");
    await p.click("#c-go"); await p.waitForTimeout(100);
    check("Create sends the reference words", await p.evaluate(() => window.__job && window.__job.refs[0].desc === "my own camera words"), JSON.stringify(await p.evaluate(() => window.__job && window.__job.refs)));
    await p.evaluate(() => { const S = window.VS.S.create; S.job = null; S.pending = 0; window.VS.render(); });
    // A result shows the words it was made with.
    await p.evaluate(() => { const S = window.VS.S.create; S.results.push({ path: "C:/o/w.png", name: "w.png", w: 160, h: 90, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", srcKey: window.VS.S.create.results.length ? window.VS.S.create.results[0].srcKey : "", meta: { text: "white seats", prompt: "FULL PROMPT" } }); });
    await p.evaluate(() => { const S = window.VS.S.create; S.results[S.results.length - 1].srcKey = S.results[0] ? S.results[0].srcKey : ""; S.sel = S.results.length - 1; window.VS.render(); });
    await p.waitForTimeout(150);
    check("a result shows its words in Describe", await p.evaluate(() => document.getElementById("c-text").value) === "white seats", await p.evaluate(() => document.getElementById("c-text").value));
    await p.evaluate(() => { window.VS.S.create.sel = -1; window.VS.render(); }); await p.waitForTimeout(50);
    check("back on the picture, your own words return", await p.evaluate(() => document.getElementById("c-text").value) !== "white seats", "");
    check("the toolbar has a Board button", await p.evaluate(() => !!document.querySelector("#c-view [data-k=board], .sk-bar [data-k=board]")), "");
    check("no page errors with references", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Board: Ctrl-click up to 4 tiles; one bar sends them to Create (1 = design, others references) or compares them.
  {
    const p = await open(browser, null, { board: true });
    const G = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    await p.evaluate((g) => { window.pywebview.api.studio_image = (path) => Promise.resolve({ path, name: path.split("/").pop(), w: 160, h: 90, preview: g });
      window.VSBoard.addImages([1, 2, 3].map((i) => ({ path: "C:/t/" + i + ".png", name: i + ".png", w: 160, h: 90, preview: g }))); }, G);
    await p.waitForTimeout(150);
    const ids = await p.evaluate(() => window.VSBoard._state().tiles.filter((t) => t.kind !== "live").map((t) => t.id));
    await p.click('.b-tile[data-id="' + ids[0] + '"] .b-h');
    await p.click('.b-tile[data-id="' + ids[1] + '"] .b-h', { modifiers: ["Control"] });
    await p.click('.b-tile[data-id="' + ids[2] + '"] .b-h', { modifiers: ["Control"] });
    await p.waitForTimeout(80);
    check("Ctrl-click picks several tiles, numbered", await p.evaluate(() => [...document.querySelectorAll(".b-tile.msel .b-no")].map((b) => b.textContent).sort().join(",")) === "1,2,3", await p.evaluate(() => JSON.stringify(window.VSBoard.multi())));
    check("a bar for the group shows", await p.evaluate(() => !document.getElementById("b-group").hidden), "");
    await p.click("#b-group [data-g=compare]"); await p.waitForTimeout(100);
    check("Compare shows them side by side", await p.evaluate(() => document.querySelectorAll("#b-compare figure").length) === 3, "");
    await p.keyboard.press("Escape"); await p.waitForTimeout(50);
    await p.keyboard.press("q"); await p.waitForTimeout(150);
    check("Q opens Mix: a main picture and a choice per reference", await p.evaluate(() => !document.getElementById("b-mix").hidden && document.querySelectorAll("#b-mix .bm-ref select").length === 2), "");
    await p.selectOption('#b-mix .bm-ref select >> nth=1', "camera");
    await p.fill("#bm-text", "night");
    await p.click("#b-mix [data-x=run]"); await p.waitForTimeout(400);
    check("Mix runs from the board: main + references with what each gives", await p.evaluate(() => {
      const j = window.__lastJob; return !!j && window.VS.S.page === "board" && j.image === "C:/t/1.png" && j.text === "night" &&
        j.refs.length === 2 && j.refs[0].use === "materials" && j.refs[1].use === "camera"; }), await p.evaluate(() => JSON.stringify([window.VS.S.page, window.__lastJob])));
    // New pictures never land on top of others.
    check("new pictures don't overlap", await p.evaluate(() => { const t = window.VSBoard._state().tiles;
      return t.every((a) => t.every((b) => a === b || Math.abs(a.x - b.x) >= 300 || Math.abs(a.y - b.y) >= 199)); }), await p.evaluate(() => JSON.stringify(window.VSBoard._state().tiles.map((x) => [x.x, x.y]))));
    // Drag on the empty board selects with a box; Delete removes them all.
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
    await p.click(".b-bar [data-b=fit]"); await p.waitForTimeout(300);
    const box = await p.evaluate(() => { const r = [...document.querySelectorAll(".b-tile:not(.b-live)")].map((n) => n.getBoundingClientRect());
      return { x0: Math.min(...r.map((q) => q.left)) - 20, y0: Math.min(...r.map((q) => q.top)) - 20, x1: Math.max(...r.map((q) => q.right)) + 20, y1: Math.max(...r.map((q) => q.bottom)) + 20 }; });
    await p.mouse.move(box.x0, box.y0); await p.mouse.down(); await p.mouse.move((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, { steps: 4 }); await p.mouse.move(box.x1, box.y1, { steps: 4 }); await p.mouse.up();
    await p.waitForTimeout(100);
    check("dragging a box selects the tiles in it", await p.evaluate(() => window.VSBoard.multi().length) === 3, await p.evaluate(() => JSON.stringify(window.VSBoard.multi())));
    await p.keyboard.press("Delete"); await p.waitForTimeout(100);
    check("Delete removes the selected tiles", await p.evaluate(() => window.VSBoard._state().tiles.filter((t) => t.kind !== "live").length) === 0, "");
    check("no page errors on the board group", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Each picture keeps its own words.
  {
    const p = await open(browser, null, {});
    await p.evaluate(() => window.VS.go("create"));
    const G = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    await p.evaluate((g) => window.VS.setImage(window.VS.S.create, "src", { path: "C:/a.png", name: "a.png", w: 160, h: 90, preview: g }), G);
    await p.waitForTimeout(100);
    await p.fill("#c-text", "snowy camp");
    await p.evaluate((g) => window.VS.setImage(window.VS.S.create, "src", { path: "C:/b.png", name: "b.png", w: 160, h: 90, preview: g }), G);
    await p.waitForTimeout(100);
    check("a new picture starts with empty words", await p.evaluate(() => document.getElementById("c-text").value) === "", await p.evaluate(() => document.getElementById("c-text").value));
    await p.evaluate((g) => window.VS.setImage(window.VS.S.create, "src", { path: "C:/a.png", name: "a.png", w: 160, h: 90, preview: g }), G);
    await p.waitForTimeout(100);
    check("back on a picture, its words return", await p.evaluate(() => document.getElementById("c-text").value) === "snowy camp", "");
    await p.close();
  }

  // Hold R + drag turns the view; drawing still lands under the pointer; [ ] resize the ring at once.
  {
    const p = await open(browser, null, {});
    await p.ev("studio-live", frame(1));
    await p.evaluate(() => window.VS.go("create"));
    await p.waitForTimeout(400);
    const bb = await (await p.$("#c-view .s-fit")).boundingBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await p.keyboard.down("r"); await p.mouse.move(cx + 150, cy); await p.mouse.down();
    await p.keyboard.down("Shift"); await p.mouse.move(cx + 150, cy + 150, { steps: 5 }); await p.mouse.up(); await p.keyboard.up("Shift"); await p.keyboard.up("r");
    check("hold R and drag turns the view (Shift snaps)", /rotate\(45deg\)/.test(await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform)), await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform));
    const map = await p.evaluate(() => { const f = document.querySelector("#c-view .s-fit"), s = document.createElement("i"); s.style.cssText = "position:absolute;left:25%;top:75%;width:1px;height:1px"; f.appendChild(s); const q = s.getBoundingClientRect(); s.remove(); return window.VS.local({ clientX: q.left + .5, clientY: q.top + .5 }, f); });
    check("a turned view still maps the pointer to the right spot", Math.abs(map[0] - .25) < .01 && Math.abs(map[1] - .75) < .01, JSON.stringify(map));
    await p.click("#c-view .s-zpill [data-z=fit]");
    check("Fit straightens the view", /rotate\(0deg\)/.test(await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform)), "");
    await p.keyboard.press("b").catch(() => {});
    await p.mouse.move(cx, cy); await p.waitForTimeout(50);
    const w0 = await p.evaluate(() => parseFloat(document.querySelector("#c-view .sk-ring").style.width));
    await p.keyboard.press("]"); await p.keyboard.press("]");
    const w1 = await p.evaluate(() => parseFloat(document.querySelector("#c-view .sk-ring").style.width));
    check("[ ] resize the brush ring straight away", w1 > w0, w0 + " -> " + w1);
    check("no crosshair inside the brush ring", await p.evaluate(() => getComputedStyle(document.querySelector("#c-view .sk-catch")).cursor) === "none", "");
    // Clicking the active tool again folds its options row; again opens it.
    await p.click("#c-view .sk-bar [data-k=brush]"); await p.waitForTimeout(50);
    const off1 = await p.evaluate(() => document.querySelector("#c-view #sk-opts").hidden);
    await p.click("#c-view .sk-bar [data-k=brush]"); await p.waitForTimeout(50);
    check("clicking the tool again folds and opens its options", off1 === true && await p.evaluate(() => !document.querySelector("#c-view #sk-opts").hidden), String(off1));
    // Two fingers on a touchpad pan; Ctrl (pinch) zooms.
    await p.evaluate(() => { const v = document.getElementById("c-view"); v.dispatchEvent(new WheelEvent("wheel", { deltaX: 30, deltaY: 12.5, bubbles: true, cancelable: true, clientX: 600, clientY: 400 })); });
    await p.waitForTimeout(50);
    check("two fingers pan the canvas", /translate\(-30px, -12\.5px\)/.test(await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform)), await p.evaluate(() => document.querySelector("#c-view .s-fit").style.transform));
    // Nothing written, no references: Create becomes Instant render.
    await p.evaluate(() => { const S = window.VS.S.create; S.text = ""; S.refs = []; document.getElementById("c-text").value = ""; S.status = 0; window.VS.S.status = Object.assign(window.VS.S.status || {}, { create_ready: true }); window.VS.render(); });
    check("empty: the button says Instant render", /Instant render/.test(await p.text("#c-go")), await p.text("#c-go"));
    await p.evaluate(() => { window.__job = null; window.pywebview.api.studio_run = (j) => { window.__job = j; return Promise.resolve("j5"); }; });
    await p.click("#c-go"); await p.waitForTimeout(80);
    check("Instant render asks for an instant job", await p.evaluate(() => !!(window.__job && window.__job.instant)), JSON.stringify(await p.evaluate(() => window.__job)));
    await p.ev("studio-job", { id: "j5", state: "running", stage: "Variation 1 of 2", fraction: 0.25 });
    await p.waitForTimeout(80);
    check("the coming result shows its progress", /50%/.test(await p.evaluate(() => (document.querySelector("#c-strip .s-ph") || {}).textContent || "")), await p.evaluate(() => document.getElementById("c-strip").innerHTML.slice(-400)));
    await p.ev("studio-result", { id: "j5", index: 0, of: 2, result: { path: "C:/o/i1.png", name: "i1.png", w: 160, h: 90, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", meta: { text: "" } } });
    await p.waitForTimeout(80);
    check("a new result comes into view", await p.evaluate(() => window.VS.S.create.results[window.VS.S.create.sel].path) === "C:/o/i1.png", "");
    await p.click("#c-strip .s-ph"); await p.waitForTimeout(80);
    check("clicking the coming result shows it being made", await p.evaluate(() => window.VS.S.create.sel === -2), String(await p.evaluate(() => window.VS.S.create.sel)));
    await p.ev("studio-result", { id: "j5", index: 1, of: 2, result: { path: "C:/o/i2.png", name: "i2.png", w: 160, h: 90, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", meta: { text: "" } } });
    await p.ev("studio-job", { id: "j5", state: "done", count: 2 });
    await p.waitForTimeout(80);
    check("the newest result is selected at the end", await p.evaluate(() => window.VS.S.create.results[window.VS.S.create.sel].path) === "C:/o/i2.png", "");
    check("no page errors when turning the view", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 3D views: order, tabs, hold, loading, height.
  {
    const p = await open(browser);
    check("left bar: Projects, 3D, Upscale, Library", await p.evaluate(() => [...document.querySelectorAll(".s-nav button[data-page]")].map((b) => b.dataset.page).join(",")) === "projects,3d,upscale,library,trash,settings", "");
    await p.evaluate(() => {
      const api = window.pywebview.api;
      api.studio_describe = () => Promise.resolve({ text: "kind=product; nose=right; end=none; side=left; height=eye" });
      api.studio_results_for = () => Promise.resolve([]);
      window.VS3D.open({ path: "C:/o/car.png", name: "car.png", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
    });
    check("the navigator shows at once (no waiting for the reader)", await p.evaluate(() => !document.getElementById("t-plan").style.visibility && document.getElementById("t-pload").hidden), "");
    await p.waitForTimeout(200);
    check("the side follows where the nose points", await p.evaluate(() => window.VS3D._state().base) === "right", await p.evaluate(() => window.VS3D._state().base));
    await p.click("#t-angles [data-a=front-left]");
    const P = async (x, y) => { const r = await p.evaluate(() => { const b = document.getElementById("t-plan").getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }); return [r[0] + x / 170 * r[2], r[1] + y / 220 * r[3]]; };
    const dragPlan = async (a, b) => { const A = await P(a[0], a[1]), B = await P(b[0], b[1]); await p.mouse.move(A[0], A[1]); await p.mouse.down(); await p.mouse.move(B[0], B[1], { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(50); };
    check("no dropdown for the picture's side", await p.evaluate(() => !document.querySelector("#p-3d select")), "");
    await dragPlan([85 + 68, 122], [85 - 68, 122]);       // the grey ring (read: right side) dragged to the left side
    check("dragging the grey ring corrects your picture's side, and the chosen view stays", await p.evaluate(() => window.VS3D._state().base === "left" && document.getElementById("t-will").textContent.includes("Front ¾ left")), await p.text("#t-will") + " " + await p.evaluate(() => window.VS3D._state().base));
    await dragPlan([85 - 48, 122 - 61], [85 + 68, 122]);   // the dot from front ¾ left round to the right side
    check("dragging the dot round the design sets the view", /Right side/.test(await p.text("#t-will")), await p.text("#t-will"));
    // inside: the dot goes anywhere in the cabin, the handle turns the cone
    await p.evaluate(() => { window.VS3D._state().kind = "interior"; window.VS3D.render(); });
    await dragPlan([60, 192], [60, 192]);
    const c1 = await p.evaluate(() => window.VS3D._state().cam);
    const hx = c1.x + 30 * Math.sin(c1.look * Math.PI / 180), hy = c1.y - 30 * Math.cos(c1.look * Math.PI / 180);
    await dragPlan([85 + hx, 122 + hy], [85 + c1.x, 122 + c1.y - 40]);
    check("inside, the camera moves freely and its handle turns it", /Rear seats, driver side · looking forward/.test(await p.text("#t-will")), await p.text("#t-will"));
    await p.evaluate(() => { window.VS3D._state().kind = "product"; });
    await p.click("#t-angles [data-a=front-left]");
    await p.click("#p-3d .t-heights [data-h=eye]");
    check("view buttons wait for a view", await p.evaluate(() => [...document.querySelectorAll("#t-acts [data-x]")].every((b) => b.disabled)), "");
    await p.click("#p-3d .t-heights [data-h=high]");
    const tf = await p.evaluate(() => document.getElementById("t-card").style.transform);
    check("the picture stays flat when the camera moves", tf === "none", tf);
    check("From above is a raised camera, not a top view", await p.evaluate(() => window.VS3D._state().pitch) <= 30, "");
    await p.click("#t-go");
    await p.evaluate(() => { window.VS.S.create.job = "j1"; window.VS.S.create.frac = 0.4; window.VS3D.render(); });
    check("machine stats don't cover the tabs", await p.evaluate(() => { const m = document.getElementById("s-machine").getBoundingClientRect(), st = document.getElementById("t-strip").getBoundingClientRect(); return m.height === 0 || m.top >= st.bottom - 1; }), "");
    check("rendering looks like Create: blurred picture and a ring", await p.evaluate(() => document.getElementById("t-card").classList.contains("t-loading") && !document.getElementById("t-ring").hidden), "");
    await p.evaluate(() => { window.VS.S.create.job = null; window.VS3D.onResult({ path: "C:/o/v1.png", name: "v1.png", preview: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACw=", meta: { view: { target: "left" } } });
      window.VS3D.onResult({ path: "C:/o/v2.png", name: "v2.png", preview: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywA", meta: { view: { target: "front" } } }); });
    check("view buttons work once there is a view", await p.evaluate(() => [...document.querySelectorAll("#t-acts [data-x]")].every((b) => !b.disabled)), "");
    await p.screenshot({ path: process.env.SHOT || "/tmp/3d.png" });
    check("a gap after Original", await p.evaluate(() => !!document.querySelector("#t-strip .t-orig + .t-gap")), "");
    await p.click("#t-strip [data-r='-1']");
    await p.click("#t-strip [data-r='0']");
    check("clicking back on a view shows it", await p.evaluate(() => window.VS3D._state().sel === 0 && !document.getElementById("t-res").hidden), String(await p.evaluate(() => window.VS3D._state().sel)));
    await p.click("#t-strip [data-r='1']");
    check("and another view", await p.evaluate(() => window.VS3D._state().sel === 1), "");
    const b = await p.evaluate(() => { const r = document.getElementById("t-res").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await p.mouse.move(b[0], b[1]); await p.mouse.down();
    check("holding a view shows the original", await p.evaluate(() => document.getElementById("t-res").getAttribute("src") === window.VS3D._state().src.preview), "");
    await p.mouse.up();
    check("letting go shows the view again", await p.evaluate(() => document.getElementById("t-res").getAttribute("src") !== window.VS3D._state().src.preview && window.VS3D._state().sel === 1), "");
    await p.evaluate(() => { window.VS.S.create.job = "jx"; window.vistiq.event("studio-job", { id: "jx", state: "running", stage: "Creating", fraction: 0 }); });
    await p.evaluate(() => { window.VS.S.create.rawAt = Date.now() - 4000; window.vistiq.event("studio-job", { id: "jx", state: "running", stage: "Creating", fraction: 0.25 }); window.VS.S.create.rawAt = Date.now() - 3000; });
    await p.waitForTimeout(900);
    const fr = await p.evaluate(() => window.VS.S.create.frac);
    check("progress moves smoothly between the model's steps", fr > 0.3 && fr < 0.5, String(fr));
    await p.evaluate(() => window.vistiq.event("studio-job", { id: "jx", state: "done" }));
    check("no page errors on 3D views", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // 3D views from the nav: takes Create's file; Add as layer goes back to it; no 3D frame on the board.
  {
    const p = await open(browser);
    await p.evaluate(() => {
      const api = window.pywebview.api, g = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      api.studio_describe = () => Promise.resolve({ text: "kind=interior; side=rear; height=eye" });
      api.studio_results_for = () => Promise.resolve([]);
      api.studio_send = (path, app) => { window.__sent = [path, app]; return Promise.resolve({ ok: true, how: "layer" }); };
      api.studio_image = (x) => Promise.resolve({ path: x, name: x.split("/").pop(), w: 1600, h: 900, preview: g });
      api.studio_freeze = (path, name) => Promise.resolve({ path: "C:/o/frozen.png", name: "frozen.png", w: 1600, h: 900, preview: g });
      window.VS.setImage(window.VS.S.create, "src", { path: "C:/o/cabin.png", name: "cabin.png", w: 1600, h: 900, preview: g });
    });
    await p.click(".s-nav button[data-page='3d']"); await p.waitForTimeout(300);
    check("the 3D views tab alone stays empty", await p.evaluate(() => !window.VS3D._state().src && !document.getElementById("t-empty").hidden), "");
    await p.evaluate(() => window.VS3D.fromCreate()); await p.waitForTimeout(300);
    check("3D on a picture takes the file open in Create", await p.evaluate(() => (window.VS3D._state().src || {}).path) === "C:/o/cabin.png", await p.evaluate(() => JSON.stringify(window.VS3D._state().src)));
    await p.evaluate(() => window.VS3D.onResult({ path: "C:/o/v9.png", name: "v9.png", w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACw=", meta: { view: { target: "left" } } }));
    await p.click("#t-acts [data-x=layer]"); await p.waitForTimeout(400);
    check("Add as layer puts the view on that picture in Create", await p.evaluate(() => { const d = window.VSSketch._state().docs["C:/o/cabin.png"]; return !!d && d.layers.some((L) => L.kind !== "base" && /3D|Driver|v9/.test(L.name || "")); }),
      await p.evaluate(() => JSON.stringify(Object.keys(window.VSSketch._state().docs))));
    check("3D views stay off the board", await p.evaluate(() => !window.VSBoard._state().tiles.some((k) => k.path === "C:/o/v9.png")), "");
    // A Live picture: the view goes back into Photoshop.
    await p.evaluate(() => { window.VS.S.live.app = "photoshop"; window.VS.setImage(window.VS.S.create, "src", { path: "live://photoshop/3", name: "flat.psd", w: 1600, h: 900, n: 3, live: true, app: "photoshop", preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }); });
    await p.click("#t-work [data-clear]"); await p.waitForTimeout(80);
    check("the X clears 3D views", await p.evaluate(() => !window.VS3D._state().src && !document.getElementById("t-empty").hidden), "");
    await p.board(); await p.evaluate(() => window.VS3D.fromCreate()); await p.waitForTimeout(300);
    check("from Live, 3D views takes a still copy", await p.evaluate(() => window.VS3D._state().src.path) === "C:/o/frozen.png", "");
    await p.evaluate(() => window.VS3D.onResult({ path: "C:/o/v10.png", name: "v10.png", w: 1600, h: 900, preview: "x", meta: { view: { target: "left" } } }));
    await p.click("#t-acts [data-x=layer]"); await p.waitForTimeout(200);
    check("from Live, Add as layer goes into Photoshop", JSON.stringify(await p.evaluate(() => window.__sent)) === JSON.stringify(["C:/o/v10.png", "photoshop"]), JSON.stringify(await p.evaluate(() => window.__sent)));
    check("no page errors, 3D from Create", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  // Prompt library: opens from the prompt bar, switches category, fills the words and sets the locks.
  {
    const p = await open(browser);
    await p.click("#c-libb");
    check("prompt library opens", await p.isVisible("#c-plib"), "hidden");
    await p.click('#c-plib [data-plc="light"]');
    await p.click('#c-plib [data-pli="0"]');
    const t = await p.inputValue("#c-text");
    check("prompt library fills words", /golden hour/.test(t), t);
    check("prompt library closes", !(await p.isVisible("#c-plib")), "still open");
    const on = await p.evaluate(() => { const o = {}; document.querySelectorAll('#c-locks button').forEach((b) => { o[b.dataset.v] = b.classList.contains('on'); }); return o; });
    check("prompt library sets locks", on.materials && on.camera && !on.light, JSON.stringify(on));
    check("prompt library: no lock warning for its own prompt", !(await p.isVisible("#c-warn")), "warning shown");
    check("prompt library no errors", !p.errors.length, p.errors.join("; "));
    await p.close();
  }
  // Many results: the strip scrolls with the wheel and stays put while a render's progress updates.
  {
    const p = await open(browser);
    await p.ev("studio-live", frame(1));
    for (let r = 0; r < 16; r++) {
      await p.fill("#c-text", "x" + r); await p.click("#c-go"); await p.waitForTimeout(20);
      for (let i = 0; i < 2; i++) await p.ev("studio-result", { id: "j1", index: i, of: 2, result: { path: "C:/o/m" + r + "_" + i + ".png", name: "m" + r + ".png", w: 1600, h: 900, preview: img } });
      await p.ev("studio-job", { id: "j1", state: "done", count: 2 });
    }
    await p.fill("#c-text", "again"); await p.click("#c-go"); await p.waitForTimeout(50);
    await p.ev("studio-job", { id: "j1", state: "running", stage: "Creating", fraction: 0.1 });
    const box = await p.evaluate(() => { const r = document.getElementById("c-strip").getBoundingClientRect(); return { x: r.left + 300, y: r.top + r.height / 2 }; });
    await p.mouse.move(box.x, box.y);
    for (let i = 0; i < 10; i++) await p.mouse.wheel(0, -100);
    await p.waitForTimeout(100);
    const x0 = await p.evaluate(() => document.getElementById("c-strip").scrollLeft);
    for (let f = 2; f < 8; f++) { await p.ev("studio-job", { id: "j1", state: "running", stage: "Creating", fraction: f / 10 }); await p.waitForTimeout(30); }
    const x1 = await p.evaluate(() => document.getElementById("c-strip").scrollLeft);
    const max = await p.evaluate(() => { const s = document.getElementById("c-strip"); return s.scrollWidth - s.clientWidth; });
    check("strip: wheel scrolls back through many results during a run", max > 0 && x0 < max - 200, x0 + " of " + max);
    check("strip: progress doesn't snap the strip back", Math.abs(x1 - x0) < 2, x0 + " -> " + x1);
    await p.close();
  }
  // A finished render with a foreign file name: the picture reader says "render", Studio treats it as one.
  {
    const p = await open(browser);
    await p.evaluate(() => { const api = window.pywebview.api;
      api.studio_pick = () => Promise.resolve({ path: "D:/x/Flux2_dev_00121_.png", name: "Flux2_dev_00121_.png", w: 1450, h: 1800, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
      api.studio_medium = () => Promise.resolve("render"); });
    await p.click("#c-work");
    await p.waitForTimeout(300);
    const t = await p.text("#c-work");
    check("render with a foreign name reads as Render", /Render/.test(t), t);
    const on = await p.evaluate(() => { const o = {}; document.querySelectorAll('#c-locks button').forEach((b) => { o[b.dataset.v] = b.classList.contains('on'); }); return o; });
    check("render with a foreign name keeps Materials and Light", on.materials && on.light, JSON.stringify(on));
    await p.close();
  }
  // The Live tile is its own page: the steps to connect, never the last picture; then only the live file.
  {
    const p = await open(browser, null, { board: true });
    await p.waitForTimeout(150);
    await p.ev("studio-dropped", { target: "board", images: [{ path: "C:/a/old.png", name: "old.png", w: 1600, h: 900, preview: img }] });
    await p.waitForTimeout(150);
    await p.dblclick('.b-tile:not([data-id="live"])'); await p.waitForTimeout(250);
    await p.board(); await p.waitForTimeout(150);
    await p.click('[data-b="pstab"]'); await p.waitForTimeout(250);
    const gateTxt = await p.text("#c-gate");
    check("Live page: steps instead of the last picture", (await p.isVisible("#c-gate")) && !(await p.isVisible("#c-stage")) && /Install plugin/.test(gateTxt) && /Connect/.test(gateTxt), gateTxt.slice(0, 120));
    check("Live page: the old picture isn't working-on", !/old/.test(await p.text("#c-work")), await p.text("#c-work"));
    await p.ev("studio-live", frame(1));
    await p.waitForTimeout(150);
    check("Live page: the Photoshop file shows once connected", !(await p.isVisible("#c-gate")) && (await p.isVisible("#c-stage")) && /flat 2\.psd/.test(await p.text("#c-work")), await p.text("#c-work"));
    check("Live page: no page errors", !p.errors.length, p.errors.join("; "));
    await p.close();
  }
  // Right-click any layer: Send to board.
  {
    const p = await open(browser);
    await p.evaluate((g) => { const api = window.pywebview.api; window.__saved = 0;
      api.studio_save_layer = (png, name) => { window.__saved++; return Promise.resolve({ path: "C:/s/" + name + ".png", name: name + ".png", w: 800, h: 450, preview: g }); };
      window.VS.setImage(window.VS.S.create, "src", { path: "C:/a/pic.png", name: "pic.png", w: 1600, h: 900, preview: g }); }, img);
    await p.waitForTimeout(250);
    const fb = await p.locator("#c-view .s-fit").boundingBox(), at = (u, v) => [fb.x + fb.width * u, fb.y + fb.height * v];
    await p.keyboard.press("b");
    await p.mouse.move(...at(0.3, 0.5)); await p.mouse.down(); await p.mouse.move(...at(0.6, 0.5), { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(100);
    await p.hover("#sk-panel"); await p.waitForTimeout(200);
    await p.click("#sk-panel .row.on", { button: "right" }); await p.waitForTimeout(150);
    check("layer right-click shows Send to board", await p.isVisible('[data-p="board"]'), "no menu");
    await p.click('[data-p="board"]'); await p.waitForTimeout(200);
    const onBoard = await p.evaluate(() => window.VSBoard._state().tiles.some((t) => /Layer/.test(t.name || "")));
    check("Send to board saves the layer and puts it on the board", (await p.evaluate(() => window.__saved)) === 1 && onBoard, "saved " + (await p.evaluate(() => window.__saved)));
    check("layer to board: no page errors", !p.errors.length, p.errors.join("; "));
    await p.close();
  }
  // Projects: make one, copy tiles from My board, paste them there; move a tile; pick a cover.
  {
    const p = await open(browser, null, { board: true });
    await p.evaluate(() => window.VSBoard.addImages([1, 2].map((i) => ({ path: "C:/t/" + i + ".png", name: i + ".png", w: 160, h: 90, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }))));
    await p.waitForTimeout(500);
    await p.click(".s-nav button[data-page=projects]"); await p.waitForTimeout(200);
    check("projects: My board shows with its pictures", /My board/.test(await p.text("#pj-grid")) && /2 pictures/.test(await p.text("#pj-grid")), await p.text("#pj-grid"));
    await p.click(".pj-new"); await p.waitForTimeout(100);
    await p.fill("#pj-name", "SUV exterior"); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
    check("projects: a new project opens on its own empty board", /SUV exterior/.test(await p.text("#b-title")) && (await p.evaluate(() => window.VSBoard._state().tiles.filter((t) => t.path).length)) === 0, await p.text("#b-title"));
    // copy two tiles in My board, paste in the new project
    await p.board("myboard");
    await p.evaluate(() => { const t = window.VSBoard._state().tiles.filter((x) => x.path); window.VSBoard._state().sel = t[0].id; });
    await p.click(".b-cv", { position: { x: 5, y: 300 } }).catch(() => {});
    await p.evaluate(() => { const t = window.VSBoard._state().tiles.filter((x) => x.path); window.VSBoard._state().sel = t[0].id; });
    await p.keyboard.press("Control+c"); await p.waitForTimeout(150);
    check("projects: Ctrl C copies a tile", await p.evaluate(() => !!(window.VS.S.tileClip && window.VS.S.tileClip.tiles.length === 1)), "");
    await p.board("p1");
    await p.keyboard.press("Control+v"); await p.waitForTimeout(300);
    check("projects: Ctrl V pastes it into the other project", await p.evaluate(() => window.VSBoard._state().tiles.filter((t) => t.path).length) === 1, "");
    await p.waitForTimeout(500);
    check("projects: the copy stays in My board too", await p.evaluate(() => window.__board.tiles.filter((t) => t.path).length) === 2, "");
    // move: right-click → Move to project…
    await p.board("myboard"); await p.click(".b-bar [data-b=fit]"); await p.waitForTimeout(300);
    const id2 = await p.evaluate(() => window.VSBoard._state().tiles.filter((t) => t.path)[1].id);
    await p.click('.b-tile[data-id="' + id2 + '"]', { button: "right" }); await p.waitForTimeout(100);
    check("projects: the tile menu has Copy, Move and Cover", /Copy/.test(await p.text("#b-menu")) && /Move to project/.test(await p.text("#b-menu")) && /cover/.test(await p.text("#b-menu")), await p.text("#b-menu"));
    await p.click('#b-menu [data-m="move"]'); await p.waitForTimeout(200);
    await p.click('#b-menu [data-mp="p1"]'); await p.waitForTimeout(600);
    check("projects: Move takes it out of this project and into the other", await p.evaluate(() => window.VSBoard._state().tiles.filter((t) => t.path).length === 1 && window.__boards.p1.tiles.filter((t) => t.path).length === 2), "");
    // delete → Trash → restore; the only project can go too
    await p.click(".s-nav button[data-page=projects]"); await p.waitForTimeout(200);
    check("projects: New project opens a floating window", await (async () => { await p.click(".pj-new"); await p.waitForTimeout(100); const v = await p.isVisible("#pj-modal"); await p.keyboard.press("Escape"); await p.waitForTimeout(80); return v && !(await p.isVisible("#pj-modal")); })(), "");
    await p.click('.pj-card[data-pid="p1"]', { button: "right" }); await p.waitForTimeout(100);
    await p.click('.s-pop [data-p="del"]'); await p.waitForTimeout(300);
    check("projects: Move to Trash takes it off the Projects page", !/SUV exterior/.test(await p.text("#pj-grid")), await p.text("#pj-grid"));
    await p.click(".s-nav button[data-page=trash]"); await p.waitForTimeout(200);
    check("trash: the deleted project is in the Trash", /SUV exterior/.test(await p.text("#tr-grid")), await p.text("#tr-grid"));
    await p.click('[data-tid="p1"] [data-tr="restore"]'); await p.waitForTimeout(200);
    check("trash: Restore brings it back", /The Trash is empty/.test(await p.text("#tr-grid")) && (await p.evaluate(() => window.__projects.some((x) => x.id === "p1"))), await p.text("#tr-grid"));
    await p.click(".s-nav button[data-page=projects]"); await p.waitForTimeout(200);
    await p.click('.pj-card[data-pid="myboard"]', { button: "right" }); await p.waitForTimeout(100);
    check("projects: delete is never greyed out", await p.evaluate(() => !document.querySelector('.s-pop [data-p="del"]').disabled), "");
    await p.keyboard.press("Escape");
    check("nav: Trash, then Settings, then the heart at the bottom", await p.evaluate(() => { const k = [...document.querySelectorAll(".s-nav > *")].map((e) => e.getAttribute("data-page") || (e.classList.contains("s-heart") ? "heart" : "")).filter(Boolean); return k.slice(-3).join(","); }) === "trash,settings,heart",
      await p.evaluate(() => [...document.querySelectorAll(".s-nav > *")].map((e) => e.getAttribute("data-page") || e.className).join(",")));
    await p.click(".s-nav button[data-page=settings]"); await p.waitForTimeout(300);
    check("settings: Delete everything button", !!(await p.$('[data-su="wipe"]')), "");
    await p.click('[data-su="wipe"]'); await p.waitForTimeout(150);
    check("wipe: first warning", /not a reversible process/.test(await p.text("#pj-modal")), await p.text("#pj-modal"));
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/wipe1.png" });
    await p.click('#pj-modal [data-dlg="ok"]'); await p.waitForTimeout(150);
    check("wipe: OK stays off until DELETE is typed", await p.evaluate(() => document.querySelector('#pj-modal [data-dlg="go"]').disabled), "");
    await p.fill("#wipe-word", "delete"); await p.waitForTimeout(50);
    check("wipe: lowercase doesn't count", await p.evaluate(() => document.querySelector('#pj-modal [data-dlg="go"]').disabled), "");
    await p.fill("#wipe-word", "DELETE"); await p.waitForTimeout(50);
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/wipe2.png" });
    await p.click('#pj-modal [data-dlg="go"]'); await p.waitForTimeout(150);
    check("wipe: sends DELETE and says it's closing", (await p.evaluate(() => window.__wiped)) === "DELETE" && /closing/.test(await p.text("#pj-modal")), await p.text("#pj-modal"));
    check("projects: no page errors", !p.errors.length, p.errors.join("; "));
    await p.evaluate(() => { const m = document.getElementById("pj-modal"); if (m) m.remove(); });
    // First run: nothing downloaded -> only the setup page, every other tab locked; done -> Projects.
    await p.evaluate(() => {
      window.__ready = false;
      const base = window.VS.S.status;
      window.pywebview.api.studio_status = () => Promise.resolve(Object.assign({}, base, { create_ready: window.__ready, needs_setup: !window.__ready }));
      window.dispatchEvent(new Event("focus"));
    });
    await p.waitForTimeout(250);
    check("gate: not set up -> only the setup page", await p.evaluate(() => document.body.classList.contains("s-gated") && document.body.getAttribute("data-page") === "create" && !!document.querySelector("#c-gate:not([hidden])")), await p.evaluate(() => document.body.getAttribute("data-page")));
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/gate.png" });
    await p.click(".s-nav button[data-page=projects]", { force: true }); await p.waitForTimeout(150);
    check("gate: other tabs can't be opened", await p.evaluate(() => document.body.getAttribute("data-page")) === "create", "");
    // Welcome (Nov 2026): local, Vistiq Plus (coming soon, off) and your own key.
    await p.evaluate(() => { window.VS.S.setup.run = null; window.VS.S.setup.done = ""; window.VS.render(); }); await p.waitForTimeout(100);
    check("welcome: three ways, Plus greyed out", await p.evaluate(() => document.querySelectorAll("#c-gate .w-card").length === 3 && !!document.querySelector("#c-gate .w-card.off")), "");
    await p.click("#c-gate [data-su=nb-open]"); await p.waitForTimeout(80);
    if (process.env.WSHOT) await p.screenshot({ path: process.env.WSHOT + "/welcome.png" });
    await p.evaluate(() => { window.__nbkey = null; window.pywebview.api.studio_online_key = (k) => { window.__nbkey = k; return Promise.resolve(k === "bad" ? { ok: false, error: "API key not valid" } : { ok: true }); }; window.pywebview.api.studio_onboarded = () => Promise.resolve(true); });
    await p.fill("#c-gate [data-nbkey]", "bad"); await p.click('#c-gate [data-su="nb-add"]'); await p.waitForTimeout(150);
    check("welcome: a wrong key says why", /not valid/.test(await p.text("#c-gate")), await p.text("#c-gate"));
    const onl = { has_key: true, key_hint: "AIza…k2Qw", on: true, limit: 10, ok: true, usage: { month: "2026-11", n: 3, usd: 0.1, credits: 3 },
      engines: { standard: { label: "Standard", usd: { "1K": 0.0336, "2K": 0.0504 }, credits: { "1K": 1, "2K": 1.5 } }, pro: { label: "Pro", usd: { "1K": 0.134, "2K": 0.134 }, credits: { "1K": 4, "2K": 4 } } } };
    await p.evaluate((onl) => { const base = window.VS.S.status;
      window.pywebview.api.studio_status = () => Promise.resolve(Object.assign({}, base, { online: onl, local_ready: false, create_ready: true, needs_setup: false })); }, onl);
    await p.fill("#c-gate [data-nbkey]", "AIzaGOOD"); await p.click('#c-gate [data-su="nb-add"]'); await p.waitForTimeout(400);
    check("welcome: a good key opens the app (online only)", await p.evaluate(() => window.__nbkey === "AIzaGOOD" && !document.body.classList.contains("s-gated")), "");
    await p.evaluate(() => { const S = window.VS.S.create; S.source = "image"; window.VS.setImage(S, "src", { path: "C:/i/a.png", name: "a.png", w: 1600, h: 900, preview: "x" }); S.vars = 2; S.res = "2k"; window.VS.go("create"); });
    await p.waitForTimeout(250);
    check("Create: engine picker with Standard / Pro (no local yet)", await p.evaluate(() => !document.getElementById("c-eng").hidden && document.querySelectorAll("#c-engt [data-ce]").length === 2 && document.querySelector("#c-engt .on").getAttribute("data-ce") === "standard"), "");
    check("Create: the cost of the run before it starts", /Standard · 2 pictures at 2K · 3 credits · about \$0\.10/.test(await p.text("#c-meta")), await p.text("#c-meta"));
    await p.click('#c-engt [data-ce="pro"]'); await p.waitForTimeout(80);
    await p.locator("#c-eng").screenshot({ path: (process.env.SHOT_DIR || "/tmp") + "/c_eng.png" });
    check("Create: Pro costs 4 credits a picture", /Pro · 2 pictures at 2K · 8 credits · about \$0\.27/.test(await p.text("#c-meta")), await p.text("#c-meta"));
    await p.evaluate(() => { window.__lastJob = null; window.VS.S.create.text = "red seats"; });
    await p.evaluate(() => window.VS.job("c")); await p.waitForTimeout(150);
    check("Create: the run goes to Pro", await p.evaluate(() => (window.__lastJob || {}).engine) === "pro", JSON.stringify(await p.evaluate(() => window.__lastJob)));
    await p.ev("studio-job", { id: "j1", state: "done" });
    await p.evaluate(() => { window.pywebview.api.studio_stats = () => Promise.resolve({ ram: { used: 20, total: 64 } }); });
    await p.ev("studio-online", { usage: { month: "2026-11", n: 5, usd: 0.37, credits: 11 } }); await p.waitForTimeout(1500);
    check("usage pill: the month's online spend", /Own key · \$0\.37 of \$10 this month/.test(await p.evaluate(() => document.querySelector("#s-usage").textContent)), await p.evaluate(() => document.querySelector("#s-usage").textContent));
    await p.evaluate(() => document.querySelector("#s-usage .su-pill").click()); await p.waitForTimeout(150);
    check("usage panel: limit, Add balance, Plus greyed", await p.evaluate(() => !!document.querySelector("#s-usage [data-us=lim]") && /Add balance/.test(document.querySelector("#s-usage").textContent) && !!document.querySelector("#s-usage .su-plus.off button:disabled")), "");
    await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/usage.png" : "/tmp/usage.png" });
    await p.evaluate(() => document.querySelector("#s-usage .su-pill").click());
    await p.evaluate(() => window.VS.go("settings")); await p.waitForTimeout(250);
    check("Settings: own key in use, Plus coming soon", await p.evaluate(() => /In use/.test(document.querySelector("#s-body .s-oc").textContent) && !!document.querySelector("#s-body .s-plus.off")), "");
    if (process.env.WSHOT) await p.screenshot({ path: process.env.WSHOT + "/settings.png", fullPage: false });
    await p.evaluate(() => { window.VS.S.skipSetup = false; });
    await p.evaluate(() => { const base = window.VS.S.status; window.pywebview.api.studio_status = () => Promise.resolve(Object.assign({}, base, { online: undefined, create_ready: window.__ready, needs_setup: !window.__ready })); });
    await p.evaluate(() => { window.dispatchEvent(new Event("focus")); }); await p.waitForTimeout(300);
    await p.evaluate(() => { window.__ready = true; });
    await p.ev("studio-setup", { state: "done" }); await p.waitForTimeout(300);
    check("gate: once set up, the app opens on Projects", await p.evaluate(() => !document.body.classList.contains("s-gated") && document.body.getAttribute("data-page") === "projects"), await p.evaluate(() => document.body.getAttribute("data-page")));
    // Mac with both render models: a picker above Create.
    await p.evaluate(() => {
      window.VS.S.status = Object.assign({}, window.VS.S.status, { mac: Object.assign({}, window.VS.S.status.mac || {}, { engine: "mage",
        engines: [{ key: "mage", label: "Microsoft Mage-Flow", ready: true }, { key: "klein", label: "FLUX.2 Klein 4B", ready: true }] }) });
      window.pywebview.api.studio_mac_engine = (k) => { window.__eng = k; return Promise.resolve(null); };
      const st = window.VS.S.status; window.pywebview.api.studio_status = () => Promise.resolve(st);
      window.VS.go("create");
    });
    await p.waitForTimeout(200);
    check("Mac: no render model picker (FLUX only)", await p.evaluate(() => document.getElementById("c-model").hidden), "");
    // Prompt library: generic, no "tested" tags; [words] become purple and the first is selected.
    await p.evaluate(() => window.VS.go("create")); await p.waitForTimeout(200);
    const plib = await p.evaluate(() => { const b = document.getElementById("c-libb"); if (!b) return null; b.click(); return true; });
    if (plib) {
      await p.waitForTimeout(150);
      check("prompts: no 'tested' tags", !/tested/.test(await p.text("#c-plib")), "");
      await p.click('#c-plib [data-plc="mat"]'); await p.waitForTimeout(100);
      check("prompts: words to change are marked", !!(await p.$("#c-plib .s-pli u")), "");
      await p.click('#c-plib [data-pli="0"]'); await p.waitForTimeout(150);
      const sel = await p.evaluate(() => { const t = document.getElementById("c-text"); return [t.value, t.value.slice(t.selectionStart, t.selectionEnd)]; });
      check("prompts: brackets gone, first word to change is selected", sel[0] === "make the main body deep forest green" && sel[1] === "main body", JSON.stringify(sel));
    }
    // Adding a picture: an outlined tile with a bar shows where it lands, then the picture takes that spot.
    await p.board(); await p.waitForTimeout(200);
    await p.ev("studio-uploading", { target: "board", token: "d1", names: ["car_front.jpg"] });
    await p.waitForTimeout(100);
    const ph = await p.evaluate(() => { const t = window.VSBoard._state().tiles.find((x) => x.kind === "upload"); return t && { x: t.x, y: t.y }; });
    check("upload: a placeholder tile with a bar appears at once", !!ph && !!(await p.$(".b-tile.b-up .b-upbar")) && /car_front/.test(await p.text(".b-tile.b-up")), JSON.stringify(ph));
    await p.ev("studio-uploading", { target: "board", token: "d1", fraction: 0.5, from: "phone" });
    await p.waitForTimeout(80);
    check("upload: the bar follows the progress", await p.evaluate(() => document.querySelector(".b-tile.b-up .b-upbar i").style.width) === "50%", "");
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/uploading.png" });
    await p.ev("studio-dropped", { target: "board", token: "d1", images: [{ path: "C:/in/car_front.jpg", name: "car_front.jpg", w: 1600, h: 900, preview: img }] });
    await p.waitForTimeout(120);
    const real = await p.evaluate(() => { const t = window.VSBoard._state().tiles.find((x) => x.path === "C:/in/car_front.jpg"); return t && { x: t.x, y: t.y }; });
    check("upload: the picture lands exactly where the placeholder was", !!real && real.x === ph.x && real.y === ph.y && !(await p.$(".b-tile.b-up")), JSON.stringify([ph, real]));
    await p.waitForTimeout(500);
    check("upload: placeholders are never saved", await p.evaluate(() => !window.__board.tiles.some((t) => t.kind === "upload") && window.__board.tiles.some((t) => t.path === "C:/in/car_front.jpg")), "");
    // Add button: placeholder while the picture is read
    await p.evaluate(() => {
      const api = window.pywebview.api;
      api.studio_pick_path = () => Promise.resolve("C:/in/seat.png");
      api.studio_image = (q) => new Promise((r) => { window.__finish = () => r({ path: q, name: "seat.png", w: 800, h: 800, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }); });
    });
    await p.click(".b-bar [data-b=plus]"); await p.waitForTimeout(120);
    await p.click('.s-plus [data-p="pick"]'); await p.waitForTimeout(120);
    check("Add: placeholder shows while the picture is read", /seat/.test(await p.evaluate(() => (document.querySelector(".b-tile.b-up") || {}).textContent || "")), await p.evaluate(() => JSON.stringify(window.VSBoard._state().tiles.filter((t) => t.kind === "upload")) + " pop:" + !!document.querySelector(".s-pop")));
    await p.evaluate(() => window.__finish()); await p.waitForTimeout(120);
    check("Add: then the picture replaces it", !(await p.$(".b-tile.b-up")) && await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.path === "C:/in/seat.png")), "");
    await p.ev("studio-uploading", { target: "board", token: "p9", names: ["x.jpg"], from: "phone" });
    await p.ev("studio-uploading", { target: "board", token: "p9", names: ["x.jpg"], fraction: 1, failed: true, from: "phone" });
    await p.waitForTimeout(1900);
    check("upload: a failed one goes away by itself", !(await p.$(".b-tile.b-up")), "");
    // Mac setup: Light / Studio / Pro by memory; higher ones greyed out, best one that fits suggested.
    await p.evaluate(() => {
      const T = (k, n, min, eng, ready) => ({ key: k, name: n, range: k, min, engine: eng, speed: "fast", gb: 9.9, has: ["a"], not: [], allowed: min <= 16, recommended: k === "studio", ready });
      const st = Object.assign({}, window.VS.S.status, { create_ready: false,
        files: [{ key: "mlxserve", label: "Engine", about: "", gb: 0.1, ready: false, can_download: true, part: "create" }, { key: "mageflow", label: "Image model", about: "", gb: 9.7, ready: false, can_download: true, part: "create" }],
        mac: { chip: "Apple M3", ram: 16, can_generate: true, max_side: 4096, work_side: 1080, tier: "studio", mage_supported: true,
               tiers: [T("light", "Light", 0, "klein", true), T("studio", "Studio", 10, "mage", false), T("pro", "Pro", 20.5, "mage", false)] } });
      window.VS.S.status = st; window.VS.S.pickTier = "";
      window.pywebview.api.studio_set_tier = (t) => { window.__tier = t; return Promise.resolve(null); };
      window.pywebview.api.studio_status = () => Promise.resolve(st);
    });
    await p.evaluate(() => window.VS.go("create")); await p.waitForTimeout(300);
    const tiers = await p.evaluate(() => [...document.querySelectorAll(".m-tier")].map((b) => (b.classList.contains("on") ? "*" : "") + b.getAttribute("data-t") + (b.disabled ? "-off" : "")).join(","));
    check("mac setup: three setups, Studio picked, Pro greyed out", tiers === "light,*studio,pro-off", tiers);
    check("mac setup: Studio is the recommended one", /recommended/i.test(await p.text('.m-tier[data-t="studio"]')), "");
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/mac-setup.png" });
    await p.evaluate(() => { window.pywebview.api.studio_set_tier = (t) => { window.__tier = t; return Promise.resolve(Object.assign({}, window.VS.S.status, { needs_setup: false })); }; });
    await p.click('.m-tier[data-t="light"]'); await p.waitForTimeout(150);
    check("mac: switching setup never locks the app", await p.evaluate(() => !document.body.classList.contains("s-gated")), "");
    check("mac setup: picking Light asks for it", (await p.evaluate(() => window.__tier)) === "light", await p.evaluate(() => window.__tier));
    await p.click('.m-tier[data-t="pro"]', { force: true }); await p.waitForTimeout(100);
    check("mac setup: a greyed-out setup can't be picked", (await p.evaluate(() => window.__tier)) === "light", "");
    check("mac setup: no page errors", !p.errors.length, p.errors.join("; "));
    await p.close();
  }
  await browser.close();
  console.log(failed ? failed + " screen test(s) failed" : "all screen tests passed");
  process.exit(failed ? 1 : 0);
})();
