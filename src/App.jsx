import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { Magnetometer as NativeMagnetometer } from 'capacitor-magnetometer'
import { CapacitorBarometer } from '@capgo/capacitor-barometer'
import { classify } from './classify.js'

// ─── Kinetic Channel ────────────────────────────────────────────────────────
// Detects infrasonic frequency (0.1–20 Hz) from DeviceMotionEvent Z-axis
// using zero-crossing rate over a rolling sample buffer.

const BUFFER_SIZE = 256
const INFRASONIC_MIN = 0.1
const INFRASONIC_MAX = 8

function zeroCrossingFreq(samples, sampleRate) {
  if (samples.length < 4) return null
  // Subtract mean to remove DC offset (gravity when using accelerationIncludingGravity)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  let crossings = 0
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] - mean > 0) !== (samples[i] - mean > 0)) crossings++
  }
  const freq = crossings / (2 * (samples.length / sampleRate))
  return freq >= INFRASONIC_MIN && freq <= INFRASONIC_MAX ? freq : null
}

function rms(values) {
  if (!values.length) return 0
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length)
}

function useKineticSensor() {
  const [status, setStatus] = useState('idle')
  const [reading, setReading] = useState(null)
  const bufferRef = useRef([])
  const sampleRateRef = useRef(60)
  const handlerRef = useRef(null)

  const handleMotion = useCallback((e) => {
    const { acceleration: acc, accelerationIncludingGravity: accG, interval } = e
    if (!acc && !accG) return
    if (interval > 0) sampleRateRef.current = 1000 / interval

    // acceleration (without gravity) is null on many iOS devices; fall back to
    // accelerationIncludingGravity — DC offset is removed in zeroCrossingFreq
    const x = acc?.x ?? accG?.x ?? 0
    const y = acc?.y ?? accG?.y ?? 0
    const z = acc?.z ?? accG?.z ?? 0

    bufferRef.current.push(z)
    if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift()

    const freqHz = zeroCrossingFreq(bufferRef.current, sampleRateRef.current)
    const magnitudeRms = rms([x, y, z])

    setReading({ freqHz, magnitudeRms: magnitudeRms.toFixed(3) })
  }, [])

  const start = useCallback(async () => {
    if (typeof DeviceMotionEvent === 'undefined') { setStatus('error'); return }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      setStatus('pending')
      try {
        if (await DeviceMotionEvent.requestPermission() !== 'granted') {
          setStatus('denied'); return
        }
      } catch { setStatus('denied'); return }
    }
    handlerRef.current = handleMotion
    window.addEventListener('devicemotion', handleMotion)
    setStatus('active')
  }, [handleMotion])

  const stop = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('devicemotion', handlerRef.current)
      handlerRef.current = null
    }
    bufferRef.current = []
    setStatus('idle')
    setReading(null)
  }, [])

  useEffect(() => () => {
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
  }, [])

  return { status, reading, start, stop }
}

// ─── Magnetic Channel ────────────────────────────────────────────────────────
// Computes rolling flux variance (stddev) over 5 seconds.
// Uses Generic Sensor API (Magnetometer) on Android, falls back to
// DeviceOrientationEvent heading proxy on iOS.

const MAGNETIC_WINDOW_MS = 5000

function rollingVariance(samplesRef) {
  const now = Date.now()
  samplesRef.current = samplesRef.current.filter(s => now - s.t < MAGNETIC_WINDOW_MS)
  const vals = samplesRef.current.map(s => s.v)
  if (vals.length < 2) return 0
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length)
}

function useMagneticSensor() {
  const [status, setStatus] = useState('idle')
  const [reading, setReading] = useState(null)
  const samplesRef = useRef([])
  const sensorRef = useRef(null)

  const pushSample = useCallback((v) => {
    samplesRef.current.push({ v, t: Date.now() })
    return rollingVariance(samplesRef)
  }, [])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Native iOS/Android: raw μT from CoreMotion
      NativeMagnetometer.startMagnetometerUpdates({ frequency: 100 })
        .then(() => {
          NativeMagnetometer.addListener('magnetometerData', ({ x, y, z }) => {
            const mag = Math.sqrt(x ** 2 + y ** 2 + z ** 2)
            const variance = pushSample(mag)
            setReading({ fluxVariance: variance.toFixed(3) })
          })
          setStatus('active')
        })
        .catch(() => setStatus('unsupported'))
      return () => { NativeMagnetometer.stopMagnetometerUpdates() }
    }

    // Web: Generic Sensor API (Android Chrome only)
    if (typeof Magnetometer === 'undefined') { setStatus('unsupported'); return }
    try {
      const sensor = new Magnetometer({ frequency: 10 })
      sensor.addEventListener('reading', () => {
        const mag = Math.sqrt(sensor.x ** 2 + sensor.y ** 2 + sensor.z ** 2)
        const variance = pushSample(mag)
        setReading({ fluxVariance: variance.toFixed(3) })
      })
      sensor.addEventListener('error', () => setStatus('unsupported'))
      sensor.start()
      sensorRef.current = sensor
      setStatus('active')
    } catch { setStatus('unsupported') }

    return () => { if (sensorRef.current) sensorRef.current.stop() }
  }, [pushSample])

  return { status, reading }
}

