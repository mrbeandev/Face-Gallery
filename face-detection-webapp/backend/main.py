import io
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from paths import RESULTS_DIR, THUMBS_DIR, UPLOADS_DIR, DATA_DIR

from database import Base, engine
from routers import jobs, ws

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Face Detection Web App")

# The hosted frontend is a different origin from the user's local backend, so this must be configurable.
allowed_origins = os.getenv(
    "FACE_GALLERY_ALLOWED_ORIGINS",
    "https://face-gallery.mrbean.dev,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded and result images
app.mount("/static/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/static/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")

app.include_router(jobs.router, prefix="/api")
app.include_router(ws.router)


THUMB_CACHE_DIR = str(THUMBS_DIR)


@app.get("/thumb/{path:path}")
def get_thumbnail(path: str, size: int = 200):
    """Serve a resized thumbnail with disk caching."""
    size = min(max(size, 50), 400)

    # Only paths below the two image trees may be read by this endpoint.
    requested = os.path.realpath(os.path.join(str(DATA_DIR), path))
    allowed_roots = (str(UPLOADS_DIR), str(RESULTS_DIR))
    if not any(os.path.commonpath((requested, root)) == root for root in allowed_roots):
        return Response(status_code=404)
    full = requested
    if not os.path.isfile(full):
        return Response(status_code=404)

    # Cache path
    cache_key = f"{path}_{size}"
    cache_path = os.path.join(THUMB_CACHE_DIR, cache_key.replace("/", "__") + ".jpg")

    if not os.path.isfile(cache_path):
        try:
            img = Image.open(full)
            img.thumbnail((size, size), Image.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(cache_path, "JPEG", quality=75)
        except Exception:
            return Response(status_code=500)

    return Response(
        content=Path(cache_path).read_bytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/settings")
def get_settings():
    from processing import TOLERANCE, FACE_CROP_PADDING
    return {"tolerance": TOLERANCE, "face_crop_padding": FACE_CROP_PADDING}


@app.put("/api/settings")
def update_settings(
    tolerance: float | None = None,
    face_crop_padding: float | None = None,
):
    import processing
    if tolerance is not None:
        processing.TOLERANCE = max(0.1, min(1.0, tolerance))
    if face_crop_padding is not None:
        processing.FACE_CROP_PADDING = max(0.0, min(1.5, face_crop_padding))
    return {"tolerance": processing.TOLERANCE, "face_crop_padding": processing.FACE_CROP_PADDING}
