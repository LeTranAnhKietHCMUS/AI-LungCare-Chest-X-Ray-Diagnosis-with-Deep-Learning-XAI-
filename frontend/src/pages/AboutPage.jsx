// src/pages/AboutPage.jsx
import logoImg from './Gemini_Generated_Image_qufgpyqufgpyqufg (1)-Photoroom.png'

// ─────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────

const MODELS_DETAIL = [
    {
        name: 'U-Net — Phân đoạn phổi',
        icon: '🔲',
        color: '#c49df5',
        desc: 'Mạng encoder-decoder với skip connections, phân đoạn vùng phổi khỏi nền ảnh X-ray. Output là binary mask được xử lý hậu kỳ (morphological closing, loại bỏ vùng nhỏ) trước khi đưa vào bước phân loại.',
        specs: [
            { label: 'Input', value: '256 × 256 (grayscale)' },
            { label: 'Output', value: 'Binary mask 256 × 256' },
            { label: 'File size', value: '373 MB (.keras)' },
            { label: 'Threshold', value: 'Adaptive (mean + 0.5×std)' },
            { label: 'Post-proc', value: 'Morphological closing + remove small objects' },
            { label: 'Lung ratio', value: 'Valid: 3% – 70% of total area' },
        ],
    },
    {
        name: 'Simplified PneuNet — Phân loại bệnh',
        icon: '🧠',
        color: '#7eb8f7',
        desc: 'Kiến trúc Hybrid CNN-Transformer lấy cảm hứng từ PneuNet (Wang et al., 2023): ResNet18 trích xuất đặc trưng cục bộ, sau đó 512 channel maps được xem như 512 token và đưa qua Transformer Encoder để học quan hệ toàn cục. Một số điều chỉnh so với kiến trúc gốc nhằm giảm số tham số và phù hợp với quy mô dataset của đề tài: giữ nguyên spatial resolution 7×7 (không MaxPool thêm), dùng 3 Transformer blocks thay vì 6, và thay Flatten bằng GlobalAveragePooling trước MLP head.',
        specs: [
            { label: 'Backbone', value: 'ResNet18 (from scratch) + ViT' },
            { label: 'Input', value: '224 × 224 (grayscale, normalized [-1,1])' },
            { label: 'Tokens', value: '512 channels × embed_dim 80' },
            { label: 'Parameters', value: '~11.5M' },
            { label: '3-class size', value: '46.5 MB (.keras)' },
            { label: 'Inference', value: '~693.8 ms / ảnh (CPU)' },
        ],
    },
    {
        name: 'ScoreCAM Variant B — Giải thích XAI',
        icon: '🗺️',
        color: '#f5c96a',
        desc: 'Phương pháp XAI không cần gradient (Wang et al., 2020), phù hợp với kiến trúc Hybrid CNN-Transformer vì không phụ thuộc vào gradient flow qua các Transformer layers. Triển khai sử dụng ScoreCAM với Top-K=128 channels (chọn theo activation std) thay vì toàn bộ 512 channels như paper gốc, và bỏ bước Gaussian smoothing của SS-CAM — do trên CPU, SS-CAM gốc mất ~910s/ảnh trong khi variant này đạt ~5–10s với chất lượng heatmap tương đương.',
        specs: [
            { label: 'Method', value: 'ScoreCAM Variant B (Wang et al. 2020)' },
            { label: 'Layer', value: 'l4b2_r2 (ResNet18, 7×7×512)' },
            { label: 'Top-K', value: '128 channels (by activation std)' },
            { label: 'Baseline', value: 'Zero baseline (Xb = 0)' },
            { label: 'Colormap', value: 'INFERNO (OpenCV)' },
            { label: 'Speed', value: '~4130.2 ms / ảnh (CPU)' },
        ],
    },
]

