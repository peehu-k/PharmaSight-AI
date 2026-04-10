/**
 * PharmaSight API Client  v8
 */

export const API_BASE = 'http://localhost:8000';

// ── Quality Metrics ──────────────────────────────────────────────────────────
export interface QualityMetrics {
  // Core image metrics (0–100)
  blur_score:           number;
  brightness:           number;
  contrast:             number;
  sharpness:            number;
  noise_level:          number;
  dynamic_range:        number;
  exposure?:            number;

  // Exposure breakdown (0–100, percentage)
  overexposure_pct:     number;
  underexposure_pct:    number;

  // Detection-derived (0–100)
  object_centering:     number;
  detection_confidence: number;
  fill_rate:            number;
  edge_clipping:        number;

  // v8 new metrics (0–100)
  focus_consistency:        number;   // per-ROI sharpness consistency
  illumination_uniformity:  number;   // grid brightness uniformity
  background_score:         number;   // industrial vs non-industrial background
  pack_angle_score:         number;   // pack tilt / perspective distortion

  // Confidence detail (0–100)
  min_detection_confidence: number;
  detection_conf_std:       number;

  // Grid structure (raw counts)
  grid_rows?:            number;
  grid_cols?:            number;
  grid_expected_count?:  number;
  grid_fill_rate?:       number;

  // Counts (integers)
  detection_count?:      number;
  defect_count?:         number;
  pill_count?:           number;
  expected_pills?:       number;
  uncertain_empty_slots?:number;

  [key: string]: number | undefined;
}

// ── Trust Result ─────────────────────────────────────────────────────────────
export interface TrustResult {
  trust_score:              number;
  decision:                 string;
  decision_label:           string;
  decision_color:           string;
  confidence_interval:      [number, number];
  contributing_factors:     Record<string, number>;
  bottleneck_factor:        string;
  bottleneck_value:         number;      // 0–100 scale
  explanation:              string;
  good_quality_override:    boolean;
  gate_reason:              string | null;    // v8: safety gate explanation
  factor_scores:            Record<string, number>;  // actual 0–100 scores
  detection_confidence_raw: number;           // raw YOLO confidence 0–100
  fill_rate_pct?:           number;
  uncertain_empty_slots?:   number;
  validation_score?: number;
  override?: boolean;
  validation_issues?: string[];
}

// ── Recommendation ───────────────────────────────────────────────────────────
export interface Recommendation {
  id:              number;
  title:           string;
  action:          string;
  impact_estimate: string;
  priority:        'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  metric_value:    number;
  threshold:       number;
  metric_name:     string;
  message?:        string;
  severity?:       string;
  relative_gap?:   number;
}

// ── Inspect Response ─────────────────────────────────────────────────────────
export interface InspectResponse {
  image_id:     string;
  timestamp:    number;
  detection: {
    boxes: Array<{
      x1: number; y1: number; x2: number; y2: number;
      confidence: number; class_id: number; label: string;
    }>;
    labels:                string[];
    confidences:           number[];
    defect_count:          number;
    pill_count:            number;
    total_cells:           number;
    fill_rate:             number;
    detection_method:      string;
    grid_rows?:            number;
    grid_cols?:            number;
    grid_expected_count?:  number;
    uncertain_empty_slots?:number;
  };
  quality:         QualityMetrics;
  trust:           TrustResult;
  recommendations: Recommendation[];
  image:           string;   // URL — served from /outputs/
  image_width:     number;
  image_height:    number;
  model_version:   string;
  inference_ms:    number;
}

// ── Simulation Response ───────────────────────────────────────────────────────
export interface SimulationResponse {
  modified_image_b64: string;   // base64 JPEG (no data: prefix)
  quality:            QualityMetrics;
  trust:              TrustResult;
  recommendations:    Recommendation[];
  detection: {
    boxes: Array<{
      x1: number; y1: number; x2: number; y2: number;
      confidence: number; class_id: number; label: string;
    }>;
    pill_count:   number;
    defect_count: number;
    total_cells:  number;
    fill_rate?:   number;
  };
  adjustments_applied: {
    brightness_delta: number;
    contrast_delta:   number;
    blur_sigma:       number;
  };
}

// ── Learning Summary ──────────────────────────────────────────────────────────
export interface LearningSummary {
  total_samples:           number;
  ai_accuracy:             number;
  most_common_error_cause: string;
  error_cause_count:       number;
  weight_adjustments:      Record<string, number>;
  trend:                   string;
  recent_accuracy:         number;
}

export interface HistoryItem {
  image_id:     string;
  timestamp:    number;
  trust_score:  number;
  decision:     string;
  defect_count: number;
  pill_count:   number;
  fill_rate?:   number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function inspectImage(file: File): Promise<InspectResponse> {
  console.log('Uploading image:', file.name, file.size, 'bytes');
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/inspect`, { method: 'POST', body: form });
  console.log('Response status:', res.status, res.statusText);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Inspection failed');
  }

  const data = await res.json();
  console.log('Response data keys:', Object.keys(data));
  return data;
}

export async function simulateImprovement(
  imageId: string,
  adjustments: {
    brightness_delta?: number;
    contrast_delta?:   number;
    blur_sigma?:       number;
  }
): Promise<SimulationResponse> {
  const res = await fetch(`${API_BASE}/simulate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ image_id: imageId, adjustments }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Simulation failed');
  }
  return res.json();
}

export async function submitFeedback(
  imageId: string,
  humanDecision: string,
  notes: string = ''
): Promise<any> {
  const res = await fetch(`${API_BASE}/feedback`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ image_id: imageId, human_decision: humanDecision, notes }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Feedback submission failed');
  }
  return res.json();
}

export async function getLearningHistory(): Promise<LearningSummary> {
  const res = await fetch(`${API_BASE}/learning-summary`);
  if (!res.ok) throw new Error(`Failed to fetch learning summary: ${res.status}`);
  return res.json();
}

export async function getInspectionHistory(
  limit: number = 20
): Promise<{ history: HistoryItem[] }> {
  const res = await fetch(`${API_BASE}/history?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch inspection history');
  return res.json();
}