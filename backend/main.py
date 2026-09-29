"""
main.py — FastAPI entry point cho AI-LungCare backend.
Chạy: uvicorn main:app --port 8000 --reload

FIX so với version cũ:
  [Fix1] Dùng lifespan context manager thay @on_event("startup") (deprecated FastAPI 0.95+)
  [Fix2] Swagger UI hiển thị đúng thời gian thực:
         - Thêm server_timestamp vào response /api/predict
         - Thêm /api/time endpoint để Swagger test được giờ server
         - inference_time_ms giờ đo chính xác từ khi nhận request đến khi trả response
  [Fix3] Database dùng SQLAlchemy Core thay sqlite3 thuần
  [Fix4] Static file serving cho uploads/ — ảnh load qua URL, không qua base64 relay
         app.mount("/uploads", ...) → frontend dùng /uploads/<uuid>_<type>.jpg trực tiếp
         _build_image_urls() trả dict image_urls kèm theo mọi response có ảnh

XAI: ScoreCAM Variant B (Wang et al. 2020)
DB:  SQLAlchemy Core — lungcare.db (SQLite), ảnh lưu uploads/


Ví dụ response /api/time:
{
    "server_time": "2026-06-24T17:35:36.276950+07:00",   ← giờ Việt Nam
    "unix": 1750783536                                    ← Unix Epoch (giây từ 1/1/1970 UTC)
}
"""

import os
import uuid
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles        # [Fix4] serve ảnh trực tiếp qua URL

import pytz
vn_tz = pytz.timezone("Asia/Ho_Chi_Minh")

from inference import (
    load_all_models,
    models_loaded,
    predict,
    CLASS_NAMES,
    MODEL_DISPLAY_NAMES,
)
from database import (
    init_db,
    save_prediction,
    get_recent_predictions,
    get_prediction_by_id,
    load_image_as_b64,
    delete_prediction,
    get_stats,
    UPLOADS_DIR,                                   # [Fix4] cần để mount static
)

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")

# [Fix4] URL gốc để build image_urls — đổi khi deploy lên server thật
# Ví dụ production: BACKEND_ORIGIN=https://api.ailungcare.com uvicorn main:app
BACKEND_ORIGIN = os.environ.get("BACKEND_ORIGIN", "http://localhost:8000")


# =============================================================================
# LIFESPAN — thay thế @on_event("startup") deprecated
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Chạy khi server khởi động (yield) và tắt (sau yield).
    Dùng lifespan thay @on_event vì FastAPI >= 0.95 deprecated on_event.
    """
    # ── Startup ───────────────────────────────
    print("\n" + "=" * 55)
    print("  AI-LungCare Backend — Starting up")
    print("=" * 55)

    # 1. Khởi tạo DB (tạo bảng nếu chưa có)
    try:
        init_db()
    except Exception as e:
        print(f"[ERROR] DB init failed: {e}")

    # 2. Load models
    print(f"\n[INFO] Model dir: {MODEL_DIR}")
    if not os.path.isdir(MODEL_DIR):
        print(f"[WARN] Thư mục models không tồn tại: {MODEL_DIR}")
    else:
        try:
            load_all_models(MODEL_DIR)
        except Exception as e:
            print(f"[ERROR] Load models failed: {e}")

    print("\n[INFO] Server ready ✅\n")
    yield  # ← Server đang chạy

    # ── Shutdown ──────────────────────────────
    print("\n[INFO] Server shutting down…")


# =============================================================================
# APP
# =============================================================================

app = FastAPI(
    title       = "AI-LungCare API",
    description = """
## Backend phân đoạn và phân loại X-quang phổi

### Pipeline
1. **U-Net** — Phân đoạn vùng phổi (256×256)
2. **PneuNet** — Phân loại bệnh (COVID-19 / Normal / Pneumonia)
3. **ScoreCAM** — Heatmap giải thích kết quả (XAI)

### Ảnh (Fix4)
- Ảnh được lưu dưới dạng file JPEG trong `uploads/`
- Truy cập trực tiếp qua `/uploads/<uuid>_<type>.jpg` — không cần base64 relay
- Mọi response có ảnh đều kèm `image_urls` dict với 4 URL sẵn dùng
- Endpoint `/api/image/{id}/{type}` vẫn giữ để tương thích ngược

### Models
- `pneunet_3class`: COVID-19 · Normal · Pneumonia
- `pneunet_4class`: Bacterial Pneumonia · COVID-19 · Normal · Viral Pneumonia

