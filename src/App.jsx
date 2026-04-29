import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Kinetic Channel ────────────────────────────────────────────────────────
// Detects infrasonic frequency (0.1–20 Hz) from DeviceMotionEvent Z-axis
// using zero-crossing rate over a rolling sample buffer.

const BUFFER_SIZE = 256
const INFRASONIC_MIN = 0.1
const INFRASONIC_MAX = 20

function zeroCrossingFreq(samples, sampleRate) {
  if (samples.length < 4) return null
  let crossings = 0
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] > 0) !== (samples[i] > 0)) crossings++
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
    const { acceleration, interval } = e
    if (!acceleration) return
    if (interval > 0) sampleRateRef.current = 1000 / interval

    const z = acceleration.z ?? 0
    const x = acceleration.x ?? 0
    const y = acceleration.y ?? 0

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
  const cleanupRef = useRef(null)

  const pushSample = useCallback((v) => {
    samplesRef.current.push({ v, t: Date.now() })
    return rollingVariance(samplesRef)
  }, [])

  const requestIOSPermission = useCallback(async () => {
    try {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') {
        setStatus('unsupported'); return
      }
    } catch { setStatus('unsupported'); return }

    const handler = (e) => {
      const heading = e.webkitCompassHeading ?? e.alpha ?? 0
      const variance = pushSample(heading)
      setReading({ fluxVariance: variance.toFixed(3), heading: heading.toFixed(1), mode: 'orientation' })
    }
    window.addEventListener('deviceorientation', handler)
    cleanupRef.current = () => window.removeEventListener('deviceorientation', handler)
    setStatus('active')
  }, [pushSample])

  useEffect(() => {
    function startOrientation() {
      if (typeof DeviceOrientationEvent === 'undefined') { setStatus('unsupported'); return }
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        setStatus('needs-permission'); return
      }
      const handler = (e) => {
        const heading = e.webkitCompassHeading ?? e.alpha ?? 0
        const variance = pushSample(heading)
        setReading({ fluxVariance: variance.toFixed(3), heading: heading.toFixed(1), mode: 'orientation' })
      }
      window.addEventListener('deviceorientation', handler)
      cleanupRef.current = () => window.removeEventListener('deviceorientation', handler)
      setStatus('active')
    }

    if (typeof Magnetometer !== 'undefined') {
      try {
        const sensor = new Magnetometer({ frequency: 10 })
        sensor.addEventListener('reading', () => {
          const mag = Math.sqrt(sensor.x ** 2 + sensor.y ** 2 + sensor.z ** 2)
          const variance = pushSample(mag)
          setReading({ fluxVariance: variance.toFixed(3), heading: null, mode: 'magnetometer' })
        })
        sensor.addEventListener('error', startOrientation)
        sensor.start()
        cleanupRef.current = () => sensor.stop()
        setStatus('active')
      } catch { startOrientation() }
    } else {
      startOrientation()
    }

    return () => { if (cleanupRef.current) cleanupRef.current() }
  }, [pushSample])

  return { status, reading, requestIOSPermission }
}

// ─── Atmospheric Channel ─────────────────────────────────────────────────────
// Fetches current barometric pressure from Open-Meteo (free, no key)
// using the device's GPS coordinates. Computes delta between consecutive samples.

function useAtmosphericSensor() {
  const [status, setStatus] = useState('idle')
  const [reading, setReading] = useState(null)
  const prevRef = useRef(null)

  const sample = useCallback(() => {
    if (!navigator.geolocation) { setStatus('error'); return }
    setStatus('sampling')
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

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>
}

function KineticCard({ sensor }) {
  const { status, reading, start, stop } = sensor
  return (
    <div className={`card card-kinetic`}>
      <div className="card-header">
        <span className="card-title">Kinetic</span>
        <span className="card-sensation">Grounding / Weight</span>
      </div>
      <div className="card-metric">
        {reading?.freqHz != null
          ? <><span className="metric-value">{reading.freqHz.toFixed(2)}</span><span className="metric-unit"> Hz</span></>
          : status === 'active'
          ? <span className="metric-idle">&lt; 0.1 Hz (static)</span>
          : <span className="metric-idle">—</span>
        }
      </div>
      {reading && <div className="card-sub">|a| {reading.magnitudeRms} m/s²</div>}
      <button
        className={`card-btn ${status === 'active' ? 'btn-stop' : 'btn-start'}`}
        onClick={status === 'active' ? stop : start}
        disabled={status === 'pending' || status === 'error'}
      >
        {status === 'active' ? 'Stop' : status === 'pending' ? 'Requesting…' : status === 'error' ? 'Unavailable' : 'Start Sensor'}
      </button>
      {status === 'denied' && (
        <p className="card-hint">iOS: Settings → Safari → Motion &amp; Orientation Access</p>
      )}
    </div>
  )
}

function MagneticCard({ sensor }) {
  const { status, reading, requestIOSPermission } = sensor
  return (
    <div className="card card-magnetic">
      <div className="card-header">
        <span className="card-title">Magnetic</span>
        <span className="card-sensation">Clarity / Peace</span>
      </div>
      <div className="card-metric">
        {reading
          ? <><span className="metric-value">{reading.fluxVariance}</span><span className="metric-unit"> ΔμT</span></>
          : <span className="metric-idle">{status === 'active' ? 'Warming up…' : '—'}</span>
        }
      </div>
      {reading?.heading && <div className="card-sub">Heading {reading.heading}°</div>}
      {reading && <div className="card-sub mode">{reading.mode}</div>}
      {status === 'needs-permission' && (
        <button className="card-btn btn-start" onClick={requestIOSPermission}>
          Allow Compass Access
        </button>
      )}
      {status === 'unsupported' && (
        <p className="card-hint">Magnetometer not available in this browser</p>
      )}
    </div>
  )
}

function AtmosphericCard({ sensor }) {
  const { status, reading, sample } = sensor
  return (
    <div className="card card-atmospheric">
      <div className="card-header">
        <span className="card-title">Atmospheric</span>
        <span className="card-sensation">Freshness / Vitality</span>
      </div>
      <div className="card-metric">
        {reading
          ? <><span className="metric-value">{reading.pressureHpa}</span><span className="metric-unit"> hPa</span></>
          : <span className="metric-idle">{status === 'sampling' ? 'Locating…' : '—'}</span>
        }
      </div>
      {reading?.deltaP && <div className="card-sub">ΔP {reading.deltaP} hPa</div>}
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

  const capture = useCallback(() => {
    setLog(prev => [{
      id: Date.now(),
      ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
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
        <KineticCard sensor={kinetic} />
        <MagneticCard sensor={magnetic} />
        <AtmosphericCard sensor={atmospheric} />
      </div>

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
