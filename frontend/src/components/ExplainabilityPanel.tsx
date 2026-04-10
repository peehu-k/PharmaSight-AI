/**
 * ExplainabilityPanel — Trust factor breakdown and decision path  v7
 *
 * Fixes:
 * - Bars now visible: recharts BarChart needs explicit fill on Bar, not just on Cell.
 *   The Cell fill was correct but the parent Bar had no fill fallback, causing
 *   invisible bars in some recharts versions.
 * - Factor scores read from trust.factor_scores (actual 0–100 scores).
 * - Detection confidence reads from trust.detection_confidence_raw.
 * - Bottleneck value correctly displays on 0–100 scale.
 * - Chart height increased and margins fixed so bars don't clip.
 * - Added null-safe fallbacks throughout.
 */

import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { TrustResult } from '../api/pharmasight';
import { AlertCircle, TrendingDown, TrendingUp, CheckCircle2 } from 'lucide-react';

interface Props {
  trust: TrustResult | undefined;
}

// Thresholds per factor (0–100) — must match backend trust_engine.py
const FACTOR_THRESHOLDS: Record<string, number> = {
  brightness: 35,
  contrast:   28,
  sharpness:  45,
  noise:      38,
  exposure:   55,
  centering:  50,
};

// Nice display labels
const FACTOR_LABELS: Record<string, string> = {
  brightness: 'Brightness',
  contrast:   'Contrast',
  sharpness:  'Sharpness',
  noise:      'Noise Quality',
  exposure:   'Exposure',
  centering:  'Centering',
};

