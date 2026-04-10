import { motion } from "framer-motion";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import type { PredictResponse } from "../types";

interface Props { result: PredictResponse; }

const PREDICTION_CONFIG = {
  GOOD:            { color: "var(--accent-green)",  glow: "glow-green",  icon: CheckCircle,   label: "GOOD" },
  MINOR_DEFECT:    { color: "var(--accent-orange)", glow: "glow-orange", icon: AlertTriangle, label: "MINOR DEFECT" },
  CRITICAL_DEFECT: { color: "var(--accent-red)",    glow: "glow-red",    icon: XCircle,       label: "CRITICAL DEFECT" },
};

const DECISION_CONFIG = {
  AUTO_ACCEPT:  { color: "var(--accent-green)",  label: "AUTO ACCEPT" },
  HUMAN_REVIEW: { color: "var(--accent-orange)", label: "HUMAN REVIEW" },
  REJECT:       { color: "var(--accent-red)",    label: "REJECT" },
};

export default function ResultsPanel({ result }: Props) {
  const pcfg = PREDICTION_CONFIG[result.prediction] ?? PREDICTION_CONFIG.MINOR_DEFECT;
  const dcfg = DECISION_CONFIG[result.decision]     ?? DECISION_CONFIG.HUMAN_REVIEW;
  const Icon = pcfg.icon;
  const confPct = Math.round(result.confidence * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Prediction badge */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className={`rounded-xl border p-5 ${pcfg.glow}`}
        style={{ background: "var(--bg-card)", borderColor: pcfg.color }}
      >
        <div className="flex items-center gap-3 mb-1">
          <Icon size={26} style={{ color: pcfg.color }} />
          <span className="font-mono text-xl font-medium" style={{ color: pcfg.color }}>
            {pcfg.label}
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {result.counts.empty_slots === 0
            ? "All slots filled — no missing pills detected."
            : `${result.counts.empty_slots} empty slot(s) detected out of ${result.counts.total_slots} total.`}
        </p>
      </motion.div>

      {/* Counts row */}
      <div className="grid grid-cols-3 gap-3">
        <CountCard label="PILLS"        value={result.counts.pills}       color="var(--accent-green)" />
        <CountCard label="EMPTY SLOTS"  value={result.counts.empty_slots} color="var(--accent-red)" />
        <CountCard label="TOTAL SLOTS"  value={result.counts.total_slots} color="var(--accent-blue)" />
      </div>

      {/* Confidence meter */}
      <div
        className="rounded-xl border p-4"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex justify-between text-xs mb-2">
          <span className="font-mono" style={{ color: "var(--text-muted)" }}>AVG CONFIDENCE</span>
          <span className="font-mono" style={{ color: "var(--accent-blue)" }}>{confPct}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: confPct >= 75 ? "var(--accent-green)" : confPct >= 50 ? "var(--accent-orange)" : "var(--accent-red)" }}
            initial={{ width: 0 }}
            animate={{ width: `${confPct}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Decision */}
      <div
        className="rounded-xl border p-4 flex items-center justify-between"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>DECISION</span>
        <span
          className="font-mono text-sm font-medium px-3 py-1 rounded"
          style={{ background: `${dcfg.color}18`, color: dcfg.color, border: `1px solid ${dcfg.color}` }}
        >
          {dcfg.label}
        </span>
      </div>

      {/* Detection list */}
      {result.detections.length > 0 && (
        <div
          className="rounded-xl border p-4"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <p className="text-xs font-mono mb-3" style={{ color: "var(--text-muted)" }}>
            DETECTIONS ({result.detections.length})
          </p>
          <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
            {result.detections.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs py-1 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="font-mono"
                  style={{ color: d.class_name === "pill" ? "var(--accent-green)" : "var(--accent-red)" }}
                >
                  {d.class_name}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {Math.round(d.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CountCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-3 flex flex-col items-center justify-center"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <p className="text-xs font-mono mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <motion.p
        className="font-mono text-2xl font-medium"
        style={{ color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {value}
      </motion.p>
    </motion.div>
  );
}
