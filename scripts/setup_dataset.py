"""
BlisterVision — Dataset Setup Script
=======================================
Downloads public blister pack datasets and structures them for YOLO training.

Datasets used:
  1. Roboflow "Blister Pack Detection" (primary)
  2. MVTec AD Pill subset (texture defects)
  3. PharmaCare Blister (synthetic augmentation source)

Run: python scripts/setup_dataset.py
"""

import os
import sys
import zipfile
import shutil
import random
import json
from pathlib import Path
import urllib.request

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    print("Install requirements first: pip install -r requirements.txt")
    sys.exit(1)


BASE_DIR = Path("dataset")
IMAGES_TRAIN = BASE_DIR / "images/train"
IMAGES_VAL   = BASE_DIR / "images/val"
LABELS_TRAIN = BASE_DIR / "labels/train"
LABELS_VAL   = BASE_DIR / "labels/val"

CLASS_MAP = {"pill": 0, "missing_pill": 1, "defect": 2}
VAL_SPLIT = 0.2


def create_dirs():
    for d in [IMAGES_TRAIN, IMAGES_VAL, LABELS_TRAIN, LABELS_VAL]:
        d.mkdir(parents=True, exist_ok=True)
    print("✓ Directories created")


def download_roboflow_dataset(api_key: str = None, workspace: str = None, project: str = None):
    """
    Downloads from Roboflow if API key provided.
    Without API key: prints instructions for manual download.
    """
    if not api_key:
        print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATASET OPTION 1: Roboflow (RECOMMENDED — Free)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Go to: https://universe.roboflow.com
2. Search: "blister pack detection"
3. Top result: "blister-pack-detection" by sfu-iasl
4. Click: Download → YOLOv8 format
5. Extract ZIP to: dataset/

OR use Roboflow Python SDK:
  pip install roboflow
  
  from roboflow import Roboflow
  rf = Roboflow(api_key="YOUR_KEY")
  project = rf.workspace("sfu-iasl").project("blister-pack-detection")
  dataset = project.version(1).download("yolov8")
  
Then re-run this script.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
        return False

    try:
        from roboflow import Roboflow
        rf = Roboflow(api_key=api_key)
        project = rf.workspace(workspace or "sfu-iasl").project(project or "blister-pack-detection")
        dataset = project.version(1).download("yolov8", location=str(BASE_DIR))
        print("✓ Roboflow dataset downloaded")
        return True
    except Exception as e:
        print(f"Roboflow download failed: {e}")
        return False


def generate_synthetic_dataset(n_images: int = 150):
    """
    Generates synthetic blister pack images when no real dataset is available.
    Creates realistic blister pack patterns with pills, missing slots, and defects.
    """
    print(f"Generating {n_images} synthetic blister pack images...")

    generated = []
    for i in range(n_images):
        img, labels = _generate_blister_image()
        fname = f"synth_{i:04d}.jpg"
        split = "val" if i < int(n_images * VAL_SPLIT) else "train"

        img_path = BASE_DIR / f"images/{split}/{fname}"
        lbl_path = BASE_DIR / f"labels/{split}/{fname.replace('.jpg','.txt')}"

        img.save(str(img_path), quality=92)
        with open(lbl_path, "w") as f:
            for lbl in labels:
                f.write(lbl + "\n")

        generated.append(fname)

    print(f"✓ Generated {len(generated)} synthetic images")
    return len(generated)


