// ─── Per-channel threshold tiers ─────────────────────────────────────────────

export function kineticTier(freqHz) {
  if (freqHz == null)   return { id: 'static',     label: 'Static',      note: '< 0.1 Hz' }
  if (freqHz < 2)       return { id: 'deep',       label: 'Deep',        note: '0.1–2 Hz' }
  if (freqHz <= 8)      return { id: 'ground',     label: 'Ground',      note: '2–8 Hz' }
  return                       { id: 'structural', label: 'Structural',  note: '> 8 Hz' }
}

export function magneticTier(fluxVariance) {
  const v = parseFloat(fluxVariance ?? 0)
  if (v < 0.5)  return { id: 'quiet',    label: 'Quiet',    note: '< 0.5 ΔμT' }
  if (v < 2.0)  return { id: 'moderate', label: 'Moderate', note: '0.5–2 ΔμT' }
  return               { id: 'active',   label: 'Active',   note: '> 2 ΔμT' }
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

const ARCHETYPES = [
  {
    name: 'Resonant Field',
    description: 'Near Schumann resonance (7–8 Hz) with a calm magnetic field. A rare terrestrial alignment.',
    sensation: 'Deep coherence',
    match: (k, m, _a, hz) => hz >= 6.5 && hz <= 9.5 && m.id !== 'active',
  },
  {
    name: 'Deep Quiet',
    description: 'Still ground, undisturbed magnetic field, stable air. Maximum restorative potential.',
    sensation: 'Stillness',
    match: (k, m, a) => k.id === 'static' && m.id === 'quiet' && a.trend === 'stable',
  },
  {
    name: 'Living Ground',
    description: 'Natural infrasonic resonance with minimal electromagnetic interference.',
    sensation: 'Grounding',
    match: (k, m, a) => (k.id === 'deep' || k.id === 'ground') && m.id === 'quiet' && a.trend === 'stable',
  },
  {
    name: 'Open Field',
    description: 'Low vibration, high stable pressure. A sense of expansion and clarity.',
    sensation: 'Expansion',
    match: (k, m, a) => (k.id === 'static' || k.id === 'deep') && m.id === 'quiet' && a.level === 'high',
  },
  {
    name: 'Storm Approach',
    description: 'Structural vibration and falling pressure with magnetic activity. Heavy anticipation.',
    sensation: 'Anticipation',
    match: (k, m, a) => a.trend === 'falling' && (m.id === 'moderate' || m.id === 'active'),
  },
  {
    name: 'Urban Static',
    description: 'High magnetic variance from infrastructure combined with structural vibration.',
    sensation: 'Overstimulation',
    match: (k, m, _a) => m.id === 'active' && k.id === 'structural',
  },
  {
    name: 'Charged Atmosphere',
    description: 'Active magnetic field with shifting pressure. Heightened and electric.',
    sensation: 'Alertness',
    match: (_k, m, a) => m.id === 'active' && a.trend !== 'stable',
  },
  {
    name: 'Unsettled Field',
    description: 'Mixed signals — gather more readings across locations to compare.',
    sensation: 'Undefined',
    match: () => true,
  },
]

// ─── Main classifier ──────────────────────────────────────────────────────────

export function classify(kineticReading, magneticReading, atmosphericReading) {
  const freqHz = kineticReading?.freqHz ?? null
  const k = kineticTier(freqHz)
  const m = magneticTier(magneticReading?.fluxVariance)
  const a = atmosphericReading
    ? atmosphericTier(atmosphericReading.pressureHpa, atmosphericReading.deltaP)
    : null

  const archetype = a
    ? ARCHETYPES.find(arc => arc.match(k, m, a, freqHz ?? 0))
    : null

  return { k, m, a, archetype }
}
