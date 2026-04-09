from datetime import datetime
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class JobSummary(BaseModel):
    id: str
    status: str
    total_images: int
    processed_images: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class JobOut(BaseModel):
    id: str
    status: str
    step: int
    total_images: int
    processed_images: int
    step2_total: int
    step2_processed: int
    created_at: datetime
    updated_at: datetime
    notifications: list[NotificationOut] = []

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    job_id: str
    total_images: int
    rejected_files: list[str] = []


# Face match from the perspective of a unique face (list view)
class FaceMatchOut(BaseModel):
    image_id: str
    filename: str
    image_url: str

    class Config:
        from_attributes = True


class UniqueFaceOut(BaseModel):
    id: str
    face_image_url: str
    name: str | None = None
    disabled: bool = False
    matches: list[FaceMatchOut] = []

    class Config:
        from_attributes = True


# Match from the perspective of an image (graph view)
class ImageFaceMatchOut(BaseModel):
    unique_face_id: str
    face_image_url: str
    face_box: list[int] | None = None   # [top, right, bottom, left]


class ImageOut(BaseModel):
    id: str
    filename: str
    image_url: str
    faces: list[ImageFaceMatchOut] = []


class ResultsOut(BaseModel):
    job_id: str
    unique_faces: list[UniqueFaceOut]   # for list view
    images: list[ImageOut]              # for graph view (each image once, with face boxes)
