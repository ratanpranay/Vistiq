# Vistiq Studio (test build)

## 0.4.3
- Sketch inside Studio. Focus view has a toolbar: + · Move · Transform · Brush ▾ (Sketching, Soft, Hard) · Eraser ▾ (Soft, Hard, Magic) · colour + eyedropper · Selection ▾ (Lasso, Rectangle, Pen, Object, Photoshop) · Deselect · Flip view · Undo/Redo. Size, Opacity, Flow, Smoothing and pen-tablet Pressure.
- Layers: fold to thumbnails, open on hover. Show/hide, drag to reorder, drag the bar for opacity, double-click to rename; menu with duplicate, merge down, blend mode, lock, flip, clear, delete. Create uses all visible layers, flattened at full size.
- Magic eraser (AI, LaMa): paint over an object and it's gone, on its own layer. The model (208 MB) downloads on first use.
- Selections only say what Create may change; brushes paint for real and stay inside a selection.
- Drawing on the Live picture starts a new sketch from a frozen copy (joined to Live on the board); Photoshop is never touched.
- Board: + menu (Blank canvas A4 150 DPI · Landscape · 16:9 · Square, Upload, Paste, Upload from phone), Organize and Fit in one toolbar; every tile the same size; Live can't be removed.
- Upload from phone: scan the QR code on the same Wi-Fi; photos land on the board. Allow Studio on the network once if Windows asks.
- Create panel: "Working on" card, one prompt, and Keep locks (Design, Materials, Light, Camera). A sketch starts with Design and Camera locked, a render with everything locked; a note appears when your words would change something locked.
- Machine line under the canvas: GPU load, temperature and memory, CPU and RAM, live. Zoom (− 100% + Fit) on the same line.
- Pictures truly float: zoomed in, they run under the panels to the window edge.

## 0.4.2
- Pictures float on the canvas, no grey block. Mouse wheel or trackpad pinch zooms around the pointer; middle button or Space + drag pans; − 100% + Fit at the bottom right (double-click the empty canvas to fit). Results of the same size keep the zoom for comparing.
- Paint an area: new Lasso that snaps to edges (L) and Pen with corners and curves (P), next to Brush (B), Erase (E) and Object (S). Click the start or double-click to close; Alt closes as a cut-out; Esc cancels. Deselect (Ctrl D). [ and ] change the brush size.
- Live Photoshop sketch: "Ps Selection" in the paint tools takes the selection you made in Photoshop.
- Fixed: the brush ring (and the pointer) disappeared over the picture in 0.4.1. Now a ring with a small crosshair.
- The bar above Create works on a picture you opened too (To board, Photoshop, Upscale). Photoshop: a layer in your open file when the panel is connected, otherwise the picture opens in Photoshop.
- Upscale has the same bar: Refine, To board, Photoshop.
- Calmer bar tiles with more room; the Create and Reference panels spread over the full height.

## 0.4.1
- Cleaner, more professional sketch renders: smooth new nappa leather and fine, even alcantara instead of blotchy, worn-looking materials; soft press-photo light even when your prompt names a time of day. Results at about 2400 × 1300 (faster); use Upscale for bigger.
- Results are never lost: opening another picture or board tile keeps them, and the strip comes back after a restart. Click a kept result to open it from its folder; a moved or deleted file shows as Missing.
- One calm bar above Create: Refine · To board · Photoshop · Upscale. "Show in folder" sits at the top; the extra Refine bar and "← Board" button are gone.
- "Live from Photoshop" blinks green; loading shows your picture blurred with a progress ring.
- When you pick an Image, Photoshop keeps updating quietly in the background (the Live tab brings it back), with no extra box.
- Library text no longer overlaps the pictures in small windows. Studio opens full screen.

## 0.4.0
- New: the Board. Studio opens on an infinite canvas with your Live Photoshop tile (Connect button under it when not connected). Paste, drop or add images to start without Photoshop.
- Double-click a tile to open the Focus view; "Add to board" puts a result next to what it was made from, joined by a line.
- Right-click a tile: Open, Refine, More like this, Upscale, Send to Photoshop, Use as reference, Show in folder, Save a copy, Remove.
- Organize (bottom right) lays the board out neatly in the order things were made. The board saves by itself.
- Floating side panels that fold away for more room; settings on the right on every page (Create, Reference, Upscale).
- Calmer sizes matched to Vizcom: smaller buttons, regular-weight text, quiet labels.
- Long pasted prompts are boiled down first, the design leads and nothing is added; a prompt's own light wins (fixes dark, over-rendered results).

