import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { jobsApi } from "../api/client";

export default function SettingsPopover({ onClose }: { onClose: () => void }) {
  const [padding, setPadding] = useState(0.45);
  const [tolerance, setTolerance] = useState(0.5);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    jobsApi.getSettings().then((r) => {
      setPadding(r.data.face_crop_padding);
      setTolerance(r.data.tolerance);
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await jobsApi.updateSettings({ tolerance, face_crop_padding: padding });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Preview geometry — real face_recognition results on face-sample.png (2048x2048)
  // Face box: top=502, right=1272, bottom=965, left=810
  const imgSize = 220;
  const faceLeft = imgSize * (810 / 2048);
  const faceTop = imgSize * (502 / 2048);
  const faceBoxW = imgSize * (462 / 2048);
  const faceBoxH = imgSize * (463 / 2048);
  const faceCX = faceLeft + faceBoxW / 2;
  const faceCY = faceTop + faceBoxH / 2;
  const cropW = Math.min(imgSize, faceBoxW * (1 + padding * 2));
  const cropH = Math.min(imgSize, faceBoxH * (1 + padding * 2));
  const cropLeft = Math.max(0, Math.min(imgSize - cropW, faceCX - cropW / 2));
  const cropTop = Math.max(0, Math.min(imgSize - cropH, faceCY - cropH / 2));
  const cropRight = cropLeft + cropW;
  const cropBottom = cropTop + cropH;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.92, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-dark-800 border border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Processing Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Face Crop Padding</label>
                <span className="text-sm font-mono text-brand-400">{Math.round(padding * 100)}%</span>
              </div>

              <div className="flex items-center justify-center mb-3">
                <div className="relative rounded-xl overflow-hidden bg-dark-700"
                  style={{ width: imgSize, height: imgSize }}>
                  <img src="/face-sample.png" alt="Sample" className="w-full h-full object-cover" />

                  <div className="absolute inset-0 bg-black/65 pointer-events-none" style={{
                    clipPath: `polygon(
                      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                      ${cropLeft}px ${cropTop}px,
                      ${cropLeft}px ${cropBottom}px,
                      ${cropRight}px ${cropBottom}px,
                      ${cropRight}px ${cropTop}px,
                      ${cropLeft}px ${cropTop}px
                    )`,
                    transition: "clip-path 0.15s ease-out",
                  }} />

                  <div className="absolute border-2 border-dashed border-emerald-400/70 pointer-events-none" style={{
                    top: cropTop, left: cropLeft,
                    width: cropRight - cropLeft, height: cropBottom - cropTop,
                    transition: "all 0.15s ease-out",
                    borderRadius: 4,
                  }} />

                  <div className="absolute border-2 border-brand-400 pointer-events-none" style={{
                    top: faceTop, left: faceLeft,
                    width: faceBoxW, height: faceBoxH,
                    boxShadow: "0 0 10px rgba(234,179,8,0.5)",
                    borderRadius: 3,
                  }} />

                  <div className="absolute text-brand-400 text-xs font-bold bg-brand-500/20 px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none"
                    style={{ top: Math.max(2, faceTop - 20), left: faceLeft }}>
                    face
                  </div>
                  {padding > 0.05 && (
                    <div className="absolute text-emerald-400 text-xs font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none"
                      style={{
                        bottom: Math.max(4, imgSize - cropBottom - 20),
                        right: Math.max(4, imgSize - cropRight),
                        transition: "all 0.15s ease-out",
                      }}>
                      crop +{Math.round(padding * 100)}%
                    </div>
                  )}
                </div>
              </div>

              <input type="range" min={0} max={150} step={5} value={padding * 100}
                onChange={(e) => setPadding(Number(e.target.value) / 100)}
                className="w-full accent-brand-500" />
              <p className="text-xs text-slate-500 mt-1">Extra space around detected faces when cropping. Applied on next run.</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Match Tolerance</label>
                <span className="text-sm font-mono text-brand-400">{tolerance.toFixed(2)}</span>
              </div>
              <input type="range" min={10} max={100} step={5} value={tolerance * 100}
                onChange={(e) => setTolerance(Number(e.target.value) / 100)}
                className="w-full accent-brand-500" />
              <p className="text-xs text-slate-500 mt-1">Lower = stricter face matching. Higher = more lenient. Applied on next run.</p>
            </div>

            <button onClick={save} disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-black hover:bg-brand-400 disabled:opacity-40 transition-all">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
