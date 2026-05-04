import SensorRing from './SensorRing.jsx'
import ZoneEnergyBars from './ZoneEnergyBars.jsx'
import ZoneVerdict from './ZoneVerdict.jsx'
import { KINETIC_REST_MS } from '../utils/constants.js'

export default function KineticCard({ sensor }) {
  const { status, reading, restSecondsLeft, start, stop } = sensor
  const isActive = status === 'active' || status === 'resting'

  return (
    <div className="card card-kinetic">
      <div className="channel-header">
        <SensorRing
          status={status}
          color="#a78bfa"
          restSecondsLeft={restSecondsLeft}
          restTotalSeconds={KINETIC_REST_MS / 1000}
        />
        <div className="channel-label">
          <div className="channel-title">Ground Signal</div>
          <div className="channel-subtitle">
            {status === 'active' && !reading?.energies ? 'Collecting samples…' :
             status === 'resting' ? `Next burst in ${restSecondsLeft} s` :
             status === 'pending' ? 'Requesting permission…' :
             status === 'denied'  ? 'Motion access denied' :
             status === 'error'   ? 'Unavailable on this device' :
             'Low-frequency vibration · 0–20 Hz'}
          </div>
        </div>
        {reading?.magnitudeRms && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
            {reading.magnitudeRms} rms
          </span>
        )}
      </div>

      {!isActive && status !== 'denied' && status !== 'error' && (
        <p className="protocol-hint">Place phone flat on concrete or stone · silence · allow 60 s</p>
      )}

      {reading?.energies && <ZoneEnergyBars energies={reading.energies} />}
      <ZoneVerdict zone={reading?.zone} dominantHz={reading?.dominantHz} />

      <button
        className={`sensor-btn ${isActive ? 'btn-kinetic-stop' : 'btn-kinetic-start'}`}
        onClick={isActive ? stop : start}
        disabled={status === 'pending' || status === 'error'}
      >
        {isActive ? 'Stop Scan' : status === 'pending' ? 'Requesting…' : status === 'error' ? 'Unavailable' : 'Start Scan'}
      </button>

      {status === 'denied' && (
        <p className="card-hint">iOS: Settings → Safari → Motion &amp; Orientation Access</p>
      )}
    </div>
  )
}
