import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { classify } from './classify.js'

// ─── FFT / Spectrum utilities ─────────────────────────────────────────────────
// Shared by both Kinetic (accelerometer) and Acoustic (microphone) channels.

const FFT_SIZE        = 512   // must equal ACOUSTIC_FFT_SIZE; shared HANN window
const SPECTRUM_MAX_HZ = 20
const SPECTRUM_UPDATE_MS = 500

const HANN = (() => {
  const w = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
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
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0
      for (let j = 0; j < (len >> 1); j++) {
        const uRe = re[i + j], uIm = im[i + j]
        const half = i + j + (len >> 1)
        const vRe = re[half] * curRe - im[half] * curIm
        const vIm = re[half] * curIm + im[half] * curRe
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm
        re[half]  = uRe - vRe; im[half]  = uIm - vIm
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
  const maxBin  = Math.min(Math.ceil(SPECTRUM_MAX_HZ / freqRes), (n >> 1) - 1)

  let maxMag = 0, dominantBin = 1
  const rawMags = []
  for (let k = 0; k <= maxBin; k++) {
    const mag = Math.sqrt(re[k] ** 2 + im[k] ** 2) / n
    rawMags.push(mag)
    if (k > 0 && mag > maxMag) { maxMag = mag; dominantBin = k }
  }

  const bins = rawMags.map((mag, k) => ({
    hz:  k * freqRes,
    mag: maxMag > 0 ? Math.min(mag / maxMag, 1) : 0,
  }))

  const dominantHz = dominantBin * freqRes
  let zone = null
  if (dominantHz >= 1 && dominantHz <= 5)      zone = 'oasis'
  else if (dominantHz > 5 && dominantHz <= 12) zone = 'neutral'
  else if (dominantHz > 12)                    zone = 'stress'

  return { bins, dominantHz, zone }
}

function zoneEnergies(bins) {
  if (!bins || bins.length < 2) return null
  let oasis = 0, neutral = 0, stress = 0, total = 0
  for (const { hz, mag } of bins) {
    if (hz < 1) continue
    total += mag
    if (hz <= 5)       oasis   += mag
    else if (hz <= 12) neutral  += mag
    else               stress   += mag
  }
  if (total === 0) return null
  return {
    oasis:   Math.round((oasis   / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    stress:  Math.round((stress  / total) * 100),
  }
}

function rms(values) {
  if (!values.length) return 0
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length)
}

// ─── Kinetic Channel ──────────────────────────────────────────────────────────
// Burst mode: listen until FFT_SIZE accelerometer samples are collected,
// compute FFT, then rest 50 s before the next burst.

const KINETIC_REST_MS = 50_000

function useKineticSensor() {
  const [status, setStatus]               = useState('idle')
  const [reading, setReading]             = useState(null)
  const [restSecondsLeft, setRestSeconds] = useState(0)

  const bufferRef       = useRef([])
  const sampleRateRef   = useRef(60)
  const lastSpectrumRef = useRef(0)
  const handlerRef      = useRef(null)
  const restTimerRef    = useRef(null)
  const countdownRef    = useRef(null)

  const enterRest = useCallback(() => {
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
    bufferRef.current = []
    setStatus('resting')
    let left = Math.round(KINETIC_REST_MS / 1000)
    setRestSeconds(left)
    clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      left = Math.max(0, left - 1)
      setRestSeconds(left)
    }, 1000)
    restTimerRef.current = setTimeout(() => {
      clearInterval(countdownRef.current)
      if (handlerRef.current) {
        window.addEventListener('devicemotion', handlerRef.current)
        setStatus('active')
      }
    }, KINETIC_REST_MS)
  }, [])

  const handleMotion = useCallback((e) => {
    const { acceleration: acc, accelerationIncludingGravity: accG, interval } = e
    if (!acc && !accG) return
    if (interval > 0) {
      const rate = 1000 / interval
      // iOS Safari reports interval in seconds rather than ms; guard against it
      sampleRateRef.current = rate / FFT_SIZE > 1 ? rate / 1000 : rate
    }

    const x = acc?.x ?? accG?.x ?? 0
    const y = acc?.y ?? accG?.y ?? 0
    const z = acc?.z ?? accG?.z ?? 0

    bufferRef.current.push(z)
    if (bufferRef.current.length > FFT_SIZE) bufferRef.current.shift()

    const magnitudeRms = rms([x, y, z])
    const now = Date.now()

    if (bufferRef.current.length === FFT_SIZE && now - lastSpectrumRef.current >= SPECTRUM_UPDATE_MS) {
      lastSpectrumRef.current = now
      const spec = computeSpectrum(bufferRef.current, sampleRateRef.current)
      setReading({
        dominantHz:   spec.dominantHz,
        magnitudeRms: magnitudeRms.toFixed(3),
        zone:         spec.zone,
        energies:     zoneEnergies(spec.bins),
      })
      enterRest()
    } else {
      setReading(prev => prev
        ? { ...prev, magnitudeRms: magnitudeRms.toFixed(3) }
        : { dominantHz: null, magnitudeRms: magnitudeRms.toFixed(3), zone: null, energies: null }
      )
    }
  }, [enterRest])

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
    clearTimeout(restTimerRef.current)
    clearInterval(countdownRef.current)
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
    handlerRef.current      = null
    bufferRef.current       = []
    lastSpectrumRef.current = 0
    setStatus('idle')
    setReading(null)
    setRestSeconds(0)
  }, [])

  useEffect(() => () => {
    clearTimeout(restTimerRef.current)
    clearInterval(countdownRef.current)
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
  }, [])

  return { status, reading, restSecondsLeft, start, stop }
}

