# 📊 Phân Tích Tiến Độ Dự Án AI-LungCare

## Tổng Quan

| Hạng mục | Tiến độ | Ghi chú |
|----------|---------|---------|
| **Backend — Core API** | ✅ **95%** | Gần hoàn chỉnh |
| **Backend — Models & Pipeline** | ✅ **100%** | Hoàn thành |
| **Backend — XAI (ScoreCAM)** | ✅ **100%** | Hoàn thành, thay GradCAM bằng ScoreCAM |
| **Backend — Database / History** | ⚠️ **30%** | Đang dùng in-memory, chưa có DB |
| **Frontend — React App** | ❌ **0%** | Thư mục `frontend/` trống hoàn toàn |
| **Tổng thể dự án** | **~40%** | Backend xong, Frontend chưa bắt đầu |

---

## ✅ Những Gì Đã Làm Xong

### Backend (rất tốt!)

#### 1. [main.py](file:///d:/DAI_HOC_KHOA_HOC_TU_NHIEN/KHOALUAN/web_platform/backend/main.py)
- ✅ FastAPI app với CORS, middleware
- ✅ `GET /api/health` — health check
- ✅ `GET /api/models` — danh sách models
- ✅ `POST /api/predict` — pipeline chính (U-Net → PneuNet → ScoreCAM)
- ✅ `GET /api/recent` — lịch sử (in-memory)
- ✅ `GET /api/view/{record_id}` — debug HTML view (bonus, không có trong spec)
- ✅ Xử lý lỗi: file không hợp lệ (400), model chưa load (503), ảnh quá nhỏ (400)
- ✅ Load models khi startup

#### 2. [inference.py](file:///d:/DAI_HOC_KHOA_HOC_TU_NHIEN/KHOALUAN/web_platform/backend/inference.py)
- ✅ Load 3 models (U-Net, PneuNet 3-class, 4-class) với custom `AddPositionEmbs` layer
- ✅ Pipeline đầy đủ: U-Net segment → adaptive threshold → morphological postprocess → PneuNet classify
- ✅ Mask validity check (lung ratio 3%–70%)
- ✅ Colored overlay (mask + ảnh gốc)
- ✅ Trả đủ 4 ảnh base64: original, segmented, overlay, scorecam/gradcam
- ✅ `segment_info` metadata (lung_ratio, threshold, mask_valid)
- ✅ Normalize PneuNet input [-1, 1] khớp training

#### 3. [scorecam.py](file:///d:/DAI_HOC_KHOA_HOC_TU_NHIEN/KHOALUAN/web_platform/backend/scorecam.py)
- ✅ ScoreCAM Variant B (Wang et al. 2020) — thay thế GradCAM/GradRollout
- ✅ Top-K=128 channel selection, ~0.8s/ảnh CPU
- ✅ Zero baseline, signed CIC, softmax T=1
- ✅ INFERNO colormap overlay
- ✅ Extractor cache

#### 4. Các file model
- ✅ `best_unet.keras` (373MB)
- ✅ `simplified_pneunet_pneunet_3class.keras` (46.5MB)
- ✅ `simplified_pneunet_pneunet_4class.keras` (46.5MB)

---

## ❌ Những Gì Chưa Làm

### 1. Frontend React — Chưa bắt đầu (0%)
Thư mục `frontend/` **hoàn toàn trống**. Cần xây dựng:

| Trang/Component | Mô tả | Độ ưu tiên |
|-----------------|--------|-------------|
| Khởi tạo Vite + React | `npm create vite@latest` | 🔴 Cao |
| `App.jsx` + routing | React Router DOM | 🔴 Cao |
| `Navbar.jsx` | Navigation bar | 🔴 Cao |
| `HomePage.jsx` | Trang chủ, giới thiệu pipeline | 🟡 Trung bình |
| **`UploadPage.jsx`** | **Trang chính — upload + kết quả** | 🔴 **Rất cao** |
| `ImageUploader.jsx` | Kéo thả ảnh | 🔴 Cao |
| `ResultDisplay.jsx` | Hiển thị kết quả | 🔴 Cao |
| `SliderOverlay.jsx` | So sánh ảnh gốc/overlay | 🔴 Cao |
| `DiagnosisCard.jsx` | Thẻ chẩn đoán màu | 🟡 Trung bình |
| `ConfidenceBar.jsx` | Progress bar confidence | 🟡 Trung bình |
| `ComparePage.jsx` | So sánh 3-class vs 4-class | 🟡 Trung bình |
| `HistoryPage.jsx` | Lịch sử phân loại | 🟡 Trung bình |
| `AboutPage.jsx` | Giới thiệu hệ thống | 🟢 Thấp |
| `api/client.js` | Axios API calls | 🔴 Cao |
| CSS Design System | Biến CSS, font Inter | 🔴 Cao |

### 2. Database — Hiện tại chỉ in-memory
- Lịch sử **mất khi restart server** (Python list trong RAM)
- Cần chuyển sang database nếu muốn lưu trữ lâu dài

---

## 🗄️ Hướng Dẫn Chọn Cơ Sở Dữ Liệu

### So sánh 3 lựa chọn

