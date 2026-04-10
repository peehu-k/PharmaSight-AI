"""
PharmaSight — Simulation Engine  v8
=====================================
Simulates image adjustments and re-runs the full analysis pipeline.

v8 fix: display_quality scaling now matches main.py exactly —
uses the same _UNIT_KEYS set and passes image_bgr to
update_detection_metrics so ROI-based metrics are computed correctly.
"""

import cv2
import numpy as np
import base64
from typing import Dict
from PIL import Image
import io


# Keys whose raw [0,1] value should be ×100 for display — MUST match main.py
_UNIT_KEYS = {
    "brightness", "contrast", "sharpness", "noise_quality", "exposure",
    "blur_score", "noise_level", "dynamic_range",
    "centering", "object_centering", "detection_confidence",
    "overexposure_pct", "underexposure_pct", "edge_clipping", "fill_rate",
    "edge_density", "focus_consistency", "illumination_uniformity",
    "background_score", "pack_angle_score",
    "min_detection_confidence", "detection_conf_std",
    "grid_fill_rate",
}


class SimulationEngine:
    """
    Apply brightness / contrast / blur adjustments to a stored image
    and re-run the full quality → trust → recommendations pipeline.

    Adjustment parameters (sent from frontend sliders):
      brightness_delta : integer in [−50, 50] — maps to ±0.196 brightness shift
      contrast_delta   : integer in [−50, 50] — maps to ±50% contrast multiplier
      blur_sigma       : float  in [0, 10]    — Gaussian sigma (0 = no blur)
    """

    def __init__(self, quality_analyzer, trust_engine,
                 recommendation_engine, yolo_model):
        self.quality_analyzer      = quality_analyzer
        self.trust_engine          = trust_engine
        self.recommendation_engine = recommendation_engine
        self.yolo_model            = yolo_model

    # ── Public API ────────────────────────────────────────────────────────

    def simulate(self, raw_image: np.ndarray, adjustments: Dict) -> Dict:
        """
        Apply adjustments and re-run full analysis pipeline.

        Parameters
        ----------
        raw_image   : original BGR image (numpy array)
        adjustments : dict with brightness_delta, contrast_delta, blur_sigma

        Returns
        -------
        Dict matching SimulationResponse type in pharmasight.ts
        """
        brightness_delta = float(adjustments.get("brightness_delta", 0.0)) / 100.0
        contrast_delta   = float(adjustments.get("contrast_delta",   0.0)) / 100.0
        blur_sigma       = float(adjustments.get("blur_sigma",       0.0))

        # ── Apply image adjustments ───────────────────────────────────
        img = raw_image.copy().astype(np.float32)

        # 1. Brightness
        if brightness_delta != 0:
            img = np.clip(img + brightness_delta * 255.0, 0.0, 255.0)

        # 2. Contrast (around image mean)
        if contrast_delta != 0:
            mean_val = img.mean()
            img = np.clip(
                (img - mean_val) * (1.0 + contrast_delta) + mean_val,
                0.0, 255.0
            )

        img = img.astype(np.uint8)

        # 3. Blur
        if blur_sigma > 0:
            img = cv2.GaussianBlur(img, (0, 0), sigmaX=blur_sigma)

        # ── Run full pipeline ─────────────────────────────────────────
        h, w = img.shape[:2]

        boxes        = self._run_yolo(img)
        pill_count   = sum(1 for b in boxes if b.get("class_id") == 0)
        defect_count = sum(1 for b in boxes if b.get("class_id") == 1)
        total_cells  = pill_count + defect_count

        # Quality analysis — pass image_bgr for ROI-based metrics (v8)
        quality = self.quality_analyzer.analyze(img)
        quality = self.quality_analyzer.update_detection_metrics(
            quality, boxes, w, h, image_bgr=img
        )

        quality["detection_count"] = total_cells
        quality["defect_count"]    = defect_count
        quality["pill_count"]      = pill_count
        quality["expected_pills"]  = quality.get("grid_expected_count", total_cells)

        # Build display quality using the same logic as main.py
        display_quality = {}
        for key, value in quality.items():
            if key in _UNIT_KEYS:
                display_quality[key] = round(float(value) * 100, 2)
            else:
                display_quality[key] = value

        trust           = self.trust_engine.compute(quality, {"boxes": boxes})
        recommendations = self.recommendation_engine.generate(display_quality, trust)

        annotated = self._draw_boxes(img, boxes)
        img_b64   = self._image_to_base64(annotated)

        return {
            "modified_image_b64": img_b64,
            "quality":            display_quality,
            "trust":              trust,
            "recommendations":    recommendations,
            "detection": {
                "boxes":       boxes,
                "pill_count":  pill_count,
                "defect_count":defect_count,
                "total_cells": total_cells,
                "fill_rate":   round(pill_count / total_cells * 100, 2) if total_cells > 0 else 0.0,
            },
            "adjustments_applied": {
                "brightness_delta": brightness_delta,
                "contrast_delta":   contrast_delta,
                "blur_sigma":       blur_sigma,
            },
        }

    # ── Private helpers ───────────────────────────────────────────────────

    def _run_yolo(self, image_bgr: np.ndarray) -> list:
        results = self.yolo_model(image_bgr, verbose=False, conf=0.25)
        boxes   = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                cls_id = int(box.cls[0])
                conf   = float(box.conf[0])
                xyxy   = box.xyxy[0].tolist()
                boxes.append({
                    "x1":        xyxy[0],
                    "y1":        xyxy[1],
                    "x2":        xyxy[2],
                    "y2":        xyxy[3],
                    "confidence":conf,
                    "class_id":  cls_id,
                    "label":     self.yolo_model.names.get(cls_id, str(cls_id)),
                })
        return boxes

    def _draw_boxes(self, image_bgr: np.ndarray, boxes: list) -> np.ndarray:
        img = image_bgr.copy()
        for box in boxes:
            x1, y1 = int(box["x1"]), int(box["y1"])
            x2, y2 = int(box["x2"]), int(box["y2"])
            color  = (0, 255, 0) if box["class_id"] == 0 else (0, 0, 255)
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            label_text = f"{box['label']} {box['confidence']:.2f}"
            (tw, th), _ = cv2.getTextSize(
                label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
            )
            cv2.rectangle(img, (x1, y1 - th - 4), (x1 + tw, y1), color, -1)
            cv2.putText(
                img, label_text, (x1, y1 - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1
            )
        return img

    def _image_to_base64(self, image_bgr: np.ndarray) -> str:
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(image_rgb)
        buffer    = io.BytesIO()
        pil_image.save(buffer, format="JPEG", quality=85)
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode("utf-8")