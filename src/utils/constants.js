export const FFT_SIZE            = 512
export const SPECTRUM_MAX_HZ     = 20
export const SPECTRUM_UPDATE_MS  = 500

export const KINETIC_REST_MS     = 50_000

export const ACOUSTIC_DOWNSAMPLE_HZ = 200
export const ACOUSTIC_CAPTURE_MS    = 10_000
export const ACOUSTIC_REST_MS       = 50_000
export const ACOUSTIC_FFT_SIZE      = 512

export const HISTORY_KEY = 'aether-locations'

export const SCORE_LABELS = {
  police:   'Police Log',
  bluesky:  'Bluesky',
  reddit:   'Reddit',
  traffic:  'Traffic',
  air:      'Air Quality',
  elev:     'Terrain',
  em:       'EM Density',
  kinetic:  'Ground',
  acoustic: 'Acoustic',
}

export const SOURCE_META = {
  police:   { label: 'Police Log',   domain: 'api.politiet.no (RSS)' },
  bluesky:  { label: 'Bluesky',      domain: 'public.api.bsky.app' },
  reddit:   { label: 'Reddit',       domain: 'reddit.com' },
  traffic:  { label: 'Traffic',      domain: 'nvdbapiles-v3.atlas.vegvesen.no' },
  air:      { label: 'Air Quality',  domain: 'air-quality-api.open-meteo.com' },
  elev:     { label: 'Terrain',      domain: 'api.open-meteo.com' },
  em:       { label: 'EM Density',   domain: 'overpass-api.de' },
  kinetic:  { label: 'Ground',       domain: 'DeviceMotion API' },
  acoustic: { label: 'Acoustic',     domain: 'Microphone API' },
}

export const ZONE_INFO = {
  oasis: {
    label: 'Oasis',
    color: '#34d399', border: '#0d9488', bg: 'rgba(2,44,34,0.6)',
    desc: 'Natural ground resonance — forests, open fields, deep earth. Restorative frequency range.',
  },
  neutral: {
    label: 'Neutral',
    color: '#9ca3af', border: '#374151', bg: 'rgba(17,24,39,0.6)',
    desc: 'Mixed field — natural and mechanical signals present. Ambiguous environment.',
  },
  stress: {
    label: 'Stress Node',
    color: '#f87171', border: '#dc2626', bg: 'rgba(31,10,10,0.6)',
    desc: 'Mechanical interference — HVAC, traffic, or industrial vibration detected.',
  },
}

export const TILE_URLS = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}
