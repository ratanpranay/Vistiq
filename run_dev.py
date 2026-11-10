"""Run Vistiq straight from this folder, without the exe or any updates.

    pip install -r requirements.txt
    python run_dev.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "app"))

import vistiq  # noqa: E402

vistiq.main(app_dir=os.path.join(HERE, "app"))
