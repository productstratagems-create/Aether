import { useState, useRef, useCallback } from 'react'

const CAPTURE_DURATION = 2500

function lightZone(luminance) {
  if (luminance < 0.05) return 'dark'
  if (luminance < 0.20) return 'dim'
  if (luminance < 0.50) return 'indoor'
  if (luminance < 0.80) return 'bright'
  return 'full'
}

export function useLuminanceSensor() {
  const [status, setStatus]   = useState('idle')
  const [reading, setReading] = useState(null)
  const streamRef = useRef(null)

  const sample = useCallback(async () => {
    if (status === 'sampling') return
    setStatus('sampling')
    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } }
      })
      streamRef.current = stream

      const video = document.createElement('video')
      video.srcObject = stream
      video.playsInline = true
      video.muted = true
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 120
      const ctx = canvas.getContext('2d')

      const frames = []
      const iv = setInterval(() => {
        ctx.drawImage(video, 0, 0, 160, 120)
        const d = ctx.getImageData(0, 0, 160, 120).data
        let r = 0, g = 0, b = 0
        const n = d.length / 4
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
        frames.push({ r: r / n / 255, g: g / n / 255, b: b / n / 255 })
      }, 250)

      await new Promise(res => setTimeout(res, CAPTURE_DURATION))
      clearInterval(iv)
      stream.getTracks().forEach(t => t.stop())
      streamRef.current = null

      if (!frames.length) { setStatus('error'); return }

      const r = frames.reduce((s, f) => s + f.r, 0) / frames.length
      const g = frames.reduce((s, f) => s + f.g, 0) / frames.length
      const b = frames.reduce((s, f) => s + f.b, 0) / frames.length

      // ITU-R BT.709 luminance
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const bRatio    = r > 0.01 ? b / r : 1
      const colorTemp = bRatio > 1.15 ? 'cool' : bRatio < 0.85 ? 'warm' : 'neutral'

      setReading({ luminance, colorTemp, zone: lightZone(luminance) })
      setStatus('ready')
    } catch (err) {
      stream?.getTracks?.().forEach(t => t.stop())
      streamRef.current = null
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      setStatus(denied ? 'denied' : 'error')
    }
  }, [status])

  return { status, reading, sample }
}
