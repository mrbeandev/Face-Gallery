import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Square, ChevronDown, ChevronUp,
  ScanFace, SortAsc, AlertTriangle, CheckCircle2, Loader2, XCircle,
} from "lucide-react";
import { useJobWS } from "../hooks/useJobWS";
import { useJobStore } from "../store/jobStore";
import { jobsApi } from "../api/client";

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="relative h-2.5 rounded-full bg-white/5 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ ease: "easeOut", duration: 0.4 }}
      />
    </div>
  );
}

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const { status, step, step1Progress, step2Progress, liveFaces, wsEvents, setStatus } = useJobStore();
  useJobWS(jobId ?? null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const notifications = wsEvents.filter((e) => e.type === "notification");

  // Auto-redirect when done
  useEffect(() => {
    if (status === "completed" && countdown === null) {
      setCountdown(3);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c !== null && c <= 1) {
            clearInterval(countdownRef.current!);
            navigate(`/results/${jobId}`);
            return null;
          }
          return c !== null ? c - 1 : null;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status, jobId, navigate]);

  // Start job automatically on mount
  useEffect(() => {
    if (!jobId) return;
    jobsApi.start(jobId).catch(() => {});
    setStatus("processing");
  }, [jobId]);

  const handlePause = async () => {
    if (!jobId) return;
    await jobsApi.pause(jobId);
  };

  const handleStop = async () => {
    if (!jobId || !window.confirm("Stop processing? Partial results will be available.")) return;
    await jobsApi.stop(jobId);
  };

  const isPaused = status === "paused";
  const isStopped = status === "stopped";
  const isDone = status === "completed";
  const isActive = status === "processing";

  const step1Pct = step1Progress.total > 0
    ? Math.round((step1Progress.processed / step1Progress.total) * 100) : 0;
  const step2Pct = step2Progress.total > 0
    ? Math.round((step2Progress.processed / step2Progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-dark-900 p-6 flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-6 mt-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Processing Photos</h1>
          <p className="text-slate-400 text-sm font-mono">Job: {jobId}</p>
        </motion.div>

        {/* Status banner */}
        <AnimatePresence mode="wait">
          {isDone && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20"
            >
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span className="text-emerald-300 font-semibold">
                Done! Redirecting to results in {countdown}s…
              </span>
            </motion.div>
          )}
          {isStopped && (
            <motion.div
              key="stopped"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20"
            >
              <XCircle className="w-6 h-6 text-red-400" />
              <span className="text-red-300 font-semibold">Processing stopped.</span>
              <button
                onClick={() => navigate(`/results/${jobId}`)}
                className="ml-2 underline text-red-300 hover:text-red-200 text-sm"
              >
                View partial results →
              </button>
            </motion.div>
          )}
          {isPaused && (
            <motion.div
              key="paused"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20"
            >
              <Pause className="w-5 h-5 text-amber-400" />
              <span className="text-amber-300 font-semibold">Paused — click Resume to continue</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step indicators + progress */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card p-6 space-y-6"
        >
          {/* Step 1 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${step >= 1 ? "bg-brand-500/20" : "bg-white/5"}`}>
                <ScanFace className={`w-5 h-5 ${step >= 1 ? "text-brand-400" : "text-slate-500"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium ${step >= 1 ? "text-white" : "text-slate-500"}`}>
                    Step 1 — Finding unique faces
                  </span>
                  <span className="text-sm text-slate-400 tabular-nums">
                    {step1Progress.processed}/{step1Progress.total} · {step1Pct}%
                  </span>
                </div>
                <ProgressBar value={step1Progress.processed} max={step1Progress.total} color="bg-brand-500" />
                {step === 1 && step1Progress.currentFile && (
                  <p className="mt-1.5 text-xs text-slate-500 truncate">
                    Processing: <span className="text-slate-400">{step1Progress.currentFile}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/5" />

          {/* Step 2 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${step >= 2 ? "bg-purple-500/20" : "bg-white/5"}`}>
                <SortAsc className={`w-5 h-5 ${step >= 2 ? "text-purple-400" : "text-slate-500"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium ${step >= 2 ? "text-white" : "text-slate-500"}`}>
                    Step 2 — Sorting photos by person
                  </span>
                  <span className="text-sm text-slate-400 tabular-nums">
                    {step2Progress.processed}/{step2Progress.total} · {step2Pct}%
                  </span>
                </div>
                <ProgressBar value={step2Progress.processed} max={step2Progress.total} color="bg-purple-500" />
                {step === 2 && step2Progress.currentFile && (
                  <p className="mt-1.5 text-xs text-slate-500 truncate">
                    Processing: <span className="text-slate-400">{step2Progress.currentFile}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Controls */}
        {!isDone && !isStopped && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="flex items-center justify-center gap-3"
          >
            {/* Pause / Resume */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePause}
              disabled={!isActive && !isPaused}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all
                ${isPaused
                  ? "bg-brand-500 text-black hover:bg-brand-400"
                  : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-40"
                }`}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? "Resume" : "Pause"}
            </motion.button>

            {/* Stop */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleStop}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/10 hover:border-red-500/20 font-semibold transition-all"
            >
              <Square className="w-4 h-4" />
              Stop
            </motion.button>
          </motion.div>
        )}

        {/* Live face discovery strip */}
        <AnimatePresence>
          {liveFaces.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="card p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <ScanFace className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-medium text-white">
                  Unique faces found ({liveFaces.length})
                </span>
                {isActive && step === 1 && <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin ml-1" />}
              </div>
              <div className="flex flex-wrap gap-3">
                {liveFaces.map((face, i) => (
                  <motion.div
                    key={face.id}
                    initial={{ opacity: 0, scale: 0.6, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative group"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-brand-500/40 group-hover:border-brand-400 transition-colors">
                      <img
                        src={`http://localhost:8000${face.url}`}
                        alt={`Person ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-dark-800 border border-brand-500/30 flex items-center justify-center text-[9px] text-brand-400 font-bold">
                      {i + 1}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notification panel */}
        <AnimatePresence>
          {notifications.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="card overflow-hidden"
            >
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-white">
                    Notifications ({notifications.length})
                  </span>
                </div>
                {notifOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                    className="overflow-hidden border-t border-white/5"
                  >
                    <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
                      {notifications.map((n, i) => {
                        if (n.type !== "notification") return null;
                        return (
                          <div key={i} className="flex items-start gap-3 px-5 py-3">
                            <span className={`text-xs mt-0.5 font-medium uppercase tracking-wide ${n.level === "error" ? "text-red-400" : n.level === "warning" ? "text-amber-400" : "text-slate-400"}`}>
                              {n.level}
                            </span>
                            <span className="text-sm text-slate-300">{n.message}</span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
