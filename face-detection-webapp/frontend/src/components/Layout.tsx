import { useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ScanFace, Upload, Menu, X, Server, Clock,
  CheckCircle2, XCircle, Pause, Loader2, ImageIcon,
  ChevronRight, Settings, GripVertical, Trash2, Zap,
} from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import { jobsApi, type JobSummary } from "../api/client";
import BackendSetup from "./BackendSetup";

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 300;

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-400",
    processing: "bg-brand-400 animate-pulse",
    paused: "bg-amber-400",
    stopped: "bg-red-400",
    pending: "bg-slate-400",
    failed: "bg-red-400",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status] ?? colors.pending}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-emerald-400", label: "Done" },
    processing: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: "text-brand-400", label: "Running" },
    paused: { icon: <Pause className="w-3.5 h-3.5" />, color: "text-amber-400", label: "Paused" },
    stopped: { icon: <XCircle className="w-3.5 h-3.5" />, color: "text-red-400", label: "Stopped" },
    pending: { icon: <Clock className="w-3.5 h-3.5" />, color: "text-slate-400", label: "Pending" },
    failed: { icon: <XCircle className="w-3.5 h-3.5" />, color: "text-red-400", label: "Failed" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.color}`}>{s.icon}{s.label}</span>;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Drag handle for resizable panels */
function ResizeHandle({ onDrag, side }: { onDrag: (delta: number) => void; side: "left" | "right" }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = side === "left" ? ev.clientX - lastX.current : lastX.current - ev.clientX;
      lastX.current = ev.clientX;
      onDrag(delta);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className="hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center group hover:bg-brand-500/10 transition-colors"
      title="Drag to resize"
    >
      <GripVertical className="w-3 h-3 text-slate-700 group-hover:text-brand-400 transition-colors" />
    </div>
  );
}

function Sidebar({ open, onClose, width }: { open: boolean; onClose: () => void; width: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: recentJobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => jobsApi.list().then((r) => r.data),
    refetchInterval: 5000,
  });

  const openJob = useCallback((job: JobSummary) => {
    if (job.status === "completed" || job.status === "stopped") {
      navigate(`/results/${job.id}`);
    } else {
      navigate(`/processing/${job.id}`);
    }
    onClose();
  }, [navigate, onClose]);

  const isHome = location.pathname === "/";

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <aside
        style={{ width }}
        className={`fixed lg:relative top-0 left-0 z-50 lg:z-auto h-full bg-dark-800 border-r border-white/5 flex flex-col transition-transform duration-300 ease-out shrink-0
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/5 shrink-0">
          <button onClick={() => { navigate("/"); onClose(); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="p-1.5 rounded-lg bg-brand-500/10">
              <ScanFace className="w-5 h-5 text-brand-400" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">Face Gallery</span>
          </button>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload button */}
        <div className="px-3 py-3 border-b border-white/5 shrink-0">
          <button
            onClick={() => { navigate("/"); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${isHome
                ? "bg-brand-500/15 text-brand-300 border border-brand-500/30"
                : "text-slate-300 hover:bg-white/5 border border-transparent"
              }`}
          >
            <Upload className="w-4 h-4" />
            Upload Photos
          </button>
        </div>

        {/* Jobs list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-3 py-2">
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sessions</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {recentJobs?.map((job) => {
                const isActive = location.pathname.includes(job.id);
                return (
                  <div key={job.id} className={`flex items-center rounded-lg transition-all group
                    ${isActive ? "bg-white/8 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                    <button onClick={() => openJob(job)}
                      className="flex-1 flex items-center gap-2.5 px-2.5 py-2.5 text-left min-w-0">
                      <StatusDot status={job.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs truncate">{job.id.slice(0, 8)}</span>
                          <StatusBadge status={job.status} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ImageIcon className="w-3 h-3 text-slate-600" />
                          <span className="text-xs text-slate-600">{job.total_images} imgs · {timeAgo(job.created_at)}</span>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm("Delete this session and all its data?")) return;
                        await jobsApi.deleteJob(job.id);
                        queryClient.invalidateQueries({ queryKey: ["jobs"] });
                        if (isActive) navigate("/");
                      }}
                      className="p-1.5 mr-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {(!recentJobs || recentJobs.length === 0) && (
                <p className="px-2.5 py-4 text-xs text-slate-600 text-center">No sessions yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="px-3 py-2 border-t border-white/5 shrink-0 space-y-1">
          <PerfModeToggle />
          <BackendUrlButton />
        </div>
      </aside>
    </>
  );
}

function PerfModeToggle() {
  const perfMode = useSettingsStore((s) => s.performanceMode);
  const setPerformanceMode = useSettingsStore((s) => s.setPerformanceMode);

  return (
    <button
      onClick={() => setPerformanceMode(!perfMode)}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all
        ${perfMode ? "text-amber-400 hover:bg-amber-500/10" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
    >
      <Zap className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left">Performance</span>
      <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${perfMode ? "bg-amber-500" : "bg-white/10"}`}>
        <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${perfMode ? "translate-x-3.5" : "translate-x-0"}`} />
      </div>
    </button>
  );
}

function BackendUrlButton() {
  const backendUrl = useSettingsStore((s) => s.backendUrl);
  const [showSetup, setShowSetup] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowSetup(true)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all group"
      >
        <Server className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate font-mono flex-1 text-left">{backendUrl ?? "not configured"}</span>
        <Settings className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
      <AnimatePresence>
        {showSetup && <BackendSetup onDone={() => setShowSetup(false)} />}
      </AnimatePresence>
    </>
  );
}

export { ResizeHandle, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT };

export default function Layout({ children }: { children: React.ReactNode }) {
  const backendUrl = useSettingsStore((s) => s.backendUrl);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(!backendUrl);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + delta)));
  }, []);

  return (
    <div className="h-screen flex overflow-hidden bg-dark-900">
      <AnimatePresence>
        {showSetup && <BackendSetup onDone={() => setShowSetup(false)} />}
      </AnimatePresence>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={sidebarWidth} />
      <ResizeHandle onDrag={handleSidebarResize} side="left" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-white/5 bg-dark-800/80 backdrop-blur shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white p-1">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-brand-400" />
            <span className="font-bold text-white text-sm">Face Gallery</span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
