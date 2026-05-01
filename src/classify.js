// ─── Per-channel threshold tiers ─────────────────────────────────────────────

export function kineticTier(freqHz) {
  if (freqHz == null)   return { id: 'static',     label: 'Static',      note: '< 0.1 Hz' }
  if (freqHz < 2)       return { id: 'deep',       label: 'Deep',        note: '0.1–2 Hz' }
  if (freqHz <= 8)      return { id: 'ground',     label: 'Ground',      note: '2–8 Hz' }
  return                       { id: 'structural', label: 'Structural',  note: '> 8 Hz' }
}

export function atmosphericTier(pressureHpa, deltaP) {
  const p  = parseFloat(pressureHpa ?? 0)
  const dp = parseFloat(deltaP ?? 0)
  const level = p < 1000 ? 'low' : p <= 1020 ? 'normal' : 'high'
  const trend = Math.abs(dp) < 0.2 ? 'stable' : dp < 0 ? 'falling' : 'rising'
  const labels = {
    low: 'Low', normal: 'Normal', high: 'High',
    stable: 'Stable', falling: 'Falling', rising: 'Rising',
  }
  return { level, trend, label: labels[level], trendLabel: labels[trend] }
}

// ─── Archetypes ───────────────────────────────────────────────────────────────
// Evaluated in order; first match wins.
// ac = acoustic zone: 'oasis' | 'neutral' | 'stress' | null

const ARCHETYPES = [
  {
    name: 'Resonant Field',
    description: 'Near Schumann resonance (7–8 Hz) with no airborne stress signal. A rare terrestrial alignment.',
    sensation: 'Deep coherence',
    match: (k, ac, _a, hz) => hz >= 6.5 && hz <= 9.5 && ac !== 'stress',
  },
  {
    name: 'Deep Quiet',
    description: 'Still ground, acoustic calm, stable air. Maximum restorative potential.',
    sensation: 'Stillness',
    match: (k, ac, a) => k.id === 'static' && (ac === 'oasis' || ac == null) && a.trend === 'stable',
  },
  {
    name: 'Living Ground',
    description: 'Natural infrasonic resonance with minimal airborne interference.',
    sensation: 'Grounding',
    match: (k, ac, a) => (k.id === 'deep' || k.id === 'ground') && (ac === 'oasis' || ac == null) && a.trend === 'stable',
  },
  {
    name: 'Open Field',
    description: 'Low vibration, acoustic calm, high stable pressure. A sense of expansion and clarity.',
    sensation: 'Expansion',
    match: (k, ac, a) => (k.id === 'static' || k.id === 'deep') && (ac === 'oasis' || ac == null) && a.level === 'high',
  },
  {
    name: 'Storm Approach',
    description: 'Structural vibration and falling pressure with acoustic tension. Heavy anticipation.',
    sensation: 'Anticipation',
    match: (k, ac, a) => a.trend === 'falling' && (ac === 'stress' || ac === 'neutral'),
  },
  {
    name: 'Urban Static',
    description: 'Acoustic interference from infrastructure layered over structural vibration.',
    sensation: 'Overstimulation',
    match: (k, ac, _a) => ac === 'stress' && k.id === 'structural',
  },
  {
    name: 'Charged Atmosphere',
    description: 'Acoustic activity with shifting pressure. Heightened and electric.',
    sensation: 'Alertness',
    match: (_k, ac, a) => ac === 'stress' && a.trend !== 'stable',
  },
  {
    name: 'Unsettled Field',
    description: 'Mixed signals — gather more readings across locations to compare.',
    sensation: 'Undefined',
    match: () => true,
  },
]

// ─── Main classifier ──────────────────────────────────────────────────────────

export function classify(kineticReading, _magneticReading, atmosphericReading, acousticReading) {
  const freqHz = kineticReading?.dominantHz ?? null
  const k  = kineticTier(freqHz)
  const ac = acousticReading?.zone ?? null
  const a  = atmosphericReading
    ? atmosphericTier(atmosphericReading.pressureHpa, atmosphericReading.deltaP)
    : null

  const archetype = a
    ? ARCHETYPES.find(arc => arc.match(k, ac, a, freqHz ?? 0))
    : null

  return { k, a, archetype }
}
