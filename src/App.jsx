import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { classify } from './classify.js'

// ─── Kinetic Channel ────────────────────────────────────────────────────────

const FFT_SIZE = 512
const SPECTRUM_MAX_HZ = 20
const SPECTRUM_UPDATE_MS = 500

const HANN = (() => {
  const w = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
  }
  return w
})()

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0
      for (let j = 0; j < (len >> 1); j++) {
        const uRe = re[i + j], uIm = im[i + j]
        const half = i + j + (len >> 1)
        const vRe = re[half] * curRe - im[half] * curIm
        const vIm = re[half] * curIm + im[half] * curRe
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm
        re[half] = uRe - vRe; im[half] = uIm - vIm
        const nr = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nr
      }
    }
  }
}

function computeSpectrum(samples, sampleRate) {
  const n = samples.length
  const mean = samples.reduce((a, b) => a + b, 0) / n
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = (samples[i] - mean) * HANN[i]
  fft(re, im)

  const freqRes = sampleRate / n
  const maxBin = Math.min(Math.ceil(SPECTRUM_MAX_HZ / freqRes), (n >> 1) - 1)

  let maxMag = 0, dominantBin = 1
  let oasisPower = 0, stressPower = 0
  const rawMags = []

  for (let k = 0; k <= maxBin; k++) {
    const mag = Math.sqrt(re[k] ** 2 + im[k] ** 2) / n
    rawMags.push(mag)
    if (k > 0 && mag > maxMag) { maxMag = mag; dominantBin = k }
    const hz = k * freqRes
    if (hz >= 1 && hz <= 5)  oasisPower  += mag * mag
    else if (hz > 12)         stressPower += mag * mag
  }

  const bins = rawMags.map((mag, k) => ({
    hz: k * freqRes,
    mag: maxMag > 0 ? Math.min(mag / maxMag, 1) : 0,
  }))

  const dominantHz = dominantBin * freqRes
  let zone = null
  if (dominantHz >= 1 && dominantHz <= 5)  zone = 'oasis'
  else if (dominantHz > 5 && dominantHz <= 12) zone = 'neutral'
  else if (dominantHz > 12) zone = 'stress'

  const totalZonePower = oasisPower + stressPower
  const balance = totalZonePower > 0 ? stressPower / totalZonePower : 0.5

  return { bins, dominantHz, zone, balance }
}

function useKineticSensor() {
  const [status, setStatus] = useState('idle')
  const [reading, setReading] = useState(null)
  const bufferRef = useRef([])
  const sampleRateRef = useRef(60)
  const lastSpectrumRef = useRef(0)
  const handlerRef = useRef(null)

  const handleMotion = useCallback((e) => {
    const { acceleration: acc, accelerationIncludingGravity: accG, interval } = e
    if (!acc && !accG) return
    if (interval > 0) sampleRateRef.current = 1000 / interval

    const x = acc?.x ?? accG?.x ?? 0
    const y = acc?.y ?? accG?.y ?? 0
    const z = acc?.z ?? accG?.z ?? 0

    bufferRef.current.push(z)
    if (bufferRef.current.length > FFT_SIZE) bufferRef.current.shift()

    const progress = bufferRef.current.length / FFT_SIZE
    const now = Date.now()

    if (bufferRef.current.length === FFT_SIZE && now - lastSpectrumRef.current >= SPECTRUM_UPDATE_MS) {
      lastSpectrumRef.current = now
      const { bins, dominantHz, zone, balance } = computeSpectrum(bufferRef.current, sampleRateRef.current)
      setReading({ dominantHz, spectrum: bins, zone, balance, progress: 1 })
    } else {
      setReading(prev => prev
        ? { ...prev, progress }
        : { dominantHz: null, spectrum: null, zone: null, balance: null, progress }
      )
    }
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
    lastSpectrumRef.current = 0
    setStatus('idle')
    setReading(null)
  }, [])

  useEffect(() => () => {
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
  }, [])

  return { status, reading, start, stop }
}

// ─── Magnetic Channel ────────────────────────────────────────────────────────

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

// ─── UI Components ───────────────────────────────────────────────────────────

function TierBadge({ tier }) {
  if (!tier) return null
  return <span className={`tier-badge tier-${tier.id ?? tier.level}`}>{tier.label}{tier.note ? ` · ${tier.note}` : ''}</span>
}

function BufferProgress({ progress }) {
  const pct = Math.round(progress * 100)
  return (
    <div className="buffer-wrap">
      <div className="buffer-track">
        <div className="buffer-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="buffer-label">{pct}%</span>
    </div>
  )
}

function Verdict({ zone, dominantHz }) {
  if (!zone) return null
  const map = {
    oasis:   { label: 'OASIS',       cls: 'verdict-oasis'   },
    neutral: { label: 'NEUTRAL',     cls: 'verdict-neutral'  },
    stress:  { label: 'STRESS NODE', cls: 'verdict-stress'   },
  }
  const { label, cls } = map[zone]
  return (
    <div className={`verdict ${cls}`}>
      <span className="verdict-label">{label}</span>
      {dominantHz != null && <span className="verdict-hz">Peak {dominantHz.toFixed(2)} Hz</span>}
    </div>
  )
}

