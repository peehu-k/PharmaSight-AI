export interface Detection {
  class_id:   number;
  class_name: string;
  confidence: number;
  bbox:       number[];  // [x1, y1, x2, y2] absolute pixels
}

export interface QualityMetrics {
  blur_score?:        number;
  brightness_score?:  number;
  quality_flag?:      "GOOD" | "POOR";
  raw_blur_variance?: number;
  mean_brightness?:   number;
  // Extended metrics from API
  brightness?: number;
  contrast?: number;
  sharpness?: number;
  noise_level?: number;
  overexposure_pct?: number;
  underexposure_pct?: number;
  dynamic_range?: number;
  object_centering?: number;
  edge_clipping?: number;
  detection_confidence?: number;
  detection_count?: number;
  defect_count?: number;
  expected_pills?: number;
  fill_rate?: number;
  [key: string]: number | string | undefined;
}

export interface Counts {
  pills:       number;
  empty_slots: number;
  total_slots: number;
}

export interface Recommendation {
  issue:      string;
  suggestion: string;
  impact:     "high" | "medium" | "low";
}

export interface PredictResponse {
  prediction:      "GOOD" | "MINOR_DEFECT" | "CRITICAL_DEFECT";
  decision:        "AUTO_ACCEPT" | "HUMAN_REVIEW" | "REJECT";
  counts:          Counts;
  confidence:      number;
  quality:         QualityMetrics;
  recommendations: Recommendation[];
  detections:      Detection[];
  model_version:   string;
  inference_ms:    number;
}
