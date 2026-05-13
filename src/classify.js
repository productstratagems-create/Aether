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
    name: 'Charged',
    description: 'Geomagnetic disturbance is elevated — turbulence in the invisible background field.',
    sensation: 'Disruption',
    match: ({ kp, magStability, seismicActivity }) =>
      (kp != null && kp >= 4) || magStability === 'turbulent' ||
      (seismicActivity != null && seismicActivity >= 3),
  },
  {
    name: 'Still',
    description: 'Ground, air, field, and atmosphere are at rest together. The rarest convergence.',
    sensation: 'Stillness',
    match: ({ groundZone, acousticZone, magStability, kp, pressureTrend }) =>
      groundZone === 'calm' &&
      (acousticZone === 'hush' || acousticZone === 'quiet') &&
      magStability === 'stable' &&
      (kp == null || kp <= 2) &&
      (pressureTrend === 'stable' || pressureTrend == null),
  },
  {
    name: 'Radiant',
    description: 'Natural light is flooding this space — open sky, solar energy, the field fully illuminated.',
    sensation: 'Luminosity',
    match: ({ groundZone, lightZone, kp }) =>
      (lightZone === 'full' || lightZone === 'bright') &&
      groundZone === 'calm' &&
      (kp == null || kp <= 3),
  },
  {
    name: 'Ancient',
    description: 'Billion-year-old rock underlies this place. The ground has been here longer than complex life.',
    sensation: 'Depth',
    match: ({ geologicAgeGa, groundZone, kp, seismicActivity }) =>
      geologicAgeGa != null && geologicAgeGa >= 1.0 &&
      (groundZone === 'calm' || groundZone == null) &&
      (kp == null || kp <= 3) &&
      (seismicActivity == null || seismicActivity === 0),
  },
  {
    name: 'Incoming',
    description: 'Barometric pressure is falling. The atmosphere is reorganising ahead of a system.',
    sensation: 'Anticipation',
    match: ({ pressureTrend }) => pressureTrend === 'falling',
  },
  {
    name: 'Tidal',
    description: 'Near new or full moon — gravitational alignment at its most pronounced.',
    sensation: 'Receptivity',
    match: ({ lunarPhase, kp }) =>
      lunarPhase != null &&
      (lunarPhase.nearNew || lunarPhase.nearFull) &&
      (kp == null || kp <= 3),
  },
  {
    name: 'Grounded',
    description: 'Mechanical resonance in the ground. Earth energy transmitting through the substrate.',
    sensation: 'Aliveness',
    match: ({ groundZone, kineticReading }) =>
      groundZone === 'active' &&
      kineticReading?.dominantHz != null &&
      kineticReading.dominantHz >= 4 &&
      kineticReading.dominantHz <= 12,
  },
  {
    name: 'Saturated',
    description: 'Ground vibration, noise, and density compounding. The field is full.',
    sensation: 'Saturation',
    match: ({ groundZone, acousticZone }) =>
      groundZone === 'stress' ||
      (groundZone === 'active' && (acousticZone === 'active' || acousticZone === 'loud')),
  },
  {
    name: 'Clear',
    description: 'Ground calm, field stable, acoustics uncluttered. Signal moves freely here.',
    sensation: 'Expansion',
    match: ({ groundZone, acousticZone, magStability }) =>
      groundZone === 'calm' &&
      (acousticZone === 'hush' || acousticZone === 'quiet' || acousticZone === 'ambient') &&
      (magStability === 'stable' || magStability == null),
  },
  {
    name: 'Unsettled',
    description: 'No single pattern dominates. The field is between states.',
    sensation: 'Transition',
    match: () => true,
  },
]

// ─── Main classifier ──────────────────────────────────────────────────────────

export function classify(kineticReading, _unused, atmosphericReading, acousticReading, magnetometerReading, kp, lunarPhase, luminanceReading, geoReading) {
  const a = atmosphericReading
    ? atmosphericTier(atmosphericReading.pressureHpa, atmosphericReading.deltaP)
    : null

  const ctx = {
    groundZone:      kineticReading?.zone           ?? null,
    acousticZone:    acousticReading?.zone          ?? null,
    magStability:    magnetometerReading?.stability ?? null,
    kp:              kp ?? null,
    pressureTrend:   a?.trend                       ?? null,
    lunarPhase:      lunarPhase                     ?? null,
    lightZone:       luminanceReading?.zone         ?? null,
    colorTemp:       luminanceReading?.colorTemp    ?? null,
    geologicAgeGa:   geoReading?.ageGa              ?? null,
    rockClass:       geoReading?.rockClass          ?? null,
    seismicActivity: geoReading?.seismicCount       ?? null,
    kineticReading,
    magnetometerReading,
  }

  const archetype = (atmosphericReading || kineticReading || acousticReading || magnetometerReading)
    ? ARCHETYPES.find(arc => arc.match(ctx))
    : null

  return { a, archetype }
}
