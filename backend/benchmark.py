"""
benchmark.py — Đo thời gian từng công đoạn pipeline (U-Net, PneuNet, ScoreCAM)
độc lập với web thật: KHÔNG qua FastAPI/HTTP, KHÔNG ghi vào DB/uploads/.

Cách dùng:
    python benchmark.py --image path/to/test_xray.jpg --model pneunet_3class --n 50 --warmup 10

Kết quả: in bảng thống kê ra terminal + lưu benchmark_results.csv
"""

import argparse
import time
import statistics
import csv
import sys
import os

# Import trực tiếp module inference — KHÔNG khởi động FastAPI/DB
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inference import load_all_models, models_loaded, predict


def run_benchmark(image_path: str, model_id: str, n: int, warmup: int, model_dir: str):
    print(f"[INFO] Loading models từ: {model_dir}")
    load_all_models(model_dir)
    if not models_loaded():
        raise RuntimeError("Models load thất bại — kiểm tra model_dir.")

    with open(image_path, "rb") as f:
        img_bytes = f.read()

    # ── Warm-up: bỏ kết quả, tránh cold-start (build graph, build extractor) ──
    print(f"[INFO] Warm-up {warmup} lần...")
    for i in range(warmup):
        predict(img_bytes, model_id, run_scorecam=True)
        print(f"  warm-up {i+1}/{warmup} xong")

    # ── Đo thật N lần ────────────────────────────────────────────────────
    print(f"[INFO] Đo {n} lần...")
    records = []
    for i in range(n):
        t0 = time.perf_counter()
        result = predict(img_bytes, model_id, run_scorecam=True)
        wall_ms = (time.perf_counter() - t0) * 1000

        tb = result["timing_breakdown_ms"]
        row = {
            "run": i + 1,
            "unet_ms": tb["unet"],
            "classify_ms": tb["classify"],
            "scorecam_ms": tb["scorecam"],
            "total_ms": tb["total"],
            "wall_ms": round(wall_ms, 1),  # đối chiếu, gồm cả bước 4 (tạo ảnh hiển thị)
        }
        records.append(row)
        print(f"  run {i+1}/{n}: unet={row['unet_ms']}ms  "
              f"classify={row['classify_ms']}ms  scorecam={row['scorecam_ms']}ms  "
              f"total={row['total_ms']}ms")

    return records


def summarize(records: list, out_csv: str):
    fields = ["unet_ms", "classify_ms", "scorecam_ms", "total_ms", "wall_ms"]

    # Lưu CSV chi tiết từng lần chạy
    with open(out_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["run"] + fields)
        writer.writeheader()
        writer.writerows(records)
    print(f"\n[INFO] Đã lưu chi tiết vào: {out_csv}")

    # In bảng thống kê
    print("\n" + "=" * 70)
    print(f"{'Công đoạn':<15}{'Mean':>10}{'Median':>10}{'Std':>10}{'Min':>10}{'Max':>10}")
    print("=" * 70)
    for field in fields:
        vals = [r[field] for r in records]
        mean_v = statistics.mean(vals)
        med_v  = statistics.median(vals)
        std_v  = statistics.stdev(vals) if len(vals) > 1 else 0.0
        print(f"{field:<15}{mean_v:>10.1f}{med_v:>10.1f}{std_v:>10.1f}"
              f"{min(vals):>10.1f}{max(vals):>10.1f}")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark timing pipeline AI-LungCare")
    parser.add_argument("--image", required=True, help="Đường dẫn ảnh X-ray test")
    parser.add_argument("--model", default="pneunet_3class",
                         choices=["pneunet_3class", "pneunet_4class"])
    parser.add_argument("--n", type=int, default=50, help="Số lần đo thật")
    parser.add_argument("--warmup", type=int, default=10, help="Số lần warm-up bỏ đi")
    parser.add_argument("--model-dir", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "models"))
    parser.add_argument("--out", default="benchmark_results.csv")
    args = parser.parse_args()

    records = run_benchmark(args.image, args.model, args.n, args.warmup, args.model_dir)
    summarize(records, args.out)