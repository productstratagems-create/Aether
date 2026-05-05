import SensorRing from './SensorRing.jsx'
import { MAGNETIC_ZONES } from '../utils/constants.js'

// Only rendered on Android/Chrome (Generic Sensor API).
// Parent checks status !== 'unsupported' before rendering.

function FieldBar({ label, value, max, color }) {
  const pct = Math.min(100, Math.abs(value / max) * 100)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2rem 1fr 3.5rem', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{label}</span>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textAlign: 'right' }}>
        {value.toFixed(1)}
      </span>
    </div>
  )
}

export default function MagnetometerCard({ sensor }) {
  const { status, reading, start, stop } = sensor
  const isActive = status === 'active'
  const stability = reading?.stability ?? null
  const zInfo = stability ? MAGNETIC_ZONES[stability] : null

  if (status === 'unsupported') return null

  const maxField = 80  // μT — covers most Earth surface values

  return (
    <div className="card" style={{ background: '#0d1621', borderColor: 'rgba(99,179,237,0.18)' }}>
      <div className="channel-header">
        <SensorRing status={status} color="#60a5fa" />
        <div className="channel-label">
          <div className="channel-title" style={{ color: '#60a5fa' }}>Magnetic Field</div>
          <div className="channel-subtitle">
            {status === 'active'      ? 'Measuring…' :
             status === 'denied'      ? 'Sensor access denied' :
             'Local geomagnetic field · μT'}
          </div>
        </div>
        {reading?.magnitude != null && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#60a5fa', fontWeight: 700 }}>
            {reading.magnitude.toFixed(1)} μT
          </span>
        )}
      </div>

      {reading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '0.5rem 0' }}>
          <FieldBar label="X" value={reading.x} max={maxField} color="#60a5fa" />
          <FieldBar label="Y" value={reading.y} max={maxField} color="#818cf8" />
          <FieldBar label="Z" value={reading.z} max={maxField} color="#a78bfa" />
        </div>
      )}

      {reading?.delta != null && (
        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
          Δ {reading.delta > 0 ? '+' : ''}{reading.delta.toFixed(2)} μT from session baseline
        </div>
      )}

      {zInfo && (
        <div className="zone-verdict" style={{ background: 'rgba(17,24,39,0.6)', borderColor: zInfo.color + '55', boxShadow: `0 0 8px ${zInfo.color}33`, marginBottom: '0.25rem' }}>
          <div className="zone-verdict-top">
            <span className="zone-verdict-name" style={{ color: zInfo.color }}>{zInfo.label}</span>
            {reading?.variance != null && (
              <span className="zone-verdict-hz">σ {reading.variance.toFixed(2)} μT</span>
            )}
          </div>
          <p className="zone-verdict-desc">{zInfo.desc}</p>
        </div>
      )}

      <button
        className="sensor-btn"
        style={{ background: isActive ? '#dc2626' : '#1e40af', color: '#fff', marginTop: '0.75rem' }}
        onClick={isActive ? stop : start}
      >
        {isActive ? 'Stop' : 'Start Sensing'}
      </button>

      {status === 'denied' && <p className="card-hint">Sensor permission denied — try enabling in site settings</p>}
    </div>
  )
}