export default function ExplainabilityPanel({ trust }: Props) {
  if (!trust) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl glass-card text-sm metric-label">
        UPLOAD AN IMAGE TO SEE EXPLAINABILITY DATA
      </div>
    );
  }

  // ── Build chart data from factor_scores (0–100 actual scores) ──────────
  const factorScores: Record<string, number> = trust.factor_scores ?? {};

  const chartData = Object.entries(factorScores).map(([key, score]) => {
    const threshold = FACTOR_THRESHOLDS[key] ?? 50;
    const s = Number(score);
    return {
      key,
      name:           FACTOR_LABELS[key] ?? key,
      score:          Math.round(Math.min(100, Math.max(0, s))),
      threshold,
      aboveThreshold: s >= threshold,
      gap:            Math.max(0, threshold - s),
    };
  });

  // Sort by score ascending — worst factor at top of horizontal bar chart
  chartData.sort((a, b) => a.score - b.score);

  const bottleneckKey   = trust.bottleneck_factor ?? 'unknown';
  const bottleneckLabel = FACTOR_LABELS[bottleneckKey] ?? bottleneckKey.replace(/_/g, ' ');
  const bottleneckVal   = Number(trust.bottleneck_value ?? 0);

  const detConfDisplay = Number(trust.detection_confidence_raw ?? 0);

  // ── Custom tooltip ────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{
        background:   'rgba(10,14,26,0.97)',
        border:       '1px solid rgba(0,212,255,0.45)',
        borderRadius: 8,
        padding:      '10px 14px',
        fontFamily:   'JetBrains Mono, monospace',
        fontSize:     12,
        minWidth:     200,
      }}>
        <div style={{ color: '#00d4ff', fontWeight: 700, marginBottom: 6 }}>{label}</div>
        <div style={{ color: '#e2e8f0' }}>
          Score:&nbsp;
          <strong style={{ color: d.aboveThreshold ? '#10b981' : '#ef4444' }}>
            {d.score}/100
          </strong>
        </div>
        <div style={{ color: '#94a3b8' }}>Threshold: {d.threshold}/100</div>
        {!d.aboveThreshold && (
          <div style={{ color: '#f59e0b', marginTop: 4 }}>
            Gap: {d.gap.toFixed(1)} points below threshold
          </div>
        )}
        <div style={{ color: '#64748b', marginTop: 4 }}>
          {d.aboveThreshold ? '✅ Within acceptable range' : '⚠️ Below threshold — needs attention'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* ── WHY Section ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 rounded-xl glass-card relative overflow-hidden"
        style={{ borderColor: 'rgba(0, 212, 255, 0.3)' }}
      >
        <div className="relative z-10">
          <div className="text-2xl font-mono font-bold mb-4 text-cyan-400 metric-label tracking-widest">
            WHY THIS DECISION?
          </div>
          <div className="text-base text-gray-200 leading-relaxed font-light">
            {trust.explanation ?? 'No explanation available.'}
          </div>

          {trust.good_quality_override && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 mt-5 p-4 rounded-lg"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.4)' }}
            >
              <TrendingUp size={20} className="text-green-400 flex-shrink-0" />
              <div className="text-sm text-green-300">
                <strong>Quality override applied</strong> — all image quality factors are within
                acceptable range. AI decision accepted despite lower detection confidence.
              </div>
            </motion.div>
          )}
        </div>

        <motion.div
          className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent)' }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
      </motion.div>

      {/* ── Factor Scores Bar Chart ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-6 rounded-xl glass-card"
      >
        <div className="flex flex-wrap items-center gap-4 mb-2">
          <div className="text-xl font-mono font-semibold metric-label">FACTOR SCORES</div>
          <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#10b981' }} />
              Above threshold
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} />
              Below threshold
            </span>
          </div>
        </div>

        <p className="text-xs text-gray-500 font-mono mb-5">
          Actual quality scores (0–100). Red bars indicate factors reducing trust. Dashed line = 50 reference.
        </p>

        {/* 
          KEY FIX: recharts Bar must have a fallback fill prop.
          Individual Cell fills override it — but without a Bar fill, bars
          are invisible in some recharts versions. Set fill="transparent" as
          fallback so Cell fill always wins.
        */}
        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 52)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 110, right: 60, top: 8, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(0,212,255,0.08)"
              horizontal={false}
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
              tickCount={6}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              width={105}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,212,255,0.05)' }} />
            <ReferenceLine x={50} stroke="rgba(0,212,255,0.30)" strokeDasharray="5 4" />

            {/* 
              IMPORTANT: Bar needs a default fill. 
              Cell children override per-bar, but Bar fill is the canvas fallback. 
            */}
            <Bar dataKey="score" radius={[0, 6, 6, 0]} maxBarSize={32} fill="#10b981">
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.aboveThreshold ? '#10b981' : '#ef4444'}
                  style={{
                    filter: `drop-shadow(0 0 4px ${
                      entry.aboveThreshold ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'
                    })`,
                  }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Score labels overlay — rendered as a separate list for clarity */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {chartData.map((d) => (
            <div
              key={d.key}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono"
              style={{
                background:  d.aboveThreshold ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border:      `1px solid ${d.aboveThreshold ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}
            >
              <span className="text-gray-400">{d.name}</span>
              <span style={{ color: d.aboveThreshold ? '#10b981' : '#ef4444' }} className="font-bold">
                {d.score}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Bottleneck Highlight ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-6 rounded-xl glass-card relative overflow-hidden"
        style={{
          background:   'rgba(239,68,68,0.07)',
          borderColor:  'rgba(239,68,68,0.40)',
          boxShadow:    '0 0 24px rgba(239,68,68,0.12)',
        }}
      >
        <div className="flex items-start gap-4 relative z-10">
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <AlertCircle size={32} className="text-red-400 flex-shrink-0 mt-1" />
          </motion.div>
          <div className="flex-1">
            <div className="text-xl font-mono font-bold text-red-300 mb-2 metric-label tracking-widest">
              PRIMARY BOTTLENECK
            </div>
            <div className="text-gray-200 text-lg mb-3">
              <span className="font-bold text-red-400">{bottleneckLabel}</span>
              {' '}is the weakest factor with a score of{' '}
              <span className="font-bold font-mono text-red-400 text-xl">
                {bottleneckVal.toFixed(1)}/100
              </span>
              {' '}(threshold: {(FACTOR_THRESHOLDS[bottleneckKey] ?? 50)}/100)
            </div>
            <div
              className="text-sm text-gray-400 px-4 py-2 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.30)' }}
            >
              💡 Improving <strong>{bottleneckLabel}</strong> will have the highest
              impact on the overall trust score. See the Recommendations tab for
              specific corrective actions.
            </div>
          </div>
        </div>

        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 15% 50%, rgba(239,68,68,0.12), transparent)' }}
          animate={{ opacity: [0.5, 1.0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
      </motion.div>

      {/* ── Decision Path ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="p-6 rounded-xl glass-card"
      >
        <div className="text-xl font-mono font-semibold mb-6 metric-label tracking-widest">
          DECISION PATH
        </div>
        <div className="space-y-4">
          <StepRow n={1} color="cyan">
            Image quality metrics computed from raw pixel data (6 factors)
          </StepRow>
          <StepRow n={2} color="cyan">
            Weighted geometric mean of quality factors →{' '}
            <span className="font-mono text-cyan-400 font-bold">
              {(
                Object.values(factorScores).reduce((a, b) => a + b, 0) /
                Math.max(Object.values(factorScores).length, 1)
              ).toFixed(1)}
              /100 avg
            </span>
          </StepRow>
          <StepRow n={3} color="cyan">
            YOLO detection confidence:{' '}
            <span className="font-mono text-cyan-400 font-bold">
              {detConfDisplay.toFixed(1)}/100
            </span>
          </StepRow>
          <StepRow n={4} color="cyan">
            Combined trust score (quality 70% + detection 30%):{' '}
            <span className="font-mono text-cyan-400 text-xl font-bold">
              {(trust.trust_score ?? 0).toFixed(1)}/100
            </span>
            {trust.confidence_interval && (
              <span className="text-gray-500 text-sm ml-2">
                CI [{trust.confidence_interval[0]}, {trust.confidence_interval[1]}]
              </span>
            )}
          </StepRow>
          <StepRow
            n={5}
            color={
              trust.decision_color === 'green'  ? 'green'
            : trust.decision_color === 'yellow' ? 'yellow'
            : 'red'
            }
          >
            Decision:{' '}
            <span
              className="font-bold font-mono text-xl"
              style={{
                color:
                  trust.decision_color === 'green'  ? '#10b981'
                : trust.decision_color === 'yellow' ? '#f59e0b'
                : '#ef4444',
              }}
            >
              {trust.decision_label ?? 'Unknown'}
            </span>
          </StepRow>
        </div>
      </motion.div>

      {/* ── Factor Breakdown Table ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="p-6 rounded-xl glass-card overflow-x-auto"
      >
        <div className="text-xl font-mono font-semibold mb-6 metric-label tracking-widest">
          FACTOR BREAKDOWN
        </div>
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="border-b" style={{ borderColor: 'rgba(0,212,255,0.20)' }}>
              <th className="text-left py-3 metric-label">FACTOR</th>
              <th className="text-right py-3 metric-label">SCORE</th>
              <th className="text-right py-3 metric-label">THRESHOLD</th>
              <th className="text-right py-3 metric-label">DRAG %</th>
              <th className="text-right py-3 metric-label">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((factor, idx) => {
              const drag = (trust.contributing_factors ?? {})[factor.key];
              return (
                <motion.tr
                  key={factor.key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + idx * 0.05 }}
                  className="border-b hover:bg-cyan-500/5 transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                >
                  <td className="py-3 text-gray-300 font-mono">{factor.name}</td>
                  <td
                    className="text-right py-3 font-mono text-lg font-bold"
                    style={{ color: factor.aboveThreshold ? '#10b981' : '#ef4444' }}
                  >
                    {factor.score}/100
                  </td>
                  <td className="text-right py-3 font-mono text-gray-500">
                    {factor.threshold}/100
                  </td>
                  <td className="text-right py-3 font-mono text-gray-600 text-xs">
                    {drag !== undefined ? `${Number(drag).toFixed(1)}%` : '—'}
                  </td>
                  <td className="text-right py-3">
                    {factor.aboveThreshold
                      ? <CheckCircle2 size={18} className="inline text-green-400" />
                      : <TrendingDown   size={18} className="inline text-red-400" />
                    }
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </motion.div>

    </div>
  );
}

// ── Step row helper ────────────────────────────────────────────────────────

function StepRow({
  n, color, children,
}: {
  n:        number;
  color:    'cyan' | 'green' | 'yellow' | 'red';
  children: React.ReactNode;
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    cyan:   { bg: 'rgba(0,212,255,0.12)',  border: 'rgba(0,212,255,0.5)',  text: '#00d4ff' },
    green:  { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.5)', text: '#10b981' },
    yellow: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.5)', text: '#f59e0b' },
    red:    { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.5)',  text: '#ef4444' },
  };
  const c = colorMap[color];
  return (
    <div className="flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold font-mono border-2 flex-shrink-0"
        style={{ background: c.bg, borderColor: c.border, color: c.text }}
      >
        {n}
      </div>
      <div className="text-gray-200 flex-1 text-sm">{children}</div>
    </div>
  );
}