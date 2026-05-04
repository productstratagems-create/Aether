import { useState, useCallback } from 'react'
import ScoreGauge from './ScoreGauge.jsx'
import CompareModal from './CompareModal.jsx'
import { SCORE_LABELS } from '../utils/constants.js'

export default function LocationHistoryPanel({ history, onRemove, onClear }) {
  const [expandedId, setExpandedId] = useState(null)
  const [pinned, setPinned]         = useState([])
  const [showCompare, setShowCompare] = useState(false)

  const togglePin = useCallback(id => {
    setPinned(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : prev.length >= 2 ? [prev[1], id] : [...prev, id]
    )
  }, [])

  const pinnedEntries = pinned.map(id => history.find(e => e.id === id)).filter(Boolean)

  if (history.length === 0) return null

  const scoreColor = s =>
    (s ?? 0) >= 70 ? '#34d399' : (s ?? 0) >= 40 ? '#fbbf24' : '#f87171'

  return (
    <section className="history-section">
      <div className="history-section-head">
        <span className="history-section-title">Saved Locations</span>
        <span className="history-section-count">{history.length}</span>
        {pinnedEntries.length === 2 && (
          <button
            onClick={() => setShowCompare(true)}
            style={{
              background: 'rgba(124 58 237 / 0.15)',
              border: '1px solid rgba(124 58 237 / 0.4)',
              color: '#a78bfa',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.25rem 0.6rem',
              borderRadius: 4,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Compare ⊕
          </button>
        )}
        {pinnedEntries.length === 1 && (
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
            Pin one more to compare
          </span>
        )}
        <button className="history-clear-btn" onClick={onClear}>Clear all</button>
      </div>

      <div className="history-list">
        {history.map((entry, i) => {
          const prev       = history[i + 1]
          const d          = entry.aether != null && prev?.aether != null ? entry.aether - prev.aether : null
          const isPinned   = pinned.includes(entry.id)
          const isExpanded = expandedId === entry.id
          const dt         = new Date(entry.ts)
          const timeStr    = dt.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
          const dateStr    = dt.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
          const sColor     = scoreColor(entry.aether)

          return (
            <div key={entry.id} className="history-entry">
              <div
                className="history-entry-header"
                onClick={() => setExpandedId(p => p === entry.id ? null : entry.id)}
              >
                <div className="history-entry-left">
                  <div className="history-entry-city">{entry.city}</div>
                  <div className="history-entry-time">{dateStr} · {timeStr}</div>
                </div>

                {d != null && (
                  <span className="history-entry-delta" style={{ color: d > 2 ? '#34d399' : d < -2 ? '#f87171' : '#6b7280' }}>
                    {d > 2 ? `▲${d}` : d < -2 ? `▼${Math.abs(d)}` : '→'}
                  </span>
                )}

                <span
                  className="history-score-pill"
                  style={{
                    color: sColor,
                    background: `${sColor}18`,
                    border: `1px solid ${sColor}44`,
                  }}
                >
                  {entry.aether ?? '—'}
                </span>

                <button
                  className={`history-pin-btn${isPinned ? ' active' : ''}`}
                  onClick={e => { e.stopPropagation(); togglePin(entry.id) }}
                  title={isPinned ? 'Unpin' : 'Pin to compare'}
                  aria-label={isPinned ? 'Unpin from compare' : 'Pin to compare'}
                >
                  ⊕
                </button>
                <button
                  className="history-delete-btn"
                  onClick={e => { e.stopPropagation(); onRemove(entry.id) }}
                  title="Remove"
                  aria-label="Remove entry"
                >
                  ✕
                </button>
              </div>

              {isExpanded && (
                <div className="history-entry-body">
                  {Object.entries(entry.scores)
                    .filter(([, v]) => v != null)
                    .map(([key, value]) => (
                      <ScoreGauge key={key} label={SCORE_LABELS[key] ?? key} value={value} />
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showCompare && pinnedEntries.length === 2 && (
        <CompareModal entries={pinnedEntries} onClose={() => setShowCompare(false)} />
      )}
    </section>
  )
}
