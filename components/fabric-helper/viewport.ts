import { Canvas, Point } from 'fabric'
import { getWorkedAreaBounds } from './export-utils'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 20

export type ViewportCleanup = () => void

/**
 * Fill the Fabric canvas to match a stage element's client size.
 */
export function resizeCanvasToStage(canvas: Canvas, stage: HTMLElement) {
  const { clientWidth, clientHeight } = stage
  if (clientWidth <= 0 || clientHeight <= 0) return
  canvas.setDimensions({ width: clientWidth, height: clientHeight })
}

/**
 * Wheel zoom (toward cursor) + Space/middle-mouse pan.
 * Returns a cleanup function that removes listeners.
 */
export function setupPanZoom(canvas: Canvas): ViewportCleanup {
  let spacePressed = false
  let isPanning = false
  let lastPos = { x: 0, y: 0 }
  let selectionBeforePan = canvas.selection

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return
    // Don't steal Space from text editing
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
      return
    }
    e.preventDefault()
    spacePressed = true
    selectionBeforePan = canvas.selection
    canvas.selection = false
    canvas.defaultCursor = 'grab'
    canvas.hoverCursor = 'grab'
    canvas.requestRenderAll()
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return
    spacePressed = false
    if (!isPanning) {
      canvas.defaultCursor = 'default'
      canvas.hoverCursor = 'move'
      canvas.selection = selectionBeforePan
    }
    canvas.requestRenderAll()
  }

  const onWheel = (opt: { e: Event }) => {
    const e = opt.e as WheelEvent
    e.preventDefault()
    e.stopPropagation()

    const delta = e.deltaY
    let zoom = canvas.getZoom() * (delta > 0 ? 0.9 : 1.1)
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom)
  }

  const onMouseDown = (opt: { e: Event }) => {
    const e = opt.e as MouseEvent
    const middleClick = e.button === 1
    if (!spacePressed && !middleClick) return

    isPanning = true
    selectionBeforePan = canvas.selection
    canvas.selection = false
    canvas.defaultCursor = 'grabbing'
    canvas.hoverCursor = 'grabbing'
    lastPos = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const onMouseMove = (opt: { e: Event }) => {
    if (!isPanning) return
    const e = opt.e as MouseEvent
    const dx = e.clientX - lastPos.x
    const dy = e.clientY - lastPos.y
    canvas.relativePan(new Point(dx, dy))
    lastPos = { x: e.clientX, y: e.clientY }
  }

  const onMouseUp = () => {
    if (!isPanning) return
    isPanning = false
    canvas.selection = selectionBeforePan
    canvas.defaultCursor = spacePressed ? 'grab' : 'default'
    canvas.hoverCursor = spacePressed ? 'grab' : 'move'
  }

  // Prevent browser middle-click autoscroll / Space scroll
  const onContextMenuBlock = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.upperCanvasEl.addEventListener('auxclick', onContextMenuBlock)

  canvas.on('mouse:wheel', onWheel)
  canvas.on('mouse:down', onMouseDown)
  canvas.on('mouse:move', onMouseMove)
  canvas.on('mouse:up', onMouseUp)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    canvas.upperCanvasEl?.removeEventListener('auxclick', onContextMenuBlock)
    canvas.off('mouse:wheel', onWheel)
    canvas.off('mouse:down', onMouseDown)
    canvas.off('mouse:move', onMouseMove)
    canvas.off('mouse:up', onMouseUp)
  }
}

/** Visible world rect from the current viewport transform. */
export function getVisibleWorldRect(canvas: Canvas) {
  const vpt = canvas.viewportTransform
  if (!vpt) {
    return { left: 0, top: 0, width: canvas.getWidth(), height: canvas.getHeight() }
  }
  const zoom = vpt[0]
  return {
    left: -vpt[4] / zoom,
    top: -vpt[5] / zoom,
    width: canvas.getWidth() / zoom,
    height: canvas.getHeight() / zoom,
  }
}

/** Reset pan/zoom to identity (100%). */
export function resetViewport(canvas: Canvas) {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  canvas.requestRenderAll()
}

/** Fit worked content in the viewport with a little margin. */
export function zoomToFitContent(canvas: Canvas, margin = 0.9) {
  const bounds = getWorkedAreaBounds(canvas)
  if (!bounds) {
    resetViewport(canvas)
    return
  }

  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(canvas.getWidth() / bounds.width, canvas.getHeight() / bounds.height) * margin
    )
  )

  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  canvas.setViewportTransform([
    zoom,
    0,
    0,
    zoom,
    canvas.getWidth() / 2 - centerX * zoom,
    canvas.getHeight() / 2 - centerY * zoom,
  ])
  canvas.requestRenderAll()
}
