"""
database.py — SQLAlchemy Core cho AI-LungCare backend.

Thiết kế:
  - Dùng SQLAlchemy CORE (không phải ORM) — query SQL thuần, kiểm soát hoàn toàn
  - Migrate PostgreSQL sau này: chỉ đổi DATABASE_URL, không sửa query nào
  - Ảnh base64 lưu ra file riêng trong uploads/ → DB chỉ lưu path → file .db nhỏ gọn
  - Connection pool tự động (SQLAlchemy lo)
  - Idempotent init — gọi nhiều lần vẫn an toàn

Tại sao SQLAlchemy Core thay vì sqlite3 thuần?
  ┌─────────────────┬──────────────┬────────────────────┬──────────────────┐
  │                 │ sqlite3 raw  │ SQLAlchemy Core    │ SQLAlchemy ORM   │
  ├─────────────────┼──────────────┼────────────────────┼──────────────────┤
  │ Migrate DB      │ ❌ Rewrite   │ ✅ Đổi URL là xong │ ✅               │
  │ SQL rõ ràng     │ ✅           │ ✅                  │ ❌ Ẩn sau ORM   │
  │ Connection pool │ ❌ Tự làm   │ ✅ Tự động          │ ✅               │
  │ Type safety     │ ❌           │ ✅ Column types     │ ✅               │
  │ Complexity      │ 🟢 Thấp     │ 🟡 Vừa             │ 🔴 Cao          │
  └─────────────────┴──────────────┴────────────────────┴──────────────────┘

Migrate PostgreSQL sau này:
  Đổi dòng này: DATABASE_URL = "sqlite:///./lungcare.db"
  Thành:        DATABASE_URL = "postgresql+psycopg2://user:pass@localhost/lungcare"
  Cài thêm:     pip install psycopg2-binary
  Xong. Không sửa gì khác.

Cấu trúc thư mục:
    backend/
    ├── database.py
    ├── lungcare.db          ← SQLite file (SQLAlchemy tạo)
    └── uploads/             ← ảnh JPEG lưu ra đây
        ├── <uuid>_original.jpg
        ├── <uuid>_segmented.jpg
        ├── <uuid>_overlay.jpg
        └── <uuid>_scorecam.jpg

Import:
    from database import init_db, save_prediction, get_recent_predictions,
                         get_prediction_by_id, load_image_as_b64,
                         delete_prediction, get_stats
"""

import os
import json
import base64
from datetime import datetime
from typing import Optional

# ── SQLAlchemy Core imports ───────────────────────────────────────────────────
from sqlalchemy import (
    create_engine, text, MetaData, Table, Column,
    String, Float, Integer, Text, Boolean,
    Index, insert, select, delete, func, desc,
)
from sqlalchemy.engine import Engine


# =============================================================================
# CONFIG — đổi DATABASE_URL để migrate sang PostgreSQL
# =============================================================================

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR  = os.path.join(BASE_DIR, "uploads")

# SQLite (development / khóa luận):
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'lungcare.db')}"
DB_PATH      = os.path.join(BASE_DIR, 'lungcare.db')  #1 biến string thêm vào, không ảnh hưởng gì đến SQLAlchemy hay FastAPI

# PostgreSQL (production — uncomment khi cần):
# DATABASE_URL = "postgresql+psycopg2://lungcare_user:password@localhost:5432/lungcare_db"

# MySQL (nếu hội đồng yêu cầu — uncomment khi cần):
# DATABASE_URL = "mysql+pymysql://user:password@localhost:3306/lungcare_db"


# =============================================================================
# ENGINE & SCHEMA
# =============================================================================

# connect_args chỉ cần cho SQLite (PostgreSQL không cần)
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine: Engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    # pool_size=5, max_overflow=10,  # uncomment cho PostgreSQL
    echo=False,   # True → in SQL ra console (debug mode)
)

metadata = MetaData()

