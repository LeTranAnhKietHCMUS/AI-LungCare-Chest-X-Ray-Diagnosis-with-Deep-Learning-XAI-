"""
benchmark_http.py — Đo độ trễ đầu-cuối THỰC TẾ qua HTTP thật.

Khác với benchmark.py (gọi thẳng predict() trong Python), script này gửi
request HTTP multipart thật tới server /api/predict đang chạy — đo đúng
những gì trình duyệt/người dùng trải nghiệm: network + upload + inference
+ DB save + response transfer.

LƯU Ý: Vì đây là gọi API thật, mỗi request SẼ lưu 1 record + 4 ảnh vào
DB/uploads/ thật. Sau khi benchmark xong, tự xóa các record test qua
DELETE /api/history/{id} (script tự làm, xem cleanup()).

Yêu cầu trước khi chạy: server phải đang chạy
    uvicorn main:app --port 8000

Cách dùng:
    python benchmark_http.py --image test.jpg --model pneunet_3class --n 30 --warmup 5
    python benchmark_http.py --image test.jpg --concurrency 5 --n 20   # test tải đồng thời
"""

import argparse
import time
import statistics
import csv
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests


def send_one_request(base_url: str, image_path: str, model_id: str) -> dict:
    """Gửi 1 request /api/predict thật, đo wall-clock từ client."""
    with open(image_path, "rb") as f:
        files = {"file": (image_path.split("\\")[-1].split("/")[-1], f, "image/jpeg")}
        data = {"model_id": model_id}

        t0 = time.perf_counter()
        resp = requests.post(f"{base_url}/api/predict", files=files, data=data, timeout=120)
        client_wall_ms = (time.perf_counter() - t0) * 1000

    resp.raise_for_status()
    body = resp.json()

    return {
        "record_id": body.get("id"),
        "client_wall_ms": round(client_wall_ms, 1),          # đo từ phía client (giống người dùng thật)
        "server_inference_ms": body.get("inference_time_ms"),  # thời gian model đo bên trong server
        "server_total_ms": body.get("total_time_ms"),          # server: đọc file + inference
        "timing_breakdown_ms": body.get("timing_breakdown_ms", {}),
    }


def cleanup(base_url: str, record_ids: list):
    """Xóa các record test khỏi DB/uploads/ sau khi benchmark xong."""
    print(f"\n[INFO] Dọn dẹp {len(record_ids)} record test...")
    ok, fail = 0, 0
    for rid in record_ids:
        if not rid:
            continue
        try:
            r = requests.delete(f"{base_url}/api/history/{rid}", timeout=10)
            if r.status_code == 200:
                ok += 1
            else:
                fail += 1
        except Exception:
            fail += 1
    print(f"[INFO] Đã xóa {ok} record, lỗi {fail} record.")


def run_sequential(base_url: str, image_path: str, model_id: str, n: int, warmup: int):
    print(f"[INFO] Warm-up {warmup} request...")
    warmup_ids = []
    for i in range(warmup):
        r = send_one_request(base_url, image_path, model_id)
        warmup_ids.append(r["record_id"])
        print(f"  warm-up {i+1}/{warmup} xong ({r['client_wall_ms']}ms)")

    print(f"[INFO] Đo {n} request tuần tự...")
    records = []
    record_ids = []
    for i in range(n):
        r = send_one_request(base_url, image_path, model_id)
        records.append(r)
        record_ids.append(r["record_id"])
        print(f"  run {i+1}/{n}: client_wall={r['client_wall_ms']}ms  "
              f"server_total={r['server_total_ms']}ms")

    return records, record_ids + warmup_ids


