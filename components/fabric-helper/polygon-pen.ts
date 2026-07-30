import {
  Canvas,
  Circle,
  FabricObject,
  Polygon,
  Polyline,
  controlsUtils,
  type TPointerEvent,
} from 'fabric'
import { addObjectToCanvas } from './object-utils'
import {
  getThemeLineStroke,
  LINE_CORNER_COLOR,
  LINE_CORNER_STROKE,
} from './theme-lines'

type XY = { x: number; y: number }

const CLOSE_THRESHOLD_PX = 12
const PREVIEW_ID_PREFIX = '__pen-'

export type PolygonPenCleanup = () => void

export type PolygonPenOptions = {
  getStroke?: () => string
  getFill?: () => string
  /** Called when user presses Escape with no in-progress points (exit tool). */
  onRequestExit?: () => void
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function dist(a: XY, b: XY) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function screenDist(canvas: Canvas, a: XY, b: XY) {
  const zoom = canvas.getZoom()
  return dist(a, b) * zoom
}

function makePreviewPolyline(points: XY[], stroke: string) {
  const line = new Polyline(points, {
    fill: '',
    stroke,
    strokeWidth: 2,
    strokeUniform: true,
    selectable: false,
    evented: false,
    objectCaching: false,
    excludeFromExport: true,
  })
  ;(line as Polyline & { id?: string }).id = `${PREVIEW_ID_PREFIX}preview`
  return line
}

function makePointMarker(point: XY, stroke: string, isFirst = false) {
  const marker = new Circle({
    left: point.x,
    top: point.y,
    originX: 'center',
    originY: 'center',
    radius: isFirst ? 6 : 4,
    fill: isFirst ? LINE_CORNER_COLOR : '#ffffff',
    stroke: isFirst ? LINE_CORNER_STROKE : stroke,
    strokeWidth: 2,
    selectable: false,
    evented: false,
    objectCaching: false,
    excludeFromExport: true,
  })
  ;(marker as Circle & { id?: string }).id = `${PREVIEW_ID_PREFIX}point`
  return marker
}

function enablePolygonVertexEditing(canvas: Canvas, poly: Polygon | Polyline) {
  poly.set({
    cornerStyle: 'circle',
    cornerColor: LINE_CORNER_COLOR,
    cornerStrokeColor: LINE_CORNER_STROKE,
    transparentCorners: false,
    cornerSize: 12,
    hasBorders: false,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    objectCaching: false,
  })
  poly.controls = controlsUtils.createPolyControls(poly)
  poly.setCoords()
  canvas.requestRenderAll()
}

/**
 * Figma-like pen tool for custom polygons:
 * - Click to place vertices
 * - Move for rubber-band preview
 * - Click near first point to close (≥3 points)
 * - Enter / double-click to finish an open (incomplete) path (≥2 points)
 * - Escape cancels the current path; Escape again requests tool exit
 */
export function activatePolygonPen(
  canvas: Canvas,
  options: PolygonPenOptions = {}
): PolygonPenCleanup {
  const getStroke = options.getStroke ?? (() => getThemeLineStroke())
  const getFill =
    options.getFill ??
    (() =>
      document.documentElement.classList.contains('dark')
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(23,23,23,0.04)')

  const points: XY[] = []
  let cursor: XY | null = null
  let preview: Polyline | null = null
  let markers: Circle[] = []
  let closeHint = false

  const prevSelection = canvas.selection
  const prevSkipTargetFind = canvas.skipTargetFind
  const prevDefaultCursor = canvas.defaultCursor
  const prevHoverCursor = canvas.hoverCursor

  canvas.selection = false
  canvas.skipTargetFind = true
  canvas.discardActiveObject()
  canvas.defaultCursor = 'crosshair'
  canvas.hoverCursor = 'crosshair'
  canvas.requestRenderAll()

  const clearPreview = () => {
    if (preview) {
      canvas.remove(preview)
      preview = null
    }
    for (const m of markers) {
      canvas.remove(m)
    }
    markers = []
  }

  const updatePreview = () => {
    clearPreview()
    if (points.length === 0) return

    const stroke = getStroke()
    const previewPoints =
      cursor && points.length > 0
        ? closeHint && points.length >= 3
          ? [...points, points[0]]
          : [...points, cursor]
        : [...points]

    preview = makePreviewPolyline(previewPoints, stroke)
    // Dashed rubber-band feel for the live segment
    if (cursor && !closeHint) {
      preview.set({ strokeDashArray: [6, 4] })
    }
    canvas.add(preview)

    markers = points.map((p, i) => {
      const marker = makePointMarker(p, stroke, i === 0)
      if (i === 0 && closeHint) {
        marker.set({
          fill: LINE_CORNER_COLOR,
          radius: 7,
          stroke: '#ffffff',
        })
      }
      canvas.add(marker)
      return marker
    })

    canvas.requestRenderAll()
  }

  const resetPath = () => {
    points.length = 0
    cursor = null
    closeHint = false
    clearPreview()
    canvas.requestRenderAll()
  }

  const enableVertexEditing = (poly: Polygon | Polyline) => {
    enablePolygonVertexEditing(canvas, poly as Polygon)
    poly.on('selected', () => enablePolygonVertexEditing(canvas, poly as Polygon))
  }

  /** Closed shape (≥3 points, clicked first point). */
  const finalizeClosedPolygon = () => {
    if (points.length < 3) return

    const committed = points.map((p) => ({ x: p.x, y: p.y }))
    resetPath()

    const polygon = new Polygon(committed, {
      fill: getFill(),
      stroke: getStroke(),
      strokeWidth: 2,
      strokeUniform: true,
      objectCaching: false,
    })
    ;(polygon as Polygon & { shapeKind?: string }).shapeKind = 'polygon'

    addObjectToCanvas(canvas, polygon, { centerInViewport: false })
    enableVertexEditing(polygon)
  }

  /** Open / incomplete path (≥2 points) — Enter or double-click without closing. */
  const finalizeOpenPolygon = () => {
    if (points.length < 2) return

    const committed = points.map((p) => ({ x: p.x, y: p.y }))
    resetPath()

    const openPoly = new Polyline(committed, {
      fill: '',
      stroke: getStroke(),
      strokeWidth: 2,
      strokeUniform: true,
      objectCaching: false,
    })
    const tagged = openPoly as Polyline & { shapeKind?: string; isOpenPolygon?: boolean }
    tagged.shapeKind = 'polygon'
    tagged.isOpenPolygon = true

    addObjectToCanvas(canvas, openPoly, { centerInViewport: false })
    enableVertexEditing(openPoly)
  }

  /** Finish current path: open if not closed to first point. */
  const finishPath = () => {
    if (points.length >= 2) {
      finalizeOpenPolygon()
    } else {
      resetPath()
    }
  }

  const onMouseMove = (opt: { e: TPointerEvent }) => {
    const e = opt.e as MouseEvent
    if (e.buttons === 4) return
    if (canvas.defaultCursor === 'grab' || canvas.defaultCursor === 'grabbing') return

    cursor = canvas.getScenePoint(opt.e)
    closeHint =
      points.length >= 3 &&
      screenDist(canvas, cursor, points[0]) <= CLOSE_THRESHOLD_PX

    if (points.length > 0) {
      updatePreview()
    }
  }

  const onMouseDown = (opt: { e: TPointerEvent }) => {
    const e = opt.e as MouseEvent
    if (e.button !== 0) return
    if (canvas.defaultCursor === 'grab' || canvas.defaultCursor === 'grabbing') return

    const scenePoint = canvas.getScenePoint(opt.e)
    cursor = scenePoint

    const shouldClose =
      points.length >= 3 &&
      screenDist(canvas, scenePoint, points[0]) <= CLOSE_THRESHOLD_PX

    if (shouldClose) {
      finalizeClosedPolygon()
      return
    }

    points.push({ x: scenePoint.x, y: scenePoint.y })
    closeHint = false
    updatePreview()
  }

  const onDblClick = () => {
    finishPath()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return

    if (e.key === 'Escape') {
      e.preventDefault()
      if (points.length > 0) {
        resetPath()
      } else {
        options.onRequestExit?.()
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      finishPath()
      return
    }

    // Backspace / Delete removes last point (Figma-like). Shift+Backspace is reserved for layer delete.
    if ((e.key === 'Backspace' || e.key === 'Delete') && points.length > 0) {
      if (e.key === 'Backspace' && e.shiftKey) return
      e.preventDefault()
      points.pop()
      closeHint = false
      if (points.length === 0) {
        resetPath()
      } else {
        updatePreview()
      }
    }
  }

  canvas.on('mouse:move', onMouseMove)
  canvas.on('mouse:down', onMouseDown)
  canvas.on('mouse:dblclick', onDblClick)
  window.addEventListener('keydown', onKeyDown)

  return () => {
    resetPath()
    canvas.off('mouse:move', onMouseMove)
    canvas.off('mouse:down', onMouseDown)
    canvas.off('mouse:dblclick', onDblClick)
    window.removeEventListener('keydown', onKeyDown)

    canvas.selection = prevSelection
    canvas.skipTargetFind = prevSkipTargetFind
    canvas.defaultCursor = prevDefaultCursor
    canvas.hoverCursor = prevHoverCursor
    canvas.requestRenderAll()
  }
}

/** Layer list / guideline filters can skip pen preview objects. */
export function isPenPreviewObject(object: FabricObject) {
  const id = (object as FabricObject & { id?: string }).id ?? ''
  return id.startsWith(PREVIEW_ID_PREFIX)
}
