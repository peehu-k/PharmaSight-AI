"""
BlisterVision Elite — Core Model Pipeline
==========================================
YOLOv8 + Monte Carlo Dropout Uncertainty + Image Quality Scorer + Trust Engine
"""

import cv2
import numpy as np
from ultralytics import YOLO
import torch
import torch.nn as nn
from PIL import Image
import os
import json
from dataclasses import dataclass, asdict
from typing import List, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BlisterVision")


# ─────────────────────────────────────────────
# DATA STRUCTURES
# ─────────────────────────────────────────────

@dataclass
class Detection:
    class_name: str
    confidence: float
    bbox: List[float]          # [x1, y1, x2, y2] normalized
    area_fraction: float       # fraction of image area

@dataclass
class InspectionResult:
    detections: List[Detection]
    uncertainty_score: float   # 0 = certain, 1 = very uncertain
    image_quality_score: float # 0 = bad, 1 = perfect
    trust_score: float         # 0 = don't trust AI, 1 = fully trust
    decision: str              # "ACCEPT" | "HUMAN_REVIEW" | "REJECT"
    decision_reason: str
    avg_confidence: float
    defect_count: int
    missing_count: int
    pill_count: int
    anomaly_flags: List[str]   # list of specific issues detected


# ─────────────────────────────────────────────
# IMAGE QUALITY ANALYZER
# ─────────────────────────────────────────────

class ImageQualityAnalyzer:
    """
    Scores image quality across multiple dimensions.
    Returns a 0–1 score used as input to the Trust Engine.
    """

    def analyze(self, image_bgr: np.ndarray) -> tuple[float, List[str]]:
        """Returns (quality_score 0–1, list_of_flags)"""
        flags = []
        scores = {}

        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # ── Sharpness (Laplacian variance) ──
        lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        sharpness = min(lap_var / 500.0, 1.0)
        scores["sharpness"] = sharpness
        if sharpness < 0.3:
            flags.append("BLURRY_IMAGE")

        # ── Brightness ──
        mean_brightness = gray.mean() / 255.0
        brightness_score = 1.0 - abs(mean_brightness - 0.5) * 2
        scores["brightness"] = max(brightness_score, 0)
        if mean_brightness < 0.15:
            flags.append("TOO_DARK")
        elif mean_brightness > 0.92:
            flags.append("OVEREXPOSED")

        # ── Contrast (std dev) ──
        std_dev = gray.std() / 128.0
        contrast_score = min(std_dev, 1.0)
        scores["contrast"] = contrast_score
        if contrast_score < 0.2:
            flags.append("LOW_CONTRAST")

        # ── Resolution adequacy ──
        pixel_count = h * w
        res_score = min(pixel_count / (640 * 640), 1.0)
        scores["resolution"] = res_score
        if pixel_count < 100_000:
            flags.append("LOW_RESOLUTION")

        # ── Edge density (structural content) ──
        edges = cv2.Canny(gray, 50, 150)
        edge_density = edges.sum() / (255.0 * pixel_count)
        edge_score = min(edge_density * 50, 1.0)
        scores["edge_density"] = edge_score
        if edge_score < 0.05:
            flags.append("FEATURELESS_IMAGE")

        # ── Noise estimation ──
        noise = self._estimate_noise(gray)
        noise_score = max(1.0 - noise / 30.0, 0)
        scores["noise"] = noise_score
        if noise_score < 0.4:
            flags.append("HIGH_NOISE")

        # Weighted composite
        weights = {
            "sharpness": 0.30,
            "brightness": 0.20,
            "contrast": 0.20,
            "resolution": 0.10,
            "edge_density": 0.10,
            "noise": 0.10,
        }
        final = sum(scores[k] * weights[k] for k in weights)
        return round(float(final), 4), flags

    def _estimate_noise(self, gray: np.ndarray) -> float:
        """Estimate noise level via high-frequency content"""
        kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float32)
        filtered = cv2.filter2D(gray.astype(np.float32), -1, kernel)
        return float(np.std(filtered))


# ─────────────────────────────────────────────
# UNCERTAINTY ESTIMATOR (MC Dropout simulation)
# ─────────────────────────────────────────────