### Lưu ý thời gian
- `server_timestamp`: Thời điểm server xử lý xong (ISO 8601, UTC+7)
- `inference_time_ms`: Thời gian chạy model thực tế (ms)
- Dùng `/api/time` để kiểm tra giờ server hiện tại
    """,
    version     = "2.2.0",
    lifespan    = lifespan,   # ← Fix1: dùng lifespan thay on_event
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# [Fix4] Mount thư mục uploads — ảnh serve trực tiếp qua /uploads/<filename>
# Phải đặt SAU app.add_middleware và TRƯỚC các @app.get/@app.post route
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# =============================================================================
# HELPER — Fix4
# =============================================================================

def _build_image_urls(record_id: str) -> dict:
    """
    [Fix4] Build dict image_urls từ record_id.
    Frontend dùng URL này để load ảnh trực tiếp qua <img src=...>,
    không cần gọi /api/image/ hay parse base64.

    Returns:
        {
            "original":  "http://localhost:8000/uploads/<id>_original.jpg",
            "segmented": "http://localhost:8000/uploads/<id>_segmented.jpg",
            "overlay":   "http://localhost:8000/uploads/<id>_overlay.jpg",
            "scorecam":  "http://localhost:8000/uploads/<id>_scorecam.jpg",
        }
    """
    base = f"{BACKEND_ORIGIN}/uploads/{record_id}"
    return {
        "original":  f"{base}_original.jpg",
        "segmented": f"{base}_segmented.jpg",
        "overlay":   f"{base}_overlay.jpg",
        "scorecam":  f"{base}_scorecam.jpg",
    }


# =============================================================================
# SYSTEM ENDPOINTS
# =============================================================================

@app.get(
    "/api/health",
    tags    = ["System"],
    summary = "Kiểm tra trạng thái server",
)
def health_check():
    """
    Trả về:
    - `status`: "ok" nếu server hoạt động
    - `models_loaded`: True nếu 3 models đã load xong
    - `server_time`: Giờ server hiện tại (ISO 8601, UTC+7)
    - `db_stats`: Thống kê nhanh từ database
    """
    try:
        stats = get_stats()
    except Exception:
        stats = {}

    return {
        "status":        "ok",
        "models_loaded": models_loaded(),
        "server_time":   datetime.now(vn_tz).isoformat(),
        "db_stats":      stats,
    }


@app.get(
    "/api/time",
    tags    = ["System"],
    summary = "Giờ server hiện tại",
)
def server_time():
    """
    **Fix Swagger UI thời gian thực.**

    Dùng endpoint này trong Swagger để verify giờ server đang chạy đúng.
    Tất cả timestamp trong API đều theo giờ này (ISO 8601, UTC+7).

    Ví dụ response:
    ```json
    {
        "server_time": "2026-06-24T17:35:36.276950+07:00",
        "unix": 1750783536
    }
    ```
    """
    now_vn = datetime.now(vn_tz)
    return {
        "server_time": now_vn.isoformat(),
        "unix":        int(now_vn.timestamp()),
    }


@app.get(
    "/api/models",
    tags    = ["System"],
    summary = "Danh sách models phân loại",
)
def get_models():
    """Trả về danh sách models có sẵn cùng tên class."""
    return {
        "models": [
            {
                "id":          "pneunet_3class",
                "name":        MODEL_DISPLAY_NAMES["pneunet_3class"],
                "classes":     CLASS_NAMES["pneunet_3class"],
                "description": "Phân loại 3 nhãn: COVID-19, Normal, Pneumonia",
            },
            {
                "id":          "pneunet_4class",
                "name":        MODEL_DISPLAY_NAMES["pneunet_4class"],
                "classes":     CLASS_NAMES["pneunet_4class"],
                "description": "Phân loại 4 nhãn: Bacterial Pneumonia, COVID-19, Normal, Viral Pneumonia",
            },
        ]
    }


# =============================================================================
# INFERENCE
# =============================================================================

@app.post(
    "/api/predict",
    tags    = ["Inference"],
    summary = "Phân tích ảnh X-ray",
)
async def predict_endpoint(
    file:     UploadFile = File(...,  description="Ảnh X-ray (JPEG hoặc PNG)"),
    model_id: str        = Form(...,  description='"pneunet_3class" hoặc "pneunet_4class"'),
):
    """
    ## Pipeline chính

    1. Upload ảnh X-ray → U-Net phân đoạn vùng phổi
    2. PneuNet phân loại bệnh
    3. ScoreCAM tạo heatmap giải thích (XAI)
    4. Lưu kết quả vào SQLite + file JPEG vào uploads/
    5. Trả kết quả + 4 ảnh base64 + image_urls

    ## Response fields

    | Field | Mô tả |
    |-------|-------|
    | `id` | UUID của record trong DB |
    | `label` | Nhãn chẩn đoán |
    | `confidence` | Độ tin cậy (0.0–1.0) |
    | `probabilities` | Xác suất từng class |
    | `inference_time_ms` | Thời gian chạy model (ms) |
    | `server_timestamp` | Thời điểm server hoàn thành (ISO 8601, UTC+7) |
    | `original_image_b64` | Ảnh gốc đã resize (base64 JPEG) |
    | `segmented_image_b64` | Ảnh sau U-Net segment (base64 JPEG) |
    | `overlay_image_b64` | Ảnh overlay màu lung mask (base64 JPEG) |
    | `scorecam_image_b64` | ScoreCAM heatmap XAI (base64 JPEG) |
    | `segment_info` | Thông tin mask: lung_ratio, threshold, mask_valid |
    | `image_urls` | [Fix4] Dict 4 URL ảnh trực tiếp — dùng thay base64 để reload |

    """
    # ── Validate inputs ───────────────────────────────────────────────
    if model_id not in ("pneunet_3class", "pneunet_4class"):
        raise HTTPException(
            status_code = 400,
            detail      = f'model_id không hợp lệ: "{model_id}". Dùng: pneunet_3class | pneunet_4class',
        )

    if file.content_type not in ("image/jpeg", "image/png", "image/jpg"):
        raise HTTPException(
            status_code = 400,
            detail      = f"Chỉ chấp nhận JPEG hoặc PNG. Nhận được: {file.content_type}",
        )

    if not models_loaded():
        raise HTTPException(
            status_code = 503,
            detail      = "Models chưa sẵn sàng. Vui lòng thử lại sau vài giây.",
        )

    # ── Fix2: Đo thời gian từ khi nhận request ───────────────────────
    request_start = time.perf_counter()
    img_bytes     = await file.read()
    read_time_ms  = int((time.perf_counter() - request_start) * 1000)

    # ── Chạy inference ────────────────────────────────────────────────
    try:
        result = predict(img_bytes, model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi inference: {str(e)}")

    # Tổng thời gian = đọc file + inference
    total_ms = read_time_ms + result["inference_time_ms"]

    # Timestamp chính xác khi server hoàn thành xử lý
    server_timestamp = datetime.now(vn_tz).isoformat()

    # ── Lưu vào DB ───────────────────────────────────────────────────
    record_id  = str(uuid.uuid4())
    image_urls = _build_image_urls(record_id)   # [Fix4] build trước khi save

    record = {
        "id":                  record_id,
        "timestamp":           server_timestamp,
        "filename":            file.filename or "unknown.jpg",
        "label":               result["label"],
        "confidence":          result["confidence"],
        "model_id":            model_id,
        "probabilities":       result["probabilities"],
        "segment_info":        result.get("segment_info", {}),
        "inference_time_ms":   result["inference_time_ms"],
        "original_image_b64":  result.get("original_image_b64"),
        "segmented_image_b64": result.get("segmented_image_b64"),
        "overlay_image_b64":   result.get("overlay_image_b64"),
        "scorecam_image_b64":  result.get("scorecam_image_b64"),
    }

    try:
        save_prediction(record)
    except Exception as e:
        print(f"[WARN] Không lưu được DB: {e}")  # Không crash request

    # ── Response ─────────────────────────────────────────────────────
    return {
        **result,
        "id":               record_id,
        "server_timestamp": server_timestamp,   # Fix2: timestamp thực tế
        "total_time_ms":    total_ms,           # bao gồm cả đọc file
        "image_urls":       image_urls,         # Fix4: URL ảnh trực tiếp
    }


# =============================================================================
# HISTORY
# =============================================================================

@app.get(
    "/api/recent",
    tags    = ["History"],
    summary = "Lịch sử phân loại gần nhất",
)
def get_recent(
    limit:    int           = Query(default=20, ge=1, le=100, description="Số records tối đa"),
    model_id: Optional[str] = Query(default=None, description="Lọc theo model ID"),
):
    """
    Trả về lịch sử các lần phân loại gần nhất từ DB.
    **Không** kèm ảnh base64 để response gọn nhẹ.
    Thay vào đó mỗi record có `image_urls` để frontend load ảnh trực tiếp. [Fix4]
    """
    rows  = get_recent_predictions(limit=limit, model_id=model_id)
    clean = [{k: v for k, v in r.items() if not k.endswith("_path")} for r in rows]

    # [Fix4] Thêm image_urls vào mỗi record — frontend dùng thay getImage() API call
    for r in clean:
        r["image_urls"] = _build_image_urls(r["id"])

    return {
        "history":          clean,
        "total":            len(clean),
        "server_timestamp": datetime.now(vn_tz).isoformat(),
    }


@app.get(
    "/api/history/{record_id}",
    tags    = ["History"],
    summary = "Chi tiết 1 record",
)
def get_history_item(record_id: str):
    """Lấy metadata của 1 record theo ID (không có ảnh base64, có image_urls)."""
    record = get_prediction_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record không tìm thấy.")
    result = {k: v for k, v in record.items() if not k.endswith("_path")}
    result["image_urls"] = _build_image_urls(record_id)   # [Fix4]
    return result


@app.delete(
    "/api/history/{record_id}",
    tags    = ["History"],
    summary = "Xóa 1 record",
)
def delete_history_item(record_id: str):
    """Xóa 1 record và các file ảnh liên quan khỏi DB và uploads/."""
    ok = delete_prediction(record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Record không tìm thấy.")
    return {
        "deleted":          record_id,
        "server_timestamp": datetime.now(vn_tz).isoformat(),
    }


# =============================================================================
# IMAGE SERVING — giữ nguyên để backward compat với code cũ
# =============================================================================

IMAGE_TYPE_MAP = {
    "original":  "original_image_path",
    "segmented": "segmented_image_path",
    "overlay":   "overlay_image_path",
    "scorecam":  "scorecam_image_path",
}


@app.get(
    "/api/image/{record_id}/{image_type}",
    tags    = ["Images"],
    summary = "Lấy ảnh base64 của 1 record",
)
def get_image(record_id: str, image_type: str):
    """
    Trả về base64 của 1 loại ảnh cho record cụ thể.
    **Lưu ý Fix4**: Nên dùng `image_urls` từ /api/recent thay vì endpoint này
    để tránh base64 relay — chỉ giữ endpoint này cho tương thích ngược.

    **image_type**: `original` | `segmented` | `overlay` | `scorecam`
    """
    if image_type not in IMAGE_TYPE_MAP:
        raise HTTPException(
            status_code = 400,
            detail      = f"image_type không hợp lệ. Dùng: {list(IMAGE_TYPE_MAP.keys())}",
        )
    record = get_prediction_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record không tìm thấy.")

    path_key = IMAGE_TYPE_MAP[image_type]
    rel_path = record.get(path_key)
    b64_data = load_image_as_b64(rel_path)

    if not b64_data:
        raise HTTPException(status_code=404, detail=f"Ảnh '{image_type}' không có.")

    return {
        "record_id":        record_id,
        "type":             image_type,
        "image_b64":        b64_data,
        "server_timestamp": datetime.now(vn_tz).isoformat(),
    }


# =============================================================================
# DEBUG VIEW — giữ nguyên hoàn toàn
# =============================================================================

@app.get(
    "/api/view/{record_id}",
    response_class = HTMLResponse,
    tags           = ["Debug"],
    summary        = "Xem kết quả trực tiếp trên trình duyệt",
)
def view_result(record_id: str):
    """
    **Debug tool** — Mở trên trình duyệt để xem đầy đủ kết quả inference.

    Ảnh được load từ file `uploads/` qua `load_image_as_b64`.
    Thời gian hiển thị là giờ server thực tế lúc render trang.
    """
    record = get_prediction_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record không tìm thấy.")

    orig_b64 = load_image_as_b64(record.get("original_image_path"))
    seg_b64  = load_image_as_b64(record.get("segmented_image_path"))
    over_b64 = load_image_as_b64(record.get("overlay_image_path"))
    sc_b64   = load_image_as_b64(record.get("scorecam_image_path"))

    # Thời gian render thực tế — Fix2
    render_time = datetime.now(vn_tz).strftime("%Y-%m-%d %H:%M:%S +07:00")

    def img_tag(b64: Optional[str], label: str) -> str:
        if not b64:
            return (f'<div class="card"><p class="label">{label}</p>'
                    f'<p class="na">Không có ảnh</p></div>')
        return (f'<div class="card">'
                f'<p class="label">{label}</p>'
                f'<img src="data:image/jpeg;base64,{b64}" />'
                f'</div>')

    probs = record.get("probabilities", {})
    probs_rows = "".join(
        f'<tr><td>{cls}</td><td>{prob:.1%}</td>'
        f'<td><div class="bar" style="width:{prob*100:.1f}%"></div></td></tr>'
        for cls, prob in sorted(probs.items(), key=lambda x: -x[1])
    )

    seg_info_str = (
        f'Lung ratio: <b>{record.get("lung_ratio_pct", "?")}%</b> &nbsp;|&nbsp; '
        f'Threshold: <b>{record.get("threshold", "?")}</b> &nbsp;|&nbsp; '
        f'Mask valid: <b>{"[v]" if record.get("mask_valid") else "[x]"}</b>'
    )

    # Timestamp lưu trong DB vs lúc render trang
    saved_ts  = record.get("timestamp", "?")
    record_ts = record.get("created_at", saved_ts)

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI-LungCare — {record['filename']}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e0e0e0; padding: 24px; }}
  h1 {{ font-size: 1.4rem; color: #7eb8f7; margin-bottom: 6px; }}
  .meta {{ font-size: 0.85rem; color: #888; margin-bottom: 8px; }}
  .time-row {{ font-size: 0.82rem; color: #666; margin-bottom: 18px; }}
  .time-row span {{ color: #4a9; font-family: monospace; }}
  .result-banner {{
    display: inline-block; padding: 10px 22px; border-radius: 8px;
    font-size: 1.5rem; font-weight: 700; margin-bottom: 18px;
    background: #1e2a3a; border-left: 5px solid #7eb8f7;
  }}
  .conf {{ font-size: 0.95rem; color: #aaa; margin-left: 12px; }}
  .seg-info {{ font-size: 0.82rem; color: #888; margin-bottom: 20px; }}
  .images {{ display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }}
  .card {{ background: #1a1d27; border-radius: 10px; padding: 12px; min-width: 220px; flex: 1; }}
  .card img {{ width: 100%; border-radius: 6px; display: block; }}
  .label {{ font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px;
            color: #7eb8f7; margin-bottom: 8px; font-weight: 600; }}
  .na {{ color: #555; font-size: 0.85rem; padding: 40px 0; text-align: center; }}
  h2 {{ font-size: 1rem; color: #7eb8f7; margin-bottom: 10px; }}
  table {{ width: 100%; max-width: 500px; border-collapse: collapse; }}
  td {{ padding: 6px 10px; font-size: 0.88rem; }}
  tr:nth-child(even) td {{ background: #1a1d27; }}
  .bar {{ height: 10px; background: #4a90d9; border-radius: 4px; min-width: 2px; }}
  .timing {{ font-size: 0.8rem; color: #666; margin-top: 16px; }}
  .xai-note {{ font-size: 0.78rem; color: #556; margin-top: 4px; }}
  .db-badge {{ display: inline-block; background: #1a2a1a; color: #6dbf6d;
               border: 1px solid #2d4d2d; border-radius: 4px;
               padding: 2px 8px; font-size: 0.72rem; margin-left: 8px; }}
</style>
</head>
<body>
  <h1>AI-LungCare — Debug View <span class="db-badge">SQLAlchemy + SQLite</span></h1>

  <p class="meta">
    ID: <b>{record['id'][:8]}…</b> &nbsp;|&nbsp;
    File: <b>{record['filename']}</b> &nbsp;|&nbsp;
    Model: <b>{record['model_id']}</b>
  </p>

  <p class="time-row">
    💾 Lưu DB lúc: <span>{record_ts}</span>
    &nbsp;&nbsp;|&nbsp;&nbsp;
    🖥️ Render trang lúc: <span>{render_time}</span>
  </p>

  <div class="result-banner">
    {record['label']}
    <span class="conf">confidence: {record['confidence']:.1%}</span>
  </div>

  <p class="seg-info">{seg_info_str}</p>

  <div class="images">
    {img_tag(orig_b64,  'Ảnh gốc (Original)')}
    {img_tag(seg_b64,   'Sau U-Net Segment')}
    {img_tag(over_b64,  'Overlay màu (Lung mask)')}
    {img_tag(sc_b64,    'ScoreCAM Heatmap (XAI)')}
  </div>
  <p class="xai-note">XAI: ScoreCAM Variant B — Wang et al. 2020 | Top-K=128 | ~8–12s CPU</p>

  <h2>Xác suất từng class</h2>
  <table>
    <tr><th>Class</th><th>Prob</th><th></th></tr>
    {probs_rows}
  </table>

  <p class="timing">⏱ Inference time: {record['inference_time_ms']} ms</p>
</body>
</html>"""
    return HTMLResponse(content=html)