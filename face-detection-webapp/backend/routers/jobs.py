"""
REST endpoints for job management.
"""
import io
import os
import shutil
import tempfile
import zipfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import SessionLocal, Job, Image as DBImage, UniqueFace, FaceMatch, Notification, new_id, get_db
import json
from schemas import JobOut, JobSummary, UploadResponse, ResultsOut, UniqueFaceOut, FaceMatchOut, ImageOut, ImageFaceMatchOut
from processing import FaceProcessor

router = APIRouter()

# In-memory registry of active processors keyed by job_id
active_processors: dict[str, FaceProcessor] = {}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}
BASE_UPLOAD_DIR = "uploads"
BASE_RESULTS_DIR = "results"


def _is_valid_image(data: bytes) -> bool:
    """Validate bytes are a real image using Pillow."""
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        return True
    except Exception:
        return False


def _ext_ok(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


# ------------------------------------------------------------------ #
# POST /api/jobs/upload                                                #
# ------------------------------------------------------------------ #

@router.post("/jobs/upload", response_model=UploadResponse)
async def upload_images(
    db: Annotated[Session, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    job_id = new_id()
    upload_dir = os.path.join(BASE_UPLOAD_DIR, job_id)
    os.makedirs(upload_dir, exist_ok=True)
    results_dir = os.path.join(BASE_RESULTS_DIR, job_id)
    os.makedirs(results_dir, exist_ok=True)

    accepted: list[str] = []
    rejected: list[str] = []
    notifications: list[dict] = []

    for upload in files:
        raw = await upload.read()
        fname = upload.filename or "unknown"
        ext = os.path.splitext(fname.lower())[1]

        # ---- ZIP handling ----
        if ext == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    for member in zf.namelist():
                        # Skip directories and hidden files
                        if member.endswith("/") or os.path.basename(member).startswith("."):
                            continue
                        member_ext = os.path.splitext(member.lower())[1]
                        member_data = zf.read(member)
                        base = os.path.basename(member)

                        if member_ext not in ALLOWED_EXTENSIONS or not _is_valid_image(member_data):
                            rejected.append(base)
                            notifications.append({
                                "type": "warning",
                                "message": f"Skipped (not a valid image): {base}",
                            })
                            continue

                        dest = os.path.join(upload_dir, base)
                        with open(dest, "wb") as f:
                            f.write(member_data)
                        accepted.append(base)
            except zipfile.BadZipFile:
                rejected.append(fname)
                notifications.append({"type": "error", "message": f"Bad zip file: {fname}"})
            continue

        # ---- Single image handling ----
        if not _ext_ok(fname) or not _is_valid_image(raw):
            rejected.append(fname)
            notifications.append({"type": "warning", "message": f"Skipped (not a valid image): {fname}"})
            continue

        dest = os.path.join(upload_dir, fname)
        with open(dest, "wb") as f:
            f.write(raw)
        accepted.append(fname)

    if not accepted:
        shutil.rmtree(upload_dir, ignore_errors=True)
        shutil.rmtree(results_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="No valid images found in upload.")

    # Persist job and image records
    job = Job(id=job_id, total_images=len(accepted))
    db.add(job)
    db.flush()

    for fname in accepted:
        img = DBImage(
            id=new_id(),
            job_id=job_id,
            filename=fname,
            stored_path=os.path.join(upload_dir, fname),
        )
        db.add(img)

    for n in notifications:
        notif = Notification(
            id=new_id(),
            job_id=job_id,
            type=n["type"],
            message=n["message"],
        )
        db.add(notif)

    db.commit()

    return UploadResponse(
        job_id=job_id,
        total_images=len(accepted),
        rejected_files=rejected,
    )


# ------------------------------------------------------------------ #
# GET /api/jobs  (list recent jobs)                                   #
# ------------------------------------------------------------------ #

@router.get("/jobs", response_model=list[JobSummary])
def list_jobs(db: Annotated[Session, Depends(get_db)]):
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(50).all()
    return jobs


# ------------------------------------------------------------------ #
# GET /api/jobs/{job_id}                                              #
# ------------------------------------------------------------------ #

@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Annotated[Session, Depends(get_db)]):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/start                                       #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/start")
def start_job(job_id: str, db: Annotated[Session, Depends(get_db)]):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "completed":
        raise HTTPException(status_code=400, detail="Job already completed")

    if job_id not in active_processors:
        upload_dir = os.path.join(BASE_UPLOAD_DIR, job_id)
        results_dir = os.path.join(BASE_RESULTS_DIR, job_id)
        proc = FaceProcessor(job_id, upload_dir, results_dir)
        active_processors[job_id] = proc

    active_processors[job_id].start()
    return {"status": "started"}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/pause                                       #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/pause")
def pause_job(job_id: str, db: Annotated[Session, Depends(get_db)]):
    proc = active_processors.get(job_id)
    if not proc:
        raise HTTPException(status_code=404, detail="Job not active")

    if not proc.pause_event.is_set():
        # Already paused — resume instead
        proc.resume()
        return {"status": "resumed"}

    proc.pause()
    return {"status": "paused"}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/stop                                        #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/stop")
def stop_job(job_id: str, db: Annotated[Session, Depends(get_db)]):
    proc = active_processors.get(job_id)
    if not proc:
        raise HTTPException(status_code=404, detail="Job not active")
    proc.stop()
    active_processors.pop(job_id, None)
    return {"status": "stopped"}


# ------------------------------------------------------------------ #
# GET /api/jobs/{job_id}/results                                      #
# ------------------------------------------------------------------ #

@router.get("/jobs/{job_id}/results", response_model=ResultsOut)
def get_results(job_id: str, db: Annotated[Session, Depends(get_db)]):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    unique_faces_db = db.query(UniqueFace).filter(UniqueFace.job_id == job_id).all()
    uf_map = {uf.id: uf for uf in unique_faces_db}

    # --- List view: face → [images] ---
    result_faces = []
    for uf in unique_faces_db:
        matches_db = (
            db.query(FaceMatch, DBImage)
            .join(DBImage, FaceMatch.image_id == DBImage.id)
            .filter(FaceMatch.unique_face_id == uf.id)
            .all()
        )
        matches_out = [
            FaceMatchOut(
                image_id=img.id,
                filename=img.filename,
                image_url=f"/static/uploads/{job_id}/{img.filename}",
            )
            for _, img in matches_db
        ]
        result_faces.append(
            UniqueFaceOut(
                id=uf.id,
                face_image_url=f"/static/results/{uf.face_image_path}",
                matches=matches_out,
            )
        )

    # --- Graph view: image → [faces with boxes] ---
    all_images_db = db.query(DBImage).filter(DBImage.job_id == job_id).all()
    images_out = []
    for img in all_images_db:
        matches_db = (
            db.query(FaceMatch)
            .filter(FaceMatch.image_id == img.id)
            .all()
        )
        face_matches_out = []
        for m in matches_db:
            uf = uf_map.get(m.unique_face_id)
            if not uf:
                continue
            box = None
            if m.face_box:
                try:
                    box = json.loads(m.face_box)
                except Exception:
                    pass
            face_matches_out.append(ImageFaceMatchOut(
                unique_face_id=uf.id,
                face_image_url=f"/static/results/{uf.face_image_path}",
                face_box=box,
            ))
        images_out.append(ImageOut(
            id=img.id,
            filename=img.filename,
            image_url=f"/static/uploads/{job_id}/{img.filename}",
            faces=face_matches_out,
        ))

    return ResultsOut(job_id=job_id, unique_faces=result_faces, images=images_out)
