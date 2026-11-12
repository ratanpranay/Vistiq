# Vistiq Studio (test build)

Vistiq's upscaler plus image generation, as a separate app to try out. It keeps its own folders and updates, so it never touches Vistiq.

## 0.1.0
- **Create**: start from a sketch or a render, pick what to change (Sketch to photo, Lighting, CMF, Style, Design, Photoreal) and describe it. Keep my design holds the design in place (Klein-consistency).
- **Painted area only**: paint what should change; everything outside the paint stays exactly the same, pixel for pixel. Brush, erase, undo, clear, invert, blend edges.
- **Reference**: your design plus a reference image; take its camera view, its CMF or its style.
- **Refine** and **+ Another** on any result; **Upscale this** sends it to the upscaler.
- **Library**: everything made, newest first, with filters.
- **Settings**: one Vistiq Studio folder (Documents\Vistiq Studio) with Outputs and Models; takes model files and LoRAs from an existing ComfyUI by linking them (no extra space); downloads the rest.
- Optional **Juice** pass (Flux.1 + a Flux.1 LoRA) for richer light and materials.
- Image generation runs on FLUX.2 Klein 9B in a second private engine; the upscaler and image generation take turns on the graphics card.