| Tiêu chí | SQLite | PostgreSQL | MySQL |
|----------|--------|------------|-------|
| **Cài đặt** | ✅ Không cần cài, có sẵn trong Python | ❌ Cần cài server riêng | ❌ Cần cài server riêng |
| **Cấu hình** | ✅ Chỉ cần 1 file `.db` | ❌ User/password/port/database | ❌ User/password/port/database |
| **Deploy** | ✅ Copy file là xong | ⚠️ Cần server chạy liên tục | ⚠️ Cần server chạy liên tục |
| **Concurrent users** | ⚠️ Giới hạn (1 writer) | ✅ Rất tốt | ✅ Tốt |
| **Phù hợp khóa luận** | ✅ **Rất phù hợp** | ⚠️ Overkill | ⚠️ Overkill |
| **ORM Python** | ✅ SQLAlchemy / SQLite3 built-in | ✅ SQLAlchemy | ✅ SQLAlchemy |
| **Windows native** | ✅ Không cần gì thêm | ❌ Cần cài PostgreSQL | ❌ Cần cài MySQL |
| **Lưu ảnh base64** | ⚠️ OK nhưng file to | ✅ BYTEA type | ✅ BLOB type |
| **Performance** | ✅ Đủ cho demo | ✅ Tuyệt vời | ✅ Tốt |

### 🏆 Khuyến nghị: **SQLite**

> [!IMPORTANT]
> Với bối cảnh **khóa luận tốt nghiệp**, chạy **local trên Windows**, **không Docker**, **1 user tại 1 thời điểm**, **SQLite là lựa chọn tối ưu nhất**.

**Lý do chính:**
1. **Zero configuration** — không cần cài thêm bất cứ gì, Python có sẵn module `sqlite3`
2. **Đơn giản demo** — giáo viên/hội đồng chỉ cần chạy 1 lệnh, không cần setup DB server
3. **Portable** — file `.db` nằm ngay trong project, backup = copy file
4. **Đủ mạnh** — Với lượng dữ liệu lịch sử inference (vài trăm → vài nghìn records), SQLite thừa sức
5. **Không mâu thuẫn với spec** — PROJECT_SPEC ghi "không cần database, dùng in-memory" → SQLite là bước nâng cấp nhẹ nhất, không cần thay đổi architecture

> [!WARNING]
> **Khi nào KHÔNG nên dùng SQLite:**
> - Nếu bạn dự định deploy lên server thật với nhiều user đồng thời
> - Nếu hội đồng yêu cầu phải có database server "xịn"
> - Nếu bạn cần lưu ảnh gốc (file lớn) → nên lưu file trên disk, DB chỉ lưu path

### Thiết kế bảng đề xuất (SQLite)

```sql
-- Bảng lịch sử chẩn đoán
CREATE TABLE IF NOT EXISTS prediction_history (
    id              TEXT PRIMARY KEY,           -- UUID
    timestamp       TEXT NOT NULL,              -- ISO 8601
    filename        TEXT NOT NULL,              -- Tên file upload
    model_id        TEXT NOT NULL,              -- "pneunet_3class" / "pneunet_4class"
    label           TEXT NOT NULL,              -- Nhãn chẩn đoán
    confidence      REAL NOT NULL,              -- Độ tin cậy (0–1)
    probabilities   TEXT NOT NULL,              -- JSON string
    inference_time_ms INTEGER NOT NULL,         -- Thời gian xử lý
    lung_ratio_pct  REAL,                       -- % vùng phổi
    mask_valid      INTEGER,                    -- 0/1
    -- Ảnh base64 (optional, có thể bỏ để giảm dung lượng)
    original_image_b64  TEXT,
    overlay_image_b64   TEXT,
    scorecam_image_b64  TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Index cho truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_timestamp ON prediction_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_model_id ON prediction_history(model_id);
```

> [!TIP]
> **Mẹo giảm dung lượng DB:** Lưu ảnh base64 ra file riêng trong thư mục `uploads/`, DB chỉ lưu đường dẫn file. Ảnh base64 mỗi ảnh ~200-500KB, 50 records = ~25-75MB.

### Nếu vẫn muốn PostgreSQL/MySQL

Nếu hội đồng yêu cầu database "chuyên nghiệp", thì:
- **PostgreSQL** > MySQL (JSON type native, BYTEA tốt hơn, miễn phí hoàn toàn)
- Dùng **SQLAlchemy** làm ORM → sau này đổi DB engine chỉ cần đổi connection string
- Cài thêm: `pip install sqlalchemy asyncpg` (PostgreSQL) hoặc `pip install sqlalchemy aiosqlite` (SQLite)

---

## 📋 Thứ Tự Công Việc Tiếp Theo

### Phase 1: Database (1–2 ngày)
- [ ] Tạo `database.py` — kết nối SQLite + SQLAlchemy
- [ ] Tạo bảng `prediction_history`
- [ ] Sửa `main.py` — lưu kết quả vào DB thay vì in-memory list
- [ ] Sửa `GET /api/recent` — đọc từ DB

### Phase 2: Frontend Setup (1 ngày)
- [ ] `npm create vite@latest . -- --template react`
- [ ] Cài dependencies: `axios`, `react-router-dom`, `react-compare-image`
- [ ] Setup CSS design system (biến màu, font Inter)

### Phase 3: Trang Upload — Core (2–3 ngày)
- [ ] `ImageUploader.jsx` — kéo thả + preview
- [ ] `api/client.js` — Axios calls
- [ ] `UploadPage.jsx` — layout 2 cột
- [ ] `SliderOverlay.jsx` — so sánh ảnh
- [ ] `DiagnosisCard.jsx` + `ConfidenceBar.jsx`

### Phase 4: Các trang khác (2 ngày)
- [ ] `HomePage.jsx`
- [ ] `ComparePage.jsx`
- [ ] `HistoryPage.jsx`
- [ ] `AboutPage.jsx`
- [ ] `Navbar.jsx`

### Phase 5: Polish (1–2 ngày)
- [ ] Responsive design
- [ ] Loading states, error handling
- [ ] Animations, transitions
- [ ] Test end-to-end

> [!NOTE]
> **Ước tính tổng: 7–10 ngày** để hoàn thành toàn bộ dự án từ trạng thái hiện tại.
