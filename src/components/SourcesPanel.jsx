import { SOURCE_META } from '../utils/constants.js'

export default function SourcesPanel({ sources }) {
  return (
    <div className="sources-panel">
      {Object.entries(SOURCE_META).map(([key, meta]) => {
        const src = sources?.[key]
        const dotColor = src?.status === 'ok' ? '#34d399' : src?.status === 'error' ? '#ef4444' : '#374151'
        const rawText  = src?.raw
          ?? (src?.status === 'error' ? 'unavailable' : src?.status === 'skipped' ? 'not active' : '—')
        return (
          <div key={key} className="source-row">
            <span className="source-dot" style={{ background: dotColor }} />
            <span className="source-label">{meta.label}</span>
            <span className="source-domain">{meta.domain}</span>
            <span className={`source-raw${src?.status === 'error' ? ' source-raw-err' : ''}`}>{rawText}</span>
            {src?.latencyMs != null
              ? <span className="source-latency">{src.latencyMs} ms</span>
              : <span className="source-latency" />
            }
          </div>
        )
      })}
    </div>
  )
}
