import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, useNodesState, useEdgesState,
  BackgroundVariant, ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutGrid, Share2, ArrowLeft, X, Users, ImageIcon,
  Loader2, ChevronLeft, ChevronRight, Eye, EyeOff,
  Maximize2, Minimize2, Check, AlertCircle, ChevronDown, RotateCcw,
  Filter, CheckSquare, Square, EyeOff as EyeOffIcon, Pencil, GitMerge as Merge,
  Ban, Trash2, Plus, Upload, FileArchive,
} from "lucide-react";
import { jobsApi, type UniqueFace, type ImageNode } from "../api/client";
import { useSettingsStore } from "../store/settingsStore";
import { ResizeHandle } from "../components/Layout";

const FILTER_MIN = 240;
const FILTER_MAX = 450;
const FILTER_DEFAULT = 280;

/** Convert a /static/uploads/... or /static/results/... URL to a /thumb/... URL */
function thumbUrl(staticUrl: string, size = 200): string {
  const path = staticUrl.replace(/^\/static\//, "");
  return `/thumb/${path}?size=${size}`;
}

const PERSON_COLORS = [
  "#eab308", "#8b5cf6", "#06b6d4", "#10b981", "#f43f5e",
  "#f97316", "#3b82f6", "#ec4899", "#14b8a6", "#84cc16",
];

/** Display name for a face: user-assigned name or "Person N" fallback */
function faceName(face: UniqueFace, index: number) {
  return face.name?.trim() || `Person ${index + 1}`;
}

/** Inline-editable face name tag */
function FaceNameTag({
  face, index, jobId, color, onRenamed, className,
}: {
  face: UniqueFace;
  index: number;
  jobId: string;
  color: string;
  onRenamed: () => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(face.name ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    setSaving(true);
    try {
      await jobsApi.renameFace(jobId, face.id, value);
      onRenamed();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        placeholder={`Person ${index + 1}`}
        className={`bg-transparent border-b border-dashed outline-none text-center ${className ?? ""}`}
        style={{ color, borderColor: `${color}60`, width: Math.max(60, value.length * 7 + 20) }}
      />
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); setValue(face.name ?? ""); }}
      className={`group/tag inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-text ${className ?? ""}`}
      title="Click to rename"
    >
      <span style={{ color }}>{faceName(face, index)}</span>
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/tag:opacity-60 transition-opacity" style={{ color }} />
    </button>
  );
}

