export type PlaygroundSettings = {
  showMinimap: boolean
  showGrid: boolean
  gridSize: number
  connectorSnap: boolean
  snapDistance: number
  brushWidth: number
}

export const DEFAULT_PLAYGROUND_SETTINGS: PlaygroundSettings = {
  showMinimap: true,
  showGrid: true,
  gridSize: 22,
  connectorSnap: true,
  snapDistance: 10,
  brushWidth: 2,
}

const STORAGE_KEY = 'fabric-playground-settings'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function sanitizePlaygroundSettings(
  partial: Partial<PlaygroundSettings> | null | undefined
): PlaygroundSettings {
  const merged = { ...DEFAULT_PLAYGROUND_SETTINGS, ...partial }
  return {
    showMinimap: Boolean(merged.showMinimap),
    showGrid: Boolean(merged.showGrid),
    gridSize: clamp(Math.round(Number(merged.gridSize) || 22), 8, 64),
    connectorSnap: Boolean(merged.connectorSnap),
    snapDistance: clamp(Math.round(Number(merged.snapDistance) || 10), 0, 40),
    brushWidth: clamp(Math.round(Number(merged.brushWidth) || 2), 1, 24),
  }
}

export function loadPlaygroundSettings(): PlaygroundSettings {
  if (typeof window === 'undefined') return DEFAULT_PLAYGROUND_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PLAYGROUND_SETTINGS
    return sanitizePlaygroundSettings(JSON.parse(raw) as Partial<PlaygroundSettings>)
  } catch {
    return DEFAULT_PLAYGROUND_SETTINGS
  }
}

export function savePlaygroundSettings(settings: PlaygroundSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePlaygroundSettings(settings)))
  } catch {
    // ignore quota / private mode
  }
}
