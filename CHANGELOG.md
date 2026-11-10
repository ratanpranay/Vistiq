## Unreleased

- Update notice: when a new version is out, Vistiq downloads it in the
  background and offers "Restart now"
- Settings, Updates: shows your version, checks on demand, and restarts
  into the new version; "What's new" opens the release notes
- The support heart now gently beats

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
