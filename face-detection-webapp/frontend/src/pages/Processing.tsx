import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanFace, SortAsc, AlertTriangle, CheckCircle2, Loader2, XCircle,
  ChevronDown, ChevronUp, X,
} from "lucide-react";
import { useJobWS } from "../hooks/useJobWS";
import { useJobStore } from "../store/jobStore";
import { useSettingsStore } from "../store/settingsStore";
import { jobsApi } from "../api/client";

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
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
  const BASE = useSettingsStore((s) => s.httpBase());

  const { status, step, step1Progress, step2Progress, liveFaces, wsEvents, setStatus } = useJobStore();
  useJobWS(jobId ?? null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const notifications = wsEvents.filter((e) => e.type === "notification");

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

  useEffect(() => {
    if (!jobId) return;
    jobsApi.start(jobId).catch(() => {});
    setStatus("processing");
  }, [jobId]);

  const handleCancel = async () => {
    if (!jobId || !window.confirm("Cancel and delete this job? All uploaded images, detected faces, and results will be permanently removed.")) return;
    setCancelling(true);
    try {
      await jobsApi.deleteJob(jobId);
      navigate("/");
    } catch {
      setCancelling(false);
    }
  };

  const isDone = status === "completed";
  const isStopped = status === "stopped";

  const step1Pct = step1Progress.total > 0
    ? Math.round((step1Progress.processed / step1Progress.total) * 100) : 0;
  const step2Pct = step2Progress.total > 0
    ? Math.round((step2Progress.processed / step2Progress.total) * 100) : 0;

  return (
    <div className="h-full flex flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-4 mt-4 sm:mt-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-2xl font-bold text-white mb-1">Processing Photos</h1>
          <p className="text-slate-500 text-xs font-mono">{jobId}</p>
        </motion.div>

        {/* Status banner */}
        <AnimatePresence mode="wait">
          {isDone && (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-300 font-semibold text-sm">Done! Redirecting in {countdown}s...</span>
            </motion.div>
          )}
          {isStopped && (
            <motion.div key="stopped" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-300 font-semibold text-sm">Cancelled.</span>
              <button onClick={() => navigate("/")} className="underline text-red-300 hover:text-red-200 text-xs ml-1">
                Back to home
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card p-5 space-y-4">
          {/* Step 1 */}
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${step >= 1 ? "bg-brand-500/20" : "bg-white/5"}`}>
              <ScanFace className={`w-4 h-4 ${step >= 1 ? "text-brand-400" : "text-slate-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${step >= 1 ? "text-white" : "text-slate-500"}`}>Finding faces</span>
                <span className="text-xs text-slate-400 tabular-nums">{step1Progress.processed}/{step1Progress.total} · {step1Pct}%</span>
              </div>
              <ProgressBar value={step1Progress.processed} max={step1Progress.total} color="bg-brand-500" />
              {step === 1 && step1Progress.currentFile && (
                <p className="mt-1 text-xs text-slate-500 truncate">{step1Progress.currentFile}</p>
              )}
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* Step 2 */}
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${step >= 2 ? "bg-purple-500/20" : "bg-white/5"}`}>
              <SortAsc className={`w-4 h-4 ${step >= 2 ? "text-purple-400" : "text-slate-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${step >= 2 ? "text-white" : "text-slate-500"}`}>Sorting by person</span>
                <span className="text-xs text-slate-400 tabular-nums">{step2Progress.processed}/{step2Progress.total} · {step2Pct}%</span>
              </div>
              <ProgressBar value={step2Progress.processed} max={step2Progress.total} color="bg-purple-500" />
              {step === 2 && step2Progress.currentFile && (
                <p className="mt-1 text-xs text-slate-500 truncate">{step2Progress.currentFile}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Cancel button */}
        {!isDone && !isStopped && (
          <div className="flex items-center justify-center">
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleCancel} disabled={cancelling}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/5 border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 text-sm font-semibold transition-all disabled:opacity-40">
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              {cancelling ? "Cancelling..." : "Cancel & Delete"}
            </motion.button>
          </div>
        )}

        {/* Live faces */}
        <AnimatePresence>
          {liveFaces.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <ScanFace className="w-3.5 h-3.5 text-brand-400" />
                <span className="text-xs font-medium text-white">Faces found ({liveFaces.length})</span>
                {step === 1 && <Loader2 className="w-3 h-3 text-slate-500 animate-spin ml-1" />}
              </div>
              <div className="flex flex-wrap gap-2">
                {liveFaces.map((face, i) => (
                  <motion.div key={face.id}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-brand-500/40">
                      <img src={`${BASE}${face.url}`} alt={`Person ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-dark-800 border border-brand-500/30 flex items-center justify-center text-xs text-brand-400 font-bold">
                      {i + 1}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications */}
        <AnimatePresence>
          {notifications.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="card overflow-hidden">
              <button onClick={() => setNotifOpen(!notifOpen)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-medium text-white">Notifications ({notifications.length})</span>
                </div>
                {notifOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                    className="overflow-hidden border-t border-white/5">
                    <div className="max-h-36 overflow-y-auto divide-y divide-white/5">
                      {notifications.map((n, i) => {
                        if (n.type !== "notification") return null;
                        return (
                          <div key={i} className="flex items-start gap-2 px-4 py-2">
                            <span className={`text-xs mt-0.5 font-medium uppercase tracking-wide ${n.level === "error" ? "text-red-400" : n.level === "warning" ? "text-amber-400" : "text-slate-400"}`}>
                              {n.level}
                            </span>
                            <span className="text-xs text-slate-300">{n.message}</span>
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