## 0.3.10
- FLUX 3 Klein, the newest image model, is used automatically when its two files are in Models (the earlier model stays as fallback). Results at about 2736 × 1536 with clean, refined lines and textures, about a minute a picture.
- Reference: colours and materials (CMF) or the whole look (Style) come over from a reference picture while your design stays.
- "Follow my sketch" at the top holds your design tighter.
- Light by default, picked from your prompt: interiors by day (soft skylight shaping every volume) or at night (the car's own lights lead), exteriors in a clean grey studio. Your own words (sunset, overcast…) win.
- A clean finish on every result: highlights never burn out, shadows keep detail, colours stay true.
- Watch it develop now runs on the Sketch copy; Live keeps showing your canvas during a run.

## 0.3.9
- Photoshop: your file appears right away when you connect or start Studio (panel 1.0.6 keeps an open line to Studio; restart Photoshop once).
- Watch it develop: the picture forms over your sketch step by step while creating.
- The Sketch tile fills in with progress while creating.
- No more "Failed to remove temporary directory" when Studio closes.

## 0.3.8
- Photoshop selection = live mask: lasso / marquee / Select Subject in Photoshop and only that area changes. Tinted on the live picture; "Use whole picture" to ignore it. Panel 1.0.5 installs by itself; restart Photoshop once.
- Finishing pass removed.

## 0.3.7
- Sharper, cleaner pictures from the one offline model (Klein 9B): 6 steps and a crisp-photo instruction, tested on real sketches; about the same time.
- True V2 removed (no better on real sketches, slower). Liblib-locked style files are skipped quietly.
- Live from app: the connector and To Photoshop work again (they shared an internal name).
- Strip: Live | the sketch the results came from, then the results.
- Screen tests run on every build, so the basics can't break unnoticed.

## 0.3.6
- Live from app always shows a way to connect; if its card can't be drawn, Studio logs why.
- After a Create, the live card stays on your file (no more "Connecting to Photoshop" until the next stroke).
- Settings: the Upscaler heading lines up with the rest.

## 0.3.5
- Fixes "Dependency cycle" with True V2: the speed-up file was offered as a Style. Studio's own helper files no longer show under Style, and a job can't contain them twice.
- Tested on the real image engine: True V2 + speed-up + design lock renders in about 16 s.

## 0.3.4
- New quality choice: Realistic (True V2), Klein 9B tuned for realism, with a speed-up add-on. Settings → Quality → Download.
- Create freezes the sketch when you click it; Live keeps updating in the background and comes back when the run is done. "Hold to see the original" shows the exact sketch each result came from.
- To Photoshop: puts a result (or anything in the Library, upscales too) into the open file as a new layer, sized to the canvas. Panel 1.0.4 installs by itself; restart Photoshop once.
- A finishing style that makes a black picture is caught: you get the image without it, and a note.
- Follow my sketch shows "Exact" only at 100%.

## 0.3.3
- Photoshop works like a navigator: your current file shows up in Studio by itself, switches when you switch files, and Studio says when no file is open or Photoshop is closed.
- The mirror lives in memory; a file is written only when you use the picture (Create, Select, Upscale).
- Fixes: after restarting Studio, Photoshop pictures were deleted as soon as they arrived.
- New Photoshop panel (1.0.3) is installed by itself; restart Photoshop once.

## 0.3.2
- Photoshop link: a Studio left running in the background (e.g. after an update) can no longer catch Photoshop's pictures; the window you connect from takes over.
- Create: "Look" is now "Style"; "Juice" is now "Finishing pass", in its own card: pick a style, then set Strength (Subtle / Medium / Strong).
- Style files you put in Models › loras show up as soon as you come back to Studio.

## 0.3.1
- Fixes "'studio_times'" error after the first picture (Mac and Windows).
- Tested on a real Mac: install, live Create with 2 variations, warm re-run, paint an area and CMF all work.

## 0.3.0
- Mac: Create works again (the fast mode that keeps the model loaded was built for a newer library version; now it uses the installed one).
- Mac: creates at a size that fits the Mac (1080 px on 16 GB); upscale afterwards for more. No more slow full-size export from Affinity.
- Create keeps its own copy of the live picture, so it can't disappear mid-run.
- Settings is compact and centered.

## 0.2.9
- Mac: Create works again (fixes "name 'json' is not defined"); the faster model-stays-loaded mode now actually runs.
- In a small window the Create panel scrolls instead of hiding ✨ Improve.

## 0.2.8
- Show in folder, Upscale this and × sit under the picture, next to the results.
- Painting ends with Done inside the paint toolbar (nothing overlaps it any more).
- ✨ Improve stays visible while connected to Affinity or Photoshop.

## 0.2.7
- The buttons work for any subject (interiors, exteriors, boats, furniture, lamps…); your prompt says what it is.
- Follow my sketch slider (Creative ↔ Exact) on the Mac too.
- An improved prompt is sent exactly as written.
- Viewing an earlier result no longer jumps back to the live picture.

## 0.2.6
- Mac: the image model stays loaded between variations and runs: only the first Create of a session waits for loading.
- Mac: the presets no longer assume a car interior, so a car sketch stays a car.
- Live dot pulses.
- Roomier Create panel: 4 big "What to change" buttons (Sketch to photo, CMF, Lighting, Photoreal), ✨ Improve in the prompt box's own bar, "Paint an area" on the picture, Keep my design and Variations in one row.
- Timer while creating: time so far and about how long is left, learned from earlier runs.
- × clears the results.
- The strip under the picture shows only results of the current picture (first tile marked Live or Original); results of earlier pictures fold into "Earlier".
- The heart's ring fades with the beat.

## 0.2.5
- Mac: image generation starts (model passed correctly), prompt helper downloads.
- One logo in the side bar on both Mac and Windows.

## 0.2.4
- One logo: the Vistiq mark in the side bar (clear on hover); the upscaler page no longer shows its own.

## 0.2.3
- Largest size shows what's recommended for this computer (Mac: bigger sizes are off).
- Prompt helper downloads on the Mac; its ✨ button sits in the corner of the text box.

## 0.2.2
- One Settings page for everything: the upscaler's settings (engine, largest size, logs) are in it too.
- The support heart sits in the side bar above Settings.

## 0.2.1
- **Live from app**: Create's "Start from" has Live from app / Image. Live works with Photoshop and now **Affinity** (Settings → Model Context Protocol → Enable Affinity MCP). Only apps on this computer are offered. Switching to Image keeps the app live, with Bring back.
- Mac: update checks work; setup no longer mentions Windows.

## 0.2.0
- **Mac version (test)**: Vistiq-Studio-mac.zip. Image generation with FLUX.2 Klein 4B on Apple's MLX, a fast classic upscaler (largest size set by the Mac's memory), Select, Library, Photoshop link.
- **Starter text**: each "What to change" button shows how to begin your prompt.
- **Prompt helper** (optional, 1.1 GB, Settings): "Improve my prompt" turns a few words into a clear instruction.

## 0.1.6
- Photoshop panel 1.0.2 sends the canvas as plain pixels, and shows any error.

## 0.1.5
- Photoshop panel 1.0.1: reinstalling replaces the old panel; the panel shows why it can't reach Studio.

## 0.1.4
- Settings: Object selection (the Select tool) has its own row with a Download button.
- Settings: only styles you can use are listed: Looks for Create, and Juice styles under Juice.

## 0.1.3
- Connect with Photoshop no longer clashes with the image engine.

## 0.1.2
- **Connect with Photoshop**: Create shows the active Photoshop document live, updated after every stroke. Install the Photoshop panel once (link under Connect with Photoshop), then open Window → Plugins → Vistiq Studio in Photoshop.
- **Update and restart** at the top of Settings.
- **Quality choice** at setup: Best (needs a free sign-up with the model's maker) or Good (free, downloads by itself).
- **Select** in paint mode: click a part to select it along its real edges; Alt+click removes. Thinner blend by default.
- **CMF and Style transfer** follow your design's lines and take the materials and look from the reference.
- One-button setup, plain names for models and styles, library buttons tidied.

## 0.1.0
- Create, Painted area only, Reference, Library, Settings; upscaler included.
