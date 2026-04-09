import { create } from "zustand";

const URL_KEY = "facegallery_backend_url";
const PERF_KEY = "facegallery_performance_mode";

function loadUrl(): string | null {
  try { return localStorage.getItem(URL_KEY); } catch { return null; }
}

function loadPerf(): boolean {
  try { return localStorage.getItem(PERF_KEY) === "1"; } catch { return false; }
}

interface SettingsState {
  backendUrl: string | null;
  performanceMode: boolean;
  setBackendUrl: (url: string) => void;
  setPerformanceMode: (on: boolean) => void;
  httpBase: () => string;
  wsBase: () => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  backendUrl: loadUrl(),
  performanceMode: loadPerf(),

  setBackendUrl: (url: string) => {
    const clean = url.replace(/\/+$/, "");
    localStorage.setItem(URL_KEY, clean);
    set({ backendUrl: clean });
  },

  setPerformanceMode: (on: boolean) => {
    localStorage.setItem(PERF_KEY, on ? "1" : "0");
    set({ performanceMode: on });
  },

  httpBase: () => {
    const url = get().backendUrl;
    return url ?? "http://localhost:8000";
  },

  wsBase: () => {
    const url = get().backendUrl;
    if (!url) return "ws://localhost:8000";
    return url.replace(/^http/, "ws");
  },
}));
