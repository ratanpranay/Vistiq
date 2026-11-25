"""Online image models (Nov 2026): Nano Banana through Google's Gemini API, with the person's own key
(Vistiq Plus, through Vistiq's own service, comes later). Two engines:

    standard  Nano Banana 2.1   1 credit at 1K, 1.5 at 2K
    pro       Nano Banana Pro   4 credits

The key stays on this computer (settings.json). Vistiq counts pictures and their cost each month and stops
online pictures at the person's limit; Google bills the key's owner."""
import base64
import io
import json
import logging
import time

import requests

log = logging.getLogger("vistiq")

API = "https://generativelanguage.googleapis.com/v1beta"
ENGINES = {
    "standard": {"label": "Standard", "model": "gemini-nano-banana-2.1", "fallback": "gemini-3.1-flash-image",
                 "usd": {"1K": 0.0336, "2K": 0.0504}, "credits": {"1K": 1.0, "2K": 1.5}},
    "pro": {"label": "Pro", "model": "gemini-3-pro-image", "fallback": "gemini-3-pro-image-preview",
            "usd": {"1K": 0.134, "2K": 0.134}, "credits": {"1K": 4.0, "2K": 4.0}},
}
SIZES = ("1K", "2K")          # 4K is left to the free upscaler on this computer
RATIOS = {"1:1": 1.0, "4:3": 4 / 3, "3:4": 3 / 4, "3:2": 1.5, "2:3": 2 / 3, "16:9": 16 / 9, "9:16": 9 / 16,
          "21:9": 21 / 9, "5:4": 1.25, "4:5": 0.8}


class OnlineError(RuntimeError):
    pass


def size_of(res):
    """Studio's size choice (512 / 1k / 2k / 4k) as the online size: 1K or 2K."""
    return "2K" if str(res or "").lower() in ("2k", "4k") else "1K"


def price(engine, size):
    e = ENGINES[engine]
    return e["usd"][size], e["credits"][size]


def ratio_of(w, h):
    r = float(w) / max(1, h)
    return min(RATIOS, key=lambda k: abs(RATIOS[k] - r))


def _png64(im, side=2048):
    im = im.convert("RGB")
    if max(im.size) > side:
        im = im.copy()
        im.thumbnail((side, side))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _session():
    s = requests.Session()
    return s


def check_key(key):
    """True when Google accepts the key (listing the models is free)."""
    try:
        r = _session().get(API + "/models", headers={"x-goog-api-key": key}, params={"pageSize": 1}, timeout=20)
        if r.status_code == 200:
            return True, ""
        try:
            msg = r.json().get("error", {}).get("message", "")
        except Exception:
            msg = r.text[:200]
        return False, msg or ("Google said %d" % r.status_code)
    except Exception as e:
        return False, "Couldn't reach Google: %s" % e


def _find_image(obj):
    """The first picture anywhere in Google's answer (the interactions answer or generateContent's)."""
    if isinstance(obj, dict):
        d = obj.get("inlineData") or obj.get("inline_data")
        if isinstance(d, dict) and d.get("data"):
            return d["data"]
        if obj.get("type") == "image" and isinstance(obj.get("data"), str) and len(obj["data"]) > 100:
            return obj["data"]
        for v in obj.values():
            got = _find_image(v)
            if got:
                return got
    elif isinstance(obj, list):
        for v in obj:
            got = _find_image(v)
            if got:
                return got
    return None


def _error_text(r):
    try:
        e = r.json().get("error", {})
        return e.get("message") or json.dumps(e)[:300]
    except Exception:
        return r.text[:300]


def generate(key, engine, images, text, size="1K", ratio="16:9", cancelled=lambda: False):
    """PNG bytes of the picture Nano Banana makes from `images` (PIL, the first is the one worked on) and
    `text`. Tries Google's current interactions endpoint, then the older generateContent one."""
    e = ENGINES[engine]
    parts64 = [_png64(im) for im in images]
    s = _session()
    head = {"x-goog-api-key": key, "Content-Type": "application/json"}
    last = ""
    for model in (e["model"], e["fallback"]):
        if cancelled():
            raise OnlineError("Cancelled")
        body = {"model": model,
                "input": [{"type": "text", "text": text}] + [{"type": "image", "mime_type": "image/png", "data": b} for b in parts64],
                "response_format": {"type": "image", "mime_type": "image/png", "aspect_ratio": ratio, "image_size": size}}
        try:
            r = s.post(API + "/interactions", headers=head, json=body, timeout=300)
        except Exception as ex:
            raise OnlineError("Couldn't reach Google: %s" % ex)
        if r.status_code == 200:
            got = _find_image(r.json())
            if got:
                return base64.b64decode(got)
            last = "Google answered without a picture (it may have declined the request)."
            continue
        last = _error_text(r)
        if r.status_code in (401, 403):
            raise OnlineError("Google didn't accept the key: " + last)
        if r.status_code == 429:
            raise OnlineError("Google's limit for this key was reached: " + last)
        # the older endpoint, same model
        body2 = {"contents": [{"role": "user", "parts": [{"text": text}] + [{"inline_data": {"mime_type": "image/png", "data": b}} for b in parts64]}],
                 "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": ratio, "imageSize": size}}}
        try:
            r2 = s.post(API + "/models/%s:generateContent" % model, headers=head, json=body2, timeout=300)
        except Exception as ex:
            raise OnlineError("Couldn't reach Google: %s" % ex)
        if r2.status_code == 200:
            got = _find_image(r2.json())
            if got:
                return base64.b64decode(got)
            last = "Google answered without a picture (it may have declined the request)."
            continue
        last = _error_text(r2)
        log.warning("online %s (%s): %s / %s", engine, model, r.status_code, r2.status_code)
    raise OnlineError(last or "Google couldn't make the picture.")


# -- the month's count ---------------------------------------------------------------

def month():
    return time.strftime("%Y-%m")


def usage(settings):
    u = dict(settings.get("nb_usage") or {})
    if u.get("month") != month():
        u = {"month": month(), "n": 0, "usd": 0.0, "credits": 0.0}
    return u


def add_usage(settings, usd, credits):
    u = usage(settings)
    u["n"] = int(u.get("n", 0)) + 1
    u["usd"] = round(float(u.get("usd", 0)) + usd, 4)
    u["credits"] = round(float(u.get("credits", 0)) + credits, 2)
    settings.set("nb_usage", u)
    return u


def status(settings):
    key = settings.get("nb_key") or ""
    return {"has_key": bool(key), "key_hint": (key[:4] + "…" + key[-4:]) if len(key) > 10 else "",
            "on": bool(settings.get("nb_on", True)) and bool(key), "limit": float(settings.get("nb_limit") or 0),
            "usage": usage(settings), "ok": bool(settings.get("nb_ok", False)),
            "engines": {k: {"label": v["label"], "usd": v["usd"], "credits": v["credits"]} for k, v in ENGINES.items()}}
