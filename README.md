# 🫁 AI-LungCare — Hỗ trợ chẩn đoán X-quang phổi bằng Deep Learning & XAI

<p align="center">
  <img src="https://img.shields.io/badge/Task-Lung%20X--Ray%20Classification-blue" />
  <img src="https://img.shields.io/badge/Segmentation-U--Net-9cf" />
  <img src="https://img.shields.io/badge/Classifier-Simplified%20PneuNet%20(CNN--ViT)-orange" />
  <img src="https://img.shields.io/badge/XAI-ScoreCAM%20Variant%20B-yellow" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-green" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb" />
  <img src="https://img.shields.io/badge/Accuracy%203--class-97.07%25-success" />
  <img src="https://img.shields.io/badge/Accuracy%204--class-94.01%25-success" />
  <img src="https://img.shields.io/badge/License-MIT-lightgrey" />
</p>

Khóa luận tốt nghiệp — **Khoa Điện tử - Viễn thông, Đại học Khoa học Tự nhiên TP.HCM**

---

# 🇬🇧 English Version

## Overview

**AI-LungCare** is an end-to-end web platform for automated chest X-ray analysis, built as a graduation thesis project. The system combines three AI components in a sequential pipeline:

1. **U-Net** — Lung region segmentation (256×256 binary mask)
2. **Simplified PneuNet** — Hybrid CNN-Transformer disease classification (224×224)
3. **ScoreCAM Variant B** — Gradient-free explainability heatmap (XAI)

The platform supports two classification modes:
- **3-class:** COVID-19 · Normal · Pneumonia
- **4-class:** Bacterial Pneumonia · COVID-19 · Normal · Viral Pneumonia

A full-stack web application (React + FastAPI) allows doctors to upload X-ray images and receive real-time diagnostic results with visual explanations.

## Objectives

- Build a complete, deployment-ready pipeline from raw X-ray to structured diagnosis with XAI explanation.
- Train a custom Hybrid CNN-Transformer (Simplified PneuNet) that balances accuracy and efficiency on medical X-ray data.
- Apply U-Net lung segmentation as a preprocessing step to reduce spurious background features and improve model focus on the lung region.
- Validate the benefit of segmentation using an ablation study with paired ScoreCAM visualizations.
- Develop an interactive web application for clinical demonstration and real-time inference.

## System Architecture

### AI Pipeline (4 steps per inference)

| Step | Stage | Description |
|---|---|---|
| 1 | Upload X-ray | Accept JPEG/PNG. Read as grayscale. |
| 2 | U-Net Segment | Predict binary lung mask (256×256) → adaptive threshold → morphological post-processing → validity check (lung ratio 3–70%) |
| 3 | PneuNet Classify | Resize segmented region to 224×224 → CLAHE → normalize [-1,1] → Simplified PneuNet → softmax probabilities |
| 4 | ScoreCAM XAI | Generate perturbation-based heatmap from `l4b2_r2` feature maps (7×7×512) → Top-K=128 → overlay on original image |

### Simplified PneuNet Architecture

Inspired by PneuNet (Wang et al., 2023), with modifications for dataset scale:
- **Backbone:** ResNet18 (from scratch, no pretrained weights)
- **Tokenization:** 512 conv channels → 512 tokens, embed_dim = 80
- **Transformer:** 3 Transformer Encoder blocks (Multi-Head Attention + FFN)
- **Head:** GlobalAveragePooling → Dense → Softmax
- **Parameters:** ~11.5M
- **Input:** 224×224 (grayscale, normalized to [-1, 1])

Compared to original PneuNet: keeps 7×7 spatial resolution (no extra MaxPool), uses 3 instead of 6 Transformer blocks, and replaces Flatten with GlobalAveragePooling to reduce parameters.

## Training Pipeline

### Dataset

Data was collected from **8 public sources**, deduplicated twice using perceptual hashing (pHash, threshold=8), and balanced:

