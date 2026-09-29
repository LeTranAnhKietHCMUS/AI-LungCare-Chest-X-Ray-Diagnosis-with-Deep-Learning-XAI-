// src/api/client.js
import axios from 'axios'

// Đổi dòng này khi deploy lên server thật
export const BACKEND_ORIGIN = 'http://localhost:8000'

const api = axios.create({
    baseURL: BACKEND_ORIGIN,
})

// ── Hàm 1: Gửi ảnh lên backend để phân tích ──────────────────────
// Response giờ có thêm image_urls: { original, segmented, overlay, scorecam }
export async function predictImage(imageFile, modelId) {
    const formData = new FormData()
    formData.append('file', imageFile)
    formData.append('model_id', modelId)

    const response = await api.post('/api/predict', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
}

// ── Hàm 2: Lấy lịch sử ───────────────────────────────────────────
// Mỗi record trong history có sẵn image_urls
export async function getHistory(limit = 20, modelId = null) {
    const params = { limit }
    if (modelId) params.model_id = modelId
    const response = await api.get('/api/recent', { params })
    return response.data
}

// ── Hàm 3: Lấy danh sách model ────────────────────────────────────
export async function getModels() {
    const response = await api.get('/api/models')
    return response.data
}

// ── Hàm 4: Build URL ảnh trực tiếp ───────────────────────────────
// imageType: "original" | "segmented" | "overlay" | "scorecam"
// Dùng hàm này để load ảnh — không cần API call, không cần base64
export function getImageUrl(recordId, imageType) {
    return `${BACKEND_ORIGIN}/uploads/${recordId}_${imageType}.jpg`
}