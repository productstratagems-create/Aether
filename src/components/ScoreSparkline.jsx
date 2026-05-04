export default function ScoreSparkline({ values }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values)
  const range = Math.max(max - min, 5)
  const W = 300, H = 40, pad = 4
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (W - pad * 2),
    H - pad - ((v - min) / range) * (H - pad * 2),
  ])
  const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPts = [
    `${pts[0][0].toFixed(1)},${H}`,
    ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${pts[pts.length - 1][0].toFixed(1)},${H}`,
  ].join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="score-sparkline">
      <polygon points={areaPts} fill="#818cf8" fillOpacity="0.1" />
      <polyline points={linePts} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.5" fill="#818cf8" />
      ))}
    </svg>
  )
}
