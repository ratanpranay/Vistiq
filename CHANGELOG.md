## 0.2.15

- Fix: while Vistiq's engine was running, your own ComfyUI couldn't start
  ("Port 8188 is already in use"). Vistiq's engine now uses a port of its
  own (8391). An engine still running on the old port is moved over
  automatically the next time Vistiq opens
- Vistiq only ever stops a process that is its own engine (it checks that
  the program lives in Vistiq's engine folder), never another ComfyUI that
  happens to use the same port

## 0.2.14

- The magnifier is twice as big (520 px across), so it shows more of the
  picture at once; in a small window it shrinks to fit

## 0.2.13

- Magnifier on finished images: move the mouse over the comparison and a
  round glass shows that spot at the result's real pixels. Left of the
  slider line it shows the original, right of it the result, and where the
  line passes under the glass, both. Hold the mouse button to flip the glass
  to the other version; scroll to zoom (50% to 300%)
- The slider is now dragged by its line or handle (it used to jump to
  wherever you clicked)

- The x on a thumbnail is no longer cut off at the top, and thumbnails keep
  their full shadow
- More room around "© Pranay '26" in the bottom right corner

## 0.2.12

- Results are named Vistiq_<original name>_2x (or _4x, _max), so they sort
  together and are easy to find

- Fix: Vistiq could sit on "Looking for the engine" after opening until
  Reconnect was clicked. The engine was found before the window had
  finished loading, and the window missed the news. It now checks for
  itself until the engine has settled

## 0.2.11

- Two passes now also applies from 2.5x (it was 3x), so a 4x that the size
  limit holds to about 2.6x still gets it. The switch says what it costs:
  more detail, about 25% longer. 2x stays one pass

- Fix: pictures with no transparency came back with a transparency
  channel, with faint see-through specks in it (about 2% of the pixels in a
  test image). Such pictures now skip that step entirely: no specks, a
  smaller file, and a little less work for the upscaler. Pictures that do
  have transparency keep it

## 0.2.10

- Faster: on cards with room for it (16 GB and up), the steps that read the
  image in and write the result out ("Preparing" and "Finishing details")
  work in bigger tiles (1536 px instead of 1024, 2048 on 32 GB cards), so
  there is less overlap to compute twice. Same result. A memory error goes
  back to 1024 px
- Time estimate before you start: under the Upscale button, "About 1:10"
  for the selected images with the chosen scale, model and passes, from how
  long this PC took before. It updates as you change the settings

- Detail control removed. Balanced and Creative added a mottled texture
  rather than real detail, so every upscale is Faithful again (the original
  workflow). 4x in two passes stays, on by default

## 0.2.9

- Fix: opening Vistiq could sit on "Looking for the engine" for a long
  time on PCs with a system proxy (common on work PCs), while Reconnect was
  instant. Vistiq now talks to its engine directly, never through the proxy
- Fix: after an update the window could still show the previous version's
  screen (for example without the new Detail control). Each run now serves
  its screen fresh

## 0.2.8

- Detail: Faithful, Balanced or Creative, in the left bar. Faithful
  sharpens only, as before. Balanced (the new default) and Creative give
  the upscaler more freedom to build fine texture where the image is soft;
  Creative may change small details, so check text and logos
- 4x in two passes: results 3x the original or more are made in two equal
  steps (for example 2x, then 2x) instead of one jump, which usually brings
  out more detail in about the same time. On by default; the switch shows
  under the size when it applies

## 0.2.7

- Fix: progress could jump to "Saving 98%" at the start of an image and sit
  there. The engine's log reached the file late, so the end of the previous
  image's report was read as this image's progress. The engine now writes
  its log as it goes, and Vistiq ignores lines from before the image began
- The model note now says what each model means on this PC: the best fit
  (why Auto picked it), a bigger model (slower here, and why), or a lighter
  one; and from what size results are made in parts

## 0.2.6

- Very large results (for example 9600 x 5400 from a 4800 x 2700 image) no
  longer run out of graphics memory and stall. The upscaler needs about
  0.6 GB of graphics memory per megapixel of result, so on a 16 GB card
  anything above roughly 22 MP is now made in overlapping parts, each at
  full quality, and blended back together with no visible seam
- If a card still runs out of memory, Vistiq retries in smaller parts and
  remembers that size for next time, instead of repeating the same attempt
- Fix: small images could take minutes with Ultra Sharp Lite on a 16 GB
  card. Vistiq kept the whole model on the card with too thin a margin, and
  Windows quietly spilled graphics memory into system RAM, which is many
  times slower. The model now stays on the card only with a wide margin;
  otherwise it is brought in from RAM as it works, as in the original
  workflow
- The model note says why big results are made in parts (they don't fit
  the card in one go) and from what size
- Cancel frees the graphics card instantly. The upscaler only checks for a
  stop between its phases, minutes apart, so Vistiq stops its engine at once
  and starts it again in the background (about 15 seconds); the next image
  starts on a free card instead of waiting behind the cancelled one
- Progress shows which part is running ("Upscaling 2/3")
- Results up to 16 384 px a side open and save without Pillow's size limit

## 0.2.5

- Speed and stability: Vistiq's engine is now pinned to the ComfyUI build
  the upscale workflow was made with (0.3.68), instead of the newest one.
  Newer builds manage memory their own way (dynamic VRAM, pinned memory),
  which fought the upscaler: that made upscales slow and could freeze the PC
- An engine set up by an older Vistiq is replaced automatically, once
  (about 2 GB). The models are kept and are not downloaded again
- Models now live in their own folder (%LOCALAPPDATA%\Vistiq\engine\models),
  so future engine updates never touch them
- Memory: the model stays fully on the card only when it fits with room for
  the result and for Windows; otherwise it is swapped out completely, as in
  the original workflow. It is kept in memory between images only on PCs
  with enough RAM
- The engine runs at slightly lower priority, so the PC stays responsive
  while it works

## 0.2.4

- Fix: "CUDA error: unknown error" with Ultra Sharp Lite on large images.
  Vistiq kept the whole model on the card and left too little room for a
  17 MP result. The memory margin now grows with the size of the result
- If the card still crashes, Vistiq restarts the engine, retries the image
  with the whole model swapped out, and swaps more with that model from
  then on
- Vistiq checks the engine is really alive before each image, instead of
  trusting "Engine ready"

- Realistic progress: Vistiq reads the upscaler's own log and follows it
  phase by phase (Loading model, Preparing, Upscaling, Finishing details,
  Saving) and tile by tile while it prepares and finishes the image
- Each phase's share of the bar, and the time left, come from how long that
  phase really took on this PC before, per model and megapixel

- Progress moves continuously from the first second: the bar creeps toward
  the upscaler's next checkpoint, eases forward every frame, and never jumps
  back or sits still; the steps are named (Preparing, Upscaling, Finishing
  details, Saving)

## 0.2.3

- Model: Auto. Vistiq picks the best model that fits this PC's graphics
  memory (Ultra Sharp Lite on a 16 GB card) and says why
- Download other models from the Model list, with progress; Auto switches
  to the better one when it arrives
- Remove a downloaded model from the list (asks first; keeps at least one)
- Memory tuning: swaps only the part of a model that doesn't fit, keeps the
  model loaded between images, and retries with safer settings if the card
  runs out of memory
- New model: Ultra (same detail as Ultra Sharp, softer look)

- Progress moves smoothly: for a single image the upscaler barely reports
  progress, so Vistiq learns how long each model takes per megapixel and
  fills the bar from that ("0:39 of about 1:30")
- The waiting animation before the first estimate flows without jumping

- When the size limit holds a scale back, the note now says the limit can be
  raised in Settings (up to 16 384 px), and "Settings" opens it

## 0.2.2

- Update notice: when a new version is out, Vistiq downloads it in the
  background and offers "Restart now"
- Settings, Updates: shows your version, checks on demand, and restarts
  into the new version; "What's new" opens the release notes
- The support heart now gently beats
- The engine stays running after you close Vistiq, so it opens ready to go
  next time (switch this off, or stop the engine, in Settings)
- An × next to the image removes it from the list (or press Delete)
- Fix: the "Drop to add" overlay could stay on screen after dropping
- Fix: upscaling failed with "Prompt outputs failed validation
  new_resolution"; the target size is now sent under the right name
- Each scale shows the size it will actually produce for the selected image,
  and says when the size limit holds it back
- Settings, Largest size: 4096, 7000 (default), 8192, 12 000 or 16 384 px,
  the most the upscaler accepts
- The Upscale button wears the logo's colours and becomes the progress bar
  while working: it fills from the left, with a × to cancel, the image
  count and a clock underneath
- © Pranay '26 in the bottom right corner
- Time: a running clock while an image upscales, and "Took 1 min 12 s"
  when it's done (also on each thumbnail)

## 0.2.1

- Fix: the engine stopped while starting because of how Windows wrote its
  log; it now starts normally
- Support button (♥) with a PayPal QR code and link
- Pause sits next to the progress bar; more breathing room on the setup screen

## 0.2.0

- Vistiq now sets up its own private engine on first run: a portable
  ComfyUI, the upscaler and the model, downloaded into
  %LOCALAPPDATA%\Vistiq\engine with progress, pause and resume
- Pick the model at setup (Ultra Sharp, Ultra Sharp Lite or Swift), with a
  suggestion based on the graphics card
- Already have the model files? Point Vistiq at them and it skips that
  download (linked, not copied, when they're on the same drive)
- Your own ComfyUI can still be used instead, from Settings
- "Add a folder" is now "Choose a folder": it adds every image in a folder

## 0.1.0

First release.

- Drop, paste or pick images (or a folder) and upscale them
- Scale 2×, 4× or Max, with a hard limit of 7000 × 7000 px
- Choose the model (Vistiq Ultra, Swift and their Sharp and Lite versions), the format (PNG, JPG, WEBP) and where results are saved
- Before/after comparison, batch strip, and Cancel at any point
- Finds ComfyUI on its own (portable, git install or Desktop) and runs it hidden
- Updates itself from GitHub releases; the exe never needs to be downloaded again
