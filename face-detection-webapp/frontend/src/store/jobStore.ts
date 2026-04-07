import { create } from "zustand";
import type { WSEvent } from "../types";

export type { WSEvent };

interface LiveFace {
  id: string;
  url: string;
}

interface JobState {
  jobId: string | null;
  status: string;
  step: number;
  step1Progress: { processed: number; total: number; currentFile: string };
  step2Progress: { processed: number; total: number; currentFile: string };
  liveFaces: LiveFace[];
  wsEvents: WSEvent[];
  setJobId: (id: string) => void;
  setStatus: (s: string) => void;
  handleWSEvent: (evt: WSEvent) => void;
  reset: () => void;
}

const defaults = {
  jobId: null,
  status: "pending",
  step: 0,
  step1Progress: { processed: 0, total: 0, currentFile: "" },
  step2Progress: { processed: 0, total: 0, currentFile: "" },
  liveFaces: [] as LiveFace[],
  wsEvents: [] as WSEvent[],
};

export const useJobStore = create<JobState>((set) => ({
  ...defaults,

  setJobId: (id) => set({ jobId: id }),
  setStatus: (s) => set({ status: s }),

  handleWSEvent: (evt) =>
    set((state) => {
      const events = [...state.wsEvents.slice(-100), evt]; // keep last 100

      switch (evt.type) {
        case "progress":
          if (evt.step === 1) {
            return {
              wsEvents: events,
              step: 1,
              status: "processing",
              step1Progress: {
                processed: evt.processed,
                total: evt.total,
                currentFile: evt.current_file,
              },
            };
          } else {
            return {
              wsEvents: events,
              step: 2,
              step2Progress: {
                processed: evt.processed,
                total: evt.total,
                currentFile: evt.current_file,
              },
            };
          }

        case "face_found":
          return {
            wsEvents: events,
            liveFaces: [
              ...state.liveFaces,
              { id: evt.unique_face_id, url: evt.face_image_url },
            ],
          };

        case "paused":
          return { wsEvents: events, status: "paused" };

        case "resumed":
          return { wsEvents: events, status: "processing" };

        case "stopped":
          return { wsEvents: events, status: "stopped" };

        case "done":
          return { wsEvents: events, status: "completed" };

        default:
          return { wsEvents: events };
      }
    }),

  reset: () => set(defaults),
}));
