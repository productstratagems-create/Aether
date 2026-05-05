import { useState, useCallback } from 'react'
import {
  magneticStabilityScore, kpScore, groundCalmScore,
  airQualityScore, pressureStabilityScore, elevationScore,
  acousticCalmScore, compositeAether,
} from '../utils/scores.js'

// Five physically-grounded scoring factors:
// Magnetic stability · Geomagnetic Kp · Ground calm · Air clarity · Pressure stability
// Social media sources (Reddit, Bluesky, Police) and EM tower density removed.

export function useLocationScore() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  const compute = useCallback(async (lat, lon, elevationM, kineticReading, acousticReading, magnetometerReading) => {
    setStatus('computing')
    const sources = {}

    // ── Reverse geocoding ──────────────────────────────────────────────────────
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

    // ── Geomagnetic Kp index (NOAA SWPC) ─────────────────────────────────────
    let kpValue = null, kpScoreVal = null
    {
      const t0 = Date.now()
      try {
        const res  = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        kpValue    = data[data.length - 1]?.kp_index ?? null
        kpScoreVal = kpScore(kpValue)
        sources.kp = { status: 'ok', latencyMs: Date.now() - t0, raw: `Kp ${kpValue?.toFixed(1) ?? '—'}` }
      } catch { sources.kp = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // ── Air quality (Open-Meteo) ───────────────────────────────────────────────
    let aqiVal = null, pm25Val = null, airScoreVal = null
    {
      const t0 = Date.now()
      try {
        const res    = await fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality` +
          `?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5`
        )
        const data   = await res.json()
        aqiVal       = data?.current?.european_aqi ?? null
        pm25Val      = data?.current?.pm2_5        ?? null
        airScoreVal  = airQualityScore(aqiVal)
        sources.air  = {
          status: 'ok', latencyMs: Date.now() - t0,
          raw: aqiVal != null
            ? `AQI ${aqiVal}${pm25Val != null ? ` · PM2.5 ${pm25Val.toFixed(1)}` : ''}`
            : '—',
        }
      } catch { sources.air = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    // ── Magnetic stability (on-device) ────────────────────────────────────────
    const magVariance  = magnetometerReading?.variance ?? null
    const magScoreVal  = magneticStabilityScore(magVariance)
    sources.magnetic = magnetometerReading
      ? { status: 'ok',      latencyMs: null, raw: `${magnetometerReading.magnitude?.toFixed(1) ?? '?'} μT · ${magnetometerReading.stability}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Ground calm (on-device accelerometer) ────────────────────────────────
    const groundRms    = kineticReading?.magnitudeRms ?? null
    const groundScore  = groundCalmScore(groundRms != null ? parseFloat(groundRms) : null)
    sources.ground = kineticReading
      ? { status: 'ok',      latencyMs: null, raw: `${groundRms ?? '?'} rms · ${kineticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Pressure stability (from atmospheric reading) ─────────────────────────
    const pressScore   = pressureStabilityScore(null)  // deltaP from atmospheric hook
    sources.pressure = elevationM != null
      ? { status: 'ok',      latencyMs: null, raw: `${elevationM} m asl` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Acoustic level (on-device) ────────────────────────────────────────────
    const acDb         = acousticReading?.db ?? null
    const acScoreVal   = acousticCalmScore(acDb)
    sources.acoustic = acousticReading
      ? { status: 'ok',      latencyMs: null, raw: `${acDb ?? '?'} dB · ${acousticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Elevation ─────────────────────────────────────────────────────────────
    const elevScore    = elevationScore(elevationM)
    sources.elev = elevationM != null
      ? { status: 'ok', latencyMs: null, raw: `${elevationM} m asl` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Composite (weighted) ──────────────────────────────────────────────────
    // Weights: magnetic 25%, Kp 20%, ground 20%, air 20%, pressure 15%
    // Acoustic and elevation shown as context, not scored (no causal claim)
    const weightedAether = (() => {
      const factors = [
        { score: magScoreVal,  weight: 0.25 },
        { score: kpScoreVal,   weight: 0.20 },
        { score: groundScore,  weight: 0.20 },
        { score: airScoreVal,  weight: 0.20 },
        { score: pressScore,   weight: 0.15 },
      ]
      const available = factors.filter(f => f.score != null)
      if (!available.length) return null
      const totalWeight = available.reduce((s, f) => s + f.weight, 0)
      return Math.round(available.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight)
    })()

    setResult({
      city, kpValue, aqiVal, pm25Val, elevationM,
      magVariance, groundRms,
      sources,
      scores: {
        magnetic: magScoreVal,
        kp:       kpScoreVal,
        ground:   groundScore,
        air:      airScoreVal,
        pressure: pressScore,
        acoustic: acScoreVal,
        elev:     elevScore,
      },
      aether: weightedAether,
    })
    setStatus('ready')
  }, [])

  return { status, result, compute }
}
