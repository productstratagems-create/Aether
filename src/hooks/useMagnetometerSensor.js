import { useState, useEffect, useCallback, useRef } from 'react'
import { MAGNETOMETER_HZ } from '../utils/constants.js'

// Generic Sensor API — Chrome/Android only.
// Returns status: 'unsupported' immediately on iOS/Firefox/Safari.
// The UI conditionally renders this card only when status !== 'unsupported'.

const WINDOW_SAMPLES = 300  // ~30s at 10 Hz

function stdDev(arr) {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
}

function magneticStability(variance) {
  if (variance < 0.3)  return 'stable'
  if (variance < 2.0)  return 'shifting'
  return 'turbulent'
}

export function useMagnetometerSensor() {
  const [status, setStatus]   = useState('idle')
  const [reading, setReading] = useState(null)

  const sensorRef    = useRef(null)
  const historyRef   = useRef([])
  const baselineRef  = useRef(null)

  const start = useCallback(() => {
    if (!('Magnetometer' in window)) {
      setStatus('unsupported')
      return
    }

    navigator.permissions.query({ name: 'magnetometer' })
      .then(perm => {
        if (perm.state === 'denied') { setStatus('denied'); return }

        const sensor = new window.Magnetometer({ frequency: MAGNETOMETER_HZ })
        sensorRef.current = sensor

        sensor.addEventListener('reading', () => {
          const { x, y, z } = sensor
          const magnitude = Math.sqrt(x * x + y * y + z * z)

          if (baselineRef.current == null) baselineRef.current = magnitude

          historyRef.current.push(magnitude)
          if (historyRef.current.length > WINDOW_SAMPLES) historyRef.current.shift()

          const variance  = stdDev(historyRef.current)
          const stability = magneticStability(variance)
          const delta     = magnitude - baselineRef.current

          setReading({ x, y, z, magnitude, delta, variance, stability })
          setStatus('active')
        })

        sensor.addEventListener('error', e => {
          const name = e.error?.name ?? ''
          setStatus(name === 'NotAllowedError' ? 'denied' : 'unsupported')
        })

        try {
          sensor.start()
        } catch {
          setStatus('unsupported')
        }
      })
      .catch(() => {
        // permissions.query not supported — try starting anyway
        try {
          const sensor = new window.Magnetometer({ frequency: MAGNETOMETER_HZ })
          sensorRef.current = sensor
          sensor.addEventListener('reading', () => {
            const { x, y, z } = sensor
            const magnitude = Math.sqrt(x * x + y * y + z * z)
            if (baselineRef.current == null) baselineRef.current = magnitude
            historyRef.current.push(magnitude)
            if (historyRef.current.length > WINDOW_SAMPLES) historyRef.current.shift()
            const variance  = stdDev(historyRef.current)
            setReading({ x, y, z, magnitude, delta: magnitude - baselineRef.current, variance, stability: magneticStability(variance) })
            setStatus('active')
          })
          sensor.addEventListener('error', () => setStatus('unsupported'))
          sensor.start()
        } catch {
          setStatus('unsupported')
        }
      })
  }, [])

  const stop = useCallback(() => {
    sensorRef.current?.stop()
    sensorRef.current  = null
    historyRef.current = []
    baselineRef.current = null
    setStatus('idle')
    setReading(null)
  }, [])

  useEffect(() => () => sensorRef.current?.stop(), [])

  return { status, reading, start, stop }
}
