/**
 * RecommendationsPanel — Actionable improvement recommendations  v7
 *
 * Fixes:
 * - Recommendation imported from pharmasight.ts (no local redefinition)
 * - Priority badge colors correct: CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=green
 * - impact_estimate key correctly read (was sometimes read as "impact")
 * - Metric value and threshold shown with correct units
 * - Collapsible message area with full detail on expand
 * - Empty state handled gracefully
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertOctagon, AlertTriangle, Info, CheckCircle2,
  ChevronDown, ChevronUp, Zap, Target, TrendingUp,
} from 'lucide-react';
import type { Recommendation } from '../api/pharmasight';

interface Props {
  recommendations: Recommendation[] | undefined;
}

const PRIORITY_CONFIG = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)',  Icon: AlertOctagon,  glow: 'rgba(239,68,68,0.2)'  },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.4)', Icon: AlertTriangle, glow: 'rgba(249,115,22,0.15)' },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.4)', Icon: Info,          glow: 'rgba(245,158,11,0.12)' },
  LOW:      { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.4)', Icon: CheckCircle2,  glow: 'rgba(16,185,129,0.10)' },
} as const;

export default function RecommendationsPanel({ recommendations }: Props) {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl glass-card gap-4">
        <CheckCircle2 size={40} className="text-green-400 opacity-60" />
        <div className="text-sm metric-label text-gray-500">
          UPLOAD AN IMAGE TO SEE RECOMMENDATIONS
        </div>
      </div>
    );
  }

  // Check if all nominal
  const isNominal =
    recommendations.length === 1 &&
    recommendations[0].metric_name === 'overall';

  if (isNominal) {
    return <NominalState rec={recommendations[0]} />;
  }

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl glass-card"
        style={{ borderColor: 'rgba(0,212,255,0.20)' }}
      >
        <div>
          <div className="text-xl font-mono font-bold metric-label">
            {recommendations.length} RECOMMENDATION{recommendations.length > 1 ? 'S' : ''}
          </div>
          <div className="text-xs text-gray-500 font-mono mt-1">
            Sorted by severity — address CRITICAL issues first
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => {
            const count = recommendations.filter(r => r.priority === p).length;
            if (!count) return null;
            const cfg = PRIORITY_CONFIG[p];
            return (
              <span
                key={p}
                className="px-3 py-1 rounded-full text-xs font-mono font-bold"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
              >
                {count} {p}
              </span>
            );
          })}
        </div>
      </motion.div>

      {/* Recommendation cards */}
      {recommendations.map((rec, idx) => (
        <RecommendationCard key={rec.id ?? idx} rec={rec} idx={idx} />
      ))}
    </div>
  );
}

// ── Recommendation Card ────────────────────────────────────────────────────

function RecommendationCard({ rec, idx }: { rec: Recommendation; idx: number }) {
  const [expanded, setExpanded] = useState(idx === 0); // first card open by default

  const priority = (rec.priority ?? 'MEDIUM') as keyof typeof PRIORITY_CONFIG;
  const cfg      = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.MEDIUM;
  const { Icon } = cfg;

  const metricDisplayName = (rec.metric_name ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.06 }}
      className="rounded-xl glass-card overflow-hidden"
      style={{
        borderColor: cfg.border,
        boxShadow:   `0 0 16px ${cfg.glow}`,
      }}
    >
      {/* Card header — always visible, click to expand */}
      <button
        className="w-full text-left p-5 flex items-start gap-4 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <motion.div
          animate={priority === 'CRITICAL' ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="flex-shrink-0 mt-0.5"
        >
          <Icon size={26} style={{ color: cfg.color }} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
            >
              {priority}
            </span>
            <span className="text-xs font-mono text-gray-500">{metricDisplayName}</span>
            {rec.metric_value !== undefined && rec.threshold !== undefined && (
              <span className="text-xs font-mono text-gray-600">
                {rec.metric_value.toFixed(1)} / threshold {rec.threshold.toFixed(1)}
              </span>
            )}
          </div>

          <div className="text-base font-semibold text-gray-100 leading-snug">
            {rec.title}
          </div>
        </div>

        <div className="flex-shrink-0 ml-2 mt-1" style={{ color: '#64748b' }}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-5 pb-5 space-y-4"
              style={{ borderTop: `1px solid ${cfg.border}40` }}
            >
              {/* Metric progress bar */}
              {rec.metric_value !== undefined && rec.threshold !== undefined && (
                <div className="pt-4">
                  <div className="flex justify-between text-xs font-mono text-gray-500 mb-1.5">
                    <span>CURRENT VALUE</span>
                    <span style={{ color: cfg.color }}>
                      {rec.metric_value.toFixed(1)} / {rec.threshold.toFixed(1)} threshold
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}aa)`,
                        boxShadow:  `0 0 6px ${cfg.color}60`,
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(100, (rec.metric_value / Math.max(rec.threshold * 1.5, 100)) * 100)}%`,
                      }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                    />
                  </div>
                  {rec.relative_gap !== undefined && (
                    <div className="text-[10px] font-mono text-gray-600 mt-1">
                      {(rec.relative_gap * 100).toFixed(1)}% below threshold
                    </div>
                  )}
                </div>
              )}

              {/* Problem description */}
              <div
                className="p-4 rounded-lg text-sm text-gray-300 leading-relaxed"
                style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${cfg.border}25` }}
              >
                <div className="font-mono text-[10px] tracking-widest text-gray-600 mb-2">
                  PROBLEM
                </div>
                {rec.message}
              </div>

              {/* Recommended action */}
              <div
                className="p-4 rounded-lg text-sm leading-relaxed"
                style={{ background: `${cfg.bg}`, border: `1px solid ${cfg.border}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={14} style={{ color: cfg.color }} />
                  <div className="font-mono text-[10px] tracking-widest" style={{ color: cfg.color }}>
                    RECOMMENDED ACTION
                  </div>
                </div>
                <div className="text-gray-200">{rec.action}</div>
              </div>

              {/* Expected impact */}
              {rec.impact_estimate && (
                <div
                  className="p-4 rounded-lg text-sm leading-relaxed"
                  style={{
                    background: 'rgba(16,185,129,0.06)',
                    border:     '1px solid rgba(16,185,129,0.25)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={14} className="text-green-400" />
                    <div className="font-mono text-[10px] tracking-widest text-green-400">
                      EXPECTED IMPACT
                    </div>
                  </div>
                  <div className="text-gray-300">{rec.impact_estimate}</div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Nominal state ─────────────────────────────────────────────────────────

function NominalState({ rec }: { rec: Recommendation }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-8 rounded-xl glass-card text-center relative overflow-hidden"
      style={{
        borderColor: 'rgba(16,185,129,0.4)',
        boxShadow:   '0 0 30px rgba(16,185,129,0.12)',
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="flex justify-center mb-4"
      >
        <CheckCircle2 size={48} className="text-green-400" />
      </motion.div>
      <div className="text-2xl font-mono font-bold text-green-400 mb-3">
        ALL SYSTEMS NOMINAL
      </div>
      <div className="text-gray-400 max-w-lg mx-auto leading-relaxed mb-6">
        {rec.message}
      </div>
      <div
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono"
        style={{
          background:  'rgba(16,185,129,0.10)',
          border:      '1px solid rgba(16,185,129,0.3)',
          color:       '#10b981',
        }}
      >
        <Target size={14} />
        {rec.action}
      </div>

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.08), transparent)' }}
        animate={{ opacity: [0.4, 1.0, 0.4] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
    </motion.div>
  );
}