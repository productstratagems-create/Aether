// ─── Per-channel threshold tiers ─────────────────────────────────────────────

export function atmosphericTier(pressureHpa, deltaP) {
  const p  = parseFloat(pressureHpa ?? 0)
  const dp = parseFloat(deltaP ?? 0)
  const level = p < 1000 ? 'low' : p <= 1020 ? 'normal' : 'high'
  const trend = Math.abs(dp) < 0.2 ? 'stable' : dp < 0 ? 'falling' : 'rising'
  const labels = { low: 'Low', normal: 'Normal', high: 'High', stable: 'Stable', falling: 'Falling', rising: 'Rising' }
  return { level, trend, label: labels[level], trendLabel: labels[trend] }
}

// ─── Archetypes ───────────────────────────────────────────────────────────────
// Evaluated in order; first match wins.
// Grounded in physically measurable phenomena — no pseudoscience.
//
// Parameters:
//   groundZone    'calm' | 'active' | 'stress' | null
//   acousticZone  'silent' | 'quiet' | 'ambient' | 'noisy' | 'loud' | null
//   magStability  'stable' | 'shifting' | 'turbulent' | null
//   kp            number | null   (0–9 planetary geomagnetic index)
//   pressureTrend 'stable' | 'rising' | 'falling' | null
//   lunarPhase    { nearNew, nearFull } | null

const ARCHETYPES = [
  {
    name: 'Magnetic Storm',
    description: 'Elevated planetary geomagnetic activity is disturbing the local field. Heightened solar-terrestrial interaction.',
    sensation: 'Electric charge',
    match: ({ kp, magStability }) =>
      (kp != null && kp >= 5) || magStability === 'turbulent',
  },
  {
    name: 'Deep Silence',
    description: 'Still ground, quiet air, coherent magnetic field, stable atmosphere. The rarest convergence — maximum restorative potential.',
    sensation: 'Stillness',
    match: ({ groundZone, acousticZone, magStability, kp, pressureTrend }) =>
      (groundZone === 'calm') &&
      (acousticZone === 'silent' || acousticZone === 'quiet') &&
      (magStability === 'stable') &&
      (kp == null || kp <= 2) &&
      (pressureTrend === 'stable' || pressureTrend == null),
  },
  {
    name: 'Storm Front',
    description: 'Barometric pressure is falling. Air quality degrading. The atmosphere is in motion — a system is approaching.',
    sensation: 'Anticipation',
    match: ({ pressureTrend, acousticZone }) =>
      pressureTrend === 'falling' &&
      (acousticZone === 'noisy' || acousticZone === 'loud' || acousticZone === 'ambient'),
  },
  {
    name: 'Lunar Tide',
    description: 'Near a new or full moon with a quiet field. Tidal forces are at their peak — gravitational alignment with the Sun and Moon.',
    sensation: 'Receptivity',
    match: ({ lunarPhase, kp, magStability }) =>
      lunarPhase != null &&
      (lunarPhase.nearNew || lunarPhase.nearFull) &&
      (kp == null || kp <= 3) &&
      (magStability === 'stable' || magStability == null),
  },
  {
    name: 'Trembling Earth',
    description: 'Structural vibration at 5–8 Hz detected — the resonant frequency of buildings and geological formations. Mechanical energy rising from the ground.',
    sensation: 'Grounding',
    match: ({ groundZone, kineticReading }) =>
      groundZone === 'active' &&
      kineticReading?.dominantHz != null &&
      kineticReading.dominantHz >= 5 &&
      kineticReading.dominantHz <= 9,
  },
  {
    name: 'Urban Pulse',
    description: 'High ground vibration, elevated sound level, and degraded air quality. The signature of dense mechanical civilisation.',
    sensation: 'Overstimulation',
    match: ({ groundZone, acousticZone }) =>
      groundZone === 'stress' ||
      (groundZone === 'active' && (acousticZone === 'noisy' || acousticZone === 'loud')),
  },
  {
    name: 'Clear Ground',
    description: 'Calm earth, clean air, and a coherent field. A place where the background noise of civilisation has faded.',
    sensation: 'Expansion',
    match: ({ groundZone, acousticZone, magStability }) =>
      groundZone === 'calm' &&
      (acousticZone === 'silent' || acousticZone === 'quiet' || acousticZone === 'ambient') &&
      (magStability === 'stable' || magStability == null),
  },
  {
    name: 'Shifting Field',
    description: 'Multiple signals in flux — pressure, field, or vibration are changing. Gather more readings across this location.',
    sensation: 'Undefined',
    match: () => true,
  },
]

// ─── Main classifier ──────────────────────────────────────────────────────────

export function classify(kineticReading, _unused, atmosphericReading, acousticReading, magnetometerReading, kp, lunarPhase) {
  const a = atmosphericReading
    ? atmosphericTier(atmosphericReading.pressureHpa, atmosphericReading.deltaP)
    : null

  const ctx = {
    groundZone:    kineticReading?.zone        ?? null,
    acousticZone:  acousticReading?.zone       ?? null,
    magStability:  magnetometerReading?.stability ?? null,
    kp:            kp ?? null,
    pressureTrend: a?.trend                    ?? null,
    lunarPhase:    lunarPhase                  ?? null,
    kineticReading,
    magnetometerReading,
  }

  const archetype = (atmosphericReading || kineticReading || acousticReading || magnetometerReading)
    ? ARCHETYPES.find(arc => arc.match(ctx))
    : null

  return { a, archetype }
}
