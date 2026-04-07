export type WSEvent =
  | { type: "progress"; step: number; processed: number; total: number; current_file: string }
  | { type: "face_found"; unique_face_id: string; face_image_url: string }
  | { type: "match"; unique_face_id: string; image_id: string; image_url: string }
  | { type: "notification"; level: string; message: string }
  | { type: "done" }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "stopped" }
  | { type: "error"; message: string };
