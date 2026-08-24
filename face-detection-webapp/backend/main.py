import io
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
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


@app.get("/", response_class=HTMLResponse)
def landing_page(request: Request):
    """Explain what this backend is and link to the hosted frontend."""
    def first_header_value(*names: str) -> str | None:
        for name in names:
            value = request.headers.get(name)
            if value is not None:
                value = value.split(",", 1)[0].strip()
                if value:
                    return value
        return None

    scheme = first_header_value("x-forwarded-proto", "x-scheme") or request.url.scheme
    host = first_header_value("x-forwarded-host", "x-host") or request.url.netloc
    default_port = ":443" if scheme == "https" else ":80" if scheme == "http" else None
    if default_port and host.endswith(default_port):
        host = host[: -len(default_port)]
    backend_url = f"{scheme}://{host}"
    frontend_url = f"https://face-gallery.mrbean.dev/?backend={backend_url}"

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Face Gallery backend</title>
    <style>
      :root {{ color-scheme: dark; }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem 1.25rem;
        background: #11100f;
        color: #e7e2da;
        font: 1rem/1.75 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      main {{ width: min(100%, 40rem); }}
      .eyebrow {{
        margin: 0 0 .75rem;
        color: #d49a46;
        font-size: .78rem;
        font-weight: 700;
        letter-spacing: .14em;
        text-transform: uppercase;
      }}
      h1 {{ margin: 0 0 1rem; color: #fffaf2; font-size: clamp(2rem, 8vw, 3.2rem); line-height: 1.1; }}
      p {{ margin: 0 0 1.25rem; }}
      a {{ color: #e5ad5c; }}
      a:hover {{ color: #ffd18a; }}
      .action {{
        display: inline-block;
        margin: .5rem 0 1.5rem;
        padding: .75rem 1rem;
        border: 1px solid #a66f2d;
        border-radius: .45rem;
        background: #2a2116;
        font-weight: 650;
        text-decoration: none;
      }}
      .quiet {{ color: #aaa39a; font-size: .92rem; }}
      code {{ color: #ded0bd; }}
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Face Gallery backend API</p>
      <h1>This is the backend, not the app.</h1>
      <p>There is no user interface here. Open the Face Gallery frontend to browse and organise your photos.</p>
      <a class="action" href="{frontend_url}">Open Face Gallery and connect automatically</a>
      <p class="quiet">This is a shared demo server. For photos that should stay private, <a href="https://github.com/mrbeandev/Face-Gallery/wiki/Running-Your-Own-Backend">run your own backend</a>.</p>
      <p class="quiet"><a href="https://github.com/mrbeandev/Face-Gallery">Face Gallery repository</a> · API checks: <a href="/health"><code>/health</code></a> and <a href="/api/jobs"><code>/api/jobs</code></a> · <a href="https://github.com/mrbeandev/Face-Gallery/wiki/API-Reference">API reference</a></p>
    </main>
  </body>
</html>"""
    return HTMLResponse(content=html, headers={"Cache-Control": "no-cache, max-age=0"})


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
