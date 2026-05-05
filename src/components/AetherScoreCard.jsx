import { useState, useEffect, useRef } from 'react'
import { useLocationScore } from '../hooks/useLocationScore.js'
import { SCORE_LABELS } from '../utils/constants.js'
import RadialGauge from './RadialGauge.jsx'
import ScoreSparkline from './ScoreSparkline.jsx'
import ScoreGauge from './ScoreGauge.jsx'
import SourcesPanel from './SourcesPanel.jsx'

export default function AetherScoreCard({ atmospheric, kinetic, acoustic, magnetometer, onSave, history }) {
  const { status, result, compute } = useLocationScore()
  const reading   = atmospheric.reading
  const savedRef  = useRef(null)
  const [delta, setDelta]           = useState(null)
  const [showSources, setShowSources] = useState(false)

  const handleCompute = () => {
    if (!reading) return
    compute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading, magnetometer?.reading ?? null)
  }

  useEffect(() => {
    if (status !== 'ready' || !result || result === savedRef.current) return
    savedRef.current = result
    const prevAether = history[0]?.aether ?? null
    const d = result.aether != null && prevAether != null ? result.aether - prevAether : null
    setDelta(d)
    onSave({
      id:     Date.now(),
      ts:     new Date().toISOString(),
      city:   result.city,
      lat:    atmospheric.reading?.lat ?? null,
      lon:    atmospheric.reading?.lon ?? null,
      aether: result.aether,
      scores: result.scores,
      meta: {
        kpValue:    result.kpValue,
        aqiVal:     result.aqiVal,
        pm25Val:    result.pm25Val,
        elevationM: result.elevationM,
      },
    })
  }, [status, result]) // eslint-disable-line react-hooks/exhaustive-deps

  const sparkValues = [
    ...[...history].slice(0, 4).map(e => e.aether).filter(v => v != null).reverse(),
    ...(result?.aether != null ? [result.aether] : []),
  ]

  const isComputing = status === 'computing'

  return (
    <div className="card card-score">
      <div className="channel-header" style={{ marginBottom: '0.5rem' }}>
        <div className="channel-label">
          <div className="channel-title">Aether Score</div>
          {result?.city && <div className="score-location">{result.city}</div>}
        </div>
        {isComputing && (
          <svg width="20" height="20" viewBox="0 0 20 20" style={{ animation: 'spin-slow 1s linear infinite', color: 'var(--color-score)', opacity: 0.7 }}>
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 15" />
          </svg>
        )}
      </div>

      <RadialGauge score={result?.aether} delta={delta} />

      {sparkValues.length >= 2 && <ScoreSparkline values={sparkValues} />}

      {result && (
        <>
          <div className="score-breakdown">
            <ScoreGauge label={SCORE_LABELS.magnetic} value={result.scores.magnetic} status={result.sources?.magnetic?.status} detail={result.sources?.magnetic?.raw ?? null} />
            <ScoreGauge label={SCORE_LABELS.kp}       value={result.scores.kp}       status={result.sources?.kp?.status}       detail={result.kpValue != null ? `Kp ${result.kpValue.toFixed(1)}` : null} />
            <ScoreGauge label={SCORE_LABELS.ground}   value={result.scores.ground}   status={result.sources?.ground?.status}   detail={result.sources?.ground?.raw ?? null} />
            <ScoreGauge label={SCORE_LABELS.air}      value={result.scores.air}      status={result.sources?.air?.status}      detail={result.aqiVal != null ? `AQI ${result.aqiVal}${result.pm25Val != null ? ` · PM2.5 ${result.pm25Val.toFixed(1)}` : ''}` : null} />
            <ScoreGauge label={SCORE_LABELS.pressure} value={result.scores.pressure} status={result.sources?.pressure?.status} detail={result.sources?.pressure?.raw ?? null} />
          </div>
          {(result.scores.acoustic != null || result.scores.elev != null) && (
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0', lineHeight: 1.5 }}>
              Context (unscored):{' '}
              {result.scores.acoustic != null && `${result.scores.acoustic} dB acoustic`}
              {result.scores.acoustic != null && result.scores.elev != null && ' · '}
              {result.scores.elev != null && `${result.elevationM} m asl`}
            </div>
          )}

          <button className="sources-toggle" onClick={() => setShowSources(p => !p)}>
            Data Sources {showSources ? '▴' : '▾'}
          </button>
          {showSources && <SourcesPanel sources={result.sources} />}
        </>
      )}

      <button
        className="sensor-btn btn-score"
        onClick={handleCompute}
        disabled={!reading || isComputing}
        style={{ marginTop: '0.75rem' }}
      >
        {isComputing ? 'Analysing…' : status === 'ready' ? 'Refresh Score' : 'Score Location'}
      </button>

      {!reading && <p className="card-hint">Sample atmosphere first (Scan tab) to obtain GPS coordinates</p>}
      {status === 'error' && <p className="card-hint">Could not reach scoring APIs — check network</p>}
    </div>
  )
}