class UncertaintyEstimator:
    """
    Runs YOLO N times with test-time augmentation (TTA) + random crops
    to measure prediction variance — a proxy for MC Dropout uncertainty.
    """

    def __init__(self, model, n_passes: int = 7):
        self.model = model
        self.n_passes = n_passes

    def estimate(self, image_bgr: np.ndarray) -> tuple[float, float]:
        """
        Returns (uncertainty_score 0–1, avg_confidence 0–1)
        """
        all_confidences = []
        all_class_sets = []

        augmentations = self._build_augmentations(image_bgr)

        for aug_img in augmentations:
            results = self.model(aug_img, verbose=False)
            confs = []
            classes = set()
            for r in results:
                for box in r.boxes:
                    c = float(box.conf[0])
                    confs.append(c)
                    classes.add(int(box.cls[0]))
            all_confidences.append(confs)
            all_class_sets.append(classes)

        # Variance in confidence values across passes
        flat_confs = [c for run in all_confidences for c in run]
        if len(flat_confs) == 0:
            return 1.0, 0.0  # No detections = maximally uncertain

        avg_conf = float(np.mean(flat_confs))

        # Detection count variance
        counts = [len(c) for c in all_confidences]
        count_variance = float(np.std(counts)) / (np.mean(counts) + 1e-6)

        # Class disagreement across passes
        all_cls = [frozenset(s) for s in all_class_sets]
        unique_class_sets = len(set(all_cls)) / len(all_cls)

        # Confidence spread
        conf_std = float(np.std(flat_confs))

        # Composite uncertainty
        uncertainty = (
            0.40 * min(count_variance, 1.0) +
            0.35 * conf_std +
            0.25 * unique_class_sets
        )
        uncertainty = float(np.clip(uncertainty, 0, 1))
        return round(uncertainty, 4), round(avg_conf, 4)

    def _build_augmentations(self, img: np.ndarray) -> List[np.ndarray]:
        """Generate N augmented versions for TTA"""
        augs = [img.copy()]  # original
        h, w = img.shape[:2]

        # Brightness jitter
        for delta in [-30, +30]:
            aug = np.clip(img.astype(np.int32) + delta, 0, 255).astype(np.uint8)
            augs.append(aug)

        # Horizontal flip
        augs.append(cv2.flip(img, 1))

        # Slight rotation
        for angle in [-5, 5]:
            M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
            rotated = cv2.warpAffine(img, M, (w, h))
            augs.append(rotated)

        # Gaussian blur (simulate motion)
        augs.append(cv2.GaussianBlur(img, (3, 3), 0))

        return augs[:self.n_passes]


# ─────────────────────────────────────────────
# TRUST ENGINE
# ─────────────────────────────────────────────

class TrustEngine:
    """
    Lightweight logistic-regression-style trust model.
    Trained analytically — no dataset needed.
    Produces a trust score + human-readable decision.
    """

    def compute(
        self,
        avg_confidence: float,
        uncertainty: float,
        quality_score: float,
        defect_count: int,
        anomaly_flags: List[str]
    ) -> tuple[float, str, str]:
        """
        Returns (trust_score 0–1, decision, reason)
        """

        # Base trust from confidence and uncertainty
        base = (avg_confidence * 0.45) + ((1 - uncertainty) * 0.35) + (quality_score * 0.20)

        # Penalty rules
        penalty = 0.0
        reasons = []

        if "BLURRY_IMAGE" in anomaly_flags:
            penalty += 0.20
            reasons.append("image is blurry")
        if "TOO_DARK" in anomaly_flags or "OVEREXPOSED" in anomaly_flags:
            penalty += 0.10
            reasons.append("poor lighting")
        if "HIGH_NOISE" in anomaly_flags:
            penalty += 0.10
            reasons.append("high image noise")
        if uncertainty > 0.6:
            penalty += 0.15
            reasons.append("high prediction variance")
        if avg_confidence < 0.50:
            penalty += 0.15
            reasons.append("low detection confidence")
        if defect_count > 3:
            penalty += 0.05
            reasons.append("multiple defects detected")

        trust = float(np.clip(base - penalty, 0.0, 1.0))
        trust = round(trust, 4)

        # Decision thresholds
        if trust >= 0.78:
            decision = "ACCEPT"
            reason = "High trust — AI decision reliable."
        elif trust >= 0.52:
            decision = "HUMAN_REVIEW"
            reason = "Moderate trust — recommend human verification" + (
                f" due to: {', '.join(reasons)}." if reasons else "."
            )
        else:
            decision = "REJECT"
            reason = "Low trust — AI result unreliable" + (
                f" due to: {', '.join(reasons)}." if reasons else "."
            )

        return trust, decision, reason


# ─────────────────────────────────────────────
# ANOMALY DETECTOR (post-detection rules)
# ─────────────────────────────────────────────

