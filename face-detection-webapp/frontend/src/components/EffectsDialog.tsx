import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  X, Sparkles, Wind, Lightbulb, MousePointer2, Map, ArrowRightLeft,
} from "lucide-react";
import { useSettingsStore, type EffectsConfig } from "../store/settingsStore";

const EFFECT_ITEMS: {
  key: keyof EffectsConfig;
  label: string;
  desc: string;
  icon: React.ReactNode;
  impact: "high" | "medium" | "low";
}[] = [
  {
    key: "edgeAnimations",
    label: "Edge Animations",
    desc: "Moving dots along connection lines",
    icon: <Wind className="w-4 h-4" />,
    impact: "high",
  },
  {
    key: "edgeGlow",
    label: "Edge Glow",
    desc: "Drop-shadow glow effect on connections",
    icon: <Sparkles className="w-4 h-4" />,
    impact: "medium",
  },
  {
    key: "nodeShadows",
    label: "Node Shadows",
    desc: "Box shadows on photo and face cards",
    icon: <Lightbulb className="w-4 h-4" />,
    impact: "medium",
  },
  {
    key: "hoverEffects",
    label: "Hover Highlighting",
    desc: "Dim unrelated nodes when hovering a face",
    icon: <MousePointer2 className="w-4 h-4" />,
    impact: "medium",
  },
  {
    key: "transitions",
    label: "CSS Transitions",
    desc: "Smooth opacity and style transitions",
    icon: <ArrowRightLeft className="w-4 h-4" />,
    impact: "low",
  },
  {
    key: "minimap",
    label: "Minimap",
    desc: "Overview minimap in the graph corner",
    icon: <Map className="w-4 h-4" />,
    impact: "low",
  },
];

const impactColors = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-emerald-400",
};

export default function EffectsDialog({ onClose }: { onClose: () => void }) {
  const effects = useSettingsStore((s) => s.effects);
  const setEffect = useSettingsStore((s) => s.setEffect);
  const setAllEffects = useSettingsStore((s) => s.setAllEffects);

  const allOn = Object.values(effects).every(Boolean);
  const allOff = Object.values(effects).every((v) => !v);

  if (typeof document === "undefined") return null;

  return createPortal(
    (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.92, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-dark-800 border border-white/10 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-base font-bold text-white">Visual Effects</h2>
            <p className="text-xs text-slate-500 mt-0.5">Toggle effects to improve performance</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-6 pt-4">
          <button onClick={() => setAllEffects(true)} disabled={allOn}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30">
            Enable All
          </button>
          <button onClick={() => setAllEffects(false)} disabled={allOff}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30">
            Disable All
          </button>
        </div>

        {/* Effect toggles */}
        <div className="px-6 py-4 space-y-1">
          {EFFECT_ITEMS.map((item) => {
            const on = effects[item.key];
            return (
              <button
                key={item.key}
                onClick={() => setEffect(item.key, !on)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left
                  ${on ? "bg-white/5" : "hover:bg-white/3"}`}
              >
                <div className={`shrink-0 ${on ? "text-brand-400" : "text-slate-600"}`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${on ? "text-white" : "text-slate-500"}`}>
                      {item.label}
                    </span>
                    <span className={`text-xs ${impactColors[item.impact]}`}>
                      {item.impact === "high" ? "heavy" : item.impact}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{item.desc}</span>
                </div>
                <div className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${on ? "bg-brand-500" : "bg-white/10"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-4">
          <p className="text-xs text-slate-600 text-center">
            Effects marked <span className="text-red-400">heavy</span> have the most impact on performance with large datasets.
          </p>
        </div>
      </motion.div>
    </motion.div>
    ),
    document.body,
  );
}
