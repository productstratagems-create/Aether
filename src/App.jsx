import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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

function policeScore(count) {
  if (count == null) return null
  // 0 incidents → 90, 3 → 62, 8 → 15 (clamped to 20)
  return Math.max(20, Math.round(90 - count * 9.3))
}

function blueskyScore(count) {
  if (count == null) return null
  // 0 posts → 88, 5 → 74, 15 → 47, 25 → 20
  return Math.max(20, Math.round(88 - count * 2.7))
}

function vegvesenScore(count) {
  if (count == null) return null
  // 0 works → 88, 3 → 75, 8 → 52, 15+ → 20
  return Math.max(20, Math.round(88 - count * 4.5))
}

function airQualityScore(aqi) {
  if (aqi == null) return null
  // European AQI: 0 → 92, 20 → 74, 40 → 56, 60 → 38, 80+ → 20
  return Math.max(20, Math.round(92 - aqi * 0.9))
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

function redditScore(count) {
  if (count == null) return null
  // 0 posts → 86, 5 → 71, 15 → 44, 25+ → 20
  return Math.max(20, Math.round(86 - count * 2.6))
}

function emDensityScore(count) {
  if (count == null) return null
  return Math.max(15, Math.round(95 - Math.log10(count + 1) * 40))
}

function compositeAether(layers) {
  const valid = layers.filter(v => v != null)
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
}

const SCORE_LABELS = {
  police: 'Police Log', bluesky: 'Bluesky', reddit: 'Reddit', traffic: 'Traffic',
  air: 'Air Quality',   elev: 'Terrain',    em: 'EM Density',
  kinetic: 'Ground',    acoustic: 'Acoustic',
}

const HISTORY_KEY = 'aether-locations'

function useLocationHistory() {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') }
    catch { return [] }
  })
  const save = useCallback(entry => {
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 100)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])
  const remove = useCallback(id => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [])
  const clear = useCallback(() => {
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* */ }
    setHistory([])
  }, [])
  return { history, save, remove, clear }
}

