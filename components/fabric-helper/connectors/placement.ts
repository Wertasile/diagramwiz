import type { Canvas, FabricObject } from 'fabric'
import { FLOWCHART_ADDERS, isFlowchartId } from '../add-flowchart'
import { SHAPE_ADDERS } from '../add-shapes'
import { addObjectToCanvas, captureBuiltObject } from '../object-utils'

const PLACEABLE_SHAPES = new Set(['rectangle', 'circle', 'triangle'])

export const GHOST_PLACE_ID = '__ghost-place'

/** Sidebar ids that use the "preview follows cursor, click to place" flow. */
export const isPlaceableId = (id: string) => PLACEABLE_SHAPES.has(id) || isFlowchartId(id)

/** Map an existing object back to the sidebar id that created it (if any). */
export const placeableIdForObject = (object: FabricObject): string | null => {
  const kind = (object as FabricObject & { shapeKind?: string }).shapeKind
  if (!kind) return null
  return isPlaceableId(kind) ? kind : null
}

/** Build a fresh, un-added object for a sidebar id. */
export const buildPlaceable = (canvas: Canvas, id: string): FabricObject | null => {
  if (PLACEABLE_SHAPES.has(id)) {
    return captureBuiltObject(() => SHAPE_ADDERS[id as 'rectangle' | 'circle' | 'triangle'](canvas))
  }
  if (isFlowchartId(id)) {
    return captureBuiltObject(() => FLOWCHART_ADDERS[id](canvas))
  }
  return null
}

/** Turn an object into a non-interactive, translucent preview. */
export const makeGhost = (object: FabricObject, id: string, opacity: number) => {
  object.set({
    id,
    opacity,
    evented: false,
    selectable: false,
    hasControls: false,
    hasBorders: false,
    excludeFromExport: true,
  } as never)
  return object
}

let activeCancel: (() => void) | null = null

export const cancelPlacement = () => activeCancel?.()

/**
 * Show a translucent preview of `id` under the cursor; the next canvas click
 * drops the real object there. Escape (or starting another placement) cancels.
 */
export const startPlacement = (canvas: Canvas, id: string, onDone?: () => void) => {
  cancelPlacement()
  const ghost = buildPlaceable(canvas, id)
  if (!ghost) return false

  makeGhost(ghost, GHOST_PLACE_ID, 0.4)
  ghost.visible = false
  canvas.add(ghost)

  const upper = canvas.upperCanvasEl
  const previousCursor = canvas.defaultCursor
  const previousHover = canvas.hoverCursor
  canvas.defaultCursor = 'copy'
  canvas.hoverCursor = 'copy'
  canvas.discardActiveObject()

  const moveTo = (e: MouseEvent | PointerEvent) => {
    const p = canvas.getScenePoint(e)
    ghost.visible = true
    ghost.setPositionByOrigin(p, 'center', 'center')
    ghost.setCoords()
    canvas.requestRenderAll()
  }

  const finish = () => {
    upper.removeEventListener('mousemove', onMove)
    upper.removeEventListener('pointerdown', onDown, true)
    upper.removeEventListener('mousedown', onDown, true)
    window.removeEventListener('keydown', onKey)
    canvas.defaultCursor = previousCursor
    canvas.hoverCursor = previousHover
    if (canvas.getObjects().includes(ghost)) canvas.remove(ghost)
    canvas.requestRenderAll()
    if (activeCancel === cancel) activeCancel = null
  }

  const cancel = () => {
    finish()
    onDone?.()
  }

  function onMove(e: MouseEvent) {
    moveTo(e)
  }

  function onDown(e: MouseEvent | PointerEvent) {
    if (e.button !== 0) return
    // Keep Fabric from selecting / dragging whatever is under the cursor. Fabric listens to
    // mouse* by default and pointer* when enabled; browsers fire both for one click, so the
    // trailing event is swallowed for a moment after the object has been placed.
    e.stopImmediatePropagation()
    e.preventDefault()
    const swallowTrailing = (ev: Event) => ev.stopImmediatePropagation()
    upper.addEventListener('mousedown', swallowTrailing, true)
    setTimeout(() => upper.removeEventListener('mousedown', swallowTrailing, true), 150)
    const p = canvas.getScenePoint(e)
    const object = buildPlaceable(canvas, id)
    finish()
    if (object) {
      object.setPositionByOrigin(p, 'center', 'center')
      object.setCoords()
      addObjectToCanvas(canvas, object, { centerInViewport: false })
    }
    onDone?.()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  upper.addEventListener('mousemove', onMove)
  upper.addEventListener('pointerdown', onDown, true)
  upper.addEventListener('mousedown', onDown, true)
  window.addEventListener('keydown', onKey)
  activeCancel = cancel
  return true
}
