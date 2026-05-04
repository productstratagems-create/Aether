import { useState, useEffect, useRef } from 'react'
import { useLocationScore } from '../hooks/useLocationScore.js'
import { SCORE_LABELS } from '../utils/constants.js'
import RadialGauge from './RadialGauge.jsx'
import ScoreSparkline from './ScoreSparkline.jsx'
import ScoreGauge from './ScoreGauge.jsx'
import SourcesPanel from './SourcesPanel.jsx'

export default function AetherScoreCard({ atmospheric, kinetic, acoustic, onSave, history }) {
  const { status, result, compute } = useLocationScore()
  const reading   = atmospheric.reading
  const savedRef  = useRef(null)
  const [delta, setDelta]           = useState(null)
  const [showSources, setShowSources] = useState(false)

  const handleCompute = () => {
    if (!reading) return
    compute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading)
  }

  useEffect(() => {
    if (status !== 'ready' || !result || result === savedRef.current) return
    savedRef.current = result
    const prevAether = history[0]?.aether ?? null
    const d = result.aether != null && prevAether != null ? result.aether - prevAether : null
    setDelta(d)
    onSave({
      id:    Date.now(),
      ts:    new Date().toISOString(),
      city:  result.city,
      lat:   atmospheric.reading?.lat ?? null,
      lon:   atmospheric.reading?.lon ?? null,
      aether: result.aether,
      scores: result.scores,
      counts: {
        policeCount: result.policeCount, bskyCount:    result.bskyCount,
        redditCount: result.redditCount, vegCount:     result.vegCount,
        aqiVal:      result.aqiVal,      pm25Val:      result.pm25Val,
        elevationM:  result.elevationM,  emCount:      result.emCount,
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
            <ScoreGauge label={SCORE_LABELS.police}   value={result.scores.police}   status={result.sources?.police?.status}   detail={result.policeCount  != null ? `${result.policeCount} hendelser/24h`   : null} />
            <ScoreGauge label={SCORE_LABELS.bluesky}  value={result.scores.bluesky}  status={result.sources?.bluesky?.status}  detail={result.bskyCount    != null ? `${result.bskyCount} innlegg/24h`      : null} />
            <ScoreGauge label={SCORE_LABELS.reddit}   value={result.scores.reddit}   status={result.sources?.reddit?.status}   detail={result.redditCount  != null ? `${result.redditCount} posts/24h`       : null} />
            <ScoreGauge label={SCORE_LABELS.traffic}  value={result.scores.traffic}  status={result.sources?.traffic?.status}  detail={result.vegCount     != null ? `${result.vegCount} vegarbeid/5 km`    : null} />
            <ScoreGauge label={SCORE_LABELS.air}      value={result.scores.air}      status={result.sources?.air?.status}      detail={result.aqiVal       != null ? `AQI ${result.aqiVal}${result.pm25Val != null ? ` · PM2.5 ${result.pm25Val.toFixed(1)}` : ''}` : null} />
            <ScoreGauge label={SCORE_LABELS.elev}     value={result.scores.elev}     status={result.sources?.elev?.status}     detail={result.elevationM   != null ? `${result.elevationM} m asl`            : null} />
            <ScoreGauge label={SCORE_LABELS.em}       value={result.scores.em}       status={result.sources?.em?.status}       detail={result.emCount      != null ? `${result.emCount} towers/5 km`         : null} />
            <ScoreGauge label={SCORE_LABELS.kinetic}  value={result.scores.kinetic}  status={result.sources?.kinetic?.status}  detail={kinetic.reading?.dominantHz  != null ? `${kinetic.reading.dominantHz.toFixed(1)} Hz`  : null} />
            <ScoreGauge label={SCORE_LABELS.acoustic} value={result.scores.acoustic} status={result.sources?.acoustic?.status} detail={acoustic.reading?.dominantHz != null ? `${acoustic.reading.dominantHz.toFixed(1)} Hz` : null} />
          </div>

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
