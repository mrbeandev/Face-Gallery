from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    message: str
    created_at: datetime

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


class FaceMatchOut(BaseModel):
    image_id: str
    filename: str
    image_url: str

    class Config:
        from_attributes = True


class UniqueFaceOut(BaseModel):
    id: str
    face_image_url: str
    matches: list[FaceMatchOut] = []

    class Config:
        from_attributes = True


class ResultsOut(BaseModel):
    job_id: str
    unique_faces: list[UniqueFaceOut]
