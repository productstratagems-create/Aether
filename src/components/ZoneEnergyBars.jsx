const ROWS = [
  { key: 'oasis',   label: 'Oasis',      range: '1–5 Hz',   color: '#34d399' },
  { key: 'neutral', label: 'Neutral',     range: '5–12 Hz',  color: '#9ca3af' },
  { key: 'stress',  label: 'Stress Node', range: '12–20 Hz', color: '#f87171' },
]

export default function ZoneEnergyBars({ energies }) {
  if (!energies) return null
  return (
    <div className="zone-bars">
      {ROWS.map(({ key, label, range, color }) => (
        <div key={key} className="zone-bar-row">
          <span className="zone-bar-label" style={{ color }}>{label}</span>
          <div className="zone-bar-track">
            <div className="zone-bar-fill" style={{ width: `${energies[key]}%`, background: color }} />
          </div>
          <span className="zone-bar-pct">{energies[key]}%</span>
          <span className="zone-bar-range">{range}</span>
        </div>
      ))}
    </div>
  )
}
