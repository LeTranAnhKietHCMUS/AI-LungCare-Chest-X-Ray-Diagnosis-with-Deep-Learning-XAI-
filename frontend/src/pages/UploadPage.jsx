// src/pages/UploadPage_v3.jsx

import { useState, useRef, useCallback } from 'react'
import ImageUploader from '../components/ImageUploader'
import DiagnosisCard from '../components/DiagnosisCard'
import ConfidenceBar from '../components/ConfidenceBar'
import { predictImage } from '../api/client'
import { useAppToast } from '../App'

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const LABEL_COLOR = {
    'Normal': 'var(--color-normal)',
    'COVID-19': 'var(--color-covid)',
    'Pneumonia': 'var(--color-pneumonia)',
    'Bacterial Pneumonia': 'var(--color-bacterial)',
    'Viral Pneumonia': 'var(--color-viral)',
}

const LABEL_HEX = {
    'Normal': '#6dbf6d',
    'COVID-19': '#7eb8f7',
    'Pneumonia': '#c49df5',
    'Bacterial Pneumonia': '#f5c96a',
    'Viral Pneumonia': '#f58a8a',
}

const MODELS = [
    { id: 'pneunet_3class', label: '3 nhãn', labels: ['COVID-19', 'Normal', 'Pneumonia'] },
    { id: 'pneunet_4class', label: '4 nhãn', labels: ['Bacterial Pneumonia', 'COVID-19', 'Normal', 'Viral Pneumonia'] },
]

// ─────────────────────────────────────────────────────────────────
// Dữ liệu lâm sàng theo nhãn chẩn đoán
// ─────────────────────────────────────────────────────────────────

