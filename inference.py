"""
inference.py — Load models, chạy pipeline phân đoạn + phân loại + ScoreCAM.
Tất cả models load MỘT LẦN khi server khởi động.

PIPELINE ĐẦY ĐỦ (khớp với training):
  1. Đọc ảnh grayscale → resize (256,256) → normalize [0,1]
  2. U-Net predict → raw_mask (256,256) float
  3. Adaptive threshold (mean + 0.5*std)
  4. Morphological closing (disk r=5) + remove_small_objects (>500px)
  5. Kiểm tra lung ratio [3%, 70%]
  6. Apply mask → segmented_gray (256,256)
  7. Resize (224,224) → normalize [-1,1] → PneuNet predict
  8. ScoreCAM heatmap từ segmented_gray + PneuNet  [đổi từ GradRollout]
  9. Tạo colored overlay từ ảnh gốc + mask

XAI METHOD: ScoreCAM Variant B (Wang et al. 2020)
  - ~4 forward passes/ảnh, ~0.8s CPU
  - Perturbation-based, gradient-free → phù hợp hybrid CNN-Transformer
  - Xem scorecam.py để biết chi tiết thuật toán
"""

import os
import io
import base64
import time

import numpy as np
import cv2
import tensorflow as tf
import keras                          # ← import keras thuần (standalone)
from keras import layers              # ← đổi từ tensorflow.keras
from PIL import Image

from skimage import morphology, measure

from scorecam import generate_scorecam   # ← đổi từ gradcam


# ─────────────────────────────────────────────
# Custom Layer
# ─────────────────────────────────────────────

@keras.saving.register_keras_serializable()
class AddPositionEmbs(keras.layers.Layer):
    def __init__(self, num_tokens: int, embed_dim: int, **kwargs):
        super().__init__(**kwargs)
        self.num_tokens = num_tokens
        self.embed_dim  = embed_dim

    def build(self, input_shape):
        self.pos_emb = layers.Embedding(
            self.num_tokens, self.embed_dim, name="pos_emb_table"
        )
        self.pos_emb.build((self.num_tokens,))
        super().build(input_shape)

    def call(self, x):
        positions = tf.range(start=0, limit=self.num_tokens, delta=1)
        return x + self.pos_emb(positions)

    def get_config(self):
        cfg = super().get_config()
        cfg.update({"num_tokens": self.num_tokens, "embed_dim": self.embed_dim})
        return cfg


CUSTOM_OBJECTS = {"AddPositionEmbs": AddPositionEmbs}


# ─────────────────────────────────────────────
# Class mapping
# ─────────────────────────────────────────────

CLASS_NAMES = {
    "pneunet_3class": ["COVID-19", "Normal", "Pneumonia"],
    "pneunet_4class": ["Bacterial Pneumonia", "COVID-19", "Normal", "Viral Pneumonia"],
}

MODEL_DISPLAY_NAMES = {
    "pneunet_3class": "Simplified PneuNet (3 Class)",
    "pneunet_4class": "Simplified PneuNet (4 Class)",
}

MASK_COLORS_RGB = {
    "Normal":              (160, 220, 185),
    "COVID-19":            (150, 205, 240),
    "Pneumonia":           (210, 170, 240),
    "Bacterial Pneumonia": (240, 205, 140),
    "Viral Pneumonia":     (235, 170, 165),
}

# ─────────────────────────────────────────────
# Postprocessing params — khớp unet_pipeline.py
# ─────────────────────────────────────────────

THRESHOLD_K          = 0.5
MIN_LUNG_RATIO       = 0.03
MAX_LUNG_RATIO       = 0.70
MIN_COMPONENT_PIXELS = 500
CLOSING_RADIUS       = 5

UNET_SIZE = (256, 256)
CLF_SIZE  = (224, 224)
DISP_SIZE = (512, 512)

# Ngưỡng phát hiện overconfidence
OVERCONFIDENCE_THRESHOLD = 0.90
LOW_ENTROPY_THRESHOLD    = 0.25


