"""
db_viewer.py — Xem dữ liệu THẬT trong lungcare.db. Không tạo fake data.

Tách biệt hoàn toàn với test_db.py:
  - test_db.py  → chạy test suite, TẠO fake data, cần cleanup
  - db_viewer.py → CHỈ ĐỌC dữ liệu thật, không ghi gì vào DB

Cách dùng:
  python db_viewer.py                    # Xem bảng lịch sử (20 records gần nhất)
  python db_viewer.py --limit 50         # Xem 50 records
  python db_viewer.py --stats            # Thống kê tổng hợp
  python db_viewer.py --id <uuid>        # Xem chi tiết 1 record
  python db_viewer.py --label COVID-19   # Lọc theo nhãn
  python db_viewer.py --model pneunet_4class  # Lọc theo model

Yêu cầu: sqlalchemy (đã cài khi cài database.py)
         tabulate (optional, pip install tabulate — bảng đẹp hơn)
"""

import sys
import os
import json
import argparse
from datetime import datetime

# ── Import database module ────────────────────────────────────────────────────
try:
    from database import (
        init_db, get_recent_predictions, get_prediction_by_id,
        get_stats, load_image_as_b64, DATABASE_URL, UPLOADS_DIR,
        prediction_history, engine,
    )
    from sqlalchemy import select, desc, func
except ImportError as e:
    print(f"[ERROR] Không import được database.py: {e}")
    print("  Hãy chạy script này trong cùng thư mục với database.py")
    print("  Cài SQLAlchemy: pip install sqlalchemy")
    sys.exit(1)

# ── Try import tabulate ───────────────────────────────────────────────────────
try:
    from tabulate import tabulate
    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False


# =============================================================================
# HELPERS
# =============================================================================

def _sep(title: str = "", char: str = "─", width: int = 72) -> None:
    print("\n" + char * width)
    if title:
        print(f"  {title}")
        print(char * width)


def _fmt_conf(v: float) -> str:
    """Format confidence với màu terminal (nếu hỗ trợ)."""
    pct = v * 100
    if pct >= 90:
        return f"\033[92m{pct:5.1f}%\033[0m"   # xanh lá
    elif pct >= 70:
        return f"\033[93m{pct:5.1f}%\033[0m"   # vàng
    else:
        return f"\033[91m{pct:5.1f}%\033[0m"   # đỏ


def _fmt_label(label: str) -> str:
    """Màu theo nhãn chẩn đoán."""
    colors = {
        "COVID-19":            "\033[91m",   # đỏ
        "Normal":              "\033[92m",   # xanh
        "Pneumonia":           "\033[93m",   # vàng
        "Bacterial Pneumonia": "\033[95m",   # tím
        "Viral Pneumonia":     "\033[94m",   # xanh dương
    }
    c = colors.get(label, "")
    return f"{c}{label}\033[0m" if c else label


def _uploads_size() -> tuple[int, float]:
    """Trả về (số file, tổng KB) trong uploads/."""
    if not os.path.isdir(UPLOADS_DIR):
        return 0, 0.0
    files = [f for f in os.listdir(UPLOADS_DIR) if f.endswith(".jpg")]
    total = sum(os.path.getsize(os.path.join(UPLOADS_DIR, f)) for f in files)
    return len(files), total / 1024


# =============================================================================
# COMMANDS
# =============================================================================

def cmd_view(limit: int = 20, label_filter: str = None, model_filter: str = None) -> None:
    """In bảng lịch sử các lần inference."""
    _sep(f"LỊCH SỬ INFERENCE — {limit} records gần nhất (dữ liệu thật)")

    # Build query
    cols = [
        prediction_history.c.id,
        prediction_history.c.timestamp,
        prediction_history.c.filename,
        prediction_history.c.model_id,
        prediction_history.c.label,
        prediction_history.c.confidence,
        prediction_history.c.inference_time_ms,
        prediction_history.c.mask_valid,
        prediction_history.c.lung_ratio_pct,
    ]
    stmt = select(*cols).order_by(desc(prediction_history.c.timestamp)).limit(limit)

    if label_filter:
        stmt = stmt.where(prediction_history.c.label == label_filter)
    if model_filter:
        stmt = stmt.where(prediction_history.c.model_id == model_filter)

    with engine.connect() as conn:
        rows = conn.execute(stmt).fetchall()

    if not rows:
        print("\n  (Không có dữ liệu)")
        if label_filter or model_filter:
            print(f"  Filter: label={label_filter!r}  model={model_filter!r}")
        return

    # Format data
    data = []
    for r in rows:
        ts    = r[1][:19] if r[1] else "?"
        fname = r[2][:22] if r[2] else "?"
        model = "3-class" if "3class" in (r[3] or "") else "4-class"
        label = r[4] or "?"
        conf  = r[5]   # confidence REAL
        ms    = r[6]   # inference_time_ms INTEGER
        mask  = "✅" if r[7] else "❌"
        lung  = f"{r[8]:.1f}%" if r[8] is not None else "?"
        data.append([
            (r[0] or "")[:8] + "…",
            ts,
            fname,
            model,
            label,
            f"{conf*100:.1f}%",
            f"{ms}ms" if ms else "?",
            mask,
            lung,
        ])

    headers = ["ID", "Timestamp", "Filename", "Model", "Label", "Conf", "Time", "Mask", "Lung%"]

    if HAS_TABULATE:
        print(tabulate(data, headers=headers, tablefmt="rounded_outline"))
    else:
        # Fallback: plain text
        col_w = [10, 19, 23, 8, 22, 6, 7, 5, 6]
        header_line = "  " + "  ".join(h.ljust(col_w[i]) for i, h in enumerate(headers))
        print(header_line)
        print("  " + "─" * (sum(col_w) + len(col_w) * 2))
        for row in data:
            print("  " + "  ".join(str(v).ljust(col_w[i]) for i, v in enumerate(row)))

    print(f"\n  Hiển thị: {len(rows)} records")
    if label_filter or model_filter:
        print(f"  Filter: label={label_filter!r}  model={model_filter!r}")
    if not HAS_TABULATE:
        print("\n  💡 Tip: pip install tabulate  →  bảng đẹp hơn")


