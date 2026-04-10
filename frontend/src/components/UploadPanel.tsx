import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, Loader2 } from "lucide-react";
import type { PredictResponse } from "../types";

interface Props {
  onUpload: (f: File) => void;
  loading:  boolean;
  imageUrl: string | null;
  result:   PredictResponse | null;
}

// Colour per class
const CLASS_COLORS: Record<string, string> = {
  pill:       "#10b981",  // green
  empty_slot: "#ef4444",  // red
};

export default function UploadPanel({ onUpload, loading, imageUrl, result }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Natural image dimensions for bbox scaling
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null);
  // Rendered image dimensions
  const [renderedDims, setRenderedDims] = useState<{ w: number; h: number } | null>(null);

  const handle = (f: File) => {
    if (f.type.startsWith("image/")) {
      setNaturalDims(null);
      setRenderedDims(null);
      onUpload(f);
    }
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Image Input
        </span>
        {result && (
          <span
            className="text-xs font-mono px-2 py-1 rounded"
            style={{ background: "rgba(59,130,246,0.1)", color: "var(--accent-blue)" }}
          >
            {result.counts.total_slots} SLOTS DETECTED
          </span>
        )}
      </div>

      <div className="p-4">
        <div
          onClick={() => !loading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handle(f);
          }}
          className="relative rounded-lg overflow-hidden cursor-pointer"
          style={{
            minHeight: 260,
            border: `2px dashed ${dragging ? "var(--accent-blue)" : "var(--border)"}`,
            background: dragging ? "rgba(59,130,246,0.05)" : "var(--bg-secondary)",
          }}
        >
          {/* Loading overlay */}
          {loading && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center z-10"
              style={{ background: "rgba(8,11,18,0.85)" }}
            >
              <Loader2 size={32} className="animate-spin mb-3" style={{ color: "var(--accent-blue)" }} />
              <p className="text-sm font-mono" style={{ color: "var(--accent-blue)" }}>ANALYZING...</p>
            </div>
          )}

          {imageUrl ? (
            <div className="relative inline-block w-full">
              <img
                src={imageUrl}
                alt="uploaded"
                className="w-full object-contain"
                style={{ maxHeight: 360, display: "block" }}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setNaturalDims({ w: el.naturalWidth, h: el.naturalHeight });
                  setRenderedDims({ w: el.clientWidth, h: el.clientHeight });
                }}
              />
              {/* Bounding box overlay */}
              {result && naturalDims && renderedDims && (
                <BBoxOverlay
                  detections={result.detections}
                  naturalDims={naturalDims}
                  renderedDims={renderedDims}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Upload size={36} style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Drop blister pack image here
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>or click to browse</p>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
        />
      </div>
    </div>
  );
}

function BBoxOverlay({
  detections,
  naturalDims,
  renderedDims,
}: {
  detections: PredictResponse["detections"];
  naturalDims: { w: number; h: number };
  renderedDims: { w: number; h: number };
}) {
  const scaleX = renderedDims.w / naturalDims.w;
  const scaleY = renderedDims.h / naturalDims.h;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((d, i) => {
        const [x1, y1, x2, y2] = d.bbox;
        const left   = x1 * scaleX;
        const top    = y1 * scaleY;
        const width  = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;
        const color  = CLASS_COLORS[d.class_name] ?? "#8b5cf6";

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            className="absolute border-2 rounded-sm"
            style={{ left, top, width, height, borderColor: color }}
          >
            <span
              className="absolute -top-5 left-0 text-xs font-mono px-1 whitespace-nowrap"
              style={{ background: color, color: "#000", fontSize: 10 }}
            >
              {d.class_name} {Math.round(d.confidence * 100)}%
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
