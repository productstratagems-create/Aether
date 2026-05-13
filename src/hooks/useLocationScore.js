import { useState, useCallback } from 'react'
import {
  magneticStabilityScore, kpScore, groundCalmScore,
  airQualityScore, pressureStabilityScore, elevationScore,
  acousticCalmScore, luminanceScore, geologicStabilityScore,
  seismicActivityScore, compositeAether,
} from '../utils/scores.js'

// Five physically-grounded scoring factors:
// Magnetic stability · Geomagnetic Kp · Ground calm · Air clarity · Pressure stability
// Social media sources (Reddit, Bluesky, Police) and EM tower density removed.

export function useLocationScore() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  const compute = useCallback(async (lat, lon, elevationM, kineticReading, acousticReading, magnetometerReading, atmosphericReading, luminanceReading) => {
    setStatus('computing')
    const sources = {}

    // ── Reverse geocoding ──────────────────────────────────────────────────────
    // zoom=14 → district/neighbourhood level: stable across ~200 m of GPS drift,
    // never resolves to a business name. Compose "District · City" for consistency.
    let city = 'Unknown', featureName = null
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&addressdetails=1`
      )
      const geo = await geoRes.json()
      const a = geo?.address ?? {}

      // Stable district-level label (zoom=14 suppresses amenity/building names)
      const district =
        a.neighbourhood ?? a.suburb ?? a.quarter ??
        a.city_district ?? a.borough ?? a.village ?? a.town ?? a.county ?? null

      // Containing city / municipality
      const municipality = a.city ?? a.town ?? a.village ?? a.county ?? null

      if (district && municipality && district !== municipality) {
        city = `${district} · ${municipality}`
      } else {
        city = district ?? municipality ?? geo?.display_name?.split(',')[0] ?? 'Unknown'
      }

      // Optional specific feature shown separately (park, cathedral, etc.)
      featureName = a.amenity ?? a.leisure ?? a.tourism ?? a.natural ?? null
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
    const deltaP     = atmosphericReading?.deltaP ?? null
    const pressScore = pressureStabilityScore(deltaP != null ? parseFloat(deltaP) : null)
    sources.pressure = atmosphericReading?.pressureHpa != null
      ? { status: 'ok', latencyMs: null, raw: `${atmosphericReading.pressureHpa} hPa${deltaP != null ? ` · Δ${deltaP}` : ''}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Acoustic level (on-device) ────────────────────────────────────────────
    const acDb         = acousticReading?.db ?? null
    const acScoreVal   = acousticCalmScore(acDb)
    sources.acoustic = acousticReading
      ? { status: 'ok',      latencyMs: null, raw: `${acDb ?? '?'} dB · ${acousticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Luminance (camera-based) ──────────────────────────────────────────────
    const lumLuminance = luminanceReading?.luminance ?? null
    const lumColorTemp = luminanceReading?.colorTemp ?? null
    const lumScoreVal  = luminanceScore(lumLuminance, lumColorTemp)
    sources.luminance = luminanceReading
      ? { status: 'ok',      latencyMs: null, raw: `${Math.round(lumLuminance * 100)}% lum · ${lumColorTemp}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Geological substrate (Macrostrat) ────────────────────────────────────
    let geoUnit = null, geoAgeMa = null, geoScoreVal = null, rockClass = null
    {
      const t0 = Date.now()
      try {
        const res  = await fetch(
          `https://macrostrat.org/api/v2/geologic_units/map?lat=${lat}&lng=${lon}&format=json`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const unit = (await res.json())?.success?.data?.[0] ?? null
        if (unit) {
          geoUnit     = unit.unit_name ?? null
          geoAgeMa    = parseFloat(unit.b_age ?? 0) || null
          geoScoreVal = geologicStabilityScore(geoAgeMa)
          const lith  = (unit.lith ?? '').toLowerCase()
          rockClass   = lith.match(/igneous|volcanic|plutonic|basalt|granite/) ? 'igneous'
                      : lith.match(/metamorphic|gneiss|schist|quartzite/)      ? 'metamorphic'
                      : lith.match(/sediment|limestone|sandstone|shale/)       ? 'sedimentary'
                      : 'unknown'
        }
        sources.geology = { status: 'ok', latencyMs: Date.now() - t0,
          raw: geoUnit ? `${geoUnit} · ${geoAgeMa} Ma` : '—' }
      } catch {
        sources.geology = { status: 'error', latencyMs: Date.now() - t0, raw: null }
      }
    }

    // ── Regional seismicity (USGS) ────────────────────────────────────────────
    let seismicCount = null, seismicMaxMag = null, seismicScoreVal = null
    {
      const t0    = Date.now()
      const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      try {
        const res    = await fetch(
          `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
          `&latitude=${lat}&longitude=${lon}&maxradiuskm=150` +
          `&minmagnitude=3.0&starttime=${since}&orderby=magnitude`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const quakes  = (await res.json())?.features ?? []
        seismicCount   = quakes.length
        seismicMaxMag  = quakes[0]?.properties?.mag ?? null
        seismicScoreVal = seismicActivityScore(seismicCount)
        sources.seismic = { status: 'ok', latencyMs: Date.now() - t0,
          raw: seismicCount === 0
            ? 'No M3+ activity · 7d · 150km'
            : `${seismicCount} event${seismicCount > 1 ? 's' : ''} · max M${seismicMaxMag?.toFixed(1)}` }
      } catch {
        sources.seismic = { status: 'error', latencyMs: Date.now() - t0, raw: null }
      }
    }

    // ── Elevation ─────────────────────────────────────────────────────────────
    const elevScore    = elevationScore(elevationM)
    sources.elev = elevationM != null
      ? { status: 'ok', latencyMs: null, raw: `${elevationM} m asl` }
      : { status: 'skipped', latencyMs: null, raw: null }

    // ── Composite (weighted, auto-renormalise on null) ────────────────────────
    // Weights: mag 17%, geo 12%, kp/ground/air 13/13/12%, pressure/acoustic 9/9%, seismic 8%, lum 7%
    const weightedAether = (() => {
      const factors = [
        { score: magScoreVal,     weight: 0.17 },
        { score: kpScoreVal,      weight: 0.13 },
        { score: groundScore,     weight: 0.13 },
        { score: airScoreVal,     weight: 0.12 },
        { score: pressScore,      weight: 0.09 },
        { score: acScoreVal,      weight: 0.09 },
        { score: lumScoreVal,     weight: 0.07 },
        { score: geoScoreVal,     weight: 0.12 },
        { score: seismicScoreVal, weight: 0.08 },
      ]
      const available = factors.filter(f => f.score != null)
      if (!available.length) return null
      const totalWeight = available.reduce((s, f) => s + f.weight, 0)
      return Math.round(available.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight)
    })()

    setResult({
      city, featureName, kpValue, aqiVal, pm25Val, elevationM,
      magVariance, groundRms, seismicCount, seismicMaxMag,
      geology: geoUnit != null ? {
        unitName: geoUnit,
        ageMa:    geoAgeMa,
        ageGa:    geoAgeMa != null ? geoAgeMa / 1000 : null,
        rockClass,
      } : null,
      sources,
      scores: {
        magnetic:  magScoreVal,
        kp:        kpScoreVal,
        ground:    groundScore,
        air:       airScoreVal,
        pressure:  pressScore,
        acoustic:  acScoreVal,
        luminance: lumScoreVal,
        geology:   geoScoreVal,
        seismic:   seismicScoreVal,
        elev:      elevScore,
      },
      aether: weightedAether,
    })
    setStatus('ready')
  }, [])

  return { status, result, compute }
}
