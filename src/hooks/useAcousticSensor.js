import { useState, useEffect, useCallback, useRef } from 'react'

// Continuous dB SPL metering — not infrasound FFT.
// Phone MEMS microphones accurately respond to 20 Hz – 20 kHz.
// We measure RMS of raw audio and convert to approximate dB SPL.

const PROCESSOR_SIZE = 4096
const UPDATE_MS      = 500
const REFERENCE      = 0.00002  // 20 μPa, threshold of hearing

function rmsToDb(rmsValue) {
  if (rmsValue < 1e-10) return 0
  return Math.max(0, Math.round(20 * Math.log10(rmsValue / REFERENCE)))
}

function dbZone(db) {
  if (db < 30) return 'silent'
  if (db < 50) return 'quiet'
  if (db < 65) return 'ambient'
  if (db < 80) return 'noisy'
  return 'loud'
}

export function useAcousticSensor() {
  const [status, setStatus]   = useState('idle')
  const [reading, setReading] = useState(null)

  const activeRef    = useRef(false)
  const streamRef    = useRef(null)
  const ctxRef       = useRef(null)
  const processorRef = useRef(null)
  const timerRef     = useRef(null)
  const rmsBufferRef = useRef([])

  const closeAudio = useCallback(() => {
    try { processorRef.current?.disconnect() } catch { /* */ }
    processorRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    try { ctxRef.current?.close() } catch { /* */ }
    ctxRef.current = null
  }, [])

  const start = useCallback(() => {
    activeRef.current = true
    setStatus('listening')

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
          const proc   = ctx.createScriptProcessor(PROCESSOR_SIZE, 1, 1)
          processorRef.current = proc

          proc.onaudioprocess = (e) => {
            if (!activeRef.current) return
            const data = e.inputBuffer.getChannelData(0)
            e.outputBuffer.getChannelData(0).fill(0)

            // Compute RMS of this frame
            let sum = 0
            for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
            const frameRms = Math.sqrt(sum / data.length)
            rmsBufferRef.current.push(frameRms)
            // Keep ~1s of frames
            if (rmsBufferRef.current.length > Math.ceil(1000 / (PROCESSOR_SIZE / ctx.sampleRate * 1000))) {
              rmsBufferRef.current.shift()
            }
          }

          source.connect(proc)
          proc.connect(ctx.destination)

          // Update reading at regular interval
          timerRef.current = setInterval(() => {
            if (!activeRef.current || rmsBufferRef.current.length === 0) return
            const avgRms = rmsBufferRef.current.reduce((a, b) => a + b, 0) / rmsBufferRef.current.length
            const db = rmsToDb(avgRms)
            setReading({ db, zone: dbZone(db) })
          }, UPDATE_MS)
        })
      })
      .catch(err => {
        if (!activeRef.current) return
        const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
        setStatus(denied ? 'denied' : 'error')
        activeRef.current = false
      })
  }, [closeAudio])

  const stop = useCallback(() => {
    activeRef.current = false
    clearInterval(timerRef.current)
    closeAudio()
    rmsBufferRef.current = []
    setStatus('idle')
    setReading(null)
  }, [closeAudio])

  useEffect(() => () => {
    activeRef.current = false
    clearInterval(timerRef.current)
    closeAudio()
  }, [closeAudio])

  return { status, reading, start, stop }
}
