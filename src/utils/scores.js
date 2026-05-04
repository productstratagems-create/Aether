export function policeScore(count) {
  if (count == null) return null
  return Math.max(20, Math.round(90 - count * 9.3))
}

export function blueskyScore(count) {
  if (count == null) return null
  return Math.max(20, Math.round(88 - count * 2.7))
}

export function vegvesenScore(count) {
  if (count == null) return null
  return Math.max(20, Math.round(88 - count * 4.5))
}

export function airQualityScore(aqi) {
  if (aqi == null) return null
  return Math.max(20, Math.round(92 - aqi * 0.9))
}

export function elevationScore(meters) {
  if (meters == null) return null
  return Math.min(95, Math.round(25 + Math.sqrt(Math.max(0, meters)) * 1.6))
}

export function kineticCalmScore(dominantHz) {
  if (dominantHz == null) return null
  if (dominantHz < 0.1) return 90
  if (dominantHz <= 5)  return 80
  if (dominantHz <= 12) return 55
  return 25
}

export function acousticCalmScore(dominantHz) {
  if (dominantHz == null) return null
  if (dominantHz < 0.1) return 90
  if (dominantHz <= 5)  return 80
  if (dominantHz <= 12) return 55
  return 25
}

export function redditScore(count) {
  if (count == null) return null
  return Math.max(20, Math.round(86 - count * 2.6))
}

export function emDensityScore(count) {
  if (count == null) return null
  return Math.max(15, Math.round(95 - Math.log10(count + 1) * 40))
}

export function compositeAether(layers) {
  const valid = layers.filter(v => v != null)
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
}
