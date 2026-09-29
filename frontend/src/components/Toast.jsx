// src/components/Toast.jsx
import { useEffect, useState } from 'react'

const TYPE_CONFIG = {
    success: { icon: '✅', color: '#6dbf6d', bg: 'rgba(109,191,109,0.12)', border: 'rgba(109,191,109,0.3)' },
    error: { icon: '⚠️', color: '#f58a8a', bg: 'rgba(245,138,138,0.12)', border: 'rgba(245,138,138,0.3)' },
    warning: { icon: '⚡', color: '#f5c96a', bg: 'rgba(245,201,106,0.12)', border: 'rgba(245,201,106,0.3)' },
    info: { icon: 'ℹ️', color: '#7eb8f7', bg: 'rgba(126,184,247,0.12)', border: 'rgba(126,184,247,0.3)' },
}

// Single toast item — có animation slide-in và fade-out
function ToastItem({ toast, onRemove }) {
    const [visible, setVisible] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info

    // Slide in ngay sau khi mount
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 10)
        return () => clearTimeout(t)
    }, [])

    const handleClose = () => {
        setLeaving(true)
        setTimeout(() => onRemove(toast.id), 280)
    }

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderLeft: `3px solid ${cfg.color}`,
                borderRadius: '10px',
                minWidth: '280px',
                maxWidth: '380px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(8px)',
                // Animation: slide từ phải vào + fade
                transform: visible && !leaving ? 'translateX(0)' : 'translateX(24px)',
                opacity: visible && !leaving ? 1 : 0,
                transition: leaving
                    ? 'transform 0.28s ease-in, opacity 0.28s ease-in'
                    : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
            }}
        >
            <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>
                {cfg.icon}
            </span>

            <span style={{
                color: '#e0e0e0',
                fontSize: '0.84rem',
                lineHeight: 1.5,
                flex: 1,
            }}>
                {toast.message}
            </span>

            <button
                onClick={handleClose}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: '0 2px',
                    lineHeight: 1,
                    flexShrink: 0,
                    marginTop: '1px',
                }}
            >
                ✕
            </button>
        </div>
    )
}

// Container — fixed góc phải dưới, stack các toast từ dưới lên
export function ToastContainer({ toasts, onRemove }) {
    if (!toasts.length) return null

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            // Pointer events chỉ trên toast, không chặn click nền
            pointerEvents: 'none',
        }}>
            {toasts.map(t => (
                <div key={t.id} style={{ pointerEvents: 'auto' }}>
                    <ToastItem toast={t} onRemove={onRemove} />
                </div>
            ))}
        </div>
    )
}