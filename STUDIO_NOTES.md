# Vistiq Studio (test build)

## 0.4.48
- Create works on a PC with Qwen Image Edit only (it asked to set up FLUX first).

## 0.4.47
- Settings: the Image model choice (Qwen Image Edit download) shows even when FLUX isn't installed.

## 0.4.46
- 3D views: "Loading view navigator…" while the picture is read; the plan and buttons wait until it's ready.
- Views made earlier show full size (they showed as small thumbnails).
- 3D views no longer go on the board; they stay with their picture (Add as layer puts one in that file's layers).
- Cabin: a camera in a front seat is at the person's head position (it showed the seat from behind).

## 0.4.45
- Cabin views actually move: the model is told how to turn and move from your picture's camera ("turn the camera 45 degrees to the left and move it to the front passenger seat…"); named places alone left the view unchanged.
- A cabin picture read as "from the windscreen" is taken as from the rear seats (the usual view).

## 0.4.44
- (testing) 3D views can try other camera wordings from lab.json.

## 0.4.43
- Camera angles: left and right the right way round (rear ¾ right showed the rear ¾ left).
- Cabin view buttons use the same full description as the plan (where the camera stands, where it looks, what it shows).

## 0.4.42
- Camera angles downloads by itself (0.3 GB) when Qwen Image Edit is in use; nothing to click.

## 0.4.41
- Camera angles (Settings, 0.3 GB): a small add-on trained on camera moves; outside 3D views follow the chosen view far more often.
- Inside a cabin, the words also say what the new view shows (e.g. the steering wheel and driver's door seen across the cabin).

## 0.4.40
- 3D views move the camera again (the full-size picture, which keeps Create's framing, held every part in place; new views use the model's own reference). Views keep the picture's look (a render no longer turns into a sketch).
- Inside a cabin, a picture looking at the dashboard is read as taken from the rear seats.

## 0.4.39
- Instant render adds no logos or badges that aren't drawn (a plain steering wheel hub).

## 0.4.38
- 3D views plan: smooth dragging. Inside a cabin the camera dot goes anywhere and a handle turns the cone (where it looks); outside it goes round the design. The grey ring (your picture) can be dragged to correct a wrong reading; the dropdown is gone.

## 0.4.37
- Renders keep the sketch's framing: the model now gets your picture at the size it draws (it was shrunk to 1 MP inside, which made results zoom out to a wider, more distant view).
- Instant render keeps the painted colours (no added wood, chrome or new colours) and the exact framing; line sketches get a calm two-tone scheme.

## 0.4.36
- Board: no more "3D" frame. A 3D view sits next to its picture, joined by a line, like any result (old frames are removed; their pictures stay).
- 3D views button takes the file open in Create, flattened with its layers (a Live Photoshop/Affinity file is copied as it is now).
- Add as layer goes back where the picture came from: into Photoshop for a Live file, otherwise onto that picture's layers in Create.

## 0.4.35
- 3D views: a small plan from above (design outside, or the cabin with seats and dashboard inside). Drag the dot to place the camera; the cone shows where it looks; the ring is your picture. Named views snap.
- Progress moves smoothly between the model's steps (no more 25% jumps), in Create and 3D views.

## 0.4.34
- 3D views: "Your picture shows" is a menu: if the side was read wrong, pick the right one (your chosen view stays).
- The dial shows the camera's place around the design, seen from above (front at the top; ring = your picture, dot = the new view).
- The card turns the real way: past a side it shows its back (the far side), and "from above" tilts the right way from any side.
- Better reading of three-quarter views (the reader called them "front").
- Machine stats no longer cover the tabs.

## 0.4.33
- 3D views: the side of the car is read from where its nose points in the picture (left/right was often mirrored, so views came out on the wrong side). "Wrong side? Swap" fixes a wrong reading.
- View buttons look like Create's (Add as layer, Open in Create, Photoshop, Upscale), right above Render this view.

## 0.4.32
- "3D views" moved below Create. Machine stats show on the 3D page too.
- Rendering a view looks like Create: blurred picture, progress ring, live preview.
- Tabs fixed: you can click back to any view. Hold on a view to see the original. A gap after Original.
- Heights fixed: the preview tilts the right way; "From above" is a raised camera (no more near-top views).
- Better design transfer: the reader describes the design first; the view keeps proportions, parts and the picture's style (a sketch stays a sketch).

## 0.4.31
- Board: freeform. New pictures take free space where you're looking, loosely scattered (not a line or a column); drag on the empty board to select a group, Delete removes it; Q or right-click a group to Mix (one main picture, the others give camera, materials, style or light). Organize removed.
- 3D views gather in a “3D” frame on the board (drag its name to move it), joined to their pictures.
- 3D page works like Create: the original and each new view are tabs below; click a view again for your picture; Add as layer, Photoshop, Open in Create, Upscale.

## 0.4.30
- 3D renders on the 3D page: results stay there (compare Original / New view / Side by side), and land on the board next to their picture. Buttons: as a Photoshop layer, Open in Create, Upscale.
- 3D reads which side the picture shows first, then asks for a named view (e.g. rear ¾ left, low) instead of degrees; no invented logos or badges. Angles are now absolute: Front, Front ¾ left/right, sides, Rear ¾ left/right, Rear, plus Eye level / From above / Low.

## 0.4.29
- New 3D tab (before Create): drag the picture or pick an angle (front, ¾, side, behind, above, low), fine-tune turn, height, distance and lens, then Render this view. In Create, the Refine button is now 3D.
- Closing Studio lets go of the image models, so the PC's memory is free again.

## 0.4.28
- Settings: “Download everything” — the engine, image models, Qwen Image Edit, both picture readers, the prompt helper, Select and the magic eraser, one after another (for a new PC left to download).

## 0.4.27
- MetaView install: fixed “No such file or directory” (a Windows path-length limit while unpacking its nodes). Press Download again; the models already downloaded are kept.

## 0.4.26
- Rendering style from a reference: the reference picture itself now guides the look (designer Photoshop renderings stay drawn, not photoreal), and the sketch keeps its crisp lines and sharp edges.

## 0.4.25
- Experimental: MetaView download (Settings, under Qwen Image Edit): moves the camera in a picture by turn and tilt. For testing; its depth models are non-commercial.

## 0.4.24
- The tiled detail pass can no longer switch on from an earlier setting (testing only now).

## 0.4.23
- Qwen Image Edit draws at 3.2 MP (was 1.4): crisp logos, edges and fabric textures, about 2800 × 1200.
- Detail pass from 0.4.22 turned off (its parts came back shifted, doubling edges).
- Time estimates are learned per image model, so Qwen's estimate is right.

## 0.4.22
- Detail pass (Qwen Image Edit, on by default): every result is redrawn at twice the size in overlapping parts, so logos, text, stitching and edges come out crisp; when the view is kept, each part also sees the same spot of your full-resolution original.

## 0.4.21
- New views from words work together with material changes (Camera unlocked: your own words go to the model, so the view isn't dropped).

## 0.4.20
- Qwen Image Edit: materials, light, camera and style from a reference go in as the picture reader's words, so your design stays exactly yours (a reference picture pulled its whole dashboard in).

## 0.4.19
- Night reworked: an evening press photo with a softly lit cabin, true colours and blurred city lights outside; no starry skies.

## 0.4.18
- Night looks like a real press photo: calm low light, true material colours, thin warm ambient lines, no stars or neon (unless you ask for them).

## 0.4.17
- Qwen Image Edit gets short, direct instructions (cleaner materials, camera moves follow your words).

## 0.4.16
- Camera changes in words work without a reference: with Camera unlocked, the design stays and the view follows your words.
- Experimental: Qwen Image Edit 2511 (Settings → Image model, 31 GB download). It reads the picture itself, so it understands context: what a sketch shows, what a change implies, new views. Switch between FLUX 3 and Qwen Image Edit any time.

## 0.4.15
- Picture reader XL (optional, 6.2 GB, Settings): understands sketches far better (what each drawn part is meant to be); used instead of the small reader once installed.
- Instant render reads the sketch like a designer: drawn shapes become the real parts (a band across the dashboard becomes a display), hinted parts are completed, no sketch lines left.
- Changes in words: the picture reader's fuller instruction replaces your words for the model; the result still shows your own words.

## 0.4.14
- The same reference picture can be added twice (e.g. once for its materials, once for its light).

## 0.4.13
- Board: Ctrl or Shift click up to 4 tiles (numbered). The bar offers Compare side by side and Mix into one (1 is the base, the others become references; pick what each gives).
- Touchpad: two-finger pans no longer turn into a zoom when you let go.
- Results are named with a run number first (0001_, 0002_…), so they sort in the order they were made.
- Each picture keeps its own words; a new picture starts empty.
- A result made without words says what it was made with (Instant render, or your picture + its references).
- Esc goes from a result back to your picture.
- Instant render: the picture reader first describes your sketch (part colours, setting) so the render keeps them; no sketch lines left, light colours stay clean, no worn or blotchy materials.
- Changes in words (e.g. "snowy camp"): the picture reader spells out everything that change means in this picture (snow on the ground and the truck, winter clothes…).

## 0.4.12
- Instant render: with nothing written and no references, Create becomes Instant render, a studio-quality CGI render that follows your sketch as it is. Words, if you add them, set the scene.
- New canvas: each size (A4 portrait, A4 landscape, 16:9, square) is its own button in the + menu.
- Clicking the active tool again folds its options row away.
- Touchpad: two fingers slide to pan the canvas, pinch to zoom.
- Results carry small numbers; the ones still being made show their progress and can be clicked to watch; the row slides to them and each new result comes into view.
- While making, the blurred picture shows your layers as they look.
- The picture reader reads every new reference fresh, with a pulse while it reads.
- The magic eraser gets ready as soon as you pick it.
- "Getting ready" instead of "Making room on the graphics card".

## 0.4.11
- Click a result: Describe shows the words it was made with; edit them and Create again. Back on your picture, your own words return. (The Prompt pop-up is gone.)

## 0.4.10
- Camera, Lighting and Style references go in as words only (read by the Picture reader or typed): the reference's own design no longer leaks in.

## 0.4.9
- References follow their camera, lighting and style: the new Picture reader (optional, 2.6 GB, Settings) reads each reference into words, shown under it to check or edit. Without it, type the words yourself. Materials come over strongly.
- Board button at the end of the sketch toolbar.
- The Earlier fold is gone from the results row (everything is in the Library).

## 0.4.8
- Test build for tuning references (camera, materials): each result remembers the exact wording it was made with.

## 0.4.7
- References are part of Create (the Reference tab is gone): add up to 3 pictures and choose what each gives: Camera view, Materials & colours, Rendering style, Lighting or As I describe. Each gives only that, strictly, and your design stays. Click a Ref badge to name it in the description.
- Camera from a reference works: the result takes the reference's viewpoint and framing.
- Sketching brush: pen pressure sets size and darkness, a pencil tip with shape dynamics and paper grain; what you draw is what stays. Size slider on a curve (small sizes are easy to pick); [ ] resize the brush ring at once; no crosshair inside it.
- Hold R and drag to rotate the canvas (Shift snaps to 15°); Fit straightens it.
- While making: only the blurred picture and the ring, also for references.
- Earlier results show again; deleted or moved results leave the strip.
- Create panel: even spacing.

## 0.4.6
- Results open at full size (no more blurry thumbnails); Add puts the full picture on a layer.
- Clicking a tool again closes its menu.
- Results row: your picture stays pinned on the left while results (a fifth smaller) slide under it; a divider after each Create; no scroll bar (the wheel scrolls sideways).
- While making: only the blurred sketch with the progress ring, no in-between pictures.
- Upscale, Photoshop, To board and Show in folder use your picture with all its visible layers, flattened at full size.
- Upscale page: the picture floats, the thumbnails end above the machine line, the time estimate is back (a new model borrows a safe guess until its first run), and while running the bar and × sit side by side with the timer visible.

## 0.4.5
- Results show in the main view: click thumbnails (or ← →) to flip through them; click the chosen one again to go back to your picture with all its layers. Layers and sketch tools are always there.
- Results run oldest first; "+ Another" is gone (use Create).
- Colours from a coloured sketch no longer leak into the render when you describe new ones (with Materials unlocked): "all white" now means all white.

## 0.4.4
- On any result: Add (puts it on a layer over your picture) and Export (PNG or JPEG, where you choose) float at the picture's bottom-right.
- Layers are kept between sessions, and the board tile shows the picture as it looks with them.
- Each picture's strip always shows everything made from it (read from your output folders), also after a restart. The Clear (×) button is gone; a moved or deleted file shows as Missing.
- "Variation 1 of 2" sits on the picture while it's made; result thumbnails are bigger and closer to it.
- The machine line has its own row (nothing overlaps it); graphics cards show a short name.

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
