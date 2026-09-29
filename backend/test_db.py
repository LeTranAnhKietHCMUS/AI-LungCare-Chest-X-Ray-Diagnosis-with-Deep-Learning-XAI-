"""
test_db.py — Test và debug database.py độc lập (không cần models/FastAPI).

Chạy: python test_db.py
      python test_db.py --view          # Xem toàn bộ DB dạng bảng
      python test_db.py --clean         # Xóa toàn bộ test data, xóa ảnh giả tạo ra trong test (thư mục upload)
      python test_db.py --stats         # Chỉ xem stats

Yêu cầu: pip install tabulate (optional, đẹp hơn)
"""

import sys
import os
import json
import uuid
import base64
import sqlite3
from datetime import datetime

# ─────────────────────────────────────────────
# Import database module
# ─────────────────────────────────────────────
try:
    from database import (
        init_db, save_prediction, get_recent_predictions,
        get_prediction_by_id, delete_prediction, get_stats,
        load_image_as_b64, DB_PATH, UPLOADS_DIR
    )
except ImportError as e:
    print(f"[ERROR] Không import được database.py: {e}")
    print("  Hãy chạy script này trong cùng thư mục với database.py")
    sys.exit(1)

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _sep(title=""):
    print("\n" + "─" * 60)
    if title:
        print(f"  {title}")
    print("─" * 60)


def _make_fake_image_b64(color: tuple = (100, 150, 200)) -> str:
    """Tạo ảnh JPEG 64×64 giả để test lưu file."""
    try:
        from PIL import Image
        import io
        img = Image.new("RGB", (64, 64), color=color)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        # Fallback: JPEG header tối giản (không decode được nhưng đủ để test lưu file)
        fake_bytes = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
            0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
            0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
        ])
        return base64.b64encode(fake_bytes).decode()


def _make_test_record(label="COVID-19", model="pneunet_3class", filename="test.jpg"):
    """Tạo 1 record giả hoàn chỉnh."""
    return {
        "id":                  str(uuid.uuid4()),
        "timestamp":           datetime.now().isoformat(),
        "filename":            filename,
        "label":               label,
        "confidence":          0.8712,
        "model_id":            model,
        "probabilities":       {"COVID-19": 0.8712, "Normal": 0.0921, "Pneumonia": 0.0367},
        "inference_time_ms":   1240,
        "segment_info": {
            "lung_ratio_pct":  38.5,
            "threshold":       0.4213,
            "mask_valid":      True,
            "mask_reason":     "OK",
        },
        "original_image_b64":  _make_fake_image_b64((80, 80, 80)),
        "segmented_image_b64": _make_fake_image_b64((60, 60, 60)),
        "overlay_image_b64":   _make_fake_image_b64((100, 150, 200)),
        "scorecam_image_b64":  _make_fake_image_b64((200, 100, 50)),
    }


# ─────────────────────────────────────────────
# Test functions
# ─────────────────────────────────────────────

def test_init():
    _sep("TEST 1: init_db()")
    init_db()
    assert os.path.exists(DB_PATH),    f"[FAIL] Không tạo được {DB_PATH}"
    assert os.path.isdir(UPLOADS_DIR), f"[FAIL] Không tạo được {UPLOADS_DIR}"
    print(f"  ✅ DB file:    {DB_PATH}")
    print(f"  ✅ Uploads dir: {UPLOADS_DIR}")

    # Gọi lần 2 — phải idempotent
    init_db()
    print("  ✅ Idempotent: gọi lần 2 không lỗi")


def test_save_and_retrieve():
    _sep("TEST 2: save_prediction + get_prediction_by_id")

    record = _make_test_record(label="COVID-19", model="pneunet_3class", filename="xray_001.jpg")
    rid    = record["id"]

    # Save
    returned_id = save_prediction(record)
    assert returned_id == rid, f"[FAIL] Returned ID mismatch: {returned_id} vs {rid}"
    print(f"  ✅ Saved: {rid[:8]}…")

    # Retrieve
    fetched = get_prediction_by_id(rid)
    assert fetched is not None,                  "[FAIL] get_by_id trả None"
    assert fetched["label"] == "COVID-19",       "[FAIL] label sai"
    assert fetched["model_id"] == "pneunet_3class", "[FAIL] model_id sai"
    assert isinstance(fetched["probabilities"], dict), "[FAIL] probabilities không phải dict"
    assert isinstance(fetched["mask_valid"], bool),    "[FAIL] mask_valid không phải bool"
    print(f"  ✅ Retrieved: label={fetched['label']}  conf={fetched['confidence']:.1%}")
    print(f"  ✅ Probs type: {type(fetched['probabilities']).__name__}")
    print(f"  ✅ mask_valid: {fetched['mask_valid']} ({type(fetched['mask_valid']).__name__})")

    # Kiểm tra file ảnh đã lưu
    for key, tag in [("original_image_path", "original"),
                     ("segmented_image_path", "segmented"),
                     ("overlay_image_path", "overlay"),
                     ("scorecam_image_path", "scorecam")]:
        rel_path = fetched.get(key)
        if rel_path:
            full = os.path.join(os.path.dirname(DB_PATH), rel_path)
            exists = os.path.exists(full)
            size   = os.path.getsize(full) if exists else 0
            status = f"✅ {size} bytes" if exists else "❌ MISSING"
            print(f"  {status}  {rel_path}")
        else:
            print(f"  ⚠️  {key} = None (ảnh không lưu được)")

    return rid  # Trả về để test tiếp


