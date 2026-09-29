// src/pages/HistoryPage.jsx
// Lịch sử phân tích:
//   - Biểu đồ tải lượng ca bệnh theo tuần (SVG thuần)
//   - Bảng có phân trang (10 records/trang)
//   - Filter model + filter nhãn
//   - Thumbnail ảnh gốc trước tên file
//   - Nút Xem (modal chi tiết) + Nút Xóa (confirm modal)
//
// [Fix] Bỏ hoàn toàn getImage() / base64 relay:
//   - RowThumbnail: dùng <img src={getImageUrl(...)} /> trực tiếp
//   - DetailModal:  dùng record.image_urls (có sẵn từ /api/recent)

import { useState, useEffect, useCallback } from 'react'
import { getHistory, getImageUrl } from '../api/client'
import axios from 'axios'
import { useAppToast } from '../App'

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const LABEL_COLOR = {
    'Normal': '#6dbf6d',
    'COVID-19': '#7eb8f7',
    'Pneumonia': '#c49df5',
    'Bacterial Pneumonia': '#f5c96a',
    'Viral Pneumonia': '#f58a8a',
}

const MODEL_LABEL = {
    'pneunet_3class': '3 nhãn',
    'pneunet_4class': '4 nhãn',
}

const PAGE_SIZE = 10

const IMAGE_TYPES = [
    { key: 'original', label: 'Ảnh gốc' },
    { key: 'segmented', label: 'Sau U-Net' },
    { key: 'overlay', label: 'Overlay' },
    { key: 'scorecam', label: 'ScoreCAM' },
]

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatTime(isoStr) {
    if (!isoStr) return '—'
    try {
        const d = new Date(isoStr)
        const date = d.toLocaleDateString('vi-VN')
        const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        return `${date} ${time}`
    } catch { return isoStr }
}

function buildWeeklyChart(records) {
    const counts = {}
    records.forEach(r => {
        if (!r.timestamp) return
        const d = new Date(r.timestamp)
        const day = d.getDay() || 7
        const thu = new Date(d)
        thu.setDate(d.getDate() + 4 - day)
        const year = thu.getFullYear()
        const jan1 = new Date(year, 0, 1)
        const week = Math.ceil(((thu - jan1) / 86400000 + 1) / 7)
        const key = `${year}-W${String(week).padStart(2, '0')}`
        counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8)
        .map(([week, count]) => ({ week: week.replace(/^\d{4}-/, ''), count }))
}

// ─────────────────────────────────────────────────────────────────
// LabelBadge
// ─────────────────────────────────────────────────────────────────

function LabelBadge({ label }) {
    const color = LABEL_COLOR[label] || '#9ca3af'
    return (
        <span style={{
            padding: '2px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color,
            background: `${color}18`,
            border: `1px solid ${color}35`,
            whiteSpace: 'nowrap',
            display: 'inline-block',
        }}>
            {label}
        </span>
    )
}

// ─────────────────────────────────────────────────────────────────
// RowThumbnail — URL trực tiếp, không cần state hay API call
// ─────────────────────────────────────────────────────────────────

function RowThumbnail({ recordId }) {
    return (
        <div style={{
            width: 36,
            height: 36,
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#0f1117',
            border: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <img
                src={getImageUrl(recordId, 'original')}
                alt="thumb"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => {
                    e.target.style.display = 'none'
                    e.target.parentElement.innerHTML = '<span style="font-size:0.7rem;color:var(--text-secondary)">🫁</span>'
                }}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// ConfirmDeleteModal
// ─────────────────────────────────────────────────────────────────

function ConfirmDeleteModal({ filename, onConfirm, onCancel }) {
    return (
        <div
            onClick={onCancel}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                zIndex: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '28px 32px',
                    width: '380px',
                    textAlign: 'center',
                }}
            >
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🗑️</div>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '1rem' }}>
                    Xóa lịch sử phân tích?
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0' }}>
                    File <strong style={{ color: 'var(--text-primary)' }}>{filename}</strong> sẽ bị xóa vĩnh viễn.
                    Hành động này không thể hoàn tác.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 20px',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                        }}
                    >
                        Hủy
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 20px',
                            background: 'rgba(245,138,138,0.15)',
                            border: '1px solid rgba(245,138,138,0.5)',
                            borderRadius: 'var(--radius-md)',
                            color: '#f58a8a',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                        }}
                    >
                        Xóa
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// DetailModal — dùng image_urls từ record, không gọi API
// ─────────────────────────────────────────────────────────────────

