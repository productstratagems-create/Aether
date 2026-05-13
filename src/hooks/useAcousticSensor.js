import { useState, useEffect, useCallback, useRef } from 'react'

// Continuous acoustic metering using a relative baseline.
// On start, the first BASELINE_DURATION ms of audio establishes the ambient floor.
// All subsequent readings are expressed as dB above that floor — device-agnostic.

const PROCESSOR_SIZE    = 4096
const UPDATE_MS         = 500
const BASELINE_DURATION = 2000

function relDbZone(relDb) {
  if (relDb < 3)  return 'hush'
  if (relDb < 12) return 'quiet'
  if (relDb < 22) return 'ambient'
  if (relDb < 35) return 'active'
  return 'loud'
}

export function useAcousticSensor() {
  const [status, setStatus]   = useState('idle')
  const [reading, setReading] = useState(null)

  const activeRef       = useRef(false)
  const streamRef       = useRef(null)
  const ctxRef          = useRef(null)
  const processorRef    = useRef(null)
  const timerRef        = useRef(null)
  const rmsBufferRef    = useRef([])
  const baselineRmsRef  = useRef(null)
  const baselineBufRef  = useRef([])
  const baselineTimerRef = useRef(null)

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
    setStatus('calibrating')

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

            let sum = 0
            for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
            const frameRms = Math.sqrt(sum / data.length)

            if (baselineRmsRef.current == null) {
              baselineBufRef.current.push(frameRms)
            } else {
              rmsBufferRef.current.push(frameRms)
              const maxFrames = Math.ceil(1000 / (PROCESSOR_SIZE / ctx.sampleRate * 1000))
              if (rmsBufferRef.current.length > maxFrames) rmsBufferRef.current.shift()
            }
          }

          source.connect(proc)
          proc.connect(ctx.destination)

          // Calibration phase: collect ambient baseline, then switch to 'listening'
          baselineTimerRef.current = setTimeout(() => {
            if (!activeRef.current) return
            const buf = baselineBufRef.current
            baselineRmsRef.current = buf.length
              ? buf.reduce((a, b) => a + b, 0) / buf.length
              : 1e-6
            baselineBufRef.current = []
            setStatus('listening')

            timerRef.current = setInterval(() => {
              if (!activeRef.current || rmsBufferRef.current.length === 0) return
              const avgRms = rmsBufferRef.current.reduce((a, b) => a + b, 0) / rmsBufferRef.current.length
              const base   = baselineRmsRef.current
              const relDb  = base > 0 ? Math.max(0, Math.round(20 * Math.log10(avgRms / base))) : 0
              setReading({ db: relDb, zone: relDbZone(relDb) })
            }, UPDATE_MS)
          }, BASELINE_DURATION)
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
    clearTimeout(baselineTimerRef.current)
    clearInterval(timerRef.current)
    closeAudio()
    rmsBufferRef.current   = []
    baselineRmsRef.current = null
    baselineBufRef.current = []
    setStatus('idle')
    setReading(null)
  }, [closeAudio])

  useEffect(() => () => {
    activeRef.current = false
    clearTimeout(baselineTimerRef.current)
    clearInterval(timerRef.current)
    closeAudio()
  }, [closeAudio])

  return { status, reading, start, stop }
}