const RAW_SOURCES = [
    { name: 'COVID-19 Radiography Database', covid: '3,616', normal: '3,500', bacterial: '—', viral: '1,345' },
    { name: 'VinBigData Dataset', covid: '—', normal: '3,500', bacterial: '—', viral: '—' },
    { name: 'COVIDx CXR-4', covid: '3,500', normal: '—', bacterial: '—', viral: '—' },
    { name: 'Chest Xrays (bacterial/viral/normal)', covid: '—', normal: '—', bacterial: '2,238', viral: '1,207' },
    { name: 'Chest X-Ray Images (Pneumonia)', covid: '—', normal: '—', bacterial: '2,780', viral: '1,493' },
    { name: 'Covid-19 Image Dataset', covid: '—', normal: '—', bacterial: '—', viral: '90' },
    { name: '3 kinds of Pneumonia', covid: '—', normal: '—', bacterial: '3,001', viral: '1,656' },
    { name: 'ChestX6 Multi-Class X-ray', covid: '—', normal: '—', bacterial: '3,000', viral: '3,013' },
]

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
    return (
        <p style={{
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
            fontWeight: 700,
            marginBottom: '16px',
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
// LogoCard
// ─────────────────────────────────────────────────────────────────

function LogoCard() {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(10,18,35,0.9) 0%, rgba(14,26,48,0.85) 50%, rgba(8,20,40,0.9) 100%)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(56,189,248,0.22)',
            padding: '28px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 0 48px rgba(56,189,248,0.07), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
            {/* CSS animations */}
            <style>{`
                @keyframes pulseRing1 {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 0.15; transform: scale(1.06); }
                }
                @keyframes pulseRing2 {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.08; transform: scale(1.1); }
                }
                @keyframes scanLine {
                    0% { top: 20%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 80%; opacity: 0; }
                }
            `}</style>

            {/* Radial glow background */}
            <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '340px', height: '340px',
                background: 'radial-gradient(circle, rgba(56,189,248,0.09) 0%, rgba(14,165,233,0.04) 45%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            {/* Top-left corner bracket */}
            <div style={{
                position: 'absolute', top: '14px', left: '14px',
                width: '16px', height: '16px',
                borderTop: '1.5px solid rgba(56,189,248,0.55)',
                borderLeft: '1.5px solid rgba(56,189,248,0.55)',
                borderRadius: '2px 0 0 0',
            }} />
            {/* Top-right corner bracket */}
            <div style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '16px', height: '16px',
                borderTop: '1.5px solid rgba(56,189,248,0.55)',
                borderRight: '1.5px solid rgba(56,189,248,0.55)',
                borderRadius: '0 2px 0 0',
            }} />
            {/* Bottom-left corner bracket */}
            <div style={{
                position: 'absolute', bottom: '14px', left: '14px',
                width: '16px', height: '16px',
                borderBottom: '1.5px solid rgba(56,189,248,0.55)',
                borderLeft: '1.5px solid rgba(56,189,248,0.55)',
                borderRadius: '0 0 0 2px',
            }} />
            {/* Bottom-right corner bracket */}
            <div style={{
                position: 'absolute', bottom: '14px', right: '14px',
                width: '16px', height: '16px',
                borderBottom: '1.5px solid rgba(56,189,248,0.55)',
                borderRight: '1.5px solid rgba(56,189,248,0.55)',
                borderRadius: '0 0 2px 0',
            }} />

            {/* Scan line */}
            <div style={{
                position: 'absolute', left: '24px', right: '24px',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.5), transparent)',
                animation: 'scanLine 4s ease-in-out infinite',
                pointerEvents: 'none',
            }} />

            {/* Logo with pulse rings */}
            <div style={{
                position: 'relative',
                width: '128px', height: '128px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1,
            }}>
                {/* Outer pulse ring */}
                <div style={{
                    position: 'absolute',
                    // 👈 Bằng 0px tức là kích thước bằng khít với khung logo
                    // 👈 Giảm âm để vòng nhỏ lại
                    inset: '-22px', // 👈 Thay đổi ở đây (càng âm to, vòng càng bự)
                    borderRadius: '50%',
                    border: '1px solid rgba(56,189,248,0.25)',
                    animation: 'pulseRing2 3.5s ease-in-out infinite 0.4s',
                }} />
                {/* Inner pulse ring */}
                <div style={{
                    position: 'absolute',
                    inset: '-10px',
                    borderRadius: '50%',
                    border: '1px solid rgba(56,189,248,0.4)',
                    animation: 'pulseRing1 3.5s ease-in-out infinite',
                }} />

                <img
                    src={logoImg}
                    alt="AI-LungCare Logo"
                    style={{
                        width: '180px',
                        height: '180px',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 0 14px rgba(56,189,248,0.5)) drop-shadow(0 0 4px rgba(14,165,233,0.3))',
                        // 🛠️ CHỈNH Ở ĐÂY: 
                        // Số đầu tiên (0px) là trục X (Trái/Phải). Số dương qua phải, số âm qua trái.
                        // Số thứ hai (15px) là trục Y (Trên/Xuống). Số dương xuống dưới, số âm lên trên.
                        transform: 'translate(-12.5px, 6px)',
                        position: 'relative',
                        zIndex: 1,
                    }}
                />
            </div>

            {/* App name & info */}
            <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                {/* App name gradient */}
                <h2 style={{
                    margin: '0 0 4px 0',
                    fontSize: '1.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    background: 'linear-gradient(90deg, #93c5fd 0%, #38bdf8 40%, #7dd3fc 80%, #bae6fd 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    AI-LungCare
                </h2>

                {/* Subtitle */}
                <p style={{
                    margin: '0 0 14px 0',
                    color: 'rgba(148,196,230,0.6)',
                    fontSize: '0.72rem',
                    letterSpacing: '2.5px',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                }}>
                    Lung X-Ray Diagnostic System
                </p>

                {/* Divider */}
                <div style={{
                    width: '56px', height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.65), transparent)',
                    margin: '0 auto 14px',
                }} />

                {/* Tech badges */}
                <div style={{ display: 'flex', gap: '7px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {[
                        { label: 'Deep Learning', color: '#7eb8f7' },
                        { label: 'XAI', color: '#f5c96a' },
                        { label: 'FastAPI', color: '#6dbf6d' },
                        { label: 'React', color: '#c49df5' },
                    ].map(({ label, color }) => (
                        <span key={label} style={{
                            padding: '3px 11px',
                            borderRadius: '20px',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color,
                            background: `${color}14`,
                            border: `1px solid ${color}30`,
                            letterSpacing: '0.3px',
                        }}>
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// AboutPage
// ─────────────────────────────────────────────────────────────────

function AboutPage() {
    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 32px' }}>

            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px 0' }}>Giới thiệu hệ thống</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                    AI-LungCare — Hệ thống hỗ trợ chẩn đoán X-ray phổi bằng Deep Learning và XAI
                </p>
            </div>

            {/* ── Logo Card + Phiên bản ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '24px',
            }}>
                {/* Logo card thay thế Tác giả & Liên hệ */}
                <LogoCard />

                <Card>
                    <SectionTitle>Phiên bản &amp; Môi trường</SectionTitle>
                    {[
                        { label: 'API version', value: '2.1.0' },
                        { label: 'Backend', value: 'FastAPI 0.137.1' },
                        { label: 'TensorFlow', value: '2.21 / Keras 3' },
                        { label: 'Python', value: '3.12.7' },
                        { label: 'Database', value: 'SQLite (SQLAlchemy Core)' },
                    ].map(({ label, value }) => (
                        <div key={label} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderBottom: '1px solid var(--border)',
                        }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
                            <span style={{ color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'monospace' }}>{value}</span>
                        </div>
                    ))}
                </Card>
            </div>

            {/* ── Mô tả Models ── */}
            <div style={{ marginBottom: '24px' }}>
                <SectionTitle>Mô tả các thành phần</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {MODELS_DETAIL.map(({ name, icon, color, desc, specs }) => (
                        <Card key={name} style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        background: `${color}18`, border: `1px solid ${color}30`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                                    }}>
                                        {icon}
                                    </div>
                                    <p style={{ color, fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>{name}</p>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.75, margin: 0 }}>
                                    {desc}
                                </p>
                            </div>

                            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
                                {specs.map(({ label, value }, i) => (
                                    <div key={label} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        padding: '7px 0',
                                        borderBottom: i < specs.length - 1 ? '1px solid var(--border)' : 'none',
                                    }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', flexShrink: 0 }}>{label}</span>
                                        <span style={{ color: 'var(--text-primary)', fontSize: '0.76rem', fontFamily: 'monospace', textAlign: 'right' }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {/* ── Dataset ── */}
            <div style={{ marginBottom: '24px' }}>
                <SectionTitle>Dữ liệu huấn luyện</SectionTitle>
                <Card style={{ padding: '0' }}>
                    {/* Note */}
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--border)',
                        background: 'rgba(126,184,247,0.04)',
                        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                    }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
                            Bảng dưới là tập ảnh <strong style={{ color: 'var(--text-primary)' }}>raw</strong> thu thập từ 8 nguồn công khai, qua 2 lần lọc trùng lặp còn <strong style={{ color: 'var(--text-primary)' }}>24,622 ảnh</strong>.
                            Tập này được dùng để phân tách và cân bằng lại thành <strong style={{ color: 'var(--text-primary)' }}>dataset_main (3-class)</strong> và <strong style={{ color: 'var(--text-primary)' }}>dataset_sub (4-class)</strong> cho huấn luyện mô hình.
                        </p>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-hover)' }}>
                                    {['Nguồn dataset', 'COVID-19', 'Normal', 'Bacterial Pneumonia', 'Viral Pneumonia'].map(h => (
                                        <th key={h} style={{
                                            padding: '10px 16px',
                                            textAlign: h === 'Nguồn dataset' ? 'left' : 'center',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 600,
                                            fontSize: '0.75rem',
                                            letterSpacing: '0.4px',
                                            borderBottom: '1px solid var(--border)',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {RAW_SOURCES.map(({ name, covid, normal, bacterial, viral }) => (
                                    <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '9px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{name}</td>
                                        {[covid, normal, bacterial, viral].map((v, j) => (
                                            <td key={j} style={{
                                                padding: '9px 16px',
                                                textAlign: 'center',
                                                color: v === '—' ? 'var(--text-secondary)' : 'var(--text-primary)',
                                                fontFamily: v === '—' ? 'inherit' : 'monospace',
                                                opacity: v === '—' ? 0.35 : 1,
                                            }}>
                                                {v}
                                            </td>
                                        ))}
                                    </tr>
                                ))}

                                {/* Lọc lần 1 */}
                                <tr style={{ background: 'rgba(245,138,138,0.06)', borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '9px 16px', color: '#f58a8a', fontWeight: 600, fontSize: '0.76rem' }}>
                                        Lọc lần 1 (ảnh trùng)
                                    </td>
                                    {['-274', '-1', '-2,258', '-2,430'].map((v, j) => (
                                        <td key={j} style={{ padding: '9px 16px', textAlign: 'center', color: '#f58a8a', fontSize: '0.76rem', fontFamily: 'monospace' }}>{v}</td>
                                    ))}
                                </tr>
                                <tr style={{ background: 'rgba(109,191,109,0.05)', borderBottom: '2px solid var(--border)' }}>
                                    <td colSpan={1} style={{ padding: '9px 16px', color: '#6dbf6d', fontWeight: 700, fontSize: '0.78rem' }}>Còn lại sau lọc lần 1</td>
                                    <td colSpan={4} style={{ padding: '9px 16px', textAlign: 'right', color: '#6dbf6d', fontWeight: 700, fontFamily: 'monospace', paddingRight: '20px' }}>18,216 ảnh</td>
                                </tr>

                                {/* Lọc lần 2 */}
                                <tr style={{ background: 'rgba(245,138,138,0.06)', borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '9px 16px', color: '#f58a8a', fontWeight: 600, fontSize: '0.76rem' }}>
                                        Lọc lần 2 (ảnh trùng)
                                    </td>
                                    {['—', '—', '-2,703', '-1,651'].map((v, j) => (
                                        <td key={j} style={{ padding: '9px 16px', textAlign: 'center', color: v === '—' ? 'var(--text-secondary)' : '#f58a8a', fontSize: '0.76rem', fontFamily: 'monospace', opacity: v === '—' ? 0.35 : 1 }}>{v}</td>
                                    ))}
                                </tr>
                                <tr style={{ background: 'rgba(109,191,109,0.05)' }}>
                                    <td colSpan={1} style={{ padding: '10px 16px', color: '#6dbf6d', fontWeight: 700, fontSize: '0.78rem' }}>Còn lại sau lọc lần 2 (tập raw cuối)</td>
                                    <td colSpan={4} style={{ padding: '10px 16px', textAlign: 'right', color: '#6dbf6d', fontWeight: 700, fontFamily: 'monospace', paddingRight: '20px' }}>24,622 ảnh</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* ── Disclaimer ── */}
            <div style={{
                padding: '16px 20px',
                background: 'rgba(245,193,106,0.07)',
                border: '1px solid rgba(245,193,106,0.28)',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
            }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
                <div>
                    <p style={{ color: '#c9a84c', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                        Lưu ý quan trọng về phạm vi sử dụng
                    </p>
                    <p style={{ color: '#a88c3a', fontSize: '0.82rem', lineHeight: 1.7, margin: 0 }}>
                        AI-LungCare là công cụ hỗ trợ chẩn đoán và <strong>không thay thế</strong> nhận định lâm sàng của bác sĩ.
                        Kết quả cần được đối chiếu với triệu chứng lâm sàng và các phương tiện chẩn đoán khác.
                        Mọi quyết định điều trị cuối cùng phải do bác sĩ có thẩm quyền đưa ra.
                    </p>
                </div>
            </div>

        </div>
    )
}

export default AboutPage