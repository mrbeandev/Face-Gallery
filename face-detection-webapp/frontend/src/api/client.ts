import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8000",
});

export interface JobSummary {
  id: string;
  status: string;
  total_images: number;
  processed_images: number;
  created_at: string;
  updated_at: string;
}

export interface Job extends JobSummary {
  step: number;
  step2_total: number;
  step2_processed: number;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

export interface UploadResponse {
  job_id: string;
  total_images: number;
  rejected_files: string[];
}

// List-view: face → images
export interface FaceMatch {
  image_id: string;
  filename: string;
  image_url: string;
}

export interface UniqueFace {
  id: string;
  face_image_url: string;
  matches: FaceMatch[];
}

// Graph-view: image → faces (with bounding boxes)
export interface ImageFaceMatch {
  unique_face_id: string;
  face_image_url: string;
  face_box: [number, number, number, number] | null; // [top, right, bottom, left]
}

export interface ImageNode {
  id: string;
  filename: string;
  image_url: string;
  faces: ImageFaceMatch[];
}

export interface ResultsData {
  job_id: string;
  unique_faces: UniqueFace[];
  images: ImageNode[];
}

export const jobsApi = {
  list: () => api.get<JobSummary[]>("/api/jobs"),
  upload: (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return api.post<UploadResponse>("/api/jobs/upload", form);
  },
  get: (jobId: string) => api.get<Job>(`/api/jobs/${jobId}`),
  start: (jobId: string) => api.post(`/api/jobs/${jobId}/start`),
  pause: (jobId: string) => api.post(`/api/jobs/${jobId}/pause`),
  stop: (jobId: string) => api.post(`/api/jobs/${jobId}/stop`),
  results: (jobId: string) => api.get<ResultsData>(`/api/jobs/${jobId}/results`),
};
