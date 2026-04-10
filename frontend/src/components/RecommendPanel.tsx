import { motion } from "framer-motion";
import { AlertTriangle, Info, Zap } from "lucide-react";
import type { Recommendation } from "../types";

interface Props { recommendations: Recommendation[]; }

const IMPACT_CONFIG = {
  high:   { color: "var(--accent-red)",    icon: Zap,           label: "HIGH" },
  medium: { color: "var(--accent-orange)", icon: AlertTriangle, label: "MEDIUM" },
  low:    { color: "var(--accent-green)",  icon: Info,          label: "LOW" },
};

export default function RecommendPanel({ recommendations }: Props) {
  return (
    <div className="rounded-xl border p-5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-xs font-mono mb-4" style={{ color: "var(--text-muted)" }}>
        RECOMMENDATIONS ({recommendations.length})
      </p>
      <div className="flex flex-col gap-3">
        {recommendations.map((r, i) => {
          const cfg = IMPACT_CONFIG[r.impact] ?? IMPACT_CONFIG.low;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-lg p-3 border"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} style={{ color: cfg.color }} />
                <span className="text-xs font-mono" style={{ color: cfg.color }}>{cfg.label} IMPACT</span>
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                {r.issue}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>→ {r.suggestion}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
