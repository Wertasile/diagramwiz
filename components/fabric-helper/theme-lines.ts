import { Canvas, FabricObject, Polygon, Polyline } from 'fabric'

export const LIGHT_LINE_STROKE = '#171717'
export const DARK_LINE_STROKE = '#ffffff'
export const LINE_CORNER_COLOR = '#3B82F6'
export const LINE_CORNER_STROKE = '#1D4ED8'

export function getThemeLineStroke(isDark?: boolean): string {
  const dark =
    typeof isDark === 'boolean'
      ? isDark
      : typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark')
  return dark ? DARK_LINE_STROKE : LIGHT_LINE_STROKE
}

function isGuideline(object: FabricObject) {
  const id = (object as FabricObject & { id?: string }).id ?? ''
  return id.startsWith('vertical') || id.startsWith('horizontal') || id.startsWith('__pen-')
}

function isThemeSyncedStroke(object: FabricObject) {
  const tagged = object as FabricObject & {
    isConnector?: boolean
    shapeKind?: string
    isOpenPolygon?: boolean
  }
  if (tagged.isConnector) return true
  if (tagged.shapeKind === 'polygon') return true
  if (tagged.isOpenPolygon) return true
  if (object instanceof Polygon) return true
  return false
}

/** Update connector / pen polygon strokes (and free-draw brush) for the current theme. */
export function syncThemeLineColors(canvas: Canvas, isDark?: boolean) {
  const stroke = getThemeLineStroke(isDark)

  for (const object of canvas.getObjects()) {
    if (isGuideline(object)) continue
    if (!isThemeSyncedStroke(object)) continue
    // Only stroke-based objects we track (polylines, polygons, connectors)
    if (
      object instanceof Polyline ||
      object instanceof Polygon ||
      (object as FabricObject & { isConnector?: boolean }).isConnector
    ) {
      object.set('stroke', stroke)
    }
  }

  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = stroke
  }

  canvas.requestRenderAll()
}