# ─────────────────────────────────────────────
# Global model store
# ─────────────────────────────────────────────

MODELS: dict = {}


def load_all_models(model_dir: str) -> None:
    global MODELS
    files = {
        "unet":           "best_unet.keras",
        "pneunet_3class": "simplified_pneunet_pneunet_3class.keras",
        "pneunet_4class": "simplified_pneunet_pneunet_4class.keras",
    }
    for key, filename in files.items():
        path = os.path.join(model_dir, filename)
        print(f"  Loading {filename} …", end=" ", flush=True)
        MODELS[key] = tf.keras.models.load_model(
            path, custom_objects=CUSTOM_OBJECTS, compile=False)
        print(f"✅  input={MODELS[key].input_shape}  output={MODELS[key].output_shape}")
    print("✅ Tất cả models đã sẵn sàng!\n")


def models_loaded() -> bool:
    return len(MODELS) == 3


# ─────────────────────────────────────────────
# U-Net Postprocessing
# ─────────────────────────────────────────────

def _adaptive_threshold(pred_map: np.ndarray) -> float:
    return float(np.clip(pred_map.mean() + THRESHOLD_K * pred_map.std(), 0.15, 0.85))


def _postprocess_mask(binary_mask: np.ndarray) -> np.ndarray:
    selem   = morphology.disk(CLOSING_RADIUS)
    closed  = morphology.binary_closing(binary_mask.astype(bool), selem)
    labeled = measure.label(closed)
    cleaned = morphology.remove_small_objects(labeled > 0, min_size=MIN_COMPONENT_PIXELS)
    return cleaned.astype(np.uint8)


def _check_mask_validity(mask: np.ndarray):
    ratio = mask.sum() / mask.size
    if ratio < MIN_LUNG_RATIO:
        return False, ratio, f"quá nhỏ ({ratio*100:.1f}%)"
    if ratio > MAX_LUNG_RATIO:
        return False, ratio, f"quá lớn ({ratio*100:.1f}%)"
    return True, ratio, "OK"


def _remove_dicom_overlays(gray: np.ndarray) -> np.ndarray:
    """
    Loại bỏ DICOM overlay text/annotation bị bake-in vào ảnh
    (ví dụ: "BP: 0.0", "LT", "W: 2830", "Zoom 0.3" từ DICOM viewer).

    Dùng morphological top-hat để phát hiện vùng sáng bất thường
    cục bộ (thường là text trên nền tối của X-quang) rồi inpaint.
    """
    # Top-hat: tìm vùng nhỏ sáng hơn nền cục bộ (= text/annotation)
    kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    tophat  = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel)

    # Ngưỡng: pixel tophat > 40 → nhiều khả năng là text sáng
    text_mask = (tophat > 40).astype(np.uint8)
    n_text_px = int(text_mask.sum())

    # Chỉ inpaint nếu phát hiện đủ pixel text (tránh sửa ảnh sạch)
    if 10 < n_text_px < gray.size * 0.05:   # 0.05%–5% tổng pixel
        print(f"[INFO] DICOM overlay detected: {n_text_px} px → inpainting")
        gray = cv2.inpaint(gray, text_mask, inpaintRadius=5,
                           flags=cv2.INPAINT_TELEA)
    else:
        print(f"[INFO] No significant DICOM overlay detected ({n_text_px} px)")
    return gray


def _segment_with_unet(img_bytes: bytes):
    img         = Image.open(io.BytesIO(img_bytes)).convert("L")
    orig_gray   = np.array(img.resize(UNET_SIZE, Image.LANCZOS), dtype=np.uint8)

    # ── FIX: Loại bỏ DICOM overlay text trước khi đưa vào U-Net ──
    orig_gray   = _remove_dicom_overlays(orig_gray)

    unet_in     = orig_gray.astype(np.float32) / 255.0
    unet_in     = unet_in[np.newaxis, ..., np.newaxis]
    raw_mask    = MODELS["unet"].predict(unet_in, verbose=0)[0, ..., 0]
    thresh      = _adaptive_threshold(raw_mask)
    clean_mask  = _postprocess_mask((raw_mask > thresh).astype(np.uint8))
    is_valid, ratio, reason = _check_mask_validity(clean_mask)
    segmented_gray = (orig_gray * clean_mask).astype(np.uint8)
    return segmented_gray, clean_mask, is_valid, ratio, reason, thresh