def test_load_image(rid: str):
    _sep("TEST 3: load_image_as_b64")

    record = get_prediction_by_id(rid)
    for key, label in [("original_image_path", "original"),
                       ("scorecam_image_path",  "scorecam")]:
        b64 = load_image_as_b64(record.get(key))
        if b64:
            print(f"  ✅ {label}: {len(b64)} chars base64")
        else:
            print(f"  ⚠️  {label}: None")

    # Test path không tồn tại
    result = load_image_as_b64("uploads/nonexistent_9999.jpg")
    assert result is None, "[FAIL] Path không tồn tại phải trả None"
    print("  ✅ Nonexistent path → None (đúng)")


def test_recent_predictions():
    _sep("TEST 4: get_recent_predictions")

    # Thêm vài records với label khác
    labels = ["Normal", "Pneumonia", "Normal", "COVID-19"]
    models = ["pneunet_3class", "pneunet_4class", "pneunet_3class", "pneunet_4class"]
    rids   = []
    for label, model in zip(labels, models):
        r = _make_test_record(label=label, model=model)
        save_prediction(r)
        rids.append(r["id"])

    # Lấy tất cả
    all_rows = get_recent_predictions(limit=50)
    print(f"  ✅ Total records in DB: {len(all_rows)}")

    # Lọc theo model
    rows_3 = get_recent_predictions(model_id="pneunet_3class", limit=50)
    rows_4 = get_recent_predictions(model_id="pneunet_4class", limit=50)
    print(f"  ✅ 3class: {len(rows_3)} rows  |  4class: {len(rows_4)} rows")

    # Kiểm tra không có _path keys trong result
    for row in all_rows[:3]:
        path_keys = [k for k in row if k.endswith("_path")]
        assert not path_keys, f"[FAIL] _path keys lộ ra: {path_keys}"
    print("  ✅ Không có *_path keys trong response")

    # Kiểm tra thứ tự timestamp DESC
    if len(all_rows) >= 2:
        ts0 = all_rows[0]["timestamp"]
        ts1 = all_rows[1]["timestamp"]
        assert ts0 >= ts1, f"[FAIL] Không sắp xếp đúng: {ts0} < {ts1}"
        print("  ✅ Thứ tự timestamp DESC đúng")

    return rids


def test_delete(rid: str):
    _sep("TEST 5: delete_prediction")

    record = get_prediction_by_id(rid)
    image_paths = [record.get(k) for k in
                   ("original_image_path", "segmented_image_path",
                    "overlay_image_path", "scorecam_image_path")
                   if record.get(k)]

    ok = delete_prediction(rid)
    assert ok, f"[FAIL] delete_prediction trả False cho id={rid[:8]}"
    print(f"  ✅ Deleted: {rid[:8]}…")

    # Không còn trong DB
    assert get_prediction_by_id(rid) is None, "[FAIL] Record vẫn còn trong DB"
    print("  ✅ Không còn trong DB")

    # File ảnh đã xóa
    base = os.path.dirname(DB_PATH)
    for rel in image_paths:
        full = os.path.join(base, rel)
        if os.path.exists(full):
            print(f"  ⚠️  File chưa xóa: {rel}")
        else:
            print(f"  ✅ File đã xóa: {rel}")

    # Delete lần 2 → trả False
    ok2 = delete_prediction(rid)
    assert not ok2, "[FAIL] Lần 2 phải trả False"
    print("  ✅ Double-delete trả False (đúng)")


def test_stats():
    _sep("TEST 6: get_stats")
    stats = get_stats()
    print(f"  Total: {stats['total_predictions']}")
    print(f"  By label: {json.dumps(stats['by_label'], ensure_ascii=False)}")
    print(f"  By model: {json.dumps(stats['by_model'], ensure_ascii=False)}")
    print(f"  Avg inference: {stats.get('avg_inference_ms')}ms")
    assert "total_predictions" in stats
    assert "by_label" in stats
    print("  ✅ Stats OK")


