import os
import sys
from pathlib import Path


def _default_data_dir() -> Path:
    configured = os.getenv("FACE_GALLERY_DATA_DIR")
    if configured:
        return Path(configured).expanduser()

    if not getattr(sys, "frozen", False):
        return Path(".")

    if sys.platform == "win32":
        return Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData/Local")) / "FaceGallery"
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/FaceGallery"
    return Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local/share")) / "face-gallery"


DATA_DIR = Path(os.path.realpath(_default_data_dir()))
DATA_DIR.mkdir(parents=True, exist_ok=True)

UPLOADS_DIR = Path(os.path.realpath(DATA_DIR / "uploads"))
RESULTS_DIR = Path(os.path.realpath(DATA_DIR / "results"))
THUMBS_DIR = Path(os.path.realpath(DATA_DIR / "thumbs"))

for _directory in (UPLOADS_DIR, RESULTS_DIR, THUMBS_DIR):
    _directory.mkdir(parents=True, exist_ok=True)


DATABASE_PATH = Path(os.path.realpath(DATA_DIR / "face_detection.db"))
