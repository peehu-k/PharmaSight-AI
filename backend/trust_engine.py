import numpy as np


class TrustEngine:

    @staticmethod
    def clamp(x: float, a: float = 0.0, b: float = 1.0) -> float:
        return float(np.clip(x, a, b))

    @staticmethod
    def _to_unit(value: float) -> float:
        v = float(value)
        return v / 100.0 if v > 1.0 else v

    # ─────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _box_area(b):
        return (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])

    @staticmethod
    def _box_aspect_ratio(b):
        w = b["x2"] - b["x1"] + 1e-6
        h = b["y2"] - b["y1"] + 1e-6
        return max(w / h, h / w)

    # ─────────────────────────────────────────────────────────────
    # MULTI PACK (FIXED)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _grid_alignment_score(boxes):
        if len(boxes) < 6:
            return 1.0

        centers = np.array([
            [(b["x1"] + b["x2"]) / 2, (b["y1"] + b["y2"]) / 2]
            for b in boxes
        ])

        y_sorted = np.sort(centers[:, 1])
        row_gaps = np.diff(y_sorted)

        if len(row_gaps) == 0:
            return 1.0

        row_consistency = np.std(row_gaps) / (np.mean(row_gaps) + 1e-6)

        x_sorted = np.sort(centers[:, 0])
        col_gaps = np.diff(x_sorted)

        col_consistency = np.std(col_gaps) / (np.mean(col_gaps) + 1e-6)

        grid_noise = (row_consistency + col_consistency) / 2

        return float(np.exp(-grid_noise))

    @staticmethod
    def _check_multiple_packs(boxes):
        if len(boxes) < 10:
            return False

        cx = np.array([(b["x1"] + b["x2"]) / 2 for b in boxes])
        cy = np.array([(b["y1"] + b["y2"]) / 2 for b in boxes])

        spread_x = np.std(cx)
        spread_y = np.std(cy)

        return spread_x > 200 and spread_y > 200
    # ─────────────────────────────────────────────────────────────
    # VALIDATION (CORE FIXED LOGIC)
    # ─────────────────────────────────────────────────────────────

    def compute_validation(self, boxes):

        if not boxes:
            return {
                "validation_score": 0.0,
                "issues": ["no_detections"],
                "hard_fail": True
            }

        violations = []

        pill_boxes = [b for b in boxes if "pill" in b["label"].lower()]
        empty_boxes = [b for b in boxes if "empty" in b["label"].lower()]

        pill_count = len(pill_boxes)
        empty_count = len(empty_boxes)

        # ─────────────────────────────
        # 1. ACTUAL DEFECT CHECK
        # ─────────────────────────────

        total_slots = pill_count + empty_count

        if total_slots > 0:
            missing_ratio = empty_count / total_slots
        else:
            missing_ratio = 0

        if empty_count >= 1:
            violations.append("missing_pills_detected")

        # ─────────────────────────────
        # 2. OBSTRUCTION (HAND ETC)
        # ─────────────────────────────

        areas = [self._box_area(b) for b in boxes]
        median_area = np.median(areas)

        large_objects = sum(a > median_area * 3 for a in areas)

        if large_objects >= 2:
            violations.append("obstruction_detected")

        # ─────────────────────────────
        # 3. MULTI PACK
        # ─────────────────────────────

        if self._check_multiple_packs(boxes):
            violations.append("multiple_packs")

        # ─────────────────────────────
        # 4. GRID (ONLY IF VERY BAD)
        # ─────────────────────────────

        grid_score = self._grid_alignment_score(boxes)

        if grid_score < 0.05 and len(boxes) > 10:  # VERY strict
            violations.append("grid_broken")

        # ─────────────────────────────
        # SCORING
        # ─────────────────────────────

        score = 1.0

        # 🔴 PRODUCT DEFECT PENALTY (SMART)
        if empty_count > 0:
            # nonlinear penalty (more missing → much worse)
            score *= (1 - missing_ratio) ** 1.5

        score = max(0.0, score)
        if empty_count == 0:
            score = 1.0

        # HARD FAIL ONLY FOR CAMERA / SCENE ISSUES
        hard_fail = any(v in [
            "obstruction_detected",
            "multiple_packs"
        ] for v in violations)

        return {
            "validation_score": score,
            "issues": violations if violations else ["none"],
            "hard_fail": hard_fail
        }

    # ─────────────────────────────────────────────────────────────
    # MAIN (UNCHANGED STRUCTURE)
    # ─────────────────────────────────────────────────────────────

    def compute(self, quality_metrics, detection_result):

        boxes = detection_result.get("boxes", [])

        validation = self.compute_validation(boxes)

        validation_score = validation["validation_score"]
        issues = validation["issues"]
        hard_fail = validation["hard_fail"]

        # CAMERA TRUST (UNCHANGED)
        brightness = self.clamp(self._to_unit(quality_metrics.get("brightness", 0.5)))
        contrast = self.clamp(self._to_unit(quality_metrics.get("contrast", 0.5)))
        sharpness = self.clamp(self._to_unit(quality_metrics.get("sharpness", 0.5)))

        noise = self.clamp(self._to_unit(quality_metrics.get("noise_quality", 0.5)))
        exposure = self.clamp(self._to_unit(quality_metrics.get("exposure", 0.5)))
        dynamic_range = self.clamp(self._to_unit(quality_metrics.get("dynamic_range", 0.5)))
        centering = self.clamp(self._to_unit(quality_metrics.get("centering", 0.5)))
        detection_conf = self.clamp(self._to_unit(quality_metrics.get("detection_confidence", 0.5)))

        factors = {
            "brightness": brightness,
            "contrast": contrast,
            "sharpness": sharpness,
            "noise": noise,
            "exposure": exposure,
            "dynamic_range": dynamic_range,
            "centering": centering,
            "detection_conf": detection_conf
        }

        values = list(factors.values())

        # 1. geometric mean (balances all factors)
        geo_mean = np.prod(values) ** (1 / len(values))

        # 2. weakest factor penalty (CRITICAL)
        min_factor = min(values)

        if min_factor < 0.4:
            weak_penalty = (min_factor / 0.4) ** 2
        else:
            weak_penalty = 1.0

        # 3. detection confidence importance
        trust = geo_mean * weak_penalty

        # detection still matters but not dominant
        trust = 0.75 * trust + 0.25 * detection_conf

        # hard camera fails
        if sharpness < 0.25:
            trust *= 0.6

        if brightness < 0.2 or exposure < 0.2:
            trust *= 0.6

        if noise < 0.2:
            trust *= 0.7

        # ─────────────────────────────
        # FINAL DECISION (FIXED LOGIC)
        # ─────────────────────────────
        override= False
        if "missing_pills_detected" in issues:
            decision = "DEFECT_PRESENT"
            label = "REJECT"
            color = "red"

        elif hard_fail:
            decision = "INVALID_IMAGE"
            label = "REJECT"
            color = "red"

        elif trust >= 0.75:
            decision = "GOOD"
            label = "ACCEPT"
            color = "green"

        elif trust >= 0.5:
            decision = "LOW_TRUST"
            label = "CAUTION"
            color = "yellow"

        else:
            decision = "INVALID_IMAGE"
            label = "REJECT"
            color = "red"


        factor_scores = {
            "brightness": brightness * 100,
            "contrast": contrast * 100,
            "sharpness": sharpness * 100,
            "noise": noise * 100,
            "exposure": exposure * 100,
            "centering": centering * 100
        }

        bottleneck_factor = min(factor_scores, key=factor_scores.get)
        bottleneck_value = factor_scores[bottleneck_factor]
        return {
            "trust_score": round(trust * 100, 2),
            "decision": decision,
            "decision_label": label,
            "decision_color": color,

            "validation_score": round(validation_score * 100, 2),
            "validation_issues": issues,
            "override": override,
            
            "factor_scores": factor_scores,
            "bottleneck_factor": bottleneck_factor,
            "bottleneck_value": bottleneck_value,
            "detection_confidence_raw": detection_conf * 100,
        }