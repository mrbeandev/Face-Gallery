# Face Gallery executable

From this `backend/` directory, build with the existing virtual environment:

```sh
.venv/bin/pip install pyinstaller
.venv/bin/pyinstaller --clean --noconfirm build-executable.spec
```

The executable is written to `dist/FaceGallery` (or `FaceGallery.exe` on
Windows). It starts the local backend and opens the hosted frontend. User data
is stored in `%LOCALAPPDATA%/FaceGallery` on Windows,
`~/Library/Application Support/FaceGallery` on macOS, and
`${XDG_DATA_HOME:-~/.local/share}/face-gallery` on Linux. Set
`FACE_GALLERY_DATA_DIR` to override this location.

Safari blocks all mixed content including localhost, so the hosted frontend
cannot reach a local backend in Safari. Chrome, Edge and Firefox 84+ work.
