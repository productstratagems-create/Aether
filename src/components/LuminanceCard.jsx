import SensorRing from './SensorRing.jsx'
import { LIGHT_ZONES } from '../utils/constants.js'

export default function LuminanceCard({ sensor }) {
  const { status, reading, sample } = sensor

  const zone   = reading ? LIGHT_ZONES[reading.zone] : null
  const lumPct = reading ? Math.round(reading.luminance * 100) : null

  return (
    <div className="card card-luminance">
      <div className="channel-header">
        <SensorRing
          status={status === 'sampling' ? 'active' : status === 'ready' ? 'ready' : 'idle'}
          color="#f59e0b"
        />
        <div className="channel-label">
          <div className="channel-title">Light Quality</div>
          <div className="channel-subtitle">
            {status === 'sampling' ? 'Capturing light via camera…' :
             status === 'denied'   ? 'Camera permission denied' :
             status === 'error'    ? 'Camera unavailable' :
             status === 'ready'    ? (zone?.desc ?? 'Light sampled') :
             'One-shot camera luminance · color temperature'}
          </div>
        </div>
        {reading && (
          <span className="tier-badge" style={{ color: zone?.color ?? '#9ca3af', borderColor: zone?.color ?? '#9ca3af' }}>
            {zone?.label ?? reading.zone}
          </span>
        )}
      </div>

      {reading && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.5rem 0 0.25rem' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 600, color: '#f59e0b' }}>{lumPct}%</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>luminance</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--color-text-dim)', textTransform: 'capitalize' }}>
              {reading.colorTemp}
            </span>
          </div>
          <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', margin: '0.1rem 0 0.5rem' }}>
            <div style={{
              height: '100%', borderRadius: '2px',
              width: `${lumPct}%`,
              background: `linear-gradient(to right, #78350f, #f59e0b)`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </>
      )}

      <button
        className="sensor-btn btn-luminance"
        onClick={sample}
        disabled={status === 'sampling'}
      >
        {status === 'sampling' ? 'Reading…' : status === 'ready' ? 'Re-read' : 'Read Light'}
      </button>

      {(status === 'denied' || status === 'error') && (
        <p className="card-hint">
          {status === 'denied' ? 'Allow camera access to measure light quality' : 'Camera unavailable on this device'}
        </p>
      )}
    </div>
  )
}
