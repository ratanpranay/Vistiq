# Vistiq Studio (test build)

## 0.6.1
- Board tool windows: press the button again while it works to queue more runs; they start by themselves.
- Create: the engine as tiles (Local / Standard / Pro) with credits and cost, like the board windows.
- Create: Upscale · Photoshop · 3D (To board taken out: send to the board from the layers).
- Layers: a pin keeps the panel open (remembered).

## 0.6.0
- Mac: FLUX only for local pictures (the second render model and its picker are gone).
- Standard / Pro with a selection or marker: the whole picture and a mask go to Google, so the change fits the scene's light; softer smudges gone.
- Sharp zoom on the board: fixed a glitch where a wrong piece showed over a tile.
- Library on Mac: title and tabs no longer overlap. Improve / Prompts / Save on one line.

## 0.5.9
- Assets: Library › Assets shows Documents\Vistiq Studio\Assets, one folder per category (add your own folders and pictures any time). Use a picture as a reference or open it in Create.
- Create › References › + Add › From Assets: pick references from your Assets.
- Up to 6 references. New use: Design (mix its shapes and design into yours; several mix together). Standard and Pro use all 6, Local the first 3.
- Prompts: Assets\Prompts.txt and your saved prompts appear in 📚 Prompts. 💾 Save keeps the current words in My prompts.

