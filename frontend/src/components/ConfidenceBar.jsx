// src/components/ConfidenceBar.jsx

const LABEL_COLOR = {
    'Normal': 'var(--color-normal)',
    'COVID-19': 'var(--color-covid)',
    'Pneumonia': 'var(--color-pneumonia)',
    'Bacterial Pneumonia': 'var(--color-bacterial)',
    'Viral Pneumonia': 'var(--color-viral)',
}

// Props:
//   probabilities: object dạng { "COVID-19": 0.942, "Normal": 0.04, ... }
function ConfidenceBar({ probabilities }) {
    // Chuyển object thành array và sắp xếp từ cao → thấp
    const entries = Object.entries(probabilities)
        .sort(([, a], [, b]) => b - a)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {entries.map(([label, prob]) => {
                const color = LABEL_COLOR[label] || 'var(--text-accent)'
                const pct = (prob * 100).toFixed(1)
                const isTop = entries[0][0] === label  // nhãn cao nhất

                return (
                    <div key={label}>
                        {/* Dòng label + số % */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '5px',
                        }}>
                            <span style={{
                                fontSize: '0.85rem',
                                color: isTop ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: isTop ? 600 : 400,
                            }}>
                                {label}
                            </span>
                            <span style={{
                                fontSize: '0.82rem',
                                color: isTop ? color : 'var(--text-secondary)',
                                fontWeight: isTop ? 700 : 400,
                                minWidth: '40px',
                                textAlign: 'right',
                            }}>
                                {pct}%
                            </span>
                        </div>

                        {/* Track + thanh fill */}
                        <div style={{
                            background: 'var(--border)',
                            borderRadius: '4px',
                            height: isTop ? '10px' : '7px',  // nhãn top hơi to hơn
                        }}>
                            <div style={{
                                width: `${pct}%`,
                                height: '100%',
                                borderRadius: '4px',
                                background: color,
                                opacity: isTop ? 1 : 0.5,
                                // Animation mượt khi giá trị thay đổi
                                transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                            }} />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export default ConfidenceBar