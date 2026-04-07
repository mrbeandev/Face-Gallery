import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, ImageIcon, FileArchive, AlertTriangle, Loader2, ScanFace } from "lucide-react";
import { jobsApi } from "../api/client";

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/tiff"];
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".zip"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(file: File) {
  if (file.name.endsWith(".zip")) return <FileArchive className="w-5 h-5 text-brand-400" />;
  return <ImageIcon className="w-5 h-5 text-slate-400" />;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[], fileRejections: { file: File }[]) => {
    setError(null);

    // Client-side filter: only images and zips
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    noClick: false,
  });

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));
  const clearRejected = () => setRejected([]);

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-dark-900">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20">
            <ScanFace className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">FaceSort</h1>
        </div>
        <p className="text-slate-400 text-lg">Upload photos and we'll group them by person automatically</p>
      </motion.div>

      <div className="w-full max-w-2xl space-y-4">
        {/* Drop zone */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          {...getRootProps()}
          className={`relative rounded-3xl border-2 border-dashed p-12 cursor-pointer transition-all duration-300 text-center
            ${isDragActive
              ? "border-brand-400 bg-brand-500/5 scale-[1.01]"
              : "border-white/10 hover:border-white/20 bg-dark-800/50 hover:bg-dark-800"
            }`}
        >
          <input {...getInputProps()} />

          {/* Animated background glow when dragging */}
          <AnimatePresence>
            {isDragActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-3xl bg-brand-500/5 pointer-events-none"
              />
            )}
          </AnimatePresence>

          <div className="flex flex-col items-center gap-4">
            <motion.div
              animate={{ scale: isDragActive ? 1.2 : 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              className={`p-5 rounded-2xl transition-colors ${isDragActive ? "bg-brand-500/20" : "bg-white/5"}`}
            >
              <Upload className={`w-10 h-10 ${isDragActive ? "text-brand-400" : "text-slate-400"}`} />
            </motion.div>

            <div>
              <p className="text-xl font-semibold text-white mb-1">
                {isDragActive ? "Drop your files here" : "Drag & drop files here"}
              </p>
              <p className="text-slate-400">or click to browse</p>
            </div>

            <div className="flex gap-3 flex-wrap justify-center">
              {["JPG", "PNG", "WEBP", "GIF", "BMP", "TIFF", "ZIP"].map((ext) => (
                <span key={ext} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400 font-mono">
                  .{ext.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Rejected files warning */}
        <AnimatePresence>
          {rejected.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 font-medium text-sm mb-1">
                      {rejected.length} file{rejected.length > 1 ? "s" : ""} skipped (unsupported format)
                    </p>
                    <p className="text-amber-400/70 text-xs">{rejected.join(", ")}</p>
                  </div>
                </div>
                <button onClick={clearRejected} className="text-amber-400/50 hover:text-amber-400 transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File list */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="card"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">
                  {files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(totalSize)}
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {files.map((file) => (
                  <motion.div
                    key={file.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/2 group"
                  >
                    {/* Thumbnail for images */}
                    {!file.name.endsWith(".zip") ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 shrink-0">
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                        {fileIcon(file)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      onClick={() => removeFile(file.name)}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm text-center"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Upload button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleUpload}
          disabled={!files.length || uploading}
          className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-base"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              Upload & Start Analysis
              {files.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-black/20 text-xs">
                  {files.length}
                </span>
              )}
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