// ─── Acoustic Channel ─────────────────────────────────────────────────────────
// Burst mode: capture 10 s of microphone audio at native rate, downsample to
// 200 Hz to isolate infrasound, run FFT, rest 50 s, repeat.
// ScriptProcessorNode is used for broadest iOS Safari compatibility.

const ACOUSTIC_DOWNSAMPLE_HZ = 200
const ACOUSTIC_CAPTURE_MS    = 10_000
const ACOUSTIC_REST_MS       = 50_000
const ACOUSTIC_FFT_SIZE      = 512   // must equal FFT_SIZE to share HANN

function useAcousticSensor() {
  const [status, setStatus]               = useState('idle')
  const [reading, setReading]             = useState(null)
  const [restSecondsLeft, setRestSeconds] = useState(0)

  const activeRef    = useRef(false)
  const streamRef    = useRef(null)
  const ctxRef       = useRef(null)
  const processorRef = useRef(null)
  const bufferRef    = useRef([])
  const timerRef     = useRef(null)
  const countdownRef = useRef(null)

  const closeAudio = useCallback(() => {
    try { processorRef.current?.disconnect() } catch { /* */ }
    processorRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    try { ctxRef.current?.close() } catch { /* */ }
    ctxRef.current = null
  }, [])

  // runCycle via ref so recursive scheduling always sees the latest closeAudio
  const runCycleRef = useRef(null)
  runCycleRef.current = () => {
    if (!activeRef.current) return

    // ── Capture phase ────────────────────────────────────────────────────────
    setStatus('listening')
    bufferRef.current = []

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(stream => {
        if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const ACtx = window.AudioContext || window.webkitAudioContext
        const ctx  = new ACtx()
        ctxRef.current = ctx
        const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()

        resume.then(() => {
          if (!activeRef.current) { closeAudio(); return }

          const source = ctx.createMediaStreamSource(stream)
          const proc   = ctx.createScriptProcessor(4096, 1, 1)
          processorRef.current = proc
          const ratio  = Math.round(ctx.sampleRate / ACOUSTIC_DOWNSAMPLE_HZ)

          proc.onaudioprocess = (e) => {
            if (!activeRef.current) return
            const data = e.inputBuffer.getChannelData(0)
            // Zero output to prevent mic-to-speaker feedback
            e.outputBuffer.getChannelData(0).fill(0)
            for (let i = 0; i < data.length; i += ratio) {
              let s = 0, c = 0
              for (let j = i; j < Math.min(i + ratio, data.length); j++) { s += data[j]; c++ }
              bufferRef.current.push(s / c)
            }
          }

          // connecting to destination is required for onaudioprocess to fire on iOS
          source.connect(proc)
          proc.connect(ctx.destination)

          timerRef.current = setTimeout(() => {
            if (!activeRef.current) return
            const raw = bufferRef.current.slice(-ACOUSTIC_FFT_SIZE)
            closeAudio()

            if (raw.length >= ACOUSTIC_FFT_SIZE / 2) {
              // Zero-pad if fewer than FFT_SIZE samples were collected
              const samples = raw.length < ACOUSTIC_FFT_SIZE
                ? Float32Array.from({ length: ACOUSTIC_FFT_SIZE }, (_, i) => raw[i] ?? 0)
                : raw
              const spec = computeSpectrum(samples, ACOUSTIC_DOWNSAMPLE_HZ)
              setReading({ dominantHz: spec.dominantHz, zone: spec.zone, energies: zoneEnergies(spec.bins) })
            }

            // ── Rest phase ───────────────────────────────────────────────────
            setStatus('resting')
            let left = Math.round(ACOUSTIC_REST_MS / 1000)
            setRestSeconds(left)
            clearInterval(countdownRef.current)
            countdownRef.current = setInterval(() => {
              left = Math.max(0, left - 1)
              setRestSeconds(left)
            }, 1000)

            timerRef.current = setTimeout(() => {
              clearInterval(countdownRef.current)
              runCycleRef.current?.()
            }, ACOUSTIC_REST_MS)
          }, ACOUSTIC_CAPTURE_MS)
        })
      })
      .catch(err => {
        if (!activeRef.current) return
        const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
        setStatus(denied ? 'denied' : 'error')
        activeRef.current = false
      })
  }

  const start = useCallback(() => {
    activeRef.current = true
    runCycleRef.current?.()
  }, [])

  const stop = useCallback(() => {
    activeRef.current = false
    clearTimeout(timerRef.current)
    clearInterval(countdownRef.current)
    closeAudio()
    bufferRef.current = []
    setStatus('idle')
    setReading(null)
    setRestSeconds(0)
  }, [closeAudio])

  useEffect(() => () => {
    activeRef.current = false
    clearTimeout(timerRef.current)
    clearInterval(countdownRef.current)
    closeAudio()
  }, [closeAudio])

  return { status, reading, restSecondsLeft, start, stop }
}

