## Unreleased

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
