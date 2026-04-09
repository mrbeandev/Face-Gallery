import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, X, ImageIcon, FileArchive, AlertTriangle,
  Loader2, ScanFace, Settings,
} from "lucide-react";
import { jobsApi } from "../api/client";
import SettingsPopover from "../components/SettingsPopover";

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/tiff"];
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".zip"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onDrop = useCallback((accepted: File[], fileRejections: { file: File }[]) => {
    setError(null);
    const valid: File[] = [];
    const bad: string[] = [];
    accepted.forEach((f) => {
      const ext = "." + f.name.split(".").pop()!.toLowerCase();
      if (ALLOWED.includes(f.type) || f.name.endsWith(".zip") || ALLOWED_EXT.includes(ext)) {
        valid.push(f);
      } else {
        bad.push(f.name);
      }
    });
    fileRejections.forEach(({ file }) => bad.push(file.name));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !names.has(f.name))];
    });
    if (bad.length) setRejected((prev) => [...prev, ...bad]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const res = await jobsApi.upload(files);
      navigate(`/processing/${res.data.job_id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Upload failed. Please try again.");
      setUploading(false);
    }
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <ScanFace className="w-7 h-7 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Face Gallery</h1>
        </div>
        <p className="text-slate-400 text-sm">Upload photos and we'll group them by person</p>
      </motion.div>

      <div className="w-full max-w-lg space-y-3">
        {/* Drop zone */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          {...getRootProps()}
          className={`relative rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-all duration-300 text-center
            ${isDragActive
              ? "border-brand-400 bg-brand-500/5 scale-[1.01]"
              : "border-white/10 hover:border-white/20 bg-dark-800/50 hover:bg-dark-800"
            }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ scale: isDragActive ? 1.15 : 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              className={`p-4 rounded-xl transition-colors ${isDragActive ? "bg-brand-500/20" : "bg-white/5"}`}
            >
              <Upload className={`w-8 h-8 ${isDragActive ? "text-brand-400" : "text-slate-400"}`} />
            </motion.div>
            <div>
              <p className="text-lg font-semibold text-white mb-0.5">
                {isDragActive ? "Drop files here" : "Drag & drop files"}
              </p>
              <p className="text-slate-500 text-sm">or click to browse</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {["JPG", "PNG", "WEBP", "ZIP"].map((ext) => (
                <span key={ext} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-slate-500 font-mono">
                  .{ext.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Rejected */}
        <AnimatePresence>
          {rejected.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-amber-300 text-xs truncate">
                    {rejected.length} file{rejected.length > 1 ? "s" : ""} skipped
                  </p>
                </div>
                <button onClick={() => setRejected([])} className="text-amber-400/50 hover:text-amber-400 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File list */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="card">
              <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(totalSize)}
                </span>
                <button onClick={() => setFiles([])} className="text-xs text-slate-600 hover:text-red-400 transition-colors">
                  Clear
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-white/5">
                {files.map((file) => (
                  <motion.div
                    key={file.name}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/2 group"
                  >
                    {!file.name.endsWith(".zip") ? (
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 shrink-0">
                        <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                        <FileArchive className="w-4 h-4 text-brand-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{file.name}</p>
                      <p className="text-xs text-slate-600">{formatBytes(file.size)}</p>
                    </div>
                    <button onClick={() => removeFile(file.name)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleUpload}
          disabled={!files.length || uploading}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload & Analyze
              {files.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-black/20 text-xs">{files.length}</span>
              )}
            </>
          )}
        </motion.button>

        {/* Settings link */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Processing Settings
        </button>
      </div>

      <AnimatePresence>
        {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
