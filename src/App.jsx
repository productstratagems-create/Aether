import { useState, useMemo } from 'react'
import { classify } from './classify.js'
import { lunarPhase } from './utils/lunar.js'
import { useKineticSensor }       from './hooks/useKineticSensor.js'
import { useAcousticSensor }      from './hooks/useAcousticSensor.js'
import { useAtmosphericSensor }   from './hooks/useAtmosphericSensor.js'
import { useMagnetometerSensor }  from './hooks/useMagnetometerSensor.js'
import { useLocationHistory }     from './hooks/useLocationHistory.js'
import TabBar   from './components/TabBar.jsx'
import ScanView  from './views/ScanView.jsx'
import ScoreView from './views/ScoreView.jsx'
import MapView   from './views/MapView.jsx'
import LogView   from './views/LogView.jsx'

const TODAY_LUNAR = lunarPhase()

export default function App() {
  const [tab, setTab] = useState('scan')

  const kinetic      = useKineticSensor()
  const acoustic     = useAcousticSensor()
  const atmospheric  = useAtmosphericSensor()
  const magnetometer = useMagnetometerSensor()
  const { history, save, remove, clear } = useLocationHistory()

  const { a: atmosphericTier, archetype } = useMemo(
    () => classify(kinetic.reading, null, atmospheric.reading, acoustic.reading, magnetometer.reading, null, TODAY_LUNAR),
    [kinetic.reading, atmospheric.reading, acoustic.reading, magnetometer.reading]
  )

  const sensorActive =
    kinetic.status === 'active' ||
    acoustic.status === 'listening'

  const latestScore = history[0]?.aether ?? null

  const badges = {
    scan:  sensorActive ? 'pulse' : undefined,
    score: latestScore != null ? latestScore : undefined,
    log:   history.length > 0 ? history.length : undefined,
  }

  return (
    <div className="app-shell">
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