function BalanceBar({ balance }) {
  if (balance == null) return null
  const stressPct = Math.round(balance * 100)
  const calmPct = 100 - stressPct
  return (
    <div className="balance-wrap">
      <span className="balance-lbl balance-lbl-calm">CALM</span>
      <div className="balance-track">
        <div className="balance-fill-calm"  style={{ width: `${calmPct}%` }} />
        <div className="balance-fill-stress" style={{ width: `${stressPct}%` }} />
      </div>
      <span className="balance-lbl balance-lbl-stress">STRESS</span>
    </div>
  )
}

function SpectrumGraph({ bins, dominantHz, zone }) {
  if (!bins || bins.length < 2) return null
  const W = 300, H = 64

  const toX = hz => (hz / SPECTRUM_MAX_HZ) * W
  const toY = mag => (H - 4) - mag * (H - 8)

  const points = bins
    .map(({ hz, mag }) => `${toX(hz).toFixed(1)},${toY(mag).toFixed(1)}`)
    .join(' ')

  const lineColor = zone === 'oasis' ? '#34d399' : zone === 'stress' ? '#f87171' : '#9ca3af'
  const peakX = dominantHz != null ? toX(dominantHz) : null

  return (
    <div className="spectrum-wrap">
      <svg className="spectrum-svg" width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect x="0"       y="0" width={toX(1)}            height={H} fill="#374151" opacity="0.4" />
        <rect x={toX(1)}  y="0" width={toX(5)  - toX(1)}  height={H} fill="#0d9488" opacity="0.15" />
        <rect x={toX(5)}  y="0" width={toX(12) - toX(5)}  height={H} fill="#6b7280" opacity="0.08" />
        <rect x={toX(12)} y="0" width={toX(20) - toX(12)} height={H} fill="#dc2626" opacity="0.12" />
        {peakX != null && (
          <line x1={peakX.toFixed(1)} y1="2" x2={peakX.toFixed(1)} y2={H - 2}
            stroke="#fff" strokeWidth="1" opacity="0.25" strokeDasharray="2,3" />
        )}
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="spectrum-axis">
        <span>0</span><span>5</span><span>10</span><span>15</span><span>20 Hz</span>
      </div>
    </div>
  )
}

function KineticCard({ sensor }) {
  const { status, reading, start, stop } = sensor
  const hasSpectrum = reading?.dominantHz != null

  return (
    <div className="card card-kinetic">
      <div className="card-header">
        <span className="card-title">Kinetic</span>
        <span className="card-sensation">Grounding / Weight</span>
      </div>

      {!hasSpectrum && status !== 'active' && (
        <div className="card-metric"><span className="metric-idle">—</span></div>
      )}
      {status === 'active' && !hasSpectrum && (
        <BufferProgress progress={reading?.progress ?? 0} />
      )}
      {hasSpectrum && (
        <>
          <Verdict zone={reading.zone} dominantHz={reading.dominantHz} />
          <BalanceBar balance={reading.balance} />
          <SpectrumGraph bins={reading.spectrum} dominantHz={reading.dominantHz} zone={reading.zone} />
        </>
      )}

      <p className="protocol-hint">Place flat on concrete or stone · Silence · 60 s</p>
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

function MagneticCard({ sensor, tier }) {
  const { status, reading, requestIOSPermission } = sensor
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

function AtmosphericCard({ sensor, tier }) {
  const { status, reading, sample } = sensor
  return (
    <div className="card card-atmospheric">
      <div className="card-header">
        <span className="card-title">Atmospheric</span>
        {tier
          ? (
            <span className="tier-group">
              <span className={`tier-badge tier-${tier.level}`}>{tier.label}</span>
              <span className={`tier-badge tier-${tier.trend}`}>{tier.trendLabel}</span>
            </span>
          )
          : <span className="card-sensation">Freshness / Vitality</span>
        }
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

const ZONE_LABEL = { oasis: 'Oasis', neutral: 'Neutral', stress: 'Stress' }

export default function App() {
  const kinetic = useKineticSensor()
  const magnetic = useMagneticSensor()
  const atmospheric = useAtmosphericSensor()
  const [log, setLog] = useState([])

  const { m, a, archetype } = useMemo(
    () => classify(kinetic.reading, magnetic.reading, atmospheric.reading),
    [kinetic.reading, magnetic.reading, atmospheric.reading]
  )

  const capture = useCallback(() => {
    setLog(prev => [{
      id: Date.now(),
      ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
      archetype: archetype?.name ?? null,
      kinetic: kinetic.reading ? { ...kinetic.reading } : null,
      magnetic: magnetic.reading ? { ...magnetic.reading } : null,
      atmospheric: atmospheric.reading ? { ...atmospheric.reading } : null,
    }, ...prev].slice(0, 100))
  }, [kinetic.reading, magnetic.reading, atmospheric.reading, archetype])

  return (
    <div className="app">
      <header>
        <h1>The Lithos Protocol</h1>
        <p className="subtitle">Infrasonic · Magnetic · Atmospheric field mapping</p>
      </header>

      <div className="channels">
        <KineticCard sensor={kinetic} />
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
                <span className="log-k">
                  {e.kinetic?.dominantHz != null ? `${e.kinetic.dominantHz.toFixed(2)} Hz` : '—'}
                  {e.kinetic?.zone ? ` · ${ZONE_LABEL[e.kinetic.zone]}` : ''}
                </span>
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
