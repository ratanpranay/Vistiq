"""Which app this is: Vistiq, or the Vistiq Studio test build.

Studio is the same code with image generation added. It keeps its own
settings, its own downloaded versions and its own release channel
(tags "studio-v..."), so testing it never touches an installed Vistiq.
Both share the upscaling engine files, so nothing is downloaded twice.
"""
import os

STUDIO = os.environ.get("VISTIQ_FLAVOR", "").lower() == "studio"
NAME = "Vistiq Studio" if STUDIO else "Vistiq"
FOLDER = "VistiqStudio" if STUDIO else "Vistiq"
ASSET = "vistiq-studio-app.zip" if STUDIO else "vistiq-app.zip"
TAG_PREFIX = "studio-v" if STUDIO else "v"
