import { motion } from "framer-motion";
import type { PredictResponse } from "../types";

interface Props { result: PredictResponse; }

export default function ExplainPanel({ result }: Props) {
  const confPct  = Math.round(result.confidence * 100);
  const blurPct  = Math.round(result.quality.blur_score * 100);
  const brightPct = Math.round(result.quality.brightness_score * 100);

  const confReason =
    confPct >= 75 ? "Very high confidence — model is certain about detections." :
    confPct >= 50 ? "Moderate confidence — model has reasonable certainty." :
                    "Low confidence — model is uncertain. Improve image quality.";

  const qualityReason =
    result.quality.quality_flag === "GOOD"
      ? "Image quality is good — reliable input for inference."
      : "Poor image quality — results may be less reliable.";

  const decisionReason =
    result.decision === "AUTO_ACCEPT"  ? "High confidence with no empty slots — auto-accepted." :
    result.decision === "HUMAN_REVIEW" ? "Moderate confidence or defects present — human review recommended." :
                                         "Low confidence — result should be rejected and image recaptured.";

  const bars = [
    { label: "Avg Confidence",  value: result.confidence,              color: "var(--accent-blue)" },
    { label: "Blur Score",      value: result.quality.blur_score,      color: "var(--accent-purple)" },
    { label: "Brightness",      value: result.quality.brightness_score, color: "var(--accent-green)" },
    { label: "Fill Rate",       value: result.counts.total_slots > 0
        ? result.counts.pills / result.counts.total_slots : 0,          color: "var(--accent-orange)" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Reasoning cards */}
      <div className="flex flex-col gap-4">
        <ReasonCard title="Decision Reasoning"   text={decisionReason}  color="var(--accent-blue)" />
        <ReasonCard title="Confidence Analysis"  text={confReason}      color="var(--accent-green)" />
        <ReasonCard title="Image Quality Impact" text={qualityReason}   color="var(--accent-purple)" />
        <ReasonCard
          title="Defect Summary"
          text={
            result.prediction === "GOOD"
              ? `All ${result.counts.total_slots} slots filled. No missing pills detected.`
              : `${result.counts.empty_slots} empty slot(s) out of ${result.counts.total_slots} total. Status: ${result.prediction.replace("_", " ")}.`
          }
          color="var(--accent-red)"
        />
      </div>

      {/* Factor bars */}
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <p className="text-xs font-mono mb-4" style={{ color: "var(--text-muted)" }}>
          CONTRIBUTING FACTORS
        </p>
        <div className="flex flex-col gap-5">
          {bars.map(({ label, value, color }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: "var(--text-primary)" }}>{label}</span>
                <span className="font-mono" style={{ color }}>{Math.round(value * 100)}%</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(value * 100)}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Raw values */}
        <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-mono mb-3" style={{ color: "var(--text-muted)" }}>RAW VALUES</p>
          <div className="flex flex-col gap-1">
            <Row label="Avg Confidence"  value={result.confidence.toFixed(4)} />
            <Row label="Blur Variance"   value={result.quality.raw_blur_variance.toFixed(1)} />
            <Row label="Mean Brightness" value={`${brightPct}%`} />
            <Row label="Pills"           value={String(result.counts.pills)} />
            <Row label="Empty Slots"     value={String(result.counts.empty_slots)} />
            <Row label="Total Slots"     value={String(result.counts.total_slots)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReasonCard({ title, text, color }: { title: string; text: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-lg p-4"
      style={{
        background:  "var(--bg-card)",
        border:      `1px solid var(--border)`,
        borderLeft:  `4px solid ${color}`,
      }}
    >
      <p className="text-xs font-mono mb-1" style={{ color }}>{title.toUpperCase()}</p>
      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{text}</p>
    </motion.div>
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