function DetailModal({ record, onClose }) {
    const [activeImg, setActiveImg] = useState('original')

    if (!record) return null

    // image_urls có sẵn từ /api/recent — không cần fetch thêm
    const urls = record.image_urls || {}
    const color = LABEL_COLOR[record.label] || '#9ca3af'

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.75)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    width: '100%',
                    maxWidth: '820px',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexShrink: 0,
                }}>
                    <LabelBadge label={record.label} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
                        {record.filename}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {formatTime(record.timestamp)}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                        }}
                    >
                        ✕ Đóng
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                        {/* Cột trái: thông tin + xác suất */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                            {/* Chẩn đoán */}
                            <div style={{
                                background: '#13161f',
                                borderRadius: 'var(--radius-md)',
                                padding: '16px',
                                borderLeft: `4px solid ${color}`,
                            }}>
                                <p style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    fontWeight: 600,
                                    marginBottom: '6px',
                                }}>
                                    Chẩn đoán
                                </p>
                                <p style={{ color, fontSize: '1.4rem', fontWeight: 700, marginBottom: '4px' }}>
                                    {record.label}
                                </p>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                                    Độ tin cậy: <strong style={{ color }}>{(record.confidence * 100).toFixed(1)}%</strong>
                                </p>
                            </div>

                            {/* Thông số */}
                            <div style={{ background: '#13161f', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                                {[
                                    { label: 'Model', value: MODEL_LABEL[record.model_id] || record.model_id },
                                    { label: 'Thời gian', value: `${record.inference_time_ms} ms` },
                                    { label: 'Vùng phổi', value: record.lung_ratio_pct ? `${record.lung_ratio_pct.toFixed(1)}%` : '—' },
                                    { label: 'Mask', value: record.mask_valid ? '✓ Hợp lệ' : '✗ Không hợp lệ' },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: '6px 0',
                                        borderBottom: '1px solid var(--border)',
                                    }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{label}</span>
                                        <span style={{ color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 500 }}>{value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Xác suất */}
                            {record.probabilities && (
                                <div style={{ background: '#13161f', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                                    <p style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: '0.7rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px',
                                        fontWeight: 600,
                                        marginBottom: '10px',
                                    }}>
                                        Xác suất từng nhãn
                                    </p>
                                    {Object.entries(record.probabilities)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([lbl, prob]) => {
                                            const c = LABEL_COLOR[lbl] || '#9ca3af'
                                            const pct = (prob * 100).toFixed(1)
                                            return (
                                                <div key={lbl} style={{ marginBottom: '8px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{lbl}</span>
                                                        <span style={{ fontSize: '0.78rem', color: c, fontWeight: 600 }}>{pct}%</span>
                                                    </div>
                                                    <div style={{ background: 'var(--border)', borderRadius: '3px', height: '6px' }}>
                                                        <div style={{
                                                            width: `${pct}%`,
                                                            height: '100%',
                                                            borderRadius: '3px',
                                                            background: c,
                                                            transition: 'width 0.5s ease',
                                                        }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </div>

                        {/* Cột phải: ảnh — load từ URL trực tiếp */}
                        <div>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                {IMAGE_TYPES.map(({ key, label }) => (
                                    <button
                                        key={key}
                                        onClick={() => setActiveImg(key)}
                                        style={{
                                            padding: '5px 12px',
                                            borderRadius: 'var(--radius-sm)',
                                            border: activeImg === key
                                                ? '1px solid var(--text-accent)'
                                                : '1px solid var(--border)',
                                            background: activeImg === key
                                                ? 'rgba(126,184,247,0.15)'
                                                : 'transparent',
                                            color: activeImg === key
                                                ? 'var(--text-accent)'
                                                : 'var(--text-secondary)',
                                            fontSize: '0.78rem',
                                            fontWeight: activeImg === key ? 600 : 400,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div style={{
                                background: '#0f1117',
                                borderRadius: 'var(--radius-md)',
                                aspectRatio: '1 / 1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                            }}>
                                {urls[activeImg] ? (
                                    <img
                                        src={urls[activeImg]}
                                        alt={activeImg}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        onError={e => {
                                            e.target.style.display = 'none'
                                            e.target.parentElement.innerHTML =
                                                '<p style="color:var(--text-secondary);font-size:0.85rem">Không có ảnh</p>'
                                        }}
                                    />
                                ) : (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Không có ảnh</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// WeeklyChart — SVG thuần, không cần recharts
// ─────────────────────────────────────────────────────────────────

function WeeklyChart({ records }) {
    const data = buildWeeklyChart(records)
    const [tooltip, setTooltip] = useState(null)

    if (data.length === 0) return null

    const W = 900, H = 110
    const PL = 36, PR = 16, PT = 10, PB = 28
    const chartW = W - PL - PR
    const chartH = H - PT - PB
    const maxCount = Math.max(...data.map(d => d.count), 1)
    const n = data.length

    const pts = data.map((d, i) => ({
        x: PL + (i / Math.max(n - 1, 1)) * chartW,
        y: PT + chartH - (d.count / maxCount) * chartH,
        ...d,
    }))

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const areaPath = [
        `M${pts[0].x.toFixed(1)},${(PT + chartH).toFixed(1)}`,
        ...pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
        `L${pts[pts.length - 1].x.toFixed(1)},${(PT + chartH).toFixed(1)}`,
        'Z',
    ].join(' ')

    const yTicks = [...new Set([0, Math.round(maxCount / 2), maxCount])].sort((a, b) => a - b)

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px 14px',
            marginBottom: '20px',
        }}>
            <p style={{
                margin: '0 0 12px 0',
                color: 'var(--text-secondary)',
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
            }}>
                Tải lượng ca bệnh theo tuần
            </p>
            <div style={{ position: 'relative' }}>
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
                    onMouseLeave={() => setTooltip(null)}
                >
                    <defs>
                        <linearGradient id="wkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#7eb8f7" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#7eb8f7" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {yTicks.map(v => {
                        const gy = PT + chartH - (v / maxCount) * chartH
                        return (
                            <g key={v}>
                                <line x1={PL} y1={gy} x2={W - PR} y2={gy}
                                    stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                <text x={PL - 4} y={gy + 4} textAnchor="end"
                                    fill="rgba(255,255,255,0.35)" fontSize="10">{v}</text>
                            </g>
                        )
                    })}

                    <path d={areaPath} fill="url(#wkGrad)" />
                    <path d={linePath} fill="none" stroke="#7eb8f7" strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" />

                    {pts.map((p, i) => (
                        <g key={i}>
                            <circle cx={p.x} cy={p.y} r="3.5" fill="#7eb8f7" />
                            <rect
                                x={p.x - 20} y={PT} width={40} height={chartH + PB}
                                fill="transparent"
                                onMouseEnter={() => setTooltip({ x: p.x, y: p.y, week: p.week, count: p.count })}
                            />
                            <text x={p.x} y={H - 4} textAnchor="middle"
                                fill="rgba(255,255,255,0.4)" fontSize="10">{p.week}</text>
                        </g>
                    ))}

                    {tooltip && (
                        <g>
                            <rect
                                x={Math.min(tooltip.x + 8, W - 90)}
                                y={Math.max(tooltip.y - 36, PT)}
                                width={82} height={30} rx="5"
                                fill="#1a1d28" stroke="rgba(126,184,247,0.3)" strokeWidth="1"
                            />
                            <text
                                x={Math.min(tooltip.x + 8, W - 90) + 8}
                                y={Math.max(tooltip.y - 36, PT) + 12}
                                fill="rgba(255,255,255,0.5)" fontSize="9"
                            >
                                {tooltip.week}
                            </text>
                            <text
                                x={Math.min(tooltip.x + 8, W - 90) + 8}
                                y={Math.max(tooltip.y - 36, PT) + 24}
                                fill="#7eb8f7" fontSize="11" fontWeight="600"
                            >
                                {tooltip.count} ca bệnh
                            </text>
                        </g>
                    )}
                </svg>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// FilterChip
// ─────────────────────────────────────────────────────────────────

function FilterChip({ label, active, color, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '4px 13px',
                borderRadius: '20px',
                border: active
                    ? `1px solid ${color || 'var(--text-accent)'}`
                    : '1px solid var(--border)',
                background: active
                    ? color ? `${color}20` : 'rgba(126,184,247,0.12)'
                    : 'transparent',
                color: active
                    ? color || 'var(--text-accent)'
                    : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
            }}
        >
            {label}
        </button>
    )
}

// ─────────────────────────────────────────────────────────────────
// HistoryPage
// ─────────────────────────────────────────────────────────────────

function HistoryPage() {
    const toast = useAppToast()
    const [records, setRecords] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [filterModel, setFilterModel] = useState('all')
    const [filterLabel, setFilterLabel] = useState('all')
    const [page, setPage] = useState(1)
    const [selectedRecord, setSelectedRecord] = useState(null)
    const [deletingId, setDeletingId] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null)

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const modelParam = filterModel === 'all' ? null : filterModel
            const data = await getHistory(100, modelParam)
            setRecords(data.history || [])
            setPage(1)
        } catch {
            const msg = 'Không thể tải lịch sử. Đảm bảo backend đang chạy.'
            setError(msg)
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }, [filterModel, toast])

    useEffect(() => { fetchHistory() }, [fetchHistory])
    useEffect(() => { setPage(1) }, [filterLabel])

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return
        const { id, filename } = confirmDelete
        setConfirmDelete(null)
        setDeletingId(id)
        try {
            await axios.delete(`http://localhost:8000/api/history/${id}`)
            setRecords(prev => prev.filter(r => r.id !== id))
            if (selectedRecord?.id === id) setSelectedRecord(null)
            toast.success(`Đã xóa "${filename}"`)
        } catch {
            toast.error('Không xóa được record. Thử lại sau.')
        } finally {
            setDeletingId(null)
        }
    }

    const filtered = filterLabel === 'all' ? records : records.filter(r => r.label === filterLabel)
    const uniqueLabels = [...new Set(records.map(r => r.label))]
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const safePage = Math.min(page, totalPages)
    const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

    const COLS = '1fr 280px 250px 180px 52px'

    return (
        <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '28px 32px' }}>

            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px 0' }}>Lịch sử phân tích</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                    {loading ? 'Đang tải...' : `${filtered.length} / ${records.length} records`}
                </p>
            </div>

            {/* Biểu đồ tuần */}
            {!loading && records.length > 0 && <WeeklyChart records={records} />}

            {/* Filters */}
            <div style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                padding: '12px 20px',
                marginBottom: '14px',
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                    }}>
                        Model:
                    </span>
                    {[
                        { val: 'all', label: 'Tất cả' },
                        { val: 'pneunet_3class', label: '3 nhãn' },
                        { val: 'pneunet_4class', label: '4 nhãn' },
                    ].map(({ val, label }) => (
                        <FilterChip key={val} label={label} active={filterModel === val}
                            onClick={() => setFilterModel(val)} />
                    ))}
                </div>

                <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                    <span style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                    }}>
                        Nhãn:
                    </span>
                    <FilterChip label="Tất cả" active={filterLabel === 'all'} onClick={() => setFilterLabel('all')} />
                    {uniqueLabels.map(lbl => (
                        <FilterChip key={lbl} label={lbl} active={filterLabel === lbl}
                            color={LABEL_COLOR[lbl]} onClick={() => setFilterLabel(lbl)} />
                    ))}
                </div>

                <button
                    onClick={fetchHistory}
                    style={{
                        padding: '7px 16px',
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    ↻ Làm mới
                </button>
            </div>

            {/* Bảng */}
            {error ? (
                <div style={{
                    padding: '20px',
                    background: 'rgba(245,138,138,0.08)',
                    border: '1px solid rgba(245,138,138,0.25)',
                    borderRadius: 'var(--radius-lg)',
                    color: '#f58a8a',
                }}>
                    ⚠️ {error}
                </div>
            ) : loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                    <span className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px' }} />
                    <p style={{ marginTop: '12px' }}>Đang tải lịch sử...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '60px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🗂️</div>
                    <p style={{ margin: 0 }}>Chưa có lịch sử phân tích nào.</p>
                </div>
            ) : (
                <>
                    <div style={{
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                    }}>
                        {/* Header bảng */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: COLS,
                            padding: '12px 20px',
                            borderBottom: '1px solid var(--border)',
                            background: '#13161f',
                        }}>
                            {['File / Thời gian', 'Chẩn đoán', 'Confidence', 'Model', ''].map(h => (
                                <span key={h} style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                }}>
                                    {h}
                                </span>
                            ))}
                        </div>

                        {/* Rows */}
                        {paged.map((r, i) => {
                            const color = LABEL_COLOR[r.label] || '#9ca3af'
                            return (
                                <div
                                    key={r.id}
                                    onClick={() => setSelectedRecord(r)}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: COLS,
                                        padding: '11px 20px',
                                        borderBottom: i < paged.length - 1 ? '1px solid var(--border)' : 'none',
                                        transition: 'background 0.12s',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* File + thumbnail */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                        <RowThumbnail recordId={r.id} />
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{
                                                color: 'var(--text-primary)',
                                                fontSize: '0.82rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontWeight: 500,
                                            }}>
                                                {r.filename}
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', marginTop: '1px' }}>
                                                {formatTime(r.timestamp)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chẩn đoán */}
                                    <div><LabelBadge label={r.label} /></div>

                                    {/* Confidence */}
                                    <span style={{ color, fontSize: '0.85rem', fontWeight: 700, fontFamily: 'monospace' }}>
                                        {(r.confidence * 100).toFixed(1)}%
                                    </span>

                                    {/* Model */}
                                    <span style={{
                                        color: '#7eb8f7',
                                        fontSize: '0.76rem',
                                        fontWeight: 600,
                                        background: 'rgba(126,184,247,0.1)',
                                        padding: '2px 10px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(126,184,247,0.3)',
                                        display: 'inline-block',
                                        width: 'fit-content',
                                    }}>
                                        {MODEL_LABEL[r.model_id] || r.model_id}
                                    </span>

                                    {/* Xóa */}
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <button
                                            onClick={e => {
                                                e.stopPropagation()
                                                setConfirmDelete({ id: r.id, filename: r.filename })
                                            }}
                                            disabled={deletingId === r.id}
                                            title="Xóa record"
                                            style={{
                                                width: '30px',
                                                height: '30px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'transparent',
                                                border: '1px solid rgba(245,138,138,0.25)',
                                                borderRadius: 'var(--radius-sm)',
                                                color: '#f58a8a',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                opacity: deletingId === r.id ? 0.4 : 1,
                                            }}
                                        >
                                            {deletingId === r.id ? '…' : '🗑'}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Phân trang */}
                    {totalPages > 1 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            marginTop: '16px',
                        }}>
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                                style={paginBtn(safePage === 1)}
                            >
                                ‹
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                                .reduce((acc, n, idx, arr) => {
                                    if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…')
                                    acc.push(n)
                                    return acc
                                }, [])
                                .map((n, idx) =>
                                    n === '…' ? (
                                        <span key={`ellipsis-${idx}`} style={{ color: 'var(--text-secondary)', padding: '0 4px' }}>…</span>
                                    ) : (
                                        <button key={n} onClick={() => setPage(n)} style={paginBtn(false, n === safePage)}>
                                            {n}
                                        </button>
                                    )
                                )
                            }

                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                                style={paginBtn(safePage === totalPages)}
                            >
                                ›
                            </button>

                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: '8px' }}>
                                Trang {safePage} / {totalPages}
                            </span>
                        </div>
                    )}
                </>
            )}

            {/* Modal xem chi tiết */}
            {selectedRecord && (
                <DetailModal
                    record={selectedRecord}
                    onClose={() => setSelectedRecord(null)}
                />
            )}

            {/* Modal xác nhận xóa */}
            {confirmDelete && (
                <ConfirmDeleteModal
                    filename={confirmDelete.filename}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </div>
    )
}

// ── Pagination button style helper ──
function paginBtn(disabled, active = false) {
    return {
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        border: active ? '1px solid var(--text-accent)' : '1px solid var(--border)',
        background: active ? 'rgba(126,184,247,0.12)' : 'var(--bg-card)',
        color: active ? 'var(--text-accent)' : disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
        fontSize: '0.85rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
    }
}

export default HistoryPage