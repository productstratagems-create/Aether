// ── Physical scoring functions ────────────────────────────────────────────────
// All inputs are real measured quantities. No social media proxies.

export function magneticStabilityScore(variance) {
  if (variance == null) return null
  // variance in μT — low = stable field = high score
  if (variance < 0.3)  return 92
  if (variance < 0.8)  return 78
  if (variance < 2.0)  return 55
  if (variance < 5.0)  return 35
  return 20
}

export function kpScore(kp) {
  if (kp == null) return null
  // Kp 0–9 planetary geomagnetic index; 0 = perfectly quiet
  return Math.max(20, Math.round(95 - kp * 14))
}

export function groundCalmScore(rms) {
  if (rms == null) return null
  // Accelerometer RMS magnitude (m/s²-ish); lower = calmer ground
  if (rms < 0.02)  return 88
  if (rms < 0.08)  return 72
  if (rms < 0.25)  return 52
  if (rms < 0.6)   return 35
  return 20
}

export function airQualityScore(aqi) {
  if (aqi == null) return null
  // European AQI 0–100+
  return Math.max(20, Math.round(92 - aqi * 0.9))
}

export function pressureStabilityScore(deltaP) {
  if (deltaP == null) return 75  // no delta yet = neutral, not penalised
  const d = Math.abs(parseFloat(deltaP))
  if (d < 0.2)  return 88
  if (d < 0.8)  return 70
  if (d < 2.0)  return 48
  return 28
}

export function acousticCalmScore(db) {
  if (db == null) return null
  // db is relative dB above ambient baseline — lower = quieter = higher score
  if (db < 3)  return 92
  if (db < 12) return 80
  if (db < 22) return 62
  if (db < 35) return 40
  return 22
}

export function luminanceScore(luminance, colorTemp) {
  if (luminance == null) return null
  const base = luminance < 0.05 ? 58
             : luminance < 0.20 ? 65
             : luminance < 0.50 ? 72
             : luminance < 0.80 ? 82
             : 90
  const bonus = colorTemp === 'cool' ? 4 : colorTemp === 'warm' ? -3 : 0
  return Math.min(95, Math.max(20, base + bonus))
}

export function elevationScore(meters) {
  if (meters == null) return null
  return Math.min(95, Math.round(25 + Math.sqrt(Math.max(0, meters)) * 1.6))
}

export function compositeAether(layers) {
  const valid = layers.filter(v => v != null)
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
}