// ─── Atmospheric Channel ──────────────────────────────────────────────────────

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
          const res  = await fetch(url)
          const data = await res.json()
          const pressure = data?.current?.surface_pressure
          if (pressure == null) throw new Error()
          const elevationM = data?.elevation != null ? Math.round(data.elevation) : null
          const deltaP = prevRef.current != null
            ? Math.abs(pressure - prevRef.current).toFixed(2)
            : null
          prevRef.current = pressure
          setReading({ pressureHpa: pressure.toFixed(1), deltaP, elevationM, lat: lat.toFixed(4), lon: lon.toFixed(4) })
          setStatus('ready')
        } catch { setStatus('error') }
      },
      () => setStatus('error'),
      { timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  return { status, reading, sample }
}

// ─── Location Score ───────────────────────────────────────────────────────────

function socialCalmScore(negCount) {
  return Math.max(15, Math.round(95 - Math.log10(negCount + 1) * 32))
}

function elevationScore(meters) {
  if (meters == null) return null
  return Math.min(95, Math.round(25 + Math.sqrt(Math.max(0, meters)) * 1.6))
}

function kineticCalmScore(dominantHz) {
  if (dominantHz == null) return null
  if (dominantHz < 0.1) return 90
  if (dominantHz <= 5)  return 80
  if (dominantHz <= 12) return 55
  return 25
}

