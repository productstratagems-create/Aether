import { useState, useEffect, useCallback, useRef } from 'react'
import { computeSpectrum, rms } from '../utils/fft.js'
import { FFT_SIZE, SPECTRUM_MIN_HZ, KINETIC_UPDATE_MS } from '../utils/constants.js'

// Continuous mode: accumulate samples into a rolling buffer and update the EMA
// spectrum every KINETIC_UPDATE_MS. No burst/rest cycle — the instrument is always listening.

function groundZone(dominantHz, magnitudeRms) {
  if (dominantHz == null || dominantHz < SPECTRUM_MIN_HZ) return 'calm'
  if (magnitudeRms < 0.02) return 'calm'
  if (dominantHz > 12 || magnitudeRms > 0.25) return 'stress'
  if (dominantHz > 5  || magnitudeRms > 0.05) return 'active'
  return 'calm'
}

export function useKineticSensor() {
  const [status, setStatus]   = useState('idle')    // idle | pending | active | denied | error
  const [reading, setReading] = useState(null)

  const bufferRef      = useRef([])
  const sampleRateRef  = useRef(60)
  const emaSpecRef     = useRef(null)               // EMA-smoothed spectrum bins
  const handlerRef     = useRef(null)
  const updateTimerRef = useRef(null)

  const processBuffer = useCallback(() => {
    const buf = bufferRef.current
    if (buf.length < FFT_SIZE / 2) return

    const samples = buf.slice(-FFT_SIZE)
    const spec    = computeSpectrum(samples, sampleRateRef.current)

    // Initialise or EMA-blend the spectrum
    if (!emaSpecRef.current) {
      emaSpecRef.current = spec.bins
    } else {
      emaSpecRef.current = emaSpecRef.current.map((prev, i) => {
        const cur = spec.bins[i] ?? prev
        return { hz: cur.hz, mag: 0.2 * cur.mag + 0.8 * prev.mag }
      })
    }

    // Find dominant frequency above the noise floor
    let maxMag = 0, dominantHz = null
    for (const bin of emaSpecRef.current) {
      if (bin.hz < SPECTRUM_MIN_HZ) continue
      if (bin.mag > maxMag) { maxMag = bin.mag; dominantHz = bin.hz }
    }

    const magnitudeRms = rms(buf.slice(-32))

    setReading({
      dominantHz,
      magnitudeRms,
      zone: groundZone(dominantHz, magnitudeRms),
      bins: emaSpecRef.current,
    })
  }, [])

  const handleMotion = useCallback((e) => {
    const { acceleration: acc, accelerationIncludingGravity: accG, interval } = e
    if (!acc && !accG) return

    if (interval > 0) {
      const rate = 1000 / interval
      sampleRateRef.current = rate / FFT_SIZE > 1 ? rate / 1000 : rate
    }

    const z = acc?.z ?? accG?.z ?? 0
    bufferRef.current.push(z)
    if (bufferRef.current.length > FFT_SIZE * 2) bufferRef.current.shift()
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
    window.addEventListener('devicemotion', handlerRef.current)

    // Schedule periodic spectrum processing
    updateTimerRef.current = setInterval(processBuffer, KINETIC_UPDATE_MS)
    setStatus('active')
  }, [handleMotion, processBuffer])

  const stop = useCallback(() => {
    clearInterval(updateTimerRef.current)
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
    handlerRef.current  = null
    bufferRef.current   = []
    emaSpecRef.current  = null
    setStatus('idle')
    setReading(null)
  }, [])

  useEffect(() => () => {
    clearInterval(updateTimerRef.current)
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current)
  }, [])

  return { status, reading, start, stop }
}
