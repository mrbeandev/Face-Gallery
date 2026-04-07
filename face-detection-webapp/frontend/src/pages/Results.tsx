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
// Graph View — top grid of photos, bottom row of faces                //
// Photos spread in a square grid at top.                              //
// Person nodes in a single evenly-spaced row at bottom.              //
// Edges flow downward from photo → face.                              //
// ------------------------------------------------------------------ //

const PHOTO_W = 130;
const PHOTO_H = 152;
const PHOTO_GAP_X = 44;
const PHOTO_GAP_Y = 36;
const FACE_D = 100;
const FACE_GAP = 44;
const SECTION_GAP = 220; // vertical space between photo grid bottom and face row top

function buildGraph(
  images: ImageNode[],
  faces: UniqueFace[],
  faceColorMap: Map<string, string>,
  onPhotoDoubleClick: (img: ImageNode) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // ── Photo grid (top) ──────────────────────────────────────────────
  const cols = Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / cols);
  const gridW = cols * PHOTO_W + (cols - 1) * PHOTO_GAP_X;
  const gridH = rows * PHOTO_H + (rows - 1) * PHOTO_GAP_Y;
  const gridStartX = -gridW / 2;
  const gridStartY = 0;

  images.forEach((img, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = gridStartX + col * (PHOTO_W + PHOTO_GAP_X);
    const y = gridStartY + row * (PHOTO_H + PHOTO_GAP_Y);

    // Top border color: dominant person's color (most faces → first match)
    const topColor = img.faces.length > 0
      ? faceColorMap.get(img.faces[0].unique_face_id) ?? "transparent"
      : "transparent";

    nodes.push({
      id: `photo-${img.id}`,
      position: { x, y },
      sourcePosition: "bottom" as const,
      targetPosition: "top" as const,
      data: {
        label: (
          <div
            className="flex flex-col items-center gap-1 select-none w-full h-full"
            onDoubleClick={() => onPhotoDoubleClick(img)}
          >
            <div className="w-[106px] h-[106px] rounded-xl overflow-hidden border border-white/10 shrink-0">
              <img
                src={`${BASE}${img.image_url}`}
                alt={img.filename}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[10px] text-slate-200 truncate max-w-[116px] text-center font-medium leading-tight mt-0.5">
              {img.filename}
            </span>
            <span className="text-[9px] text-slate-500">
              {img.faces.length > 0
                ? `${img.faces.length} face${img.faces.length !== 1 ? "s" : ""}`
                : "no faces"
              }
              {" · dbl-click"}
            </span>
          </div>
        ),
      },
      style: {
        background: "linear-gradient(160deg, #161622 0%, #0e0e1c 100%)",
        border: `1.5px solid ${topColor !== "transparent" ? topColor + "55" : "rgba(255,255,255,0.07)"}`,
        borderTop: `3px solid ${topColor}`,
        borderRadius: "16px",
        width: PHOTO_W,
        height: PHOTO_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        boxShadow: topColor !== "transparent"
          ? `0 0 20px ${topColor}18, 0 6px 24px rgba(0,0,0,0.5)`
          : "0 6px 24px rgba(0,0,0,0.5)",
        padding: "10px 8px 8px",
      },
    });
  });

  // ── Face row (bottom) ─────────────────────────────────────────────
  const faceRowW = faces.length * FACE_D + (faces.length - 1) * FACE_GAP;
  const faceRowStartX = -faceRowW / 2;
  const faceRowY = gridStartY + gridH + SECTION_GAP;

  faces.forEach((face, i) => {
    const color = faceColorMap.get(face.id) ?? PERSON_COLORS[i % PERSON_COLORS.length];
    const x = faceRowStartX + i * (FACE_D + FACE_GAP);

    nodes.push({
      id: `face-${face.id}`,
      position: { x, y: faceRowY },
      sourcePosition: "bottom" as const,
      targetPosition: "top" as const,
      data: {
        label: (
          <div className="flex flex-col items-center gap-0.5 select-none">
            <div
              className="w-[62px] h-[62px] rounded-full overflow-hidden"
              style={{ boxShadow: `0 0 0 3px ${color}, 0 0 16px ${color}50` }}
            >
              <img
                src={`${BASE}${face.face_image_url}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[10px] font-bold mt-1" style={{ color }}>
              Person {i + 1}
            </span>
            <span className="text-[9px] text-slate-500">
              {face.matches.length} photo{face.matches.length !== 1 ? "s" : ""}
            </span>
          </div>
        ),
      },
      style: {
        background: `radial-gradient(circle at 40% 38%, ${color}10, #0a0a14)`,
        border: `2px solid ${color}50`,
        borderRadius: "50%",
        width: FACE_D,
        height: FACE_D,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 0 8px ${color}08, 0 0 40px ${color}20`,
      },
    });
  });

  // ── Edges: photo (bottom handle) → face (top handle) ─────────────
  images.forEach((img) => {
    img.faces.forEach((fm) => {
      const color = faceColorMap.get(fm.unique_face_id) ?? "#eab308";
      edges.push({
        id: `e-${img.id}-${fm.unique_face_id}`,
        source: `photo-${img.id}`,
        target: `face-${fm.unique_face_id}`,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeOpacity: 0.6,
          filter: `drop-shadow(0 0 3px ${color}70)`,
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
      <style>{`
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
