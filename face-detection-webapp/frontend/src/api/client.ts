import axios from "axios";
import { useSettingsStore } from "../store/settingsStore";

export const api = axios.create();

// Intercept every request to inject the current backend URL
api.interceptors.request.use((config) => {
  config.baseURL = useSettingsStore.getState().httpBase();
  return config;
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

export interface GroupMember {
  id: string;
  face_image_url: string;
  name: string | null;
  match_count: number;
}

export interface UniqueFace {
  id: string;
  face_image_url: string;
  name: string | null;
  disabled: boolean;
  group_id: string | null;
  group_members: GroupMember[];
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
  deleteJob: (jobId: string) => api.delete(`/api/jobs/${jobId}`),
  results: (jobId: string) => api.get<ResultsData>(`/api/jobs/${jobId}/results`),
  addMatch: (jobId: string, imageId: string, faceId: string, faceBox?: [number, number, number, number]) =>
    api.post(`/api/jobs/${jobId}/images/${imageId}/faces/${faceId}`, { face_box: faceBox ?? null }),
  removeMatch: (jobId: string, imageId: string, faceId: string) =>
    api.delete(`/api/jobs/${jobId}/images/${imageId}/faces/${faceId}`),
  renameFace: (jobId: string, faceId: string, name: string) =>
    api.patch(`/api/jobs/${jobId}/faces/${faceId}`, { name }),
  mergeFaces: (jobId: string, targetId: string, sourceIds: string[], useFaceImageFrom?: string) =>
    api.post(`/api/jobs/${jobId}/faces/merge`, { target_id: targetId, source_ids: sourceIds, use_face_image_from: useFaceImageFrom ?? null }),
  ungroupFace: (jobId: string, faceId: string) =>
    api.post(`/api/jobs/${jobId}/faces/${faceId}/ungroup`),
  setGroupPrimary: (jobId: string, groupId: string, faceId: string) =>
    api.post(`/api/jobs/${jobId}/faces/group/${groupId}/set-primary`, { face_id: faceId }),
  toggleDisableFace: (jobId: string, faceId: string) =>
    api.post(`/api/jobs/${jobId}/faces/${faceId}/disable`),
  deleteFace: (jobId: string, faceId: string) =>
    api.delete(`/api/jobs/${jobId}/faces/${faceId}`),
  addImages: (jobId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return api.post<UploadResponse>(`/api/jobs/${jobId}/add-images`, form);
  },
  getSettings: () => api.get<{ tolerance: number; face_crop_padding: number }>("/api/settings"),
  updateSettings: (params: { tolerance?: number; face_crop_padding?: number }) =>
    api.put("/api/settings", null, { params }),
};