class AnomalyDetector:
    """
    Rule-based anomaly flags applied AFTER YOLO detections.
    Catches things YOLO might miss via structural reasoning.
    """

    def analyze(
        self,
        detections: List[Detection],
        image_bgr: np.ndarray
    ) -> List[str]:
        flags = []

        pills = [d for d in detections if d.class_name == "pill"]
        missing = [d for d in detections if d.class_name == "missing_pill"]
        defects = [d for d in detections if d.class_name == "defect"]

        total = len(pills) + len(missing)

        # Blister packs typically have 6, 8, 10, 12, or 16 slots
        STANDARD_COUNTS = {6, 8, 10, 12, 14, 16}
        if total > 0 and total not in STANDARD_COUNTS:
            flags.append(f"UNUSUAL_SLOT_COUNT:{total}")

        # High missing rate
        if total > 0 and len(missing) / total > 0.5:
            flags.append("HIGH_MISSING_RATE")

        # No pills at all — likely wrong image
        if len(pills) == 0 and len(missing) == 0:
            flags.append("NO_PILLS_DETECTED")

        # Multiple defects
        if len(defects) >= 3:
            flags.append("MULTIPLE_DEFECTS")

        # Check for uniform spacing violations (overlapping detections)
        if len(pills) > 1:
            bboxes = [d.bbox for d in pills]
            if self._has_significant_overlap(bboxes):
                flags.append("OVERLAPPING_DETECTIONS")

        return flags

    def _has_significant_overlap(self, bboxes: List[List[float]]) -> bool:
        for i in range(len(bboxes)):
            for j in range(i + 1, len(bboxes)):
                iou = self._iou(bboxes[i], bboxes[j])
                if iou > 0.3:
                    return True
        return False

    def _iou(self, a, b) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
        return inter / (union + 1e-6)


# ─────────────────────────────────────────────
# MAIN INSPECTOR
# ─────────────────────────────────────────────

class BlisterInspector:
    """
    Full pipeline: Image → Detections → Quality → Uncertainty → Trust → Decision
    """

    MODEL_PATH = os.environ.get("BLISTER_MODEL_PATH", "model/best.pt")
    FALLBACK_PATH = "yolov8n.pt"  # used before custom model is trained

    def __init__(self):
        # Load model
        model_path = self.MODEL_PATH if os.path.exists(self.MODEL_PATH) else self.FALLBACK_PATH
        logger.info(f"Loading model: {model_path}")
        self.yolo = YOLO(model_path)

        self.quality_analyzer = ImageQualityAnalyzer()
        self.uncertainty_estimator = UncertaintyEstimator(self.yolo, n_passes=7)
        self.trust_engine = TrustEngine()
        self.anomaly_detector = AnomalyDetector()

        logger.info("BlisterInspector initialized ✓")

    def inspect(self, image_input) -> InspectionResult:
        """
        image_input: file path (str) OR numpy BGR array OR PIL Image
        Returns: InspectionResult
        """
        image_bgr = self._load_image(image_input)
        h, w = image_bgr.shape[:2]

        # ── Step 1: Image Quality ──
        quality_score, quality_flags = self.quality_analyzer.analyze(image_bgr)

        # ── Step 2: YOLO Detection (single clean pass) ──
        raw_results = self.yolo(image_bgr, verbose=False, conf=0.35)
        detections = self._parse_detections(raw_results, w, h)

        # ── Step 3: Uncertainty via TTA ──
        uncertainty, avg_confidence = self.uncertainty_estimator.estimate(image_bgr)

        # ── Step 4: Post-detection anomaly rules ──
        anomaly_flags = self.anomaly_detector.analyze(detections, image_bgr)
        all_flags = quality_flags + anomaly_flags

        # ── Step 5: Trust score + decision ──
        defect_count = sum(1 for d in detections if d.class_name == "defect")
        trust_score, decision, reason = self.trust_engine.compute(
            avg_confidence, uncertainty, quality_score, defect_count, all_flags
        )

        return InspectionResult(
            detections=detections,
            uncertainty_score=uncertainty,
            image_quality_score=quality_score,
            trust_score=trust_score,
            decision=decision,
            decision_reason=reason,
            avg_confidence=avg_confidence,
            defect_count=defect_count,
            missing_count=sum(1 for d in detections if d.class_name == "missing_pill"),
            pill_count=sum(1 for d in detections if d.class_name == "pill"),
            anomaly_flags=all_flags,
        )

    def _parse_detections(self, results, img_w: int, img_h: int) -> List[Detection]:
        detections = []
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                area = (x2 - x1) * (y2 - y1) / (img_w * img_h)
                detections.append(Detection(
                    class_name=self.yolo.names[int(box.cls[0])],
                    confidence=round(float(box.conf[0]), 4),
                    bbox=[
                        round(x1 / img_w, 4), round(y1 / img_h, 4),
                        round(x2 / img_w, 4), round(y2 / img_h, 4)
                    ],
                    area_fraction=round(float(area), 4),
                ))
        return detections

    def _load_image(self, inp) -> np.ndarray:
        if isinstance(inp, np.ndarray):
            return inp
        if isinstance(inp, Image.Image):
            return cv2.cvtColor(np.array(inp), cv2.COLOR_RGB2BGR)
        if isinstance(inp, str):
            img = cv2.imread(inp)
            if img is None:
                raise ValueError(f"Cannot read image: {inp}")
            return img
        raise TypeError(f"Unsupported image type: {type(inp)}")

    def result_to_dict(self, result: InspectionResult) -> dict:
        d = asdict(result)
        return d
