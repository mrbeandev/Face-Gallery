import { create } from "zustand";

const URL_KEY = "facegallery_backend_url";
const FX_KEY = "facegallery_effects";

function loadUrl(): string | null {
  try { return localStorage.getItem(URL_KEY); } catch { return null; }
}

export interface EffectsConfig {
  edgeAnimations: boolean;   // moving dots on connection lines
  edgeGlow: boolean;         // drop-shadow glow on edges
  nodeShadows: boolean;      // box-shadow on photo/face cards
  hoverEffects: boolean;     // dim/highlight on face hover
  minimap: boolean;          // minimap overlay
  transitions: boolean;      // CSS transitions on opacity etc.
}

const DEFAULT_EFFECTS: EffectsConfig = {
  edgeAnimations: true,
  edgeGlow: true,
  nodeShadows: true,
  hoverEffects: true,
  minimap: true,
  transitions: true,
};

function loadEffects(): EffectsConfig {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (raw) return { ...DEFAULT_EFFECTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_EFFECTS };
}

function saveEffects(fx: EffectsConfig) {
  localStorage.setItem(FX_KEY, JSON.stringify(fx));
}

interface SettingsState {
  backendUrl: string | null;
  effects: EffectsConfig;
  setBackendUrl: (url: string) => void;
  setEffect: (key: keyof EffectsConfig, on: boolean) => void;
  setAllEffects: (on: boolean) => void;
  httpBase: () => string;
  wsBase: () => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  backendUrl: loadUrl(),
  effects: loadEffects(),

  setBackendUrl: (url: string) => {
    const clean = url.replace(/\/+$/, "");
    localStorage.setItem(URL_KEY, clean);
    set({ backendUrl: clean });
  },

  setEffect: (key, on) => {
    const next = { ...get().effects, [key]: on };
    saveEffects(next);
    set({ effects: next });
  },

  setAllEffects: (on) => {
    const next: EffectsConfig = {
      edgeAnimations: on, edgeGlow: on, nodeShadows: on,
      hoverEffects: on, minimap: on, transitions: on,
    };
    saveEffects(next);
    set({ effects: next });
  },

  httpBase: () => get().backendUrl ?? "http://localhost:8000",
  wsBase: () => {
    const url = get().backendUrl;
    if (!url) return "ws://localhost:8000";
    return url.replace(/^http/, "ws");
  },
}));