def cmd_stats() -> None:
    """In thống kê tổng hợp."""
    _sep("THỐNG KÊ DATABASE — AI-LungCare")

    stats = get_stats()
    n_files, size_kb = _uploads_size()

    db_path   = DATABASE_URL.replace("sqlite:///", "")
    db_size   = os.path.getsize(db_path) / 1024 if os.path.exists(db_path) else 0

    print(f"\n  📦 Database")
    print(f"     URL      : {DATABASE_URL}")
    print(f"     DB size  : {db_size:.1f} KB")
    print(f"     Uploads  : {n_files} files  ({size_kb:.1f} KB)")

    print(f"\n  📊 Tổng quan")
    print(f"     Tổng số inference  : {stats['total_predictions']:,}")
    print(f"     Avg inference time : {stats.get('avg_inference_ms', 0):.0f} ms")

    print(f"\n  🏷️  Theo nhãn chẩn đoán")
    total = stats["total_predictions"] or 1
    if stats["by_label"]:
        max_cnt = max(stats["by_label"].values())
        for label, cnt in sorted(stats["by_label"].items(), key=lambda x: -x[1]):
            bar_len = int(cnt / max_cnt * 30)
            bar     = "█" * bar_len + "░" * (30 - bar_len)
            pct     = cnt / total * 100
            print(f"     {label:<25} {bar}  {cnt:>4} ({pct:5.1f}%)")
    else:
        print("     (Chưa có dữ liệu)")

    print(f"\n  🤖 Theo model")
    if stats["by_model"]:
        for model, cnt in stats["by_model"].items():
            pct = cnt / total * 100
            print(f"     {model:<30} {cnt:>4} records  ({pct:.1f}%)")
    else:
        print("     (Chưa có dữ liệu)")

    # Lấy record gần nhất và cũ nhất
    with engine.connect() as conn:
        newest = conn.execute(
            select(prediction_history.c.timestamp, prediction_history.c.label)
            .order_by(desc(prediction_history.c.timestamp)).limit(1)
        ).first()
        oldest = conn.execute(
            select(prediction_history.c.timestamp, prediction_history.c.label)
            .order_by(prediction_history.c.timestamp).limit(1)
        ).first()

    if newest:
        print(f"\n  🕐 Thời gian")
        print(f"     Mới nhất : {newest[0][:19]}  ({newest[1]})")
        if oldest and oldest[0] != newest[0]:
            print(f"     Cũ nhất  : {oldest[0][:19]}  ({oldest[1]})")

    print()