function acousticCalmScore(dominantHz) {
  if (dominantHz == null) return null
  if (dominantHz < 0.1) return 90
  if (dominantHz <= 5)  return 80
  if (dominantHz <= 12) return 55
  return 25
}

function emDensityScore(count) {
  if (count == null) return null
  return Math.max(15, Math.round(95 - Math.log10(count + 1) * 40))
}

function compositeAether(layers) {
  const valid = layers.filter(v => v != null)
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
}

function useLocationScore() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  const compute = useCallback(async (lat, lon, elevationM, kineticReading, acousticReading) => {
    setStatus('computing')

    let city = 'Unknown'
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
      )
      const geo = await geoRes.json()
      city =
        geo?.address?.city    ??
        geo?.address?.town    ??
        geo?.address?.village ??
        geo?.address?.county  ??
        geo?.display_name?.split(',')[0] ??
        'Unknown'
    } catch { /* proceed */ }

    let negCount = null, socialScoreVal = null
    try {
      const wq      = encodeURIComponent(`(protest OR riot OR unrest OR conflict) "${city}"`)
      const wikiRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search` +
        `&srsearch=${wq}&srnamespace=0&srlimit=1&format=json&origin=*`
      )
      const wiki     = await wikiRes.json()
      negCount       = wiki?.query?.searchinfo?.totalhits ?? 0
      socialScoreVal = socialCalmScore(negCount)
    } catch { /* Wikipedia unavailable */ }

    let emCount = null, emScoreVal = null
    try {
      const oq =
        `[out:json][timeout:15];` +
        `(node["tower:type"="communication"](around:5000,${lat},${lon});` +
        `way["tower:type"="communication"](around:5000,${lat},${lon}););` +
        `out count;`
      const osmRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(oq)}`,
      })
      const osm  = await osmRes.json()
      emCount    = parseInt(osm?.elements?.[0]?.tags?.total ?? '0', 10)
      emScoreVal = emDensityScore(emCount)
    } catch { /* Overpass unavailable */ }

    const elev     = elevationScore(elevationM)
    const kinetic  = kineticCalmScore(kineticReading?.dominantHz ?? null)
    const acoustic = acousticCalmScore(acousticReading?.dominantHz ?? null)

    setResult({
      city, negCount, elevationM, emCount,
      scores: { social: socialScoreVal, elev, em: emScoreVal, kinetic, acoustic },
      aether: compositeAether([socialScoreVal, elev, emScoreVal, kinetic, acoustic]),
    })
    setStatus('ready')
  }, [])

  return { status, result, compute }
}

// ─── UI Components ────────────────────────────────────────────────────────────

function TierBadge({ tier }) {
  if (!tier) return null
  return (
    <span className={`tier-badge tier-${tier.id ?? tier.level}`}>
      {tier.label}{tier.note ? ` · ${tier.note}` : ''}
    </span>
  )
}

const ZONE_INFO = {
  oasis:   {
    label: 'Oasis',
    color: '#34d399', border: '#0d9488', bg: '#022c22',
    desc:  'Natural ground resonance — forests, open fields, deep earth. Restorative frequency range.',
  },
  neutral: {
    label: 'Neutral',
    color: '#9ca3af', border: '#374151', bg: '#111827',
    desc:  'Mixed field — natural and mechanical signals present. Ambiguous environment.',
  },
  stress: {
    label: 'Stress Node',
    color: '#f87171', border: '#dc2626', bg: '#1f0a0a',
    desc:  'Mechanical interference — HVAC, traffic, or industrial vibration detected.',
  },
}

function ZoneEnergyBars({ energies }) {
  if (!energies) return null
  const rows = [
    { key: 'oasis',   label: 'Oasis',      range: '1–5 Hz',   color: '#34d399', pct: energies.oasis   },
    { key: 'neutral', label: 'Neutral',     range: '5–12 Hz',  color: '#9ca3af', pct: energies.neutral },
    { key: 'stress',  label: 'Stress Node', range: '12–20 Hz', color: '#f87171', pct: energies.stress  },
  ]
  return (
    <div className="zone-bars">
      {rows.map(({ key, label, range, color, pct }) => (
        <div key={key} className="zone-bar-row">
          <span className="zone-bar-label" style={{ color }}>{label}</span>
          <div className="zone-bar-track">
            <div className="zone-bar-fill" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="zone-bar-pct">{pct}%</span>
          <span className="zone-bar-range">{range}</span>
        </div>
      ))}
    </div>
  )
}

