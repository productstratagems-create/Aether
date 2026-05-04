export default function ScoreGauge({ label, value, detail, status }) {
  const hasValue = value != null
  const color = hasValue
    ? (value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171')
    : 'var(--color-text-dim)'
  const dotColor = status === 'ok' ? '#34d399' : status === 'error' ? '#ef4444' : '#374151'

  return (
    <div className="score-row">
      <div className="score-row-head">
        <span className="score-dot" style={{ background: dotColor }} />
        <span className="score-row-label">{label}</span>
        {detail && <span className="score-row-detail">{detail}</span>}
        <span className="score-row-val" style={{ color: hasValue ? color : 'var(--color-text-dim)' }}>
          {hasValue ? value : '—'}
        </span>
      </div>
      <div className="score-bar-wrap">
        {hasValue && <div className="score-bar" style={{ width: `${value}%`, background: color }} />}
      </div>
    </div>
  )
}