const CLINICAL_INFO = {
    'Normal': {
        icon: '✅',
        summary: 'Hình ảnh phổi không ghi nhận bất thường rõ ràng theo mô hình AI.',
        signs: [
            'Nhu mô phổi đồng nhất, không thấy đông đặc hay thâm nhiễm',
            'Rốn phổi và bóng tim trong giới hạn bình thường',
            'Không có tràn dịch màng phổi hay khí màng phổi',
            'Cấu trúc xương sườn và cơ hoành bình thường',
        ],
        advice: [
            'Đối chiếu với triệu chứng lâm sàng của bệnh nhân',
            'Nếu bệnh nhân có triệu chứng hô hấp, cân nhắc chụp CT ngực để loại trừ tổn thương sớm',
            'Theo dõi diễn tiến lâm sàng nếu nghi ngờ nhiễm trùng giai đoạn đầu',
        ],
    },
    'COVID-19': {
        icon: '🦠',
        summary: 'Hình ảnh gợi ý tổn thương phổi có thể liên quan COVID-19. Cần xác nhận bằng xét nghiệm.',
        signs: [
            'Kính mờ (ground-glass opacity) phân bố ngoại vi, hai bên phổi',
            'Tổn thương thường ở thùy dưới và thùy giữa',
            'Hình ảnh "bàn cờ" (crazy paving pattern) có thể xuất hiện',
            'Đông đặc nhu mô phổi kèm hoặc không kèm kính mờ',
            'Ít khi có tràn dịch màng phổi hay hạch trung thất to',
        ],
        advice: [
            'Chỉ định xét nghiệm RT-PCR hoặc test nhanh kháng nguyên để xác nhận',
            'Đánh giá SpO₂ và tình trạng hô hấp để phân loại mức độ nặng',
            'Cân nhắc CT ngực nếu cần đánh giá chi tiết mức độ tổn thương',
            'Phân loại và cách ly theo phác đồ của Bộ Y tế hiện hành',
            'Đối chiếu ScoreCAM heatmap với vị trí tổn thương thực trên phim',
        ],
    },
    'Pneumonia': {
        icon: '🫁',
        summary: 'Hình ảnh gợi ý viêm phổi. Cần phân biệt nguyên nhân vi khuẩn, virus hay không điển hình.',
        signs: [
            'Đông đặc nhu mô phổi khu trú hoặc lan tỏa',
            'Hình ảnh thâm nhiễm phế nang hoặc kẽ',
            'Có thể có dấu hiệu khí phế quản đồ (air bronchogram)',
            'Viêm phổi vi khuẩn thường khu trú một thùy; virus thường lan tỏa hai bên',
            'Có thể kèm tràn dịch màng phổi phản ứng nhỏ',
        ],
        advice: [
            'Xét nghiệm công thức máu, CRP, procalcitonin để đánh giá mức độ nhiễm trùng',
            'Cấy đờm hoặc dịch phế quản nếu cần xác định tác nhân vi khuẩn',
            'Đánh giá điểm PSI/PORT hoặc CURB-65 để quyết định nhập viện hay điều trị ngoại trú',
            'Cân nhắc điều trị kháng sinh theo phác đồ viêm phổi cộng đồng',
            'Đối chiếu ScoreCAM heatmap với vùng nghe phổi bất thường trên lâm sàng',
        ],
    },
    'Bacterial Pneumonia': {
        icon: '🔬',
        summary: 'Hình ảnh gợi ý viêm phổi do vi khuẩn. Điều trị kháng sinh phù hợp cần được khởi động sớm.',
        signs: [
            'Đông đặc thuỳ phổi khu trú, bờ rõ (lobar consolidation)',
            'Dấu hiệu khí phế quản đồ (air bronchogram) điển hình',
            'Thường gặp ở thùy dưới, một bên phổi',
            'Có thể kèm phản ứng màng phổi hoặc tràn dịch nhỏ',
            'Bạch cầu và procalcitonin thường tăng cao',
        ],
        advice: [
            'Cấy máu trước khi khởi động kháng sinh nếu có thể',
            'Lựa chọn kháng sinh theo phác đồ địa phương, ưu tiên beta-lactam',
            'Theo dõi đáp ứng điều trị sau 48–72 giờ, chụp lại X-ray nếu không cải thiện',
            'Đánh giá biến chứng: áp xe phổi, tràn mủ màng phổi',
            'Đối chiếu ScoreCAM heatmap với vùng tổn thương trên lâm sàng',
        ],
    },
    'Viral Pneumonia': {
        icon: '🧪',
        summary: 'Hình ảnh gợi ý viêm phổi do virus. Điều trị hỗ trợ là chính; xác định tác nhân nếu cần.',
        signs: [
            'Thâm nhiễm kẽ lan tỏa hai bên phổi (interstitial pattern)',
            'Kính mờ ngoại vi, phân bố không đồng đều',
            'Ít khi có đông đặc thuỳ rõ ràng như viêm phổi vi khuẩn',
            'Có thể gặp tràn dịch màng phổi nhỏ',
            'Bạch cầu thường bình thường hoặc giảm nhẹ',
        ],
        advice: [
            'Xét nghiệm panel virus hô hấp (influenza, RSV, rhinovirus…) nếu cần xác định tác nhân',
            'Điều trị hỗ trợ: oxy liệu pháp, hydrat hóa, hạ sốt',
            'Cân nhắc oseltamivir nếu nghi cúm trong vòng 48h khởi phát',
            'Theo dõi sát SpO₂ — viêm phổi virus có thể diễn tiến nhanh',
            'Đối chiếu ScoreCAM heatmap với vùng thâm nhiễm trên phim',
        ],
    },
}

// ─────────────────────────────────────────────────────────────────
// SliderOverlay
// ─────────────────────────────────────────────────────────────────

