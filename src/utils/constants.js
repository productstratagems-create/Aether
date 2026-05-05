export const FFT_SIZE           = 512
export const SPECTRUM_MAX_HZ    = 20
export const SPECTRUM_MIN_HZ    = 5    // below this is noise floor on phone accelerometers
export const KINETIC_UPDATE_MS  = 2000 // EMA spectrum update interval (continuous, no rest)

export const ACOUSTIC_UPDATE_MS = 500  // dB SPL update interval

export const MAGNETOMETER_HZ    = 10   // Generic Sensor API frequency

export const HISTORY_KEY = 'aether-locations'

export const SCORE_LABELS = {
  magnetic:  'Magnetic Field',
  kp:        'Geomagnetic',
  ground:    'Ground Calm',
  air:       'Air Clarity',
  pressure:  'Pressure',
  acoustic:  'Acoustic',
  elev:      'Elevation',
}

export const SOURCE_META = {
  magnetic:  { label: 'Magnetic Field', domain: 'Magnetometer API' },
  kp:        { label: 'Geomagnetic Kp', domain: 'services.swpc.noaa.gov' },
  ground:    { label: 'Ground Calm',    domain: 'DeviceMotion API' },
  air:       { label: 'Air Clarity',   domain: 'air-quality-api.open-meteo.com' },
  pressure:  { label: 'Pressure',      domain: 'api.open-meteo.com' },
  acoustic:  { label: 'Acoustic',      domain: 'Microphone API' },
  elev:      { label: 'Elevation',     domain: 'api.open-meteo.com' },
}

// Ground vibration zones (accelerometer, frequencies above SPECTRUM_MIN_HZ only)
export const GROUND_ZONES = {
  calm:   { label: 'Calm',     color: '#34d399', border: '#0d9488', bg: 'rgba(2,44,34,0.6)',    desc: 'Minimal ground activity. Still earth, low mechanical interference.' },
  active: { label: 'Active',   color: '#fbbf24', border: '#d97706', bg: 'rgba(26,20,0,0.6)',    desc: 'Moderate ground vibration — traffic, HVAC, building resonance.' },
  stress: { label: 'Stress',   color: '#f87171', border: '#dc2626', bg: 'rgba(31,10,10,0.6)',   desc: 'Heavy mechanical vibration — construction, heavy traffic, machinery.' },
}

// Acoustic dB SPL zones
export const ACOUSTIC_ZONES = {
  silent:  { label: 'Silent',  color: '#34d399', desc: '< 30 dB — library, deep forest' },
  quiet:   { label: 'Quiet',   color: '#6ee7b7', desc: '30–50 dB — residential at night' },
  ambient: { label: 'Ambient', color: '#9ca3af', desc: '50–65 dB — office, light traffic' },
  noisy:   { label: 'Noisy',   color: '#fbbf24', desc: '65–80 dB — busy street' },
  loud:    { label: 'Loud',    color: '#f87171', desc: '> 80 dB — construction, crowd' },
}

// Magnetic field stability zones
export const MAGNETIC_ZONES = {
  stable:   { label: 'Stable',   color: '#34d399', desc: 'Coherent, undisturbed field.' },
  shifting: { label: 'Shifting', color: '#fbbf24', desc: 'Minor fluctuations detected.' },
  turbulent:{ label: 'Turbulent',color: '#f87171', desc: 'Significant field disturbance.' },
}

// Kp index classification
export const KP_ZONES = [
  { max: 1,  label: 'Quiet',      color: '#34d399' },
  { max: 3,  label: 'Unsettled',  color: '#9ca3af' },
  { max: 4,  label: 'Active',     color: '#fbbf24' },
  { max: 9,  label: 'Storm',      color: '#f87171' },
]

export const TILE_URLS = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}
