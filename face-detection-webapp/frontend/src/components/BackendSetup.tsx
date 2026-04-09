import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Server, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";

export default function BackendSetup({ onDone }: { onDone: () => void }) {
  const setBackendUrl = useSettingsStore((s) => s.setBackendUrl);
  const [url, setUrl] = useState("http://localhost:8000");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<"ok" | "fail" | null>(null);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const clean = url.replace(/\/+$/, "");
      const res = await fetch(`${clean}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setResult("ok");
        setBackendUrl(clean);
        setTimeout(onDone, 600);
      } else {
        setResult("fail");
      }
    } catch {
      setResult("fail");
    } finally {
      setTesting(false);
    }
  };

  const skip = () => {
    setBackendUrl(url.replace(/\/+$/, ""));
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-dark-900/95 backdrop-blur-xl flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25 }}
        className="w-full max-w-md rounded-2xl bg-dark-800 border border-white/10 p-8 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <Server className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Connect to Backend</h2>
            <p className="text-sm text-slate-400">Enter the URL where your backend is running</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
              Backend URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setResult(null); }}
              onKeyDown={(e) => e.key === "Enter" && test()}
              placeholder="http://localhost:8000"
              className="w-full px-4 py-3 rounded-xl bg-dark-700 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30 font-mono text-sm transition-all"
            />
          </div>

          <AnimatePresence mode="wait">
            {result === "ok" && (
              <motion.div key="ok"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">Connected successfully</span>
              </motion.div>
            )}
            {result === "fail" && (
              <motion.div key="fail"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-300">Could not connect. Check the URL and ensure the backend is running.</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-2">
            <button onClick={test} disabled={testing || !url.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {testing ? "Testing..." : "Test & Connect"}
            </button>
            <button onClick={skip} className="btn-ghost text-sm">Skip</button>
          </div>

          <p className="text-xs text-slate-600 text-center">
            You can change this later from the sidebar
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