# ── Schema definition — khớp hoàn toàn với thiết kế trong analysis_results.md ──
prediction_history = Table(
    "prediction_history",
    metadata,
    Column("id",                   String(36),  primary_key=True),   # UUID
    Column("timestamp",            String(30),  nullable=False),      # ISO 8601
    Column("filename",             String(255), nullable=False),
    Column("model_id",             String(50),  nullable=False),
    Column("label",                String(100), nullable=False),
    Column("confidence",           Float,       nullable=False),
    Column("probabilities",        Text,        nullable=False),      # JSON string
    Column("inference_time_ms",    Integer,     nullable=False),
    Column("lung_ratio_pct",       Float,       nullable=True),
    Column("mask_valid",           Boolean,     nullable=True),
    Column("mask_reason",          String(200), nullable=True),
    Column("threshold",            Float,       nullable=True),
    Column("original_image_path",  String(300), nullable=True),      # uploads/<uuid>_original.jpg
    Column("segmented_image_path", String(300), nullable=True),
    Column("overlay_image_path",   String(300), nullable=True),
    Column("scorecam_image_path",  String(300), nullable=True),
    Column("created_at",           String(30),  nullable=True),
)

# Indexes cho query nhanh
Index("idx_ph_timestamp", prediction_history.c.timestamp.desc())
Index("idx_ph_model_id",  prediction_history.c.model_id)
Index("idx_ph_label",     prediction_history.c.label)


# =============================================================================
# INIT
# =============================================================================

def init_db() -> None:
    """
    Tạo bảng và index nếu chưa tồn tại. Idempotent.
    Gọi 1 lần trong lifespan() của FastAPI.
    """
    os.makedirs(UPLOADS_DIR, exist_ok=True)

    # SQLite WAL mode — write nhanh hơn, tránh lock
    # PostgreSQL không cần (nó có MVCC riêng)
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL"))
            conn.execute(text("PRAGMA synchronous=NORMAL"))
            conn.commit()

    metadata.create_all(engine)   # CREATE TABLE IF NOT EXISTS — idempotent

    print(f"[DB] Engine       → {DATABASE_URL}")
    print(f"[DB] Uploads dir  → {UPLOADS_DIR}")
    print(f"[DB] Tables ready → {list(metadata.tables.keys())}")


# =============================================================================
# PRIVATE — image file helpers
# =============================================================================

def _save_image_file(record_id: str, tag: str, b64_data: Optional[str]) -> Optional[str]:
    """
    Decode base64 → lưu JPEG ra uploads/<record_id>_<tag>.jpg
    Returns relative path "uploads/..." hoặc None nếu b64_data rỗng.
    """
    if not b64_data:
        return None
    try:
        filename  = f"{record_id}_{tag}.jpg"
        full_path = os.path.join(UPLOADS_DIR, filename)
        with open(full_path, "wb") as f:
            f.write(base64.b64decode(b64_data))
        return f"uploads/{filename}"
    except Exception as e:
        print(f"[DB] Lỗi lưu ảnh '{tag}': {e}")
        return None


