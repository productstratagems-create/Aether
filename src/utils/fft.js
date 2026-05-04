import { FFT_SIZE, SPECTRUM_MAX_HZ } from './constants.js'

export const HANN = (() => {
  const w = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
  return w
})()

export function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0
      for (let j = 0; j < (len >> 1); j++) {
        const uRe = re[i + j], uIm = im[i + j]
        const half = i + j + (len >> 1)
        const vRe = re[half] * curRe - im[half] * curIm
        const vIm = re[half] * curIm + im[half] * curRe
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm
        re[half]  = uRe - vRe; im[half]  = uIm - vIm
        const nr = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nr
      }
    }
  }
}

export function computeSpectrum(samples, sampleRate) {
  const n = samples.length
  const mean = samples.reduce((a, b) => a + b, 0) / n
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = (samples[i] - mean) * HANN[i]
  fft(re, im)

  const freqRes = sampleRate / n
  const maxBin  = Math.min(Math.ceil(SPECTRUM_MAX_HZ / freqRes), (n >> 1) - 1)

  let maxMag = 0, dominantBin = 1
  const rawMags = []
  for (let k = 0; k <= maxBin; k++) {
    const mag = Math.sqrt(re[k] ** 2 + im[k] ** 2) / n
    rawMags.push(mag)
    if (k > 0 && mag > maxMag) { maxMag = mag; dominantBin = k }
  }

  const bins = rawMags.map((mag, k) => ({
    hz:  k * freqRes,
    mag: maxMag > 0 ? Math.min(mag / maxMag, 1) : 0,
  }))

  const dominantHz = dominantBin * freqRes
  let zone = null
  if (dominantHz >= 1 && dominantHz <= 5)      zone = 'oasis'
  else if (dominantHz > 5 && dominantHz <= 12) zone = 'neutral'
  else if (dominantHz > 12)                    zone = 'stress'

  return { bins, dominantHz, zone }
}

export function zoneEnergies(bins) {
  if (!bins || bins.length < 2) return null
  let oasis = 0, neutral = 0, stress = 0, total = 0
  for (const { hz, mag } of bins) {
    if (hz < 1) continue
    total += mag
    if (hz <= 5)       oasis   += mag
    else if (hz <= 12) neutral  += mag
    else               stress   += mag
  }
  if (total === 0) return null
  return {
    oasis:   Math.round((oasis   / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    stress:  Math.round((stress  / total) * 100),
  }
}

export function rms(values) {
  if (!values.length) return 0
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length)
}