| Source | COVID-19 | Normal | Bacterial Pneumonia | Viral Pneumonia |
|---|---|---|---|---|
| COVID-19 Radiography Database | 3,616 | 3,500 | — | 1,345 |
| VinBigData Dataset | — | 3,500 | — | — |
| COVIDx CXR-4 | 3,500 | — | — | — |
| Chest Xrays (bacterial/viral/normal) | — | — | 2,238 | 1,207 |
| Chest X-Ray Images (Pneumonia) | — | — | 2,780 | 1,493 |
| Covid-19 Image Dataset | — | — | — | 90 |
| 3 kinds of Pneumonia | — | — | 3,001 | 1,656 |
| ChestX6 Multi-Class X-ray | — | — | 3,000 | 3,013 |
| **After dedup round 1** | | | | **18,216 images** |
| **After dedup round 2** | | | | **24,622 images** |

Final split into **dataset_main (3-class)** and **dataset_sub (4-class)** for model training.

### Models Trained

| Model | Task | Training |
|---|---|---|
| U-Net | Lung segmentation | Montgomery + Shenzhen + COVID-19 Radiography masks |
| Simplified PneuNet (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| EfficientNet-B0 (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| ResNet50 (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| VGG19 (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| Simplified PneuNet (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |
| EfficientNet-B0 (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |
| ResNet50 (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |
| VGG19 (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |

### Training Techniques

- **Augmentation:** Mixup (`α=0.2`) + CutMix (`α=1.0`), `MIX_PROB=0.5` per batch
- **Photometric augment:** gamma, brightness/contrast, Gaussian noise, JPEG compression — applied only inside lung region (mask-guided)
- **LungFocusLoss:** Penalizes feature activation outside the lung area. Applied in EfficientNet-B0 and ResNet50.
- **Class weighting:** `compute_class_weight('balanced', ...)` to handle imbalance
- **CLAHE preprocessing:** `clipLimit=2.0, tileGridSize=(8,8)` — matches inference preprocessing exactly
- **Optimizer:** AdamW (`lr=5e-5`, `weight_decay=1e-4`)
- **Callbacks:** `DynamicEarlyStopping` (patience_early=25, patience_late=10, switch=epoch 100), `ReduceLROnPlateau` (patience=8), `SaveBaseModelCallback` (monitor=`val_auc`)

### U-Net Training

- **Architecture:** Standard U-Net (Ronneberger et al., 2015): filters 64→128→256→512→1024
- **Loss:** Combined Dice Loss + Binary Crossentropy (`bce_weight=0.5`)
- **Metrics:** IoU Score, Dice Coefficient
- **Augmentation:** Albumentations — HorizontalFlip, ShiftScaleRotate, RandomBrightnessContrast
- **Input:** 256×256 grayscale
- **Target:** Val IoU ≥ 0.90, Val Dice ≥ 0.92

## Model Performance

### Simplified PneuNet (Final Model Deployed)

| Metric | 3-Class | 4-Class |
|---|---|---|
| Accuracy | **97.07%** | **94.01%** |
| F1-Score (Macro) | **97.07%** | **94.01%** |
| AUC-ROC | **0.9973** | **0.9941** |
| Specificity | **98.53%** | **98.03%** |
| Parameters | ~11.5M | ~11.5M |
| Inference (CPU) | 83.87 ± 1.99 ms | 84.23 ± 1.89 ms |

### 4-Model Comparison (Test Set)

All models evaluated on the same test set using:
- Accuracy, Precision, Recall, F1-Score (Macro), Specificity, AUC-ROC
- Inference time: warm-up 20 runs, measured 200 runs, trimmed 5–95th percentile, reported as **median ± std**
- Confusion matrices (raw + normalized), per-class metrics, ROC/PR curves, confidence distribution, error analysis

## Explainability (XAI) — ScoreCAM Variant B

**Why ScoreCAM instead of GradCAM:**
- Gradient-free → no vanishing gradient issue in Transformer layers
- Perturbation-based → measures direct channel contribution to prediction confidence
- Works on any CNN backbone regardless of attention structure

**Algorithm (Wang et al., 2020):**
1. Extract feature maps from `l4b2_r2` (last ResNet conv layer before Transformer): shape `(7, 7, 512)`
2. Select Top-K=128 channels by activation std (Variant B optimization)
3. For each channel: upsample activation to 224×224, normalize to [0,1]
4. Masked input = `img × mask_c` (zero baseline)
5. CIC = `forward(masked)[pred_class] − forward(zeros)[pred_class]`
6. `weight[c] = softmax(CIC)[c]`
7. Final heatmap = `Σ_c weight[c] × relu(conv_out[:,:,c])`, upsampled → INFERNO colormap

**Speed:** ~5–10s per image (CPU). Full SS-CAM (512 channels × 20 Gaussian noise samples) would take ~910s — not suitable for web serving.

## Web Application

### Backend (FastAPI)

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server health + model status + DB stats |
| `/api/time` | GET | Server timestamp (UTC+7) |
| `/api/models` | GET | Available classification models |
| `/api/predict` | POST | Main inference: upload X-ray → full pipeline → result + images |
| `/api/recent` | GET | Prediction history (no base64, with `image_urls`) |
| `/api/history/{id}` | GET | Single record detail |
| `/api/history/{id}` | DELETE | Delete record + image files |
| `/api/image/{id}/{type}` | GET | Get image as base64 (backward compat) |
| `/uploads/<filename>` | GET | Static image serving (direct URL) |
| `/api/view/{id}` | GET | HTML debug view |

**Response from `/api/predict`:**

| Field | Description |
|---|---|
| `label` | Predicted diagnosis |
| `confidence` | Softmax confidence (0–1) |
| `probabilities` | Per-class probabilities dict |
| `inference_time_ms` | Model runtime (ms) |
| `original_image_b64` | Original X-ray (base64 JPEG) |
| `segmented_image_b64` | After U-Net segmentation (base64 JPEG) |
| `overlay_image_b64` | Colored lung mask overlay (base64 JPEG) |
| `scorecam_image_b64` | ScoreCAM heatmap (base64 JPEG) |
| `image_urls` | 4 direct image URLs (no relay needed) |
| `segment_info` | lung_ratio_pct, threshold, mask_valid |
| `uncertainty_info` | entropy, is_overconfident flag |

### Frontend (React + Vite)

| Page | Route | Description |
|---|---|---|
| HomePage | `/` | System overview, pipeline steps, model metrics, tech stack |
| UploadPage | `/upload` | Drag-and-drop X-ray upload, model selection, result display with 4 images + probability bars |
| HistoryPage | `/history` | Paginated diagnosis history, filterable by model |
| AboutPage | `/about` | System description, model specs, dataset info, disclaimer |

## Project Structure

```
├── Code_train_model/
│   └── test3/
│       ├── locdataset.txt                         # Deduplication with pHash
│       ├── train_unet.txt                         # U-Net training code
│       ├── efficientnetB0 3class_fix mixup mixcut.txt   # EfficientNet-B0 3-class
│       ├── efficientnetB0 4class_fix mixup mixcut.txt   # EfficientNet-B0 4-class
│       ├── resnet50 3class_fix mixup mixcut.txt         # ResNet50 3-class
│       ├── resnet50 4class_fix mixup mixcut.txt         # ResNet50 4-class
│       ├── vgg19 3class_fix mixup mixcut.txt            # VGG19 3-class
│       ├── vgg19 4class_fix mixup mixcut.txt            # VGG19 4-class
│       ├── simplified pneunet 3class_fix mixup mixcut.txt  # PneuNet 3-class
│       ├── simplified pneunet 4class_fix mixup mixcut.txt  # PneuNet 4-class
│       ├── danh gia 4 model fix mixup mixcut.txt        # Model comparison & evaluation
│       ├── scorecamlime_fixpreprocessing.txt            # ScoreCAM + LIME XAI ablation
│       └── u-net thực thi đầy đủ.txt                   # Full U-Net implementation
│
└── web_platform/
    ├── backend/
    │   ├── main.py           # FastAPI app, routes, CORS, static files
    │   ├── inference.py      # U-Net segment → PneuNet classify → ScoreCAM pipeline
    │   ├── scorecam.py       # ScoreCAM Variant B implementation
    │   ├── database.py       # SQLAlchemy Core, SQLite, CRUD operations
    │   ├── requirements.txt  # Python dependencies
    │   └── models/           # .keras model files (not in repo — see Usage)
    │       ├── best_unet.keras
    │       ├── simplified_pneunet_pneunet_3class.keras
    │       └── simplified_pneunet_pneunet_4class.keras
    │
    └── frontend/
        ├── src/
        │   ├── pages/
        │   │   ├── HomePage.jsx    # Landing: pipeline, metrics, tech stack
        │   │   ├── UploadPage.jsx  # Upload + result view
        │   │   ├── HistoryPage.jsx # Diagnosis history
        │   │   └── AboutPage.jsx   # System info, dataset sources
        │   ├── components/
        │   │   └── DiagnosisCard.jsx  # Result display component
        │   ├── api/              # Axios API calls
        │   ├── hooks/            # React custom hooks
        │   └── styles/           # CSS variables, global styles
        ├── package.json
        └── vite.config.js
```

## Requirements

### Backend

```
Python 3.12+
fastapi
uvicorn[standard]
python-multipart
pillow
numpy
tensorflow (2.21 / Keras 3)
opencv-python
matplotlib
scikit-image
sqlalchemy
pytz
```

### Frontend

```
Node.js 18+
React 18
Vite
React Router DOM
```

### Training (Google Colab / Kaggle)

```
tensorflow / keras
scikit-learn
opencv-python
albumentations
imagehash
seaborn, matplotlib, pandas
```

## Usage

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### 2. Download trained models

Download the three `.keras` model files and place them in `web_platform/backend/models/`:

```
models/
├── best_unet.keras
├── simplified_pneunet_pneunet_3class.keras
└── simplified_pneunet_pneunet_4class.keras
```

> 💡 Model files are not included in the repository due to size (~400+ MB). Contact the author or retrain using the code in `Code_train_model/`.

### 3. Start the Backend

```bash
cd web_platform/backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

The API will be available at `http://localhost:8000`. Swagger docs at `http://localhost:8000/docs`.

### 4. Start the Frontend

```bash
cd web_platform/frontend
npm install
npm run dev
```

The web app will be available at `http://localhost:5173`.

### 5. Upload and Analyze

1. Navigate to `http://localhost:5173/upload`
2. Select a classification model (3-class or 4-class)
3. Drag and drop or click to upload a chest X-ray (JPEG/PNG)
4. View the result: diagnosis label, confidence, probability bars, and 4 images (original, segmented, overlay, ScoreCAM heatmap)

### 6. Retrain models (optional)

All training code is in `Code_train_model/test3/`. The `.txt` files contain Python/Keras code intended to run on **Kaggle GPU** kernels. Rename them to `.py` or paste into Kaggle notebooks to run.

- **Dataset deduplication:** `locdataset.txt`
- **U-Net training:** `train_unet.txt`
- **Classification model training:** `simplified pneunet 3class_fix mixup mixcut.txt` (and equivalent files for other models)
- **Model evaluation & comparison:** `danh gia 4 model fix mixup mixcut.txt`
- **XAI ablation study:** `scorecamlime_fixpreprocessing.txt`

## Limitations & Disclaimer

> ⚠️ **AI-LungCare is a research/demonstration tool and does NOT replace clinical judgment.** Results must be validated by a qualified physician before any clinical decision.

**Current limitations:**

- Models trained on public datasets — domain shift may reduce accuracy on other X-ray sources/scanners.
- ScoreCAM uses Top-K=128 channels for speed; full 512-channel ScoreCAM would give higher heatmap fidelity.
- U-Net mask validation (lung ratio 3–70%) may fail on unusual X-ray orientations or severe pathology.
- No authentication or access control in the current web implementation.

**Future directions:**

- Add data from local Vietnamese hospital sources to reduce domain shift.
- Implement full SS-CAM for server with GPU support.
- Extend to PA vs AP view classification and other lung diseases.
- Add DICOM native support and PACS integration.
- Evaluate on held-out external test sets.

---

# 🇻🇳 Bản Tiếng Việt

Khóa luận tốt nghiệp — **Khoa Công nghệ Thông tin, Đại học Khoa học Tự nhiên TP.HCM**

## Giới thiệu

**AI-LungCare** là nền tảng web phân tích ảnh X-quang ngực tự động, được xây dựng như đề tài khóa luận tốt nghiệp. Hệ thống kết hợp ba thành phần AI trong một pipeline tuần tự:

1. **U-Net** — Phân đoạn vùng phổi (256×256 binary mask)
2. **Simplified PneuNet** — Phân loại bệnh bằng mạng Hybrid CNN-Transformer (224×224)
3. **ScoreCAM Variant B** — Heatmap giải thích kết quả không cần gradient (XAI)

Hệ thống hỗ trợ hai chế độ phân loại:
- **3 nhãn:** COVID-19 · Normal · Pneumonia (Viêm phổi)
- **4 nhãn:** Bacterial Pneumonia (Vi khuẩn) · COVID-19 · Normal · Viral Pneumonia (Virus)

Ứng dụng web full-stack (React + FastAPI) cho phép bác sĩ tải ảnh X-quang lên và nhận kết quả chẩn đoán theo thời gian thực kèm giải thích trực quan.

## Mục tiêu đề tài

- Xây dựng pipeline hoàn chỉnh, sẵn sàng triển khai từ ảnh X-quang thô đến kết quả chẩn đoán có giải thích XAI.
- Huấn luyện mạng Hybrid CNN-Transformer tùy chỉnh (Simplified PneuNet) cân bằng giữa độ chính xác và hiệu suất trên dữ liệu X-quang y tế.
- Áp dụng phân đoạn phổi bằng U-Net như bước tiền xử lý để giảm nhiễu từ vùng nền và tăng sự tập trung của model vào vùng phổi.
- Kiểm chứng lợi ích của phân đoạn bằng nghiên cứu ablation với ScoreCAM so sánh cặp (có/không có segment).
- Phát triển ứng dụng web tương tác phục vụ demo lâm sàng và inference thời gian thực.

## Kiến trúc hệ thống

### Pipeline AI (4 bước mỗi lần inference)

| Bước | Giai đoạn | Mô tả |
|---|---|---|
| 1 | Upload X-quang | Chấp nhận JPEG/PNG. Đọc dạng grayscale. |
| 2 | U-Net Segment | Dự đoán binary lung mask (256×256) → adaptive threshold → xử lý hậu kỳ hình thái học → kiểm tra tính hợp lệ (lung ratio 3–70%) |
| 3 | PneuNet Classify | Resize vùng phổi đã tách về 224×224 → CLAHE → normalize [-1,1] → Simplified PneuNet → xác suất softmax |
| 4 | ScoreCAM XAI | Sinh heatmap perturbation-based từ feature maps `l4b2_r2` (7×7×512) → Top-K=128 → overlay lên ảnh gốc |

### Kiến trúc Simplified PneuNet

Lấy cảm hứng từ PneuNet (Wang et al., 2023), có điều chỉnh cho quy mô dataset của đề tài:
- **Backbone:** ResNet18 (từ đầu, không dùng pretrained)
- **Tokenization:** 512 conv channels → 512 token, embed_dim = 80
- **Transformer:** 3 Transformer Encoder blocks (Multi-Head Attention + FFN)
- **Head:** GlobalAveragePooling → Dense → Softmax
- **Số tham số:** ~11.5M
- **Đầu vào:** 224×224 (grayscale, normalize về [-1, 1])

So với PneuNet gốc: giữ spatial resolution 7×7 (không MaxPool thêm), dùng 3 thay vì 6 Transformer blocks, thay Flatten bằng GlobalAveragePooling để giảm tham số.

## Pipeline huấn luyện

### Dataset

Dữ liệu thu thập từ **8 nguồn công khai**, lọc trùng 2 lần bằng perceptual hashing (pHash, threshold=8), và cân bằng lại:

| Nguồn | COVID-19 | Normal | Bacterial Pneumonia | Viral Pneumonia |
|---|---|---|---|---|
| COVID-19 Radiography Database | 3.616 | 3.500 | — | 1.345 |
| VinBigData Dataset | — | 3.500 | — | — |
| COVIDx CXR-4 | 3.500 | — | — | — |
| Chest Xrays (bacterial/viral/normal) | — | — | 2.238 | 1.207 |
| Chest X-Ray Images (Pneumonia) | — | — | 2.780 | 1.493 |
| Covid-19 Image Dataset | — | — | — | 90 |
| 3 kinds of Pneumonia | — | — | 3.001 | 1.656 |
| ChestX6 Multi-Class X-ray | — | — | 3.000 | 3.013 |
| **Sau lọc lần 1** | | | | **18.216 ảnh** |
| **Sau lọc lần 2 (tập raw cuối)** | | | | **24.622 ảnh** |

Tập cuối được chia thành **dataset_main (3-class)** và **dataset_sub (4-class)** cho huấn luyện model.

### Các model đã huấn luyện

| Model | Bài toán | Dữ liệu |
|---|---|---|
| U-Net | Phân đoạn phổi | Montgomery + Shenzhen + COVID-19 Radiography masks |
| Simplified PneuNet (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| EfficientNet-B0 (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| ResNet50 (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| VGG19 (3-class) | COVID-19 / Normal / Pneumonia | dataset_main |
| Simplified PneuNet (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |
| EfficientNet-B0 (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |
| ResNet50 (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |
| VGG19 (4-class) | Bacterial / COVID-19 / Normal / Viral | dataset_sub |

### Kỹ thuật huấn luyện

- **Augmentation:** Mixup (`α=0.2`) + CutMix (`α=1.0`), `MIX_PROB=0.5` mỗi batch — chống shortcut learning và source-confounding
- **Photometric augment:** gamma, brightness/contrast, Gaussian noise, JPEG compression — chỉ áp trong vùng phổi (mask-guided)
- **LungFocusLoss:** Phạt model khi chú ý ra ngoài vùng phổi. Áp dụng cho EfficientNet-B0 và ResNet50.
- **Class weighting:** `compute_class_weight('balanced', ...)` xử lý mất cân bằng class
- **Tiền xử lý CLAHE:** `clipLimit=2.0, tileGridSize=(8,8)` — khớp hoàn toàn với preprocessing lúc inference
- **Optimizer:** AdamW (`lr=5e-5`, `weight_decay=1e-4`)
- **Callbacks:** `DynamicEarlyStopping` (patience_early=25, patience_late=10, switch=epoch 100), `ReduceLROnPlateau` (patience=8), `SaveBaseModelCallback` (monitor=`val_auc`)

### Huấn luyện U-Net

- **Kiến trúc:** U-Net chuẩn (Ronneberger et al., 2015): filters 64→128→256→512→1024
- **Loss:** Kết hợp Dice Loss + Binary Crossentropy (`bce_weight=0.5`)
- **Metrics:** IoU Score, Dice Coefficient
- **Augmentation:** Albumentations — HorizontalFlip, ShiftScaleRotate, RandomBrightnessContrast
- **Đầu vào:** 256×256 grayscale
- **Mục tiêu:** Val IoU ≥ 0.90, Val Dice ≥ 0.92

## Kết quả

### Simplified PneuNet (Model triển khai)

| Metric | 3-Class | 4-Class |
|---|---|---|
| Accuracy | **97,07%** | **94,01%** |
| F1-Score (Macro) | **97,07%** | **94,01%** |
| AUC-ROC | **0,9973** | **0,9941** |
| Specificity | **98,53%** | **98,03%** |
| Số tham số | ~11,5M | ~11,5M |
| Inference (CPU) | 83,87 ± 1,99 ms | 84,23 ± 1,89 ms |

### So sánh 4 model (trên test set)

Tất cả model được đánh giá trên cùng test set với:
- Accuracy, Precision, Recall, F1-Score (Macro), Specificity, AUC-ROC
- Thời gian inference: warm-up 20 lần, đo 200 lần, loại outlier 5–95th percentile, báo cáo **median ± std**
- Confusion matrices (raw + normalized), per-class metrics, ROC/PR curves, confidence distribution, error analysis

## Giải thích kết quả (XAI) — ScoreCAM Variant B

**Tại sao chọn ScoreCAM thay vì GradCAM:**
- Không cần gradient → không có vanishing gradient qua Transformer layers
- Perturbation-based → đo trực tiếp ảnh hưởng của từng channel đến confidence dự đoán
- Hoạt động với bất kỳ CNN backbone bất kể cấu trúc attention

**Thuật toán (Wang et al., 2020):**
1. Lấy feature maps từ `l4b2_r2` (lớp conv cuối ResNet trước Transformer): shape `(7, 7, 512)`
2. Chọn Top-K=128 channels theo activation std (tối ưu Variant B)
3. Với mỗi channel: upsample activation lên 224×224, normalize về [0,1]
4. Masked input = `img × mask_c` (zero baseline)
5. CIC = `forward(masked)[pred_class] − forward(zeros)[pred_class]`
6. `weight[c] = softmax(CIC)[c]`
7. Heatmap = `Σ_c weight[c] × relu(conv_out[:,:,c])`, upsample → colormap INFERNO

**Tốc độ:** ~5–10s/ảnh (CPU). Full SS-CAM (512 channels × 20 mẫu Gaussian noise) mất ~910s — không phù hợp cho web serving.

## Ứng dụng Web

### Backend (FastAPI)

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/health` | GET | Trạng thái server + model + thống kê DB |
| `/api/time` | GET | Giờ server hiện tại (UTC+7) |
| `/api/models` | GET | Danh sách model phân loại |
| `/api/predict` | POST | Inference chính: upload X-ray → pipeline đầy đủ → kết quả + ảnh |
| `/api/recent` | GET | Lịch sử chẩn đoán (không có base64, có `image_urls`) |
| `/api/history/{id}` | GET | Chi tiết 1 record |
| `/api/history/{id}` | DELETE | Xóa record và file ảnh |
| `/api/image/{id}/{type}` | GET | Lấy ảnh dạng base64 (backward compat) |
| `/uploads/<filename>` | GET | Serve ảnh trực tiếp qua URL |
| `/api/view/{id}` | GET | HTML debug view |

### Frontend (React + Vite)

| Trang | Route | Mô tả |
|---|---|---|
| Trang chủ | `/` | Tổng quan hệ thống, các bước pipeline, chỉ số model, tech stack |
| Upload | `/upload` | Kéo thả ảnh X-quang, chọn model, xem kết quả với 4 ảnh + thanh xác suất |
| Lịch sử | `/history` | Lịch sử chẩn đoán phân trang, lọc theo model |
| Giới thiệu | `/about` | Mô tả hệ thống, thông số model, nguồn dataset, disclaimer |

## Cấu trúc thư mục

```
├── Code_train_model/
│   └── test3/
│       ├── locdataset.txt                                  # Lọc trùng bằng pHash
│       ├── train_unet.txt                                  # Huấn luyện U-Net
│       ├── efficientnetB0 3class_fix mixup mixcut.txt      # EfficientNet-B0 3-class
│       ├── efficientnetB0 4class_fix mixup mixcut.txt      # EfficientNet-B0 4-class
│       ├── resnet50 3class_fix mixup mixcut.txt            # ResNet50 3-class
│       ├── resnet50 4class_fix mixup mixcut.txt            # ResNet50 4-class
│       ├── vgg19 3class_fix mixup mixcut.txt               # VGG19 3-class
│       ├── vgg19 4class_fix mixup mixcut.txt               # VGG19 4-class
│       ├── simplified pneunet 3class_fix mixup mixcut.txt  # PneuNet 3-class
│       ├── simplified pneunet 4class_fix mixup mixcut.txt  # PneuNet 4-class
│       ├── danh gia 4 model fix mixup mixcut.txt           # So sánh và đánh giá model
│       ├── scorecamlime_fixpreprocessing.txt               # Ablation study XAI
│       └── u-net thực thi đầy đủ.txt                      # U-Net triển khai đầy đủ
│
└── web_platform/
    ├── backend/
    │   ├── main.py           # FastAPI app, routes, CORS, static files
    │   ├── inference.py      # Pipeline: U-Net → PneuNet → ScoreCAM
    │   ├── scorecam.py       # ScoreCAM Variant B
    │   ├── database.py       # SQLAlchemy Core, SQLite, CRUD
    │   ├── requirements.txt  # Thư viện Python
    │   └── models/           # File .keras model (không có trong repo)
    │
    └── frontend/
        ├── src/
        │   ├── pages/
        │   │   ├── HomePage.jsx    # Trang chủ
        │   │   ├── UploadPage.jsx  # Upload + xem kết quả
        │   │   ├── HistoryPage.jsx # Lịch sử chẩn đoán
        │   │   └── AboutPage.jsx   # Giới thiệu hệ thống
        │   ├── components/
        │   │   └── DiagnosisCard.jsx
        │   ├── api/
        │   ├── hooks/
        │   └── styles/
        └── package.json
```

## Yêu cầu môi trường

### Backend

```
Python 3.12+
fastapi, uvicorn[standard], python-multipart
pillow, numpy, tensorflow (2.21 / Keras 3)
opencv-python, scikit-image, matplotlib
sqlalchemy, pytz
```

### Frontend

```
Node.js 18+, React 18, Vite, React Router DOM
```

### Huấn luyện (Kaggle / Google Colab)

```
tensorflow/keras, scikit-learn, opencv-python
albumentations, imagehash
seaborn, matplotlib, pandas
```

## Hướng dẫn chạy

### 1. Clone repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### 2. Tải model đã huấn luyện

Tải 3 file `.keras` và đặt vào `web_platform/backend/models/`:

```
models/
├── best_unet.keras
├── simplified_pneunet_pneunet_3class.keras
└── simplified_pneunet_pneunet_4class.keras
```

> 💡 File model không có trong repository do kích thước lớn (~400+ MB). Liên hệ tác giả hoặc tự huấn luyện lại bằng code trong `Code_train_model/`.

### 3. Khởi động Backend

```bash
cd web_platform/backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

API có tại `http://localhost:8000`. Swagger docs tại `http://localhost:8000/docs`.

### 4. Khởi động Frontend

```bash
cd web_platform/frontend
npm install
npm run dev
```

Web app có tại `http://localhost:5173`.

### 5. Upload và phân tích

1. Vào `http://localhost:5173/upload`
2. Chọn model phân loại (3 nhãn hoặc 4 nhãn)
3. Kéo thả hoặc click để upload ảnh X-quang (JPEG/PNG)
4. Xem kết quả: nhãn chẩn đoán, độ tin cậy, thanh xác suất, và 4 ảnh (gốc, phân đoạn, overlay, ScoreCAM heatmap)

### 6. Tự huấn luyện model (tùy chọn)

Toàn bộ code huấn luyện có trong `Code_train_model/test3/`. Các file `.txt` là code Python/Keras thiết kế để chạy trên **Kaggle GPU**. Đổi đuôi thành `.py` hoặc paste vào Kaggle notebook để chạy.

- **Lọc trùng dataset:** `locdataset.txt`
- **Huấn luyện U-Net:** `train_unet.txt`
- **Huấn luyện model phân loại:** `simplified pneunet 3class_fix mixup mixcut.txt` (và các file tương đương cho model khác)
- **Đánh giá và so sánh model:** `danh gia 4 model fix mixup mixcut.txt`
- **Nghiên cứu ablation XAI:** `scorecamlime_fixpreprocessing.txt`

## Hạn chế & Tuyên bố miễn trách

> ⚠️ **AI-LungCare là công cụ nghiên cứu/demo và KHÔNG thay thế nhận định lâm sàng.** Kết quả cần được đối chiếu với triệu chứng lâm sàng và các phương tiện chẩn đoán khác. Mọi quyết định điều trị phải do bác sĩ có thẩm quyền đưa ra.

**Hạn chế hiện tại:**
- Model huấn luyện trên dataset công khai — domain shift có thể làm giảm độ chính xác trên ảnh từ nguồn/máy khác.
- ScoreCAM dùng Top-K=128 channels để tăng tốc; 512-channel đầy đủ cho heatmap fidelity cao hơn.
- Kiểm tra lung ratio (3–70%) có thể fail trên ảnh X-quang bất thường hoặc bệnh nặng.
- Chưa có xác thực người dùng hay phân quyền trong triển khai hiện tại.

**Hướng phát triển:**
- Bổ sung dữ liệu từ bệnh viện Việt Nam để giảm domain shift.
- Triển khai full SS-CAM cho server có GPU.
- Mở rộng sang phân loại PA vs AP và các bệnh phổi khác.
- Hỗ trợ DICOM native và tích hợp PACS.
- Đánh giá trên external test set độc lập.

---

## References

- Ronneberger, O., Fischer, P., & Brox, T. (2015). **U-Net: Convolutional Networks for Biomedical Image Segmentation.** MICCAI 2015.
- Wang, H., et al. (2020). **Score-CAM: Score-Weighted Visual Explanations for Convolutional Neural Networks.** CVPR Workshops 2020.
- Wang, X., et al. (2023). **PneuNet: Pneumonia Detection from Chest X-Ray Using Deep CNN.** (Original inspiration for PneuNet architecture.)
- Yun, S., et al. (2019). **CutMix: Training Strategy that Makes Use of Sample Mixing.** ICCV 2019.
- Zhang, H., et al. (2018). **mixup: Beyond Empirical Risk Minimization.** ICLR 2018.

---

*Built with ❤️ as a graduation thesis project — Faculty of Electronics and Telecommunications, Ho Chi Minh University of Science, VNU-HCM.*