def run_concurrent(base_url: str, image_path: str, model_id: str, n: int, concurrency: int):
    """
    Gửi N request với `concurrency` luồng song song — mô phỏng nhiều người
    dùng cùng lúc. Vì inference.py chạy đồng bộ (blocking), FastAPI sẽ xử lý
    tuần tự trên 1 worker process trừ khi chạy nhiều worker/uvicorn processes.
    """
    print(f"[INFO] Test tải: {n} request, {concurrency} luồng đồng thời...")
    records = []
    record_ids = []
    t_start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(send_one_request, base_url, image_path, model_id)
                   for _ in range(n)]
        for i, fut in enumerate(as_completed(futures)):
            r = fut.result()
            records.append(r)
            record_ids.append(r["record_id"])
            print(f"  hoàn thành {i+1}/{n}: client_wall={r['client_wall_ms']}ms")

    total_wall_s = time.perf_counter() - t_start
    throughput = n / total_wall_s
    print(f"\n[INFO] Tổng thời gian: {total_wall_s:.1f}s  →  throughput: {throughput:.2f} request/s")

    return records, record_ids


def summarize(records: list, out_csv: str):
    fields = ["client_wall_ms", "server_inference_ms", "server_total_ms"]

    with open(out_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["run"] + fields)
        writer.writeheader()
        for i, r in enumerate(records):
            writer.writerow({"run": i + 1, **{k: r[k] for k in fields}})
    print(f"\n[INFO] Đã lưu chi tiết vào: {out_csv}")

    print("\n" + "=" * 70)
    print(f"{'Metric':<22}{'Mean':>10}{'Median':>10}{'Std':>10}{'Min':>10}{'Max':>10}")
    print("=" * 70)
    for field in fields:
        vals = [r[field] for r in records if r[field] is not None]
        if not vals:
            continue
        mean_v = statistics.mean(vals)
        med_v  = statistics.median(vals)
        std_v  = statistics.stdev(vals) if len(vals) > 1 else 0.0
        print(f"{field:<22}{mean_v:>10.1f}{med_v:>10.1f}{std_v:>10.1f}"
              f"{min(vals):>10.1f}{max(vals):>10.1f}")
    print("=" * 70)
    print("\nGhi chú:")
    print("  client_wall_ms      = độ trễ đầu-cuối đo từ máy client (giống người dùng thật)")
    print("  server_inference_ms = thời gian model chạy đo bên trong server")
    print("  server_total_ms     = server: đọc file upload + inference")
    print("  Chênh lệch client_wall - server_total ≈ network + DB save + response transfer")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark HTTP end-to-end AI-LungCare")
    parser.add_argument("--image", required=True, help="Đường dẫn ảnh X-ray test")
    parser.add_argument("--model", default="pneunet_3class",
                         choices=["pneunet_3class", "pneunet_4class"])
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--n", type=int, default=30, help="Số request đo thật")
    parser.add_argument("--warmup", type=int, default=5, help="Số request warm-up (chỉ dùng khi tuần tự)")
    parser.add_argument("--concurrency", type=int, default=1,
                         help="Số luồng đồng thời. 1 = tuần tự (mặc định), >1 = test tải")
    parser.add_argument("--out", default="benchmark_http_results.csv")
    parser.add_argument("--no-cleanup", action="store_true",
                         help="Không xóa record test khỏi DB sau khi xong")
    args = parser.parse_args()

    try:
        health = requests.get(f"{args.base_url}/api/health", timeout=5).json()
        print(f"[INFO] Server OK: models_loaded={health.get('models_loaded')}")
    except Exception as e:
        print(f"[ERROR] Không kết nối được server tại {args.base_url}. "
              f"Đảm bảo đã chạy: uvicorn main:app --port 8000")
        sys.exit(1)

    if args.concurrency > 1:
        records, all_ids = run_concurrent(args.base_url, args.image, args.model,
                                           args.n, args.concurrency)
    else:
        records, all_ids = run_sequential(args.base_url, args.image, args.model,
                                           args.n, args.warmup)

    summarize(records, args.out)

    if not args.no_cleanup:
        cleanup(args.base_url, all_ids)