function ZoneVerdict({ zone, dominantHz }) {
  if (!zone) return null
  const zInfo = ZONE_INFO[zone]
  return (
    <div className="zone-verdict" style={{ background: zInfo.bg, borderColor: zInfo.border }}>
      <div className="zone-verdict-top">
        <span className="zone-verdict-name" style={{ color: zInfo.color }}>{zInfo.label}</span>
        {dominantHz != null && (
          <span className="zone-verdict-hz">{dominantHz.toFixed(2)} Hz</span>
        )}
      </div>
      <p className="zone-verdict-desc">{zInfo.desc}</p>
    </div>
  )
}

function KineticCard({ sensor }) {
  const { status, reading, restSecondsLeft, start, stop } = sensor
  const isActive = status === 'active' || status === 'resting'

  return (
    <div className="card card-kinetic">
      <div className="card-header">
        <span className="card-title">Ground Signal</span>
        <span className="card-sensation">Low-frequency vibration</span>
      </div>

      {!isActive && <p className="protocol-hint">Place phone flat on concrete or stone · silence · allow 60 s</p>}
      {status === 'active'  && !reading?.energies && <p className="metric-idle" style={{ margin: '0.6rem 0' }}>Listening…</p>}
      {status === 'resting' && <p className="card-sub mode">Next burst in {restSecondsLeft} s</p>}

      {reading?.energies && <ZoneEnergyBars energies={reading.energies} />}
      <ZoneVerdict zone={reading?.zone} dominantHz={reading?.dominantHz} />

      <button
        className={`card-btn ${isActive ? 'btn-stop' : 'btn-start'}`}
        onClick={isActive ? stop : start}
        disabled={status === 'pending' || status === 'error'}
      >
        {status === 'active'  ? 'Stop'
          : status === 'resting' ? 'Stop'
          : status === 'pending' ? 'Requesting…'
          : status === 'error'   ? 'Unavailable'
          : 'Start Scan'}
      </button>
      {status === 'denied' && (
        <p className="card-hint">iOS: Settings → Safari → Motion &amp; Orientation Access</p>
      )}
    </div>
  )
}

function AcousticCard({ sensor }) {
  const { status, reading, restSecondsLeft, start, stop } = sensor
  const isActive = status === 'listening' || status === 'resting'

  return (
    <div className="card card-acoustic">
      <div className="card-header">
        <span className="card-title">Acoustic</span>
        <span className="card-sensation">Airborne infrasound</span>
      </div>

      {!isActive && status !== 'denied' && status !== 'error' && (
        <p className="protocol-hint">Place phone flat · microphone unobstructed · silence</p>
      )}
      {status === 'listening' && <p className="card-sub mode">Capturing audio…</p>}
      {status === 'resting'   && <p className="card-sub mode">Next capture in {restSecondsLeft} s</p>}

      {reading?.energies && <ZoneEnergyBars energies={reading.energies} />}
      <ZoneVerdict zone={reading?.zone} dominantHz={reading?.dominantHz} />

      <button
        className={`card-btn ${isActive ? 'btn-stop' : 'btn-start'}`}
        onClick={isActive ? stop : start}
      >
        {isActive ? 'Stop' : 'Start Scan'}
      </button>

      {status === 'denied' && <p className="card-hint">Allow microphone access in browser settings</p>}
      {status === 'error'  && <p className="card-hint">Microphone unavailable on this device</p>}
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
      {reading?.deltaP  && <div className="card-sub">ΔP {reading.deltaP} hPa · Freshness / Vitality</div>}
      {reading && !reading.deltaP && <div className="card-sub">Freshness / Vitality</div>}
      {reading && <div className="card-sub">{reading.lat}, {reading.lon}</div>}
      <button
        className="card-btn btn-start"
        onClick={sample}
        disabled={status === 'sampling'}
      >
        {status === 'sampling' ? 'Fetching…' : 'Sample Atmosphere'}
      </button>
      {status === 'error' && <p className="card-hint">Location or network unavailable</p>}
    </div>
  )
}

