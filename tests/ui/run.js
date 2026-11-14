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
    api.studio_board_get = () => Promise.resolve(window.__board);
    api.studio_board_save = (b) => { window.__board = JSON.parse(JSON.stringify(b)); return Promise.resolve(true); };
    api.studio_thumb = () => Promise.resolve("data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    api.studio_image = (p) => Promise.resolve({ path: p, name: p.split("/").pop(), w: 1600, h: 900, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
    api.studio_run = (j) => { window.__lastJob = j; return Promise.resolve("j1"); };
    api.studio_send = () => Promise.resolve({ ok: true });
    api.js_log = () => Promise.resolve();
  });
  page.ev = (k, d) => page.evaluate(([k, d]) => window.vistiq.event(k, d), [k, d]);
  page.text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText : ""; }, sel);
  page.errors = errors;
  if (!opts || !opts.board) { await page.click(".s-nav button[data-page=create]"); await page.waitForTimeout(150); }
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
    await p.ev("studio-job", { id: "j1", state: "running", stage: "Creating", fraction: 0.5 });
    await p.ev("studio-preview", { id: "j1", index: 0, preview: img });
    await p.ev("studio-preview", { id: "j1", index: 0, preview: img });
    await p.waitForTimeout(100);
    check("the picture develops beside the sketch", /Making/.test(await p.text("#c-view .s-pane .s-tag")) &&
      await p.evaluate(() => !!document.querySelector("#c-view .s-pane .s-dev")), await p.text("#c-view .s-pane .s-tag"));
    check("developing happens on the Sketch copy, which is selected", await p.evaluate(() => {
      const t = document.querySelector("#c-strip .s-fillt"); return !!t && t.classList.contains("sel"); }), "Sketch tile not selected");
    await p.click('#c-strip img[data-i="-1"]');
    await p.waitForTimeout(100);
    check("the sketch stays on the left while it's made",
      /frozen/.test(await p.text("#c-view > .s-tag")) && await p.evaluate(() => !!document.querySelector("#c-view .s-pane .s-dev")),
      await p.text("#c-view > .s-tag"));
    await p.click("#c-strip .s-fillt");
    await p.waitForTimeout(100);
    check("Sketch tile fills in with progress", /Creating · 50%/.test(await p.text("#c-strip")) &&
      await p.evaluate(() => document.querySelector("#c-strip .s-fillc").style.width === "50%"), await p.text("#c-strip"));

    // 4. The result shows, Live comes back, the card stays on the file.
    await p.ev("studio-result", { id: "j1", index: 0, of: 1, result: { path: "C:/o/r.png", name: "r.png", w: 1600, h: 900, preview: img } });
    await p.ev("studio-job", { id: "j1", state: "done", count: 1 });
    await p.waitForTimeout(100);
    check("result is shown beside the sketch after the run", /Result/.test(await p.text("#c-view .s-pane .s-tag")) && !!(await p.evaluate(() => document.querySelector("#c-view > .s-fit .sk-base"))), await p.text("#c-view .s-pane .s-tag"));
    check("Live is back after the run", /Live/.test(await p.text("#c-strip")), await p.text("#c-strip"));
    check("card stays on the file after the run", /flat 2\.psd/.test(await p.text("#c-ps")) && /updates as you draw/.test(await p.text("#c-ps")), await p.text("#c-ps"));
    check("strip order: Live | Sketch, results", await p.evaluate(() => {
      const kids = [...document.getElementById("c-strip").children].map((e) => e.classList.contains("s-div") ? "|" : (e.innerText || "").trim() || e.tagName);
      return kids.slice(0, 4).join(",");
    }) === "Live,|,Sketch,IMG", await p.evaluate(() => [...document.getElementById("c-strip").children].map((e) => e.className + ":" + (e.innerText || "").trim()).join(" ")));
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
    for (const pg of ["board", "create", "reference", "upscale", "library", "settings"]) {
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
    check("Studio opens on the board", await p.evaluate(() => document.body.getAttribute("data-page")) === "board", await p.evaluate(() => document.body.getAttribute("data-page")));
    await p.waitForTimeout(200);
    check("Live tile offers Connect when not connected", /Connect/.test(await p.text('.b-tile[data-id="live"]')), await p.text('.b-tile[data-id="live"]'));
    await p.ev("studio-live", frame(1));
    await p.waitForTimeout(100);
    check("Live tile shows the Photoshop file", /flat 2\.psd/.test(await p.text('.b-tile[data-id="live"]')) && !/Connect/.test(await p.text('.b-tile[data-id="live"]')), await p.text('.b-tile[data-id="live"]'));
    await p.ev("studio-dropped", { target: "board", images: [{ path: "C:/a/sketch.png", name: "sketch.png", w: 1600, h: 900, preview: img }] });
    await p.waitForTimeout(150);
    check("a dropped image becomes a tile", await p.evaluate(() => document.querySelectorAll(".b-tile").length) === 2, await p.evaluate(() => document.querySelectorAll(".b-tile").length));
    await p.dblclick('.b-tile:not([data-id="live"])');
    await p.waitForTimeout(250);
    check("double-click opens Focus view with that image", await p.evaluate(() => document.body.getAttribute("data-page")) === "create" && /sketch/.test(await p.text("#c-ttl")), await p.text("#c-ttl"));
    await p.ev("studio-result", { id: "", index: 0, of: 1, result: { path: "C:/o/r1.png", name: "r1.png", w: 1600, h: 900, preview: img } });
    await p.evaluate(() => { window.VS.S.create.results = [{ path: "C:/o/r1.png", name: "r1.png", w: 1600, h: 900, preview: "x" }]; window.VS.S.create.sel = 0; window.VS.render(); });
    await p.click("#c-toboard");
    await p.waitForTimeout(100);
    check("Add to board puts the result on the board", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.path === "C:/o/r1.png" && t.from)), JSON.stringify(await p.evaluate(() => window.VSBoard._state().tiles)));
    await p.click(".s-nav button[data-page=board]");
    await p.waitForTimeout(150);
    check("Back to board, with a line from the sketch to the result", await p.evaluate(() => document.querySelectorAll("#b-links path").length) === 1, "no link");
    await p.click('.b-tile[data-id]:last-child', { button: "right" });
    await p.waitForTimeout(100);
    check("right-click shows the actions", /Upscale/.test(await p.text("#b-menu")) && /Save a copy/.test(await p.text("#b-menu")), await p.text("#b-menu"));
    await p.keyboard.press("Escape");
    check("Escape closes the menu", await p.evaluate(() => document.getElementById("b-menu").hidden), "still open");
    await p.click(".b-bar [data-b=organize]");
    await p.waitForTimeout(500);
    check("Organize lays out in order: Live first, result to the right of its source", await p.evaluate(() => {
      const t = window.VSBoard._state().tiles, live = t.find((x) => x.id === "live"), s = t.find((x) => x.path === "C:/a/sketch.png"), r = t.find((x) => x.path === "C:/o/r1.png");
      return live.y < s.y && r.x > s.x && r.y === s.y;
    }), JSON.stringify(await p.evaluate(() => window.VSBoard._state().tiles.map((x) => [x.id, x.x, x.y]))));
    check("the board is saved", await p.evaluate(() => !!(window.__board && window.__board.tiles.length === 3)), "not saved");
    // Opening another tile must not lose the results made from the first one.
    await p.evaluate(() => { const S = window.VS.S.create; ["r1", "r2", "r3"].forEach((n, i) => { if (!S.results[i]) S.results[i] = {}; Object.assign(S.results[i], { path: "C:/o/" + n + ".png", name: n + ".png", w: 1600, h: 900, preview: "x", srcKey: "C:/a/sketch.png" }); }); });
    await p.click(".b-bar [data-b=organize]"); await p.waitForTimeout(400);
    await p.dblclick('.b-tile[data-id="' + await p.evaluate(() => window.VSBoard._state().tiles.find((x) => x.path === "C:/o/r1.png").id) + '"]');
    await p.waitForTimeout(250);
    await p.click(".s-nav button[data-page=board]");
    await p.waitForTimeout(150);
    await p.dblclick('.b-tile[data-id="' + await p.evaluate(() => window.VSBoard._state().tiles.find((x) => x.path === "C:/a/sketch.png").id) + '"]');
    await p.waitForTimeout(250);
    check("results stay after opening another board tile and coming back", await p.evaluate(() => document.querySelectorAll("#c-strip img[data-i]:not([data-i='-1']):not([data-i='-2'])").length) === 3,
      await p.evaluate(() => document.getElementById("c-strip").innerHTML.slice(0, 300)));
    check("no page errors on the board", p.errors.length === 0, p.errors.join(" | "));
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
    await p.keyboard.press("l");
    await p.mouse.click(...at(0.3, 0.3));
    for (const q of [[0.6, 0.3], [0.6, 0.7], [0.3, 0.7]]) await p.mouse.move(...at(...q), { steps: 6 });
    await p.mouse.move(...at(0.3, 0.3), { steps: 6 }); await p.mouse.click(...at(0.3, 0.3)); await p.waitForTimeout(100);
    check("the lasso closes into a selection", await anyMask(), "no mask");
    await p.keyboard.press("Control+d");
    await p.keyboard.press("m");
    await p.mouse.move(...at(0.1, 0.1)); await p.mouse.down(); await p.mouse.move(...at(0.4, 0.4), { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(100);
    check("the rectangle makes a selection", await anyMask(), "no mask");
    // Colour pick from the picture (white test picture) and the colour pop-up.
    await p.keyboard.press("i"); await p.mouse.click(...at(0.9, 0.9)); await p.waitForTimeout(50);
    check("the eyedropper takes the picture's colour", (await st()).color === "#ffffff", (await st()).color);
    await p.click("#sk-bar .sk-sw"); await p.waitForTimeout(100);
    check("the colour pop-up opens", await p.evaluate(() => !!document.querySelector(".s-pop .sk-cp")), "no pop-up");
    await p.keyboard.press("Escape");
    // Drop-downs.
    await p.click('#sk-bar [data-dd=erase]'); await p.waitForTimeout(100);
    check("the eraser menu offers the magic eraser", /Magic eraser/.test(await p.evaluate(() => document.querySelector(".s-pop").innerText)), "");
    await p.keyboard.press("Escape");
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
    check("+ opens the add menu", /Blank canvas/.test(await p.evaluate(() => document.querySelector(".s-pop").innerText)), "");
    await p.click(".s-pop [data-p=blank]"); await p.waitForTimeout(150);
    check("a blank A4 canvas at 150 DPI", JSON.stringify(await p.evaluate(() => window.__blank)) === "[1240,1754]", JSON.stringify(await p.evaluate(() => window.__blank)));
    check("it lands on the board", await p.evaluate(() => window.VSBoard._state().tiles.some((t) => t.name === "Sketch 1.png")), "");
    check("all tiles are the same size", await p.evaluate(() => { const hs = [...document.querySelectorAll(".b-tile")].map((t) => t.offsetHeight); return new Set(hs).size === 1; }), JSON.stringify(await p.evaluate(() => [...document.querySelectorAll(".b-tile")].map((t) => t.offsetHeight))));
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
    check("words that change locked things show a warning", /locked/.test(await p.text("#c-warn")) && !(await p.evaluate(() => document.getElementById("c-warn").hidden)), await p.text("#c-warn"));
    await p.click("#c-warn [data-unlock]"); await p.waitForTimeout(80);
    check("Unlock frees them", (await locks()) === "design,camera", await locks());
    await p.evaluate(() => { window.__job = null; window.pywebview.api.studio_run = (j) => { window.__job = j; return Promise.resolve("j7"); }; window.VS.S.status = Object.assign(window.VS.S.status || {}, { create_ready: true }); });
    await p.click("#c-go"); await p.waitForTimeout(80);
    check("Create sends the locks", await p.evaluate(() => !!(window.__job && window.__job.locks && window.__job.locks.design && !window.__job.locks.materials)), JSON.stringify(await p.evaluate(() => window.__job && window.__job.locks)));
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
    await p.evaluate(() => { window.pywebview.api.studio_export = (path, fmt) => { window.__exp = [path, fmt]; return Promise.resolve("x." + fmt); }; });
    await p.click("#c-view .s-ra [data-ra=export]"); await p.waitForTimeout(80); await p.click(".s-pop [data-p=jpg]"); await p.waitForTimeout(80);
    check("Export saves the result as JPEG", JSON.stringify(await p.evaluate(() => window.__exp)) === JSON.stringify(["C:/o/k_create_v1.png", "jpg"]), JSON.stringify(await p.evaluate(() => window.__exp)));
    await p.click("#c-view .s-ra [data-ra=add]"); await p.waitForTimeout(300);
    await p.evaluate(() => { window.pywebview.api.studio_export = (path, fmt) => { window.__exp = [path, fmt]; return Promise.resolve("x." + fmt); }; });
    check("Layer puts the result on a layer over the picture", await p.evaluate(() => window.VS.S.create.sel === -1 && window.VSSketch._state().doc.layers.some((L) => /k_create_v1/.test(L.name))), JSON.stringify(await p.evaluate(() => window.VSSketch._state().doc.layers.map((L) => L.name))));
    await p.waitForTimeout(1500);
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
    check("a result opens beside the picture; the layers stay", await p.evaluate(() => !!document.querySelector("#c-view .s-pane .s-res") && !!document.querySelector("#sk-panel")), "");
    check("the result is about a fifth smaller than the picture", await p.evaluate(() => { const a = document.querySelector("#c-view > .s-fit").offsetHeight, b = document.querySelector("#c-view .s-pane").offsetHeight; return Math.abs(b / a - 0.8) < 0.03; }), "");
    await p.keyboard.press("ArrowRight"); await p.waitForTimeout(80);
    check("→ flips to the next result", await p.evaluate(() => window.VS.S.create.sel === 1), String(await p.evaluate(() => window.VS.S.create.sel)));
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
    check("results come back after a restart", await p.evaluate(() => window.VS.S.create.results.length) === 2 && await p.evaluate(() => document.querySelectorAll("#c-strip [data-i='0'], #c-strip [data-i='1']").length) === 2,
      await p.evaluate(() => document.getElementById("c-strip").innerHTML.slice(0, 400)));
    check("a moved or deleted result shows as missing", await p.evaluate(() => !!document.querySelector("#c-strip .s-miss")), "no missing tile");
    await p.click("#c-strip [data-i='0']");
    await p.waitForTimeout(150);
    check("clicking a kept result opens the full picture", await p.evaluate(() => window.VS.S.create.sel === 0 && !window.VS.S.create.results[0].thin), JSON.stringify(await p.evaluate(() => window.VS.S.create.results[0])).slice(0, 200));
    await p.click("#c-strip .s-miss");
    await p.waitForTimeout(150);
    check("clicking a missing one says so", /missing from its original location/i.test(await p.evaluate(() => document.body.innerText)), "no message");
    await p.ev("studio-result", { id: "", index: 0, of: 1, result: { path: "C:/o/new.png", name: "new.png", w: 1600, h: 900, preview: "x", meta: { source: "C:/w/sk.jpg" } } });
    await p.evaluate(() => { const S = window.VS.S.create; S.results.push({ path: "C:/o/new.png", name: "new.png", w: 1600, h: 900, preview: "x", srcKey: "live:flat 2.psd", meta: { source: "C:/w/sk.jpg", text: "t" } }); window.VS.render(); });
    await p.waitForTimeout(100);
    check("new results are saved for next time", await p.evaluate(() => !!(window.__strip && window.__strip.create.some((r) => r.path === "C:/o/new.png") && window.__strip.create.length >= 3)), JSON.stringify(await p.evaluate(() => window.__strip)).slice(0, 300));
    check("no page errors with the kept strip", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  await browser.close();
  console.log(failed ? failed + " screen test(s) failed" : "all screen tests passed");
  process.exit(failed ? 1 : 0);
})();
