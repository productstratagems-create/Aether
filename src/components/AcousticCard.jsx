import SensorRing from './SensorRing.jsx'
import { ACOUSTIC_ZONES } from '../utils/constants.js'

// dB level bar — visual meter from 0 to 100 dB
function DbMeter({ db }) {
  if (db == null) return null
  const pct   = Math.min(100, Math.max(0, db))
  const color = db < 30 ? '#34d399' : db < 50 ? '#6ee7b7' : db < 65 ? '#9ca3af' : db < 80 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ margin: '0.75rem 0 0.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1 }}>
          {db}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>dB SPL</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease, background 0.3s ease' }} />
      </div>
    </div>
  )
}

export default function AcousticCard({ sensor }) {
  const { status, reading, start, stop } = sensor
  const isActive = status === 'listening'
  const zone     = reading?.zone ?? null
  const zInfo    = zone ? ACOUSTIC_ZONES[zone] : null

  return (
    <div className="card card-acoustic">
      <div className="channel-header">
        <SensorRing status={isActive ? 'active' : status} color="#fbbf24" />
        <div className="channel-label">
          <div className="channel-title">Acoustic Level</div>
          <div className="channel-subtitle">
            {status === 'listening' ? 'Measuring…' :
             status === 'denied'   ? 'Microphone access denied' :
             status === 'error'    ? 'Microphone unavailable' :
             'Ambient sound pressure · dB SPL'}
          </div>
        </div>
        {zInfo && (
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: zInfo.color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {zInfo.label}
          </span>
        )}
      </div>

      {!isActive && status !== 'denied' && status !== 'error' && !reading && (
        <p className="protocol-hint">Continuous ambient sound level monitoring</p>
      )}

      <DbMeter db={reading?.db} />

      {zInfo && (
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0.5rem', lineHeight: 1.5 }}>
          {zInfo.desc}
        </p>
      )}

      <button
        className={`sensor-btn ${isActive ? 'btn-acoustic-stop' : 'btn-acoustic-start'}`}
        onClick={isActive ? stop : start}
      >
        {isActive ? 'Stop' : 'Start Metering'}
      </button>

      {status === 'denied' && <p className="card-hint">Allow microphone access in browser settings</p>}
      {status === 'error'  && <p className="card-hint">Microphone unavailable on this device</p>}
    </div>
  )
}
