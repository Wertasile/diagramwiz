import { Canvas, FabricObject } from 'fabric'

export type ShapeOptions = Record<string, unknown>

export const DEFAULT_SHAPE_OPTIONS = {
  left: 100,
  top: 100,
  fill: '#ffffff',
  stroke: '#000000',
  strokeWidth: 2,
} as const

export type AddObjectOptions = {
  /** Place the object at the visible viewport center (default true). */
  centerInViewport?: boolean
}

export const ensureObjectId = (obj: FabricObject): string => {
  const withId = obj as FabricObject & { objectId?: string }
  if (!withId.objectId) {
    withId.objectId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
  return withId.objectId
}

/** Move an object so its center sits at the current viewport center. */
export const centerObjectInViewport = (canvas: Canvas, obj: FabricObject) => {
  const center = canvas.getVpCenter()
  obj.setPositionByOrigin(center, 'center', 'center')
  obj.setCoords()
}

/** Assign an id, optionally center in viewport, add to canvas, and re-render. */
export const addObjectToCanvas = (
  canvas: Canvas,
  obj: FabricObject,
  options: AddObjectOptions = {}
): FabricObject => {
  const { centerInViewport = true } = options

  ensureObjectId(obj)

  if (centerInViewport) {
    centerObjectInViewport(canvas, obj)
  }

  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  return obj
}
