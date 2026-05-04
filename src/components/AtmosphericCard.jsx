import SensorRing from './SensorRing.jsx'

export default function AtmosphericCard({ sensor, tier }) {
  const { status, reading, sample } = sensor

  return (
    <div className="card card-atmospheric">
      <div className="channel-header">
        <SensorRing
          status={status === 'sampling' ? 'active' : status === 'ready' ? 'ready' : 'idle'}
          color="#34d399"
        />
        <div className="channel-label">
          <div className="channel-title">Atmospheric</div>
          <div className="channel-subtitle">
            {status === 'sampling' ? 'Locating & fetching pressure…' :
             status === 'error'    ? 'Location or network unavailable' :
             'Barometric pressure · GPS location'}
          </div>
        </div>
        {tier && (
          <div className="tier-group">
            <span className={`tier-badge tier-${tier.level}`}>{tier.label}</span>
            <span className={`tier-badge tier-${tier.trend}`}>{tier.trendLabel}</span>
          </div>
        )}
      </div>

      <div className="atm-metric">
        {reading ? (
          <>
            <span className="atm-value">{reading.pressureHpa}</span>
            <span className="atm-unit">hPa</span>
          </>
        ) : (
          <span className="atm-idle">—</span>
        )}
      </div>

      {reading && (
        <div>
          {reading.deltaP && (
            <div className="atm-meta">ΔP {reading.deltaP} hPa · Freshness / Vitality</div>
          )}
          {reading.elevationM != null && (
            <div className="atm-meta">{reading.elevationM} m asl</div>
          )}
          <div className="atm-meta">{reading.lat}°N, {reading.lon}°E</div>
        </div>
      )}

      <button
        className="sensor-btn btn-atmospheric"
        onClick={sample}
        disabled={status === 'sampling'}
      >
        {status === 'sampling' ? 'Fetching…' : reading ? 'Resample' : 'Sample Atmosphere'}
      </button>

      {status === 'error' && <p className="card-hint">Location or network unavailable</p>}
    </div>
  )
}
