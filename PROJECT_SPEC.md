# PROJECT SPEC — Web Platform Nhận Diện Phổi (Khóa Luận Tốt Nghiệp)

> **Dành cho AI vibe coding:** Đọc toàn bộ file này trước khi viết bất kỳ dòng code nào.
> File này là nguồn sự thật duy nhất (single source of truth) cho toàn bộ dự án.

---

## 1. TỔNG QUAN DỰ ÁN

**Tên hệ thống:** AI-LungCare — Hệ thống hỗ trợ chẩn đoán ảnh X-quang phổi

**Mục đích:** Web app cho phép bác sĩ/người dùng tải ảnh X-quang ngực lên, hệ thống tự động:
1. Phân đoạn vùng phổi bằng U-Net (`best_unet.keras`)
2. Phân loại bệnh bằng Simplified PneuNet (3-class hoặc 4-class)
3. Hiển thị kết quả với mask màu overlay lên ảnh gốc
4. Hiển thị độ tin cậy (confidence) và nhãn chẩn đoán

**Stack công nghệ:**
- Backend: FastAPI (Python 3.10+)
- Frontend: React.js
- Chạy local: Backend port 8000, Frontend port 3000
- KHÔNG dùng Docker (chạy thẳng trên máy Windows)
- KHÔNG có IoT, KHÔNG có MongoDB (dùng in-memory cho lịch sử)

---

## 2. CẤU TRÚC THƯ MỤC

```
KHOA_LUAN/
│
├── web_platform/                  ← Thư mục gốc web app (TẠO MỚI)
│   │
│   ├── PROJECT_SPEC.md            ← File này — để AI đọc
│   │
│   ├── backend/                   ← FastAPI Python backend
│   │   ├── main.py                ← Entry point, tất cả routes
│   │   ├── inference.py           ← Load model, predict, Grad-CAM
│   │   ├── gradcam.py             ← Grad-CAM implementation
│   │   ├── requirements.txt       ← Dependencies
│   │   ├── venv/                  ← Virtual environment (tự tạo, không commit)
│   │   └── models/                ← Symlink hoặc copy các file .keras
│   │       ├── best_unet.keras
│   │       ├── simplified_pneunet_3class.keras
│   │       └── simplified_pneunet_4class.keras
│   │
│   └── frontend/                  ← React app
│       ├── public/
│       ├── src/
│       │   ├── App.jsx
│       │   ├── main.jsx
│       │   ├── pages/
│       │   │   ├── HomePage.jsx
│       │   │   ├── UploadPage.jsx
│       │   │   ├── ComparePage.jsx
│       │   │   ├── HistoryPage.jsx
│       │   │   └── AboutPage.jsx
│       │   ├── components/
│       │   │   ├── Navbar.jsx
│       │   │   ├── ImageUploader.jsx
│       │   │   ├── ResultDisplay.jsx
│       │   │   ├── SliderOverlay.jsx
│       │   │   ├── DiagnosisCard.jsx
│       │   │   └── ConfidenceBar.jsx
│       │   └── api/
│       │       └── client.js      ← Axios calls đến backend
│       └── package.json
│
└── models/                        ← Thư mục models gốc (ĐÃ CÓ SẴN)
    ├── best_unet.keras
    ├── simplified_pneunet_3class.keras   ← tên thật: simplified_pneunet_pneunet_3class.keras
    └── simplified_pneunet_4class.keras   ← tên thật: simplified_pneunet_pneunet_4class.keras
```

> **LƯU Ý TÊN FILE MODEL THẬT:**
> - `simplified_pneunet_pneunet_3class.keras` (có thể khác — kiểm tra thực tế)
> - `simplified_pneunet_pneunet_4class.keras` (có thể khác — kiểm tra thực tế)
> - Trong code, dùng tên biến ngắn: `unet`, `pneunet_3class`, `pneunet_4class`

---

## 3. CÁC MODEL VÀ PIPELINE XỬ LÝ

### 3.1 Pipeline chính (theo thứ tự)

```
Ảnh X-ray gốc (JPEG/PNG)
        ↓
[BƯỚC 1] best_unet.keras
        → Phân đoạn vùng phổi
        → Output: binary mask (0/1), shape (H, W, 1)
        ↓
[BƯỚC 2] Tạo colored mask overlay
        → Dùng màu theo class (xem Bảng Màu bên dưới)
        → cv2.addWeighted hoặc PIL để blend mask + ảnh gốc
        ↓
[BƯỚC 3] simplified_pneunet_3class.keras HOẶC simplified_pneunet_4class.keras
        → Phân loại bệnh từ ảnh đã segment
        → Output: probabilities array
        ↓
[BƯỚC 4] Trả về kết quả:
        - Ảnh gốc
        - Ảnh overlay (mask màu đè lên ảnh gốc)
        - Nhãn class (tên bệnh)
        - Confidence (% của class cao nhất)
        - Mảng probability từng class
        - Grad-CAM heatmap (nếu có)
```