def load_image_as_b64(relative_path: Optional[str]) -> Optional[str]:
    """
    Đọc file JPEG từ disk → base64 string.
    Dùng cho /api/image/<id>/<type> và /api/view/<id>.
    """
    if not relative_path:
        return None
    full_path = os.path.join(BASE_DIR, relative_path)
    if not os.path.exists(full_path):
        return None
    try:
        with open(full_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception as e:
        print(f"[DB] Lỗi đọc ảnh '{relative_path}': {e}")
        return None


# =============================================================================
# CRUD — SQLAlchemy Core
# =============================================================================

def save_prediction(record: dict) -> str:
    """
    Lưu 1 kết quả inference vào DB.
    Ảnh base64 được tách ra lưu thành file JPEG riêng.

    Args:
        record: dict gồm id, timestamp, filename, model_id, label,
                confidence, probabilities, inference_time_ms,
                segment_info (nested dict),
                original_image_b64, segmented_image_b64,
                overlay_image_b64, scorecam_image_b64

    Returns:
        record_id (UUID string đã lưu)
    """
    record_id = record["id"]
    seg       = record.get("segment_info") or {}

    # Lưu 4 ảnh ra file trước
    orig_path = _save_image_file(record_id, "original",  record.get("original_image_b64"))
    seg_path  = _save_image_file(record_id, "segmented", record.get("segmented_image_b64"))
    over_path = _save_image_file(record_id, "overlay",   record.get("overlay_image_b64"))
    sc_path   = _save_image_file(record_id, "scorecam",  record.get("scorecam_image_b64"))

    row = {
        "id":                   record_id,
        "timestamp":            record.get("timestamp", datetime.now().isoformat()),
        "filename":             record.get("filename", "unknown.jpg"),
        "model_id":             record.get("model_id", ""),
        "label":                record.get("label", ""),
        "confidence":           record.get("confidence", 0.0),
        "probabilities":        json.dumps(record.get("probabilities", {}), ensure_ascii=False),
        "inference_time_ms":    record.get("inference_time_ms", 0),
        "lung_ratio_pct":       seg.get("lung_ratio_pct"),
        "mask_valid":           bool(seg.get("mask_valid", True)),
        "mask_reason":          seg.get("mask_reason", ""),
        "threshold":            seg.get("threshold"),
        "original_image_path":  orig_path,
        "segmented_image_path": seg_path,
        "overlay_image_path":   over_path,
        "scorecam_image_path":  sc_path,
        "created_at":           datetime.now().isoformat(),
    }

    # INSERT OR REPLACE — SQLAlchemy Core cách viết chuẩn
    # SQLite:     INSERT OR REPLACE
    # PostgreSQL: INSERT ... ON CONFLICT (id) DO UPDATE SET ...
    with engine.begin() as conn:   # begin() → auto commit/rollback
        if DATABASE_URL.startswith("sqlite"):
            stmt = text("""
                INSERT OR REPLACE INTO prediction_history
                    (id, timestamp, filename, model_id, label, confidence,
                     probabilities, inference_time_ms, lung_ratio_pct,
                     mask_valid, mask_reason, threshold,
                     original_image_path, segmented_image_path,
                     overlay_image_path,  scorecam_image_path, created_at)
                VALUES
                    (:id, :timestamp, :filename, :model_id, :label, :confidence,
                     :probabilities, :inference_time_ms, :lung_ratio_pct,
                     :mask_valid, :mask_reason, :threshold,
                     :original_image_path, :segmented_image_path,
                     :overlay_image_path,  :scorecam_image_path, :created_at)
            """)
        else:
            # PostgreSQL upsert
            stmt = text("""
                INSERT INTO prediction_history
                    (id, timestamp, filename, model_id, label, confidence,
                     probabilities, inference_time_ms, lung_ratio_pct,
                     mask_valid, mask_reason, threshold,
                     original_image_path, segmented_image_path,
                     overlay_image_path,  scorecam_image_path, created_at)
                VALUES
                    (:id, :timestamp, :filename, :model_id, :label, :confidence,
                     :probabilities, :inference_time_ms, :lung_ratio_pct,
                     :mask_valid, :mask_reason, :threshold,
                     :original_image_path, :segmented_image_path,
                     :overlay_image_path,  :scorecam_image_path, :created_at)
                ON CONFLICT (id) DO UPDATE SET
                    label           = EXCLUDED.label,
                    confidence      = EXCLUDED.confidence,
                    probabilities   = EXCLUDED.probabilities,
                    lung_ratio_pct  = EXCLUDED.lung_ratio_pct,
                    mask_valid      = EXCLUDED.mask_valid,
                    original_image_path  = EXCLUDED.original_image_path,
                    segmented_image_path = EXCLUDED.segmented_image_path,
                    overlay_image_path   = EXCLUDED.overlay_image_path,
                    scorecam_image_path  = EXCLUDED.scorecam_image_path
            """)
        conn.execute(stmt, row)

    print(f"[DB] Saved {record_id[:8]}…  label={record.get('label')}  "
          f"model={record.get('model_id')}")
    return record_id


def get_recent_predictions(limit: int = 20, model_id: Optional[str] = None) -> list[dict]:
    """
    Lấy danh sách lịch sử gần nhất — chỉ metadata, KHÔNG kèm *_path và base64.
    """
    # Chọn tường minh — không lấy 4 cột *_image_path (server-internal)
    cols = [
        prediction_history.c.id,
        prediction_history.c.timestamp,
        prediction_history.c.filename,
        prediction_history.c.model_id,
        prediction_history.c.label,
        prediction_history.c.confidence,
        prediction_history.c.probabilities,
        prediction_history.c.inference_time_ms,
        prediction_history.c.lung_ratio_pct,
        prediction_history.c.mask_valid,
        prediction_history.c.mask_reason,
        prediction_history.c.threshold,
        prediction_history.c.created_at,
    ]

    stmt = select(*cols).order_by(desc(prediction_history.c.timestamp)).limit(limit)
    if model_id:
        stmt = stmt.where(prediction_history.c.model_id == model_id)

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()

    result = []
    for row in rows:
        d = dict(row)
        d["probabilities"] = json.loads(d["probabilities"])
        d["mask_valid"]    = bool(d["mask_valid"])
        result.append(d)
    return result


def get_prediction_by_id(record_id: str) -> Optional[dict]:
    """Lấy 1 record đầy đủ theo ID (kể cả image paths)."""
    stmt = select(prediction_history).where(prediction_history.c.id == record_id)

    with engine.connect() as conn:
        row = conn.execute(stmt).mappings().first()

    if row is None:
        return None
    d = dict(row)
    d["probabilities"] = json.loads(d["probabilities"])
    d["mask_valid"]    = bool(d["mask_valid"])
    return d


def delete_prediction(record_id: str) -> bool:
    """
    Xóa 1 record khỏi DB và xóa các file ảnh liên quan.
    Returns True nếu tìm thấy và xóa thành công.
    """
    record = get_prediction_by_id(record_id)
    if not record:
        return False

    # Xóa file ảnh trước
    for key in ("original_image_path", "segmented_image_path",
                "overlay_image_path",  "scorecam_image_path"):
        rel_path = record.get(key)
        if rel_path:
            full = os.path.join(BASE_DIR, rel_path)
            try:
                if os.path.exists(full):
                    os.remove(full)
            except Exception as e:
                print(f"[DB] Không xóa được file '{rel_path}': {e}")

    # Xóa DB row
    stmt = delete(prediction_history).where(prediction_history.c.id == record_id)
    with engine.begin() as conn:
        conn.execute(stmt)

    return True


def get_stats() -> dict:
    """Thống kê nhanh — dùng trong /api/health và db_viewer.py."""
    with engine.connect() as conn:
        total = conn.execute(
            select(func.count()).select_from(prediction_history)
        ).scalar()

        by_label_rows = conn.execute(
            select(prediction_history.c.label, func.count().label("cnt"))
            .group_by(prediction_history.c.label)
            .order_by(desc("cnt"))
        ).all()

        by_model_rows = conn.execute(
            select(prediction_history.c.model_id, func.count().label("cnt"))
            .group_by(prediction_history.c.model_id)
        ).all()

        avg_ms = conn.execute(
            select(func.avg(prediction_history.c.inference_time_ms))
        ).scalar()

    return {
        "total_predictions": total or 0,
        "by_label":          {r[0]: r[1] for r in by_label_rows},
        "by_model":          {r[0]: r[1] for r in by_model_rows},
        "avg_inference_ms":  round(avg_ms, 1) if avg_ms else 0,
    }