import { useEffect, useRef } from 'react'

// 270° arc gauge — score 0-100, color gradient red→amber→green
const SIZE      = 180
const CX        = SIZE / 2
const R         = 72
const STROKE_W  = 10
const ARC_DEG   = 270
const START_DEG = 135  // starts at bottom-left
const ARC_LEN   = 2 * Math.PI * R * (ARC_DEG / 360)

function scoreColor(score) {
  if (score == null) return '#374151'
  if (score >= 70) return '#34d399'
  if (score >= 40) return '#fbbf24'
  return '#f87171'
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const toRad = d => (d * Math.PI) / 180
  const sx = cx + r * Math.cos(toRad(startDeg))
  const sy = cy + r * Math.sin(toRad(startDeg))
  const ex = cx + r * Math.cos(toRad(endDeg))
  const ey = cy + r * Math.sin(toRad(endDeg))
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`
}

export default function RadialGauge({ score, delta }) {
  const arcRef = useRef(null)
  const prevScore = useRef(0)

  useEffect(() => {
    if (!arcRef.current || score == null) return
    const startVal = prevScore.current
    const endVal   = score
    const duration = 1200
    const start    = performance.now()

    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      const cur  = startVal + (endVal - startVal) * ease
      const pct  = cur / 100
      const dashOffset = ARC_LEN * (1 - pct)
      arcRef.current.style.strokeDashoffset = dashOffset
      arcRef.current.style.stroke = scoreColor(cur)
      if (t < 1) requestAnimationFrame(animate)
      else prevScore.current = endVal
    }
    requestAnimationFrame(animate)
  }, [score])

  const trackPath  = arcPath(CX, CX, R, START_DEG, START_DEG + ARC_DEG)
  const valuePath  = arcPath(CX, CX, R, START_DEG, START_DEG + ARC_DEG)
  const color      = scoreColor(score)

  return (
    <div className="radial-gauge-wrap">
      <div className="radial-gauge" style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Track */}
          <path
            d={trackPath}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={STROKE_W}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            ref={arcRef}
            d={valuePath}
            fill="none"
            stroke={score != null ? color : 'transparent'}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
            strokeDasharray={ARC_LEN}
            strokeDashoffset={score != null ? ARC_LEN * (1 - (score / 100)) : ARC_LEN}
          />
        </svg>

        {/* Center text */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.1rem',
          paddingBottom: '0.5rem',
        }}>
          {score != null ? (
            <>
              <span style={{
                fontSize: '3rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
                color,
                fontFamily: 'var(--font-mono)',
              }}>
                {score}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>/100</span>
              {delta != null && (
                <span className="aether-delta" style={{
                  color: delta > 2 ? '#34d399' : delta < -2 ? '#f87171' : '#6b7280',
                }}>
                  {delta > 2 ? `▲ ${delta}` : delta < -2 ? `▼ ${Math.abs(delta)}` : '→'}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-dim)', textAlign: 'center' }}>
              Score location<br />to see result
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
