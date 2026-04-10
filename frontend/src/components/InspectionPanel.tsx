/**
 * InspectionPanel — Main inspection view with upload and results  v8
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Loader2 } from 'lucide-react';
import type { InspectResponse } from '../api/pharmasight';

interface Props {
  onUpload: (file: File) => Promise<void>;
  result:   InspectResponse | null;
  loading:  boolean;
  onReset:  () => void;
}

export default function InspectionPanel({ onUpload, result, loading, onReset }: Props) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onUpload(e.target.files[0]);
  };

  // ── Upload zone ──────────────────────────────────────────────────────
  if (!result) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative rounded-xl overflow-hidden cursor-pointer transition-all hud-corners ${
            dragActive ? 'glow-cyan' : ''
          }`}
          style={{
            minHeight:      '500px',
            background:     'rgba(13, 17, 23, 0.6)',
            backdropFilter: 'blur(12px)',
            border:         dragActive
              ? '2px solid #00d4ff'
              : '2px solid rgba(0, 212, 255, 0.3)',
          }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-400/20" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/20" />
            <div className="absolute top-1/2 left-1/2 w-16 h-16 border-2 border-cyan-400/40 rounded-full -translate-x-1/2 -translate-y-1/2" />
          </div>

          {loading && <div className="scanline" />}

          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4">
              <Loader2 size={56} className="text-cyan-400 animate-spin" />
              <div className="text-cyan-400 font-mono text-lg tracking-widest">ANALYZING IMAGE…</div>
              <div className="text-gray-500 text-sm font-mono">RUNNING YOLO + QUALITY PIPELINE</div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
              <Upload size={64} className="text-cyan-400/45" />
              <div className="text-center">
                <div className="text-xl font-mono text-cyan-400 mb-2 tracking-wider">
                  DROP BLISTER PACK IMAGE
                </div>
                <div className="text-sm text-gray-500 metric-label">OR CLICK TO BROWSE FILES</div>
              </div>
              <div className="flex gap-6 text-xs font-mono text-gray-600">
                <span>JPG</span><span>PNG</span><span>WEBP</span>
              </div>
            </div>
          )}

          <input
            id="file-input"
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      </motion.div>
    );
  }

  // ── Results view ─────────────────────────────────────────────────────
  const pillCount   = result.detection?.pill_count   ?? 0;
  const defectCount = result.detection?.defect_count ?? 0;
  const trustScore  = result.trust?.trust_score      ?? 0;
  const fillRate    = result.quality?.fill_rate      ?? 0;
  const inferenceMs = result.inference_ms            ?? 0;

  // 🔥 NEW VALIDATION FIELDS
  const validationScore = result.trust?.validation_score ?? 0;
  const override = result.trust?.override ?? false;
  const issues = result.trust?.validation_issues ?? [];

  const decisionColor = result.trust?.decision_color ?? 'red';
  const decisionLabel = result.trust?.decision_label ?? 'REVIEW';

  const decisionStyle = {
    green:  { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.08)'  },
    yellow: { color: '#f59e0b', border: 'rgba(245,158,11,0.5)',  bg: 'rgba(245,158,11,0.08)'  },
    red:    { color: '#ef4444', border: 'rgba(239,68,68,0.5)',   bg: 'rgba(239,68,68,0.08)'   },
  }[decisionColor] ?? { color: '#ef4444', border: 'rgba(239,68,68,0.5)', bg: 'rgba(239,68,68,0.08)' };
// 🔥 ONLY SHOWING UPDATED PARTS — rest unchanged

// ADD THIS ABOVE return (after decisionStyle)

  const ISSUE_MAP: Record<string, { text: string; severity: "critical" | "warning" }> = {
  // 🔴 PRODUCT DEFECT
  missing_pills_detected: {
    text: "Missing pills detected in blister pack",
    severity: "critical"
  },

  // 🔴 SCENE ISSUES
  obstruction_detected: {
    text: "Object blocking blister pack (hand / foreign object)",
    severity: "critical"
  },
  multiple_packs: {
    text: "Multiple blister packs detected in frame",
    severity: "critical"
  },
  grid_broken: {
    text: "Blister layout inconsistent — grid structure unreliable",
    severity: "warning"
  },

  // 🟡 OPTIONAL FUTURE
  low_confidence: {
    text: "Detection confidence is low",
    severity: "warning"
  }
};

  // 🔥 GROUP ISSUES
  const criticalIssues = issues.filter(i => ISSUE_MAP[i]?.severity === "critical");
  const warningIssues  = issues.filter(i => ISSUE_MAP[i]?.severity === "warning");
  return (
    <div className="space-y-6">

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative rounded-xl glass-card hud-corners overflow-hidden"
        style={{ border: '2px solid rgba(0, 212, 255, 0.3)' }}
      >
        <div className="scanline pointer-events-none" />

        {/* 🔥 UPDATED DECISION BADGE */}
        <div
          className="absolute top-4 right-4 z-20 px-4 py-2 rounded-lg font-mono font-bold text-lg tracking-widest"
          style={{
            background: decisionStyle.bg,
            border:     `2px solid ${decisionStyle.border}`,
            color:      decisionStyle.color,
          }}
        >
          <div className="flex flex-col items-center">
            <div>{decisionLabel}</div>

            {override && (
              <div className="text-xs mt-1 text-red-400 font-mono tracking-wide">
                🚨 SAFETY OVERRIDE
              </div>
            )}
          </div>
        </div>

        <div style={{ width: '100%', textAlign: 'center', padding: '20px' }}>
          {result.image ? (
            <img
              src={result.image}
              alt="Annotated blister pack inspection"
              className="inspection-image"
              style={{
                maxWidth:   '100%',
                width:      'auto',
                margin:     '0 auto',
                display:    'block',
                objectFit:  'contain',
              }}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-600 font-mono text-sm">
              IMAGE NOT AVAILABLE
            </div>
          )}
        </div>

        {/* 🔥 UPDATED HUD */}
        <div
          className="absolute bottom-0 left-0 right-0 p-4"
          style={{
            background:     'linear-gradient(to top, rgba(10,14,26,0.97), transparent)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <HUDCard label="PILLS DETECTED" value={String(pillCount)} color="#10b981" />
            <HUDCard label="DEFECTS"        value={String(defectCount)} color="#ef4444" />
            <HUDCard label="TRUST SCORE"    value={trustScore.toFixed(1)} color="#00d4ff" />
            <HUDCard label="VALIDATION"     value={validationScore.toFixed(1)} color={override ? "#ef4444" : "#10b981"} />
            <HUDCard label="FILL RATE"      value={`${fillRate.toFixed(1)}%`} color="#3b82f6" />
          </div>
        </div>
      </motion.div>
      
      {issues.includes("missing_pills_detected") && (
        <div className="glass-card p-4 rounded-xl border border-red-500/50 bg-red-500/10 text-center">
          <div className="text-red-400 font-mono text-lg font-bold tracking-wider">
             REJECTED — PRODUCT DEFECT
          </div>
          <div className="text-red-300 text-sm mt-1">
            Missing pills detected in blister pack
          </div>
        </div>
      )}
      {!issues.includes("missing_pills_detected") && override && decisionLabel === "REJECT" && (
      <div className="glass-card p-4 rounded-xl border border-yellow-500/50 bg-yellow-500/10 text-center">
        <div className="text-yellow-400 font-mono text-lg font-bold tracking-wider">
          ⚠️ REJECTED — CAMERA ISSUE
        </div>
        <div className="text-yellow-300 text-sm mt-1">
          Image quality or scene conditions are unreliable
        </div>
      </div>
    )}
      {/* 🔥 VALIDATION ISSUES PANEL - Only show when decision is REJECT */}
      {issues.length > 0 && decisionLabel === "REJECT" && (
        <div className="glass-card p-5 rounded-xl border border-red-500/40 space-y-4">

          {/* 🚨 HEADER */}
          <div className="text-red-400 font-mono text-lg font-bold tracking-wider">
            🚨 VALIDATION FAILURE — SAMPLE REJECTED
          </div>

          {/* 🔴 CRITICAL */}
          {criticalIssues.length > 0 && (
            <div>
              <div className="text-red-300 font-mono text-sm mb-2 tracking-wide">
                CRITICAL ISSUES
              </div>
              <div className="space-y-2">
                {criticalIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm font-mono text-red-200"
                  >
                    ⚠️ {ISSUE_MAP[issue]?.text ?? issue}
                  </div>
                ))}
              </div>
            </div>
          )}

    {/* 🟡 WARNINGS */}
    {warningIssues.length > 0 && (
      <div>
        <div className="text-yellow-300 font-mono text-sm mb-2 tracking-wide">
          SECONDARY WARNINGS
        </div>
        <div className="space-y-2">
          {warningIssues.map((issue, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 text-sm font-mono text-yellow-200"
            >
              ⚠️ {ISSUE_MAP[issue]?.text ?? issue}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500">
          <div>INFERENCE: <span className="text-cyan-400">{inferenceMs}ms</span></div>
          <div>MODEL: <span className="text-cyan-400">{result.model_version}</span></div>
          <div>
            METHOD:{' '}
            <span className="text-cyan-400">
              {result.detection?.detection_method?.toUpperCase() ?? 'YOLO'}
            </span>
          </div>
          <div>TIME: <span className="text-cyan-400">{new Date().toLocaleTimeString()}</span></div>
        </div>

        <button
          onClick={onReset}
          className="px-6 py-2.5 rounded-lg font-mono text-sm font-semibold transition-all glass-card"
          style={{ color: '#00d4ff', borderColor: 'rgba(0,212,255,0.3)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#00d4ff')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)')}
        >
          UPLOAD NEW IMAGE
        </button>
      </div>
    </div>
  );
}

function HUDCard({
  label, value, color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="glass-card p-3 rounded-lg">
      <div className="metric-label mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color }}>
        {value}
      </div>
    </div>
  );
}