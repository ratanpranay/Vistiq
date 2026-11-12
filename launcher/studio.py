"""Vistiq Studio.exe: the Vistiq launcher in its Studio flavour."""
import os
import sys

os.environ["VISTIQ_FLAVOR"] = "studio"

import launcher  # noqa: E402

if __name__ == "__main__":
    sys.exit(launcher.main())
