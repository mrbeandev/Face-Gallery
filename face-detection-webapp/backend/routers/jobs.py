"""
REST endpoints for job management.
"""
import io
import os
import shutil
import tempfile
import zipfile
from typing import Annotated

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import SessionLocal, Job, Image as DBImage, UniqueFace, FaceMatch, Notification, new_id, get_db
import json
from schemas import JobOut, JobSummary, UploadResponse, ResultsOut, UniqueFaceOut, FaceMatchOut, ImageOut, ImageFaceMatchOut, GroupMemberOut
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
# DELETE /api/jobs/{job_id}                                            #
# ------------------------------------------------------------------ #

@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, db: Annotated[Session, Depends(get_db)]):
    """Stop processing (if active) and delete the job, all DB records,
    uploaded files, and result files."""
    # Stop processor if running
    proc = active_processors.pop(job_id, None)
    if proc:
        proc.stop()

    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Delete DB records (cascade handles images, faces, matches, notifications)
    db.delete(job)
    db.commit()

    # Delete files on disk
    upload_dir = os.path.join(BASE_UPLOAD_DIR, job_id)
    results_dir = os.path.join(BASE_RESULTS_DIR, job_id)
    shutil.rmtree(upload_dir, ignore_errors=True)
    shutil.rmtree(results_dir, ignore_errors=True)

    return {"status": "deleted"}


# ------------------------------------------------------------------ #
# PATCH /api/jobs/{job_id}/faces/{unique_face_id}                     #
# ------------------------------------------------------------------ #

