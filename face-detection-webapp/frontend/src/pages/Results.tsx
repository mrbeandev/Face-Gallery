import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, useNodesState, useEdgesState,
  BackgroundVariant, ReactFlowProvider, useReactFlow,
  Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutGrid, Share2, ArrowLeft, X, Users, ImageIcon,
  Loader2, ChevronLeft, ChevronRight, Eye, EyeOff,
  Maximize2, Minimize2, Check, AlertCircle, ChevronDown, RotateCcw,
  Filter, CheckSquare, Square, EyeOff as EyeOffIcon, Pencil, GitMerge as Merge,
  Ban, Trash2, Plus, Grid3X3, Circle, Unlink,
} from "lucide-react";
import { jobsApi, type UniqueFace, type ImageNode } from "../api/client";
import { useSettingsStore, type EffectsConfig } from "../store/settingsStore";
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
      <div className={`relative inline-block ${className ?? ""}`} style={{ minWidth: 80 }}>
        <span className="opacity-15 select-none pointer-events-none block truncate" style={{ color }}>
          {faceName(face, index)}
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          disabled={saving}
          placeholder="Type a name..."
          className="absolute inset-0 bg-dark-700/80 border border-brand-500/50 rounded-lg px-2 py-0.5 outline-none focus:border-brand-400 text-white placeholder:text-slate-600"
          style={{ fontSize: "inherit", fontWeight: "inherit" }}
        />
      </div>
    );
  }

  return (
    <div className={`group/tag inline-flex items-center gap-1 ${className ?? ""}`}>
      <span className="truncate" style={{ color }}>{faceName(face, index)}</span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); setValue(face.name ?? ""); }}
        className="shrink-0 opacity-0 group-hover/tag:opacity-60 hover:!opacity-100 transition-opacity p-0.5 cursor-pointer"
        title="Rename"
      >
        <Pencil className="w-3 h-3" style={{ color }} />
      </button>
    </div>
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
  const [showAssign, setShowAssign] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number; nw: number; nh: number } | null>(null);
  const [pendingFaceId, setPendingFaceId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw-box mode: after clicking an unassigned face, user draws a rectangle on the image
  const [drawingFaceId, setDrawingFaceId] = useState<string | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const assignedFaceIds = useMemo(
    () => new Set(image.faces.map((f) => f.unique_face_id)),
    [image.faces]
  );

  // Draw existing face boxes
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

  // Draw the in-progress rectangle while user is dragging
  useEffect(() => {
    if (!drawCanvasRef.current || !imgSize) return;
    const ctx = drawCanvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, imgSize.nw, imgSize.nh);
    if (!drawStart || !drawEnd) return;
    const color = drawingFaceId ? (faceColorMap.get(drawingFaceId) ?? "#eab308") : "#eab308";
    const x = Math.min(drawStart.x, drawEnd.x);
    const y = Math.min(drawStart.y, drawEnd.y);
    const w = Math.abs(drawEnd.x - drawStart.x);
    const h = Math.abs(drawEnd.y - drawStart.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = color + "20";
    ctx.fillRect(x, y, w, h);
  }, [drawStart, drawEnd, imgSize, drawingFaceId, faceColorMap]);

  const handleImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    setImgSize({ w: el.naturalWidth, h: el.naturalHeight, nw: el.width, nh: el.height });
  };

  const getRelativePos = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDrawMouseDown = (e: React.MouseEvent) => {
    if (!drawingFaceId) return;
    e.preventDefault();
    setDrawStart(getRelativePos(e));
    setDrawEnd(null);
  };

  const handleDrawMouseMove = (e: React.MouseEvent) => {
    if (!drawingFaceId || !drawStart) return;
    setDrawEnd(getRelativePos(e));
  };

  const handleDrawMouseUp = async () => {
    if (!drawingFaceId || !drawStart || !drawEnd || !imgSize) return;
    // Convert display coords to original image coords
    const scaleX = imgSize.w / imgSize.nw;
    const scaleY = imgSize.h / imgSize.nh;
    const x1 = Math.min(drawStart.x, drawEnd.x) * scaleX;
    const y1 = Math.min(drawStart.y, drawEnd.y) * scaleY;
    const x2 = Math.max(drawStart.x, drawEnd.x) * scaleX;
    const y2 = Math.max(drawStart.y, drawEnd.y) * scaleY;
    // face_box format: [top, right, bottom, left]
    const box: [number, number, number, number] = [
      Math.round(y1), Math.round(x2), Math.round(y2), Math.round(x1),
    ];
    setPendingFaceId(drawingFaceId);
    try {
      await jobsApi.addMatch(jobId, image.id, drawingFaceId, box);
      onAssignmentChange();
    } finally {
      setPendingFaceId(null);
      setDrawingFaceId(null);
      setDrawStart(null);
      setDrawEnd(null);
    }
  };

  const skipDrawBox = async () => {
    if (!drawingFaceId) return;
    setPendingFaceId(drawingFaceId);
    try {
      await jobsApi.addMatch(jobId, image.id, drawingFaceId);
      onAssignmentChange();
    } finally {
      setPendingFaceId(null);
      setDrawingFaceId(null);
      setDrawStart(null);
      setDrawEnd(null);
    }
  };

  const cancelDrawBox = () => {
    setDrawingFaceId(null);
    setDrawStart(null);
    setDrawEnd(null);
  };

  const handleToggle = async (face: UniqueFace) => {
    if (pendingFaceId || drawingFaceId) return;
    if (assignedFaceIds.has(face.id)) {
      // Remove — immediate
      setPendingFaceId(face.id);
      try {
        await jobsApi.removeMatch(jobId, image.id, face.id);
        onAssignmentChange();
      } finally {
        setPendingFaceId(null);
      }
    } else {
      // Add — enter draw-box mode
      setDrawingFaceId(face.id);
      setDrawStart(null);
      setDrawEnd(null);
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
            className={`max-h-[55vh] max-w-full rounded-xl object-contain shadow-2xl block ${drawingFaceId ? "cursor-crosshair" : ""}`}
            onLoad={handleImgLoad}
            onMouseDown={handleDrawMouseDown}
            onMouseMove={handleDrawMouseMove}
            onMouseUp={handleDrawMouseUp}
          />
          {showFaces && hasFaceBoxes && (
            <canvas ref={canvasRef} width={imgSize?.nw ?? 0} height={imgSize?.nh ?? 0}
              className="absolute inset-0 rounded-xl pointer-events-none" style={{ width: imgSize?.nw, height: imgSize?.nh }} />
          )}
          {/* Drawing overlay canvas */}
          {drawingFaceId && imgSize && (
            <canvas ref={drawCanvasRef} width={imgSize.nw} height={imgSize.nh}
              className="absolute inset-0 rounded-xl pointer-events-none" style={{ width: imgSize.nw, height: imgSize.nh }} />
          )}

          {/* Draw-box mode banner */}
          {drawingFaceId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/80 border border-brand-500/40 backdrop-blur shadow-lg">
              <span className="text-xs text-brand-300 font-medium">
                Draw a rectangle around the face, or
              </span>
              <button onClick={skipDrawBox}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-all">
                Skip
              </button>
              <button onClick={cancelDrawBox}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all">
                Cancel
              </button>
            </div>
          )}

          {/* Floating edit button */}
          {allFaces.length > 0 && !showAssign && !drawingFaceId && (
            <button onClick={() => setShowAssign(true)}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 text-black text-xs font-semibold shadow-lg hover:bg-brand-400 transition-all">
              <Pencil className="w-3.5 h-3.5" />
              Edit Faces
            </button>
          )}
        </div>

        {/* Face assignment panel — shown after clicking Edit */}
        <AnimatePresence>
          {showAssign && allFaces.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="rounded-xl bg-dark-800/90 border border-white/10 p-3 backdrop-blur overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign faces</p>
                <button onClick={() => setShowAssign(false)} className="text-slate-500 hover:text-white p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
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
                        <FaceAvatar src={`${BASE}${thumbUrl(f.face_image_url, 150)}`} size={40}
                          className="rounded-full overflow-hidden"
                          style={{ boxShadow: isAssigned ? `0 0 0 2px ${color}` : "0 0 0 1px rgba(255,255,255,0.1)" }} />
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ //
// Lightbox                                                             //
// ------------------------------------------------------------------ //
function Lightbox({
  images, index, onClose, onPrev, onNext, onEdit,
}: {
  images: { url: string; name: string }[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEdit?: () => void;
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
        onClick={(e) => e.stopPropagation()} className="relative max-w-4xl max-h-full">
        <img src={`${BASE}${images[index].url}`} alt={images[index].name}
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" />
        <p className="text-center text-white/60 text-xs mt-2">{images[index].name} · {index + 1}/{images.length}</p>

        {/* Floating edit button */}
        {onEdit && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="absolute bottom-10 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 text-black text-xs font-semibold shadow-lg hover:bg-brand-400 transition-all">
            <Pencil className="w-3.5 h-3.5" />
            Edit Faces
          </button>
        )}
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
function ListView({ faces, faceColorMap, jobId, onRefetch, allImages, allFaces }: {
  faces: UniqueFace[]; faceColorMap: Map<string, string>; jobId: string; onRefetch: () => void;
  allImages: ImageNode[]; allFaces: UniqueFace[];
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const [lightbox, setLightbox] = useState<{ faceIdx: number; imgIdx: number } | null>(null);
  const [editImageId, setEditImageId] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
        {faces.map((face, fi) => {
          const color = faceColorMap.get(face.id) ?? PERSON_COLORS[fi % PERSON_COLORS.length];
          return (
            <motion.div key={face.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: fi * 0.04 }} className="card flex flex-col">
              <div className="p-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${color}20` }}>
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ boxShadow: `0 0 0 2px ${color}60` }}>
                  <HoverPreview src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} previewSize={180} round>
                    <img src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} alt="Face" className="w-full h-full object-cover" />
                  </HoverPreview>
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
                      <HoverPreview src={`${BASE}${thumbUrl(m.image_url)}`} previewSrc={`${BASE}${m.image_url}`} previewSize={320}>
                        <img src={`${BASE}${thumbUrl(m.image_url)}`} alt={m.filename} loading="lazy" className="w-full h-full object-cover" />
                      </HoverPreview>
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
        {lightbox !== null && (() => {
          const currentMatch = faces[lightbox.faceIdx].matches[lightbox.imgIdx];
          return (
            <Lightbox
              images={faces[lightbox.faceIdx].matches.map((m) => ({ url: m.image_url, name: m.filename }))}
              index={lightbox.imgIdx}
              onClose={() => setLightbox(null)}
              onPrev={() => setLightbox((lb) => lb && { ...lb, imgIdx: (lb.imgIdx - 1 + faces[lb.faceIdx].matches.length) % faces[lb.faceIdx].matches.length })}
              onNext={() => setLightbox((lb) => lb && { ...lb, imgIdx: (lb.imgIdx + 1) % faces[lb.faceIdx].matches.length })}
              onEdit={() => { setEditImageId(currentMatch.image_id); setLightbox(null); }}
            />
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {editImageId && (() => {
          const img = allImages.find((im) => im.id === editImageId);
          if (!img) return null;
          return (
            <PhotoPopup image={img} allFaces={allFaces} jobId={jobId}
              faceColorMap={faceColorMap} onClose={() => setEditImageId(null)} onAssignmentChange={onRefetch} />
          );
        })()}
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
  jobId, onRefetch, hideNoFace, onToggleHideNoFace,
}: {
  faces: UniqueFace[]; faceColorMap: Map<string, string>;
  selectedFaceIds: Set<string>; filterMode: FilterMode;
  onToggleFace: (id: string) => void; onSelectAll: () => void;
  onDeselectAll: () => void; onSetFilterMode: (mode: FilterMode) => void;
  jobId: string; onRefetch: () => void;
  hideNoFace: boolean; onToggleHideNoFace: () => void;
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

      {/* Hide no-face images */}
      <button onClick={onToggleHideNoFace}
        className={`w-full flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg text-xs font-medium transition-all shrink-0
          ${hideNoFace ? "bg-white/5 text-white" : "text-slate-500 hover:text-slate-300"}`}>
        <ImageIcon className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Hide unmatched photos</span>
        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${hideNoFace ? "bg-brand-500" : "bg-white/10"}`}>
          <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${hideNoFace ? "translate-x-4" : "translate-x-0"}`} />
        </div>
      </button>

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
                <FaceAvatar src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} size={36}
                  className="rounded-full overflow-hidden shrink-0"
                  style={{ boxShadow: isDisabled ? "0 0 0 1px rgba(255,255,255,0.05)" : selected ? `0 0 0 2px ${color}` : "0 0 0 1px rgba(255,255,255,0.1)" }} />
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
/** Image with enlarged preview on hover. Works for face avatars and photo thumbnails. */
function HoverPreview({
  src, previewSrc, children, previewSize = 200, round = false,
}: {
  src?: string;
  previewSrc?: string;       // full-res URL for preview (falls back to src)
  children?: React.ReactNode; // if provided, renders children instead of an img
  previewSize?: number;
  round?: boolean;            // true = fixed square/circle, false = natural aspect ratio
}) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const onEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const x = spaceRight > previewSize + 20 ? rect.right + 8 : rect.left - previewSize - 8;
      const y = Math.max(8, Math.min(window.innerHeight - previewSize - 8, rect.top + rect.height / 2 - previewSize / 2));
      setPos({ x, y });
    }
    setHover(true);
  };

  return (
    <>
      <div ref={ref} onMouseEnter={onEnter} onMouseLeave={() => setHover(false)}>
        {children ?? <img src={src} alt="" className="w-full h-full object-cover" />}
      </div>
      {hover && pos && createPortal(
        <div className="fixed z-[200] pointer-events-none" style={{ left: pos.x, top: pos.y }}>
          {round ? (
            <div className="overflow-hidden border-2 border-white/20 shadow-2xl bg-dark-800"
              style={{ width: previewSize, height: previewSize, borderRadius: "50%" }}>
              <img src={previewSrc ?? src} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <img src={previewSrc ?? src} alt=""
              className="rounded-2xl border-2 border-white/20 shadow-2xl bg-dark-800 block"
              style={{ maxWidth: previewSize, maxHeight: previewSize, objectFit: "contain" }} />
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Shorthand for face avatar with hover preview */
function FaceAvatar({
  src, size = 40, className, style,
}: {
  src: string; size?: number; className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{ width: size, height: size, ...style }}>
      <HoverPreview src={src} previewSize={180} round>
        <img src={src} alt="" className="w-full h-full object-cover rounded-full" />
      </HoverPreview>
    </div>
  );
}

function FacesManagerModal({
  faces, faceColorMap, jobId, onClose, onDone,
}: {
  faces: UniqueFace[]; faceColorMap: Map<string, string>;
  jobId: string; onClose: () => void; onDone: () => void;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);

  const startRename = (face: UniqueFace) => {
    setEditingId(face.id);
    setEditValue(face.name ?? "");
  };

  const saveRename = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await jobsApi.renameFace(jobId, editingId, editValue);
      onDone();
    } finally {
      setSaving(false);
      setEditingId(null);
    }
  };

  const cancelRename = () => { setEditingId(null); };

  const toggle = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (mergePrimaryId === id) setMergePrimaryId(next.size > 0 ? [...next][0] : null);
      } else {
        next.add(id);
        if (!mergePrimaryId) setMergePrimaryId(id);
      }
      return next;
    });
  };

  const selectAll = () => { setSelection(new Set(faces.map((f) => f.id))); };
  const selectNone = () => { setSelection(new Set()); setMergePrimaryId(null); };

  const selectedFaces = faces.filter((f) => selection.has(f.id));
  const activeFacesSelected = selectedFaces.filter((f) => !f.disabled);

  const doMerge = async () => {
    if (!mergePrimaryId || activeFacesSelected.length < 2) return;
    setBusy(true);
    try {
      const sourceIds = activeFacesSelected.map((f) => f.id).filter((id) => id !== mergePrimaryId);
      await jobsApi.mergeFaces(jobId, mergePrimaryId, sourceIds, mergePrimaryId);
      setSelection(new Set());
      setMergePrimaryId(null);
      onDone();
    } finally { setBusy(false); }
  };

  const doBulkDisable = async (disable: boolean) => {
    setBusy(true);
    try {
      for (const f of selectedFaces) {
        if (f.disabled !== disable) await jobsApi.toggleDisableFace(jobId, f.id);
      }
      onDone();
    } finally { setBusy(false); }
  };

  const doBulkDelete = async () => {
    if (!window.confirm(`Delete ${selection.size} face(s)? This permanently removes them and all their matches.`)) return;
    setBusy(true);
    try {
      for (const id of selection) await jobsApi.deleteFace(jobId, id);
      setSelection(new Set());
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] rounded-2xl bg-dark-800 border border-white/10 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-white">Manage Faces</h2>
            <span className="text-xs text-slate-500">{faces.length} total</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* Bulk actions bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5 shrink-0 flex-wrap">
          <button onClick={selection.size === faces.length ? selectNone : selectAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <CheckSquare className="w-3.5 h-3.5" />
            {selection.size === faces.length ? "Deselect all" : "Select all"}
          </button>

          {selection.size > 0 && (
            <>
              <span className="text-xs text-slate-500">{selection.size} selected</span>
              <div className="flex-1" />

              {activeFacesSelected.length >= 2 && (
                <button onClick={doMerge} disabled={busy || !mergePrimaryId}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 disabled:opacity-30 transition-all">
                  <Merge className="w-3.5 h-3.5" />Merge
                </button>
              )}
              <button onClick={() => doBulkDisable(true)} disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-30 transition-all">
                <Ban className="w-3.5 h-3.5" />Disable
              </button>
              <button onClick={() => doBulkDisable(false)} disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30 transition-all">
                <Eye className="w-3.5 h-3.5" />Enable
              </button>
              <button onClick={doBulkDelete} disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-30 transition-all">
                <Trash2 className="w-3.5 h-3.5" />Delete
              </button>
            </>
          )}
        </div>

        {/* Merge hint — show only when 2+ selected */}
        {activeFacesSelected.length >= 2 && (
          <div className="px-5 pt-2 text-xs text-slate-500 shrink-0">
            To merge: click "Main" on the face whose photo you want to keep, then click Merge.
          </div>
        )}

        {/* Face list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 min-h-0">
          {faces.map((face, i) => {
            const color = faceColorMap.get(face.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
            const checked = selection.has(face.id);
            const isPrimary = mergePrimaryId === face.id;
            const isDisabled = face.disabled;
            const hasGroup = face.group_members.length > 0;
            const isExpanded = expandedGroups.has(face.id);
            return (
              <div key={face.id}>
                {/* Main face row */}
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                    ${checked ? "bg-white/5 border border-brand-500/30" : "border border-transparent hover:bg-white/3"}
                    ${isDisabled ? "opacity-40" : ""}`}>
                  {/* Checkbox */}
                  <button onClick={() => toggle(face.id)} className="shrink-0">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                      ${checked ? "border-brand-400 bg-brand-500" : "border-white/20"}`}>
                      {checked && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                    </div>
                  </button>

                  {/* Avatar */}
                  <FaceAvatar src={`${BASE}${thumbUrl(face.face_image_url, 150)}`} size={40}
                    className="rounded-full overflow-hidden shrink-0"
                    style={{ boxShadow: isPrimary ? `0 0 0 3px ${color}` : `0 0 0 1px ${isDisabled ? "rgba(255,255,255,0.05)" : color + "40"}` }} />

                  {/* Info + inline rename */}
                  <div className="flex-1 min-w-0">
                    {editingId === face.id ? (
                      <div className="relative">
                        <span className="text-sm font-semibold opacity-15 block truncate select-none pointer-events-none" style={{ color }}>
                          {faceName(face, i)}
                        </span>
                        <input ref={editRef} value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") cancelRename(); }}
                          disabled={saving}
                          placeholder="Type a name..."
                          className="absolute inset-0 text-sm font-semibold bg-dark-700/80 border border-brand-500/50 rounded-lg px-2 py-0.5 outline-none focus:border-brand-400 text-white w-full placeholder:text-slate-600"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/name">
                        <span className="text-sm font-semibold truncate" style={{ color: isDisabled ? "#475569" : color }}>
                          {faceName(face, i)}
                        </span>
                        <button onClick={() => startRename(face)}
                          className="shrink-0 opacity-0 group-hover/name:opacity-60 hover:!opacity-100 transition-opacity p-0.5"
                          title="Rename">
                          <Pencil className="w-3 h-3" style={{ color }} />
                        </button>
                      </div>
                    )}
                    <span className="text-xs text-slate-500">
                      {face.matches.length} photos{isDisabled ? " · disabled" : ""}
                      {hasGroup ? ` · ${face.group_members.length + 1} grouped` : ""}
                    </span>
                  </div>

                  {/* Group expand toggle */}
                  {hasGroup && (
                    <button onClick={() => setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        next.has(face.id) ? next.delete(face.id) : next.add(face.id);
                        return next;
                      })}
                      className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                      title="Show grouped faces">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  )}

                  {/* Merge primary selector */}
                  {checked && activeFacesSelected.length >= 2 && !isDisabled && (
                    <button onClick={() => setMergePrimaryId(face.id)}
                      className={`shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-all
                        ${isPrimary ? "bg-brand-500 text-black" : "bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10"}`}
                      title="Keep this face photo after merge">
                      {isPrimary ? "Main" : "Set"}
                    </button>
                  )}

                  {/* Individual actions */}
                  <button onClick={async () => { await jobsApi.toggleDisableFace(jobId, face.id); onDone(); }}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors ${isDisabled ? "text-emerald-400 hover:bg-emerald-500/10" : "text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"}`}
                    title={isDisabled ? "Enable" : "Disable"}>
                    {isDisabled ? <Eye className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={async () => {
                      if (!window.confirm(`Delete "${faceName(face, i)}"?`)) return;
                      await jobsApi.deleteFace(jobId, face.id); onDone();
                    }}
                    className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete permanently">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded group members */}
                {hasGroup && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1 border-l-2 pl-3 mb-2" style={{ borderColor: color + "30" }}>
                    {face.group_members.map((member) => (
                      <div key={member.id}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/2 hover:bg-white/5 transition-all">
                        <FaceAvatar src={`${BASE}${thumbUrl(member.face_image_url, 150)}`} size={32}
                          className="rounded-full overflow-hidden shrink-0"
                          style={{ boxShadow: `0 0 0 1px ${color}30` }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-slate-300 truncate block">
                            {member.name || "Unnamed"}
                          </span>
                          <span className="text-xs text-slate-600">{member.match_count} photos</span>
                        </div>
                        <button onClick={async () => {
                            await jobsApi.setGroupPrimary(jobId, face.id, member.id);
                            onDone();
                          }}
                          className="shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                          title="Make this the display face">
                          Set main
                        </button>
                        <button onClick={async () => {
                            await jobsApi.ungroupFace(jobId, member.id);
                            onDone();
                          }}
                          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                          title="Remove from group">
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {busy && (
          <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-white/5 shrink-0">
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
            <span className="text-xs text-slate-400">Processing...</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}


// ------------------------------------------------------------------ //
// Custom node types with handles on all 4 sides                        //
// ------------------------------------------------------------------ //
function PhotoNode({ data }: { data: { label: React.ReactNode } }) {
  return (
    <>
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
      {data.label}
    </>
  );
}

function FaceNode({ data }: { data: { label: React.ReactNode } }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      {data.label}
    </>
  );
}

const nodeTypes = { photoNode: PhotoNode, faceNode: FaceNode };

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
const SECTION_GAP = 140;

type LayoutMode = "square" | "radial";
type Side = "top" | "right" | "bottom" | "left";

function buildGraph(
  images: ImageNode[],
  faces: UniqueFace[],
  faceColorMap: Map<string, string>,
  onPhotoDoubleClick: (imgId: string) => void,
  BASE: string,
  selectedFaceIds: Set<string>,
  filterMode: FilterMode,
  fx: EffectsConfig,
  layout: LayoutMode,
  hideNoFace: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Check if all active (non-disabled) faces are selected — ignore disabled IDs in selectedFaceIds
  const allSelected = faces.every((f) => selectedFaceIds.has(f.id));
  const visibleFaces = filterMode === "hide" && !allSelected
    ? faces.filter((f) => selectedFaceIds.has(f.id)) : faces;
  const visibleFaceIds = new Set(visibleFaces.map((f) => f.id));
  // Filter images: hide mode removes unselected, hideNoFace removes images with 0 face matches
  let visibleImages = filterMode === "hide" && !allSelected
    ? images.filter((img) => img.faces.some((f) => selectedFaceIds.has(f.unique_face_id)))
    : images;
  if (hideNoFace) {
    visibleImages = visibleImages.filter((img) => img.faces.length > 0);
  }

  // ── Compute photo positions ────────────────────────────────────────
  const photoPositions = new Map<string, { x: number; y: number }>();

  if (layout === "radial") {
    // Pack photos inside a circle using concentric rings (sunflower/Vogel spiral)
    const cellSize = Math.max(PHOTO_W, PHOTO_H) + 16;
    const n = visibleImages.length;
    // Golden angle spiral packing
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const scaleFactor = n <= 1 ? 0 : cellSize / Math.sqrt(goldenAngle);
    visibleImages.forEach((img, idx) => {
      const r = scaleFactor * Math.sqrt(idx);
      const theta = idx * goldenAngle - Math.PI / 2;
      photoPositions.set(img.id, {
        x: Math.cos(theta) * r - PHOTO_W / 2,
        y: Math.sin(theta) * r - PHOTO_H / 2,
      });
    });
  } else {
    // Square grid
    const cols = Math.max(1, Math.ceil(Math.sqrt(visibleImages.length)));
    const gridW = cols * PHOTO_W + (cols - 1) * PHOTO_GAP_X;
    const gridStartX = -gridW / 2;
    visibleImages.forEach((img, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      photoPositions.set(img.id, {
        x: gridStartX + col * (PHOTO_W + PHOTO_GAP_X),
        y: row * (PHOTO_H + PHOTO_GAP_Y),
      });
    });
  }

  // ── Compute bounding box of all photos ─────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  photoPositions.forEach(({ x, y }) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + PHOTO_W);
    maxY = Math.max(maxY, y + PHOTO_H);
  });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // ── Assign each face to a side based on connected photos ───────────
  const faceAssignments = new Map<string, Side>();
  const facePositions = new Map<string, { x: number; y: number; side: Side }>();

  if (layout === "radial") {
    // In radial, place faces evenly around the outer ring.
    // Compute the outer radius from the bounding box of packed photos.
    const outerRadius = Math.max(
      Math.abs(minX - centerX), Math.abs(maxX - centerX),
      Math.abs(minY - centerY), Math.abs(maxY - centerY),
    ) + SECTION_GAP + FACE_W;

    visibleFaces.forEach((face, i) => {
      const angle = (i / visibleFaces.length) * 2 * Math.PI - Math.PI / 2;
      const fx2 = centerX + Math.cos(angle) * outerRadius - FACE_W / 2;
      const fy2 = centerY + Math.sin(angle) * outerRadius - FACE_H / 2;
      facePositions.set(face.id, { x: fx2, y: fy2, side:
        Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
          ? (Math.cos(angle) > 0 ? "right" : "left")
          : (Math.sin(angle) > 0 ? "bottom" : "top"),
      });
      faceAssignments.set(face.id, facePositions.get(face.id)!.side);
    });
  } else {
    // Square: compute angle of each face's connected-photo centroid, sort by angle,
    // then distribute evenly across all 4 sides.
    const faceAngles: { face: UniqueFace; angle: number }[] = [];
    visibleFaces.forEach((face) => {
      const connectedImgs = visibleImages.filter((img) =>
        img.faces.some((f) => f.unique_face_id === face.id));
      if (connectedImgs.length === 0) {
        faceAngles.push({ face, angle: Math.PI / 2 }); // default bottom
        return;
      }
      let avgX = 0, avgY = 0;
      connectedImgs.forEach((img) => {
        const pos = photoPositions.get(img.id)!;
        avgX += pos.x + PHOTO_W / 2;
        avgY += pos.y + PHOTO_H / 2;
      });
      avgX /= connectedImgs.length;
      avgY /= connectedImgs.length;
      faceAngles.push({ face, angle: Math.atan2(avgY - centerY, avgX - centerX) });
    });
    // Sort by angle so nearby faces cluster on the same side
    faceAngles.sort((a, b) => a.angle - b.angle);
    // Distribute evenly: split sorted list into 4 roughly equal groups
    const sides: Side[] = ["right", "bottom", "left", "top"];
    const perSide = Math.ceil(faceAngles.length / 4);
    faceAngles.forEach(({ face }, idx) => {
      const sideIdx = Math.min(3, Math.floor(idx / perSide));
      faceAssignments.set(face.id, sides[sideIdx]);
    });
  }

  // Group faces by side
  const sideFaces: Record<Side, UniqueFace[]> = { top: [], right: [], bottom: [], left: [] };
  visibleFaces.forEach((f) => sideFaces[faceAssignments.get(f.id) ?? "bottom"].push(f));

  // ── Compute face positions per side ────────────────────────────────
  const placeFacesOnSide = (facesOnSide: UniqueFace[], side: Side) => {
    const count = facesOnSide.length;
    if (count === 0) return;

    if (layout === "radial") {
      const radius = Math.max(200, visibleImages.length * 12) + SECTION_GAP;
      // Determine angle range for this side
      const angleRanges: Record<Side, [number, number]> = {
        right: [-Math.PI / 4, Math.PI / 4],
        bottom: [Math.PI / 4, 3 * Math.PI / 4],
        left: [3 * Math.PI / 4, 5 * Math.PI / 4],
        top: [-3 * Math.PI / 4, -Math.PI / 4],
      };
      const [startA, endA] = angleRanges[side];
      facesOnSide.forEach((face, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const angle = startA + t * (endA - startA);
        facePositions.set(face.id, {
          x: Math.cos(angle) * radius - FACE_W / 2,
          y: Math.sin(angle) * radius - FACE_H / 2,
          side,
        });
      });
    } else {
      // Square layout
      if (side === "top" || side === "bottom") {
        const totalW = count * FACE_W + (count - 1) * FACE_GAP;
        const startX = centerX - totalW / 2;
        const y = side === "top" ? minY - SECTION_GAP - FACE_H : maxY + SECTION_GAP;
        facesOnSide.forEach((face, i) => {
          facePositions.set(face.id, { x: startX + i * (FACE_W + FACE_GAP), y, side });
        });
      } else {
        const totalH = count * FACE_H + (count - 1) * FACE_GAP;
        const startY = centerY - totalH / 2;
        const x = side === "left" ? minX - SECTION_GAP - FACE_W : maxX + SECTION_GAP;
        facesOnSide.forEach((face, i) => {
          facePositions.set(face.id, { x, y: startY + i * (FACE_H + FACE_GAP), side });
        });
      }
    }
  };

  // For radial, face positions are already computed above; only run for square
  if (layout !== "radial") {
    (["top", "right", "bottom", "left"] as Side[]).forEach((s) => placeFacesOnSide(sideFaces[s], s));
  }

  // Handle direction: face nodes receive connections from the grid side
  const sideToTarget: Record<Side, string> = {
    top: "bottom", right: "left", bottom: "top", left: "right",
  };

  // ── Create photo nodes ─────────────────────────────────────────────
  visibleImages.forEach((img) => {
    const pos = photoPositions.get(img.id)!;
    const hasFaceMatches = img.faces.some((f) => visibleFaceIds.has(f.unique_face_id));
    const topColor = hasFaceMatches
      ? faceColorMap.get(img.faces.find((f) => visibleFaceIds.has(f.unique_face_id))?.unique_face_id ?? "") ?? "transparent"
      : "transparent";
    const isRelevant = allSelected || img.faces.some((f) => selectedFaceIds.has(f.unique_face_id));
    const nodeOpacity = filterMode === "gray" && !allSelected && !isRelevant ? 0.15 : 1;

    nodes.push({
      id: `photo-${img.id}`,
      type: "photoNode",
      position: pos,
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
        borderTop: hasFaceMatches ? `3px solid ${topColor}` : undefined,
        borderRadius: "14px",
        width: PHOTO_W,
        height: PHOTO_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        opacity: nodeOpacity,
        boxShadow: fx.nodeShadows ? (hasFaceMatches
          ? `0 0 16px ${topColor}18, 0 4px 20px rgba(0,0,0,0.5)`
          : "0 4px 16px rgba(0,0,0,0.4)") : "none",
        padding: "8px 6px 6px",
        transition: fx.transitions ? "opacity 0.3s ease" : "none",
      },
    });
  });

  // ── Create face nodes ──────────────────────────────────────────────
  visibleFaces.forEach((face) => {
    const fp = facePositions.get(face.id);
    if (!fp) return;
    const color = faceColorMap.get(face.id) ?? PERSON_COLORS[0];
    const globalIdx = faces.indexOf(face);
    const isSelected = selectedFaceIds.has(face.id);
    const faceOpacity = filterMode === "gray" && !allSelected && !isSelected ? 0.15 : 1;

    nodes.push({
      id: `face-${face.id}`,
      type: "faceNode",
      position: { x: fp.x, y: fp.y },
      data: {
        label: (
          <div className="select-none overflow-hidden" style={{
            width: FACE_W, height: FACE_H,
            display: "flex", flexDirection: "column",
            background: `linear-gradient(175deg, ${color}14 0%, #090910 60%)`,
            border: `2px solid ${color}60`,
            borderRadius: "16px 16px 10px 10px",
            boxShadow: fx.nodeShadows ? `0 0 0 3px ${color}0d, 0 6px 24px ${color}28` : "none",
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
        transition: fx.transitions ? "opacity 0.3s ease" : "none",
      },
    });
  });

  // ── Edges ──────────────────────────────────────────────────────────
  visibleImages.forEach((img) => {
    img.faces.forEach((fm) => {
      if (!visibleFaceIds.has(fm.unique_face_id)) return;
      const color = faceColorMap.get(fm.unique_face_id) ?? "#eab308";
      const isSelected = selectedFaceIds.has(fm.unique_face_id);
      const edgeOpacity = filterMode === "gray" && !allSelected && !isSelected ? 0.1 : 0.65;
      const fp = facePositions.get(fm.unique_face_id);
      const side = fp?.side ?? "bottom";

      edges.push({
        id: `e-${img.id}-${fm.unique_face_id}`,
        source: `photo-${img.id}`,
        target: `face-${fm.unique_face_id}`,
        sourceHandle: side,
        targetHandle: sideToTarget[side],
        animated: fx.edgeAnimations && (isSelected || allSelected),
        style: {
          stroke: isSelected || allSelected ? color : "#1e1e2e",
          strokeWidth: isSelected || allSelected ? 2 : 1,
          strokeOpacity: edgeOpacity,
          filter: fx.edgeGlow && (isSelected || allSelected) ? `drop-shadow(0 0 4px ${color}80)` : "none",
          transition: fx.transitions ? "all 0.3s ease" : "none",
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
  selectedFaceIds, filterMode, hideNoFace,
}: {
  images: ImageNode[];
  faces: UniqueFace[];
  faceColorMap: Map<string, string>;
  jobId: string;
  onRefetch: () => void;
  selectedFaceIds: Set<string>;
  filterMode: FilterMode;
  hideNoFace: boolean;
}) {
  const BASE = useSettingsStore((s) => s.httpBase());
  const fx = useSettingsStore((s) => s.effects);
  const [popupImageId, setPopupImageId] = useState<string | null>(null);
  const [hoveredFaceId, setHoveredFaceId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("square");
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
    () => buildGraph(images, faces, faceColorMap, setPopupImageId, BASE, selectedFaceIds, filterMode, fx, layout, hideNoFace),
    [images, faces, faceColorMap, BASE, selectedFaceIds, filterMode, fx, layout, hideNoFace]
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
    if (!hoveredFaceId || !fx.hoverEffects) {
      // Restore base state (with correct animations from buildGraph)
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
          animated: fx.edgeAnimations && isHighlighted,
          style: isHighlighted
            ? { stroke: hColor, strokeWidth: 3.5, strokeOpacity: 1, filter: fx.edgeGlow ? `drop-shadow(0 0 8px ${hColor})` : "none", transition: fx.transitions ? "all 0.2s ease" : "none" }
            : { stroke: "#1e1e2e", strokeWidth: 1, strokeOpacity: 0.2, filter: "none", transition: fx.transitions ? "all 0.2s ease" : "none" },
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
            transition: fx.transitions ? "all 0.2s ease" : "none",
            ...(isSelf && fx.nodeShadows ? { filter: `drop-shadow(0 0 18px ${hColor}) brightness(1.15)` } : { filter: "none" }),
          },
        };
      })
    );
  }, [hoveredFaceId, connectedPhotoIds, faceColorMap, setEdges, setNodes, initNodes, initEdges, fx.hoverEffects]);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (!fx.hoverEffects) return;
    if (!node.id.startsWith("face-")) return;
    const faceId = node.id.slice(5);
    if (!allSelected && !selectedFaceIds.has(faceId)) return;
    setHoveredFaceId(faceId);
  }, [allSelected, selectedFaceIds, fx.hoverEffects]);
  const handleNodeMouseLeave = useCallback((_: React.MouseEvent, node: Node) => {
    if (!fx.hoverEffects) return;
    if (node.id.startsWith("face-")) setHoveredFaceId(null);
  }, [fx.hoverEffects]);

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
          nodeTypes={nodeTypes}
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
          {fx.minimap && (
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
          {/* Layout toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/50 border border-white/10 backdrop-blur">
            <button onClick={() => setLayout("square")}
              className={`p-1.5 rounded-md transition-all ${layout === "square" ? "bg-brand-500 text-black" : "text-slate-400 hover:text-white"}`}
              title="Square layout">
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setLayout("radial")}
              className={`p-1.5 rounded-md transition-all ${layout === "radial" ? "bg-brand-500 text-black" : "text-slate-400 hover:text-white"}`}
              title="Radial layout">
              <Circle className="w-3.5 h-3.5" />
            </button>
          </div>
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
  const [hideNoFace, setHideNoFace] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterWidth, setFilterWidth] = useState(FILTER_DEFAULT);
  const handleFilterResize = useCallback((delta: number) => {
    setFilterWidth((w) => Math.min(FILTER_MAX, Math.max(FILTER_MIN, w + delta)));
  }, []);

  // Add images state
  const [addingImages, setAddingImages] = useState(false);
  const addImagesRef = useRef<HTMLInputElement>(null);
  const [facesManagerOpen, setFacesManagerOpen] = useState(false);

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

  // Initialize selectedFaceIds once when faces first load
  const initialized = useRef(false);
  useEffect(() => {
    if (faces.length > 0 && !initialized.current) {
      initialized.current = true;
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

          {/* Faces manager */}
          {allFaces.length > 0 && (
            <button onClick={() => setFacesManagerOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all">
              <Users className="w-3.5 h-3.5" />
              Faces
              <span className="px-1.5 py-0 rounded-full bg-white/10 text-xs text-slate-400 ml-0.5">{allFaces.length}</span>
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
                  <ListView faces={faces} faceColorMap={faceColorMap} jobId={jobId!} onRefetch={refetch}
                    allImages={images} allFaces={allFaces} />

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
                                  <HoverPreview src={`${BASE}${thumbUrl(img.image_url)}`} previewSrc={`${BASE}${img.image_url}`} previewSize={320}>
                                    <img src={`${BASE}${thumbUrl(img.image_url)}`} alt={img.filename} loading="lazy"
                                      className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity" />
                                  </HoverPreview>
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
                    hideNoFace={hideNoFace}
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
                    hideNoFace={hideNoFace} onToggleHideNoFace={() => setHideNoFace((v) => !v)}
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

      {/* Faces manager modal */}
      <AnimatePresence>
        {facesManagerOpen && (
          <FacesManagerModal faces={allFaces} faceColorMap={faceColorMap} jobId={jobId!}
            onClose={() => setFacesManagerOpen(false)} onDone={() => refetch()} />
        )}
      </AnimatePresence>

    </div>
  );
}
