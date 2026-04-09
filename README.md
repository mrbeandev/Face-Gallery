# Face Gallery

A web application for automatically detecting, grouping, and organizing images by the faces that appear in them — with an interactive graph to visualize relationships.

> Demo videos and screenshots coming soon.

---

## What it does

Upload a batch of photos (or a ZIP archive) and Face Gallery will:

1. **Detect unique faces** across all images using facial encodings
2. **Group images by person** — every image lands in the folder of the face(s) it contains
3. **Show results** in a searchable list or an interactive node graph
4. **Let you correct mistakes** — manually assign or remove face-to-image associations

Processing runs in the background with real-time progress streamed over WebSocket. You can pause, resume, or stop a job at any time.

---

## Screenshots & Demo

> _Demo videos and sample images will be added here soon._

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| State | Zustand + TanStack React Query |
| Graph UI | @xyflow/react |
| Animation | Framer Motion |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Database | SQLite + SQLAlchemy |
| Face ML | `face_recognition` (dlib), OpenCV |
| Realtime | WebSocket |

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm
- **CMake** and a C++ compiler (required to build `dlib` / `face_recognition`)

### Installing dlib dependencies

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install -y cmake build-essential libopenblas-dev liblapack-dev libx11-dev
```

**macOS (Homebrew)**
```bash
brew install cmake
```

**Windows**

Install [CMake](https://cmake.org/download/) and [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/mrbeandev/Face-Gallery.git
cd Face-Gallery
```

### 2. Backend

```bash
cd face-detection-webapp/backend

# Create a virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API is now running at `http://localhost:8000`.

### 3. Frontend

Open a second terminal:

```bash
cd face-detection-webapp/frontend

npm install
npm run dev
```

The app is now running at `http://localhost:5173`.

> The Vite dev server automatically proxies `/api` and `/ws` requests to the backend, so no extra config is needed during development.

---

## Usage

1. Open `http://localhost:5173` in your browser.
2. Drag and drop images (`.jpg`, `.png`, `.webp`, and more) or a `.zip` archive onto the upload area.
3. Click **Start Processing**. Watch the real-time progress as faces are detected and images are grouped.
4. When complete, switch to **Results** to browse faces and their matched images.
5. Toggle **Graph View** to explore relationships visually.
6. Click any face or image to manually adjust assignments.

---

## Standalone scripts

If you only need the core batch-processing logic without the web UI, two standalone scripts are included at the root of the repo:

| Script | Purpose |
|---|---|
| `part1.py` | Scan `input/` and extract unique faces into `UNIQUE/` |
| `part2.py` | Copy images from `input/` into `sorted_by_face/{id}/` folders |

```bash
# Install dependencies
pip install -r requirements.txt

# Drop your photos into input/, then:
python part1.py   # find unique faces
python part2.py   # sort images by face
```

See `INSTRUCTIONS.TXT` for more details.

---

## Project structure

```
Face-Gallery/
├── part1.py                        # Standalone: extract unique faces
├── part2.py                        # Standalone: sort images by face
├── requirements.txt                # Standalone script dependencies
├── input/                          # Input folder for standalone scripts
├── UNIQUE/                         # Output: unique face crops
├── sorted_by_face/                 # Output: images grouped by person
├── INSTRUCTIONS.TXT                # Standalone usage guide
│
└── face-detection-webapp/
    ├── backend/
    │   ├── main.py                 # FastAPI application & CORS setup
    │   ├── database.py             # SQLAlchemy models
    │   ├── processing.py           # Background ML pipeline (FaceProcessor)
    │   ├── schemas.py              # Pydantic response schemas
    │   ├── requirements.txt        # Python dependencies
    │   └── routers/
    │       ├── jobs.py             # REST endpoints
    │       └── ws.py               # WebSocket endpoint
    │
    └── frontend/
        ├── src/
        │   ├── pages/
        │   │   ├── Upload.tsx      # Upload & job history
        │   │   ├── Processing.tsx  # Live progress view
        │   │   └── Results.tsx     # Face list + graph view
        │   ├── components/
        │   ├── hooks/
        │   ├── store/              # Zustand global state
        │   └── types.ts
        ├── package.json
        └── vite.config.ts
```

---

## API overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs/upload` | Upload images or a ZIP archive |
| `GET` | `/api/jobs` | List recent jobs |
| `GET` | `/api/jobs/{id}` | Get job details |
| `POST` | `/api/jobs/{id}/start` | Start processing |
| `POST` | `/api/jobs/{id}/pause` | Pause / resume |
| `POST` | `/api/jobs/{id}/stop` | Stop processing |
| `GET` | `/api/jobs/{id}/results` | Fetch results |
| `POST` | `/api/jobs/{id}/images/{img_id}/faces/{face_id}` | Manually assign a face |
| `DELETE` | `/api/jobs/{id}/images/{img_id}/faces/{face_id}` | Remove a face assignment |
| `WS` | `/ws/{id}` | Real-time progress stream |
| `GET` | `/health` | Health check |

---

## Configuration

All configuration lives directly in source files — no `.env` required for basic usage.

| Setting | Location | Default | Description |
|---|---|---|---|
| `TOLERANCE` | `backend/processing.py` | `0.5` | Face matching strictness. Lower = stricter. |
| Backend port | startup command | `8000` | Change with `--port` |
| Frontend port | `vite.config.ts` | `5173` | Change with `--port` |
| CORS origins | `backend/main.py` | `localhost:5173` | Add origins for production |

---

## Production deployment

For production, build the frontend and serve it as static files alongside the backend:

```bash
# Build the frontend
cd face-detection-webapp/frontend
npm run build

# Serve with a production ASGI server
cd ../backend
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Then point your reverse proxy (nginx, Caddy, etc.) at port 8000 and serve the `frontend/dist/` folder as static files.

---

## Contributing

Contributions, bug reports, and feature requests are welcome. Please open an issue before submitting a large pull request so we can discuss the approach.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Push and open a pull request

---

## License

MIT — see [LICENSE](LICENSE) for details.
