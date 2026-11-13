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

async function open(browser, before) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (before) await page.addInitScript(before);
  await page.addInitScript(mock(true));
  await page.goto(PAGE);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const api = window.pywebview.api;
    api.studio_run = () => Promise.resolve("j1");
    api.studio_send = () => Promise.resolve({ ok: true });
    api.js_log = () => Promise.resolve();
  });
  page.ev = (k, d) => page.evaluate(([k, d]) => window.vistiq.event(k, d), [k, d]);
  page.text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText : ""; }, sel);
  page.errors = errors;
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
    const tagDuring = await p.text("#c-stage .s-tag");
    await p.ev("studio-live", frame(2));
    const tagAfter = await p.text("#c-stage .s-tag");
    check("sketch is frozen during a run", /frozen/.test(tagDuring) && /frozen/.test(tagAfter), tagDuring + " / " + tagAfter);

    // 4. The result shows, Live comes back, the card stays on the file.
    await p.ev("studio-result", { id: "j1", index: 0, of: 1, result: { path: "C:/o/r.png", name: "r.png", w: 1600, h: 900, preview: img } });
    await p.ev("studio-job", { id: "j1", state: "done", count: 1 });
    await p.waitForTimeout(100);
    check("result is shown after the run", /Result/.test(await p.text("#c-stage .s-tag")), await p.text("#c-stage .s-tag"));
    check("Live is back after the run", /Live/.test(await p.text("#c-strip")), await p.text("#c-strip"));
    check("card stays on the file after the run", /flat 2\.psd/.test(await p.text("#c-ps")) && /updates as you draw/.test(await p.text("#c-ps")), await p.text("#c-ps"));
    check("strip order: Live | Sketch, results", await p.evaluate(() => {
      const kids = [...document.getElementById("c-strip").children].map((e) => e.classList.contains("s-div") ? "|" : (e.innerText || "").trim() || e.tagName);
      return kids.slice(0, 4).join(",");
    }) === "Live,|,Sketch,IMG", await p.evaluate(() => [...document.getElementById("c-strip").children].map((e) => e.className + ":" + (e.innerText || "").trim()).join(" ")));
    await p.click('#c-strip img[data-i="-2"]');
    check("clicking Sketch shows the frozen sketch", /made from/.test(await p.text("#c-stage .s-tag")), await p.text("#c-stage .s-tag"));
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
    for (const pg of ["create", "reference", "upscale", "library", "settings"]) {
      await p.click(".s-nav button[data-page=" + pg + "]");
      await p.waitForTimeout(150);
    }
    check("all pages open without errors", p.errors.length === 0, p.errors.join(" | "));
    await p.close();
  }

  await browser.close();
  console.log(failed ? failed + " screen test(s) failed" : "all screen tests passed");
  process.exit(failed ? 1 : 0);
})();
