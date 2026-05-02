// Paste into browser console at http://localhost:5173/Aether/
// Uses Oslo coordinates — real GPS not required.
// Each block logs: status, latency, and the exact field the app reads.

const LAT = 59.9139, LON = 10.7522, CITY = 'Oslo'

async function run(name, fn) {
  const t0 = Date.now()
  try {
    const v = await fn()
    console.log(`%c✓ ${name} (${Date.now()-t0} ms)`, 'color:#34d399;font-weight:700', v)
  } catch(e) {
    console.error(`%c✗ ${name} (${Date.now()-t0} ms)`, 'color:#f87171;font-weight:700', e.message)
  }
}

await run('Police REST', async () => {
  const r = await fetch(
    `https://api.politiet.no/politiloggen/v1/hendelser?lat=${LAT}&lon=${LON}&radius=5000`,
    { headers: { Accept: 'application/json' } }
  )
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  const items = Array.isArray(d) ? d : (d?.items ?? d?.hendelser ?? [])
  const cutoff = Date.now() - 86400000
  const count = items.filter(h => new Date(h.created ?? h.tid ?? h.timestamp).getTime() > cutoff).length
  // Validate date field exists at all — key used for 24h filter
  const sampleKeys = Object.keys(items[0] ?? {}).join(', ')
  return { count_24h: count, total_returned: items.length, sample_keys: sampleKeys }
})

await run('Police RSS fallback', async () => {
  const r = await fetch('https://api.politiet.no/politiloggen/v1/rss')
  const xml = new DOMParser().parseFromString(await r.text(), 'text/xml')
  const items = Array.from(xml.querySelectorAll('item'))
  const cutoff = Date.now() - 86400000
  const count = items.filter(item => {
    const pub = item.querySelector('pubDate')?.textContent
    const text = (item.querySelector('title')?.textContent ?? '') +
                 (item.querySelector('description')?.textContent ?? '')
    return pub && new Date(pub).getTime() > cutoff &&
           text.toLowerCase().includes(CITY.toLowerCase())
  }).length
  return { count_24h_city_match: count, total_items: items.length }
})

await run('Bluesky', async () => {
  const since = new Date(Date.now() - 86400000).toISOString()
  const q = encodeURIComponent(`${CITY} (uro OR støy OR protest OR demonstrasjon OR bråk OR konflikt)`)
  const r = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=25&since=${since}&lang=no`
  )
  const d = await r.json()
  if (d?.error) throw new Error(d.error + ': ' + d.message)
  // Validate posts array exists
  if (!Array.isArray(d?.posts)) throw new Error('d.posts is not an array — shape mismatch: ' + JSON.stringify(Object.keys(d)))
  return { posts_count: d.posts.length }
})

await run('Reddit r/norge+oslo', async () => {
  const q = encodeURIComponent(CITY)
  const r = await fetch(
    `https://www.reddit.com/r/norge+oslo/search.json?q=${q}&sort=new&restrict_sr=on&t=day&limit=25&raw_json=1`,
    { headers: { Accept: 'application/json' } }
  )
  const d = await r.json()
  // Validate data.children path
  if (!Array.isArray(d?.data?.children)) throw new Error('d.data.children missing — shape: ' + JSON.stringify(Object.keys(d ?? {})))
  return { children_count: d.data.children.length, kind: d.kind }
})

await run('Vegvesen NVDB type 596', async () => {
  const dLat = 0.045, dLon = 0.045 / Math.cos(LAT * Math.PI / 180)
  const bbox = [(LON-dLon).toFixed(5),(LAT-dLat).toFixed(5),(LON+dLon).toFixed(5),(LAT+dLat).toFixed(5)].join(',')
  const r = await fetch(
    `https://nvdbapiles-v3.atlas.vegvesen.no/vegobjekter/596?kartutsnitt=${bbox}&inkluder=metadata&antall=25`,
    { headers: { Accept: 'application/json', 'X-Client': 'Aether/1.0' } }
  )
  const d = await r.json()
  // Validate objekter array
  if (!Array.isArray(d?.objekter)) throw new Error('d.objekter missing — top-level keys: ' + JSON.stringify(Object.keys(d ?? {})))
  const now = Date.now()
  const active = d.objekter.filter(o => {
    const end = o?.metadata?.sluttdato
    return !end || new Date(end).getTime() > now
  }).length
  return { active_works: active, total_returned: d.objekter.length, metadata_returnert: d?.metadata?.returnert }
})

await run('Air Quality (Open-Meteo)', async () => {
  const r = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=european_aqi,pm2_5`
  )
  const d = await r.json()
  if (d?.error || d?.reason) throw new Error(d?.reason ?? d?.error)
  // Validate current.european_aqi path
  if (d?.current?.european_aqi == null) throw new Error('european_aqi null/missing — current keys: ' + JSON.stringify(Object.keys(d?.current ?? {})))
  return { european_aqi: d.current.european_aqi, pm2_5: d.current.pm2_5 }
})

await run('Overpass EM towers', async () => {
  const oq = `[out:json][timeout:15];(node["tower:type"="communication"](around:5000,${LAT},${LON});way["tower:type"="communication"](around:5000,${LAT},${LON}););out count;`
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(oq)}`,
  })
  const d = await r.json()
  // Validate elements[0].tags.total path
  const total = d?.elements?.[0]?.tags?.total
  if (total == null) throw new Error('elements[0].tags.total missing — elements: ' + JSON.stringify(d?.elements?.slice(0,2)))
  return { tower_count: parseInt(total, 10), elements_length: d.elements.length }
})
