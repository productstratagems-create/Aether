import { useEffect, useRef, useState } from 'react'
import SensorOrb from '../components/SensorOrb.jsx'
import { GROUND_ZONES, ACOUSTIC_ZONES, MAGNETIC_ZONES } from '../utils/constants.js'

function scoreColor(s) {
  if (s == null) return 'var(--color-text-dim)'
  if (s >= 70) return '#34d399'
  if (s >= 40) return '#fbbf24'
  return '#f87171'
}

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
    scoreCompute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading, magnetometer?.reading ?? null)
  }

  const isBusy = pendingScore || atmospheric.status === 'sampling' || scoreStatus === 'computing'
  const score  = scoreResult?.aether ?? null
  const loc    = scoreResult?.city ?? atmospheric.reading ? [scoreResult?.city, scoreResult?.featureName].filter(Boolean).join(' · ') : null

  // Sensor orb data
  const magReading = magnetometer.reading
  const gndReading = kinetic.reading
  const acReading  = acoustic.reading
  const atmReading = atmospheric.reading

  const magZone  = magReading?.stability ? MAGNETIC_ZONES[magReading.stability] : null
  const gndZone  = gndReading?.zone      ? GROUND_ZONES[gndReading.zone]        : null
  const acZone   = acReading?.zone       ? ACOUSTIC_ZONES[acReading.zone]       : null

  return (
    <div className="instrument-view">

      {/* Header */}
      <div className="instrument-header">
        <button className="instrument-expert-btn" onClick={onExpert} title="Expert view">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="11" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="11" width="5" height="5" rx="1" />
            <rect x="11" y="11" width="5" height="5" rx="1" />
          </svg>
        </button>
        {loc && <div className="instrument-location">{loc}</div>}
      </div>

      {/* Archetype */}
      <div className="instrument-archetype">
        {archetype ? (
          <>
            <div className="instrument-archetype-name">{archetype.name}</div>
            <div className="instrument-archetype-sensation">{archetype.sensation}</div>
            <p className="instrument-archetype-desc">{archetype.description}</p>
          </>
        ) : (
          <>
            <div className="instrument-archetype-name" style={{ color: 'var(--color-text-dim)' }}>Sensing…</div>
            <div className="instrument-archetype-sensation">Start sensors to read the field</div>
          </>
        )}
      </div>

      {/* Sensor constellation */}
      <div className="sensor-grid">
        <SensorOrb
          label="Magnetic"
          value={magReading?.magnitude != null ? magReading.magnitude.toFixed(1) : null}
          unit="μT"
          zone={magZone?.label ?? null}
          zoneColor={magZone?.color ?? null}
          status={magnetometer.status}
          channelColor="#60a5fa"
        />
        <SensorOrb
          label="Ground"
          value={gndReading?.dominantHz != null ? gndReading.dominantHz.toFixed(1) : null}
          unit="Hz"
          zone={gndZone?.label ?? null}
          zoneColor={gndZone?.color ?? null}
          status={kinetic.status}
          channelColor="#a78bfa"
        />
        <SensorOrb
          label="Acoustic"
          value={acReading?.db ?? null}
          unit="dB"
          zone={acZone?.label ?? null}
          zoneColor={acZone?.color ?? null}
          status={acoustic.status === 'listening' ? 'active' : acoustic.status}
          channelColor="#fbbf24"
          onActivate={acoustic.status === 'idle' ? acoustic.start : null}
        />
        <SensorOrb
          label="Pressure"
          value={atmReading?.pressureHpa ?? null}
          unit=" hPa"
          zone={atmReading ? (atmospheric.tier?.trendLabel ?? 'Sampled') : null}
          zoneColor={atmReading ? '#34d399' : null}
          status={atmospheric.status === 'sampling' ? 'active' : atmospheric.status === 'ready' ? 'ready' : 'idle'}
          channelColor="#34d399"
        />
      </div>

      {/* Score */}
      <div className="instrument-score-row">
        <div className="instrument-score-val" style={{ color: scoreColor(score) }}>
          {score ?? '—'}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
          {score != null ? '/100 aether' : 'not yet scored'}
        </div>
      </div>

      <div style={{ padding: '0 1.25rem 1rem' }}>
        <button
          className="sensor-btn instrument-score-btn"
          onClick={handleScore}
          disabled={isBusy}
        >
          {isBusy ? 'Reading field…' : score != null ? 'Rescore Location' : 'Score Location'}
        </button>
      </div>

    </div>
  )
}