// ------------------------------------------------------------------ //
// Photo popup with face bounding box overlay + manual assignment      //
// ------------------------------------------------------------------ //
function PhotoPopup({
  image, allFaces, jobId, faceColorMap, onClose, onAssignmentChange,
}: {
  image: ImageNode;
  allFaces: UniqueFace[];
  jobId: string;
  faceColorMap: Map<string, string>;
  onClose: () => void;
  onAssignmentChange: () => void;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const [showFaces, setShowFaces] = useState(true);
  const [imgSize, setImgSize] = useState<{ w: number; h: number; nw: number; nh: number } | null>(null);
  const [pendingFaceId, setPendingFaceId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const assignedFaceIds = useMemo(
    () => new Set(image.faces.map((f) => f.unique_face_id)),
    [image.faces]
  );

  useEffect(() => {
    if (!showFaces || !imgSize || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const { nw, nh, w: origW, h: origH } = imgSize;
    const scaleX = nw / origW;
    const scaleY = nh / origH;
    ctx.clearRect(0, 0, nw, nh);

    image.faces.forEach((f) => {
      if (!f.face_box) return;
      const [top, right, bottom, left] = f.face_box;
      const color = faceColorMap.get(f.unique_face_id) ?? "#eab308";
      const x = left * scaleX;
      const y = top * scaleY;
      const bw = (right - left) * scaleX;
      const bh = (bottom - top) * scaleY;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.strokeRect(x, y, bw, bh);

      ctx.shadowBlur = 0;
      const fIdx = [...faceColorMap.keys()].indexOf(f.unique_face_id);
      const matchedFace = allFaces.find((af) => af.id === f.unique_face_id);
      const label = matchedFace ? faceName(matchedFace, fIdx) : `Person ${fIdx + 1}`;
      ctx.font = "bold 13px system-ui";
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = color + "cc";
      ctx.fillRect(x - 1, y - 22, textW + 10, 20);
      ctx.fillStyle = "#000";
      ctx.fillText(label, x + 4, y - 7);
    });
  }, [showFaces, imgSize, image, faceColorMap]);

  const handleImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    setImgSize({ w: el.naturalWidth, h: el.naturalHeight, nw: el.width, nh: el.height });
  };

  const handleToggle = async (face: UniqueFace) => {
    if (pendingFaceId) return;
    setPendingFaceId(face.id);
    try {
      if (assignedFaceIds.has(face.id)) {
        await jobsApi.removeMatch(jobId, image.id, face.id);
      } else {
        await jobsApi.addMatch(jobId, image.id, face.id);
      }
      onAssignmentChange();
    } finally {
      setPendingFaceId(null);
    }
  };

  const hasFaceBoxes = image.faces.some((f) => f.face_box);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-4xl w-full max-h-[90vh] flex flex-col gap-3 overflow-y-auto"
      >
        <div className="flex items-center justify-between sticky top-0 bg-transparent">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">{image.filename}</span>
            <span className="text-slate-500 text-xs">· {image.faces.length} face{image.faces.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasFaceBoxes && (
              <button onClick={() => setShowFaces((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                  ${showFaces ? "bg-brand-500/20 border-brand-500/40 text-brand-300" : "bg-white/5 border-white/10 text-slate-400"}`}
              >
                {showFaces ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {showFaces ? "On" : "Off"}
              </button>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative inline-block self-center">
          <img ref={imgRef} src={`${BASE}${image.image_url}`} alt={image.filename}
            className="max-h-[55vh] max-w-full rounded-xl object-contain shadow-2xl block" onLoad={handleImgLoad} />
          {showFaces && hasFaceBoxes && (
            <canvas ref={canvasRef} width={imgSize?.nw ?? 0} height={imgSize?.nh ?? 0}
              className="absolute inset-0 rounded-xl pointer-events-none" style={{ width: imgSize?.nw, height: imgSize?.nh }} />
          )}
        </div>

        {allFaces.length > 0 && (
          <div className="rounded-xl bg-dark-800/90 border border-white/10 p-3 backdrop-blur">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assign faces</p>
            <div className="flex gap-2 flex-wrap">
              {allFaces.map((f, i) => {
                const color = faceColorMap.get(f.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
                const isAssigned = assignedFaceIds.has(f.id);
                const isPending = pendingFaceId === f.id;
                return (
                  <button key={f.id} onClick={() => handleToggle(f)} disabled={!!pendingFaceId}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all select-none
                      ${isAssigned ? "opacity-100" : "opacity-50 hover:opacity-80 bg-white/5 border-white/10"}
                      ${isPending ? "cursor-wait" : "cursor-pointer"}`}
                    style={isAssigned ? { background: `${color}18`, borderColor: `${color}55` } : {}}
                  >
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden"
                        style={{ boxShadow: isAssigned ? `0 0 0 2px ${color}` : "0 0 0 1px rgba(255,255,255,0.1)" }}>
                        <img src={`${BASE}${f.face_image_url}`} alt="" className="w-full h-full object-cover" />
                      </div>
                      {isPending && (
                        <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 animate-spin text-white" />
                        </div>
                      )}
                      {isAssigned && !isPending && (
                        <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                          style={{ background: color }}>
                          <Check className="w-2 h-2 text-black" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-semibold truncate max-w-[64px]" style={{ color: isAssigned ? color : "#64748b" }}>{faceName(f, i)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ //
// Lightbox                                                             //
// ------------------------------------------------------------------ //
function Lightbox({
  images, index, onClose, onPrev, onNext,
}: {
  images: { url: string; name: string }[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
      <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-4 text-white/60 hover:text-white p-2">
        <ChevronLeft className="w-7 h-7" />
      </button>
      <motion.div key={index} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-full">
        <img src={`${BASE}${images[index].url}`} alt={images[index].name}
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" />
        <p className="text-center text-white/60 text-xs mt-2">{images[index].name} · {index + 1}/{images.length}</p>
      </motion.div>
      <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-4 text-white/60 hover:text-white p-2">
        <ChevronRight className="w-7 h-7" />
      </button>
    </motion.div>
  );
}

// ------------------------------------------------------------------ //
// List View                                                            //
// ------------------------------------------------------------------ //
function ListView({ faces, faceColorMap, jobId, onRefetch }: { faces: UniqueFace[]; faceColorMap: Map<string, string>; jobId: string; onRefetch: () => void }) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const [lightbox, setLightbox] = useState<{ faceIdx: number; imgIdx: number } | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
        {faces.map((face, fi) => {
          const color = faceColorMap.get(face.id) ?? PERSON_COLORS[fi % PERSON_COLORS.length];
          const images = face.matches.map((m) => ({ url: m.image_url, name: m.filename }));
          return (
            <motion.div key={face.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: fi * 0.04 }} className="card flex flex-col">
              <div className="p-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${color}20` }}>
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ boxShadow: `0 0 0 2px ${color}60` }}>
                  <img src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} alt="Face" className="w-full h-full object-cover" />
                </div>
                <div>
                  <FaceNameTag face={face} index={fi} jobId={jobId} color={color} onRenamed={onRefetch} className="font-semibold text-sm" />
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ImageIcon className="w-3 h-3" style={{ color }} />
                    <span className="text-xs font-medium" style={{ color }}>
                      {face.matches.length} photo{face.matches.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
              {face.matches.length > 0 ? (
                <div className="flex gap-1.5 p-2.5 overflow-x-auto">
                  {face.matches.map((m, mi) => (
                    <button key={m.image_id} onClick={() => setLightbox({ faceIdx: fi, imgIdx: mi })}
                      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden hover:ring-2 hover:ring-brand-400 transition-all">
                      <img src={`${BASE}${thumbUrl(m.image_url)}`} alt={m.filename} loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-4 text-slate-600 text-xs">No matches</div>
              )}
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence>
        {lightbox !== null && (
          <Lightbox
            images={faces[lightbox.faceIdx].matches.map((m) => ({ url: m.image_url, name: m.filename }))}
            index={lightbox.imgIdx}
            onClose={() => setLightbox(null)}
            onPrev={() => setLightbox((lb) => lb && { ...lb, imgIdx: (lb.imgIdx - 1 + faces[lb.faceIdx].matches.length) % faces[lb.faceIdx].matches.length })}
            onNext={() => setLightbox((lb) => lb && { ...lb, imgIdx: (lb.imgIdx + 1) % faces[lb.faceIdx].matches.length })}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------------ //
// Face Filter Panel                                                    //
// ------------------------------------------------------------------ //
type FilterMode = "gray" | "hide";

function FaceFilterPanel({
  faces, faceColorMap, selectedFaceIds, filterMode,
  onToggleFace, onSelectAll, onDeselectAll, onSetFilterMode,
  jobId, onRefetch,
}: {
  faces: UniqueFace[]; faceColorMap: Map<string, string>;
  selectedFaceIds: Set<string>; filterMode: FilterMode;
  onToggleFace: (id: string) => void; onSelectAll: () => void;
  onDeselectAll: () => void; onSetFilterMode: (mode: FilterMode) => void;
  jobId: string; onRefetch: () => void;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const allSelected = selectedFaceIds.size === faces.length;
  const noneSelected = selectedFaceIds.size === 0;

  return (
    <div className="rounded-xl bg-dark-800/90 border border-white/10 p-3 backdrop-blur h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-xs font-semibold text-white">Filter Faces</span>
        </div>
        <span className="text-xs text-slate-500">{selectedFaceIds.size}/{faces.length}</span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-2 shrink-0">
        <button onClick={() => onSetFilterMode("gray")}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border
            ${filterMode === "gray" ? "bg-white/10 border-white/20 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
          <Eye className="w-3.5 h-3.5" />Gray out
        </button>
        <button onClick={() => onSetFilterMode("hide")}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border
            ${filterMode === "hide" ? "bg-white/10 border-white/20 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
          <EyeOffIcon className="w-3.5 h-3.5" />Hide
        </button>
      </div>

      {/* Select all / Deselect all */}
      <div className="flex gap-1 mb-2 shrink-0">
        <button onClick={onSelectAll} disabled={allSelected}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30">
          <CheckSquare className="w-3.5 h-3.5" />All
        </button>
        <button onClick={onDeselectAll} disabled={noneSelected}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30">
          <Square className="w-3.5 h-3.5" />None
        </button>
      </div>

      {/* Face list */}
      <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
        {faces.map((face, i) => {
          const color = faceColorMap.get(face.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
          const selected = selectedFaceIds.has(face.id);
          const isDisabled = face.disabled;
          return (
            <div key={face.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all group/face
                ${isDisabled ? "opacity-30" : selected ? "bg-white/5" : "opacity-50 hover:opacity-80"}`}>
              <button onClick={() => onToggleFace(face.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0"
                  style={{ boxShadow: isDisabled ? "0 0 0 1px rgba(255,255,255,0.05)" : selected ? `0 0 0 2px ${color}` : "0 0 0 1px rgba(255,255,255,0.1)" }}>
                  <img src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block" style={{ color: isDisabled ? "#475569" : selected ? color : "#64748b" }}>
                    {faceName(face, i)}
                  </span>
                  <span className="text-xs text-slate-500">{face.matches.length} photos{isDisabled ? " · disabled" : ""}</span>
                </div>
              </button>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/face:opacity-100 transition-opacity">
                <button onClick={async () => { await jobsApi.toggleDisableFace(jobId, face.id); onRefetch(); }}
                  className={`p-1 rounded transition-colors ${isDisabled ? "text-emerald-400 hover:bg-emerald-500/10" : "text-amber-400 hover:bg-amber-500/10"}`}
                  title={isDisabled ? "Enable" : "Disable"}>
                  {isDisabled ? <Eye className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                </button>
                <button onClick={async () => {
                    if (!window.confirm(`Delete "${faceName(face, i)}"? This removes the face and all its matches permanently.`)) return;
                    await jobsApi.deleteFace(jobId, face.id); onRefetch();
                  }} className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors" title="Delete permanently">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => onToggleFace(face.id)} className="shrink-0">
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all
                  ${selected ? "border-brand-400 bg-brand-500" : "border-white/20"}`}>
                  {selected && <Check className="w-2 h-2 text-black" strokeWidth={3} />}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Merge Faces Modal                                                    //
// ------------------------------------------------------------------ //
function MergeFacesModal({
  faces, faceColorMap, jobId, onClose, onDone,
}: {
  faces: UniqueFace[]; faceColorMap: Map<string, string>;
  jobId: string; onClose: () => void; onDone: () => void;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const toggle = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (primaryId === id) setPrimaryId(next.size > 0 ? [...next][0] : null);
      } else {
        next.add(id);
        if (!primaryId) setPrimaryId(id);
      }
      return next;
    });
  };

  const doMerge = async () => {
    if (!primaryId || selection.size < 2) return;
    setMerging(true);
    try {
      const sourceIds = [...selection].filter((id) => id !== primaryId);
      await jobsApi.mergeFaces(jobId, primaryId, sourceIds, primaryId);
      onDone();
    } finally {
      setMerging(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[80vh] rounded-2xl bg-dark-800 border border-white/10 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-white">Merge Faces</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400">
          Select 2+ faces to merge into one. Pick which photo to keep as the display image.
        </p>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
          {faces.filter((f) => !f.disabled).map((face, i) => {
            const color = faceColorMap.get(face.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
            const checked = selection.has(face.id);
            const isPrimary = primaryId === face.id;
            return (
              <button key={face.id} onClick={() => toggle(face.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left
                  ${checked ? "bg-purple-500/10 border border-purple-500/30" : "border border-transparent hover:bg-white/5"}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0
                  ${checked ? "border-purple-400 bg-purple-500" : "border-white/20"}`}>
                  {checked && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                </div>
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0"
                  style={{ boxShadow: isPrimary ? `0 0 0 3px ${color}` : checked ? `0 0 0 2px ${color}50` : "0 0 0 1px rgba(255,255,255,0.1)" }}>
                  <img src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block" style={{ color: checked ? color : "#64748b" }}>{faceName(face, i)}</span>
                  <span className="text-xs text-slate-500">{face.matches.length} photos</span>
                </div>
                {checked && (
                  <div onClick={(e) => { e.stopPropagation(); setPrimaryId(face.id); }}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${isPrimary ? "bg-brand-500 text-black" : "bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10"}`}
                    title="Use this face as the display photo">
                    {isPrimary ? "Main" : "Set"}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-white/5 shrink-0">
          <button onClick={doMerge} disabled={selection.size < 2 || !primaryId || merging}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-500 text-white hover:bg-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
            {merging ? "Merging..." : `Merge ${selection.size} faces`}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}


// ------------------------------------------------------------------ //
// Graph building                                                       //
// ------------------------------------------------------------------ //
const PHOTO_W = 120;
const PHOTO_H = 142;
const PHOTO_GAP_X = 36;
const PHOTO_GAP_Y = 30;
const FACE_W = 88;
const FACE_H = 112;
const FACE_IMG_H = 68;
const FACE_GAP = 36;
const SECTION_GAP = 180;

function buildGraph(
  images: ImageNode[],
  faces: UniqueFace[],
  faceColorMap: Map<string, string>,
  onPhotoDoubleClick: (imgId: string) => void,
  BASE: string,
  selectedFaceIds: Set<string>,
  filterMode: FilterMode,
  perfMode: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const allSelected = selectedFaceIds.size === faces.length;

  // Determine which faces to show
  const visibleFaces = filterMode === "hide" && !allSelected
    ? faces.filter((f) => selectedFaceIds.has(f.id))
    : faces;

  const visibleFaceIds = new Set(visibleFaces.map((f) => f.id));

  // Determine which images to show
  const visibleImages = filterMode === "hide" && !allSelected
    ? images.filter((img) => img.faces.some((f) => visibleFaceIds.has(f.unique_face_id)))
    : images;

  // Photo grid
  const cols = Math.max(1, Math.ceil(Math.sqrt(visibleImages.length)));
  const rows = Math.ceil(visibleImages.length / cols);
  const gridW = cols * PHOTO_W + (cols - 1) * PHOTO_GAP_X;
  const gridH = rows * PHOTO_H + (rows - 1) * PHOTO_GAP_Y;
  const gridStartX = -gridW / 2;
  const gridStartY = 0;

  visibleImages.forEach((img, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = gridStartX + col * (PHOTO_W + PHOTO_GAP_X);
    const y = gridStartY + row * (PHOTO_H + PHOTO_GAP_Y);

    const hasFaceMatches = img.faces.some((f) => visibleFaceIds.has(f.unique_face_id));
    const topColor = hasFaceMatches
      ? faceColorMap.get(img.faces.find((f) => visibleFaceIds.has(f.unique_face_id))?.unique_face_id ?? "") ?? "transparent"
      : "transparent";

    // Determine opacity based on filter
    const isRelevant = allSelected || img.faces.some((f) => selectedFaceIds.has(f.unique_face_id));
    const nodeOpacity = filterMode === "gray" && !allSelected && !isRelevant ? 0.15 : 1;

    nodes.push({
      id: `photo-${img.id}`,
      position: { x, y },
      sourcePosition: "bottom" as const,
      targetPosition: "top" as const,
      data: {
        label: (
          <div className="flex flex-col items-center gap-0.5 select-none w-full h-full"
            onDoubleClick={() => onPhotoDoubleClick(img.id)}>
            <div className="w-[96px] h-[96px] rounded-lg overflow-hidden border border-white/10 shrink-0">
              <img src={`${BASE}${thumbUrl(img.image_url)}`} alt={img.filename} loading="lazy" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs text-slate-200 truncate max-w-[108px] text-center font-medium leading-tight mt-0.5">
              {img.filename}
            </span>
            <span className="text-xs text-slate-500">
              {img.faces.length > 0 ? `${img.faces.length} face${img.faces.length !== 1 ? "s" : ""}` : "no faces"}
            </span>
          </div>
        ),
      },
      style: {
        background: hasFaceMatches
          ? "linear-gradient(160deg, #161622 0%, #0e0e1c 100%)"
          : "linear-gradient(160deg, #111118 0%, #0a0a10 100%)",
        border: hasFaceMatches
          ? `1.5px solid ${topColor + "55"}`
          : "1.5px dashed rgba(255,255,255,0.1)",
        borderTop: hasFaceMatches ? `3px solid ${topColor}` : "1.5px dashed rgba(255,255,255,0.1)",
        borderRadius: "14px",
        width: PHOTO_W,
        height: PHOTO_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        opacity: nodeOpacity,
        boxShadow: perfMode ? "none" : (hasFaceMatches
          ? `0 0 16px ${topColor}18, 0 4px 20px rgba(0,0,0,0.5)`
          : "0 4px 16px rgba(0,0,0,0.4)"),
        padding: "8px 6px 6px",
        transition: perfMode ? "none" : "opacity 0.3s ease",
      },
    });
  });

  // Face row
  const faceRowW = visibleFaces.length * FACE_W + (visibleFaces.length - 1) * FACE_GAP;
  const faceRowStartX = -faceRowW / 2;
  const faceRowY = gridStartY + gridH + SECTION_GAP;

  visibleFaces.forEach((face, i) => {
    const color = faceColorMap.get(face.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
    const x = faceRowStartX + i * (FACE_W + FACE_GAP);
    const globalIdx = faces.indexOf(face);
    const isSelected = selectedFaceIds.has(face.id);
    const faceOpacity = filterMode === "gray" && !allSelected && !isSelected ? 0.15 : 1;

    nodes.push({
      id: `face-${face.id}`,
      position: { x, y: faceRowY },
      sourcePosition: "bottom" as const,
      targetPosition: "top" as const,
      data: {
        label: (
          <div className="select-none overflow-hidden" style={{
            width: FACE_W, height: FACE_H,
            display: "flex", flexDirection: "column",
            background: `linear-gradient(175deg, ${color}14 0%, #090910 60%)`,
            border: `2px solid ${color}60`,
            borderRadius: "16px 16px 10px 10px",
            boxShadow: perfMode ? "none" : `0 0 0 3px ${color}0d, 0 6px 24px ${color}28`,
          }}>
            <div style={{ flexShrink: 0, height: FACE_IMG_H, overflow: "hidden", borderRadius: "14px 14px 0 0" }}>
              <img src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div style={{ height: 2, flexShrink: 0, background: `linear-gradient(90deg, transparent, ${color}cc, transparent)` }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: "2px 4px" }}>
              <span style={{ color, fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1.2, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{faceName(face, globalIdx)}</span>
              <span style={{ color: "#475569", fontSize: 12, lineHeight: 1.2 }}>{face.matches.length} photo{face.matches.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        ),
      },
      style: {
        background: "transparent",
        border: "none",
        width: FACE_W,
        height: FACE_H,
        padding: 0,
        boxShadow: "none",
        opacity: faceOpacity,
        transition: perfMode ? "none" : "opacity 0.3s ease",
      },
    });
  });

  // Edges
  visibleImages.forEach((img) => {
    img.faces.forEach((fm) => {
      if (!visibleFaceIds.has(fm.unique_face_id)) return;
      const color = faceColorMap.get(fm.unique_face_id) ?? "#eab308";
      const isSelected = selectedFaceIds.has(fm.unique_face_id);
      const edgeOpacity = filterMode === "gray" && !allSelected && !isSelected ? 0.1 : 0.65;

      edges.push({
        id: `e-${img.id}-${fm.unique_face_id}`,
        source: `photo-${img.id}`,
        target: `face-${fm.unique_face_id}`,
        animated: perfMode ? false : (isSelected || allSelected),
        style: {
          stroke: isSelected || allSelected ? color : "#1e1e2e",
          strokeWidth: isSelected || allSelected ? 2 : 1,
          strokeOpacity: edgeOpacity,
          filter: perfMode ? "none" : (isSelected || allSelected ? `drop-shadow(0 0 4px ${color}80)` : "none"),
          transition: perfMode ? "none" : "all 0.3s ease",
        },
      });
    });
  });

  return { nodes, edges };
}

// ------------------------------------------------------------------ //
// Graph Canvas                                                         //
// ------------------------------------------------------------------ //
function GraphCanvas({
  images, faces, faceColorMap, jobId, onRefetch,
  selectedFaceIds, filterMode,
}: {
  images: ImageNode[];
  faces: UniqueFace[];
  faceColorMap: Map<string, string>;
  jobId: string;
  onRefetch: () => void;
  selectedFaceIds: Set<string>;
  filterMode: FilterMode;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const perfMode = useSettingsStore((s) => s.performanceMode) || images.length > 30;
  const [popupImageId, setPopupImageId] = useState<string | null>(null);
  const [hoveredFaceId, setHoveredFaceId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const popupImage = useMemo(
    () => (popupImageId ? images.find((i) => i.id === popupImageId) ?? null : null),
    [popupImageId, images]
  );

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, []);

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(images, faces, faceColorMap, setPopupImageId, BASE, selectedFaceIds, filterMode, perfMode),
    [images, faces, faceColorMap, BASE, selectedFaceIds, filterMode, perfMode]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => { setNodes(initNodes); }, [initNodes, setNodes]);
  useEffect(() => { setEdges(initEdges); }, [initEdges, setEdges]);

  const { fitView } = useReactFlow();
  const resetLayout = useCallback(() => {
    setNodes(initNodes);
    setEdges(initEdges);
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
  }, [initNodes, initEdges, setNodes, setEdges, fitView]);

  // Re-fit view when filter changes
  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100);
  }, [selectedFaceIds, filterMode, fitView]);

  // Hover highlighting — must respect filter state
  // When hover clears, restore to initNodes/initEdges (which encode filter opacity)
  // Only allow hover on selected (non-grayed) faces
  const allSelected = selectedFaceIds.size === faces.length;

  const connectedPhotoIds = useMemo(() => {
    if (!hoveredFaceId) return null;
    return new Set(
      images.filter((img) => img.faces.some((f) => f.unique_face_id === hoveredFaceId)).map((img) => `photo-${img.id}`)
    );
  }, [hoveredFaceId, images]);

  useEffect(() => {
    // Skip hover effects entirely in perf mode
    if (perfMode) return;

    if (!hoveredFaceId) {
      setNodes(initNodes);
      setEdges(initEdges);
      return;
    }

    const hColor = faceColorMap.get(hoveredFaceId) ?? "#eab308";

    setEdges((eds) =>
      eds.map((e) => {
        const isHighlighted = e.target === `face-${hoveredFaceId}`;
        return {
          ...e,
          animated: isHighlighted,
          style: isHighlighted
            ? { stroke: hColor, strokeWidth: 3.5, strokeOpacity: 1, filter: `drop-shadow(0 0 8px ${hColor})`, transition: "all 0.2s ease" }
            : { stroke: "#1e1e2e", strokeWidth: 1, strokeOpacity: 0.2, filter: "none", transition: "all 0.2s ease" },
        };
      })
    );
    setNodes((nds) =>
      nds.map((n) => {
        const isSelf = n.id === `face-${hoveredFaceId}`;
        const isConnectedPhoto = connectedPhotoIds?.has(n.id) ?? false;
        const isVisible = isSelf || isConnectedPhoto;
        return {
          ...n,
          style: {
            ...n.style,
            opacity: isVisible ? 1 : 0.12,
            transition: "all 0.2s ease",
            ...(isSelf ? { filter: `drop-shadow(0 0 18px ${hColor}) brightness(1.15)` } : { filter: "none" }),
          },
        };
      })
    );
  }, [hoveredFaceId, connectedPhotoIds, faceColorMap, setEdges, setNodes, initNodes, initEdges, perfMode]);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (perfMode) return;
    if (!node.id.startsWith("face-")) return;
    const faceId = node.id.slice(5);
    if (!allSelected && !selectedFaceIds.has(faceId)) return;
    setHoveredFaceId(faceId);
  }, [allSelected, selectedFaceIds, perfMode]);
  const handleNodeMouseLeave = useCallback((_: React.MouseEvent, node: Node) => {
    if (perfMode) return;
    if (node.id.startsWith("face-")) setHoveredFaceId(null);
  }, [perfMode]);

  return (
    <>
      <style>{`
        .react-flow__node { overflow: visible !important; }
        .react-flow__node[data-id^="face-"] { padding: 0 !important; }
        .react-flow__handle { opacity: 0 !important; width: 1px !important; height: 1px !important; }
        .react-flow__node:hover { z-index: 10 !important; }
      `}</style>

      <div ref={containerRef} className="relative w-full h-full">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeMouseEnter={handleNodeMouseEnter} onNodeMouseLeave={handleNodeMouseLeave}
          fitView fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1} maxZoom={3} colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#ffffff08" />
          <Controls showInteractive={false} style={{
            background: "rgba(18,18,26,0.9)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px", backdropFilter: "blur(8px)",
          }} />
          {!perfMode && (
            <MiniMap style={{
              background: "#0d0d18", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px",
            }} nodeColor={(n) => {
              if (n.id.startsWith("face-")) return (faceColorMap.get(n.id.slice(5)) ?? "#eab308") + "cc";
              return "#1e1e2e";
            }} maskColor="rgba(0,0,0,0.5)" />
          )}
        </ReactFlow>

        {/* Top-right controls */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
          <button onClick={resetLayout}
            className="p-1.5 rounded-lg bg-black/50 border border-white/10 text-slate-400 hover:text-white hover:bg-black/70 backdrop-blur transition-all"
            title="Reset positions">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-black/50 border border-white/10 text-slate-400 hover:text-white hover:bg-black/70 backdrop-blur transition-all"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 border border-white/8 text-xs text-slate-500 pointer-events-none backdrop-blur whitespace-nowrap">
          Double-click photo to assign faces · Scroll to zoom · Drag to pan
        </div>
      </div>

      <AnimatePresence>
        {popupImage && (
          <PhotoPopup image={popupImage} allFaces={faces} jobId={jobId}
            faceColorMap={faceColorMap} onClose={() => setPopupImageId(null)} onAssignmentChange={onRefetch} />
        )}
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------------ //
// Results Page                                                         //
// ------------------------------------------------------------------ //
export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const BASE = useSettingsStore((s) => s.httpBase());
  const [view, setView] = useState<"list" | "graph">("list");
  const [undetectedOpen, setUndetectedOpen] = useState(false);
  const [undetectedPopupId, setUndetectedPopupId] = useState<string | null>(null);

  // Filter state
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>("gray");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterWidth, setFilterWidth] = useState(FILTER_DEFAULT);
  const handleFilterResize = useCallback((delta: number) => {
    setFilterWidth((w) => Math.min(FILTER_MAX, Math.max(FILTER_MIN, w + delta)));
  }, []);

  // Add images state
  const [addingImages, setAddingImages] = useState(false);
  const addImagesRef = useRef<HTMLInputElement>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const handleAddImages = async (fileList: FileList | null) => {
    if (!fileList || !jobId) return;
    setAddingImages(true);
    try {
      await jobsApi.addImages(jobId, Array.from(fileList));
      navigate(`/processing/${jobId}`);
    } catch {
      setAddingImages(false);
    }
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["results", jobId],
    queryFn: () => jobsApi.results(jobId!).then((r) => r.data),
    enabled: !!jobId,
  });

  const allFaces = data?.unique_faces ?? [];   // includes disabled — for filter panel
  const faces = allFaces.filter((f) => !f.disabled);  // active faces — for graph/list
  const images = data?.images ?? [];
  const totalPhotos = faces.reduce((s, f) => s + f.matches.length, 0);
  const undetectedImages = images.filter((img) => img.faces.length === 0);
  const undetectedPopupImage = undetectedPopupId ? images.find((i) => i.id === undetectedPopupId) ?? null : null;

  const faceColorMap = useMemo(
    () => new Map(faces.map((f, i) => [f.id, PERSON_COLORS[i % PERSON_COLORS.length]])),
    [faces]
  );

  // Initialize selectedFaceIds when faces load
  useEffect(() => {
    if (faces.length > 0 && selectedFaceIds.size === 0) {
      setSelectedFaceIds(new Set(faces.map((f) => f.id)));
    }
  }, [faces]);

  const toggleFace = useCallback((id: string) => {
    setSelectedFaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedFaceIds(new Set(faces.map((f) => f.id))), [faces]);
  const deselectAll = useCallback(() => setSelectedFaceIds(new Set()), []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Compact header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-dark-800/50 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/")} className="text-slate-500 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-white">Results</h1>
              {!isLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3 text-brand-400" />{faces.length}</span>
                  <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3 text-purple-400" />{images.length} · {totalPhotos} matches</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Add more images */}
          <input ref={addImagesRef} type="file" multiple accept="image/*,.zip" className="hidden"
            onChange={(e) => handleAddImages(e.target.files)} />
          <button
            onClick={() => addImagesRef.current?.click()}
            disabled={addingImages}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
          >
            {addingImages ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Images
          </button>

          {/* Merge faces */}
          {allFaces.filter((f) => !f.disabled).length >= 2 && (
            <button onClick={() => setMergeOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-all">
              <Merge className="w-3.5 h-3.5" />
              Merge
            </button>
          )}

          {/* Filter toggle (graph view only) */}
          {view === "graph" && faces.length > 0 && (
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${filterOpen ? "bg-brand-500/15 border-brand-500/30 text-brand-300" : "border-white/10 text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {selectedFaceIds.size < faces.length && (
                <span className="px-1.5 py-0 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold ml-0.5">
                  {selectedFaceIds.size}
                </span>
              )}
            </button>
          )}

          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-dark-800 border border-white/5">
            <button onClick={() => setView("list")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
                ${view === "list" ? "bg-brand-500 text-black" : "text-slate-400 hover:text-white"}`}>
              <LayoutGrid className="w-3.5 h-3.5" />List
            </button>
            <button onClick={() => setView("graph")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
                ${view === "graph" ? "bg-brand-500 text-black" : "text-slate-400 hover:text-white"}`}>
              <Share2 className="w-3.5 h-3.5" />Graph
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-brand-400" />
              <p className="text-slate-400 text-sm">Loading results...</p>
            </div>
          )}
          {error && <div className="text-center py-16 text-red-400 text-sm">Failed to load results.</div>}
          {!isLoading && !error && faces.length === 0 && (
            <div className="text-center py-16 text-slate-500 text-sm">No faces detected.</div>
          )}

          {!isLoading && !error && faces.length > 0 && (
            <>
              {view === "list" ? (
                <div className="h-full overflow-y-auto">
                  <ListView faces={faces} faceColorMap={faceColorMap} jobId={jobId!} onRefetch={refetch} />

                  {/* Undetected images (list view) */}
                  {undetectedImages.length > 0 && (
                    <div className="mx-4 mb-4 rounded-xl border border-white/8 bg-dark-800/50 overflow-hidden">
                      <button onClick={() => setUndetectedOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                          <span className="text-white font-semibold text-sm">No faces detected</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                            {undetectedImages.length}
                          </span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${undetectedOpen ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence>
                        {undetectedOpen && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="px-4 pb-4 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2">
                              {undetectedImages.map((img) => (
                                <button key={img.id} onClick={() => setUndetectedPopupId(img.id)}
                                  className="group relative aspect-square rounded-lg overflow-hidden border border-white/8 hover:border-amber-500/40 transition-all">
                                  <img src={`${BASE}${thumbUrl(img.image_url)}`} alt={img.filename} loading="lazy"
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity" />
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                    <p className="text-xs text-slate-300 truncate text-center">{img.filename}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              ) : (
                <ReactFlowProvider>
                  <GraphCanvas
                    images={images} faces={faces} faceColorMap={faceColorMap}
                    jobId={jobId!} onRefetch={refetch}
                    selectedFaceIds={selectedFaceIds} filterMode={filterMode}
                  />
                </ReactFlowProvider>
              )}
            </>
          )}
        </div>

        {/* Filter panel (slides in from right on graph view) */}
        <AnimatePresence>
          {view === "graph" && filterOpen && faces.length > 0 && (
            <>
              <ResizeHandle onDrag={handleFilterResize} side="right" />
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: filterWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="shrink-0 border-l border-white/5 bg-dark-900 overflow-hidden"
              >
                <div style={{ width: filterWidth }} className="p-3 h-full overflow-y-auto">
                  <FaceFilterPanel
                    faces={allFaces} faceColorMap={faceColorMap}
                    selectedFaceIds={selectedFaceIds} filterMode={filterMode}
                    onToggleFace={toggleFace} onSelectAll={selectAll}
                    onDeselectAll={deselectAll} onSetFilterMode={setFilterMode}
                    jobId={jobId!} onRefetch={refetch}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Popup for undetected section */}
      <AnimatePresence>
        {undetectedPopupImage && (
          <PhotoPopup image={undetectedPopupImage} allFaces={faces} jobId={jobId!}
            faceColorMap={faceColorMap} onClose={() => setUndetectedPopupId(null)} onAssignmentChange={refetch} />
        )}
      </AnimatePresence>

      {/* Merge modal */}
      <AnimatePresence>
        {mergeOpen && (
          <MergeFacesModal faces={allFaces} faceColorMap={faceColorMap} jobId={jobId!}
            onClose={() => setMergeOpen(false)} onDone={() => { setMergeOpen(false); refetch(); }} />
        )}
      </AnimatePresence>

    </div>
  );
}
