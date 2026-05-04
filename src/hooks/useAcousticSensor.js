import { useState, useEffect, useCallback, useRef } from 'react'
import { computeSpectrum, zoneEnergies } from '../utils/fft.js'
import {
  ACOUSTIC_DOWNSAMPLE_HZ, ACOUSTIC_CAPTURE_MS,
  ACOUSTIC_REST_MS, ACOUSTIC_FFT_SIZE,
} from '../utils/constants.js'

export function useAcousticSensor() {
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

  const runCycleRef = useRef(null)
  runCycleRef.current = () => {
    if (!activeRef.current) return

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
              const samples = raw.length < ACOUSTIC_FFT_SIZE
                ? Float32Array.from({ length: ACOUSTIC_FFT_SIZE }, (_, i) => raw[i] ?? 0)
                : raw
              const spec = computeSpectrum(samples, ACOUSTIC_DOWNSAMPLE_HZ)
              setReading({ dominantHz: spec.dominantHz, zone: spec.zone, energies: zoneEnergies(spec.bins) })
            }

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
