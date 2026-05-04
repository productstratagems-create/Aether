import { useState, useCallback } from 'react'
import { classify } from '../classify.js'
import LocationHistoryPanel from '../components/LocationHistoryPanel.jsx'

export default function LogView({ history, onRemove, onClear, kinetic, acoustic, atmospheric }) {
  const [log, setLog] = useState([])

  const capture = useCallback(() => {
    const { archetype: arc } = classify(kinetic.reading, null, atmospheric.reading, acoustic.reading)
    setLog(prev => [{
      id:          Date.now(),
      ts:          new Date().toLocaleTimeString('en-US', { hour12: false }),
      archetype:   arc?.name ?? null,
      kinetic:     kinetic.reading     ? { ...kinetic.reading }     : null,
      acoustic:    acoustic.reading    ? { ...acoustic.reading }    : null,
      atmospheric: atmospheric.reading ? { ...atmospheric.reading } : null,
    }, ...prev].slice(0, 100))
  }, [kinetic.reading, acoustic.reading, atmospheric.reading])

  return (
    <div className="view-enter" style={{ padding: '1.25rem 1rem 1rem' }}>
      <div className="capture-bar">
        <button className="capture-btn" onClick={capture}>
          Capture Reading
        </button>
        {log.length > 0 && (
          <button className="clear-btn" onClick={() => setLog([])}>
            Clear ({log.length})
          </button>
        )}
      </div>

      {log.length === 0
        ? <p className="empty-state">Capture a reading to log a multi-channel snapshot</p>
        : (
          <ul className="log-list" style={{ marginBottom: '1.5rem' }}>
            {log.map(e => (
              <li key={e.id} className="log-entry">
                <span className="log-ts">{e.ts}</span>
                <span className="log-archetype">{e.archetype ?? '—'}</span>
                <span className="log-k">
                  {e.kinetic?.dominantHz != null ? `${e.kinetic.dominantHz.toFixed(2)} Hz` : '—'}
                  {e.kinetic?.zone ? ` · ${e.kinetic.zone}` : ''}
                </span>
                <span className="log-ac">
                  {e.acoustic?.dominantHz != null ? `${e.acoustic.dominantHz.toFixed(2)} Hz` : '—'}
                  {e.acoustic?.zone ? ` · ${e.acoustic.zone}` : ''}
                </span>
                <span className="log-a">{e.atmospheric ? `${e.atmospheric.pressureHpa} hPa` : '—'}</span>
              </li>
            ))}
          </ul>
        )
      }

      <LocationHistoryPanel history={history} onRemove={onRemove} onClear={onClear} />
    </div>
  )
}
