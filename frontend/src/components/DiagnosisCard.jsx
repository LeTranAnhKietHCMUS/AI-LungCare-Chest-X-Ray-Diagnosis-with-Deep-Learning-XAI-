// src/components/DiagnosisCard.jsx

// Map tên nhãn → màu CSS variable đã định nghĩa trong global.css
const LABEL_COLOR = {
    'Normal': 'var(--color-normal)',
    'COVID-19': 'var(--color-covid)',
    'Pneumonia': 'var(--color-pneumonia)',
    'Bacterial Pneumonia': 'var(--color-bacterial)',
    'Viral Pneumonia': 'var(--color-viral)',
}

// Map nhãn → emoji trực quan
const LABEL_ICON = {
    'Normal': '✅', //Bình thường
    'COVID-19': '🦠', // virus corona
    'Pneumonia': '⚠️', // Viêm phổi
    'Bacterial Pneumonia': '🔬', // Viêm phổi do vi khuẩn (Đĩa nuôi cấy vi khuẩn: Chỉ rõ nguyên nhân do Vi khuẩn)
    'Viral Pneumonia': '🧪', // Viêm phổi do vi rút (Ống nghiệm: Thường dùng định danh virus)
}

// Props:
//   label           : tên nhãn chẩn đoán (string)
//   confidence      : độ tin cậy 0.0–1.0 (number)
//   inferenceTime   : thời gian chạy model (ms, number)
//   segmentInfo     : { lung_ratio_pct, mask_valid, threshold } (object)
//   uncertaintyInfo : { entropy, max_entropy, is_overconfident } (object | undefined)
function DiagnosisCard({ label, confidence, inferenceTime, segmentInfo, uncertaintyInfo }) {
    const color = LABEL_COLOR[label] || 'var(--text-accent)'
    const icon = LABEL_ICON[label] || '🔍'
    const isOverconfident = uncertaintyInfo?.is_overconfident === true

    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            // Viền trái màu theo nhãn — không bo góc vì là single-side border
            borderLeft: `4px solid ${color}`,
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderRadius: 0,
            borderTopRightRadius: 'var(--radius-lg)',
            borderBottomRightRadius: 'var(--radius-lg)',
        }}>
            {/* Label nhỏ phía trên */}
            <p style={{
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
                marginBottom: '8px',
                fontWeight: 600,
            }}>
                Kết quả chẩn đoán
            </p>

            {/* Nhãn chính — to, đậm, màu đặc trưng */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                <span style={{ fontSize: '1.7rem', fontWeight: 700, color, lineHeight: 1.2 }}>
                    {label}
                </span>
            </div>

            {/* Độ tin cậy */}
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '12px' }}>
                Độ tin cậy:{' '}
                <span style={{ color, fontWeight: 700 }}>
                    {(confidence * 100).toFixed(1)}%
                </span>
            </p>

            {/* ── CẢNH BÁO OVERCONFIDENCE ── */}
            {isOverconfident && (
                <div style={{
                    marginBottom: '12px',
                    padding: '10px 13px',
                    background: 'rgba(251,146,60,0.08)',
                    border: '1px solid rgba(251,146,60,0.40)',
                    borderRadius: '8px',
                    display: 'flex',
                    gap: '9px',
                    alignItems: 'flex-start',
                }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
                    <div>
                        <p style={{
                            color: '#fb923c',
                            fontSize: '0.79rem',
                            fontWeight: 700,
                            margin: '0 0 3px 0',
                            lineHeight: 1.4,
                        }}>
                            Độ tin cậy cao bất thường — ảnh có thể ngoài phân phối
                        </p>
                        <p style={{
                            color: '#c9a07a',
                            fontSize: '0.75rem',
                            margin: 0,
                            lineHeight: 1.5,
                        }}>
                            Model đang rất chắc chắn (entropy thấp) —  ảnh có thể nằm trong nguồn dataset
                            ngoài (cần thận trọng). Kết quả nên được bác sĩ thẩm định kỹ trước
                            khi sử dụng.
                        </p>
                    </div>
                </div>
            )}

            {/* Thông tin bổ sung từ segment */}
            {segmentInfo && (
                <div style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: '10px',
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                }}>
                    <InfoChip
                        label="Vùng phổi"
                        value={`${segmentInfo.lung_ratio_pct?.toFixed(1)}%`}
                    />
                    <InfoChip
                        label="Mask"
                        value={segmentInfo.mask_valid ? '✓ Hợp lệ' : '✗ Không hợp lệ'}
                        valueColor={segmentInfo.mask_valid ? 'var(--color-normal)' : 'var(--color-viral)'}
                    />
                    {inferenceTime && (
                        <InfoChip label="Thời gian" value={`${inferenceTime}ms`} />
                    )}
                    {uncertaintyInfo && (
                        <InfoChip
                            label="Entropy"
                            value={`${uncertaintyInfo.entropy?.toFixed(3)} / ${uncertaintyInfo.max_entropy?.toFixed(3)}`}
                            valueColor={isOverconfident ? '#fb923c' : undefined}
                        />
                    )}
                </div>
            )}
        </div>
    )
}

// Component nhỏ: 1 thông số dạng "Label: Value"
function InfoChip({ label, value, valueColor }) {
    return (
        <div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{label}: </span>
            <span style={{
                color: valueColor || 'var(--text-primary)',
                fontSize: '0.82rem',
                fontWeight: 600,
            }}>
                {value}
            </span>
        </div>
    )
}

export default DiagnosisCard