import { useState, useCallback, useRef } from 'react'

export function useAtmosphericSensor() {
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