def _generate_blister_image():
    """Creates one synthetic blister pack image with YOLO labels."""
    W, H = 640, 480
    img = Image.new("RGB", (W, H), color=_random_background())
    draw = ImageDraw.Draw(img)
    labels = []

    # Pack grid (rows x cols)
    rows = random.choice([2, 3, 4])
    cols = random.choice([4, 5, 6])

    cell_w = int(W * 0.85 / cols)
    cell_h = int(H * 0.85 / rows)
    ox = int(W * 0.08)
    oy = int(H * 0.08)

    # Draw foil background
    draw.rectangle([ox - 5, oy - 5, ox + cols * cell_w + 5, oy + rows * cell_h + 5],
                   fill=_foil_color(), outline=(180, 180, 180), width=2)

    for r in range(rows):
        for c in range(cols):
            cx = ox + c * cell_w + cell_w // 2
            cy = oy + r * cell_h + cell_h // 2
            rw = int(cell_w * 0.38)
            rh = int(cell_h * 0.42)

            fate = random.random()
            if fate < 0.70:
                # Normal pill
                _draw_pill(draw, cx, cy, rw, rh)
                labels.append(_yolo_label(0, cx, cy, rw * 2, rh * 2, W, H))
            elif fate < 0.85:
                # Missing pill — empty cavity
                _draw_empty_cavity(draw, cx, cy, rw, rh)
                labels.append(_yolo_label(1, cx, cy, rw * 2, rh * 2, W, H))
            else:
                # Defect pill
                _draw_defect_pill(draw, cx, cy, rw, rh)
                labels.append(_yolo_label(2, cx, cy, rw * 2, rh * 2, W, H))

    # Add realistic noise
    img_np = np.array(img)
    noise = np.random.normal(0, random.uniform(2, 8), img_np.shape).astype(np.int16)
    img_np = np.clip(img_np.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(img_np)

    return img, labels


def _random_background():
    bg = random.choice(["silver", "lightblue", "lightgray", "beige", "lightyellow"])
    base = {"silver":(192,192,192),"lightblue":(173,216,230),"lightgray":(211,211,211),
            "beige":(245,245,220),"lightyellow":(255,255,224)}
    r, g, b = base[bg]
    jitter = lambda v: max(0, min(255, v + random.randint(-15, 15)))
    return (jitter(r), jitter(g), jitter(b))

def _foil_color():
    v = random.randint(180, 230)
    return (v, v, v + random.randint(-10, 10))

def _draw_pill(draw, cx, cy, rw, rh):
    color = random.choice([
        (220, 220, 255), (255, 220, 220), (220, 255, 220),
        (255, 240, 150), (200, 230, 255)
    ])
    draw.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=color, outline=(150, 150, 150), width=1)
    # Highlight
    draw.ellipse([cx - rw//3, cy - rh//2, cx + rw//4, cy - rh//4],
                 fill=(255, 255, 255, 120), outline=None)

def _draw_empty_cavity(draw, cx, cy, rw, rh):
    draw.ellipse([cx - rw, cy - rh, cx + rw, cy + rh],
                 fill=(50, 50, 60), outline=(80, 80, 90), width=1)

def _draw_defect_pill(draw, cx, cy, rw, rh):
    color = random.choice([(220,220,255),(255,220,220)])
    # Broken/chipped pill
    draw.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=color, outline=(100, 100, 100), width=1)
    # Crack lines
    n_cracks = random.randint(1, 3)
    for _ in range(n_cracks):
        sx = cx + random.randint(-rw, rw)
        sy = cy + random.randint(-rh, rh)
        ex = sx + random.randint(-rw, rw)
        ey = sy + random.randint(-rh, rh)
        draw.line([(sx, sy), (ex, ey)], fill=(80, 40, 40), width=2)
    # Broken chunk
    if random.random() > 0.5:
        draw.polygon([(cx, cy), (cx + rw, cy - rh//2), (cx + rw, cy + rh//2)],
                     fill=(50, 50, 60))

def _yolo_label(cls_id, cx, cy, w, h, img_w, img_h):
    return f"{cls_id} {cx/img_w:.6f} {cy/img_h:.6f} {w/img_w:.6f} {h/img_h:.6f}"


def write_data_yaml():
    yaml_content = f"""# BlisterVision Dataset Config
path: {BASE_DIR.resolve()}
train: images/train
val: images/val

nc: 3
names:
  0: pill
  1: missing_pill
  2: defect
"""
    with open("data.yaml", "w") as f:
        f.write(yaml_content)
    print("✓ data.yaml written")


def summarize():
    train_imgs = list((BASE_DIR / "images/train").glob("*.jpg")) + \
                 list((BASE_DIR / "images/train").glob("*.png"))
    val_imgs   = list((BASE_DIR / "images/val").glob("*.jpg")) + \
                 list((BASE_DIR / "images/val").glob("*.png"))
    print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dataset Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Train images : {len(train_imgs)}
  Val images   : {len(val_imgs)}
  Total        : {len(train_imgs) + len(val_imgs)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next: python scripts/train.py
""")


if __name__ == "__main__":
    create_dirs()

    # Try Roboflow first (set your API key here or via env var)
    api_key = os.environ.get("ROBOFLOW_API_KEY", "")
    got_real_data = download_roboflow_dataset(api_key)

    if not got_real_data:
        print("\nFalling back to synthetic data generation...")
        generate_synthetic_dataset(n_images=200)

    write_data_yaml()
    summarize()
