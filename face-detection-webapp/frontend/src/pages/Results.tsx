import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, useNodesState, useEdgesState,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutGrid, Share2, ArrowLeft, X, Users, ImageIcon, Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { jobsApi, type UniqueFace } from "../api/client";

const BASE = "http://localhost:8000";

// Pastel palette for person colors
const COLORS = [
  "#eab308", "#8b5cf6", "#06b6d4", "#10b981", "#f43f5e",
  "#f97316", "#3b82f6", "#ec4899", "#14b8a6", "#84cc16",
];

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
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        className="absolute left-4 text-white/60 hover:text-white p-2"
      >
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
      <button
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        className="absolute right-4 text-white/60 hover:text-white p-2"
      >
        <ChevronRight className="w-8 h-8" />
      </button>
    </motion.div>
  );
}

// ------------------------------------------------------------------ //
// List View                                                            //
// ------------------------------------------------------------------ //
function ListView({ faces }: { faces: UniqueFace[] }) {
  const [lightbox, setLightbox] = useState<{ faceIdx: number; imgIdx: number } | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {faces.map((face, fi) => {
          const color = COLORS[fi % COLORS.length];
          const images = face.matches.map((m) => ({ url: m.image_url, name: m.filename }));

          return (
            <motion.div
              key={face.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: fi * 0.05 }}
              className="card flex flex-col"
            >
              {/* Face header */}
              <div className="p-5 flex items-center gap-4" style={{ borderBottom: `1px solid ${color}20` }}>
                <div
                  className="w-16 h-16 rounded-full overflow-hidden shrink-0 ring-2"
                  style={{ ringColor: color, boxShadow: `0 0 0 2px ${color}60` }}
                >
                  <img
                    src={`${BASE}${face.face_image_url}`}
                    alt="Face"
                    className="w-full h-full object-cover"
                  />
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

              {/* Photo strip */}
              {face.matches.length > 0 ? (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {face.matches.map((m, mi) => (
                    <button
                      key={m.image_id}
                      onClick={() => setLightbox({ faceIdx: fi, imgIdx: mi })}
                      className="shrink-0 w-20 h-20 rounded-xl overflow-hidden hover:ring-2 hover:ring-brand-400 transition-all"
                      style={{ outline: "none" }}
                    >
                      <img
                        src={`${BASE}${m.image_url}`}
                        alt={m.filename}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-slate-600 text-sm">
                  No matches found
                </div>
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
            onPrev={() => setLightbox((lb) => lb && {
              ...lb,
              imgIdx: (lb.imgIdx - 1 + faces[lb.faceIdx].matches.length) % faces[lb.faceIdx].matches.length,
            })}
            onNext={() => setLightbox((lb) => lb && {
              ...lb,
              imgIdx: (lb.imgIdx + 1) % faces[lb.faceIdx].matches.length,
            })}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------------ //
// Graph View                                                           //
// ------------------------------------------------------------------ //

function buildGraph(faces: UniqueFace[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const centerX = 600;
  const centerY = 400;
  const faceRadius = Math.min(350, 120 * faces.length);

  faces.forEach((face, fi) => {
    const color = COLORS[fi % COLORS.length];
    const angle = (fi / faces.length) * Math.PI * 2 - Math.PI / 2;
    const fx = centerX + Math.cos(angle) * faceRadius;
    const fy = centerY + Math.sin(angle) * faceRadius;

    // Person node
    nodes.push({
      id: `face-${face.id}`,
      type: "default",
      position: { x: fx, y: fy },
      data: {
        label: (
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-16 h-16 rounded-full overflow-hidden"
              style={{ boxShadow: `0 0 0 3px ${color}` }}
            >
              <img src={`${BASE}${face.face_image_url}`} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs font-semibold text-white mt-1">Person {fi + 1}</span>
            <span className="text-[10px]" style={{ color }}>{face.matches.length} photos</span>
          </div>
        ),
      },
      style: {
        background: "#1a1a26",
        border: `2px solid ${color}60`,
        borderRadius: "50%",
        width: 110,
        height: 110,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 24px ${color}20`,
      },
    });

    // Photo nodes arranged around each person node
    const matchCount = face.matches.length;
    face.matches.forEach((match, mi) => {
      const photoAngle = angle + ((mi - (matchCount - 1) / 2) * (Math.PI / Math.max(matchCount, 4)));
      const photoRadius = 200 + Math.random() * 40;
      const px = fx + Math.cos(photoAngle) * photoRadius;
      const py = fy + Math.sin(photoAngle) * photoRadius;

      const nodeId = `img-${match.image_id}-face-${fi}`;

      nodes.push({
        id: nodeId,
        type: "default",
        position: { x: px, y: py },
        data: {
          label: (
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg overflow-hidden">
                <img src={`${BASE}${match.image_url}`} alt="" className="w-full h-full object-cover" />
              </div>
              <span className="text-[9px] text-slate-400 truncate max-w-[80px]">{match.filename}</span>
            </div>
          ),
        },
        style: {
          background: "#12121a",
          border: `1px solid ${color}30`,
          borderRadius: "12px",
          width: 90,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      });

      edges.push({
        id: `e-${face.id}-${match.image_id}-${fi}`,
        source: `face-${face.id}`,
        target: nodeId,
        animated: true,
        style: { stroke: color, strokeWidth: 1.5, strokeOpacity: 0.4 },
      });
    });
  });

  return { nodes, edges };
}

function GraphView({ faces }: { faces: UniqueFace[] }) {
  const { nodes: initNodes, edges: initEdges } = buildGraph(faces);
  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, , onEdgesChange] = useEdgesState(initEdges);

  return (
    <div className="w-full h-[calc(100vh-220px)] rounded-2xl overflow-hidden border border-white/5">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.2}
        maxZoom={2}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} color="#ffffff08" />
        <Controls className="!bg-dark-800 !border-white/10" />
        <MiniMap
          style={{ background: "#12121a", border: "1px solid rgba(255,255,255,0.05)" }}
          nodeColor={(n) => {
            const faceIdx = parseInt((n.id.match(/face-\S+-(\d+)/) || [])[1] ?? "0");
            return COLORS[faceIdx % COLORS.length] + "80";
          }}
        />
      </ReactFlow>
    </div>
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
  const totalPhotos = faces.reduce((s, f) => s + f.matches.length, 0);

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
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
                    <span>{totalPhotos} photo matches</span>
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

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
            <p className="text-slate-400">Loading results…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-20 text-red-400">Failed to load results.</div>
        )}

        {/* Empty */}
        {!isLoading && !error && faces.length === 0 && (
          <div className="text-center py-20 text-slate-500">No faces were found in your photos.</div>
        )}

        {/* Content */}
        {!isLoading && !error && faces.length > 0 && (
          <AnimatePresence mode="wait">
            {view === "list" ? (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ListView faces={faces} />
              </motion.div>
            ) : (
              <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <GraphView faces={faces} />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
