"""
FaceProcessor — runs the two-step ML pipeline in a background thread.

Step 1 (part1 logic): scan all uploaded images, detect unique faces, save cropped
                       face images to results/{job_id}/UNIQUE/
Step 2 (part2 logic): for each unique face, scan all images and copy matches into
                       results/{job_id}/sorted_by_face/{face_name}/

Progress events are put onto `progress_queue` (a queue.Queue of dicts) which the
WebSocket router reads and broadcasts to connected clients.
"""

import json
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
FACE_CROP_PADDING = 0.45   # 45% padding around the detected face bounding box
DETECTION_MAX_LONG_EDGE = 1600


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

    @staticmethod
    def _detect_and_encode(image):
        """Detect and encode on a bounded-size copy; boxes are returned in source coordinates."""
        height, width = image.shape[:2]
        scale = min(1.0, DETECTION_MAX_LONG_EDGE / max(height, width))
        if scale < 1.0:
            detection_image = cv2.resize(
                image, (max(1, round(width * scale)), max(1, round(height * scale))),
                interpolation=cv2.INTER_AREA,
            )
        else:
            detection_image = image

        detection_locations = face_recognition.face_locations(
            detection_image, number_of_times_to_upsample=0
        )
        encodings = face_recognition.face_encodings(detection_image, detection_locations)
        if scale < 1.0:
            locations = [
                tuple(round(coordinate / scale) for coordinate in location)
                for location in detection_locations
            ]
        else:
            locations = detection_locations
        return locations, encodings

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
            existing_faces = db.query(UniqueFace).filter(UniqueFace.job_id == self.job_id).all()
            known_encodings = [pickle.loads(face.encoding) for face in existing_faces]
            known_face_ids = [face.id for face in existing_faces]
            image_detection_cache: dict[str, tuple[list[tuple[int, int, int, int]], list]] = {}

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
                    face_locations, current_encodings = self._detect_and_encode(image)
                    image_detection_cache[img_rec.id] = (face_locations, current_encodings)
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

                    for face_location, encoding in zip(face_locations, current_encodings):

                        if known_encodings:
                            matches = face_recognition.compare_faces(known_encodings, encoding, tolerance=TOLERANCE)
                            if any(matches):
                                continue   # already known face

                        # New unique face
                        face_id = new_id()
                        face_filename = f"unique_{len(known_encodings)}.png"
                        face_path = os.path.join(self.unique_dir, face_filename)

                        top, right, bottom, left = face_location
                        face_h = bottom - top
                        face_w = right - left
                        pad_h = int(face_h * FACE_CROP_PADDING)
                        pad_w = int(face_w * FACE_CROP_PADDING)
                        img_h, img_w = image.shape[:2]
                        crop_top = max(0, top - pad_h)
                        crop_bottom = min(img_h, bottom + pad_h)
                        crop_left = max(0, left - pad_w)
                        crop_right = min(img_w, right + pad_w)
                        face_img = image[crop_top:crop_bottom, crop_left:crop_right]
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
                    cached = image_detection_cache.get(img_rec.id)
                    if cached:
                        face_locs, current_encodings = cached
                    else:
                        image = face_recognition.load_image_file(img_rec.stored_path)
                        face_locs, current_encodings = self._detect_and_encode(image)
                except Exception:
                    job.step2_processed = idx + 1
                    db.commit()
                    continue

                # uf_id -> [top, right, bottom, left] of the matching face in this image
                matched_faces: dict[str, list[int]] = {}
                all_uf_ids = [uf_id for uf_id, _ in uf_encodings]
                all_uf_encodings = [uf_enc for _, uf_enc in uf_encodings]
                for enc_idx, enc in enumerate(current_encodings):
                    loc = face_locs[enc_idx]  # (top, right, bottom, left)
                    if not all_uf_encodings:
                        continue
                    distances = face_recognition.face_distance(all_uf_encodings, enc)
                    closest_idx = int(distances.argmin())
                    if distances[closest_idx] <= TOLERANCE:
                        closest_id = all_uf_ids[closest_idx]
                        if closest_id not in matched_faces:
                            matched_faces[closest_id] = list(loc)

                for uf_id, box in matched_faces.items():
                    existing_match = db.query(FaceMatch).filter_by(
                        image_id=img_rec.id, unique_face_id=uf_id
                    ).first()
                    if existing_match:
                        continue
                    folder_name, folder_path = uf_folders[uf_id]
                    dest = os.path.join(folder_path, img_rec.filename)
                    shutil.copy2(img_rec.stored_path, dest)

                    match = FaceMatch(
                        id=new_id(),
                        job_id=self.job_id,
                        unique_face_id=uf_id,
                        image_id=img_rec.id,
                        face_box=json.dumps(box),
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