function ScoreGauge({ label, value, detail }) {
  if (value == null) return null
  const color = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171'
  return (
    <div className="score-row">
      <div className="score-row-head">
        <span className="score-row-label">{label}</span>
        {detail && <span className="score-row-detail">{detail}</span>}
        <span className="score-row-val" style={{ color }}>{value}</span>
      </div>
      <div className="score-bar-wrap">
        <div className="score-bar" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

function LocationScoreCard({ atmospheric, kinetic, acoustic }) {
  const { status, result, compute } = useLocationScore()
  const reading = atmospheric.reading

  const handleCompute = useCallback(() => {
    if (!reading) return
    compute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading)
  }, [reading, kinetic.reading, acoustic.reading, compute])

  return (
    <div className="card card-score">
      <div className="card-header">
        <span className="card-title">Aether Score</span>
        {result && <span className="score-location">{result.city}</span>}
      </div>

      {result?.aether != null && (
        <div className="aether-score-wrap">
          <span className="aether-score-val">{result.aether}</span>
          <span className="aether-score-sub">/100</span>
        </div>
      )}

      {result && (
        <div className="score-breakdown">
          <ScoreGauge label="Social"     value={result.scores.social}   detail={result.negCount   != null ? `${result.negCount} wiki hits`                          : null} />
          <ScoreGauge label="Terrain"    value={result.scores.elev}     detail={result.elevationM != null ? `${result.elevationM} m asl`                            : null} />
          <ScoreGauge label="EM Density" value={result.scores.em}       detail={result.emCount    != null ? `${result.emCount} towers/5 km`                         : null} />
          <ScoreGauge label="Ground"     value={result.scores.kinetic}  detail={kinetic.reading?.dominantHz  != null ? `${kinetic.reading.dominantHz.toFixed(1)} Hz`  : null} />
          <ScoreGauge label="Acoustic"   value={result.scores.acoustic} detail={acoustic.reading?.dominantHz != null ? `${acoustic.reading.dominantHz.toFixed(1)} Hz` : null} />
        </div>
      )}

      <button
        className="card-btn btn-start"
        onClick={handleCompute}
        disabled={!reading || status === 'computing'}
      >
        {status === 'computing' ? 'Analysing…' : status === 'ready' ? 'Refresh Score' : 'Score Location'}
      </button>

      {!reading && <p className="card-hint">Sample atmosphere first to obtain GPS coordinates</p>}
      {status === 'error' && <p className="card-hint">Could not reach scoring APIs — check network</p>}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const kinetic     = useKineticSensor()
  const acoustic    = useAcousticSensor()
  const atmospheric = useAtmosphericSensor()
  const [log, setLog] = useState([])

  const { k, a, archetype } = useMemo(
    () => classify(kinetic.reading, null, atmospheric.reading),
    [kinetic.reading, atmospheric.reading]
  )

  const capture = useCallback(() => {
    const { archetype: arc } = classify(kinetic.reading, null, atmospheric.reading)
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
    <div className="app">
      <header>
        <h1>The Lithos Protocol</h1>
        <p className="subtitle">Infrasonic · Acoustic · Atmospheric field mapping</p>
      </header>

      <div className="channels">
        <KineticCard  sensor={kinetic} />
        <AcousticCard sensor={acoustic} />
        <AtmosphericCard sensor={atmospheric} tier={a} />
        <LocationScoreCard atmospheric={atmospheric} kinetic={kinetic} acoustic={acoustic} />
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
        <button className="capture-btn" onClick={capture}>Capture Reading</button>
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
    </div>
  )
}
