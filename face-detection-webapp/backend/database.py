import uuid
import pickle
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, String, Integer, DateTime, Text, LargeBinary, ForeignKey, text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from paths import DATABASE_PATH

DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def new_id() -> str:
    return str(uuid.uuid4())


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=new_id)
    status = Column(String, default="pending")   # pending|processing|paused|stopped|completed|failed
    step = Column(Integer, default=0)             # 0=not started, 1=finding faces, 2=sorting
    total_images = Column(Integer, default=0)
    processed_images = Column(Integer, default=0)
    step2_total = Column(Integer, default=0)
    step2_processed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    images = relationship("Image", back_populates="job", cascade="all, delete-orphan")
    unique_faces = relationship("UniqueFace", back_populates="job", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="job", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"

    id = Column(String, primary_key=True, default=new_id)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    status = Column(String, default="pending")   # pending|processed|skipped
    faces_found = Column(Integer, default=0)

    job = relationship("Job", back_populates="images")
    matches = relationship("FaceMatch", back_populates="image", cascade="all, delete-orphan")


class UniqueFace(Base):
    __tablename__ = "unique_faces"

    id = Column(String, primary_key=True, default=new_id)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    face_image_path = Column(String, nullable=False)   # relative to results dir
    encoding = Column(LargeBinary, nullable=False)      # pickled numpy array
    name = Column(String, nullable=True)                # user-assigned tag/name
    disabled = Column(Integer, default=0)               # 1 = hidden from results
    group_id = Column(String, nullable=True)             # NULL=standalone, own id=primary, other id=member

    job = relationship("Job", back_populates="unique_faces")
    matches = relationship("FaceMatch", back_populates="unique_face", cascade="all, delete-orphan")

    def get_encoding(self):
        return pickle.loads(self.encoding)

    @staticmethod
    def encode(np_array) -> bytes:
        return pickle.dumps(np_array)


class FaceMatch(Base):
    __tablename__ = "face_matches"

    id = Column(String, primary_key=True, default=new_id)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    unique_face_id = Column(String, ForeignKey("unique_faces.id"), nullable=False)
    image_id = Column(String, ForeignKey("images.id"), nullable=False)
    face_box = Column(Text, nullable=True)   # JSON: [top, right, bottom, left] in pixels

    unique_face = relationship("UniqueFace", back_populates="matches")
    image = relationship("Image", back_populates="matches")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=new_id)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    type = Column(String, default="info")   # info|warning|error
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="notifications")


Base.metadata.create_all(bind=engine)

# Migrate: add columns if they don't exist yet (SQLite doesn't support
# ADD COLUMN IF NOT EXISTS, so we catch errors)
with engine.connect() as conn:
    for stmt in [
        "ALTER TABLE face_matches ADD COLUMN face_box TEXT",
        "ALTER TABLE unique_faces ADD COLUMN name TEXT",
        "ALTER TABLE unique_faces ADD COLUMN disabled INTEGER DEFAULT 0",
        "ALTER TABLE unique_faces ADD COLUMN group_id TEXT",
    ]:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception:
            pass  # column already exists
