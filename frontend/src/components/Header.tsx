import { motion } from "framer-motion";
import { Cpu } from "lucide-react";
import type { PredictResponse } from "../types";

interface Props { result: PredictResponse | null; }

export default function Header({ result }: Props) {
  return (
    <header
      className="border-b px-6 py-4 flex items-center justify-between"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ background: "rgba(59,130,246,0.15)" }}>
          <Cpu size={20} style={{ color: "var(--accent-blue)" }} />
        </div>
        <div>
          <h1
            className="font-mono text-lg font-medium tracking-widest"
            style={{ color: "var(--text-primary)" }}
          >
            PHARMASIGHT
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Blister Pack Inspection System
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {result && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs font-mono"
            style={{ color: "var(--text-muted)" }}
          >
            {result.model_version} · {result.inference_ms}ms
          </motion.div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--accent-green)" }}
          />
          <span style={{ color: "var(--text-muted)" }}>SYSTEM ONLINE</span>
        </div>
      </div>
    </header>
  );
}
