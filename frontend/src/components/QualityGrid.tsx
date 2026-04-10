/**
 * QualityGrid — Quality metric cards + radar chart  v8
 *
 * v8 changes:
 * - 4 new metric cards: Focus Consistency, Illumination Uniformity,
 *   Background Score, Pack Angle Score
 * - Noise Level: invert removed (noise_level is already "higher=better")
 * - Radar chart: removed broken *10 multiplier; all axes 0–100
 * - Thresholds updated to match backend trust_engine.py exactly
 * - Per-card tooltip explaining how the metric is computed
 * - Safety gate banner for uncertain_empty_slots
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Tooltip as RechartsTooltip,
} from 'recharts';
import type { QualityMetrics } from '../api/pharmasight';
import {
  Focus, Sun, Contrast, Sparkles, Volume2, AlertTriangle,
  Moon, Maximize, Target, Scissors, CheckCircle, Package,
  Eye, Lightbulb, Layers, RotateCcw, Info, ShieldAlert,
} from 'lucide-react';

interface Props {
  quality: QualityMetrics | undefined;
  trustScore?:number
}

interface MetricDef {
  name:      string;
  key:       keyof QualityMetrics;
  value:     number;
  threshold: number;
  icon:      React.ElementType;
  unit:      string;
  invert?:   boolean;
  tooltip:   string;
}

export default function QualityGrid({ quality , trustScore }: Props) {
  if (!quality) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl glass-card text-sm metric-label">
        UPLOAD AN IMAGE TO SEE QUALITY METRICS
      </div>
    );
  }

  const metrics: MetricDef[] = [
    {
      name: 'Blur Score', key: 'blur_score',
      value: quality.blur_score ?? 0, threshold: 45, icon: Focus, unit: '/100',
      tooltip: 'Laplacian variance of pixel ROIs (pill regions), log-scaled 0–100. '
             + 'Higher = sharper. v8 computes this on YOLO bounding boxes rather than '
             + 'the whole image to avoid false high scores from textured backgrounds.',
    },
    {
      name: 'Brightness', key: 'brightness',
      value: quality.brightness ?? 0, threshold: 35, icon: Sun, unit: '/100',
      tooltip: 'Closeness of mean pixel luminance to ideal mid-gray (127/255). '
             + '100 = perfect. Very dark or very bright images score low. '
             + 'Formula: 1 − |mean/255 − 0.5|^1.2 × 2.',
    },
    {
      name: 'Contrast', key: 'contrast',
      value: quality.contrast ?? 0, threshold: 28, icon: Contrast, unit: '/100',
      tooltip: 'Blend of normalised std-dev (60%) and Michelson contrast on p5/p95 percentiles (40%). '
             + 'Recalibrated for metallic foil packs — industrial foil naturally scores 35–55.',
    },
    {
      name: 'Sharpness', key: 'sharpness',
      value: quality.sharpness ?? 0, threshold: 45, icon: Sparkles, unit: '/100',
      tooltip: 'Same computation as Blur Score — Laplacian variance log-scaled on ROIs. '
             + 'Shown separately for clarity in the radar chart.',
    },
    {
      name: 'Noise Level', key: 'noise_level',
      value: quality.noise_level ?? 0, threshold: 38, icon: Volume2, unit: '/100',
      // NOT inverted — noise_level = quality score (higher = less noise = better)
      tooltip: 'Background-region noise quality: measured in pixels OUTSIDE bounding boxes '
             + '(v8 improvement). High score = low sensor noise. '
             + 'Formula: 1 − std(background pixels) / 30.',
    },
    {
      name: 'Overexposure', key: 'overexposure_pct',
      value: quality.overexposure_pct ?? 0, threshold: 10,
      icon: AlertTriangle, unit: '%', invert: true,
      tooltip: 'Percentage of pixels above 235 brightness (blown-out highlights). '
             + 'Lower is better. Threshold: keep below 10%.',
    },
    {
      name: 'Underexposure', key: 'underexposure_pct',
      value: quality.underexposure_pct ?? 0, threshold: 10,
      icon: Moon, unit: '%', invert: true,
      tooltip: 'Percentage of pixels below 20 brightness (crushed shadows). '
             + 'Lower is better. Threshold: keep below 10%.',
    },
    {
      name: 'Dynamic Range', key: 'dynamic_range',
      value: quality.dynamic_range ?? 0, threshold: 50, icon: Maximize, unit: '/100',
      tooltip: '(p99 − p1) / 255 × 100. Measures how much of the sensor\'s bit-depth '
             + 'is being used. Higher = camera capturing the full tonal range.',
    },
    {
      name: 'Object Centering', key: 'object_centering',
      value: quality.object_centering ?? 0, threshold: 50, icon: Target, unit: '/100',
      tooltip: 'Distance of detection centroid from image centre, inverted. '
             + '100 = pack perfectly centred. Score is 1.0 within 20% of centre; '
             + 'linear falloff towards 0.3 at the corner.',
    },
    {
      name: 'Edge Clipping', key: 'edge_clipping',
      value: quality.edge_clipping ?? 0, threshold: 5,
      icon: Scissors, unit: '%', invert: true,
      tooltip: 'Percentage of bounding boxes touching the image border (within 5px). '
             + 'High values = pack partially outside the field of view.',
    },
    {
      name: 'Detection Confidence', key: 'detection_confidence',
      value: quality.detection_confidence ?? 0, threshold: 60,
      icon: CheckCircle, unit: '/100',
      tooltip: 'Mean YOLO confidence of all valid detections (≥10% conf). '
             + 'Higher = model is more certain about each pill/empty-slot. '
             + 'Floored at 30% to avoid classical CV results collapsing the score.',
    },
    {
      name: 'Fill Rate', key: 'fill_rate',
      value: quality.fill_rate ?? 0, threshold: 80, icon: Package, unit: '%',
      tooltip: 'v8: pills / grid_expected_count (rows × cols from centroid clustering). '
             + 'More accurate than pills/(pills+empty) since it accounts for '
             + 'totally missed slots. 100% = fully filled pack.',
    },
    // ── v8 new metrics ──────────────────────────────────────────────
    {
      name: 'Focus Consistency', key: 'focus_consistency',
      value: quality.focus_consistency ?? 80, threshold: 60,
      icon: Eye, unit: '/100',
      tooltip: 'v8 NEW — std of per-pill sharpness scores, inverted. '
             + 'Low score means some pills are sharp and others blurry '
             + '(depth-of-field issue). Fix: increase aperture f-number '
             + 'or ensure pack lies flat.',
    },
    {
      name: 'Illumination Uniformity', key: 'illumination_uniformity',
      value: quality.illumination_uniformity ?? 80, threshold: 55,
      icon: Lightbulb, unit: '/100',
      tooltip: 'v8 NEW — coefficient of variation of brightness across a 4×4 grid '
             + 'of background cells, inverted. Low score = uneven lighting '
             + '(bright centre, dark corners). Fix: use ring light or diffusion panel.',
    },
    {
      name: 'Background Score', key: 'background_score',
      value: quality.background_score ?? 70, threshold: 45,
      icon: Layers, unit: '/100',
      tooltip: 'v8 NEW — blend of background saturation (50%) and entropy (50%). '
             + 'High score = neutral industrial surface (conveyor/tray). '
             + 'Low score = coloured, textured, or complex background. '
             + 'Fix: place pack on grey inspection tray.',
    },
    {
      name: 'Pack Angle Score', key: 'pack_angle_score',
      value: quality.pack_angle_score ?? 80, threshold: 55,
      icon: RotateCcw, unit: '/100',
      tooltip: 'v8 NEW — principal axis angle of detection centroids via PCA. '
             + '100 = perfectly level (< 3°). Drops to 0.30 at > 20° tilt. '
             + 'Fix: ensure pack lies flat and camera is perpendicular.',
    },
  ];

  const getColor = (value: number, threshold: number, invert = false) => {
    const good     = invert ? value <= threshold : value >= threshold;
    const marginal = invert ? value <= threshold * 2.0 : value >= threshold * 0.70;
    if (good)     return '#10b981';
    if (marginal) return '#f59e0b';
    return '#ef4444';
  };

  const getGrade = () => {
    const trust = trustScore ?? 0;

    if (trust >= 79) return { grade: 'A', color: '#10b981', label: 'EXCELLENT' };
    if (trust >= 65) return { grade: 'B', color: '#3b82f6', label: 'GOOD' };
    if (trust >= 50) return { grade: 'C', color: '#f59e0b', label: 'ACCEPTABLE' };
    if (trust >= 35) return { grade: 'D', color: '#f97316', label: 'POOR' };
    return               { grade: 'F', color: '#ef4444', label: 'CRITICAL' };
  };

  // Radar — all values 0–100, no manual scaling
  const radarData = [
    { metric: 'Blur',        value: Math.min(100, quality.blur_score       ?? 0) },
    { metric: 'Brightness',  value: Math.min(100, quality.brightness       ?? 0) },
    { metric: 'Contrast',    value: Math.min(100, quality.contrast         ?? 0) },
    { metric: 'Sharpness',   value: Math.min(100, quality.sharpness        ?? 0) },
    { metric: 'Centering',   value: Math.min(100, quality.object_centering ?? 0) },
    { metric: 'Confidence',  value: Math.min(100, quality.detection_confidence ?? 0) },
    { metric: 'Focus',       value: Math.min(100, quality.focus_consistency ?? 80) },
    { metric: 'Illumination',value: Math.min(100, quality.illumination_uniformity ?? 80) },
  ];

  const grade              = getGrade();
  const uncertainEmptySlots = quality.uncertain_empty_slots ?? 0;

  return (
    <div className="space-y-6">

      {/* Safety alert for uncertain empty slots */}
      {uncertainEmptySlots > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-4 rounded-xl border"
          style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.5)' }}
        >
          <ShieldAlert size={28} className="text-red-400 flex-shrink-0" />
          <div>
            <div className="font-mono font-bold text-red-300">
              ⚠ {uncertainEmptySlots} UNCERTAIN EMPTY-SLOT DETECTION{uncertainEmptySlots > 1 ? 'S' : ''}
            </div>
            <div className="text-sm text-red-400 mt-1">
              {uncertainEmptySlots} empty-slot bounding box{uncertainEmptySlots > 1 ? 'es have' : ' has'} YOLO confidence &lt; 50%.
              Human verification required before release.
            </div>
          </div>
        </motion.div>
      )}

      {/* Overall Grade */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-8 rounded-xl glass-card overflow-hidden"
        style={{ borderColor: grade.color }}
      >
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="metric-label mb-2">OVERALL QUALITY GRADE</div>
            <div className="text-5xl font-bold font-mono" style={{ color: grade.color }}>
              GRADE {grade.grade}
            </div>
            <div className="text-lg font-mono mt-2" style={{ color: grade.color }}>
              {grade.label}
            </div>
            <div className="text-xs metric-label mt-3">
              {metrics.filter(m => m.invert ? m.value <= m.threshold : m.value >= m.threshold).length}
              /{metrics.length} metrics passing
            </div>
          </div>
          <div className="text-[120px] font-bold font-mono opacity-10"
               style={{ color: grade.color }}>
            {grade.grade}
          </div>
        </div>
        <motion.div
          className="absolute inset-0 opacity-20"
          style={{ background: `radial-gradient(circle at 80% 50%, ${grade.color}, transparent)` }}
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </motion.div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => {
          const Icon       = metric.icon;
          const color      = getColor(metric.value, metric.threshold, metric.invert);
          const percentage = metric.invert
            ? Math.max(0, Math.min(100, 100 - metric.value))
            : Math.min(100, metric.value);

          return (
            <MetricCard
              key={metric.name}
              metric={metric}
              color={color}
              percentage={percentage}
              idx={idx}
              Icon={Icon}
            />
          );
        })}
      </div>

      {/* Radar Chart */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="p-6 rounded-xl glass-card"
      >
        <div className="text-xl font-mono font-semibold mb-1 metric-label">
          QUALITY DIMENSIONS
        </div>
        <p className="text-xs text-gray-500 font-mono mb-6">
          All axes 0–100. Larger filled area = better overall image quality.
        </p>
        <ResponsiveContainer width="100%" height={380}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(0,212,255,0.2)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: '#64748b', fontSize: 12, fontFamily: 'JetBrains Mono' }}
            />
            <Radar
              name="Quality"
              dataKey="value"
              stroke="#00d4ff"
              fill="#00d4ff"
              fillOpacity={0.35}
              strokeWidth={2}
            />
            <RechartsTooltip
              contentStyle={{
                background:    'rgba(13,17,23,0.97)',
                border:        '1px solid rgba(0,212,255,0.3)',
                borderRadius:  8,
                fontFamily:    'JetBrains Mono',
                fontSize:      12,
                color:         '#e2e8f0',
              }}
              formatter={(v) => {
              const value = typeof v === 'number' ? v : Number(v);
              return [`${value.toFixed(1)}/100`, 'Score'];
            }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}

