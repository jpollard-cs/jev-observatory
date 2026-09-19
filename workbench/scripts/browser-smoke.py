"""Compatibility entry point for the current module-isolated UI tests."""
from pathlib import Path
import runpy,sys
folder=Path(__file__).parent/"ui-browser"
sys.path.insert(0,str(folder))
runpy.run_path(str(folder/"release041.py"),run_name="__main__")
