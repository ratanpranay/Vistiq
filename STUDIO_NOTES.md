# Vistiq Studio (test build)

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