function ScoreSparkline({ values }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values)
  const range = Math.max(max - min, 5)
  const W = 300, H = 48, pad = 4
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (W - pad * 2),
    H - pad - ((v - min) / range) * (H - pad * 2),
  ])
  const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPts = [
    `${pts[0][0].toFixed(1)},${H}`,
    ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${pts[pts.length - 1][0].toFixed(1)},${H}`,
  ].join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="score-sparkline">
      <polygon points={areaPts} fill="#7c3aed" fillOpacity="0.12" />
      <polyline points={linePts} fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.5" fill="#7c3aed" />
      ))}
    </svg>
  )
}

function useLocationScore() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  const compute = useCallback(async (lat, lon, elevationM, kineticReading, acousticReading) => {
    setStatus('computing')
    const sources = {}

    let city = 'Unknown'
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`
      )
      const geo = await geoRes.json()
      city =
        geo?.address?.amenity       ??
        geo?.address?.leisure       ??
        geo?.address?.tourism       ??
        geo?.address?.natural       ??
        geo?.address?.neighbourhood ??
        geo?.address?.suburb        ??
        geo?.address?.quarter       ??
        geo?.address?.city_district ??
        geo?.address?.city          ??
        geo?.address?.town          ??
        geo?.address?.village       ??
        geo?.address?.county        ??
        geo?.display_name?.split(',')[0] ??
        'Unknown'
    } catch { /* proceed */ }

    // Politiloggen RSS — public feed, no auth, counts all incidents in last 24 h
    let policeCount = null, policeScoreVal = null
    {
      const t0 = Date.now()
      try {
        const rssRes = await fetch('https://api.politiet.no/politiloggen/v1/rss')
        if (!rssRes.ok) throw new Error(`HTTP ${rssRes.status}`)
        const xml    = new DOMParser().parseFromString(await rssRes.text(), 'text/xml')
        const cutoff = Date.now() - 24 * 3600 * 1000
        policeCount  = Array.from(xml.querySelectorAll('item'))
          .filter(item => {
            const pub = item.querySelector('pubDate')?.textContent
            return pub && new Date(pub).getTime() > cutoff
          }).length
        policeScoreVal = policeScore(policeCount)
        sources.police = { status: 'ok', latencyMs: Date.now() - t0, raw: `${policeCount} hendelser/24h` }
      } catch { sources.police = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // Bluesky — public AT Protocol search, no auth, no lang filter (Norwegian posts tagged nb/nn not no)
    let bskyCount = null, bskyScoreVal = null
    {
      const t0 = Date.now()
      try {
        const since  = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        const bskyQ  = encodeURIComponent(
          `${city} (uro OR støy OR protest OR demonstrasjon OR bråk OR konflikt)`
        )
        const bskyRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` +
          `?q=${bskyQ}&limit=25&since=${since}`
        )
        if (!bskyRes.ok) throw new Error(`HTTP ${bskyRes.status}`)
        const bsky = await bskyRes.json()
        if (!Array.isArray(bsky?.posts)) throw new Error('unexpected response shape')
        bskyCount  = bsky.posts.length
        bskyScoreVal = blueskyScore(bskyCount)
        sources.bluesky = { status: 'ok', latencyMs: Date.now() - t0, raw: `${bskyCount} posts/24h` }
      } catch { sources.bluesky = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // Reddit — r/norge + r/oslo new posts listing (/new.json has CORS, /search.json does not)
    let redditCount = null, redditScoreVal = null
    {
      const t0 = Date.now()
      try {
        const rdRes = await fetch(
          `https://www.reddit.com/r/norge+oslo/new.json?limit=25&raw_json=1`
        )
        if (!rdRes.ok) throw new Error(`HTTP ${rdRes.status}`)
        const rd = await rdRes.json()
        if (!Array.isArray(rd?.data?.children)) throw new Error('unexpected response shape')
        redditCount    = rd.data.children.length
        redditScoreVal = redditScore(redditCount)
        sources.reddit = { status: 'ok', latencyMs: Date.now() - t0, raw: `${redditCount} posts/day` }
      } catch { sources.reddit = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // Statens Vegvesen NVDB — active road works (type 596) within ~5 km bounding box
    let vegCount = null, vegScoreVal = null
    {
      const t0 = Date.now()
      try {
        const latN = parseFloat(lat), lonN = parseFloat(lon)
        const dLat = 0.045, dLon = 0.045 / Math.cos((latN * Math.PI) / 180)
        const bbox = [
          (lonN - dLon).toFixed(5), (latN - dLat).toFixed(5),
          (lonN + dLon).toFixed(5), (latN + dLat).toFixed(5),
        ].join(',')
        const vegRes = await fetch(
          `https://nvdbapiles-v3.atlas.vegvesen.no/vegobjekter/596` +
          `?kartutsnitt=${bbox}&inkluder=metadata&antall=25`,
          { headers: { Accept: 'application/json', 'X-Client': 'Aether/1.0' } }
        )
        const vegData = await vegRes.json()
        const now = Date.now()
        vegCount = (vegData?.objekter ?? []).filter(o => {
          const end = o?.metadata?.sluttdato
          return !end || new Date(end).getTime() > now
        }).length
        vegScoreVal = vegvesenScore(vegCount)
        sources.traffic = { status: 'ok', latencyMs: Date.now() - t0, raw: `${vegCount} vegarbeid/5 km` }
      } catch { sources.traffic = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // Open-Meteo Air Quality — European AQI + PM2.5
    let aqiVal = null, pm25Val = null, airScoreVal = null
    {
      const t0 = Date.now()
      try {
        const aqRes = await fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality` +
          `?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5`
        )
        const aqData = await aqRes.json()
        aqiVal      = aqData?.current?.european_aqi ?? null
        pm25Val     = aqData?.current?.pm2_5        ?? null
        airScoreVal = airQualityScore(aqiVal)
        sources.air = {
          status: 'ok', latencyMs: Date.now() - t0,
          raw: aqiVal != null
            ? `AQI ${aqiVal}${pm25Val != null ? ` · PM2.5 ${pm25Val.toFixed(1)}` : ''}`
            : '—',
        }
      } catch { sources.air = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // OSM Overpass — communication tower density
    let emCount = null, emScoreVal = null
    {
      const t0 = Date.now()
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
        sources.em = { status: 'ok', latencyMs: Date.now() - t0, raw: `${emCount} towers/5 km` }
      } catch { sources.em = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    const elev     = elevationScore(elevationM)
    const kinetic  = kineticCalmScore(kineticReading?.dominantHz ?? null)
    const acoustic = acousticCalmScore(acousticReading?.dominantHz ?? null)

    sources.elev = elevationM != null
      ? { status: 'ok',      latencyMs: null, raw: `${elevationM} m asl` }
      : { status: 'skipped', latencyMs: null, raw: null }
    sources.kinetic = kineticReading
      ? { status: 'ok',      latencyMs: null, raw: `${kineticReading.dominantHz?.toFixed(2) ?? '?'} Hz · ${kineticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }
    sources.acoustic = acousticReading
      ? { status: 'ok',      latencyMs: null, raw: `${acousticReading.dominantHz?.toFixed(2) ?? '?'} Hz · ${acousticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    setResult({
      city, policeCount, bskyCount, redditCount, vegCount, aqiVal, pm25Val, elevationM, emCount,
      sources,
      scores: { police: policeScoreVal, bluesky: bskyScoreVal, reddit: redditScoreVal, traffic: vegScoreVal, air: airScoreVal, elev, em: emScoreVal, kinetic, acoustic },
      aether: compositeAether([policeScoreVal, bskyScoreVal, redditScoreVal, vegScoreVal, airScoreVal, elev, emScoreVal, kinetic, acoustic]),
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

function ScoreGauge({ label, value, detail, status }) {
  const hasValue = value != null
  const color = hasValue ? (value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171') : '#1f2937'
  const dotColor = status === 'ok' ? '#34d399' : status === 'error' ? '#ef4444' : '#374151'
  return (
    <div className="score-row">
      <div className="score-row-head">
        <span className="score-dot" style={{ background: dotColor }} />
        <span className="score-row-label">{label}</span>
        {detail && <span className="score-row-detail">{detail}</span>}
        <span className="score-row-val" style={{ color: hasValue ? color : '#374151' }}>
          {hasValue ? value : '—'}
        </span>
      </div>
      <div className="score-bar-wrap">
        {hasValue && <div className="score-bar" style={{ width: `${value}%`, background: color }} />}
      </div>
    </div>
  )
}

const SOURCE_META = {
  police:  { label: 'Police Log',   domain: 'api.politiet.no (RSS)' },
  bluesky: { label: 'Bluesky',      domain: 'public.api.bsky.app' },
  reddit:  { label: 'Reddit',       domain: 'reddit.com' },
  traffic: { label: 'Traffic',      domain: 'nvdbapiles-v3.atlas.vegvesen.no' },
  air:     { label: 'Air Quality',  domain: 'air-quality-api.open-meteo.com' },
  elev:    { label: 'Terrain',      domain: 'api.open-meteo.com' },
  em:      { label: 'EM Density',   domain: 'overpass-api.de' },
  kinetic: { label: 'Ground',       domain: 'DeviceMotion API' },
  acoustic:{ label: 'Acoustic',     domain: 'Microphone API' },
}

function SourcesPanel({ sources }) {
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
            <span className={`source-raw${src?.status === 'error' ? ' source-raw-err' : ''}`}>
              {rawText}
            </span>
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

function ComparePanel({ entries, onClose }) {
  const [a, b] = entries
  return (
    <div className="compare-panel">
      <div className="compare-header">
        <span className="compare-title">Compare</span>
        <button className="compare-close" onClick={onClose}>✕</button>
      </div>
      <div className="compare-cols">
        {[a, b].map(entry => (
          <div key={entry.id} className="compare-col">
            <div className="compare-col-head">
              <span className="compare-city">{entry.city}</span>
              <span className="compare-score">{entry.aether ?? '—'}</span>
            </div>
            {Object.entries(entry.scores)
              .filter(([, v]) => v != null)
              .map(([key, value]) => (
                <ScoreGauge key={key} label={SCORE_LABELS[key] ?? key} value={value} />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function LocationScoreCard({ atmospheric, kinetic, acoustic, onSave, history }) {
  const { status, result, compute } = useLocationScore()
  const reading = atmospheric.reading
  const savedRef = useRef(null)
  const [delta, setDelta] = useState(null)
  const [showSources, setShowSources] = useState(false)

  const handleCompute = useCallback(() => {
    if (!reading) return
    compute(reading.lat, reading.lon, reading.elevationM, kinetic.reading, acoustic.reading)
  }, [reading, kinetic.reading, acoustic.reading, compute])

  useEffect(() => {
    if (status !== 'ready' || !result || result === savedRef.current) return
    savedRef.current = result
    const prevAether = history[0]?.aether ?? null
    const d = result.aether != null && prevAether != null ? result.aether - prevAether : null
    setDelta(d)
    onSave({
      id: Date.now(),
      ts: new Date().toISOString(),
      city: result.city,
      lat: atmospheric.reading?.lat ?? null,
      lon: atmospheric.reading?.lon ?? null,
      aether: result.aether,
      scores: result.scores,
      counts: {
        policeCount: result.policeCount, bskyCount: result.bskyCount,
        redditCount: result.redditCount, vegCount: result.vegCount,
        aqiVal: result.aqiVal,           pm25Val: result.pm25Val,
        elevationM: result.elevationM,   emCount: result.emCount,
      },
    })
  }, [status, result]) // eslint-disable-line react-hooks/exhaustive-deps

  const sparkValues = [
    ...[...history].slice(0, 4).map(e => e.aether).filter(v => v != null).reverse(),
    ...(result?.aether != null ? [result.aether] : []),
  ]

  return (
    <div className="card card-score">
      <div className="card-header">
        <span className="card-title">Aether Score</span>
        {result && <span className="score-location">{result.city}</span>}
      </div>

      {result?.aether != null && (
        <>
          <div className="aether-score-wrap">
            <span className="aether-score-val">{result.aether}</span>
            <span className="aether-score-sub">/100</span>
            {delta != null && (
              <span className="aether-delta" style={{
                color: delta > 2 ? '#34d399' : delta < -2 ? '#f87171' : '#6b7280',
              }}>
                {delta > 2 ? `▲ ${delta}` : delta < -2 ? `▼ ${Math.abs(delta)}` : '→'}
              </span>
            )}
          </div>
          {sparkValues.length >= 2 && <ScoreSparkline values={sparkValues} />}
        </>
      )}

      {result && (
        <>
          <div className="score-breakdown">
            <ScoreGauge label="Police Log"  value={result.scores.police}   status={result.sources?.police?.status}  detail={result.policeCount  != null ? `${result.policeCount} hendelser/24h`  : null} />
            <ScoreGauge label="Bluesky"     value={result.scores.bluesky}  status={result.sources?.bluesky?.status} detail={result.bskyCount    != null ? `${result.bskyCount} innlegg/24h`     : null} />
            <ScoreGauge label="Reddit"      value={result.scores.reddit}   status={result.sources?.reddit?.status}  detail={result.redditCount  != null ? `${result.redditCount} posts/24h`      : null} />
            <ScoreGauge label="Traffic"     value={result.scores.traffic}  status={result.sources?.traffic?.status} detail={result.vegCount     != null ? `${result.vegCount} vegarbeid/5 km`   : null} />
            <ScoreGauge label="Air Quality" value={result.scores.air}      status={result.sources?.air?.status}     detail={result.aqiVal       != null ? `AQI ${result.aqiVal}${result.pm25Val != null ? ` · PM2.5 ${result.pm25Val.toFixed(1)}` : ''}` : null} />
            <ScoreGauge label="Terrain"     value={result.scores.elev}     status={result.sources?.elev?.status}    detail={result.elevationM   != null ? `${result.elevationM} m asl`           : null} />
            <ScoreGauge label="EM Density"  value={result.scores.em}       status={result.sources?.em?.status}      detail={result.emCount      != null ? `${result.emCount} towers/5 km`        : null} />
            <ScoreGauge label="Ground"      value={result.scores.kinetic}  status={result.sources?.kinetic?.status} detail={kinetic.reading?.dominantHz  != null ? `${kinetic.reading.dominantHz.toFixed(1)} Hz`  : null} />
            <ScoreGauge label="Acoustic"    value={result.scores.acoustic} status={result.sources?.acoustic?.status} detail={acoustic.reading?.dominantHz != null ? `${acoustic.reading.dominantHz.toFixed(1)} Hz` : null} />
          </div>
          <button className="sources-toggle" onClick={() => setShowSources(p => !p)}>
            Data Sources {showSources ? '▴' : '▾'}
          </button>
          {showSources && <SourcesPanel sources={result.sources} />}
        </>
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

function LocationHistoryPanel({ history, onRemove, onClear }) {
  const [expandedId, setExpandedId] = useState(null)
  const [pinned, setPinned]         = useState([])

  const togglePin = useCallback(id => {
    setPinned(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : prev.length >= 2 ? [prev[1], id] : [...prev, id]
    )
  }, [])

  const pinnedEntries = pinned.map(id => history.find(e => e.id === id)).filter(Boolean)

  if (history.length === 0) return null

  return (
    <section className="history-section">
      <div className="history-section-head">
        <span className="history-section-title">Saved Locations</span>
        <span className="history-section-count">{history.length}</span>
        <button className="history-clear-btn" onClick={onClear}>Clear all</button>
      </div>

      {pinnedEntries.length === 2 && (
        <ComparePanel entries={pinnedEntries} onClose={() => setPinned([])} />
      )}
      {pinnedEntries.length === 1 && (
        <p className="compare-hint">Pin one more location to compare ⊕</p>
      )}

      <div className="history-list">
        {history.map((entry, i) => {
          const prev = history[i + 1]
          const d    = entry.aether != null && prev?.aether != null ? entry.aether - prev.aether : null
          const isPinned    = pinned.includes(entry.id)
          const isExpanded  = expandedId === entry.id
          const dt = new Date(entry.ts)
          const timeStr = dt.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
          const dateStr = dt.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
          return (
            <div key={entry.id} className={`history-entry${isExpanded ? ' expanded' : ''}`}>
              <div className="history-entry-header" onClick={() => setExpandedId(p => p === entry.id ? null : entry.id)}>
                <span className="history-entry-city">{entry.city}</span>
                <span className="history-entry-score" style={{
                  color: (entry.aether ?? 0) >= 70 ? '#34d399' : (entry.aether ?? 0) >= 40 ? '#fbbf24' : '#f87171',
                }}>{entry.aether ?? '—'}</span>
                {d != null && (
                  <span className="history-entry-delta" style={{ color: d > 2 ? '#34d399' : d < -2 ? '#f87171' : '#6b7280' }}>
                    {d > 2 ? `▲${d}` : d < -2 ? `▼${Math.abs(d)}` : '→'}
                  </span>
                )}
                <span className="history-entry-time">{dateStr} {timeStr}</span>
                <button
                  className={`history-pin-btn${isPinned ? ' active' : ''}`}
                  onClick={e => { e.stopPropagation(); togglePin(entry.id) }}
                  title={isPinned ? 'Unpin' : 'Pin to compare'}
                >⊕</button>
                <button
                  className="history-delete-btn"
                  onClick={e => { e.stopPropagation(); onRemove(entry.id) }}
                  title="Remove"
                >✕</button>
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
    </section>
  )
}

// ─── Map Panel ────────────────────────────────────────────────────────────────

const TILE_URLS = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}

function MapPanel({ history, currentLat, currentLon, currentScore }) {
  const containerRef    = useRef(null)
  const gestureHintRef  = useRef(null)
  const mapRef          = useRef(null)
  const markersRef      = useRef([])
  const polylineRef     = useRef(null)
  const tileRef         = useRef(null)
  const gestureTimerRef = useRef(null)
  const [mapStyle, setMapStyle] = useState('dark')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    })

    const el = containerRef.current
    const onWheel = e => {
      if (e.ctrlKey) {
        mapRef.current?.scrollWheelZoom.enable()
        clearTimeout(gestureTimerRef.current)
        gestureTimerRef.current = setTimeout(() => mapRef.current?.scrollWheelZoom.disable(), 600)
      } else {
        gestureHintRef.current?.classList.add('map-gesture-hint--visible')
        clearTimeout(gestureTimerRef.current)
        gestureTimerRef.current = setTimeout(() => {
          gestureHintRef.current?.classList.remove('map-gesture-hint--visible')
        }, 1500)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(gestureTimerRef.current)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    tileRef.current?.remove()
    tileRef.current = L.tileLayer(TILE_URLS[mapStyle], {
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(mapRef.current)
  }, [mapStyle])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    polylineRef.current?.remove()
    polylineRef.current = null

    const bounds = []

    // Draw dashed trail in chronological order (history is newest-first)
    const trailCoords = [...history]
      .reverse()
      .filter(e => e.lat && e.lon)
      .map(e => [parseFloat(e.lat), parseFloat(e.lon)])
      .filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon))
    if (trailCoords.length >= 2) {
      polylineRef.current = L.polyline(trailCoords, {
        color: '#6b7280', weight: 2, dashArray: '4 6', opacity: 0.7,
      }).addTo(map)
    }

    history.forEach(entry => {
      if (!entry.lat || !entry.lon) return
      const lat = parseFloat(entry.lat), lon = parseFloat(entry.lon)
      if (isNaN(lat) || isNaN(lon)) return
      const s = entry.aether
      const fill = s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#f87171'
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-score-marker" style="background:${fill}">${s ?? '?'}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
      })
      const m = L.marker([lat, lon], { icon })
        .bindPopup(`<b>${entry.city}</b><br>Score: ${s ?? '—'}`)
      m.addTo(map)
      markersRef.current.push(m)
      bounds.push([lat, lon])
    })

    if (currentLat && currentLon) {
      const lat = parseFloat(currentLat), lon = parseFloat(currentLon)
      if (!isNaN(lat) && !isNaN(lon)) {
        const s = currentScore
        const fill = s != null ? (s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#f87171') : '#818cf8'
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-score-marker map-score-marker--current" style="background:${fill}">${s ?? '?'}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
        })
        const m = L.marker([lat, lon], { icon })
          .bindPopup(`<b>Current location</b>${s != null ? `<br>Score: ${s}` : ''}`)
        m.addTo(map)
        markersRef.current.push(m)
        bounds.push([lat, lon])
      }
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13)
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 14 })
    }
  }, [history, currentLat, currentLon, currentScore])

  return (
    <div className="map-wrapper" data-map-style={mapStyle}>
      <div ref={containerRef} className="map-panel" />
      <div ref={gestureHintRef} className="map-gesture-hint">Use Ctrl + scroll to zoom</div>
      <button
        className="map-style-toggle"
        onClick={() => setMapStyle(s => s === 'dark' ? 'light' : 'dark')}
        title={mapStyle === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
      >
        {mapStyle === 'dark' ? '☀' : '◑'}
      </button>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const kinetic     = useKineticSensor()
  const acoustic    = useAcousticSensor()
  const atmospheric = useAtmosphericSensor()
  const { history, save, remove, clear } = useLocationHistory()
  const [log, setLog] = useState([])

  const { k, a, archetype } = useMemo(
    () => classify(kinetic.reading, null, atmospheric.reading, acoustic.reading),
    [kinetic.reading, atmospheric.reading, acoustic.reading]
  )

  const capture = useCallback(() => {
    const { archetype: arc } = classify(kinetic.reading, null, atmospheric.reading, acoustic.reading)
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
        <LocationScoreCard atmospheric={atmospheric} kinetic={kinetic} acoustic={acoustic} onSave={save} history={history} />
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

      {(history.some(e => e.lat && e.lon) || atmospheric.reading) && (
        <MapPanel
          history={history}
          currentLat={atmospheric.reading?.lat ?? null}
          currentLon={atmospheric.reading?.lon ?? null}
          currentScore={history[0]?.aether ?? null}
        />
      )}
      <LocationHistoryPanel history={history} onRemove={remove} onClear={clear} />
    </div>
  )
}
