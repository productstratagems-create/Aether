import { useState, useEffect, useCallback, useRef } from 'react'
import { computeSpectrum, zoneEnergies, rms } from '../utils/fft.js'
import { FFT_SIZE, SPECTRUM_UPDATE_MS, KINETIC_REST_MS } from '../utils/constants.js'

export function useKineticSensor() {
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
