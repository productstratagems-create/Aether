import { useState, useCallback } from 'react'
import {
  policeScore, blueskyScore, redditScore, vegvesenScore,
  airQualityScore, elevationScore, emDensityScore,
  kineticCalmScore, acousticCalmScore, compositeAether,
} from '../utils/scores.js'

export function useLocationScore() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  const compute = useCallback(async (lat, lon, elevationM, kineticReading, acousticReading) => {
    setStatus('computing')
    const sources = {}

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

    let policeCount = null, policeScoreVal = null
    {
      const t0 = Date.now()
      try {
        const rssRes = await fetch('https://api.politiet.no/politiloggen/v1/rss')
        if (!rssRes.ok) throw new Error(`HTTP ${rssRes.status}`)
        const xml    = new DOMParser().parseFromString(await rssRes.text(), 'text/xml')
        const cutoff = Date.now() - 24 * 3600 * 1000
        policeCount  = Array.from(xml.querySelectorAll('item'))
          .filter(item => {
            const pub = item.querySelector('pubDate')?.textContent
            return pub && new Date(pub).getTime() > cutoff
          }).length
        policeScoreVal = policeScore(policeCount)
        sources.police = { status: 'ok', latencyMs: Date.now() - t0, raw: `${policeCount} hendelser/24h` }
      } catch { sources.police = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    let bskyCount = null, bskyScoreVal = null
    {
      const t0 = Date.now()
      try {
        const since  = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        const bskyQ  = encodeURIComponent(
          `${city} (uro OR støy OR protest OR demonstrasjon OR bråk OR konflikt)`
        )
        const bskyRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` +
          `?q=${bskyQ}&limit=25&since=${since}`
        )
        if (!bskyRes.ok) throw new Error(`HTTP ${bskyRes.status}`)
        const bsky = await bskyRes.json()
        if (!Array.isArray(bsky?.posts)) throw new Error('unexpected response shape')
        bskyCount  = bsky.posts.length
        bskyScoreVal = blueskyScore(bskyCount)
        sources.bluesky = { status: 'ok', latencyMs: Date.now() - t0, raw: `${bskyCount} posts/24h` }
      } catch { sources.bluesky = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    let redditCount = null, redditScoreVal = null
    {
      const t0 = Date.now()
      try {
        const rdRes = await fetch(
          `https://www.reddit.com/r/norge+oslo/new.json?limit=25&raw_json=1`
        )
        if (!rdRes.ok) throw new Error(`HTTP ${rdRes.status}`)
        const rd = await rdRes.json()
        if (!Array.isArray(rd?.data?.children)) throw new Error('unexpected response shape')
        redditCount    = rd.data.children.length
        redditScoreVal = redditScore(redditCount)
        sources.reddit = { status: 'ok', latencyMs: Date.now() - t0, raw: `${redditCount} posts/day` }
      } catch { sources.reddit = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    let vegCount = null, vegScoreVal = null
    {
      const t0 = Date.now()
      try {
        const latN = parseFloat(lat), lonN = parseFloat(lon)
        const dLat = 0.045, dLon = 0.045 / Math.cos((latN * Math.PI) / 180)
        const bbox = [
          (lonN - dLon).toFixed(5), (latN - dLat).toFixed(5),
          (lonN + dLon).toFixed(5), (latN + dLat).toFixed(5),
        ].join(',')
        const vegRes = await fetch(
          `https://nvdbapiles-v3.atlas.vegvesen.no/vegobjekter/596` +
          `?kartutsnitt=${bbox}&inkluder=metadata&antall=25`,
          { headers: { Accept: 'application/json', 'X-Client': 'Aether/1.0' } }
        )
        const vegData = await vegRes.json()
        const now = Date.now()
        vegCount = (vegData?.objekter ?? []).filter(o => {
          const end = o?.metadata?.sluttdato
          return !end || new Date(end).getTime() > now
        }).length
        vegScoreVal = vegvesenScore(vegCount)
        sources.traffic = { status: 'ok', latencyMs: Date.now() - t0, raw: `${vegCount} vegarbeid/5 km` }
      } catch { sources.traffic = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    let aqiVal = null, pm25Val = null, airScoreVal = null
    {
      const t0 = Date.now()
      try {
        const aqRes = await fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality` +
          `?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5`
        )
        const aqData = await aqRes.json()
        aqiVal      = aqData?.current?.european_aqi ?? null
        pm25Val     = aqData?.current?.pm2_5        ?? null
        airScoreVal = airQualityScore(aqiVal)
        sources.air = {
          status: 'ok', latencyMs: Date.now() - t0,
          raw: aqiVal != null
            ? `AQI ${aqiVal}${pm25Val != null ? ` · PM2.5 ${pm25Val.toFixed(1)}` : ''}`
            : '—',
        }
      } catch { sources.air = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    let emCount = null, emScoreVal = null
    {
      const t0 = Date.now()
      try {
        const oq =
          `[out:json][timeout:15];` +
          `(node["tower:type"="communication"](around:5000,${lat},${lon});` +
          `way["tower:type"="communication"](around:5000,${lat},${lon}););` +
          `out count;`
        const osmRes = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(oq)}`,
        })
        const osm  = await osmRes.json()
        emCount    = parseInt(osm?.elements?.[0]?.tags?.total ?? '0', 10)
        emScoreVal = emDensityScore(emCount)
        sources.em = { status: 'ok', latencyMs: Date.now() - t0, raw: `${emCount} towers/5 km` }
      } catch { sources.em = { status: 'error', latencyMs: Date.now() - t0, raw: null } }
    }

    const elev     = elevationScore(elevationM)
    const kinetic  = kineticCalmScore(kineticReading?.dominantHz ?? null)
    const acoustic = acousticCalmScore(acousticReading?.dominantHz ?? null)

    sources.elev = elevationM != null
      ? { status: 'ok',      latencyMs: null, raw: `${elevationM} m asl` }
      : { status: 'skipped', latencyMs: null, raw: null }
    sources.kinetic = kineticReading
      ? { status: 'ok',      latencyMs: null, raw: `${kineticReading.dominantHz?.toFixed(2) ?? '?'} Hz · ${kineticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }
    sources.acoustic = acousticReading
      ? { status: 'ok',      latencyMs: null, raw: `${acousticReading.dominantHz?.toFixed(2) ?? '?'} Hz · ${acousticReading.zone ?? 'unknown'}` }
      : { status: 'skipped', latencyMs: null, raw: null }

    setResult({
      city, policeCount, bskyCount, redditCount, vegCount, aqiVal, pm25Val, elevationM, emCount,
      sources,
      scores: { police: policeScoreVal, bluesky: bskyScoreVal, reddit: redditScoreVal, traffic: vegScoreVal, air: airScoreVal, elev, em: emScoreVal, kinetic, acoustic },
      aether: compositeAether([policeScoreVal, bskyScoreVal, redditScoreVal, vegScoreVal, airScoreVal, elev, emScoreVal, kinetic, acoustic]),
    })
    setStatus('ready')
  }, [])

  return { status, result, compute }
}
