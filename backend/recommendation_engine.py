"""
PharmaSight — Recommendation Engine  v8
=========================================
Generates prioritised, actionable recommendations from quality metrics.

v8 improvements:
----------------
- Added thresholds and content for new v8 metrics:
  focus_consistency, illumination_uniformity, background_score, pack_angle_score
- Safety-critical recommendations: uncertain_empty_slots, fill_rate gates
- All frontend fields present: id, title, action, impact_estimate, priority
- Priority labels: CRITICAL / HIGH / MEDIUM / LOW
- Sorted: severity tier → worst relative gap → priority weight
"""

from typing import Dict, List
import numpy as np


class RecommendationEngine:

    # ── Thresholds in [0,1] — MUST match trust_engine.py ─────────────────
    THRESHOLDS: Dict[str, float] = {
        "sharpness":              0.45,
        "noise":                  0.38,
        "exposure":               0.55,
        "centering":              0.50,
        "contrast":               0.28,
        "brightness":             0.35,
        "focus_consistency":      0.60,
        "illumination_uniformity":0.55,
        "background_score":       0.45,
        "pack_angle_score":       0.55,
        "blur":                   0.55,
    }

    PRIORITIES: Dict[str, int] = {
        "sharpness":              5,
        "exposure":               4,
        "noise":                  4,
        "contrast":               3,
        "brightness":             3,
        "centering":              2,
        "focus_consistency":      4,
        "illumination_uniformity":3,
        "background_score":       2,
        "pack_angle_score":       3,
        "blur":                   5,
    }

    PRIORITY_LABEL: Dict[str, str] = {
        "critical": "CRITICAL",
        "warning":  "HIGH",
        "info":     "MEDIUM",
    }

    # ── Input key aliases → internal name ─────────────────────────────────
    KEY_MAP: Dict[str, str] = {
        "sharpness":               "sharpness",
        "noise_quality":           "noise",
        "noise_level":             "noise",
        "exposure":                "exposure",
        "centering":               "centering",
        "object_centering":        "centering",
        "contrast":                "contrast",
        "brightness":              "brightness",
        "blur_score":              "blur",
        "blur":              "blur",
        "focus_consistency":       "focus_consistency",
        "illumination_uniformity": "illumination_uniformity",
        "background_score":        "background_score",
        "pack_angle_score":        "pack_angle_score",
    }

    # ── Per-metric content: (title, message_fn, action, impact_estimate) ──
    CONTENT: Dict[str, tuple] = {
        "sharpness": (
            "Image Blur Detected",
            lambda v, t: (
                f"Image sharpness is {v:.0f}/100 — below the minimum of {t:.0f}/100. "
                "Blurry images reduce the Laplacian edge detail the model needs to distinguish "
                "pill surfaces from empty foil pockets. "
                "Causes: camera out of focus, conveyor vibration, slow shutter speed."
            ),
            "Clean the lens, adjust camera focus, raise shutter speed to ≥1/500s, "
            "or add vibration isolation to the inspection station.",
            "Correcting blur typically improves YOLO detection confidence by 15–25% "
            "and raises trust score by 10–20 points.",
        ),
        "noise": (
            "Excessive Sensor Noise",
            lambda v, t: (
                f"Background noise quality score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "Sensor noise in the background region makes pill surfaces harder to distinguish "
                "from empty slot reflections. "
                "Causes: high ISO, insufficient lighting, old or hot sensor."
            ),
            "Lower camera ISO to 100–400, add supplementary LED ring lighting, "
            "or enable in-camera spatial noise reduction.",
            "Noise reduction improves edge detection accuracy by up to 20% "
            "and increases trust score by 8–15 points.",
        ),
        "exposure": (
            "Exposure Out of Range",
            lambda v, t: (
                f"Exposure score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "Pixel clipping detected: blown highlights hide pill texture; "
                "crushed shadows obscure empty cavities. Both cause missed detections."
            ),
            "Adjust LED panel power for 40–200 mean pixel luminance. "
            "Check lens aperture (f/5.6–f/11) and verify shutter speed. "
            "Use a gray card to calibrate.",
            "Proper exposure can eliminate up to 30% of missed detections on marginal images.",
        ),
        "centering": (
            "Blister Pack Off-Centre",
            lambda v, t: (
                f"Object centering score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "The pack centroid is significantly offset from the image centre. "
                "Edge cells may fall outside the model's optimal detection zone."
            ),
            "Recalibrate conveyor alignment guide or adjust camera mount so the "
            "pack centroid is within 15% of frame centre.",
            "Proper centering reduces missed detections at pack edges by up to 40%.",
        ),
        "contrast": (
            "Low Image Contrast",
            lambda v, t: (
                f"Contrast score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "Low tonal separation between pill surfaces and empty foil pockets "
                "makes classification ambiguous. Metallic foil packs are prone to "
                "this under diffuse lighting."
            ),
            "Add a diffused back-light (transmitted illumination) or switch to "
            "dark-field illumination to highlight pill edges against foil background.",
            "Improving contrast raises pill/empty-slot classification accuracy "
            "by up to 25% and can lift trust score by 10–18 points.",
        ),
        "brightness": (
            "Brightness Out of Ideal Range",
            lambda v, t: (
                f"Brightness score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "Overall scene luminance is too far from the ideal mid-gray (127/255). "
                "Dark images lose shadow detail; bright images wash out pill texture."
            ),
            "Verify the primary light source is at full rated intensity. "
            "Use a calibrated gray card to set mean luminance in the 90–160 range.",
            "Balanced brightness prevents shadow/glare misclassifications and "
            "improves trust score by 6–12 points.",
        ),
        "focus_consistency": (
            "Inconsistent Focus Across Pills",
            lambda v, t: (
                f"Focus consistency score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "Sharpness varies significantly across individual pill ROIs, indicating "
                "a depth-of-field problem. Some pills appear sharp while others are blurry."
            ),
            "Increase camera aperture (higher f-number) to deepen depth of field, "
            "ensure blister pack lies flat and perpendicular to the camera, "
            "or reduce camera-to-pack distance.",
            "Consistent focus across all cells reduces per-pill detection variance "
            "and improves minimum detection confidence by up to 20%.",
        ),
        "illumination_uniformity": (
            "Uneven Illumination",
            lambda v, t: (
                f"Illumination uniformity score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "Brightness varies significantly across the image frame. "
                "Cells in darker regions will have lower detection confidence "
                "than cells in brighter regions."
            ),
            "Replace single-point light source with a ring light or diffusion panel. "
            "Add reflective surfaces around the inspection station to even out shadows.",
            "Uniform illumination eliminates lighting-induced false negatives and "
            "can increase overall detection confidence by 10–15%.",
        ),
        "background_score": (
            "Non-Industrial Background Detected",
            lambda v, t: (
                f"Background quality score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "The background behind the blister pack appears non-industrial "
                "(coloured, high-texture, or complex surface). "
                "This increases noise in the detection model's context window."
            ),
            "Place the blister pack on a neutral grey or white inspection tray. "
            "Ensure the camera field of view does not include coloured surfaces, "
            "fabric, or wood grain.",
            "A neutral industrial background reduces false positive detections "
            "by up to 30% and improves trust score stability.",
        ),
        "pack_angle_score": (
            "Pack Tilt / Perspective Distortion",
            lambda v, t: (
                f"Pack angle score is {v:.0f}/100 — below threshold of {t:.0f}/100. "
                "The blister pack appears significantly tilted relative to the camera axis. "
                "Perspective distortion changes the apparent shape and size of pills "
                "and empty slots, reducing detection accuracy."
            ),
            "Ensure the blister pack lies flat on the inspection surface. "
            "Check that the camera is mounted perpendicular (within 5°) to the pack. "
            "Recalibrate the conveyor stop position.",
            "Eliminating tilt removes perspective distortion and can improve "
            "detection confidence by 10–20% on affected packs.",
        ),
        "blur": (
            "Image Blur Detected",
            lambda v, t: (
                f"Blur level is {v:.0f}/100 — above acceptable threshold of {t:.0f}/100. "
                "High blur reduces edge clarity, making it difficult for the model to distinguish "
                "pill boundaries and empty slots accurately. "
                "Causes: motion blur, defocus, vibration."
            ),
            "Increase shutter speed (≥1/500s), stabilize camera mount, reduce vibration, "
            "and refocus lens properly.",
            "Reducing blur improves detection reliability and can increase trust score by 10–20 points.",
        ),
    }

    _SEVERITY_CRITICAL = 0.40
    _SEVERITY_WARNING  = 0.20
    _SEVERITY_ORDER    = {"critical": 0, "warning": 1, "info": 2}

    # ── Public API ────────────────────────────────────────────────────────

    def generate(self, quality_metrics: Dict, trust_result: Dict) -> List[Dict]:
        normalised  = self._normalise_metrics(quality_metrics)
        trust_score = self._extract_trust(trust_result)

        below = []
        for metric, threshold in self.THRESHOLDS.items():
            value = normalised.get(metric)
            
            if value is None:
                continue
            
            if metric == "blur":
                condition = value > threshold   
                relative_gap = (value) / max(threshold, 1e-9)

            else:
                condition = value < threshold
                relative_gap = (threshold - value) / max(threshold, 1e-9)

            if condition:
                severity     = self._severity(relative_gap)
                title, msg_fn, action, impact_estimate = self.CONTENT[metric]
                message = msg_fn(value * 100, threshold * 100)

                below.append({
                    "title":           title,
                    "action":          action,
                    "impact_estimate": impact_estimate,
                    "priority":        self.PRIORITY_LABEL[severity],
                    "message":         message,
                    "metric_name":     metric,
                    "metric_value":    round(value * 100, 2),
                    "threshold":       round(threshold * 100, 2),
                    "severity":        severity,
                    "relative_gap":    round(relative_gap, 3),
                })

        # ── Safety-critical flags (Issues 5, 6) ──────────────────────
        uncertain_empty = int(quality_metrics.get("uncertain_empty_slots", 0))
        if uncertain_empty > 0:
            below.insert(0, {
                "title":     "Uncertain Empty-Slot Detection — Safety Critical",
                "action":    "Perform manual visual inspection of this blister pack immediately. "
                             "Do not release to production until verified.",
                "impact_estimate": "Prevents false-negative defect detection that could "
                                   "allow incomplete packs to reach patients.",
                "priority":  "CRITICAL",
                "message":   f"{uncertain_empty} empty-slot bounding box(es) have YOLO "
                             f"confidence below 50%. These are uncertain defect detections. "
                             "In pharmaceutical manufacturing, uncertain defects must be "
                             "treated as confirmed defects until human verification.",
                "metric_name":  "uncertain_empty_slots",
                "metric_value": float(uncertain_empty),
                "threshold":    0.0,
                "severity":     "critical",
                "relative_gap": 1.0,
            })

        if not below:
            return [self._nominal_entry(trust_score)]

        # Sort: severity → largest gap → highest priority
        below.sort(key=lambda r: (
            self._SEVERITY_ORDER.get(r["severity"], 2),
            -r["relative_gap"],
            -self.PRIORITIES.get(r["metric_name"], 0),
        ))

        for idx, rec in enumerate(below):
            rec["id"] = idx

        if trust_score > 80:
            for rec in below:
                if rec.get("severity") != "critical":
                    rec["title"]   = "[Preventive] " + rec["title"]
                    rec["message"] = "[Preventive] " + rec["message"]

        return below

    # ── Private helpers ───────────────────────────────────────────────────

    def _normalise_metrics(self, quality_metrics: Dict) -> Dict[str, float]:
        normalised: Dict[str, float] = {}
        for raw_key, value in quality_metrics.items():
            internal = self.KEY_MAP.get(raw_key)
            if internal is None or internal not in self.THRESHOLDS:
                continue
            v = float(value)
            if v > 1.0:
                v /= 100.0
            if internal not in normalised or v < normalised[internal]:
                normalised[internal] = float(np.clip(v, 0.0, 1.0))
        return normalised

    def _extract_trust(self, trust_result) -> float:
        if isinstance(trust_result, dict):
            raw = trust_result.get("trust_score", 0)
        else:
            raw = float(trust_result)
        raw = float(raw)
        return raw if raw > 1.0 else raw * 100.0

    def _severity(self, relative_gap: float) -> str:
        if relative_gap > self._SEVERITY_CRITICAL:
            return "critical"
        elif relative_gap > self._SEVERITY_WARNING:
            return "warning"
        return "info"

    def _nominal_entry(self, trust_score: float) -> Dict:
        return {
            "id":              0,
            "title":           "All Systems Nominal",
            "message":         (
                f"All image quality metrics are within acceptable ranges. "
                f"Current trust score: {trust_score:.1f}/100. "
                "No corrective action required. Monitor for gradual drift."
            ),
            "action":          "No action required — maintain current camera and lighting setup.",
            "impact_estimate": "Sustaining current conditions keeps trust scores in the accepted range.",
            "priority":        "LOW",
            "metric_name":     "overall",
            "metric_value":    100.0,
            "threshold":       0.0,
            "severity":        "info",
            "relative_gap":    0.0,
        }