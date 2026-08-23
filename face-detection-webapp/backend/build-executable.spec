from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


backend_dir = Path(SPECPATH)
model_data = collect_data_files(
    "face_recognition_models",
    includes=["models/*.dat"],
)

hiddenimports = [
    "main",
    "database",
    "paths",
    "schemas",
    "processing",
    "routers.jobs",
    "routers.ws",
    "face_recognition_models",
    *collect_submodules("face_recognition_models"),
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.websockets_impl",
    "click",
    "h11",
    "httptools",
    "websockets",
    "watchfiles",
]

a = Analysis(
    [str(backend_dir / "launcher.py")],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=model_data,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="FaceGallery",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
