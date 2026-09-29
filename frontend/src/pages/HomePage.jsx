// src/pages/HomePage.jsx
import { useNavigate } from 'react-router-dom'
import heroGraphic from './Gemini_Generated_Image_qufgpyqufgpyqufg (1)-Photoroom.png'

// ─────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
    {
        step: '01',
        icon: '🩻',
        title: 'Upload ảnh X-ray',
        desc: 'Chấp nhận ảnh JPEG hoặc PNG. Kéo thả hoặc click để chọn file từ máy tính.',
        color: '#7eb8f7',
    },
    {
        step: '02',
        icon: '🫁',
        title: 'U-Net phân đoạn',
        desc: 'Mô hình U-Net tự động xác định và tách vùng phổi khỏi nền ảnh (256×256).',
        color: '#c49df5',
    },
    {
        step: '03',
        icon: '🧠',
        title: 'PneuNet phân loại',
        desc: 'Mạng hybrid CNN-Transformer phân tích vùng phổi đã tách và đưa ra chẩn đoán.',
        color: '#6dbf6d',
    },
    {
        step: '04',
        icon: '🔥',
        title: 'ScoreCAM giải thích',
        desc: 'Thuật toán XAI tạo heatmap cho thấy vùng nào trên phổi ảnh hưởng đến kết quả.',
        color: '#f5c96a',
    },
]

const MODELS_INFO = [
    {
        id: '3 nhãn',
        name: 'Simplified PneuNet (3 Class)',
        labels: [
            { name: 'COVID-19', color: '#7eb8f7', bg: 'rgba(126,184,247,0.1)' },
            { name: 'Normal', color: '#6dbf6d', bg: 'rgba(109,191,109,0.1)' },
            { name: 'Pneumonia', color: '#c49df5', bg: 'rgba(196,157,245,0.1)' },
        ],
        desc: 'Phân loại 3 nhóm bệnh lý phổ biến. Phù hợp cho sàng lọc nhanh.',
        metrics: [
            { label: 'Accuracy', value: '96.91%', color: '#6dbf6d' },
            { label: 'F1-Score', value: '96.91%', color: '#7eb8f7' },
            { label: 'AUC-ROC', value: '0.9967', color: '#c49df5' },
            { label: 'Specificity', value: '98.46%', color: '#f5c96a' },
        ],
        extra: [
            { label: 'Params', value: '11.5M' },
            { label: 'Inference', value: '85.51 ± 2.67 ms' },
            { label: 'Input size', value: '224 × 224' },
        ],
    },
    {
        id: '4 nhãn',
        name: 'Simplified PneuNet (4 Class)',
        labels: [
            { name: 'Bacterial Pneumonia', color: '#f5c96a', bg: 'rgba(245,201,106,0.1)' },
            { name: 'COVID-19', color: '#7eb8f7', bg: 'rgba(126,184,247,0.1)' },
            { name: 'Normal', color: '#6dbf6d', bg: 'rgba(109,191,109,0.1)' },
            { name: 'Viral Pneumonia', color: '#f58a8a', bg: 'rgba(245,138,138,0.1)' },
        ],
        desc: 'Phân biệt viêm phổi vi khuẩn và virus. Hỗ trợ định hướng điều trị chi tiết hơn.',
        metrics: [
            { label: 'Accuracy', value: '94.94%', color: '#6dbf6d' },
            { label: 'F1-Score', value: '94.94%', color: '#7eb8f7' },
            { label: 'AUC-ROC', value: '0.9951', color: '#c49df5' },
            { label: 'Specificity', value: '98.31%', color: '#f5c96a' },
        ],
        extra: [
            { label: 'Params', value: '11.5M' },
            { label: 'Inference', value: '87.89 ± 2.90 ms' },
            { label: 'Input size', value: '224 × 224' },
        ],
    },
]