# ─────────────────────────────────────────────
# PneuNet preprocessing
# ─────────────────────────────────────────────

def _preprocess_pneunet_from_array(gray_array: np.ndarray) -> np.ndarray:
    """
    Preprocessing khớp hoàn toàn với training pipeline:
      - cv2.resize INTER_LINEAR (training dùng cv2, không phải PIL LANCZOS)
      - CLAHE normalization: chuẩn hóa contrast cục bộ, giảm domain shift
        do window/level khác nhau giữa các nguồn ảnh (Kaggle vs Radiopaedia)
      - Normalize [-1, 1] giống hệt training
    """
    # ── FIX 1: Dùng cv2 thay PIL để nhất quán với training generator ──
    arr = cv2.resize(gray_array, CLF_SIZE, interpolation=cv2.INTER_LINEAR).astype(np.uint8)

    # ── FIX 2: CLAHE — chuẩn hóa contrast, giảm ảnh hưởng window/level ──
    # Ảnh từ Radiopaedia có W=2830, C=1110 (khác hẳn training dataset)
    # CLAHE giúp model "nhìn" nhất quán bất kể nguồn ảnh
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    arr   = clahe.apply(arr)

    arr_f = arr.astype(np.float32)
    arr_f = (arr_f / 127.5) - 1.0
    return arr_f[np.newaxis, ..., np.newaxis]


def _validate_image(img_bytes: bytes) -> None:
    try:
        img  = Image.open(io.BytesIO(img_bytes))
        w, h = img.size
    except Exception:
        raise ValueError("File không phải ảnh hợp lệ.")
    if w < 50 or h < 50:
        raise ValueError(f"Ảnh quá nhỏ ({w}×{h}). Cần tối thiểu 50×50 pixel.")


# ─────────────────────────────────────────────
# Overlay helpers
# ─────────────────────────────────────────────

def _apply_colored_mask(original_rgb, binary_mask, class_name, alpha=0.55):
    color   = MASK_COLORS_RGB.get(class_name, (200, 200, 200))
    colored = np.zeros_like(original_rgb)
    colored[binary_mask > 0] = color
    return cv2.addWeighted(original_rgb, 1 - alpha, colored, alpha, 0)


def _to_b64(img_array: np.ndarray) -> str:
    pil_img = Image.fromarray(img_array.astype(np.uint8))
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode()


# ─────────────────────────────────────────────
# Predict chính
# ─────────────────────────────────────────────

