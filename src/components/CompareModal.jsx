import { useEffect } from 'react'
import ScoreGauge from './ScoreGauge.jsx'
import { SCORE_LABELS } from '../utils/constants.js'

export default function CompareModal({ entries, onClose }) {
  const [a, b] = entries

  // Close on backdrop click
  const handleBackdrop = e => {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const scoreColor = s => s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#f87171'

  return (
    <div className="compare-backdrop" onClick={handleBackdrop}>
      <div className="compare-sheet" role="dialog" aria-modal="true" aria-label="Compare locations">
        <div className="compare-header">
          <span className="compare-title">Compare Locations</span>
          <button className="compare-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="compare-cols">
          {[a, b].map(entry => (
            <div key={entry.id}>
              <div className="compare-col-head">
                <span className="compare-city">{entry.city}</span>
                <span className="compare-score" style={{ color: scoreColor(entry.aether ?? 0) }}>
                  {entry.aether ?? '—'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {Object.entries(entry.scores)
                  .filter(([, v]) => v != null)
                  .map(([key, value]) => (
                    <ScoreGauge key={key} label={SCORE_LABELS[key] ?? key} value={value} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
