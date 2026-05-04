import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { TILE_URLS } from '../utils/constants.js'

export default function MapPanel({ history, currentLat, currentLon, currentScore, city }) {
  const containerRef    = useRef(null)
  const gestureHintRef  = useRef(null)
  const mapRef          = useRef(null)
  const markersRef      = useRef([])
  const polylineRef     = useRef(null)
  const tileRef         = useRef(null)
  const gestureTimerRef = useRef(null)
  const [mapStyle, setMapStyle] = useState('dark')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false })

    const el = containerRef.current
    const onWheel = e => {
      if (e.ctrlKey) {
        mapRef.current?.scrollWheelZoom.enable()
        clearTimeout(gestureTimerRef.current)
        gestureTimerRef.current = setTimeout(() => mapRef.current?.scrollWheelZoom.disable(), 600)
      } else {
        gestureHintRef.current?.classList.add('map-gesture-hint--visible')
        clearTimeout(gestureTimerRef.current)
        gestureTimerRef.current = setTimeout(() => {
          gestureHintRef.current?.classList.remove('map-gesture-hint--visible')
        }, 1500)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(gestureTimerRef.current)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    tileRef.current?.remove()
    tileRef.current = L.tileLayer(TILE_URLS[mapStyle], {
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(mapRef.current)
  }, [mapStyle])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    polylineRef.current?.remove()
    polylineRef.current = null

    const bounds = []

    const trailCoords = [...history]
      .reverse()
      .filter(e => e.lat && e.lon)
      .map(e => [parseFloat(e.lat), parseFloat(e.lon)])
      .filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon))
    if (trailCoords.length >= 2) {
      polylineRef.current = L.polyline(trailCoords, {
        color: '#6b7280', weight: 2, dashArray: '4 6', opacity: 0.6,
      }).addTo(map)
    }

    history.forEach(entry => {
      if (!entry.lat || !entry.lon) return
      const lat = parseFloat(entry.lat), lon = parseFloat(entry.lon)
      if (isNaN(lat) || isNaN(lon)) return
      const s = entry.aether
      const fill = s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#f87171'
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-score-marker" style="background:${fill}">${s ?? '?'}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
      })
      const m = L.marker([lat, lon], { icon }).bindPopup(`<b>${entry.city}</b><br>Score: ${s ?? '—'}`)
      m.addTo(map)
      markersRef.current.push(m)
      bounds.push([lat, lon])
    })

    if (currentLat && currentLon) {
      const lat = parseFloat(currentLat), lon = parseFloat(currentLon)
      if (!isNaN(lat) && !isNaN(lon)) {
        const s = currentScore
        const fill = s != null ? (s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#f87171') : '#818cf8'
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-score-marker map-score-marker--current" style="background:${fill}">${s ?? '?'}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
        })
        const m = L.marker([lat, lon], { icon }).bindPopup(`<b>Current location</b>${s != null ? `<br>Score: ${s}` : ''}`)
        m.addTo(map)
        markersRef.current.push(m)
        bounds.push([lat, lon])
      }
    }

    if (bounds.length === 1) map.setView(bounds[0], 13)
    else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 14 })
  }, [history, currentLat, currentLon, currentScore])

  const scoreColor = currentScore != null
    ? (currentScore >= 70 ? '#34d399' : currentScore >= 40 ? '#fbbf24' : '#f87171')
    : 'var(--color-score)'

  return (
    <div className="map-view-container" style={{ flex: 1, minHeight: 0 }}>
      <div ref={containerRef} className="map-panel" style={{ width: '100%', height: '100%' }} />
      <div ref={gestureHintRef} className="map-gesture-hint">Use Ctrl + scroll to zoom</div>

      {(currentLat || history.some(e => e.lat)) && (
        <div className="map-overlay-card">
          <div>
            <div className="map-overlay-label">Current location</div>
            <div className="map-overlay-city">{city ?? (currentLat ? 'Located' : 'No location yet')}</div>
          </div>
          {currentScore != null && (
            <div style={{ textAlign: 'right' }}>
              <div className="map-overlay-label">Aether score</div>
              <div className="map-overlay-score" style={{ color: scoreColor }}>{currentScore}</div>
            </div>
          )}
        </div>
      )}

      <button
        className="map-style-toggle"
        onClick={() => setMapStyle(s => s === 'dark' ? 'light' : 'dark')}
        title={mapStyle === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
      >
        {mapStyle === 'dark' ? '☀' : '◑'}
      </button>
    </div>
  )
}
