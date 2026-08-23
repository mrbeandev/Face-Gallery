# Face Gallery

Detect the faces in a pile of photos, work out which photos each person appears
in, and browse the result as face cards or an interactive graph.

The frontend is hosted at
[face-gallery.mrbean.dev](https://face-gallery.mrbean.dev). The backend runs on
your own machine, so your photos are never uploaded anywhere.

![Face Gallery Demo](face-detection-webapp/frontend/public/demo-thumbnail.jpg)

[Watch the demo video](https://drive.google.com/file/d/10Zpq7wDfBluFL_LMdAKPqhTmfBKu4r5d/view?usp=sharing)

---

## Contents

- [What it does](#what-it-does)
- [Running your own backend](#running-your-own-backend)
- [Quick start](#quick-start)
- [Documentation](#documentation)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

## What it does

- Drag and drop photos or a ZIP archive
- Two-pass pipeline: find the distinct people, then link every photo to them
- Live progress over a WebSocket, with faces appearing as they are found
- **List view** — a card per person with every photo they appear in
- **Graph view** — photos and faces as a node network, square or radial, with
  hover highlighting, fullscreen, and a minimap
- **Reversible merge** — grouping two faces never deletes anything, so a wrong
  merge can be undone and the display face swapped at any time
- Rename, disable, or delete people; assign a face to a photo by hand and draw
  its bounding box
- Add more photos to an existing session and re-process
- Server-side thumbnails with a disk cache, and per-effect toggles for large
  graphs

---

## Running your own backend

Download the executable for your platform from the
[Releases page](https://github.com/mrbeandev/Face-Gallery/releases), run it,
and it opens the hosted frontend already connected. Nothing to configure.

| Platform | Asset |
|---|---|
| Linux (x86_64) | `FaceGallery-linux-x86_64` |
| macOS (Apple Silicon) | `FaceGallery-macos-arm64` |
| Windows (x64) | `FaceGallery-windows-x86_64.exe` |

The binaries are unsigned, so macOS and Windows will warn on first run. Linux
needs `chmod +x` first.

**Safari does not work.** It blocks all mixed content, including requests to
localhost, so the hosted page can never reach a local backend. Use Chrome,
Edge, or Firefox 84+.

Full instructions, the unsigned-binary workarounds, and the `?backend=`
shortcut are in
**[Running Your Own Backend](https://github.com/mrbeandev/Face-Gallery/wiki/Running-Your-Own-Backend)**.

---

## Quick start

Running both halves from source:

```bash
git clone https://github.com/mrbeandev/Face-Gallery.git
cd Face-Gallery/face-detection-webapp/backend

python3 -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```

In a second terminal:

```bash
cd face-detection-webapp/frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api`, `/ws`,
`/thumb`, and `/static` to the backend, so there is no CORS setup for local
development.

`face_recognition` depends on dlib, which compiles from source unless you use
the prebuilt `dlib-bin` wheel. See
**[Quick Start](https://github.com/mrbeandev/Face-Gallery/wiki/Quick-Start)**
for the per-platform build dependencies and the shortcut.

---

## Documentation

Everything lives in the [wiki](https://github.com/mrbeandev/Face-Gallery/wiki).

| Page | What's in it |
|---|---|
| [Running Your Own Backend](https://github.com/mrbeandev/Face-Gallery/wiki/Running-Your-Own-Backend) | Downloads, browser support, `?backend=`, where data is stored |
| [Quick Start](https://github.com/mrbeandev/Face-Gallery/wiki/Quick-Start) | Building from source, dlib dependencies |
| [Usage](https://github.com/mrbeandev/Face-Gallery/wiki/Usage) | What every view and control does |
| [Configuration](https://github.com/mrbeandev/Face-Gallery/wiki/Configuration) | Tolerance, upload limits, environment variables |
| [API Reference](https://github.com/mrbeandev/Face-Gallery/wiki/API-Reference) | Every endpoint and WebSocket event |
| [Project Structure](https://github.com/mrbeandev/Face-Gallery/wiki/Project-Structure) | Layout and the data model |
| [Building the Executable](https://github.com/mrbeandev/Face-Gallery/wiki/Building-the-Executable) | PyInstaller and the release workflow |
| [Deployment](https://github.com/mrbeandev/Face-Gallery/wiki/Deployment) | Self-hosting both halves |
| [Standalone Scripts](https://github.com/mrbeandev/Face-Gallery/wiki/Standalone-Scripts) | The original command-line tools |
| [Troubleshooting](https://github.com/mrbeandev/Face-Gallery/wiki/Troubleshooting) | When something goes wrong |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| State | Zustand, TanStack React Query |
| Graph | @xyflow/react (ReactFlow) |
| Animation | Framer Motion |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Database | SQLite, SQLAlchemy |
| Face ML | face_recognition (dlib), OpenCV |
| Realtime | WebSocket |
| Packaging | PyInstaller |

---

## Contributing

Contributions, bug reports, and feature requests are welcome. Please open an
issue before a large pull request so the approach can be discussed.

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Push and open a pull request

---

## License

MIT — see [LICENSE](LICENSE).
