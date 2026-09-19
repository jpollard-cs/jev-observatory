"""Compatibility entry point: use the faithful ES-module release check."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("release041.py")),run_name="__main__")