def test_replace():
    _sep("TEST 7: INSERT OR REPLACE (upsert)")
    record = _make_test_record(label="Normal")
    rid    = record["id"]
    save_prediction(record)

    # Ghi đè cùng id với label khác
    record2 = dict(record)
    record2["label"]      = "Pneumonia"
    record2["confidence"] = 0.999
    # xóa ảnh b64 để test replace không cần ảnh mới
    for k in ("original_image_b64", "segmented_image_b64",
              "overlay_image_b64", "scorecam_image_b64"):
        record2[k] = None
    save_prediction(record2)

    fetched = get_prediction_by_id(rid)
    assert fetched["label"] == "Pneumonia", "[FAIL] REPLACE không cập nhật label"
    print(f"  ✅ REPLACE OK: label={fetched['label']}  conf={fetched['confidence']:.1%}")

    # Cleanup
    delete_prediction(rid)


# ─────────────────────────────────────────────
# View / info commands
# ─────────────────────────────────────────────

def cmd_view():
    """In toàn bộ DB dạng bảng."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, timestamp, filename, model_id, label, confidence, "
        "inference_time_ms, mask_valid, lung_ratio_pct FROM prediction_history "
        "ORDER BY timestamp DESC"
    ).fetchall()
    conn.close()

    if not rows:
        print("  (DB trống)")
        return

    try:
        from tabulate import tabulate
        data = [[r["id"][:8]+"…", r["timestamp"][:19], r["filename"][:20],
                 r["model_id"], r["label"], f"{r['confidence']:.1%}",
                 r["inference_time_ms"], "✅" if r["mask_valid"] else "❌",
                 f"{r['lung_ratio_pct'] or 0:.1f}%"] for r in rows]
        print(tabulate(data,
                       headers=["ID", "Timestamp", "File", "Model", "Label",
                                 "Conf", "ms", "Mask", "Lung%"],
                       tablefmt="rounded_outline"))
    except ImportError:
        for r in rows:
            print(f"  {r['id'][:8]}… | {r['timestamp'][:19]} | {r['label']:<22} "
                  f"| {r['confidence']:.1%} | {r['inference_time_ms']}ms")

    print(f"\n  Total: {len(rows)} records")


def cmd_clean():
    """Xóa toàn bộ DB và uploads/ để test lại sạch."""
    confirm = input("  Xóa toàn bộ DB và uploads/? (yes/N): ").strip().lower()
    if confirm != "yes":
        print("  Đã hủy.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM prediction_history")
    conn.commit()
    conn.close()
    print("  ✅ Đã xóa toàn bộ records trong DB")

    # Xóa file ảnh
    if os.path.isdir(UPLOADS_DIR):
        count = 0
        for f in os.listdir(UPLOADS_DIR):
            if f.endswith(".jpg"):
                os.remove(os.path.join(UPLOADS_DIR, f))
                count += 1
        print(f"  ✅ Đã xóa {count} file ảnh trong uploads/")


def cmd_stats():
    init_db()
    stats = get_stats()
    print(f"\n  📊 DB Stats")
    print(f"  Total:     {stats['total_predictions']} predictions")
    print(f"  Avg time:  {stats.get('avg_inference_ms', 0):.0f}ms")
    print(f"  By label:  {json.dumps(stats['by_label'], indent=2, ensure_ascii=False)}")
    print(f"  By model:  {json.dumps(stats['by_model'], indent=2, ensure_ascii=False)}")

    # Dung lượng DB
    if os.path.exists(DB_PATH):
        size_kb = os.path.getsize(DB_PATH) / 1024
        print(f"  DB size:   {size_kb:.1f} KB")

    # Dung lượng uploads
    if os.path.isdir(UPLOADS_DIR):
        total_bytes = sum(
            os.path.getsize(os.path.join(UPLOADS_DIR, f))
            for f in os.listdir(UPLOADS_DIR)
            if f.endswith(".jpg")
        )
        print(f"  Uploads:   {total_bytes/1024:.1f} KB  "
              f"({len(os.listdir(UPLOADS_DIR))} files)")


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

if __name__ == "__main__":
    args = sys.argv[1:]

    if "--view" in args:
        _sep("DB VIEWER")
        init_db()
        cmd_view()
        sys.exit(0)

    if "--clean" in args:
        _sep("DB CLEAN")
        init_db()
        cmd_clean()
        sys.exit(0)

    if "--stats" in args:
        cmd_stats()
        sys.exit(0)

    # ── Chạy full test suite ──────────────────
    print("=" * 60)
    print("  AI-LungCare — Database Test Suite")
    print(f"  DB: {DB_PATH}")
    print("=" * 60)

    try:
        test_init()
        rid1 = test_save_and_retrieve()
        test_load_image(rid1)
        extra_rids = test_recent_predictions()
        test_delete(rid1)
        test_stats()
        test_replace()

        _sep("KẾT QUẢ")
        print("  🎉 Tất cả tests PASSED!")
        print(f"  DB: {DB_PATH}")
        print(f"  Uploads: {UPLOADS_DIR}")
        print()
        print("  Chạy lại với --view để xem dữ liệu trong DB")
        print("  Chạy lại với --clean để xóa sạch test data")

    except AssertionError as e:
        print(f"\n  ❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        import traceback
        print(f"\n  ❌ EXCEPTION: {e}")
        traceback.print_exc()
        sys.exit(1)