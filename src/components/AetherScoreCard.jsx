import { useState, useEffect, useRef } from 'react'
import { SCORE_LABELS } from '../utils/constants.js'
import RadialGauge from './RadialGauge.jsx'
import ScoreSparkline from './ScoreSparkline.jsx'
import ScoreGauge from './ScoreGauge.jsx'
import SourcesPanel from './SourcesPanel.jsx'

export default function AetherScoreCard({
  atmospheric, kinetic, acoustic, magnetometer,
  scoreStatus, scoreResult, scoreCompute,
  onSave, history,
}) {
  const reading  = atmospheric.reading
  const savedRef = useRef(null)
  const [delta, setDelta]             = useState(null)
  const [showSources, setShowSources] = useState(false)

  const handleCompute = () => {
    if (!reading) return
    scoreCompute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading, magnetometer?.reading ?? null, reading)
  }

  useEffect(() => {
    if (scoreStatus !== 'ready' || !scoreResult || scoreResult === savedRef.current) return
    savedRef.current = scoreResult
    const prevAether = history[0]?.aether ?? null
    const d = scoreResult.aether != null && prevAether != null ? scoreResult.aether - prevAether : null
    setDelta(d)
    onSave({
      id:          Date.now(),
      ts:          new Date().toISOString(),
      city:        scoreResult.city,
      featureName: scoreResult.featureName ?? null,
      lat:         atmospheric.reading?.lat ?? null,
      lon:         atmospheric.reading?.lon ?? null,
      aether:      scoreResult.aether,
      scores:      scoreResult.scores,
      meta: {
        kpValue:    scoreResult.kpValue,
        aqiVal:     scoreResult.aqiVal,
        pm25Val:    scoreResult.pm25Val,
        elevationM: scoreResult.elevationM,
      },
    })
  }, [scoreStatus, scoreResult]) // eslint-disable-line react-hooks/exhaustive-deps

  const sparkValues = [
    ...[...history].slice(0, 4).map(e => e.aether).filter(v => v != null).reverse(),
    ...(scoreResult?.aether != null ? [scoreResult.aether] : []),
  ]

  const isComputing = scoreStatus === 'computing'

  return (
    <div className="card card-score">
      <div className="channel-header" style={{ marginBottom: '0.5rem' }}>
        <div className="channel-label">
          <div className="channel-title">Aether Score</div>
          {scoreResult?.city && <div className="score-location">{scoreResult.city}</div>}
          {scoreResult?.featureName && (
            <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>{scoreResult.featureName}</div>
          )}
        </div>
        {isComputing && (
          <svg width="20" height="20" viewBox="0 0 20 20" style={{ animation: 'spin-slow 1s linear infinite', color: 'var(--color-score)', opacity: 0.7 }}>
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 15" />
          </svg>
        )}
      </div>

      <RadialGauge score={scoreResult?.aether} delta={delta} />

      {sparkValues.length >= 2 && <ScoreSparkline values={sparkValues} />}

      {scoreResult && (
        <>
          <div className="score-breakdown">
            <ScoreGauge label={SCORE_LABELS.magnetic} value={scoreResult.scores.magnetic} status={scoreResult.sources?.magnetic?.status} detail={scoreResult.sources?.magnetic?.raw ?? null} />
            <ScoreGauge label={SCORE_LABELS.kp}       value={scoreResult.scores.kp}       status={scoreResult.sources?.kp?.status}       detail={scoreResult.kpValue != null ? `Kp ${scoreResult.kpValue.toFixed(1)}` : null} />
            <ScoreGauge label={SCORE_LABELS.ground}   value={scoreResult.scores.ground}   status={scoreResult.sources?.ground?.status}   detail={scoreResult.sources?.ground?.raw ?? null} />
            <ScoreGauge label={SCORE_LABELS.air}      value={scoreResult.scores.air}      status={scoreResult.sources?.air?.status}      detail={scoreResult.aqiVal != null ? `AQI ${scoreResult.aqiVal}${scoreResult.pm25Val != null ? ` · PM2.5 ${scoreResult.pm25Val.toFixed(1)}` : ''}` : null} />
            <ScoreGauge label={SCORE_LABELS.pressure} value={scoreResult.scores.pressure} status={scoreResult.sources?.pressure?.status} detail={scoreResult.sources?.pressure?.raw ?? null} />
            <ScoreGauge label={SCORE_LABELS.acoustic} value={scoreResult.scores.acoustic} status={scoreResult.sources?.acoustic?.status} detail={scoreResult.sources?.acoustic?.raw ?? null} />
          </div>
          {scoreResult.scores.elev != null && (
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>
              Elevation context: {scoreResult.elevationM} m asl
            </div>
          )}

          <button className="sources-toggle" onClick={() => setShowSources(p => !p)}>
            Data Sources {showSources ? '▴' : '▾'}
          </button>
          {showSources && <SourcesPanel sources={scoreResult.sources} />}
        </>
      )}

      <button
        className="sensor-btn btn-score"
        onClick={handleCompute}
        disabled={!reading || isComputing}
        style={{ marginTop: '0.75rem' }}
      >
        {isComputing ? 'Analysing…' : scoreStatus === 'ready' ? 'Refresh Score' : 'Score Location'}
      </button>

      {!reading && <p className="card-hint">Sample atmosphere first (Scan tab) to obtain GPS coordinates</p>}
      {scoreStatus === 'error' && <p className="card-hint">Could not reach scoring APIs — check network</p>}
    </div>
  )
}
