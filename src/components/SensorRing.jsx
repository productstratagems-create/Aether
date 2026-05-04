// Animated SVG status ring: idle | active | resting | ready | listening
export default function SensorRing({ status, color, restSecondsLeft, restTotalSeconds = 50 }) {
  const size = 44
  const cx = size / 2
  const r = 16
  const circumference = 2 * Math.PI * r
  const strokeW = 2.5

  const idle = status === 'idle' || status === 'pending'
  const active = status === 'active' || status === 'listening'
  const resting = status === 'resting'
  const ready = status === 'ready'
  const denied = status === 'denied' || status === 'error'

  const progress = resting
    ? (restSecondsLeft / restTotalSeconds)
    : ready ? 1 : 0

  const offset = circumference * (1 - progress)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeW}
      />

      {/* Progress / active ring */}
      {(resting || ready) && (
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 1.1s linear', opacity: resting ? 0.7 : 1 }}
        />
      )}

      {/* Center dot */}
      <circle
        cx={cx} cy={cx} r={5}
        fill={
          idle    ? 'rgba(255,255,255,0.1)' :
          denied  ? '#ef4444' :
          active  ? color :
          resting ? 'rgba(255,255,255,0.15)' :
          ready   ? color : 'rgba(255,255,255,0.1)'
        }
        style={
          active
            ? { animation: 'pulse-ring 1.4s ease-in-out infinite', color }
            : undefined
        }
      />

      {/* Outer pulse ring (active only) */}
      {active && (
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0}
          style={{ animation: 'pulse-ring 1.4s ease-in-out infinite', color }}
        />
      )}
    </svg>
  )
}
