import { ZONE_INFO } from '../utils/constants.js'

export default function ZoneVerdict({ zone, dominantHz }) {
  if (!zone) return null
  const z = ZONE_INFO[zone]
  return (
    <div
      className="zone-verdict"
      style={{
        background: z.bg,
        borderColor: z.border,
        boxShadow: `0 0 12px ${z.border}`,
      }}
    >
      <div className="zone-verdict-top">
        <span className="zone-verdict-name" style={{ color: z.color }}>{z.label}</span>
        {dominantHz != null && (
          <span className="zone-verdict-hz">{dominantHz.toFixed(2)} Hz</span>
        )}
      </div>
      <p className="zone-verdict-desc">{z.desc}</p>
    </div>
  )
}
