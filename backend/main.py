import logging
import warnings
import time
import base64
import uuid
from pathlib import Path
from typing import Dict, List

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from pydantic import BaseModel

from fastapi.staticfiles import StaticFiles
import os
from backend.quality_analyzer import ImageQualityAnalyzer
from backend.trust_engine import TrustEngine
from backend.recommendation_engine import RecommendationEngine
from backend.feedback_manager import FeedbackManager
from backend.simulation_engine import SimulationEngine

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
log = logging.getLogger("PharmaSight")

# ─────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────
app = FastAPI(title="PharmaSight API", version="8.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# ─────────────────────────────────────────────
# MODEL
# ─────────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR.parent / "runs" / "detect" / "train" / "weights" / "best_final.pt"

if not MODEL_PATH.exists():
    raise RuntimeError(f"Model not found at {MODEL_PATH}")

model = YOLO(str(MODEL_PATH))
log.info(f"Model loaded — classes: {model.names}")

CLASS_PILL       = None
CLASS_EMPTY_SLOT = None

for k, v in model.names.items():
    vl = v.lower()
    if "pill" in vl or "capsule" in vl or "tablet" in vl:
        CLASS_PILL = k
    elif "empty" in vl or "slot" in vl or "missing" in vl:
        CLASS_EMPTY_SLOT = k

if CLASS_PILL is None:       CLASS_PILL = 0
if CLASS_EMPTY_SLOT is None: CLASS_EMPTY_SLOT = 1

log.info(
    f"CLASS_PILL={CLASS_PILL}({model.names[CLASS_PILL]}), "
    f"CLASS_EMPTY_SLOT={CLASS_EMPTY_SLOT}({model.names[CLASS_EMPTY_SLOT]})"
)

# ─────────────────────────────────────────────
# ENGINES
# ─────────────────────────────────────────────
quality_analyzer      = ImageQualityAnalyzer()
trust_engine          = TrustEngine()
recommendation_engine = RecommendationEngine()
feedback_manager      = FeedbackManager()
simulation_engine     = SimulationEngine(
    quality_analyzer, trust_engine, recommendation_engine, model
)

# ─────────────────────────────────────────────
# CACHE
# ─────────────────────────────────────────────
_inspection_cache:   Dict[str, dict] = {}
_inspection_history: List[dict]      = []

# ─────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────
class SimulateRequest(BaseModel):
    image_id:    str
    adjustments: Dict


class FeedbackRequest(BaseModel):
    image_id:       str
    human_decision: str
    notes:          str = ""


# ─────────────────────────────────────────────
# IMAGE PREPROCESSING
# ─────────────────────────────────────────────
def apply_clahe(img: np.ndarray) -> np.ndarray:
    """CLAHE contrast enhancement — handles foil glare and dark blister images."""
    lab          = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b_ch   = cv2.split(lab)
    clahe        = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l            = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b_ch]), cv2.COLOR_LAB2BGR)


def preprocess(img: np.ndarray) -> np.ndarray:
    return apply_clahe(img)


# ─────────────────────────────────────────────
# DETECTION HELPERS
# ─────────────────────────────────────────────
def parse_detections(results, offset_x: int = 0, offset_y: int = 0) -> List[dict]:
    boxes = []
    for r in results:
        if r.boxes is None:
            continue
        for b in r.boxes:
            cls_id = int(b.cls[0])
            boxes.append({
                "x1":        float(b.xyxy[0][0]) + offset_x,
                "y1":        float(b.xyxy[0][1]) + offset_y,
                "x2":        float(b.xyxy[0][2]) + offset_x,
                "y2":        float(b.xyxy[0][3]) + offset_y,
                "confidence":float(b.conf[0]),
                "class_id":  cls_id,
                "label":     model.names[cls_id],
                "source":    "yolo",
            })
    return boxes