### 3.2 Thông số kỹ thuật model

| Model | Input Shape | Output |
|-------|-------------|--------|
| `best_unet.keras` | (1, 256, 256, 1) grayscale | Binary mask (256, 256, 1) |
| `simplified_pneunet_3class.keras` | (1, 224, 224, 1) grayscale | Softmax 3 classes |
| `simplified_pneunet_4class.keras` | (1, 224, 224, 1) grayscale | Softmax 4 classes |

> **QUAN TRỌNG:** Input shape là grayscale (1 channel), KHÔNG phải RGB (3 channels).
> Khi load ảnh: convert sang grayscale, resize, normalize về [0, 1].

### 3.3 Mapping nhãn class

**3-class mode:**
```python
CLASS_NAMES_3 = {
    0: "COVID-19",
    1: "Pneumonia",    # Viêm phổi chung (gộp bacterial + viral)
    2: "Normal"        # Bình thường
}
```

**4-class mode:**
```python
CLASS_NAMES_4 = {
    0: "COVID-19",
    1: "Bacterial Pneumonia",   # Viêm phổi vi khuẩn
    2: "Viral Pneumonia",       # Viêm phổi virus
    3: "Normal"                 # Bình thường
}
```

> **Kiểm tra lại thứ tự class** với file training của bạn — thứ tự trên là dự kiến theo alphabet của Keras ImageDataGenerator.

---

## 4. BẢNG MÀU MASK THEO CLASS

Áp dụng màu mask lên vùng phổi đã segment, tô màu theo kết quả classification:

| Class | Màu nền HEX | Màu chữ HEX | RGB để vẽ mask | Ý nghĩa |
|-------|-------------|-------------|----------------|---------|
| **Normal** | `#A0DCBA` | `#0A5C36` | `(160, 220, 185)` | Xanh mint — phổi lành |
| **COVID-19** | `#96CDF0` | `#0369A1` | `(150, 205, 240)` | Xanh dương nhạt — tổn thương cấp |
| **Pneumonia** *(3-class)* | `#D2AAF0` | `#6B21A8` | `(210, 170, 240)` | Tím pastel — viêm phổi chung |
| **Bacterial** *(4-class)* | `#F0CD8C` | `#B26A00` | `(240, 205, 140)` | Vàng cát — đông đặc vi khuẩn |
| **Viral** *(4-class)* | `#EBAAA5` | `#A51D24` | `(235, 170, 165)` | Đỏ/hồng pastel — kính mờ rải rác |


**Code tạo colored overlay:**
```python
import numpy as np
import cv2

MASK_COLORS_RGB = {
    "Normal":              (226, 246, 236),
    "COVID-19":            (252, 232, 230),
    "Pneumonia":           (254, 243, 214),
    "Bacterial Pneumonia": (224, 242, 254),
    "Viral Pneumonia":     (243, 232, 253),
}

def apply_colored_mask(original_img_rgb, binary_mask, class_name, alpha=0.5):
    """
    original_img_rgb: np.array shape (H, W, 3), dtype uint8
    binary_mask: np.array shape (H, W), values 0 or 1
    class_name: string key từ MASK_COLORS_RGB
    alpha: độ trong suốt mask (0=trong suốt, 1=đục hoàn toàn)
    """
    color = MASK_COLORS_RGB.get(class_name, (200, 200, 200))
    colored_mask = np.zeros_like(original_img_rgb)
    colored_mask[binary_mask > 0.5] = color
    overlay = cv2.addWeighted(original_img_rgb, 1 - alpha, colored_mask, alpha, 0)
    return overlay
```

---

## 5. BACKEND FASTAPI

### 5.1 File `requirements.txt`

```
fastapi
uvicorn[standard]
python-multipart
pillow
numpy
tensorflow
opencv-python
matplotlib
```

### 5.2 API Endpoints

#### `GET /api/health`
```json
Response: { "status": "ok", "models_loaded": true }
```

