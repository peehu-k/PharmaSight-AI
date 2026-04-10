import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Send, CheckCircle } from "lucide-react";
import type { PredictResponse } from "../types";

interface Props { result: PredictResponse; }

const CORRECTION_TYPES = [
  "Wrong classification",
  "Missed detection",
  "False positive",
  "Other",
];

export default function FeedbackPanel({ result }: Props) {
  const [open, setOpen]         = useState(false);
  const [type, setType]         = useState(CORRECTION_TYPES[0]);
  const [notes, setNotes]       = useState("");
  const [critical, setCritical] = useState(false);
  const [sent, setSent]         = useState(false);
  const [sending, setSending]   = useState(false);

  const submit = async () => {
    setSending(true);
    try {
      await fetch("http://127.0.0.1:8000/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correction_type: type, notes, critical, ai_result: result }),
      });
    } catch {
      // Feedback endpoint is optional — don't block UI
    }
    setSending(false);
    setSent(true);
    setTimeout(() => { setSent(false); setNotes(""); setCritical(false); }, 3000);
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="font-mono text-xs">SUBMIT CORRECTION</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 flex flex-col gap-3 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              {sent ? (
                <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--accent-green)" }}>
                  <CheckCircle size={16} />
                  Correction logged. Thank you.
                </div>
              ) : (
                <>
                  <div className="mt-3">
                    <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                      Correction Type
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full rounded px-3 py-2 text-sm"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {CORRECTION_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                      Inspector Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Describe the issue..."
                      className="w-full rounded px-3 py-2 text-sm resize-none"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setCritical(!critical)}
                      className="w-10 h-5 rounded-full transition-all relative"
                      style={{ background: critical ? "var(--accent-red)" : "var(--border)" }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: critical ? "calc(100% - 18px)" : "2px" }}
                      />
                    </div>
                    <span className="text-xs" style={{ color: critical ? "var(--accent-red)" : "var(--text-muted)" }}>
                      Critical error (missed defect in production)
                    </span>
                  </label>

                  <button
                    onClick={submit}
                    disabled={sending}
                    className="flex items-center justify-center gap-2 py-2 rounded text-sm font-medium"
                    style={{ background: "var(--accent-blue)", color: "#fff", opacity: sending ? 0.6 : 1 }}
                  >
                    <Send size={14} />
                    {sending ? "Submitting..." : "Submit Correction"}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
