const SYNODIC  = 29.530588853
const KNOWN_NEW = new Date('2000-01-06T18:14:00Z').getTime()

const PHASE_NAMES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
]

export function lunarPhase(date = new Date()) {
  const days  = (date.getTime() - KNOWN_NEW) / 86_400_000
  const phase = ((days % SYNODIC) / SYNODIC + 1) % 1
  const index = Math.round(phase * 8) % 8
  const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100)
  const nearNew  = phase < 0.04 || phase > 0.96
  const nearFull = phase > 0.46 && phase < 0.54
  return { phase, name: PHASE_NAMES[index], illumination, nearNew, nearFull }
}