def iou(a: dict, b: dict) -> float:
    ix1   = max(a["x1"], b["x1"]); iy1 = max(a["y1"], b["y1"])
    ix2   = min(a["x2"], b["x2"]); iy2 = min(a["y2"], b["y2"])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    area_b = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    union  = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def nms(boxes: List[dict], iou_thresh: float = 0.4) -> List[dict]:
    if not boxes:
        return []
    boxes      = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    kept       = []
    suppressed = set()
    for i, box in enumerate(boxes):
        if i in suppressed:
            continue
        kept.append(box)
        for j in range(i + 1, len(boxes)):
            if j not in suppressed and iou(box, boxes[j]) > iou_thresh:
                suppressed.add(j)
    return kept


def area_frac(box: dict, img_area: int) -> float:
    return ((box["x2"] - box["x1"]) * (box["y2"] - box["y1"])) / max(img_area, 1)


# ─────────────────────────────────────────────
# CLASSICAL CV CELL DETECTION
# ─────────────────────────────────────────────
def detect_cells_classical(
    img: np.ndarray,
    pack_x1: int, pack_y1: int,
    pack_x2: int, pack_y2: int
) -> List[dict]:
    crop     = img[pack_y1:pack_y2, pack_x1:pack_x2]
    ch, cw   = crop.shape[:2]
    pack_area = ch * cw

    if pack_area == 0:
        log.warning("Classical CV: pack crop is empty")
        return []

    gray    = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    hsv     = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    clahe   = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray_eq = clahe.apply(gray)
    blurred = cv2.GaussianBlur(gray_eq, (7, 7), 0)

    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=35, C=10
    )
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    k_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    thresh  = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, k_close, iterations=2)
    thresh  = cv2.morphologyEx(thresh, cv2.MORPH_OPEN,  k_open,  iterations=1)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    log.info(f"Classical CV: {len(contours)} raw contours in pack region")

    min_area = pack_area * 0.015
    max_area = pack_area * 0.22
    img_mean_brightness = float(np.mean(gray_eq)) + 1e-5
    img_mean_sat        = float(np.mean(hsv[:, :, 1])) + 1e-5

    boxes = []
    for cnt in contours:
        cnt_area = cv2.contourArea(cnt)
        if cnt_area < min_area or cnt_area > max_area:
            continue
        bx, by, bw, bh = cv2.boundingRect(cnt)
        aspect = bw / bh if bh > 0 else 0
        if aspect < 0.15 or aspect > 6.0:
            continue

        roi_gray = gray_eq[by:by+bh, bx:bx+bw]
        roi_hsv  = hsv[by:by+bh, bx:bx+bw]

        mean_brightness   = float(np.mean(roi_gray))
        std_brightness    = float(np.std(roi_gray))
        mean_sat          = float(np.mean(roi_hsv[:, :, 1]))
        mean_hue          = float(np.mean(roi_hsv[:, :, 0]))
        brightness_ratio  = mean_brightness / img_mean_brightness
        has_warm_color    = (5 <= mean_hue <= 30) and (mean_sat > img_mean_sat * 1.15)
        is_bright         = brightness_ratio > 1.08
        has_texture       = std_brightness > 38
        is_pill           = is_bright or has_warm_color or (has_texture and brightness_ratio > 0.93)

        if has_warm_color:         conf = 0.82
        elif is_bright and has_texture: conf = 0.76
        elif is_bright:            conf = 0.68
        elif has_texture:          conf = 0.64
        else:                      conf = 0.62

        boxes.append({
            "x1":        float(pack_x1 + bx),
            "y1":        float(pack_y1 + by),
            "x2":        float(pack_x1 + bx + bw),
            "y2":        float(pack_y1 + by + bh),
            "confidence":conf,
            "class_id":  CLASS_PILL if is_pill else CLASS_EMPTY_SLOT,
            "label":     "pill" if is_pill else "empty_slot",
            "source":    "classical_cv",
        })

    log.info(f"Classical CV: {len(boxes)} cells before NMS")
    boxes    = nms(boxes, iou_thresh=0.35)
    pills_cv = sum(1 for b in boxes if b["class_id"] == CLASS_PILL)
    empty_cv = sum(1 for b in boxes if b["class_id"] == CLASS_EMPTY_SLOT)
    log.info(f"Classical CV final: {len(boxes)} cells — pills={pills_cv}, empty={empty_cv}")
    return boxes


