const ERA_DESCS = [
  { minMa: 2500, text: 'Archean basement — formed before complex life existed' },
  { minMa:  541, text: 'Proterozoic rock'                                       },
  { minMa:  252, text: 'Paleozoic formation'                                    },
  { minMa:   66, text: 'Mesozoic rock'                                          },
  { minMa:  2.6, text: 'Cenozoic deposit'                                       },
  { minMa:    0, text: 'Quaternary material — geologically young'               },
]

function eraText(ageMa) {
  return (ERA_DESCS.find(e => ageMa >= e.minMa) ?? ERA_DESCS.at(-1)).text
}

function s1_location({ city, featureName, geology }) {
  const place = featureName ?? city ?? 'this location'
  if (geology?.unitName && geology.ageMa != null)
    return `${place} stands on ${geology.unitName} — ${eraText(geology.ageMa)} (${Math.round(geology.ageMa)} Ma).`
  if (geology?.unitName)
    return `${place} stands on ${geology.unitName}.`
  return `Reading taken at ${place}.`
}

function s2_ground_mag({ ground, magnetic }) {
  const gp = ground == null ? null
    : ground >= 82 ? 'The ground was still'
    : ground >= 65 ? 'Low vibration registered in the substrate'
    : ground >= 45 ? 'Moderate mechanical vibration was present'
    : 'Heavy mechanical vibration dominated the substrate'
  const mp = magnetic == null ? null
    : magnetic >= 80 ? 'the magnetic field coherent and undisturbed'
    : magnetic >= 60 ? 'with minor field fluctuations'
    : magnetic >= 40 ? 'against a shifting magnetic background'
    : 'amid significant magnetic turbulence'
  if (gp && mp) return `${gp}, ${mp}.`
  if (gp) return `${gp}.`
  return null
}

function s3_atmosphere(scores, meta) {
  const parts = []
  if ((meta?.elevationM ?? 0) >= 150) parts.push(`at ${meta.elevationM} m elevation`)
  const { pressure, air, acoustic } = scores
  if (pressure != null && pressure < 45) parts.push('barometric pressure falling — a system approaching')
  else if ((pressure ?? 0) >= 80)        parts.push('barometric pressure stable')
  if ((air ?? 0) >= 80)                  parts.push('air clarity excellent')
  else if (air != null && air < 45)      parts.push('air quality compromised')
  if ((acoustic ?? 0) >= 85)             parts.push('the environment near-silent')
  else if ((acoustic ?? 0) >= 65)        parts.push('acoustic activity low')
  else if (acoustic != null && acoustic < 40) parts.push('acoustic noise elevated')
  if (!parts.length) return null
  const joined = parts.join(', ')
  return joined[0].toUpperCase() + joined.slice(1) + '.'
}

function s4_seismic(seismic, scores) {
  if (!seismic || seismic.count == null) return null
  if (seismic.count === 0)
    return (scores.geology ?? 0) >= 80
      ? 'No regional seismic activity in the preceding week — the crust at rest.'
      : null
  if (seismic.count <= 2)
    return `${seismic.count} seismic event${seismic.count > 1 ? 's' : ''} of M${seismic.maxMag?.toFixed(1)} or greater recorded within 150 km in the preceding week.`
  return `${seismic.count} seismic events up to M${seismic.maxMag?.toFixed(1)} recorded within 150 km in the preceding week — an active region.`
}

function s5_synthesis(archetype, aether) {
  if (!archetype?.name) return `Composite Aether score: ${aether ?? '—'}.`
  const sensation = archetype.sensation ? ` — ${archetype.sensation.toLowerCase()}` : ''
  return `The field read as ${archetype.name}${sensation}. Composite score: ${aether ?? '—'}.`
}

export function generateNarrative(entry) {
  return [
    s1_location(entry),
    s2_ground_mag(entry.scores),
    s3_atmosphere(entry.scores, entry.meta),
    s4_seismic(entry.seismic, entry.scores),
    s5_synthesis(entry.archetype, entry.aether),
  ].filter(Boolean).join(' ')
}