// ─── Atmospheric Channel ─────────────────────────────────────────────────────
// Fetches current barometric pressure from Open-Meteo (free, no key)
// using the device's GPS coordinates. Computes delta between consecutive samples.

function useAtmosphericSensor() {
  const [status, setStatus] = useState('idle')
  const [reading, setReading] = useState(null)
  const prevRef = useRef(null)

  const sample = useCallback(async () => {
    setStatus('sampling')

    if (Capacitor.isNativePlatform()) {
      // Native: real device barometer — no GPS or network needed
      try {
        await CapacitorBarometer.startMeasurementUpdates()
        const listener = await CapacitorBarometer.addListener('measurement', async ({ pressure }) => {
          const deltaP = prevRef.current != null
            ? Math.abs(pressure - prevRef.current).toFixed(2)
            : null
          prevRef.current = pressure
          setReading({ pressureHpa: pressure.toFixed(1), deltaP, lat: null, lon: null })
          setStatus('ready')
          await listener.remove()
          CapacitorBarometer.stopMeasurementUpdates()
        })
      } catch { setStatus('error') }
      return
    }

    // Web: geolocation + Open-Meteo API
    if (!navigator.geolocation) { setStatus('error'); return }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}&current=surface_pressure&forecast_days=1`
          const res = await fetch(url)
          const data = await res.json()
          const pressure = data?.current?.surface_pressure
          if (pressure == null) throw new Error()
          const deltaP = prevRef.current != null
            ? Math.abs(pressure - prevRef.current).toFixed(2)
            : null
          prevRef.current = pressure
          setReading({ pressureHpa: pressure.toFixed(1), deltaP, lat: lat.toFixed(4), lon: lon.toFixed(4) })
          setStatus('ready')
        } catch { setStatus('error') }
      },
      () => setStatus('error'),
      { timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  return { status, reading, sample }
}

// ─── App ─────────────────────────────────────────────────────────────────────

function TierBadge({ tier }) {
  if (!tier) return null
  return <span className={`tier-badge tier-${tier.id ?? tier.level}`}>{tier.label}{tier.note ? ` · ${tier.note}` : ''}</span>
}

function KineticCard({ sensor, tier }) {
  const { status, reading, start, stop } = sensor
  return (
    <div className="card card-kinetic">
      <div className="card-header">
        <span className="card-title">Kinetic</span>
        <TierBadge tier={tier} />
      </div>
      <div className="card-metric">
        {reading?.freqHz != null
          ? <><span className="metric-value">{reading.freqHz.toFixed(2)}</span><span className="metric-unit"> Hz</span></>
          : status === 'active'
          ? <span className="metric-idle">&lt; 0.1 Hz (static)</span>
          : <span className="metric-idle">—</span>
        }
      </div>
      {reading && <div className="card-sub">|a| {reading.magnitudeRms} m/s² · Grounding / Weight</div>}
      <button
        className={`card-btn ${status === 'active' ? 'btn-stop' : 'btn-start'}`}
        onClick={status === 'active' ? stop : start}
        disabled={status === 'pending' || status === 'error'}
      >
        {status === 'active' ? 'Stop' : status === 'pending' ? 'Requesting…' : status === 'error' ? 'Unavailable' : 'Start Sensor'}
      </button>
      {status === 'active' && (
        <p className="card-hint">Place your phone on a surface for accurate readings</p>
      )}
      {status === 'denied' && (
        <p className="card-hint">iOS: Settings → Safari → Motion &amp; Orientation Access</p>
      )}
    </div>
  )
}

function MagneticCard({ sensor, tier }) {
  const { status, reading } = sensor
  return (
    <div className="card card-magnetic">
      <div className="card-header">
        <span className="card-title">Magnetic</span>
        <TierBadge tier={tier} />
      </div>
      <div className="card-metric">
        {reading
          ? <><span className="metric-value">{reading.fluxVariance}</span><span className="metric-unit"> ΔμT</span></>
          : <span className="metric-idle">{status === 'active' ? 'Warming up…' : '—'}</span>
        }
      </div>
      {reading && <div className="card-sub">Clarity / Peace</div>}
      {status === 'unsupported' && (
        <p className="card-hint">Requires Android Chrome — Apple restricts raw magnetometer access on all iOS browsers</p>
      )}
    </div>
  )
}

function AtmosphericCard({ sensor, tier }) {
  const { status, reading, sample } = sensor
  return (
    <div className="card card-atmospheric">
      <div className="card-header">
        <span className="card-title">Atmospheric</span>
        {tier && (
          <span className="tier-group">
            <span className={`tier-badge tier-${tier.level}`}>{tier.label}</span>
            <span className={`tier-badge tier-${tier.trend}`}>{tier.trendLabel}</span>
          </span>
        )}
      </div>
      <div className="card-metric">
        {reading
          ? <><span className="metric-value">{reading.pressureHpa}</span><span className="metric-unit"> hPa</span></>
          : <span className="metric-idle">{status === 'sampling' ? 'Locating…' : '—'}</span>
        }
      </div>
      {reading?.deltaP && <div className="card-sub">ΔP {reading.deltaP} hPa · Freshness / Vitality</div>}
      {reading && !reading.deltaP && <div className="card-sub">Freshness / Vitality</div>}
      {reading && <div className="card-sub">{reading.lat}, {reading.lon}</div>}
      <button
        className="card-btn btn-start"
        onClick={sample}
        disabled={status === 'sampling'}
      >
        {status === 'sampling' ? 'Fetching…' : 'Sample Atmosphere'}
      </button>
      {status === 'error' && (
        <p className="card-hint">Location or network unavailable</p>
      )}
    </div>
  )
}

export default function App() {
  const kinetic = useKineticSensor()
  const magnetic = useMagneticSensor()
  const atmospheric = useAtmosphericSensor()
  const [log, setLog] = useState([])

  const { k, m, a, archetype } = useMemo(
    () => classify(kinetic.reading, magnetic.reading, atmospheric.reading),
    [kinetic.reading, magnetic.reading, atmospheric.reading]
  )

  const capture = useCallback(() => {
    const { archetype: arc } = classify(kinetic.reading, magnetic.reading, atmospheric.reading)
    setLog(prev => [{
      id: Date.now(),
      ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
      archetype: arc?.name ?? null,
      kinetic: kinetic.reading ? { ...kinetic.reading } : null,
      magnetic: magnetic.reading ? { ...magnetic.reading } : null,
      atmospheric: atmospheric.reading ? { ...atmospheric.reading } : null,
    }, ...prev].slice(0, 100))
  }, [kinetic.reading, magnetic.reading, atmospheric.reading])

  return (
    <div className="app">
      <header>
        <h1>The Lithos Protocol</h1>
        <p className="subtitle">Infrasonic · Magnetic · Atmospheric field mapping</p>
      </header>

      <div className="channels">
        <KineticCard sensor={kinetic} tier={k} />
        <MagneticCard sensor={magnetic} tier={m} />

        <AtmosphericCard sensor={atmospheric} tier={a} />
      </div>

      {archetype && (
        <div className="archetype-panel">
          <div className="archetype-header">
            <span className="archetype-name">{archetype.name}</span>
            <span className="archetype-sensation">{archetype.sensation}</span>
          </div>
          <p className="archetype-desc">{archetype.description}</p>
        </div>
      )}

      <div className="actions">
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
          <ul className="log">
            {log.map(e => (
              <li key={e.id} className="log-entry">
                <span className="log-ts">{e.ts}</span>
                <span className="log-archetype">{e.archetype ?? '—'}</span>
                <span className="log-k">{e.kinetic?.freqHz != null ? `${e.kinetic.freqHz.toFixed(2)} Hz` : '—'}</span>
                <span className="log-m">{e.magnetic ? `Δ${e.magnetic.fluxVariance} μT` : '—'}</span>
                <span className="log-a">{e.atmospheric ? `${e.atmospheric.pressureHpa} hPa` : '—'}</span>
              </li>
            ))}
          </ul>
        )
      }
    </div>
  )
}