# ─────────────────────────────────────────────
# SMART DETECTION PIPELINE
# ─────────────────────────────────────────────
def smart_detect(img: np.ndarray) -> List[dict]:
    h, w     = img.shape[:2]
    img_area = h * w
    log.info(f"smart_detect — image {w}x{h}px")

    r1       = model(img, conf=0.15, iou=0.45, verbose=False)
    all_boxes1 = parse_detections(r1)
    log.info(f"Stage 1 YOLO: {len(all_boxes1)} raw boxes")
    for b in all_boxes1:
        log.info(f"  {b['label']} conf={b['confidence']:.3f} area={area_frac(b,img_area)*100:.1f}%")

    cell_b1  = [b for b in all_boxes1 if area_frac(b, img_area) < 0.40]
    large_b1 = [b for b in all_boxes1 if area_frac(b, img_area) >= 0.40]
    good1    = [b for b in cell_b1 if b["confidence"] >= 0.10]

    if len(good1) >= 3:
        log.info(f"Stage 1 sufficient — {len(good1)} good detections")
        return nms(good1, iou_thresh=0.4)

    if large_b1:
        pb  = max(large_b1, key=lambda b: b["confidence"])
        px1 = max(0, int(pb["x1"]));  py1 = max(0, int(pb["y1"]))
        px2 = min(w, int(pb["x2"])); py2 = min(h, int(pb["y2"]))
        log.info(f"Pack boundary from YOLO: [{px1},{py1},{px2},{py2}]")
    else:
        margin  = int(min(h, w) * 0.04)
        px1, py1 = margin, margin
        px2, py2 = w - margin, h - margin
        log.info(f"No large box — using full image with margin: [{px1},{py1},{px2},{py2}]")

    pack_crop = img[py1:py2, px1:px2]
    r2        = model(pack_crop, conf=0.02, iou=0.35, verbose=False)
    raw2      = parse_detections(r2, offset_x=px1, offset_y=py1)
    cell_b2   = [b for b in raw2 if 0.003 < area_frac(b, img_area) < 0.40]
    cell_b2   = nms(cell_b2, iou_thresh=0.35)
    log.info(f"Stage 3 YOLO on crop: {len(cell_b2)} boxes")

    good2 = [b for b in cell_b2 if b["confidence"] >= 0.10]
    if len(good2) >= 3:
        log.info(f"Stage 3 sufficient — {len(good2)} good detections")
        return good2

    log.info("YOLO insufficient — running classical CV")
    cv_boxes = detect_cells_classical(img, px1, py1, px2, py2)
    if len(cv_boxes) >= 1:
        return cv_boxes

    log.warning("All detection strategies failed — returning best available YOLO boxes")
    return nms(cell_b2 or cell_b1, iou_thresh=0.4)


# ─────────────────────────────────────────────
# DRAWING
# ─────────────────────────────────────────────
def draw_boxes(img: np.ndarray, boxes: List[dict]) -> np.ndarray:
    out        = img.copy()
    font       = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.35, min(img.shape[0], img.shape[1]) / 1200)
    thickness  = max(1, min(img.shape[0], img.shape[1]) // 300)

    for b in boxes:
        x1, y1, x2, y2 = int(b["x1"]), int(b["y1"]), int(b["x2"]), int(b["y2"])
        color  = (0, 220, 80) if b["class_id"] == CLASS_PILL else (0, 60, 255)
        source = b.get("source", "yolo")
        label  = f"{b['label']} {int(b['confidence']*100)}%"
        if source == "classical_cv":
            label += " [CV]"

        cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)
        (tw, th), _ = cv2.getTextSize(label, font, font_scale, 1)
        label_y = max(th + 4, y1)
        cv2.rectangle(out, (x1, label_y - th - 4), (x1 + tw + 4, label_y), color, -1)
        cv2.putText(out, label, (x1 + 2, label_y - 2), font, font_scale,
                    (255, 255, 255), 1, cv2.LINE_AA)
    return out