const TECH_STACK = [
    { label: 'Segmentation', value: 'U-Net (256×256)', icon: '🔲' },
    { label: 'Classification', value: 'Simplified PneuNet (CNN-ViT)', icon: '🧬' },
    { label: 'XAI', value: 'ScoreCAM Variant B (Top-K=128)', icon: '🗺️' },
    { label: 'Backend', value: 'FastAPI + SQLAlchemy + SQLite', icon: '⚙️' },
    { label: 'Frontend', value: 'React + Vite', icon: '⚛️' },
    { label: 'Input size', value: 'CLF: 224×224 · SEG: 256×256', icon: '📐' },
]

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
    return (
        <p style={{
            color: 'var(--text-primary)',
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
            fontWeight: 700,
            marginBottom: '16px',
            opacity: 0.85,
        }}>
            {children}
        </p>
    )
}

function Card({ children, style = {} }) {
    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            padding: '20px 24px',
            ...style,
        }}>
            {children}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// HomePage
// ─────────────────────────────────────────────────────────────────

function HomePage() {
    const navigate = useNavigate()

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 32px' }}>

            {/* ── Hero ── */}
            <div style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                padding: '56px 48px',
                marginBottom: '24px',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '300px',
                display: 'flex',
                alignItems: 'center',
            }}>
                {/* Decorative circle — outer (large) */}
                <div style={{
                    position: 'absolute',
                    right: '-80px',
                    top: '-80px',
                    width: '380px',
                    height: '380px',
                    borderRadius: '50%',
                    background: 'rgba(126,184,247,0.04)',
                    border: '1px solid rgba(126,184,247,0.08)',
                    pointerEvents: 'none',
                }} />

                {/* Decorative circle — inner (small) */}
                <div style={{
                    position: 'absolute',
                    right: '-60px',
                    top: '-60px',
                    width: '260px',
                    height: '260px',
                    borderRadius: '50%',
                    background: 'rgba(126,184,247,0.03)',
                    border: '1px solid rgba(126,184,247,0.06)',
                    pointerEvents: 'none',
                }} />

                {/* Hero graphic image — đè lên 2 vòng tròn */}
                <img
                    src={heroGraphic}
                    alt="AI X-ray analysis graphic"
                    style={{
                        position: 'absolute',
                        right: '48px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        height: '320px',
                        width: 'auto',
                        objectFit: 'contain',
                        opacity: 0.95,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        zIndex: 1,
                    }}
                />

                {/* Text content */}
                <div style={{ position: 'relative', maxWidth: '580px' }}>
                    <h1 style={{
                        fontSize: '2.4rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        lineHeight: 1.2,
                        marginBottom: '16px',
                    }}>
                        Hỗ trợ chẩn đoán<br />
                        <span style={{ color: 'var(--text-accent)' }}>X-ray phổi bằng AI</span>
                    </h1>

                    <p style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.92rem',
                        lineHeight: 1.75,
                        marginBottom: '32px',
                        textAlign: 'justify',
                    }}>
                        Hệ thống phân tích ảnh X-ray ngực tự động: phân đoạn vùng phổi bằng U-Net,
                        phân loại bệnh lý bằng PneuNet (CNN-ViT), và giải thích kết quả bằng ScoreCAM XAI.
                    </p>

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => navigate('/upload')}
                            style={{
                                padding: '12px 28px',
                                background: 'var(--text-accent)',
                                color: '#000',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: 700,
                                fontSize: '0.92rem',
                                cursor: 'pointer',
                            }}
                        >
                            🔍 Bắt đầu phân tích
                        </button>
                        <button
                            onClick={() => navigate('/about')}
                            style={{
                                padding: '12px 28px',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: 500,
                                fontSize: '0.92rem',
                                cursor: 'pointer',
                            }}
                        >
                            Giới thiệu hệ thống →
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Pipeline ── */}
            <div style={{ marginBottom: '24px' }}>
                <SectionLabel>Pipeline xử lý</SectionLabel>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                }}>
                    {PIPELINE_STEPS.map(({ step, icon, title, desc, color }, i) => (
                        <Card key={step} style={{ position: 'relative', overflow: 'hidden' }}>
                            <span style={{
                                position: 'absolute',
                                top: '12px',
                                right: '16px',
                                fontSize: '1.8rem',
                                fontWeight: 800,
                                color: `${color}25`,
                                lineHeight: 1,
                                userSelect: 'none',
                            }}>
                                {step}
                            </span>

                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: `${color}18`,
                                border: `1px solid ${color}30`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem',
                                marginBottom: '12px',
                            }}>
                                {icon}
                            </div>

                            <p style={{
                                color: 'var(--text-primary)',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                marginBottom: '6px',
                            }}>
                                {title}
                            </p>
                            <p style={{
                                color: 'var(--text-secondary)',
                                fontSize: '0.8rem',
                                lineHeight: 1.6,
                                margin: 0,
                            }}>
                                {desc}
                            </p>

                            {i < PIPELINE_STEPS.length - 1 && (
                                <div style={{
                                    position: 'absolute',
                                    right: '-8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--border)',
                                    fontSize: '1rem',
                                    zIndex: 1,
                                }}>
                                    ›
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            </div>

            {/* ── Models + Tech Stack ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 322px',
                gap: '16px',
                marginBottom: '24px',
            }}>

                {/* Models */}
                <div>
                    <SectionLabel>Các model phân loại</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {MODELS_INFO.map(({ id, name, labels, desc, metrics, extra }) => (
                            <Card key={id} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                                {/* Top row: badge + name + desc */}
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                                    <div style={{
                                        flexShrink: 0,
                                        padding: '6px 12px',
                                        background: 'rgba(126,184,247,0.1)',
                                        border: '1px solid rgba(126,184,247,0.2)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-accent)',
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        alignSelf: 'flex-start',
                                    }}>
                                        {id}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                                            {name}
                                        </p>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '10px' }}>
                                            {desc}
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {labels.map(({ name: lbl, color, bg }) => (
                                                <span key={lbl} style={{
                                                    padding: '3px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color,
                                                    background: bg,
                                                    border: `1px solid ${color}40`,
                                                }}>
                                                    {lbl}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div style={{ borderTop: '1px solid var(--border)' }} />

                                {/* Metrics grid */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: '8px',
                                }}>
                                    {metrics.map(({ label, value, color }) => (
                                        <div key={label} style={{
                                            background: `${color}0d`,
                                            border: `1px solid ${color}25`,
                                            borderRadius: '8px',
                                            padding: '8px 10px',
                                            textAlign: 'center',
                                        }}>
                                            <p style={{
                                                color,
                                                fontWeight: 700,
                                                fontSize: '0.95rem',
                                                marginBottom: '2px',
                                                fontFamily: 'monospace',
                                            }}>
                                                {value}
                                            </p>
                                            <p style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '0.68rem',
                                                margin: 0,
                                                fontWeight: 600,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                            }}>
                                                {label}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                {/* Extra info row */}
                                <div style={{
                                    display: 'flex',
                                    gap: '20px',
                                    paddingTop: '4px',
                                }}>
                                    {extra.map(({ label, value }) => (
                                        <div key={label} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.4px',
                                            }}>
                                                {label}:
                                            </span>
                                            <span style={{
                                                color: 'var(--text-primary)',
                                                fontSize: '0.78rem',
                                                fontFamily: 'monospace',
                                            }}>
                                                {value}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                            </Card>
                        ))}
                    </div>
                </div>

                {/* Tech Stack */}
                <div>
                    <SectionLabel>Công nghệ sử dụng</SectionLabel>
                    <Card style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {TECH_STACK.map(({ label, value, icon }, i) => (
                                <div
                                    key={label}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px',
                                        padding: '18.2px 0',
                                        borderBottom: i < TECH_STACK.length - 1 ? '1px solid var(--border)' : 'none',
                                    }}
                                >
                                    <span style={{ fontSize: '1.05rem', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                                    <div>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '2px', fontWeight: 600 }}>
                                            {label}
                                        </p>
                                        <p style={{ color: 'var(--text-primary)', fontSize: '0.82rem', margin: 0, fontFamily: 'monospace' }}>
                                            {value}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            {/* ── CTA ── */}
            <Card style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 28px',
                gap: '20px',
            }}>
                <div>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                        Sẵn sàng phân tích?
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                        Upload ảnh X-ray và nhận kết quả trong vài giây.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/upload')}
                    style={{
                        flexShrink: 0,
                        padding: '10px 24px',
                        background: 'var(--text-accent)',
                        color: '#000',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                    }}
                >
                    Phân tích ngay →
                </button>
            </Card>
        </div>
    )
}

export default HomePage