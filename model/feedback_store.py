"""
BlisterVision — Feedback Learning System
=========================================
Stores human corrections, builds retraining datasets, triggers fine-tuning.
"""

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional
import logging

logger = logging.getLogger("BlisterVision.Feedback")

FEEDBACK_DIR = Path("feedback_store")
FEEDBACK_LOG = FEEDBACK_DIR / "corrections.jsonl"
RETRAIN_THRESHOLD = 20  # auto-suggest retraining after N corrections


@dataclass
class FeedbackEntry:
    entry_id: str
    timestamp: float
    image_filename: str
    ai_prediction: dict        # full InspectionResult dict
    correction_type: str       # "wrong_class" | "missed_detection" | "false_positive" | "trust_wrong"
    corrected_labels: list     # list of {class_name, bbox} in YOLO normalized format
    inspector_notes: str
    was_critical_error: bool   # missed defect in real pill = critical


class FeedbackStore:
    def __init__(self):
        FEEDBACK_DIR.mkdir(exist_ok=True)
        (FEEDBACK_DIR / "images").mkdir(exist_ok=True)
        logger.info(f"Feedback store at: {FEEDBACK_DIR.resolve()}")

    def save_correction(
        self,
        image_bytes: bytes,
        ai_result: dict,
        correction_type: str,
        corrected_labels: list,
        notes: str = "",
        critical: bool = False
    ) -> FeedbackEntry:
        entry_id = str(uuid.uuid4())[:8]
        ts = time.time()
        fname = f"{entry_id}_{int(ts)}.jpg"

        # Save image
        img_path = FEEDBACK_DIR / "images" / fname
        with open(img_path, "wb") as f:
            f.write(image_bytes)

        entry = FeedbackEntry(
            entry_id=entry_id,
            timestamp=ts,
            image_filename=fname,
            ai_prediction=ai_result,
            correction_type=correction_type,
            corrected_labels=corrected_labels,
            inspector_notes=notes,
            was_critical_error=critical,
        )

        # Append to JSONL log
        with open(FEEDBACK_LOG, "a") as f:
            f.write(json.dumps(asdict(entry)) + "\n")

        logger.info(f"Saved feedback {entry_id} ({correction_type})")
        self._check_retrain_trigger()
        return entry

    def get_all_corrections(self) -> list:
        if not FEEDBACK_LOG.exists():
            return []
        with open(FEEDBACK_LOG) as f:
            return [json.loads(line) for line in f if line.strip()]

    def get_correction_count(self) -> int:
        return len(self.get_all_corrections())

    def _check_retrain_trigger(self):
        count = self.get_correction_count()
        if count % RETRAIN_THRESHOLD == 0:
            logger.warning(
                f"⚠ {count} corrections logged — consider retraining. "
                "Run: python scripts/prepare_retrain.py"
            )

    def export_yolo_dataset(self, output_dir: str = "retrain_dataset") -> int:
        """
        Export feedback as a YOLO-format dataset for fine-tuning.
        Returns number of images exported.
        """
        out = Path(output_dir)
        (out / "images").mkdir(parents=True, exist_ok=True)
        (out / "labels").mkdir(parents=True, exist_ok=True)

        corrections = self.get_all_corrections()
        exported = 0

        for entry in corrections:
            if not entry["corrected_labels"]:
                continue

            src_img = FEEDBACK_DIR / "images" / entry["image_filename"]
            if not src_img.exists():
                continue

            dst_img = out / "images" / entry["image_filename"]
            shutil.copy(src_img, dst_img)

            # Write YOLO label file
            label_path = out / "labels" / (src_img.stem + ".txt")
            with open(label_path, "w") as f:
                for lbl in entry["corrected_labels"]:
                    cls_id = lbl.get("class_id", 0)
                    bbox = lbl.get("bbox", [0.5, 0.5, 0.5, 0.5])
                    f.write(f"{cls_id} {' '.join(map(str, bbox))}\n")
            exported += 1

        logger.info(f"Exported {exported} feedback images as YOLO dataset → {out}")
        return exported

    def get_error_analytics(self) -> dict:
        """Summary statistics on feedback data."""
        corrections = self.get_all_corrections()
        if not corrections:
            return {"total": 0}

        from collections import Counter
        types = Counter(c["correction_type"] for c in corrections)
        critical = sum(1 for c in corrections if c.get("was_critical_error"))

        return {
            "total_corrections": len(corrections),
            "critical_errors": critical,
            "by_type": dict(types),
            "critical_rate": round(critical / len(corrections), 3),
        }
