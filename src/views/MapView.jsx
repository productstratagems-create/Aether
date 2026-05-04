import MapPanel from '../components/MapPanel.jsx'

export default function MapView({ history, atmospheric, latestScore }) {
  return (
    <MapPanel
      history={history}
      currentLat={atmospheric.reading?.lat ?? null}
      currentLon={atmospheric.reading?.lon ?? null}
      currentScore={latestScore}
      city={history[0]?.city ?? null}
      style={{ height: '100%' }}
    />
  )
}
