import SensorRing from './SensorRing.jsx'

export default function SensorOrb({ label, value, unit, zone, zoneColor, status, channelColor, onActivate }) {
  const isActive = status === 'active' || status === 'listening' || status === 'ready'
  const isIdle   = status === 'idle' || status === 'pending'
  const isDenied = status === 'denied' || status === 'error' || status === 'unsupported'

  const ringStatus = status === 'listening' ? 'active' : status

  return (
    <button
      className="sensor-orb"
      onClick={isIdle && onActivate ? onActivate : undefined}
      disabled={isDenied || (!isIdle && !onActivate)}
      style={{
        '--orb-color': channelColor,
        background: `color-mix(in srgb, ${channelColor} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${channelColor} 35%, transparent)`,
        boxShadow: isActive ? `0 0 14px color-mix(in srgb, ${channelColor} 25%, transparent)` : 'none',
        cursor: isIdle && onActivate ? 'pointer' : 'default',
      }}
    >
      <div style={{ transform: 'scale(0.82)', transformOrigin: 'center', lineHeight: 0 }}>
        <SensorRing status={ringStatus} color={channelColor} />
      </div>

      <div className="sensor-orb-value" style={{ color: isActive ? channelColor : 'var(--color-text-muted)' }}>
        {value != null
          ? <>{value}<span className="sensor-orb-unit">{unit}</span></>
          : isIdle && onActivate
            ? <span style={{ fontSize: '0.58rem', color: 'var(--color-text-dim)' }}>tap</span>
            : '—'
        }
      </div>

      <div className="sensor-orb-label" style={{ color: zoneColor ?? 'var(--color-text-dim)' }}>
        {isDenied ? 'denied' : zone ?? label}
      </div>

      <div className="sensor-orb-channel">{label}</div>
    </button>
  )
}