def predict(img_bytes: bytes,
            model_id: str,
            run_scorecam: bool = True) -> dict:
    """
    Pipeline đầy đủ: U-Net segment → PneuNet classify → ScoreCAM XAI.

    Args:
        img_bytes:    Raw image bytes (JPEG/PNG)
        model_id:     "pneunet_3class" hoặc "pneunet_4class"
        run_scorecam: ScoreCAM heatmap (~0.8s, bật mặc định)
    """
    if not models_loaded():
        raise RuntimeError("Models chưa được load.")

    _validate_image(img_bytes)
    t0 = time.time()

    # ── Bước 1: U-Net Segment ────────────────────────────────────────────
    segmented_gray, mask_256, is_valid, ratio, reason, thresh = _segment_with_unet(img_bytes)

    if not is_valid:
        print(f"[WARN] Mask không hợp lệ: {reason}. Dùng ảnh gốc.")
        fallback = Image.open(io.BytesIO(img_bytes)).convert("L").resize(UNET_SIZE)
        segmented_gray = np.array(fallback, dtype=np.uint8)
        mask_256       = np.ones(UNET_SIZE, dtype=np.uint8)
    else:
        print(f"[INFO] U-Net OK: lung={ratio*100:.1f}%, thresh={thresh:.3f}")

    # ── Bước 2: PneuNet classify ─────────────────────────────────────────
    clf_in     = _preprocess_pneunet_from_array(segmented_gray)
    probs      = MODELS[model_id].predict(clf_in, verbose=0)[0]
    names      = CLASS_NAMES[model_id]
    pred_idx   = int(np.argmax(probs))
    label      = names[pred_idx]
    confidence = float(probs[pred_idx])

    # ── FIX 3: Phát hiện overconfidence / out-of-distribution ────────────
    # Entropy thấp + confidence cao = model cực kỳ chắc chắn
    # Trên ảnh out-of-distribution, đây là dấu hiệu KHÔNG đáng tin
    entropy = float(-np.sum(probs * np.log(probs + 1e-10)))
    max_entropy = float(np.log(len(names)))   # entropy tối đa = log(num_classes)
    is_overconfident = (confidence > OVERCONFIDENCE_THRESHOLD
                        and entropy < LOW_ENTROPY_THRESHOLD * max_entropy)
    if is_overconfident:
        print(f"[WARN] Overconfident: {label}={confidence:.1%}, "
              f"entropy={entropy:.3f}/{max_entropy:.3f} "
              f"— có thể out-of-distribution")
    else:
        print(f"[INFO] Classify: {label}={confidence:.1%}, entropy={entropy:.3f}")

    # ── Bước 3: ScoreCAM heatmap ─────────────────────────────────────────
    scorecam_b64 = None
    if run_scorecam:
        try:
            t_sc = time.time()
            sc_img = generate_scorecam(
                model          = MODELS[model_id],
                img_array      = segmented_gray,
                pred_class_idx = pred_idx,
                display_size   = DISP_SIZE,
            )
            scorecam_b64 = _to_b64(sc_img)
            print(f"[INFO] ScoreCAM: {int((time.time() - t_sc) * 1000)}ms")
        except Exception as e:
            print(f"[WARN] ScoreCAM failed: {e}")

    # ── Bước 4: Tạo ảnh hiển thị ─────────────────────────────────────────
    orig_pil     = Image.open(io.BytesIO(img_bytes)).convert("RGB").resize(DISP_SIZE)
    original_rgb = np.array(orig_pil)

    mask_pil     = Image.fromarray((mask_256 * 255).astype(np.uint8)).resize(DISP_SIZE)
    mask_display = (np.array(mask_pil) > 127).astype(np.uint8)
    overlay      = _apply_colored_mask(original_rgb, mask_display, label)

    seg_disp_pil = Image.fromarray(segmented_gray).resize(DISP_SIZE)
    seg_disp_rgb = np.stack([np.array(seg_disp_pil)] * 3, axis=-1)

    elapsed_ms = int((time.time() - t0) * 1000)

    return {
        "label":                label,
        "confidence":           confidence,
        "probabilities":        dict(zip(names, [round(float(p), 4) for p in probs])),
        "original_image_b64":   _to_b64(original_rgb),
        "segmented_image_b64":  _to_b64(seg_disp_rgb),
        "overlay_image_b64":    _to_b64(overlay),
        "scorecam_image_b64":   scorecam_b64,   # tên chính xác
        "gradcam_image_b64":    scorecam_b64,   # alias giữ cho frontend tương thích
        "model_name":           MODEL_DISPLAY_NAMES[model_id],
        "inference_time_ms":    elapsed_ms,
        "segment_info": {
            "lung_ratio_pct": round(ratio * 100, 2),
            "threshold":      round(thresh, 4),
            "mask_valid":     is_valid,
            "mask_reason":    reason,
        },
        # ── Thông tin uncertainty — giúp frontend cảnh báo người dùng ──
        "uncertainty_info": {
            "entropy":           round(entropy, 4),
            "max_entropy":       round(max_entropy, 4),
            "is_overconfident":  is_overconfident,
            # Nếu True: model quá chắc trên ảnh có thể khác distribution training
            # Frontend nên hiển thị cảnh báo cho bác sĩ
        },
    }