#### `GET /api/models`
```json
Response: {
  "models": [
    { "id": "pneunet_3class", "name": "Simplified PneuNet (3 Class)", "classes": ["COVID-19", "Pneumonia", "Normal"] },
    { "id": "pneunet_4class", "name": "Simplified PneuNet (4 Class)", "classes": ["COVID-19", "Bacterial Pneumonia", "Viral Pneumonia", "Normal"] }
  ]
}
```

#### `POST /api/predict`
```
Request: multipart/form-data
  - file: ảnh X-ray (JPEG, PNG)
  - model_id: "pneunet_3class" hoặc "pneunet_4class"

Response: {
  "label": "COVID-19",
  "confidence": 0.88,
  "probabilities": {
    "COVID-19": 0.88,
    "Pneumonia": 0.09,
    "Normal": 0.03
  },
  "original_image_b64": "<base64 string>",
  "overlay_image_b64": "<base64 string>",   ← ảnh đã blend mask màu
  "gradcam_image_b64": "<base64 string>",   ← heatmap Grad-CAM
  "model_name": "Simplified PneuNet (3 Class)",
  "inference_time_ms": 350
}
```

#### `GET /api/recent`
```json
Response: {
  "history": [
    {
      "id": "uuid",
      "timestamp": "2024-06-16T14:30:00",
      "filename": "xray_001.jpg",
      "label": "COVID-19",
      "confidence": 0.88,
      "model_id": "pneunet_3class"
    }
  ]
}
```

### 5.3 Code mẫu `inference.py`

```python
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import base64
import time

# ---- Load models một lần khi khởi động ----
MODELS = {}

def load_all_models(model_dir: str):
    global MODELS
    import os
    MODELS["unet"] = tf.keras.models.load_model(os.path.join(model_dir, "best_unet.keras"))
    MODELS["pneunet_3class"] = tf.keras.models.load_model(
        os.path.join(model_dir, "simplified_pneunet_pneunet_3class.keras")
    )
    MODELS["pneunet_4class"] = tf.keras.models.load_model(
        os.path.join(model_dir, "simplified_pneunet_pneunet_4class.keras")
    )
    print("✅ Tất cả models đã load xong!")

# ---- Tiền xử lý ảnh ----
def preprocess_image(img_bytes: bytes, target_size: tuple) -> np.ndarray:
    img = Image.open(io.BytesIO(img_bytes)).convert("L")  # Grayscale
    img = img.resize(target_size)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr[np.newaxis, ..., np.newaxis]  # (1, H, W, 1)
    return arr

# ---- Hàm predict chính ----
def predict(img_bytes: bytes, model_id: str) -> dict:
    start = time.time()

    # Bước 1: U-Net segmentation
    unet_input = preprocess_image(img_bytes, (256, 256))
    mask = MODELS["unet"].predict(unet_input)[0, ..., 0]  # (256, 256)

    # Bước 2: Classification
    clf_input = preprocess_image(img_bytes, (224, 224))
    probs = MODELS[model_id].predict(clf_input)[0]  # array of probabilities

    # Mapping class names
    if model_id == "pneunet_3class":
        class_names = ["COVID-19", "Pneumonia", "Normal"]
    else:
        class_names = ["COVID-19", "Bacterial Pneumonia", "Viral Pneumonia", "Normal"]

    pred_idx = int(np.argmax(probs))
    label = class_names[pred_idx]
    confidence = float(probs[pred_idx])

    # Bước 3: Tạo overlay image
    original_rgb = np.array(
        Image.open(io.BytesIO(img_bytes)).convert("RGB").resize((512, 512))
    )
    mask_resized = (
        np.array(Image.fromarray((mask * 255).astype(np.uint8)).resize((512, 512))) / 255.0
    )
    overlay = apply_colored_mask(original_rgb, mask_resized, label)

    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "label": label,
        "confidence": confidence,
        "probabilities": dict(zip(class_names, probs.tolist())),
        "original_image_b64": to_b64(original_rgb),
        "overlay_image_b64": to_b64(overlay),
        "inference_time_ms": elapsed_ms,
    }

def to_b64(img_array: np.ndarray) -> str:
    pil_img = Image.fromarray(img_array.astype(np.uint8))
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()
```

---

## 6. FRONTEND REACT