// ── MetricCard with hover tooltip ─────────────────────────────────────────────

function MetricCard({
  metric, color, percentage, idx, Icon,
}: {
  metric:     MetricDef;
  color:      string;
  percentage: number;
  idx:        number;
  Icon:       React.ElementType;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.025 }}
      className="relative p-4 rounded-lg glass-card group hover:scale-105 transition-transform"
      style={{
        borderColor: `${color}40`,
        background:  'linear-gradient(135deg, rgba(13,17,23,0.8), rgba(13,17,23,0.4))',
      }}
    >
      {/* Corner accent */}
      <div
        className="absolute top-0 right-0 w-12 h-12 opacity-20"
        style={{
          background: `linear-gradient(135deg, ${color}, transparent)`,
          clipPath:   'polygon(100% 0, 100% 100%, 0 0)',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} style={{ color }} />
        <div className="text-xs metric-label flex-1 truncate">
          {metric.name.toUpperCase()}
        </div>

        {/* Info icon */}
        <div className="relative flex-shrink-0">
          <button
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onClick={() => setShowTip(v => !v)}
            className="opacity-40 hover:opacity-100 transition-opacity"
            aria-label={`Info about ${metric.name}`}
          >
            <Info size={13} className="text-gray-500" />
          </button>

          <AnimatePresence>
            {showTip && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 z-50 w-68 p-3 rounded-lg text-xs text-gray-300 leading-relaxed"
                style={{
                  width:      '260px',
                  background: 'rgba(13,17,23,0.99)',
                  border:     '1px solid rgba(0,212,255,0.3)',
                  top:        '110%',
                  boxShadow:  '0 8px 32px rgba(0,0,0,0.7)',
                }}
              >
                <div className="font-bold text-cyan-400 mb-1">{metric.name}</div>
                <div>{metric.tooltip}</div>
                <div className="mt-2 text-gray-500 border-t border-gray-700 pt-2">
                  Threshold: {metric.threshold}{metric.unit}
                  {metric.invert ? ' (lower is better)' : ' (higher is better)'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Value */}
      <div className="text-3xl font-bold font-mono mb-3" style={{ color }}>
        {metric.value.toFixed(1)}
        <span className="text-lg">{metric.unit}</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-900/50 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                   boxShadow: `0 0 8px ${color}` }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ delay: idx * 0.025 + 0.2, duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="text-[10px] metric-label mt-2">
        THRESHOLD: {metric.threshold}{metric.unit}
        {metric.invert && <span className="ml-1 text-gray-600">(lower=better)</span>}
      </div>
    </motion.div>
  );
}