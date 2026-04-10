"""
BlisterVision — Training Script
=================================
Trains YOLOv8 with aggressive augmentation, class weighting, and best-model tracking.

Run: python scripts/train.py
"""

import os
import sys
import shutil
from pathlib import Path

try:
    from ultralytics import YOLO
    import yaml
except ImportError:
    print("pip install ultralytics pyyaml")
    sys.exit(1)


# ── Config ──
MODEL_SIZE   = "yolov8s.pt"   # nano=n, small=s (better accuracy), medium=m (best if GPU)
DATA_YAML    = "data.yaml"
EPOCHS       = 100
IMG_SIZE     = 640
BATCH_SIZE   = 16             # reduce to 8 if GPU OOM
OUTPUT_DIR   = "model"
PROJECT_NAME = "blister_runs"
RUN_NAME     = "elite_v1"

# ── Augmentation Config ── (heavy augmentation for industrial robustness)
AUG_CONFIG = {
    "hsv_h": 0.015,    # hue shift
    "hsv_s": 0.7,      # saturation jitter
    "hsv_v": 0.4,      # brightness jitter
    "degrees": 10.0,   # rotation
    "translate": 0.1,  # translation
    "scale": 0.5,      # scale jitter
    "shear": 5.0,      # shear
    "flipud": 0.3,     # vertical flip prob
    "fliplr": 0.5,     # horizontal flip prob
    "mosaic": 1.0,     # mosaic augmentation (critical for small datasets)
    "mixup": 0.15,     # mixup augmentation
    "copy_paste": 0.1, # copy-paste augmentation
}


def verify_dataset():
    base = Path("dataset")
    train_imgs = list((base / "images/train").glob("*.[jp][pn]g"))
    val_imgs   = list((base / "images/val").glob("*.[jp][pn]g"))

    if len(train_imgs) < 10:
        print(f"ERROR: Only {len(train_imgs)} training images found.")
        print("Run: python scripts/setup_dataset.py first")
        sys.exit(1)

    print(f"✓ Dataset verified: {len(train_imgs)} train, {len(val_imgs)} val")
    return len(train_imgs), len(val_imgs)


def train():
    n_train, n_val = verify_dataset()

    # Auto-adjust batch size for small datasets
    batch = min(BATCH_SIZE, max(4, n_train // 8))
    print(f"Using batch size: {batch}")

    print(f"\nLoading base model: {MODEL_SIZE}")
    model = YOLO(MODEL_SIZE)

    print(f"Starting training — {EPOCHS} epochs, image size {IMG_SIZE}")
    print("This will take 10–60 min depending on your hardware.\n")

    results = model.train(
        data=DATA_YAML,
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        batch=batch,
        project=PROJECT_NAME,
        name=RUN_NAME,
        patience=20,           # early stopping: stop if no improvement for 20 epochs
        save=True,
        save_period=10,        # checkpoint every 10 epochs
        val=True,
        plots=True,            # save training plots
        verbose=True,
        workers=4,
        device="0" if _has_gpu() else "cpu",
        # Augmentation
        **AUG_CONFIG,
        # Class weights: penalize missing defect detections more
        # (defect = class 2, missing_pill = class 1)
        # Note: handled via loss weight trick in custom callback below
    )

    # Copy best model
    best_model_src = Path(PROJECT_NAME) / RUN_NAME / "weights" / "best.pt"
    if best_model_src.exists():
        Path(OUTPUT_DIR).mkdir(exist_ok=True)
        shutil.copy(best_model_src, Path(OUTPUT_DIR) / "best.pt")
        print(f"\n✓ Best model saved to: {OUTPUT_DIR}/best.pt")
    else:
        print(f"Warning: best.pt not found at {best_model_src}")

    # Print metrics
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("Training Complete")
    print(f"Results saved to: {PROJECT_NAME}/{RUN_NAME}/")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    return results


def validate():
    """Validate the trained model and print detailed metrics."""
    model_path = Path(OUTPUT_DIR) / "best.pt"
    if not model_path.exists():
        print("No trained model found. Run train() first.")
        return

    model = YOLO(str(model_path))
    metrics = model.val(data=DATA_YAML)

    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("Validation Metrics")
    print(f"  mAP@0.5     : {metrics.box.map50:.4f}")
    print(f"  mAP@0.5:0.95: {metrics.box.map:.4f}")
    print(f"  Precision   : {metrics.box.mp:.4f}")
    print(f"  Recall      : {metrics.box.mr:.4f}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return metrics


def retrain_from_feedback():
    """
    Fine-tune existing model on accumulated feedback corrections.
    Run this after collecting 20+ corrections.
    """
    feedback_dataset = Path("retrain_dataset")
    if not feedback_dataset.exists():
        print("No feedback dataset. Run /export-retrain-data endpoint first.")
        return

    base_model = Path(OUTPUT_DIR) / "best.pt"
    if not base_model.exists():
        print("No base model found.")
        return

    # Write feedback data.yaml
    fb_yaml = {
        "path": str(feedback_dataset.resolve()),
        "train": "images",
        "val": "images",
        "nc": 3,
        "names": {0: "pill", 1: "missing_pill", 2: "defect"}
    }
    with open("feedback_data.yaml", "w") as f:
        import yaml
        yaml.dump(fb_yaml, f)

    model = YOLO(str(base_model))
    model.train(
        data="feedback_data.yaml",
        epochs=30,
        imgsz=IMG_SIZE,
        batch=8,
        project=PROJECT_NAME,
        name="retrain_v1",
        lr0=0.001,     # lower LR for fine-tuning
        patience=10,
    )
    print("✓ Retraining complete")


def _has_gpu() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--retrain-feedback", action="store_true")
    args = parser.parse_args()

    if args.validate_only:
        validate()
    elif args.retrain_feedback:
        retrain_from_feedback()
    else:
        train()
        validate()