def cmd_detail(record_id: str) -> None:
    """In chi tiết đầy đủ của 1 record."""
    _sep(f"CHI TIẾT RECORD — {record_id[:8]}…")

    record = get_prediction_by_id(record_id)
    if not record:
        # Thử tìm partial match (8 ký tự đầu)
        with engine.connect() as conn:
            like_rows = conn.execute(
                select(prediction_history.c.id, prediction_history.c.label,
                       prediction_history.c.timestamp)
                .where(prediction_history.c.id.like(f"{record_id}%"))
                .limit(5)
            ).fetchall()

        if like_rows:
            print(f"\n  Không tìm thấy ID chính xác, nhưng có {len(like_rows)} record bắt đầu bằng '{record_id}':")
            for r in like_rows:
                print(f"    {r[0]}  |  {r[1]}  |  {r[2][:19]}")
        else:
            print(f"\n  ❌ Không tìm thấy record: {record_id}")
        return

    print(f"\n  🆔  ID          : {record['id']}")
    print(f"  📅  Timestamp   : {record['timestamp']}")
    print(f"  💾  Saved at    : {record.get('created_at', '?')}")
    print(f"  📁  Filename    : {record['filename']}")
    print(f"  🤖  Model       : {record['model_id']}")

    print(f"\n  🏷️   Label       : {record['label']}")
    print(f"  📊  Confidence  : {record['confidence']:.1%}")

    print(f"\n  📈  Probabilities:")
    probs = record.get("probabilities", {})
    max_p = max(probs.values()) if probs else 1
    for cls, p in sorted(probs.items(), key=lambda x: -x[1]):
        bar = "█" * int(p / max_p * 20)
        marker = " ←" if cls == record['label'] else ""
        print(f"      {cls:<25} {bar:<20}  {p:.1%}{marker}")

    print(f"\n  🫁  Segment info:")
    print(f"      Lung ratio  : {record.get('lung_ratio_pct', '?')}%")
    print(f"      Threshold   : {record.get('threshold', '?')}")
    print(f"      Mask valid  : {'✅ Yes' if record.get('mask_valid') else '❌ No'}")
    if record.get('mask_reason') and record['mask_reason'] != 'OK':
        print(f"      Mask reason : {record['mask_reason']}")

    print(f"\n  ⏱️   Timing:")
    print(f"      Inference   : {record.get('inference_time_ms', '?')} ms")

    print(f"\n  🖼️   Image files:")
    base = os.path.dirname(os.path.abspath(__file__))
    for key, label in [
        ("original_image_path",  "Original"),
        ("segmented_image_path", "Segmented"),
        ("overlay_image_path",   "Overlay"),
        ("scorecam_image_path",  "ScoreCAM"),
    ]:
        path = record.get(key)
        if path:
            full  = os.path.join(base, path)
            exist = os.path.exists(full)
            size  = os.path.getsize(full) / 1024 if exist else 0
            icon  = "✅" if exist else "❌"
            print(f"      {icon} {label:<10} : {path}  ({size:.1f} KB)")
        else:
            print(f"      ⚠️  {label:<10} : (không có)")

    # Xem được qua browser
    print(f"\n  🌐  Debug view : http://localhost:8000/api/view/{record['id']}")
    print()


# =============================================================================
# ENTRY POINT
# =============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        prog        = "db_viewer.py",
        description = "Xem dữ liệu thật trong lungcare.db (CHỈ ĐỌC, không ghi)",
        formatter_class = argparse.RawDescriptionHelpFormatter,
        epilog = """
Ví dụ:
  python db_viewer.py                          # Bảng 20 records gần nhất
  python db_viewer.py --limit 50              # 50 records
  python db_viewer.py --stats                 # Thống kê tổng hợp
  python db_viewer.py --id abc12345           # Chi tiết 1 record (8 ký tự đầu OK)
  python db_viewer.py --label COVID-19        # Lọc nhãn
  python db_viewer.py --label Normal --stats  # Kết hợp
  python db_viewer.py --model pneunet_4class  # Lọc model
        """
    )

    parser.add_argument("--limit",  type=int, default=20,   help="Số records hiển thị (default: 20)")
    parser.add_argument("--stats",  action="store_true",     help="Xem thống kê tổng hợp")
    parser.add_argument("--id",     type=str, default=None,  help="UUID record cần xem chi tiết")
    parser.add_argument("--label",  type=str, default=None,  help="Lọc theo nhãn (COVID-19, Normal, ...)")
    parser.add_argument("--model",  type=str, default=None,  help="Lọc theo model (pneunet_3class / pneunet_4class)")

    args = parser.parse_args()

    print("=" * 72)
    print("  🏥  AI-LungCare — DB Viewer  (CHỈ ĐỌC — không tạo fake data)")
    print(f"  📂  DB: {DATABASE_URL}")
    print(f"  📂  Uploads: {UPLOADS_DIR}")
    print("=" * 72)

    # Đảm bảo bảng tồn tại (không thêm data)
    init_db()

    # Dispatch
    if args.id:
        cmd_detail(args.id)
    elif args.stats:
        cmd_stats()
    else:
        cmd_view(limit=args.limit, label_filter=args.label, model_filter=args.model)

        # Tự động in stats tóm tắt cuối bảng nếu có data
        if not args.label and not args.model:
            stats = get_stats()
            if stats["total_predictions"] > 0:
                print(f"  💡 Tổng DB: {stats['total_predictions']} records  |"
                      f"  Avg: {stats.get('avg_inference_ms', 0):.0f}ms  |"
                      f"  Dùng --stats để xem chi tiết hơn")


if __name__ == "__main__":
    main()