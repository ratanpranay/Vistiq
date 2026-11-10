<p align="center"><img src="app/ui/assets/mark.png" width="120" alt="Vistiq"></p>

# Vistiq

Sharper images, one drop away. Vistiq is a small Windows app that upscales
images with an AI model running in ComfyUI, without ever showing ComfyUI.

## Install

1. Download **Vistiq.exe** from the [latest release](../../releases/latest).
2. Double-click it.

You only ever download the exe once. Every time it starts it checks this
repo for a newer version of the app and updates itself.

### What it needs

- Windows 10 or 11 with an NVIDIA graphics card
- ComfyUI installed, with Vistiq's upscaling nodes and models (if they're
  missing, the log says exactly what to install). Vistiq finds the portable build, a git install or ComfyUI Desktop on its own,
  starts it hidden, and stops it when you close the app. If it can't find it,
  choose the ComfyUI folder in Settings.

## Using it

Drop images (or a folder) on the window, pick a scale, press **Upscale**.

- **2×, 4×** multiply the size. **Max** makes the longest side 7000 px.
- Nothing ever comes out larger than **7000 × 7000 px**.
- Results are saved to *Pictures\Vistiq* unless you choose another folder.
- **Cancel** stops the current image straight away.

## How updates work

```
Vistiq.exe  (launcher, rarely changes)
   │  on start: is there a newer release on GitHub?
   ├─ yes → downloads vistiq-app.zip into %LOCALAPPDATA%\Vistiq\app\<version>
   └─ runs the newest app it has
```

To ship a change: edit the code, bump `app/VERSION`, add a line to
`CHANGELOG.md`, push, then push a tag with the same version (`v0.1.1`).
GitHub Actions tests it, builds both files and publishes the release.

The exe itself only needs replacing if the app starts using a new Python
library that the launcher doesn't already carry.

## Layout

| Path | What it is |
| --- | --- |
| `app/vistiq/` | The app: window, engine control, the workflow |
| `app/ui/` | The interface (HTML, CSS, JS) |
| `app/workflow_image.json` | The ComfyUI workflow it's built from |
| `launcher/` | The exe that updates and starts the app |
| `run_dev.py` | Run straight from source: `pip install -r requirements.txt`, then `python run_dev.py` |

Logs: `%APPDATA%\Vistiq\logs` (the app) and `%LOCALAPPDATA%\Vistiq\launcher.log`.
