"""
FaceProcessor — runs the two-step ML pipeline in a background thread.

Step 1 (part1 logic): scan all uploaded images, detect unique faces, save cropped
                       face images to results/{job_id}/UNIQUE/
Step 2 (part2 logic): for each unique face, scan all images and copy matches into
                       results/{job_id}/sorted_by_face/{face_name}/

Progress events are put onto `progress_queue` (a queue.Queue of dicts) which the
WebSocket router reads and broadcasts to connected clients.
"""

import os
import queue
import threading
import pickle
import shutil
import uuid
from datetime import datetime

import cv2
import face_recognition

from database import SessionLocal, Job, Image as DBImage, UniqueFace, FaceMatch, Notification, new_id


TOLERANCE = 0.5


class FaceProcessor:
    def __init__(self, job_id: str, upload_dir: str, results_dir: str):
        self.job_id = job_id
        self.upload_dir = upload_dir       # uploads/{job_id}/
        self.results_dir = results_dir     # results/{job_id}/
        self.unique_dir = os.path.join(results_dir, "UNIQUE")
        self.sorted_dir = os.path.join(results_dir, "sorted_by_face")

        self.pause_event = threading.Event()
        self.pause_event.set()   # set = running (not paused)
        self.stop_event = threading.Event()

        self.progress_queue: queue.Queue = queue.Queue()
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------ #
    # Control API (called from FastAPI route handlers)                     #
    # ------------------------------------------------------------------ #

    def start(self):
        if self._thread and self._thread.is_alive():
            # Already running — just resume if paused
            self.resume()
            return
        self.stop_event.clear()
        self.pause_event.set()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def pause(self):
        self.pause_event.clear()
        self._emit({"type": "paused"})
        self._update_db_status("paused")

    def resume(self):
        self.pause_event.set()
        self._emit({"type": "resumed"})
        self._update_db_status("processing")

    def stop(self):
        self.stop_event.set()
        self.pause_event.set()   # unblock if currently paused
        self._emit({"type": "stopped"})

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    def _emit(self, msg: dict):
        self.progress_queue.put(msg)

    def _update_db_status(self, status: str):
        db = SessionLocal()
        try:
            job = db.get(Job, self.job_id)
            if job:
                job.status = status
                job.updated_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

    def _add_notification(self, db, msg_type: str, message: str):
        notif = Notification(
            id=new_id(),
            job_id=self.job_id,
            type=msg_type,
            message=message,
            created_at=datetime.utcnow(),
        )
        db.add(notif)
        db.commit()
        self._emit({"type": "notification", "level": msg_type, "message": message})

    # ------------------------------------------------------------------ #
    # Main pipeline                                                        #
    # ------------------------------------------------------------------ #

    def _run(self):
        os.makedirs(self.unique_dir, exist_ok=True)
        os.makedirs(self.sorted_dir, exist_ok=True)

        db = SessionLocal()
        try:
            job = db.get(Job, self.job_id)
            job.status = "processing"
            job.step = 1
            db.commit()

            images_records = db.query(DBImage).filter(
                DBImage.job_id == self.job_id,
                DBImage.status == "pending",
            ).all()

            total = len(images_records)
            job.total_images = total
            db.commit()

            self._emit({"type": "progress", "step": 1, "processed": 0, "total": total, "current_file": ""})

            # ---- Step 1: find unique faces --------------------------------
            known_encodings = []
            known_face_ids = []

            for idx, img_rec in enumerate(images_records):
                if self.stop_event.is_set():
                    self._update_db_status("stopped")
                    return

                self.pause_event.wait()   # blocks if paused

                self._emit({
                    "type": "progress",
                    "step": 1,
                    "processed": idx,
                    "total": total,
                    "current_file": img_rec.filename,
                })

                path = img_rec.stored_path
                try:
                    image = face_recognition.load_image_file(path)
                    face_locations = face_recognition.face_locations(image, number_of_times_to_upsample=0)
                except Exception as e:
                    self._add_notification(db, "error", f"Could not process {img_rec.filename}: {e}")
                    img_rec.status = "skipped"
                    db.commit()
                    continue

                if not face_locations:
                    self._add_notification(db, "info", f"No faces detected in {img_rec.filename}")
                    img_rec.status = "processed"
                    img_rec.faces_found = 0
                    db.commit()
                else:
                    img_rec.faces_found = len(face_locations)
                    img_rec.status = "processed"
                    db.commit()

                    for face_location in face_locations:
                        encoding = face_recognition.face_encodings(image, [face_location])[0]

                        if known_encodings:
                            matches = face_recognition.compare_faces(known_encodings, encoding, tolerance=TOLERANCE)
                            if any(matches):
                                continue   # already known face

                        # New unique face
                        face_id = new_id()
                        face_filename = f"unique_{len(known_encodings)}.png"
                        face_path = os.path.join(self.unique_dir, face_filename)

                        top, right, bottom, left = face_location
                        face_img = image[top:bottom, left:right]
                        cv2.imwrite(face_path, cv2.cvtColor(face_img, cv2.COLOR_RGB2BGR))

                        uf = UniqueFace(
                            id=face_id,
                            job_id=self.job_id,
                            face_image_path=os.path.join(self.job_id, "UNIQUE", face_filename),
                            encoding=pickle.dumps(encoding),
                        )
                        db.add(uf)
                        db.commit()

                        known_encodings.append(encoding)
                        known_face_ids.append(face_id)

                        self._emit({
                            "type": "face_found",
                            "unique_face_id": face_id,
                            "face_image_url": f"/static/results/{self.job_id}/UNIQUE/{face_filename}",
                        })

                job.processed_images = idx + 1
                db.commit()

            if self.stop_event.is_set():
                self._update_db_status("stopped")
                return

            self._emit({"type": "progress", "step": 1, "processed": total, "total": total, "current_file": ""})

            # ---- Step 2: sort images by face ------------------------------
            job.step = 2
            job.step2_total = total
            job.step2_processed = 0
            db.commit()

            unique_faces_db = db.query(UniqueFace).filter(UniqueFace.job_id == self.job_id).all()
            uf_encodings = [(uf.id, pickle.loads(uf.encoding)) for uf in unique_faces_db]

            # Pre-build face folder names from DB (face_image_path basename without ext)
            uf_folders = {}
            for uf in unique_faces_db:
                folder_name = os.path.splitext(os.path.basename(uf.face_image_path))[0]
                folder_path = os.path.join(self.sorted_dir, folder_name)
                os.makedirs(folder_path, exist_ok=True)
                uf_folders[uf.id] = (folder_name, folder_path)

            all_images = db.query(DBImage).filter(DBImage.job_id == self.job_id).all()

            for idx, img_rec in enumerate(all_images):
                if self.stop_event.is_set():
                    self._update_db_status("stopped")
                    return

                self.pause_event.wait()

                self._emit({
                    "type": "progress",
                    "step": 2,
                    "processed": idx,
                    "total": total,
                    "current_file": img_rec.filename,
                })

                try:
                    image = face_recognition.load_image_file(img_rec.stored_path)
                    current_encodings = face_recognition.face_encodings(image)
                except Exception:
                    job.step2_processed = idx + 1
                    db.commit()
                    continue

                matched_faces = set()
                for enc in current_encodings:
                    for uf_id, uf_enc in uf_encodings:
                        if uf_id in matched_faces:
                            continue
                        matches = face_recognition.compare_faces([uf_enc], enc, tolerance=TOLERANCE)
                        if True in matches:
                            matched_faces.add(uf_id)

                for uf_id in matched_faces:
                    folder_name, folder_path = uf_folders[uf_id]
                    dest = os.path.join(folder_path, img_rec.filename)
                    shutil.copy2(img_rec.stored_path, dest)

                    match = FaceMatch(
                        id=new_id(),
                        job_id=self.job_id,
                        unique_face_id=uf_id,
                        image_id=img_rec.id,
                    )
                    db.add(match)
                    db.commit()

                    self._emit({
                        "type": "match",
                        "unique_face_id": uf_id,
                        "image_id": img_rec.id,
                        "image_url": f"/static/uploads/{self.job_id}/{img_rec.filename}",
                    })

                job.step2_processed = idx + 1
                db.commit()

            job.status = "completed"
            job.updated_at = datetime.utcnow()
            db.commit()
            self._emit({"type": "done"})

        except Exception as e:
            db.rollback()
            try:
                job = db.get(Job, self.job_id)
                if job:
                    job.status = "failed"
                    db.commit()
            except Exception:
                pass
            self._emit({"type": "error", "message": str(e)})
        finally:
            db.close()