### 6.1 Cài đặt

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install axios react-router-dom
```

### 6.2 Cấu trúc routing (`App.jsx`)

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import ComparePage from './pages/ComparePage'
import HistoryPage from './pages/HistoryPage'
import AboutPage from './pages/AboutPage'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

### 6.3 Màu sắc và Design System

**Màu chủ đạo (thiết kế y tế — sạch, tin cậy):**
```css
:root {
  --color-primary:    #0369A1;   /* Xanh dương y tế */
  --color-secondary:  #0A5C36;   /* Xanh mint đậm */
  --color-bg:         #F0F4F8;   /* Nền xám nhạt */
  --color-surface:    #FFFFFF;   /* Card trắng */
  --color-border:     #E2E8F0;
  --color-text:       #1A202C;
  --color-text-muted: #718096;

  /* Màu kết quả theo class */
  --color-normal:     #E2F6EC;
  --color-covid:      #FCE8E6;
  --color-pneumonia:  #FEF3D6;
  --color-bacterial:  #E0F2FE;
  --color-viral:      #F3E8FD;
}
```

**Font:** `Inter` (Google Fonts) — sans-serif, dễ đọc chỉ số y tế.

### 6.4 Các trang cần xây dựng

#### Trang `/` — Home
- Tiêu đề hệ thống + mô tả ngắn
- 3 nút lớn: **Phân loại ảnh** | **So sánh Models** | **Lịch sử**
- Giới thiệu pipeline: U-Net Segment → PneuNet Classify → Kết quả

#### Trang `/upload` — Upload & Phân loại *(TRANG CHÍNH)*

**Bố cục 2 cột (Split Screen):**

```
┌─────────────────────────┬──────────────────────────────┐
│   BẢNG ĐIỀU KHIỂN       │   HIỂN THỊ KẾT QUẢ          │
│                         │                              │
│  [Khu vực kéo thả ảnh]  │  [Slider Overlay]            │
│  ┌─────────────────┐    │  ← kéo để so sánh gốc/mask  │
│  │   📁 Kéo thả   │    │                              │
│  │   hoặc click   │    │  ┌──────┬──────┬──────────┐  │
│  └─────────────────┘    │  │Class │ Conf │ Thiết bị │  │
│                         │  │ Card │ Bar  │ Info     │  │
│  Chế độ phân loại:      │  └──────┴──────┴──────────┘  │
│  ○ 3 Class (Pneumonia)  │                              │
│  ○ 4 Class (Bacterial/  │  [Bảng xác suất từng class]  │
│    Viral)               │                              │
│                         │  [Heatmap Grad-CAM]          │
│  Model: Simplified      │                              │
│  PneuNet (3/4 class)    │  Thời gian xử lý: 350ms     │
│                         │                              │
│  [Nút PHÂN LOẠI]        │                              │
└─────────────────────────┴──────────────────────────────┘
```

**Tính năng Slider Overlay:**
- Một khung ảnh duy nhất
- Thanh trượt ngang chia đôi: bên trái = ảnh gốc, bên phải = ảnh mask overlay
- Kéo trái/phải để so sánh
- Implement bằng CSS clip-path hoặc thư viện `react-compare-slider`

**Thẻ kết quả chẩn đoán:**
```
┌─────────────────────────────┐
│  Thẻ Chẩn Đoán              │
│  ┌───────────────────────┐  │
│  │      COVID-19         │  │  ← Màu nền theo class (#FCE8E6)
│  │  (chữ to, màu đậm)   │  │  ← Chữ màu #A51D24
│  └───────────────────────┘  │
│                             │
│  Độ Tin Cậy: 88%            │
│  ████████░░  (progress bar) │
└─────────────────────────────┘
```

#### Trang `/compare` — So sánh 3-class vs 4-class
- Upload 1 ảnh, chạy cả 2 model (3-class và 4-class) song song
- Hiển thị kết quả song song để so sánh
- Bảng: Model | Prediction | Confidence | Inference Time
- 2 overlay image cạnh nhau

#### Trang `/history` — Lịch sử
- Lấy từ `GET /api/recent`
- Bảng: Thời gian | File | Model | Kết quả | Confidence
- Click hàng → mở modal xem lại ảnh overlay

#### Trang `/about` — Giới thiệu
- Mô tả Simplified PneuNet (ResNet18 + Transformer Encoder × 3)
- Mô tả U-Net segmentation
- Hướng dẫn sử dụng hệ thống
- Thông tin khóa luận

---

## 7. CHI TIẾT TÍNH NĂNG SLIDER OVERLAY

Tính năng quan trọng nhất của UI, phân biệt app này với các demo thông thường.

**Cách implement với `react-compare-slider`:**
```bash
npm install react-compare-image
```

```jsx
import ReactCompareImage from 'react-compare-image'

<ReactCompareImage
  leftImage={`data:image/jpeg;base64,${result.original_image_b64}`}
  rightImage={`data:image/jpeg;base64,${result.overlay_image_b64}`}
  leftImageLabel="Ảnh gốc"
  rightImageLabel="Phân vùng phổi"
  sliderLineColor="#0369A1"
/>
```

Hoặc implement thuần CSS nếu không muốn thêm thư viện (dùng CSS clip-path + mouse event).

---

## 8. LUỒNG NGƯỜI DÙNG (USER FLOW)

```
Người dùng vào web
        ↓
Trang Home — đọc giới thiệu
        ↓
Nhấn "Phân loại ảnh" → /upload
        ↓
Kéo thả hoặc click upload ảnh X-ray
        ↓
Chọn chế độ: 3-class hoặc 4-class
        ↓
Nhấn nút "PHÂN LOẠI"
        ↓
Loading spinner (trong lúc chờ API)
        ↓
Hiển thị kết quả:
  - Slider overlay (kéo để so sánh)
  - Thẻ chẩn đoán màu theo class
  - Progress bar confidence
  - Bảng xác suất từng class
  - Heatmap Grad-CAM
  - Thời gian xử lý
        ↓
(Tùy chọn) Nhấn "So sánh với model kia" → /compare
        ↓
(Tùy chọn) Xem lại lịch sử → /history
```

---

## 9. XỬ LÝ LỖI VÀ TRẠNG THÁI

### Backend cần handle:
- File upload không phải ảnh → 400 Bad Request
- Model chưa load xong → 503 Service Unavailable
- Ảnh quá nhỏ (< 50x50) → 400 Bad Request với message rõ ràng

### Frontend cần handle:
- **Loading state:** Spinner + text "Đang phân tích ảnh..." khi chờ API
- **Error state:** Alert đỏ với message lỗi từ API
- **Empty state:** Khu vực kéo thả khi chưa có ảnh
- **Success state:** Kết quả đầy đủ

---

## 10. THỨ TỰ BUILD (ƯU TIÊN)

```
Ngày 1-2:  Setup backend + load models thành công
           → Test: python test_models.py (thấy ✅ là OK)

Ngày 3-4:  Viết POST /api/predict (chưa cần Grad-CAM)
           → Test bằng Postman hoặc http://localhost:8000/docs

Ngày 5:    Tích hợp Grad-CAM vào /api/predict

Ngày 6-7:  Setup React + trang /upload cơ bản
           → Kết nối được với API, thấy kết quả text là OK

Ngày 8-9:  Implement Slider Overlay + DiagnosisCard với màu đúng

Ngày 10:   Trang /compare

Ngày 11:   Trang /history + /about

Ngày 12-13: Bug fix, polish UI, test end-to-end

Ngày 14:   Buffer + demo thử với ảnh X-ray thật
```

---

## 11. LỆNH CHẠY DỰ ÁN

### Khởi động Backend:
```bash
cd KHOA_LUAN/web_platform/backend
venv\Scripts\activate          # Windows
uvicorn main:app --reload --port 8000
```

### Khởi động Frontend:
```bash
cd KHOA_LUAN/web_platform/frontend
npm run dev
# Mở trình duyệt: http://localhost:3000
```

### API Documentation tự động:
```
http://localhost:8000/docs      ← Swagger UI, test API trực tiếp tại đây
```

---

## 12. LƯU Ý QUAN TRỌNG CHO AI VIBE CODING

1. **Models là grayscale** — KHÔNG convert sang RGB khi đưa vào model
2. **U-Net chạy trước** (256×256) → **PneuNet chạy sau** (224×224) — 2 bước riêng biệt
3. **Màu mask phụ thuộc vào kết quả classification**, không phải U-Net
4. **Không dùng Docker** — chạy thẳng trên Windows với venv
5. **CORS đã cấu hình** — backend cho phép frontend ở port 3000
6. **In-memory history** — không cần database, dùng Python list trong RAM
7. **Model name hiển thị cho user luôn là "Simplified PneuNet"** — không hiển thị tên kỹ thuật
8. **Khi load models** — load một lần khi server khởi động, lưu vào biến global, không load lại mỗi request
9. **Thứ tự class** — kiểm tra lại với code training thực tế trước khi hardcode
10. **File models** nằm ở `KHOA_LUAN/models/` — backend cần đường dẫn tuyệt đối hoặc relative đúng

---

*Cập nhật lần cuối: 16/06/2025 — phiên bản dành cho build local Windows, không IoT, không Docker.*
