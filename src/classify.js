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
    name: 'Fractured Field',
    description: 'The geomagnetic field is disturbed — elevated planetary activity or turbulent local magnetics are fragmenting the background field. Difficult to settle here.',
    sensation: 'Disruption',
    match: ({ kp, magStability }) =>
      (kp != null && kp >= 4) || magStability === 'turbulent',
  },
  {
    name: 'Still Depth',
    description: 'All channels converge toward quiet — ground, air, field, and atmosphere are at rest together. The rarest configuration; maximum coherence.',
    sensation: 'Stillness',
    match: ({ groundZone, acousticZone, magStability, kp, pressureTrend }) =>
      groundZone === 'calm' &&
      (acousticZone === 'hush' || acousticZone === 'quiet') &&
      magStability === 'stable' &&
      (kp == null || kp <= 2) &&
      (pressureTrend === 'stable' || pressureTrend == null),
  },
  {
    name: 'Pressure Break',
    description: 'Barometric pressure is falling — the atmosphere is reorganising ahead of an incoming system. Something is coming.',
    sensation: 'Anticipation',
    match: ({ pressureTrend }) => pressureTrend === 'falling',
  },
  {
    name: 'Lunar Pull',
    description: 'The Moon is at new or full phase, maximising tidal influence on atmosphere and fluid systems. The gravitational geometry is at its most pronounced.',
    sensation: 'Receptivity',
    match: ({ lunarPhase, kp }) =>
      lunarPhase != null &&
      (lunarPhase.nearNew || lunarPhase.nearFull) &&
      (kp == null || kp <= 3),
  },
  {
    name: 'Live Ground',
    description: 'Mechanical energy is present in the ground — structural vibration, geological resonance, or urban infrastructure is transmitting through the substrate beneath you.',
    sensation: 'Aliveness',
    match: ({ groundZone, kineticReading }) =>
      groundZone === 'active' &&
      kineticReading?.dominantHz != null &&
      kineticReading.dominantHz >= 4 &&
      kineticReading.dominantHz <= 12,
  },
  {
    name: 'Dense Field',
    description: "Multiple channels are simultaneously elevated — ground vibration, acoustic energy, and mechanical throughput are compounding. The field is thick with civilisation's output.",
    sensation: 'Saturation',
    match: ({ groundZone, acousticZone }) =>
      groundZone === 'stress' ||
      (groundZone === 'active' && (acousticZone === 'active' || acousticZone === 'loud')),
  },
  {
    name: 'Open Channel',
    description: 'Ground is calm, the acoustic environment is uncluttered, and the magnetic field is undisturbed. The background noise of infrastructure has receded — signal can move freely.',
    sensation: 'Expansion',
    match: ({ groundZone, acousticZone, magStability }) =>
      groundZone === 'calm' &&
      (acousticZone === 'hush' || acousticZone === 'quiet' || acousticZone === 'ambient') &&
      (magStability === 'stable' || magStability == null),
  },
  {
    name: 'Flux',
    description: 'The field is in motion — no single pattern dominates. Multiple variables are mid-range or changing. This location is between states.',
    sensation: 'Transition',
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
