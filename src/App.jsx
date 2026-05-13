import { useState, useMemo, useEffect, useRef } from 'react'
import { classify } from './classify.js'
import { lunarPhase } from './utils/lunar.js'
import { useKineticSensor }       from './hooks/useKineticSensor.js'
import { useAcousticSensor }      from './hooks/useAcousticSensor.js'
import { useAtmosphericSensor }   from './hooks/useAtmosphericSensor.js'
import { useMagnetometerSensor }  from './hooks/useMagnetometerSensor.js'
import { useLocationScore }       from './hooks/useLocationScore.js'
import { useLocationHistory }     from './hooks/useLocationHistory.js'
import { useKpIndex }             from './hooks/useKpIndex.js'
import TabBar        from './components/TabBar.jsx'
import InstrumentView from './views/InstrumentView.jsx'
import ScanView      from './views/ScanView.jsx'
import ScoreView     from './views/ScoreView.jsx'
import MapView       from './views/MapView.jsx'
import LogView       from './views/LogView.jsx'

const TODAY_LUNAR = lunarPhase()

export default function App() {
  const [expertMode, setExpertMode] = useState(false)
  const [tab, setTab]               = useState('scan')

  const kinetic      = useKineticSensor()
  const acoustic     = useAcousticSensor()
  const atmospheric  = useAtmosphericSensor()
  const magnetometer = useMagnetometerSensor()
  const kp           = useKpIndex()
  const { status: scoreStatus, result: scoreResult, compute: scoreCompute } = useLocationScore()
  const { history, save, remove, clear } = useLocationHistory()

  // Raw archetype recomputed whenever any sensor reading or Kp changes
  const { a: atmosphericTier, archetype: rawArchetype } = useMemo(
    () => classify(kinetic.reading, null, atmospheric.reading, acoustic.reading, magnetometer.reading, kp, TODAY_LUNAR),
    [kinetic.reading, atmospheric.reading, acoustic.reading, magnetometer.reading, kp]
  )

  // Stable archetype: commit only after 5 seconds of consistent raw classification
  // to prevent display flickering at zone boundaries
  const [archetype, setArchetype]   = useState(null)
  const stableTimerRef              = useRef(null)
  const pendingNameRef              = useRef(null)

  useEffect(() => {
    const name = rawArchetype?.name ?? null
    if (name === pendingNameRef.current) return
    pendingNameRef.current = name
    clearTimeout(stableTimerRef.current)
    if (archetype == null) {
      setArchetype(rawArchetype)
    } else {
      stableTimerRef.current = setTimeout(() => setArchetype(rawArchetype), 5000)
    }
  }, [rawArchetype?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(stableTimerRef.current), [])

  // Expose tier on atmospheric object for ScanView
  const atmosphericWithTier = { ...atmospheric, tier: atmosphericTier }

  const sensorActive =
    kinetic.status === 'active' ||
    acoustic.status === 'listening' || acoustic.status === 'calibrating'

  const latestScore = scoreResult?.aether ?? history[0]?.aether ?? null

  const badges = {
    scan:  sensorActive ? 'pulse' : undefined,
    score: latestScore != null ? latestScore : undefined,
    log:   history.length > 0 ? history.length : undefined,
  }

  if (!expertMode) {
    return (
      <div className="app-shell">
        <div className="app-view">
          <InstrumentView
            kinetic={kinetic}
            acoustic={acoustic}
            atmospheric={atmosphericWithTier}
            magnetometer={magnetometer}
            archetype={archetype}
            scoreStatus={scoreStatus}
            scoreResult={scoreResult}
            scoreCompute={scoreCompute}
            onExpert={() => setExpertMode(true)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* Expert mode back button */}
      <div className="expert-header">
        <button className="expert-back-btn" onClick={() => setExpertMode(false)}>
          ← Instrument
        </button>
        <span className="expert-header-title">Expert View</span>
      </div>

      <div className={`app-view${tab === 'map' ? ' app-view--flush' : ''}`}>
        {tab === 'scan' && (
          <ScanView
            kinetic={kinetic}
            acoustic={acoustic}
            atmospheric={atmospheric}
            atmosphericTier={atmosphericTier}
            magnetometer={magnetometer}
          />
        )}
        {tab === 'score' && (
          <ScoreView
            kinetic={kinetic}
            acoustic={acoustic}
            atmospheric={atmospheric}
            magnetometer={magnetometer}
            archetype={archetype}
            scoreStatus={scoreStatus}
            scoreResult={scoreResult}
            scoreCompute={scoreCompute}
            onSave={save}
            history={history}
          />
        )}
        {tab === 'map' && (
          <MapView
            history={history}
            atmospheric={atmospheric}
            latestScore={latestScore}
          />
        )}
        {tab === 'log' && (
          <LogView
            history={history}
            onRemove={remove}
            onClear={clear}
            kinetic={kinetic}
            acoustic={acoustic}
            atmospheric={atmospheric}
          />
        )}
      </div>
      <TabBar active={tab} onChange={setTab} badges={badges} />
    </div>
  )
}
