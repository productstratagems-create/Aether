import SensorRing from './SensorRing.jsx'
import ZoneEnergyBars from './ZoneEnergyBars.jsx'
import ZoneVerdict from './ZoneVerdict.jsx'
import { ACOUSTIC_REST_MS } from '../utils/constants.js'

export default function AcousticCard({ sensor }) {
  const { status, reading, restSecondsLeft, start, stop } = sensor
  const isActive = status === 'listening' || status === 'resting'

  return (
    <div className="card card-acoustic">
      <div className="channel-header">
        <SensorRing
          status={status}
          color="#fbbf24"
          restSecondsLeft={restSecondsLeft}
          restTotalSeconds={ACOUSTIC_REST_MS / 1000}
        />
        <div className="channel-label">
          <div className="channel-title">Acoustic</div>
          <div className="channel-subtitle">
            {status === 'listening' ? 'Capturing audio…' :
             status === 'resting'   ? `Next capture in ${restSecondsLeft} s` :
             status === 'denied'    ? 'Microphone access denied' :
             status === 'error'     ? 'Microphone unavailable' :
             'Airborne infrasound · 0–20 Hz'}
          </div>
        </div>
      </div>

      {!isActive && status !== 'denied' && status !== 'error' && (
        <p className="protocol-hint">Place phone flat · microphone unobstructed · silence</p>
      )}

      {reading?.energies && <ZoneEnergyBars energies={reading.energies} />}
      <ZoneVerdict zone={reading?.zone} dominantHz={reading?.dominantHz} />

      <button
        className={`sensor-btn ${isActive ? 'btn-acoustic-stop' : 'btn-acoustic-start'}`}
        onClick={isActive ? stop : start}
      >
        {isActive ? 'Stop Scan' : 'Start Scan'}
      </button>

      {status === 'denied' && <p className="card-hint">Allow microphone access in browser settings</p>}
      {status === 'error'  && <p className="card-hint">Microphone unavailable on this device</p>}
    </div>
  )
}
