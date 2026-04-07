import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8000",
});

export interface Job {
  id: string;
  status: string;
  step: number;
  total_images: number;
  processed_images: number;
  step2_total: number;
  step2_processed: number;
  created_at: string;
  updated_at: string;
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

export interface ResultsData {
  job_id: string;
  unique_faces: UniqueFace[];
}

export const jobsApi = {
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
