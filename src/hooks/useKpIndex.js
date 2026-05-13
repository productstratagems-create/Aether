import { useState, useEffect } from 'react'

const KP_REFRESH_MS = 15 * 60 * 1000  // 15 minutes

export function useKpIndex() {
  const [kp, setKp] = useState(null)

  useEffect(() => {
    const fetchKp = async () => {
      try {
        const res  = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
        if (!res.ok) return
        const data = await res.json()
        const value = data[data.length - 1]?.kp_index ?? null
        if (value != null) setKp(value)
      } catch { /* keep previous value on network error */ }
    }
    fetchKp()
    const id = setInterval(fetchKp, KP_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  return kp
}
