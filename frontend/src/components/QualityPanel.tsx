import { motion } from "framer-motion";
import type { QualityMetrics } from "../types";

interface Props { quality: QualityMetrics | undefined; }

export default function QualityPanel({ quality }: Props) {
  if (!quality) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border text-sm"
        style={{ borderColor: "rgba(255,255,255,0.1)", color: "#9ca3af" }}>
        Upload an image to see quality metrics
      </div>
    );
  }

  const blurPct       = Math.round((quality.blur_score ?? 0) * 100);
  const brightnessPct = Math.round((quality.brightness_score ?? 0) * 100);
  const isGood        = quality.quality_flag === "GOOD";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Bars */}
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <p className="text-xs font-mono mb-5" style={{ color: "var(--text-muted)" }}>
          IMAGE QUALITY METRICS
        </p>

        <Gauge
          label="Sharpness (Blur Score)"
          value={blurPct}
          desc="Laplacian variance — higher means sharper image"
          color={blurPct >= 30 ? "var(--accent-green)" : "var(--accent-red)"}
        />
        <div className="mt-5">
          <Gauge
            label="Brightness"
            value={brightnessPct}
            desc="Mean pixel intensity — ideal range 15–90%"
            color={brightnessPct >= 15 && brightnessPct <= 90 ? "var(--accent-green)" : "var(--accent-orange)"}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-col gap-4">
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <p className="text-xs font-mono mb-4" style={{ color: "var(--text-muted)" }}>
            QUALITY FLAG
          </p>
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{
              background: isGood ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${isGood ? "var(--accent-green)" : "var(--accent-red)"}`,
            }}
          >
            <span
              className="font-mono text-lg font-medium"
              style={{ color: isGood ? "var(--accent-green)" : "var(--accent-red)" }}
            >
              {quality.quality_flag}
            </span>
          </div>
        </div>

        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <p className="text-xs font-mono mb-3" style={{ color: "var(--text-muted)" }}>
            RAW MEASUREMENTS
          </p>
          <div className="flex flex-col gap-2">
            <Row label="Blur Variance"   value={(quality.raw_blur_variance ?? 0).toFixed(1)} />
            <Row label="Mean Brightness" value={`${Math.round((quality.mean_brightness ?? 0) * 100)}%`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Gauge({ label, value, desc, color }: {
  label: string; value: number; desc: string; color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        <span className="font-mono" style={{ color }}>{value}%</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{desc}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="font-mono" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