def to_base64(img: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return base64.b64encode(buf).decode()


# ─────────────────────────────────────────────
# DISPLAY QUALITY SCALING
# ─────────────────────────────────────────────
# Keys whose raw [0,1] value should be multiplied by 100 for display.
# All other keys (integer counts, already-percentage values) pass through.
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


def build_display_quality(quality: dict) -> dict:
    """Convert raw [0,1] quality dict to [0,100] display dict."""
    dq = {}
    for key, value in quality.items():
        if key in _UNIT_KEYS:
            dq[key] = round(float(value) * 100, 2)
        else:
            dq[key] = value
    return dq


# ─────────────────────────────────────────────
# MAIN ENDPOINT
# ─────────────────────────────────────────────
@app.post("/inspect")
async def inspect(file: UploadFile = File(...)):
    start     = time.time()
    image_id  = str(uuid.uuid4())
    timestamp = time.time()

    raw = await file.read()
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(400, "Could not decode image — unsupported format or corrupted file")

    h, w = img.shape[:2]
    log.info(f"[{image_id[:8]}] {file.filename} — {w}x{h}px")

    img_enhanced = preprocess(img)
    boxes        = smart_detect(img_enhanced)

    pill_count   = sum(1 for b in boxes if b["class_id"] == CLASS_PILL)
    defect_count = sum(1 for b in boxes if b["class_id"] == CLASS_EMPTY_SLOT)
    total_cells  = pill_count + defect_count
    fill_rate    = (pill_count / total_cells * 100) if total_cells > 0 else 0.0

    log.info(f"[{image_id[:8]}] pills={pill_count}, empty={defect_count}, fill={fill_rate:.1f}%")

    # ── Quality analysis on ORIGINAL image ───────────────────────────
    quality = quality_analyzer.analyze(img)

    # ── Detection-derived metrics (v8: pass image_bgr for ROI sharpness,
    #    background noise, and background score) ──────────────────────
    quality = quality_analyzer.update_detection_metrics(
        quality, boxes, w, h, image_bgr=img
    )

    # ── Counts ───────────────────────────────────────────────────────
    quality["detection_count"] = total_cells
    quality["defect_count"]    = defect_count
    quality["pill_count"]      = pill_count
    quality["expected_pills"]  = quality.get("grid_expected_count", total_cells)

    # ── Build display quality (all scores 0-100) ──────────────────────
    display_quality = build_display_quality(quality)

    # ── Trust engine receives raw [0,1] dict ──────────────────────────
    trust = trust_engine.compute(quality, {"boxes": boxes})

    # ── Recommendations receive display [0-100] dict ──────────────────
    recs = recommendation_engine.generate(display_quality, trust)

    # ── Annotated image ───────────────────────────────────────────────
    annotated = draw_boxes(img, boxes)
    filename  = f"{uuid.uuid4().hex}.jpg"
    filepath  = os.path.join(OUTPUT_DIR, filename)
    cv2.imwrite(filepath, annotated)

    detection_method = (
        "yolo" if boxes and any(b.get("source") == "yolo" for b in boxes)
        else "classical_cv"
    )

    response = {
        "image_id":   image_id,
        "timestamp":  timestamp,
        "detection": {
            "boxes":            boxes,
            "labels":           [b["label"] for b in boxes],
            "confidences":      [round(b["confidence"], 3) for b in boxes],
            "pill_count":       pill_count,
            "defect_count":     defect_count,
            "total_cells":      total_cells,
            "fill_rate":        round(fill_rate, 2),
            "detection_method": detection_method,
            # v8 extras
            "grid_rows":           quality.get("grid_rows", 0),
            "grid_cols":           quality.get("grid_cols", 0),
            "grid_expected_count": quality.get("grid_expected_count", total_cells),
            "uncertain_empty_slots": quality.get("uncertain_empty_slots", 0),
        },
        "quality":         display_quality,
        "trust":           trust,
        "recommendations": recs,
        "image":     f"http://127.0.0.1:8000/outputs/{filename}",
        "image_width":     w,
        "image_height":    h,
        "model_version":   "PharmaSight-v8",
        "inference_ms":    int((time.time() - start) * 1000),
    }

    _inspection_cache[image_id] = {
        "image_bgr": img,
        "quality":   quality,   # raw [0,1]
        "trust":     trust,
        "detection": response["detection"],
    }

    _inspection_history.append({
        "image_id":    image_id,
        "timestamp":   timestamp,
        "trust_score": trust["trust_score"],
        "decision":    trust["decision"],
        "defect_count":defect_count,
        "pill_count":  pill_count,
        "fill_rate":   round(fill_rate, 2),
        "inference_ms":response["inference_ms"],
    })
    if len(_inspection_history) > 100:
        _inspection_history.pop(0)

    return response


# ─────────────────────────────────────────────
# SIMULATE
# ─────────────────────────────────────────────
@app.post("/simulate")
async def simulate(body: SimulateRequest):
    if body.image_id not in _inspection_cache:
        raise HTTPException(404, "Image not found — run an inspection first")
    try:
        return simulation_engine.simulate(
            _inspection_cache[body.image_id]["image_bgr"], body.adjustments
        )
    except Exception as e:
        log.error(f"Simulation error: {e}")
        raise HTTPException(500, f"Simulation failed: {e}")


# ─────────────────────────────────────────────
# FEEDBACK
# ─────────────────────────────────────────────
@app.post("/feedback")
async def feedback(body: FeedbackRequest):
    if body.image_id not in _inspection_cache:
        raise HTTPException(404, "Image not found — run an inspection first")
    cached = _inspection_cache[body.image_id]
    try:
        feedback_manager.store_feedback(
            image_id=body.image_id,
            ai_decision=cached["trust"]["decision"],
            human_decision=body.human_decision,
            quality_metrics=cached["quality"],
            trust_score=cached["trust"]["trust_score"],
            notes=body.notes,
        )
        return {"status": "ok", "message": "Feedback stored"}
    except Exception as e:
        log.error(f"Feedback error: {e}")
        raise HTTPException(500, f"Feedback failed: {e}")


# ─────────────────────────────────────────────
# LEARNING SUMMARY
# ─────────────────────────────────────────────
@app.get("/learning-summary")
def learning_summary():
    try:
        return feedback_manager.get_learning_summary()
    except Exception as e:
        log.warning(f"Learning summary fallback: {e}")
        return {
            "total_samples":           0,
            "ai_accuracy":             0.0,
            "most_common_error_cause": "No feedback data yet",
            "error_cause_count":       0,
            "weight_adjustments":      {},
            "trend":                   "flat",
            "recent_accuracy":         0.0,
        }


# ─────────────────────────────────────────────
# HISTORY
# ─────────────────────────────────────────────
@app.get("/history")
def history(limit: int = 20):
    return {"history": _inspection_history[-limit:]}


# ─────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status":               "ok",
        "model":                MODEL_PATH.name,
        "classes":              model.names,
        "class_pill":           CLASS_PILL,
        "class_empty_slot":     CLASS_EMPTY_SLOT,
        "cached_inspections":   len(_inspection_cache),
        "total_inspections":    len(_inspection_history),
    }