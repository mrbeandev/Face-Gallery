import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, useNodesState, useEdgesState,
  BackgroundVariant, ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutGrid, Share2, ArrowLeft, X, Users, ImageIcon,
  Loader2, ChevronLeft, ChevronRight, Eye, EyeOff,
} from "lucide-react";
import { jobsApi, type UniqueFace, type ImageNode } from "../api/client";

const BASE = "http://localhost:8000";

const PERSON_COLORS = [
  "#eab308", "#8b5cf6", "#06b6d4", "#10b981", "#f43f5e",
  "#f97316", "#3b82f6", "#ec4899", "#14b8a6", "#84cc16",
];

// ------------------------------------------------------------------ //
// Photo popup with face bounding box overlay                           //
// ------------------------------------------------------------------ //
function PhotoPopup({
  image,
  faceColorMap,
  onClose,
}: {
  image: ImageNode;
  faceColorMap: Map<string, string>;
  onClose: () => void;
}) {
  const [showFaces, setShowFaces] = useState(true);
  const [imgSize, setImgSize] = useState<{ w: number; h: number; nw: number; nh: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw face boxes on canvas whenever toggle or image size changes
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

      // Label background
      ctx.shadowBlur = 0;
      const label = `Person ${[...faceColorMap.keys()].indexOf(f.unique_face_id) + 1}`;
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
    setImgSize({
      w: el.naturalWidth,
      h: el.naturalHeight,
      nw: el.width,
      nh: el.height,
    });
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
        className="relative max-w-4xl max-h-[90vh] flex flex-col gap-3"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{image.filename}</span>
            <span className="text-slate-500 text-sm">·</span>
            <span className="text-slate-400 text-sm">{image.faces.length} face{image.faces.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasFaceBoxes && (
              <button
                onClick={() => setShowFaces((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                  ${showFaces
                    ? "bg-brand-500/20 border-brand-500/40 text-brand-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
              >
                {showFaces ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showFaces ? "Faces on" : "Faces off"}
              </button>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image + canvas overlay */}
        <div className="relative inline-block">
          <img
            ref={imgRef}
            src={`${BASE}${image.image_url}`}
            alt={image.filename}
            className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl block"
            onLoad={handleImgLoad}
          />
          {showFaces && hasFaceBoxes && (
            <canvas
              ref={canvasRef}
              width={imgSize?.nw ?? 0}
              height={imgSize?.nh ?? 0}
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ width: imgSize?.nw, height: imgSize?.nh }}
            />
          )}
        </div>

        {/* Face strip at bottom */}
        {image.faces.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {image.faces.map((f, i) => {
              const color = faceColorMap.get(f.unique_face_id) ?? "#eab308";
              const personIdx = [...faceColorMap.keys()].indexOf(f.unique_face_id) + 1;
              return (
                <div key={f.unique_face_id} className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full overflow-hidden ring-2"
                    style={{ ringColor: color, boxShadow: `0 0 0 2px ${color}` }}
                  >
                    <img src={`${BASE}${f.face_image_url}`} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xs font-medium" style={{ color }}>Person {personIdx}</span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ //
// Lightbox (list view)                                                 //
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
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-4 text-white/60 hover:text-white p-2">
        <ChevronLeft className="w-8 h-8" />
      </button>
      <motion.div
        key={index}
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl max-h-full"
      >
        <img
          src={`${BASE}${images[index].url}`}
          alt={images[index].name}
          className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
        />
        <p className="text-center text-white/60 text-sm mt-3">{images[index].name} · {index + 1}/{images.length}</p>
      </motion.div>
      <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-4 text-white/60 hover:text-white p-2">
        <ChevronRight className="w-8 h-8" />
      </button>
    </motion.div>
  );
}

// ------------------------------------------------------------------ //
// List View                                                            //
// ------------------------------------------------------------------ //
function ListView({ faces, faceColorMap }: { faces: UniqueFace[]; faceColorMap: Map<string, string> }) {
  const [lightbox, setLightbox] = useState<{ faceIdx: number; imgIdx: number } | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {faces.map((face, fi) => {
          const color = faceColorMap.get(face.id) ?? PERSON_COLORS[fi % PERSON_COLORS.length];
          const images = face.matches.map((m) => ({ url: m.image_url, name: m.filename }));

          return (
            <motion.div
              key={face.id}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: fi * 0.05 }}
              className="card flex flex-col"
            >
              <div className="p-5 flex items-center gap-4" style={{ borderBottom: `1px solid ${color}20` }}>
                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0" style={{ boxShadow: `0 0 0 2px ${color}60` }}>
                  <img src={`${BASE}${face.face_image_url}`} alt="Face" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-semibold text-white">Person {fi + 1}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <ImageIcon className="w-3.5 h-3.5" style={{ color }} />
                    <span className="text-xs font-medium" style={{ color }}>
                      {face.matches.length} photo{face.matches.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
              {face.matches.length > 0 ? (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {face.matches.map((m, mi) => (
                    <button
                      key={m.image_id}
                      onClick={() => setLightbox({ faceIdx: fi, imgIdx: mi })}
                      className="shrink-0 w-20 h-20 rounded-xl overflow-hidden hover:ring-2 hover:ring-brand-400 transition-all"
                    >
                      <img src={`${BASE}${m.image_url}`} alt={m.filename} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-slate-600 text-sm">No matches found</div>
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
// Graph View — radial gravity layout                                   //
//                                                                      //
// Person nodes orbit in a circle.                                      //
// Photo nodes float at the gravitational centroid of their people —    //
// single-person photos cluster near that person,                       //
// multi-person photos drift toward the center naturally.               //
// ------------------------------------------------------------------ //

/** Compute (x,y) positions for all nodes using the radial gravity model */
function computeLayout(images: ImageNode[], faces: UniqueFace[]) {
  const n = faces.length;
  // Scale orbit radius with number of people (min 220, max 420)
  const R = Math.min(420, Math.max(220, n * 72));

  // --- Face positions: evenly spaced around a circle ---
  const facePos = new Map<string, { x: number; y: number }>();
  faces.forEach((f, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2; // start from top
    facePos.set(f.id, { x: R * Math.cos(angle), y: R * Math.sin(angle) });
  });

  // --- Photo positions: centroid of connected faces, pushed outward ---
  const photoPos = new Map<string, { x: number; y: number }>();
  const PUSH = 190;   // how far beyond centroid to place the photo
  const GOLDEN = 2.3999632; // golden angle (rad) — spread same-centroid photos

  // Track how many photos share the same face set (for jitter)
  const centroidCount = new Map<string, number>();

  images.forEach((img, imgIdx) => {
    if (img.faces.length === 0) {
      // No detections — scatter on an outer ring
      const angle = (imgIdx / Math.max(images.length, 1)) * Math.PI * 2;
      photoPos.set(img.id, { x: (R + PUSH) * Math.cos(angle), y: (R + PUSH) * Math.sin(angle) });
      return;
    }

    // Centroid of connected face nodes
    let cx = 0, cy = 0;
    img.faces.forEach((fm) => {
      const p = facePos.get(fm.unique_face_id) ?? { x: 0, y: 0 };
      cx += p.x; cy += p.y;
    });
    cx /= img.faces.length;
    cy /= img.faces.length;

    // Direction from canvas center (0,0) toward centroid
    const mag = Math.sqrt(cx * cx + cy * cy);
    const ux = mag < 1 ? Math.cos(imgIdx) : cx / mag;
    const uy = mag < 1 ? Math.sin(imgIdx) : cy / mag;

    // Golden-angle jitter so photos sharing the same person don't stack
    const key = img.faces.map((f) => f.unique_face_id).sort().join(",");
    const count = centroidCount.get(key) ?? 0;
    centroidCount.set(key, count + 1);
    const jAngle = count * GOLDEN;
    const jR = count === 0 ? 0 : 30 + count * 12; // spiral outward
    const jx = jR * Math.cos(jAngle);
    const jy = jR * Math.sin(jAngle);

    photoPos.set(img.id, {
      x: cx + ux * PUSH + jx,
      y: cy + uy * PUSH + jy,
    });
  });

  return { facePos, photoPos };
}

function buildGraph(
  images: ImageNode[],
  faces: UniqueFace[],
  faceColorMap: Map<string, string>,
  onPhotoDoubleClick: (img: ImageNode) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const { facePos, photoPos } = computeLayout(images, faces);

  const FACE_D = 96;   // face node diameter
  const PHOTO_W = 124;
  const PHOTO_H = 148;

  // --- Face nodes ---
  faces.forEach((face, i) => {
    const color = faceColorMap.get(face.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
    const pos = facePos.get(face.id)!;

    nodes.push({
      id: `face-${face.id}`,
      position: { x: pos.x - FACE_D / 2, y: pos.y - FACE_D / 2 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-0.5 select-none">
            <div
              className="w-14 h-14 rounded-full overflow-hidden"
              style={{ boxShadow: `0 0 0 3px ${color}, 0 0 18px ${color}60` }}
            >
              <img src={`${BASE}${face.face_image_url}`} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="text-[10px] font-bold mt-0.5" style={{ color }}>
              Person {i + 1}
            </span>
            <span className="text-[9px] text-slate-500">
              {face.matches.length} photo{face.matches.length !== 1 ? "s" : ""}
            </span>
          </div>
        ),
      },
      style: {
        background: "radial-gradient(circle at 40% 35%, #22223a, #0f0f1a)",
        border: `1.5px solid ${color}40`,
        borderRadius: "50%",
        width: FACE_D,
        height: FACE_D,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 0 6px ${color}0c, 0 0 40px ${color}18`,
        animation: "facePulse 3s ease-in-out infinite",
        animationDelay: `${i * 0.4}s`,
      },
    });
  });

  // --- Photo nodes ---
  images.forEach((img) => {
    const pos = photoPos.get(img.id)!;
    const hasFaces = img.faces.length > 0;

    // Multi-color left-border: stripe each person's color
    const borderColors = img.faces
      .map((f) => faceColorMap.get(f.unique_face_id) ?? "#ffffff20")
      .join(", ");
    const leftBorder = img.faces.length > 1
      ? `linear-gradient(180deg, ${borderColors}) 1`
      : img.faces.length === 1
        ? `${faceColorMap.get(img.faces[0].unique_face_id) ?? "#ffffff20"}80`
        : "rgba(255,255,255,0.06)";

    nodes.push({
      id: `photo-${img.id}`,
      position: { x: pos.x - PHOTO_W / 2, y: pos.y - PHOTO_H / 2 },
      data: {
        label: (
          <div
            className="flex flex-col items-center gap-1 select-none w-full"
            onDoubleClick={() => onPhotoDoubleClick(img)}
          >
            <div className="w-[100px] h-[100px] rounded-xl overflow-hidden border border-white/10">
              <img src={`${BASE}${img.image_url}`} alt={img.filename} className="w-full h-full object-cover" />
            </div>
            <span className="text-[10px] text-slate-300 truncate max-w-[108px] text-center font-medium leading-tight">
              {img.filename}
            </span>
            <span className="text-[9px] text-slate-500">
              {hasFaces ? `${img.faces.length} face${img.faces.length !== 1 ? "s" : ""}` : "no faces"}
              {" · dbl-click"}
            </span>
          </div>
        ),
      },
      style: {
        background: "radial-gradient(135deg, #161622 0%, #0d0d18 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderLeft: img.faces.length === 1
          ? `3px solid ${faceColorMap.get(img.faces[0].unique_face_id) ?? "transparent"}`
          : "1px solid rgba(255,255,255,0.07)",
        borderRadius: "16px",
        width: PHOTO_W,
        height: PHOTO_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      },
    });
  });

  // --- Edges ---
  images.forEach((img) => {
    img.faces.forEach((fm) => {
      const color = faceColorMap.get(fm.unique_face_id) ?? "#eab308";
      edges.push({
        id: `e-${img.id}-${fm.unique_face_id}`,
        source: `photo-${img.id}`,
        target: `face-${fm.unique_face_id}`,
        type: "bezier",
        animated: true,
        style: {
          stroke: color,
          strokeWidth: 1.8,
          strokeOpacity: 0.55,
          filter: `drop-shadow(0 0 4px ${color}60)`,
        },
      });
    });
  });

  return { nodes, edges };
}

function GraphCanvas({
  images, faces, faceColorMap,
}: {
  images: ImageNode[];
  faces: UniqueFace[];
  faceColorMap: Map<string, string>;
}) {
  const [popup, setPopup] = useState<ImageNode | null>(null);
  const { nodes: initNodes, edges: initEdges } = buildGraph(images, faces, faceColorMap, setPopup);
  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, , onEdgesChange] = useEdgesState(initEdges);

  return (
    <>
      {/* Keyframe for face node breathing glow */}
      <style>{`
        @keyframes facePulse {
          0%, 100% { box-shadow: var(--pulse-shadow-lo); }
          50%       { box-shadow: var(--pulse-shadow-hi); }
        }
        .react-flow__node { overflow: visible !important; }
        .react-flow__handle { opacity: 0 !important; width: 1px !important; height: 1px !important; }
      `}</style>

      <div className="relative w-full h-[calc(100vh-220px)] rounded-2xl overflow-hidden border border-white/5">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={3}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          {/* Subtle cross-hatch background */}
          <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#ffffff08" />

          <Controls
            showInteractive={false}
            style={{
              background: "rgba(18,18,26,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              backdropFilter: "blur(8px)",
            }}
          />

          <MiniMap
            style={{
              background: "#0d0d18",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
            }}
            nodeColor={(n) => {
              if (n.id.startsWith("face-")) {
                const id = n.id.slice(5);
                return (faceColorMap.get(id) ?? "#eab308") + "cc";
              }
              return "#1e1e2e";
            }}
            maskColor="rgba(0,0,0,0.5)"
          />
        </ReactFlow>

        {/* Legend */}
        <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap max-w-xs">
          {faces.map((f, i) => {
            const color = faceColorMap.get(f.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
            return (
              <div
                key={f.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold backdrop-blur"
                style={{
                  background: `${color}15`,
                  border: `1px solid ${color}40`,
                  color,
                }}
              >
                <div className="w-4 h-4 rounded-full overflow-hidden shrink-0" style={{ boxShadow: `0 0 0 1px ${color}` }}>
                  <img src={`${BASE}${f.face_image_url}`} alt="" className="w-full h-full object-cover" />
                </div>
                P{i + 1}
              </div>
            );
          })}
        </div>

        {/* Hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 border border-white/08 text-[10px] text-slate-500 pointer-events-none backdrop-blur whitespace-nowrap">
          Double-click a photo · Scroll to zoom · Drag to pan
        </div>
      </div>

      <AnimatePresence>
        {popup && (
          <PhotoPopup image={popup} faceColorMap={faceColorMap} onClose={() => setPopup(null)} />
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
  const [view, setView] = useState<"list" | "graph">("list");

  const { data, isLoading, error } = useQuery({
    queryKey: ["results", jobId],
    queryFn: () => jobsApi.results(jobId!).then((r) => r.data),
    enabled: !!jobId,
  });

  const faces = data?.unique_faces ?? [];
  const images = data?.images ?? [];
  const totalPhotos = faces.reduce((s, f) => s + f.matches.length, 0);

  // Build stable face → color map
  const faceColorMap = new Map(
    faces.map((f, i) => [f.id, PERSON_COLORS[i % PERSON_COLORS.length]])
  );

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8 flex-wrap gap-4"
        >
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/")} className="btn-ghost flex items-center gap-2 text-sm">
              <ArrowLeft className="w-4 h-4" />
              New upload
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Results</h1>
              {!isLoading && (
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1.5 text-sm text-slate-400">
                    <Users className="w-4 h-4 text-brand-400" />
                    <span>{faces.length} people</span>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-1.5 text-sm text-slate-400">
                    <ImageIcon className="w-4 h-4 text-purple-400" />
                    <span>{images.length} photos · {totalPhotos} matches</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-dark-800 border border-white/5">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${view === "list" ? "bg-brand-500 text-black" : "text-slate-400 hover:text-white"}`}
            >
              <LayoutGrid className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setView("graph")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${view === "graph" ? "bg-brand-500 text-black" : "text-slate-400 hover:text-white"}`}
            >
              <Share2 className="w-4 h-4" />
              Graph
            </button>
          </div>
        </motion.div>

        {/* States */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
            <p className="text-slate-400">Loading results…</p>
          </div>
        )}
        {error && <div className="text-center py-20 text-red-400">Failed to load results.</div>}
        {!isLoading && !error && faces.length === 0 && (
          <div className="text-center py-20 text-slate-500">No faces were detected in your photos.</div>
        )}

        {/* Content */}
        {!isLoading && !error && faces.length > 0 && (
          <AnimatePresence mode="wait">
            {view === "list" ? (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ListView faces={faces} faceColorMap={faceColorMap} />
              </motion.div>
            ) : (
              <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative">
                <ReactFlowProvider>
                  <GraphCanvas images={images} faces={faces} faceColorMap={faceColorMap} />
                </ReactFlowProvider>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