@router.patch("/jobs/{job_id}/faces/{unique_face_id}")
def rename_face(
    job_id: str,
    unique_face_id: str,
    name: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    face = db.get(UniqueFace, unique_face_id)
    if not face or face.job_id != job_id:
        raise HTTPException(status_code=404, detail="Face not found")
    face.name = name.strip() or None
    db.commit()
    return {"status": "updated", "name": face.name}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/faces/merge                                 #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/faces/merge")
def merge_faces(
    job_id: str,
    target_id: str = Body(...),
    source_ids: list[str] = Body(...),
    use_face_image_from: str | None = Body(None),
    db: Session = Depends(get_db),
):
    """Group faces together (reversible merge).

    The target becomes the group primary. Sources become members.
    No data is deleted — members keep their own matches and can be ungrouped later.
    """
    target = db.get(UniqueFace, target_id)
    if not target or target.job_id != job_id:
        raise HTTPException(status_code=404, detail="Target face not found")

    sources = []
    for sid in source_ids:
        if sid == target_id:
            continue
        src = db.get(UniqueFace, sid)
        if not src or src.job_id != job_id:
            raise HTTPException(status_code=404, detail=f"Source face {sid} not found")
        sources.append(src)

    if not sources:
        raise HTTPException(status_code=400, detail="No valid source faces to merge")

    # Optionally swap the target thumbnail
    if use_face_image_from and use_face_image_from != target_id:
        donor = db.get(UniqueFace, use_face_image_from)
        if donor and donor.job_id == job_id:
            target.face_image_path = donor.face_image_path

    # Set group_id on target (primary) and all sources (members)
    target.group_id = target_id
    for src in sources:
        # If source was itself a group primary, absorb its members too
        if src.group_id == src.id:
            for member in db.query(UniqueFace).filter(
                UniqueFace.group_id == src.id, UniqueFace.id != src.id
            ).all():
                member.group_id = target_id
        src.group_id = target_id

    db.commit()
    return {"status": "grouped", "group_id": target_id}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/faces/{face_id}/ungroup                     #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/faces/{face_id}/ungroup")
def ungroup_face(
    job_id: str,
    face_id: str,
    db: Session = Depends(get_db),
):
    """Remove a face from its group, making it standalone again."""
    face = db.get(UniqueFace, face_id)
    if not face or face.job_id != job_id:
        raise HTTPException(status_code=404, detail="Face not found")
    if not face.group_id:
        return {"status": "already_standalone"}

    old_group_id = face.group_id
    is_primary = face.group_id == face.id

    face.group_id = None

    if is_primary:
        # Promote the next member to primary, or dissolve the group
        remaining = db.query(UniqueFace).filter(
            UniqueFace.group_id == old_group_id, UniqueFace.id != face_id
        ).all()
        if len(remaining) == 1:
            # Only one left — dissolve
            remaining[0].group_id = None
        elif len(remaining) > 1:
            # Promote first remaining member
            new_primary = remaining[0]
            new_primary.group_id = new_primary.id
            for m in remaining[1:]:
                m.group_id = new_primary.id

    db.commit()
    return {"status": "ungrouped"}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/faces/group/{group_id}/set-primary          #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/faces/group/{group_id}/set-primary")
def set_group_primary(
    job_id: str,
    group_id: str,
    face_id: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    """Change which face is the display face (primary) of a group."""
    new_primary = db.get(UniqueFace, face_id)
    if not new_primary or new_primary.job_id != job_id:
        raise HTTPException(status_code=404, detail="Face not found")
    if new_primary.group_id != group_id:
        raise HTTPException(status_code=400, detail="Face is not in this group")

    old_primary = db.get(UniqueFace, group_id)
    if not old_primary:
        raise HTTPException(status_code=404, detail="Group not found")

    # Swap: old primary becomes member, new primary becomes leader
    # Update all members to point to new primary
    members = db.query(UniqueFace).filter(UniqueFace.group_id == group_id).all()
    for m in members:
        m.group_id = face_id

    db.commit()
    return {"status": "primary_changed", "new_primary_id": face_id}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/faces/{unique_face_id}/disable              #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/faces/{unique_face_id}/disable")
def toggle_disable_face(
    job_id: str,
    unique_face_id: str,
    db: Session = Depends(get_db),
):
    face = db.get(UniqueFace, unique_face_id)
    if not face or face.job_id != job_id:
        raise HTTPException(status_code=404, detail="Face not found")
    face.disabled = 0 if face.disabled else 1
    db.commit()
    return {"status": "updated", "disabled": bool(face.disabled)}


# ------------------------------------------------------------------ #
# DELETE /api/jobs/{job_id}/faces/{unique_face_id}                    #
# ------------------------------------------------------------------ #

@router.delete("/jobs/{job_id}/faces/{unique_face_id}")
def delete_face(
    job_id: str,
    unique_face_id: str,
    db: Session = Depends(get_db),
):
    face = db.get(UniqueFace, unique_face_id)
    if not face or face.job_id != job_id:
        raise HTTPException(status_code=404, detail="Face not found")
    # Delete all matches first, then the face
    db.query(FaceMatch).filter_by(unique_face_id=unique_face_id).delete()
    db.delete(face)
    db.commit()
    return {"status": "deleted"}


# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/add-images                                  #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/add-images", response_model=UploadResponse)
async def add_images_to_job(
    job_id: str,
    db: Annotated[Session, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    """Add more images to an existing job so it can be re-processed."""
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    upload_dir = os.path.join(BASE_UPLOAD_DIR, job_id)
    os.makedirs(upload_dir, exist_ok=True)

    accepted: list[str] = []
    rejected: list[str] = []

    # Existing filenames to avoid duplicates
    existing_names = {
        img.filename
        for img in db.query(DBImage).filter(DBImage.job_id == job_id).all()
    }

    for upload in files:
        raw = await upload.read()
        fname = upload.filename or "unknown"
        ext = os.path.splitext(fname.lower())[1]

        if ext == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    for member in zf.namelist():
                        if member.endswith("/") or os.path.basename(member).startswith("."):
                            continue
                        member_ext = os.path.splitext(member.lower())[1]
                        member_data = zf.read(member)
                        base = os.path.basename(member)
                        if base in existing_names:
                            continue
                        if member_ext not in ALLOWED_EXTENSIONS or not _is_valid_image(member_data):
                            rejected.append(base)
                            continue
                        dest = os.path.join(upload_dir, base)
                        with open(dest, "wb") as f:
                            f.write(member_data)
                        accepted.append(base)
                        existing_names.add(base)
            except zipfile.BadZipFile:
                rejected.append(fname)
            continue

        if fname in existing_names or not _ext_ok(fname) or not _is_valid_image(raw):
            rejected.append(fname)
            continue

        dest = os.path.join(upload_dir, fname)
        with open(dest, "wb") as f:
            f.write(raw)
        accepted.append(fname)
        existing_names.add(fname)

    if not accepted:
        raise HTTPException(status_code=400, detail="No new valid images in upload.")

    for fname in accepted:
        img = DBImage(
            id=new_id(),
            job_id=job_id,
            filename=fname,
            stored_path=os.path.join(upload_dir, fname),
        )
        db.add(img)

    job.total_images += len(accepted)
    # Reset status so the job can be re-processed
    job.status = "pending"
    job.step = 0
    job.processed_images = 0
    job.step2_processed = 0
    db.commit()

    return UploadResponse(
        job_id=job_id,
        total_images=job.total_images,
        rejected_files=rejected,
    )


# ------------------------------------------------------------------ #
# GET /api/jobs/{job_id}/results                                      #
# ------------------------------------------------------------------ #

# ------------------------------------------------------------------ #
# POST /api/jobs/{job_id}/images/{image_id}/faces/{unique_face_id}   #
# ------------------------------------------------------------------ #

@router.post("/jobs/{job_id}/images/{image_id}/faces/{unique_face_id}", status_code=201)
def add_face_match_manual(
    job_id: str, image_id: str, unique_face_id: str,
    face_box: list[int] | None = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    img = db.get(DBImage, image_id)
    if not img or img.job_id != job_id:
        raise HTTPException(status_code=404, detail="Image not found")
    face = db.get(UniqueFace, unique_face_id)
    if not face or face.job_id != job_id:
        raise HTTPException(status_code=404, detail="Face not found")

    existing = db.query(FaceMatch).filter_by(image_id=image_id, unique_face_id=unique_face_id).first()
    if existing:
        return {"status": "already_exists"}

    match = FaceMatch(
        id=new_id(),
        job_id=job_id,
        unique_face_id=unique_face_id,
        image_id=image_id,
        face_box=json.dumps(face_box) if face_box else None,
    )
    db.add(match)
    db.commit()
    return {"status": "created"}


# ------------------------------------------------------------------ #
# DELETE /api/jobs/{job_id}/images/{image_id}/faces/{unique_face_id} #
# ------------------------------------------------------------------ #

@router.delete("/jobs/{job_id}/images/{image_id}/faces/{unique_face_id}")
def remove_face_match_manual(
    job_id: str, image_id: str, unique_face_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    match = db.query(FaceMatch).filter_by(image_id=image_id, unique_face_id=unique_face_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    db.delete(match)
    db.commit()
    return {"status": "deleted"}


# ------------------------------------------------------------------ #
# GET /api/jobs/{job_id}/results                                      #
# ------------------------------------------------------------------ #

@router.get("/jobs/{job_id}/results", response_model=ResultsOut)
def get_results(job_id: str, db: Annotated[Session, Depends(get_db)]):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    all_faces_db = db.query(UniqueFace).filter(UniqueFace.job_id == job_id).all()
    uf_map = {uf.id: uf for uf in all_faces_db}

    # Build group membership: primary_id → [member faces]
    group_members_map: dict[str, list[UniqueFace]] = {}
    for uf in all_faces_db:
        if uf.group_id and uf.group_id != uf.id:
            group_members_map.setdefault(uf.group_id, []).append(uf)

    # Map member face IDs to their group primary ID (for graph view edge remapping)
    member_to_primary: dict[str, str] = {}
    for primary_id, members in group_members_map.items():
        for m in members:
            member_to_primary[m.id] = primary_id

    # --- List view: face → [images] ---
    # Only show standalone faces and group primaries (not group members)
    result_faces = []
    for uf in all_faces_db:
        # Skip group members — their matches are aggregated under the primary
        if uf.group_id and uf.group_id != uf.id:
            continue

        # Collect face IDs whose matches should be aggregated under this face
        face_ids = [uf.id]
        members = group_members_map.get(uf.id, [])
        face_ids.extend(m.id for m in members)

        # Query all matches for this face + its group members
        matches_db = (
            db.query(FaceMatch, DBImage)
            .join(DBImage, FaceMatch.image_id == DBImage.id)
            .filter(FaceMatch.unique_face_id.in_(face_ids))
            .all()
        )
        # Deduplicate by image_id
        seen_image_ids: set[str] = set()
        matches_out = []
        for _, img in matches_db:
            if img.id in seen_image_ids:
                continue
            seen_image_ids.add(img.id)
            matches_out.append(FaceMatchOut(
                image_id=img.id,
                filename=img.filename,
                image_url=f"/static/uploads/{job_id}/{img.filename}",
            ))

        # Build group member info
        members_out = [
            GroupMemberOut(
                id=m.id,
                face_image_url=f"/static/results/{m.face_image_path}",
                name=m.name,
                match_count=db.query(FaceMatch).filter(FaceMatch.unique_face_id == m.id).count(),
            )
            for m in members
        ]

        result_faces.append(
            UniqueFaceOut(
                id=uf.id,
                face_image_url=f"/static/results/{uf.face_image_path}",
                name=uf.name,
                disabled=bool(uf.disabled),
                group_id=uf.group_id,
                group_members=members_out,
                matches=matches_out,
            )
        )

    # --- Graph view: image → [faces with boxes] ---
    # Remap member face IDs to their group primary so edges connect to the primary node
    all_images_db = db.query(DBImage).filter(DBImage.job_id == job_id).all()
    images_out = []
    for img in all_images_db:
        matches_db = (
            db.query(FaceMatch)
            .filter(FaceMatch.image_id == img.id)
            .all()
        )
        face_matches_out = []
        seen_face_ids: set[str] = set()
        for m in matches_db:
            # Remap member → primary
            effective_id = member_to_primary.get(m.unique_face_id, m.unique_face_id)
            if effective_id in seen_face_ids:
                continue
            seen_face_ids.add(effective_id)
            uf = uf_map.get(effective_id)
            if not uf:
                continue
            box = None
            if m.face_box:
                try:
                    box = json.loads(m.face_box)
                except Exception:
                    pass
            face_matches_out.append(ImageFaceMatchOut(
                unique_face_id=effective_id,
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