## 0.5.8
- Board tool windows: the engine is now three tiles (Local / Standard / Pro) with credits, instead of a plain dropdown.
- Sharp zoom: zoomed past the preview, board tiles and the Create / Focus view read the part on screen from the full picture.
- 3D views: choose 1, 2 or 4 variations (3D views page and the board's 3D window).
- Turned or flipped canvas: labels and the Add / Export buttons stay upright and readable.
- Queue: press Create while a run is going and the next one waits and starts by itself (Cancel clears the queue).

## 0.5.7
- Usage pill at the bottom centre: click for the month's details. Own key: what's left of your limit, pictures it still buys, per engine, change the limit, Add balance. Local: this month's pictures. Vistiq Plus shown as coming soon.
- Upscale window on the board: Engine dropdown with Enhance + upscale (Standard or Pro). Nano Banana sharpens textures, stitching, materials and light at 2K, then the free upscaler takes it further.

## 0.5.6
- Export on every picture, the original too: Export original (full size, its own format) or Upscale and export (PNG, JPEG or WebP).
- Nano Banana prompts read your request: only what you don't mention is kept (camera, light, design). Colour and material changes apply to every matching part.
- Close-up / zoomed-in shots of a marked area make a new picture of that part instead of pasting back.
- Online runs: a moving progress bar with time left, and a 2.5-minute time-out instead of hanging.

## 0.5.5
- First start: pick how to make images. On this computer (free, offline), Vistiq Plus (coming soon) or your own Google key. Shows this computer's graphics card, memory and disk; Skip for now to look around.
- Your own key: Nano Banana online with your Google AI Studio key. Standard (Nano Banana 2.1) and Pro. The key is checked with Google and stays on this computer; Google bills you.
- Engine picker in Create and in the board's tool windows: Local, Standard or Pro, with credits and cost before every run. Up to 2K online (upscale here for 4K, free). A selection sends only that part and puts it back in place.
- Bottom bar: this month's online pictures and cost. A monthly limit (default $10) stops online runs.
- Settings: Online models on top (your key, Vistiq Plus).

## 0.5.4
- Board: a new run starts on a new row below the earlier results and lands clear of any tile or window, also ones you moved into the way.
- Board: the placeholders of a run can be dragged; the picture lands where you put it.
- Board: zoom up to 1000%.
- Board: the lines to tool windows leave a tile from one dot; the selected window's line is dark, the others grey.
- Board: ‹ in a tool window goes back to the tool list (pick another tool).
- Create: the selected result in the strip has a white outline; a click beside the picture closes the result (like Escape).

## 0.5.3
- Relight from your reference pictures: Night shows the glowing light lines themselves, their light bouncing onto the seats and panels, stars outside, a different light colour per variation. Golden hour puts the low sun in the windows with sunbeams and long shadows, the sun in a different place each time. Bright & airy fills the cabin with soft daylight and a bright view outside (beach, desert, mountains, sea). Sunset: the sun on the horizon, strips glowing orange. Materials keep their colour and finish.
- Pictures you drop, pick or paste from a file are copied into Vistiq Studio\Imported, so deleting or moving the original no longer breaks the board or Focus view.
- Mac: Cmd+C, Cmd+V (paste onto the board), Cmd+Z, Cmd+Enter and Cmd+D work like Ctrl.

## 0.5.2
- Board tool windows: the + is centred and works by dragging only; the line you drag stays while you pick a tool; placeholders show where the pictures will land, with progress; time estimates before and during a run.
- Results of a window sit in rows of 4 to its right (1 2 3 4, then 5 6 7 8), with one line from the window.
- Relight: 7 presets (Studio, Bright & airy, Golden hour, Overcast, Sunset, Cityscape, Night), worded for an interior or an exterior. Each variation gets its own light direction and strength; Relight again starts somewhere else.
- Night inside: no lamps, only soft indirect ambient glow from light strips and displays, a different ambient colour per variation. Night outside: headlights and tail lights on, street lights in the paint.
- Relight keeps each material's finish: fabric stays matte, no added gloss.

## 0.5.1
- Board tool windows: drag the + out of a tile (or right-click it) and pick Refine, Relight, Variations, 3D views or Upscale. A small window opens next to the tile, joined by a line, with only that tool's settings; results land at the end of its line, each with its own +, so you can chain steps. Type in the tool list to find a tool.
- Painted marks fixed: with a render layer on top of a sketch, only your strokes count as the marked area (before, the whole render did, and Studio re-rendered the bare sketch with its labels). The marking is taken out of the picture you see, not back to the sketch.
- Mac: "change the design" in a marked area asks for a new design of that part, same size and place.

## 0.5.0
- Your ComfyUI workflow inside Studio (Settings): FLUX.2 Klein 9B + Klein-consistency 0.8, 2 MP, 4 steps, guidance 4, your words as typed. When its files are there it does renders, new light, new materials and edits in a selection. Klein 9B needs a free sign-in at Black Forest Labs; copy flux-2-klein-9b-fp8mixed.safetensors into Models\diffusion_models. The rest downloads from Settings.
- Fibo 2.0 (Settings, 13 GB, testing, non-commercial licence): design requests (imagine, redesign, inspired by, variations) go to it.
- Relight fixed: no more blotchy patchwork. The original's pixels are kept only for small changes; a relight or restyle comes back whole.
- Imagine: a design request first gets one concrete design idea per variation, then it is drawn.
- Painted marks: strokes with words act as a selection (bright marker colours are taken out of the picture first). A selection is drawn zoomed in, so new parts are as sharp as the rest; no seam line at its edge. Redesign in a selection replaces the old part with a new design of the same part.
- Flip (H) no longer flips the buttons and labels on the canvas.

## 0.4.99
- Faster sketch + words: words about the object (materials, colours, parts) go into the CGI finish pass, one model run less per variation (2K, 2 variations: about 2 minutes instead of 5).
- 3D views: empty until you press 3D on a picture (in Create, or right-click a tile › 3D views); × clears it. The navigator shows at once. New views fit the screen whole and render at 1K or more; a single seat or part is treated as an object, with the whole of it in frame.
- Board: the Live tile always hangs below the Photoshop bar (no pin); the arrow folds it away.
- "Maintain the camera view" no longer shows a Camera warning.

## 0.4.98
- Your words go to the model exactly as you type them, plus one short line per Keep lock. No more extra rules or rewriting by the picture reader (they made it do random things, e.g. redesign a steering wheel when asked for new materials).
- What you see is what changes: words or a selection on a result change that result.
- Selections: Snap to object and object select look at the picture on screen (not the sketch under a layer), and the snapped selection is one solid piece. A selected part changes as asked: new material, new colour, or something added inside it.
- Lock warnings only for Camera (your words win over Design, Materials and Light).
- Board: the Photoshop bar shows Connect (grey) when not linked and a fold arrow (green) when linked. Connect with no file open tells you to open one; it links by itself. The Live tile hangs below the bar (pinned, always on top) or sits on the board (unpinned).
- Mac: Klein 4B downloads file by file with live progress (it looked stuck at 79%).

## 0.4.97
- Smart reading (Settings › Optional extras): before each run the picture reader works out what the picture is (sketch, render, photo) and what you ask for (render, relight, edit, new scene, new view, restyle); the prompt follows that. On a Mac it needs the small picture reader (2.6 GB) and runs on the processor.
- Your instruction always wins (remove, add, change...), on a sketch or a CGI; the Keep locks only hold what it doesn't mention.
- Mac: Klein 4B can be downloaded next to Mage-Flow; then Create shows a Render model picker. File names end with the model (e.g. _v1_Mage, _v1_Klein4B).
- Mac: photos and CGI are no longer taken for sketches.
- Selection: free-hand lasso (Alt: snaps to edges), new polygon lasso, and Snap to object (on): what you draw is tightened to the object, so changes stay on it.
- No Create tab: Projects, 3D views, Upscale, Library. Projects takes you back to the picture you were on; click again for all projects. Board button in the Create colours.
- New prompt library: generic for any picture, words to change shown in purple.
- Board tiles take their picture's shape (portrait photos get tall tiles).
- One progress number everywhere; the ring also shows while the next variation is made.

## 0.4.96
- Projects open with a double click (one click selects).
- Every board has the Photoshop / Affinity tile again, with Connect. The extra "Board" button next to the Photoshop tab is gone.
- Settings: optional downloads are folded under "Optional extras". On a Mac the picture readers aren't shown (not used there).
- Mac: switching to another setup no longer locks the app; Settings shows one Download button for it.
- Support: only the PayPal QR code (no e-mail address, no link button).
- 3D views: the picture stays flat while you move the camera. The view wording no longer assumes a car (it drew a car's face onto a seat).
- Mac: the progress follows Mage-Flow's real steps instead of sitting at 2% and jumping; a zoomed picture stays under the results strip.

## 0.4.95
- First run: until the models are downloaded, the setup page is the whole app (the other tabs are locked). When the download is done, Studio opens on Projects.
- A fresh install starts with no projects (no empty "My board"). Pictures on an old board still become "My board".
- Adding a picture to a board (drop, Upload, paste, phone): an outlined tile with a bar shows at once where it will land; from the phone the bar shows the real upload. The picture then takes that spot.

## 0.4.94
- Mac: three setups by memory, Light (under 10 GB), Studio (10–20 GB) and Pro (over 20 GB). The setup page shows your chip and memory, suggests the best one that fits and greys out the ones your Mac can't run. Only that setup's files are downloaded. Switch any time in Settings › Setup.
- Mac Studio and Pro: new image model, Microsoft Mage-Flow Edit Turbo (8-bit, about 10 GB, free). It reads the sketch and the instruction and renders in 4 steps. It runs in mlx-serve, a small native engine that keeps the model ready between pictures. Needs macOS 26.2 or later. Light stays FLUX.2 Klein 4B.
- Settings › Delete everything: removes all downloaded models, everything made, projects and settings, then closes Studio (two checks: OK, then type DELETE). To set Studio up fresh, or to remove it.

## 0.4.93
- New project opens in a small floating window (name, then Create project).
- Any project can be deleted, also the only one. It goes to the Trash (new, at the bottom of the left bar: Trash · Settings · ♥) and can be restored for 30 days. Its pictures are never deleted.

## 0.4.92
- Projects: the left bar starts with Projects (Studio opens there). Each project is one board of pictures plus its own Photoshop / Affinity tab. Your existing board is the first project, "My board", with everything on it.
- New project, rename, delete (right-click or ⋯ on a card; the pictures stay in the Library). The newest picture is the cover; right-click a tile → "Use as project cover" to pick one.
- Copy pictures between projects: select tiles, Ctrl C (or right-click → Copy), open another project, Ctrl V. Their layers come along; what was made from them doesn't, unless you copy it too. Ctrl V on a picture in Create puts the copied picture in as a new layer. Right-click → "Move to project…" moves them.
- The Photoshop / Affinity tile is now the project's tab (green dot when live).
- Output folders: Create and 3D results go to Outputs\\Create, upscales to Outputs\\Upscale. New files are numbered so the newest comes first when sorted by name (999999 counts down). Older files stay where they are.

## 0.4.91
- Live (Photoshop / Affinity) is its own page: opening the Live tile never shows the last picture you had open. Until a file is connected it shows the steps: 1 install the Photoshop plugin (or turn on Affinity's connection), 2 Connect, 3 open a file. Once connected, only your live file is there and Create's results go back into it.
- Right-click any layer in the Layers panel: "Send to board" puts that layer on the board as its own picture.

## 0.4.90
- A finished render with any file name (e.g. a FLUX or Midjourney output) is now recognised as a render: the picture reader looks at the picture itself, not the file name. Before, such a render was treated as a sketch and re-drawn from scratch ("turn this sketch into a render"), losing its detail and getting patchy colours.
- Its Keep locks start as for a render (Materials and Light kept), unless you already set them.

## 0.4.89
- Results strip: with many results (30+) the mouse wheel scrolls all the way through, also while a render runs; the strip no longer jumps back to the running tile on every progress update. Wheel scrolling is a bit faster.

## 0.4.88
- Scene changes with Materials kept ("on a city road at sunset, foggy weather"): what the model draws outside now stays. Studio's keep steps (colour, texture, no new parts) only work where the result is still your picture under new light, never over a new view, so the old desert is no longer painted back over the city.
- Words that set a place or weather no longer get Studio's own golden-hour look added (it said "no fog" under "foggy"), nor "only the light changes".

## 0.4.87
- Relight texture: your original's fine detail goes back only where the result still shows the same surface. Where the light changed what is there (a hazy window, a new reflection) it is left alone: no more "embossed" ghost rocks on the glass or mottled seats.
- Golden-hour look: windows stay clear (no haze/fog), shadows filled with neutral light (no blue cast).
- Prompt library: "Studio light" is marked for exteriors; new "Bright studio (interior)".

## 0.4.86
- Prompt library: its prompts no longer show a "would change Materials" warning (they set their own locks).

## 0.4.85
- Relighting a CGI: if the model still adds a small new part on a plain surface (e.g. a glovebox handle), your original surface is put back, lit to match. Sun patches and shadows stay.

## 0.4.84
- Relighting a CGI: the "no new parts" rule now reaches the model (a glovebox handle kept appearing on the lower dash).
- Prompt library: the list grows with the panel instead of scrolling inside it.

## 0.4.83
- Relighting a CGI (Materials and Camera kept): your words go to the model as written. The prompt helper had turned "soft overcast daylight" into winter light with snow, which came out as blotchy dots on the leather.
- The helper may no longer add weather or time (snow, rain, night, fog…) you did not ask for.
- "Overcast", "soft light", "no hard shadows" no longer pull in the golden-hour sun look.
- Upscaled CGIs (…_2x, _4x) count as renders: Materials and Light stay locked after a restart.

## 0.4.82
- Prompt library in Create: "📚 Prompts" next to Improve. Prompts by task (Sketch → render, Lighting, Material change, Background & scene, View change, Add objects); tested ones are marked. Picking one fills the words and sets the Keep locks it works best with.

## 0.4.81
- Relighting a CGI (Materials and Camera kept): the model is told not to add handles, buttons, seams or lines, so no blurry new parts appear (e.g. on the lower dash).

## 0.4.80
- Sun look: no more lens-flare rings or hazy ghost circles over the dashboard and trim; the glow stays at the sun.

## 0.4.79
- Relighting a CGI (Materials locked): the fine texture of the original (perforation, stitching, grain, screen graphics, badges) is kept, and the result comes out at the original's full size.
- Cinematic sun look for words like "sun", "golden hour", "cinematic": low sun in frame with soft bloom and haze, warm soft-edged sun patches, cool sky fill in the shadows, bright exposure.

## 0.4.78
- Relighting a CGI with Materials locked keeps the original colours: the new light and shadows stay, every material's colour comes back (coral red was going dull).

## 0.4.77
- Adding an object in a selected area: the object stays whole even where it runs a little past the selection's edge (it was cut off).

## 0.4.76
- Lasso: smooth curves instead of jagged steps.
- Changing a selected area: the model is shown exactly where the selection is, so an added object sits whole inside it (it was cut off at the edge).

## 0.4.75
- Select an area on a render: picking a selection tool while a render is in view makes it the picture worked on, so you can mask a part of the CGI and change its CMF or add something there.
- Faster with Qwen-Image 2.1: one picture read instead of two (about 20 s less for every new sketch).
- If a render comes back looking like the sketch, the shape is made again, held less.

## 0.4.74
- Create: Size button, 512 / 1K / 2K / 4K. Smaller draws faster (512 for quickest tries); 4K is a 2K render that goes to Upscale ×2.

## 0.4.73
- Word changes (night, scenes) keep the exact viewpoint (a night change turned a head-on view into a three-quarter); outside night without the noisy wet floor.

## 0.4.72
- Night ambient light is subtle and indirect: a soft wash from hidden sources, never visible light lines.

## 0.4.71
- Night interiors: lit by soft roof downlights and the screens' glow; no glowing light strips unless they are part of the design.

## 0.4.70
- Words on a picture: if it is already CGI (a render or photo), the change (night, a new scene, materials) is made on it directly; if it is a sketch, Studio first makes it CGI (the Instant render, so the design looks resolved) and then makes the change on that.

## 0.4.69
- Sketch → Instant render → words: with a result in view, typing (e.g. "night") and Create changes that CGI result, not the sketch. It uses Qwen Image Edit 2511, which keeps the CGI look.
- Night for outside views has its own look (lamps glowing, reflections, deep blue sky) instead of the cabin's ambient lines.

## 0.4.68
- Faster: a picture already read isn't read again, and the shape pass draws at 1.4 MP (the CGI finish adds the detail at 3.2 MP).

## 0.4.67
- Interiors bright and readable: soft bounce light fills the cabin so the whole design shows (no dark CGI); the night look only when you ask for night.

## 0.4.66
- Faster Instant render with Qwen-Image 2.1: one model at a time on the graphics card (the CGI finish ran at 15 s a step with both there, 4 s alone).

## 0.4.65
- Qwen-Image 2.1: a sketch with words ("night") also becomes a photo with the CGI finish (it kept the pencil hatching).
- The picture reader calls a side view a side view more often (it read side views as rear three-quarters).

## 0.4.64
- Instant render no longer names the view it read (a misread turned a side view into a rear three-quarter): it keeps the drawn viewpoint.

## 0.4.63
- Faster: the picture reader lets go of the graphics card before rendering (renders were up to 3x slower with it there), and with Qwen-Image 2.1 every shape is made first, then every CGI finish (the models swap once).

## 0.4.62
- CGI finish only upgrades the materials: it keeps the scene, light and camera (a new scene there could turn the car).

## 0.4.61
- Qwen-Image 2.1 Instant render gets a CGI finish: 2.1 draws the exact shape, then Qwen Image Edit 2511 with Photo realism makes it crisp press-photo CGI.

## 0.4.60
- Qwen-Image 2.1 Instant render tuned on your sketches: exact shape and framing, photographic, no pencil lines (Consistency 0.6 plus a plain sketch-to-photo instruction).

## 0.4.59
- Qwen-Image 2.1: the image engine restarts by itself to see the new sketch ControlNet folder.

## 0.4.58
- New image model choice: Qwen-Image 2.1 (Settings, about 22 GB). Create and Instant render use it with a Consistency LoRA (keeps the sketch's frame) and a sketch ControlNet (holds its lines and proportions). 3D views keep Qwen Image Edit 2511.

## 0.4.57
- Instant render keeps the view of the sketch: Studio tells the model the camera it read (side-on, three-quarter, which way the nose points) and not to turn the car.
- Viewing an Instant render result, the button stays Instant render (it ran as a plain Create without the look).
- Create panel: smaller prompt box, references and Keep move up with more space.

## 0.4.56
- Every render look keeps the sketch's camera framing (the dark-hall look zoomed out).

## 0.4.55
- More render looks from your CGI references: salt flat noon, parking-deck light shaft, golden haze, dark hall (exterior); overcast high-key and cinematic street (interior).

## 0.4.54
- Photo realism on for Instant render (photographic results that follow the sketch).
- Night looks tuned: thin warm ambient lines, soft downlights so materials stay visible, calm blue night outside (was thick glowing tubes in a murky cabin).
- Create: the strictness slider is gone (always exact).

## 0.4.52
- No Design lock or strictness slider: the design always follows the sketch exactly. With words, only what the words name changes.
- 3D views (outside): left and right the right way round again (front ¾ right showed front ¾ left).

## 0.4.51
- Instant render tells cars from cabins by reading the picture (car sketches were treated as interiors, so doors were opened to show seats).
- Photo realism add-on (Anything2Real, 0.6 GB) downloads by itself; in testing.

## 0.4.50
- Instant render: juicy press-photo looks after your references; each render takes one, variations differ. Exteriors: golden architecture on a wet floor, a mountain lake in daylight, a glossy floor at dusk. Interiors: golden hour, bright daylight, evening ambient light.
- The design stays exactly the drawing's (proportions, lamps, grille, every line); only light, materials and setting are added.

## 0.4.49
- Instant render has light and life: daylight with sun patches and soft shadows, real material sheen, a bright landscape outside (interiors); crisp reflections and contact shadow (exteriors). Colours and framing stay.

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
