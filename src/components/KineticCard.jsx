import SensorRing from './SensorRing.jsx'
import { GROUND_ZONES } from '../utils/constants.js'

export default function KineticCard({ sensor }) {
  const { status, reading, start, stop } = sensor
  const isActive = status === 'active'
  const zone = reading?.zone ?? null
  const zInfo = zone ? GROUND_ZONES[zone] : null

  return (
    <div className="card card-kinetic">
      <div className="channel-header">
        <SensorRing status={status} color="#a78bfa" />
        <div className="channel-label">
          <div className="channel-title">Ground Activity</div>
          <div className="channel-subtitle">
            {status === 'active' && !reading ? 'Collecting samples…' :
             status === 'pending' ? 'Requesting permission…' :
             status === 'denied'  ? 'Motion access denied' :
             status === 'error'   ? 'Unavailable on this device' :
             'Structural vibration · 5–20 Hz'}
          </div>
        </div>
        {reading?.magnitudeRms != null && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
            {typeof reading.magnitudeRms === 'number'
              ? reading.magnitudeRms.toFixed(3)
              : reading.magnitudeRms} rms
          </span>
        )}
      </div>

      {!isActive && status !== 'denied' && status !== 'error' && (
        <p className="protocol-hint">Place phone flat on a surface · keep still</p>
      )}

      {zInfo && (
        <div className="zone-verdict" style={{ background: zInfo.bg, borderColor: zInfo.border, boxShadow: `0 0 12px ${zInfo.border}` }}>
          <div className="zone-verdict-top">
            <span className="zone-verdict-name" style={{ color: zInfo.color }}>{zInfo.label}</span>
            {reading?.dominantHz != null && (
              <span className="zone-verdict-hz">{reading.dominantHz.toFixed(2)} Hz</span>
            )}
          </div>
          <p className="zone-verdict-desc">{zInfo.desc}</p>
        </div>
      )}

      <button
        className={`sensor-btn ${isActive ? 'btn-kinetic-stop' : 'btn-kinetic-start'}`}
        onClick={isActive ? stop : start}
        disabled={status === 'pending' || status === 'error'}
      >
        {isActive ? 'Stop' : status === 'pending' ? 'Requesting…' : status === 'error' ? 'Unavailable' : 'Start Scan'}
      </button>

      {status === 'denied' && (
        <p className="card-hint">iOS: Settings → Safari → Motion &amp; Orientation Access</p>
      )}
    </div>
  )
}
