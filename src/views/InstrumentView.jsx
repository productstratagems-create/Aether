import { useEffect, useRef, useState } from 'react'

function scoreColor(s) {
  if (s == null) return 'var(--color-text-dim)'
  if (s >= 70) return '#34d399'
  if (s >= 40) return '#fbbf24'
  return '#f87171'
}

const ARCHETYPE_FIELD = {
  'Still Depth':      { primary: '#312e81', secondary: '#1e1b4b', duration: '6s',   text: '#a5b4fc' },
  'Fractured Field':  { primary: '#1d4ed8', secondary: '#93c5fd', duration: '1.5s', text: '#bfdbfe' },
  'Pressure Break':   { primary: '#374151', secondary: '#78350f', duration: '3s',   text: '#d1d5db' },
  'Lunar Pull':       { primary: '#1e3a5f', secondary: '#3730a3', duration: '8s',   text: '#c7d2fe' },
  'Live Ground':      { primary: '#3b1f0a', secondary: '#92400e', duration: '2.5s', text: '#fcd34d' },
  'Dense Field':      { primary: '#7c1d1d', secondary: '#9a3412', duration: '1.8s', text: '#fca5a5' },
  'Open Channel':     { primary: '#064e3b', secondary: '#065f46', duration: '5s',   text: '#6ee7b7' },
  'Flux':             { primary: '#1f1635', secondary: '#374151', duration: '4s',   text: '#9ca3af' },
}

const IDLE_FIELD = { primary: '#0f0f1a', secondary: '#1d2b50', duration: '7s', text: 'var(--color-text-dim)' }

export default function InstrumentView({
  kinetic, acoustic, atmospheric, magnetometer,
  archetype, scoreStatus, scoreResult, scoreCompute,
  onExpert,
}) {
  // Auto-start passive sensors on mount
  useEffect(() => {
    if (kinetic.status === 'idle')      kinetic.start()
    if (magnetometer.status === 'idle') magnetometer.start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // One-tap scoring: sample atmosphere then compute score
  const [pendingScore, setPendingScore] = useState(false)

  const handleScore = () => {
    if (scoreStatus === 'computing' || atmospheric.status === 'sampling') return
    if (!atmospheric.reading) {
      setPendingScore(true)
      atmospheric.sample()
    } else {
      triggerCompute(atmospheric.reading)
    }
  }

  const pendingRef = useRef(false)
  pendingRef.current = pendingScore

  useEffect(() => {
    if (atmospheric.status === 'ready' && pendingRef.current && atmospheric.reading) {
      setPendingScore(false)
      triggerCompute(atmospheric.reading)
    }
  }, [atmospheric.status, atmospheric.reading]) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerCompute = (reading) => {
    scoreCompute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading, magnetometer?.reading ?? null, reading)
  }

  const isBusy  = pendingScore || atmospheric.status === 'sampling' || scoreStatus === 'computing'
  const score   = scoreResult?.aether ?? null
  const loc     = scoreResult?.city ?? null
  const field   = archetype ? (ARCHETYPE_FIELD[archetype.name] ?? IDLE_FIELD) : IDLE_FIELD

  // Sensor dot activity
  const magActive = magnetometer.status === 'active'
  const gndActive = kinetic.status === 'active'
  const acActive  = acoustic.status === 'listening' || acoustic.status === 'calibrating'
  const atmActive = atmospheric.status === 'ready' || atmospheric.status === 'sampling'

  return (
    <>
      {/* Full-screen ambient background */}
      <div className="field-bg" style={{
        '--field-primary':   field.primary,
        '--field-secondary': field.secondary,
        '--field-duration':  field.duration,
      }} />

      <div className="instrument-view">

        {/* Top bar: expert button + location */}
        <div className="instrument-header">
          <button className="instrument-expert-btn" onClick={onExpert} title="Expert view">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="2" y="2" width="5" height="5" rx="1" />
              <rect x="11" y="2" width="5" height="5" rx="1" />
              <rect x="2" y="11" width="5" height="5" rx="1" />
              <rect x="11" y="11" width="5" height="5" rx="1" />
            </svg>
          </button>
          {loc && <div className="instrument-location">{loc}</div>}
        </div>

        {/* Centered archetype — dominant element */}
        <div className="field-center">
          <div className="field-name" style={{ color: field.text }}>
            {archetype?.name ?? 'Sensing…'}
          </div>
          <div className="field-sensation">
            {archetype?.sensation ?? 'activate sensors to read the field'}
          </div>
        </div>

        {/* Score button */}
        <div className="field-score-action">
          <button
            className="field-score-btn"
            onClick={handleScore}
            disabled={isBusy}
          >
            {isBusy ? 'Reading field…' : score != null ? 'Rescore' : 'Score Location'}
          </button>
        </div>

        {/* Bottom strip: sensor dots + score */}
        <div className="field-bottom">
          <div className="sensor-dots">
            <span className="sensor-dot" title="Magnetic"  style={{ background: magActive ? '#60a5fa' : 'rgba(255,255,255,0.12)' }} />
            <span className="sensor-dot" title="Ground"    style={{ background: gndActive ? '#a78bfa' : 'rgba(255,255,255,0.12)' }} />
            <span className="sensor-dot" title="Acoustic"  style={{ background: acActive  ? '#fbbf24' : 'rgba(255,255,255,0.12)', cursor: acoustic.status === 'idle' ? 'pointer' : 'default' }}
              onClick={acoustic.status === 'idle' ? acoustic.start : undefined} />
            <span className="sensor-dot" title="Atmosphere" style={{ background: atmActive ? '#34d399' : 'rgba(255,255,255,0.12)' }} />
          </div>
          {score != null && (
            <span className="field-score-val" style={{ color: scoreColor(score) }}>
              {score}<span style={{ fontSize: '0.55rem', opacity: 0.6, marginLeft: '0.15rem' }}>/100</span>
            </span>
          )}
        </div>

      </div>
    </>
  )
}