function SliderOverlay({ leftB64, rightB64, leftLabel, rightLabel }) {
    const [sliderX, setSliderX] = useState(50)
    const containerRef = useRef(null)
    const isDragging = useRef(false)

    const getPercent = useCallback((clientX) => {
        const rect = containerRef.current.getBoundingClientRect()
        return Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 2), 98)
    }, [])

    const onMouseMove = useCallback((e) => { if (isDragging.current) setSliderX(getPercent(e.clientX)) }, [getPercent])
    const onMouseUp = useCallback(() => { isDragging.current = false }, [])
    const onMouseDown = useCallback((e) => { e.preventDefault(); isDragging.current = true }, [])
    const onTouchMove = useCallback((e) => { if (isDragging.current) setSliderX(getPercent(e.touches[0].clientX)) }, [getPercent])
    const onTouchStart = useCallback(() => { isDragging.current = true }, [])
    const onTouchEnd = useCallback(() => { isDragging.current = false }, [])

    return (
        <div
            ref={containerRef}
            onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
            style={{
                position: 'relative', width: '100%', aspectRatio: '1 / 1',
                borderRadius: '8px', overflow: 'hidden', cursor: 'col-resize',
                userSelect: 'none', background: '#0f1117',
            }}
        >
            <img src={`data:image/jpeg;base64,${rightB64}`} alt={rightLabel} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - sliderX}% 0 0)` }}>
                <img src={`data:image/jpeg;base64,${leftB64}`} alt={leftLabel} draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{
                position: 'absolute', top: 0, bottom: 0, left: `${sliderX}%`, width: '2px',
                background: 'rgba(255,255,255,0.85)', transform: 'translateX(-50%)', pointerEvents: 'none',
            }} />
            <div onMouseDown={onMouseDown} onTouchStart={onTouchStart} style={{
                position: 'absolute', top: '50%', left: `${sliderX}%`,
                transform: 'translate(-50%, -50%)', width: '34px', height: '34px',
                borderRadius: '50%', background: '#fff', border: '2px solid rgba(0,0,0,0.15)',
                cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', zIndex: 10,
            }}>⇄</div>
            <span style={{
                position: 'absolute', bottom: '8px', left: '8px',
                background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '0.65rem',
                padding: '2px 7px', borderRadius: '4px', pointerEvents: 'none',
                fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>{leftLabel}</span>
            <span style={{
                position: 'absolute', bottom: '8px', right: '8px',
                background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '0.65rem',
                padding: '2px 7px', borderRadius: '4px', pointerEvents: 'none',
                fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>{rightLabel}</span>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// ImageResultGrid
// ─────────────────────────────────────────────────────────────────

function ImageResultGrid({ result }) {
    return (
        <div style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
            padding: '16px', border: '1px solid var(--border)',
        }}>
            <p style={{
                color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase',
                letterSpacing: '1px', fontWeight: 600, margin: '0 0 12px 0',
            }}>So sánh ảnh — kéo thanh trượt</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <SliderOverlay
                    rightB64={result.overlay_image_b64}
                    leftB64={result.original_image_b64}
                    leftLabel="Overlay"
                    rightLabel="Ảnh gốc"
                />
                <SliderOverlay
                    rightB64={result.scorecam_image_b64}
                    leftB64={result.segmented_image_b64}
                    leftLabel="ScoreCAM"
                    rightLabel="U-Net"
                />
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// ClinicalAdviceCard — scroll bên trong, không có disclaimer
// ClinicalAdviceCard hiện không nhận biết được model đang dùng. 
// Cách đơn giản nhất là truyền thêm prop labelCount vào:
// ─────────────────────────────────────────────────────────────────

function ClinicalAdviceCard({ label, labelCount }) {
    const info = CLINICAL_INFO[label]
    if (!info) return null
    const hex = LABEL_HEX[label] || '#7eb8f7'

    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            // Chiều cao cố định hợp lý — nội dung thừa thì scroll
            // Không dùng flexGrow để tránh vấn đề layout
            maxHeight: labelCount === 3 ? '250px' : '293px',
        }}>
            {/* Header — không scroll */}
            <div style={{
                padding: '14px 16px 12px',
                borderBottom: `1px solid ${hex}30`,
                background: `${hex}0d`,
                display: 'flex', alignItems: 'center', gap: '10px',
                flexShrink: 0,
            }}>
                <span style={{ fontSize: '1.2rem' }}>{info.icon}</span>
                <div style={{ flex: 1 }}>
                    <p style={{
                        color: 'var(--text-secondary)', fontSize: '0.68rem',
                        textTransform: 'uppercase', letterSpacing: '1px',
                        fontWeight: 600, margin: '0 0 2px 0',
                    }}>Thông tin lâm sàng & Tư vấn bác sĩ</p>
                    <p style={{ color: hex, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>{label}</p>
                </div>
            </div>

            {/* Body — scroll khi nội dung dài */}
            <div style={{
                padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: '14px',
                overflowY: 'auto',
                flex: 1,
                minHeight: 0,
            }}>
                {/* Tóm tắt */}
                <p style={{
                    color: '#c9d1d9', fontSize: '0.84rem', lineHeight: 1.6, margin: 0,
                    padding: '10px 12px', background: `${hex}0d`,
                    borderRadius: '8px', borderLeft: `3px solid ${hex}`,
                }}>{info.summary}</p>

                {/* Dấu hiệu X-quang */}
                <div>
                    <p style={{
                        color: 'var(--text-secondary)', fontSize: '0.7rem',
                        textTransform: 'uppercase', letterSpacing: '0.8px',
                        fontWeight: 600, margin: '0 0 8px 0',
                    }}>🔍 Dấu hiệu X-quang cần quan sát</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {info.signs.map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ color: hex, fontSize: '0.75rem', marginTop: '2px', flexShrink: 0 }}>▸</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.5 }}>{s}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Lời khuyên */}
                <div>
                    <p style={{
                        color: 'var(--text-secondary)', fontSize: '0.7rem',
                        textTransform: 'uppercase', letterSpacing: '0.8px',
                        fontWeight: 600, margin: '0 0 8px 0',
                    }}>💡 Gợi ý bước tiếp theo</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {info.advice.map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '2px', flexShrink: 0 }}>•</span>
                                <span style={{ color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.5 }}>{a}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// DisclaimerBanner — card riêng, full-width bên dưới 2 cột
// ─────────────────────────────────────────────────────────────────

function DisclaimerBanner() {
    return (
        <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(245,193,106,0.07)',
            border: '1px solid rgba(245,193,106,0.28)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', gap: '10px', alignItems: 'flex-start',
        }}>
            <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
            <p style={{ color: '#c9a84c', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>
                <strong>Lưu ý quan trọng:</strong> Kết quả phân tích trên là công cụ hỗ trợ chẩn đoán bằng AI
                và <strong>không thay thế</strong> nhận định lâm sàng của bác sĩ. Mô hình có thể phân loại
                sai trong một số trường hợp và hiện chưa có cơ chế tự phát hiện lỗi phân loại.
                Bác sĩ cần đối chiếu kết quả với triệu chứng lâm sàng, xét nghiệm cận lâm sàng và
                các phương tiện chẩn đoán hình ảnh khác trước khi đưa ra quyết định điều trị cuối cùng.
            </p>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// UploadPage_v3 — component chính
// ─────────────────────────────────────────────────────────────────

function UploadPage() {
    const toast = useAppToast()
    const [selectedFile, setSelectedFile] = useState(null)
    const [modelId, setModelId] = useState('pneunet_3class')
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleAnalyze = async () => {
        if (!selectedFile || loading) return
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const data = await predictImage(selectedFile, modelId)
            setResult(data)
            // Toast thành công — hiện ngắn 3s
            toast.success(`Phân tích hoàn tất: ${data.label} (${(data.confidence * 100).toFixed(1)}%)`)
        } catch (err) {
            const msg = err.response?.data?.detail || 'Không thể kết nối server. Đảm bảo backend đang chạy.'
            setError(msg)
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }

    const currentModel = MODELS.find(m => m.id === modelId)

    // Số nhãn ảnh hưởng chiều cao card xác suất — tính sẵn để truyền vào style
    const labelCount = currentModel.labels.length

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 32px' }}>

            {/* Tiêu đề */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px 0' }}>Phân tích X-ray phổi</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                    Upload ảnh → U-Net phân đoạn → Simplified PneuNet phân loại → ScoreCAM giải thích
                </p>
            </div>

            {/*
              ── 2 CỘT CHÍNH ────────────────────────────────────────────
              alignItems: start → mỗi cột tự quyết chiều cao riêng.
              ClinicalAdviceCard dùng maxHeight + scroll thay vì stretch.
            */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: result ? '38% 1fr' : '1fr',
                gap: '24px',
                alignItems: 'start',
                maxWidth: result ? '100%' : '560px',
                margin: result ? '0' : '0 auto',
            }}>

                {/* ══ CỘT TRÁI ══ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/*
                      Upload ảnh — kích thước lớn hơn để ảnh X-ray rõ hơn
                      Khi có result: minHeight 360px, ảnh tối đa 340px
                      Khi chưa có:  minHeight 260px, ảnh tối đa 240px
                    */}
                    <div style={{ '--uploader-min-height': result ? '360px' : '260px' }}>
                        <style>{`
                            .uploader-root {
                                min-height: var(--uploader-min-height, 300px) !important;
                            }
                            .uploader-root img[alt="Preview X-ray"] {
                                max-height: ${result ? '340px' : '240px'} !important;
                                width: 100% !important;
                                object-fit: contain !important;
                            }
                        `}</style>
                        <div className="uploader-root">
                            <ImageUploader
                                onImageSelect={setSelectedFile}
                                onError={(msg) => toast.error(msg)}
                            />
                        </div>
                    </div>

                    {/* Model phân loại + badge nhãn */}
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                        padding: '16px', border: '1px solid var(--border)',
                        height: '220px',
                        display: 'flex', flexDirection: 'column', gap: '16px',
                    }}>
                        <p style={{
                            color: 'var(--text-secondary)', fontSize: '0.72rem',
                            textTransform: 'uppercase', letterSpacing: '1px',
                            fontWeight: 600, margin: '0 0 10px 0',
                        }}>Model phân loại</p>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                            {MODELS.map(({ id, label }) => {
                                const active = modelId === id
                                return (
                                    <button key={id} onClick={() => setModelId(id)} style={{
                                        flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                        border: active ? '1.5px solid var(--text-accent)' : '1px solid var(--border)',
                                        background: active ? 'rgba(126,184,247,0.1)' : 'var(--bg-input)',
                                        color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
                                        fontSize: '0.85rem', fontWeight: active ? 700 : 400,
                                        cursor: 'pointer', transition: 'var(--transition)',
                                    }}>{label}</button>
                                )
                            })}
                        </div>
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                            <p style={{
                                color: 'var(--text-secondary)', fontSize: '0.7rem',
                                margin: '0 0 8px 0', letterSpacing: '0.5px',
                            }}>Các nhãn chẩn đoán:</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {currentModel.labels.map(lbl => {
                                    const hex = LABEL_HEX[lbl] || '#7eb8f7'
                                    return (
                                        <span key={lbl} style={{
                                            padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem',
                                            fontWeight: 600, color: LABEL_COLOR[lbl] || 'var(--text-accent)',
                                            background: `${hex}18`, border: `1px solid ${hex}40`,
                                        }}>{lbl}</span>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/*
                      Card xác suất — chiều cao tự động theo số nhãn.
                      3 nhãn: ~130px, 4 nhãn: ~165px (mỗi nhãn ~33px).
                      Không đặt height cố định — để nội dung tự quyết.
                    */}
                    {result && (
                        <div style={{
                            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                            padding: '16px', border: '1px solid var(--border)',
                        }}>
                            <p style={{
                                color: 'var(--text-secondary)', fontSize: '0.72rem',
                                textTransform: 'uppercase', letterSpacing: '1px',
                                fontWeight: 600, margin: '0 0 12px 0',
                            }}>Xác suất từng nhãn</p>
                            <ConfidenceBar probabilities={result.probabilities} />
                        </div>
                    )}

                    {/* Nút phân tích */}
                    <button
                        onClick={handleAnalyze}
                        disabled={!selectedFile || loading}
                        style={{
                            padding: '13px', borderRadius: 'var(--radius-md)', border: 'none',
                            background: selectedFile && !loading ? 'var(--text-accent)' : 'var(--bg-hover)',
                            color: selectedFile && !loading ? '#000' : 'var(--text-secondary)',
                            fontSize: '0.95rem', fontWeight: 700,
                            cursor: selectedFile && !loading ? 'pointer' : 'not-allowed',
                            transition: 'var(--transition)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                    >
                        {loading ? <><span className="spinner" /> Đang phân tích...</> : '🔍  Phân tích X-ray'}
                    </button>

                    {error && (
                        <div style={{
                            padding: '11px 14px', background: 'rgba(245,138,138,0.08)',
                            border: '1px solid rgba(245,138,138,0.25)', borderRadius: 'var(--radius-md)',
                            color: 'var(--color-viral)', fontSize: '0.83rem',
                        }}>⚠️ {error}</div>
                    )}
                </div>

                {/* ══ CỘT PHẢI ══ */}
                {result && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <DiagnosisCard
                            label={result.label}
                            confidence={result.confidence}
                            inferenceTime={result.inference_time_ms}
                            segmentInfo={result.segment_info}
                            uncertaintyInfo={result.uncertainty_info}
                        />
                        <ImageResultGrid result={result} />
                        {/* Card lâm sàng — scroll nội dung, maxHeight cố định */}
                        <ClinicalAdviceCard label={result.label} labelCount={currentModel.labels.length} />
                    </div>
                )}
            </div>

            {/*
              ── DISCLAIMER — full width, bên dưới 2 cột ────────────────
              Chỉ hiện sau khi có kết quả.
              Kéo dài từ mép trái cột trái (nút button) đến mép phải
              cột phải (card lâm sàng) — tự nhiên vì cùng grid container.
            */}
            {result && <DisclaimerBanner />}
        </div>
    )
}

export default UploadPage