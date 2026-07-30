import { Canvas, FabricObject, type TMat2D } from 'fabric'

export type ExportRect = {
  left: number
  top: number
  width: number
  height: number
}

const PAD = 8

export function isCropFrame(object: FabricObject): boolean {
  const tagged = object as FabricObject & { shapeKind?: string; isCropFrame?: boolean; name?: string }
  return (
    tagged.isCropFrame === true ||
    tagged.shapeKind === 'crop' ||
    Boolean(tagged.name?.startsWith('Crop'))
  )
}

export function isExportExcluded(object: FabricObject): boolean {
  const id = (object as FabricObject & { id?: string }).id ?? ''
  return (
    id.startsWith('vertical') ||
    id.startsWith('horizontal') ||
    id.startsWith('__pen-')
  )
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename.endsWith('.png') ? filename : `${filename}.png`
  anchor.click()
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'export'
}

/** Bounding box of worked content (excludes guides, pen previews, and crop frames). */
export function getWorkedAreaBounds(canvas: Canvas): ExportRect | null {
  const objects = canvas.getObjects().filter((object) => {
    if (isExportExcluded(object)) return false
    if (isCropFrame(object)) return false
    if (object.visible === false) return false
    return true
  })

  if (objects.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const object of objects) {
    const bound = object.getBoundingRect()
    minX = Math.min(minX, bound.left)
    minY = Math.min(minY, bound.top)
    maxX = Math.max(maxX, bound.left + bound.width)
    maxY = Math.max(maxY, bound.top + bound.height)
  }

  return {
    left: minX - PAD,
    top: minY - PAD,
    width: Math.max(1, maxX - minX + PAD * 2),
    height: Math.max(1, maxY - minY + PAD * 2),
  }
}

function withIdentityViewport<T>(canvas: Canvas, fn: () => T): T {
  const previousVpt = [...canvas.viewportTransform] as TMat2D
  const active = canvas.getActiveObject()
  canvas.discardActiveObject()
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])

  try {
    return fn()
  } finally {
    canvas.setViewportTransform(previousVpt)
    if (active && canvas.getObjects().includes(active)) {
      canvas.setActiveObject(active)
    }
    canvas.requestRenderAll()
  }
}

/**
 * Export a canvas region in scene coordinates as PNG.
 * Temporarily resets viewport so pan/zoom don't skew the crop.
 */
export function exportRegionAsPng(
  canvas: Canvas,
  region: ExportRect,
  filename: string,
  options: { hideCropFrames?: boolean; multiplier?: number } = {}
) {
  const { hideCropFrames = true, multiplier = 2 } = options
  const crops = canvas.getObjects().filter(isCropFrame)
  const cropState = crops.map((frame) => ({
    frame,
    visible: frame.visible,
    strokeWidth: frame.strokeWidth,
    opacity: frame.opacity,
  }))

  withIdentityViewport(canvas, () => {
    if (hideCropFrames) {
      for (const frame of crops) {
        frame.set({ visible: false })
      }
    }

    canvas.requestRenderAll()

    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height,
      enableRetinaScaling: false,
    })

    for (const state of cropState) {
      state.frame.set({
        visible: state.visible,
        strokeWidth: state.strokeWidth,
        opacity: state.opacity,
      })
    }
    canvas.requestRenderAll()

    downloadDataUrl(dataUrl, sanitizeFilename(filename))
  })
}

/** Export a single selected object / layer as its own PNG. */
export function exportObjectAsPng(object: FabricObject, filename?: string) {
  const dataUrl = object.toDataURL({
    format: 'png',
    multiplier: 2,
    enableRetinaScaling: false,
  })
  const name =
    filename ||
    (object as FabricObject & { name?: string }).name ||
    (object as FabricObject & { id?: string }).id ||
    object.type ||
    'layer'
  downloadDataUrl(dataUrl, sanitizeFilename(String(name)))
}

/** Export the bounding box of all worked content (not the full viewport). */
export function exportWorkedAreaAsPng(canvas: Canvas, filename = 'canvas-export') {
  const bounds = getWorkedAreaBounds(canvas)
  if (!bounds) {
    console.warn('Nothing to export — canvas has no content.')
    return false
  }
  exportRegionAsPng(canvas, bounds, filename, { hideCropFrames: true })
  return true
}

/** Export everything under a crop frame (frame outline hidden). */
export function exportCropFrameAsPng(canvas: Canvas, frame: FabricObject, filename?: string) {
  const bound = frame.getBoundingRect()
  const name =
    filename ||
    (frame as FabricObject & { name?: string }).name ||
    'crop'

  exportRegionAsPng(
    canvas,
    {
      left: bound.left,
      top: bound.top,
      width: Math.max(1, bound.width),
      height: Math.max(1, bound.height),
    },
    String(name),
    { hideCropFrames: true }
  )
}

export function getCropFrames(canvas: Canvas) {
  return canvas.getObjects().filter(isCropFrame)
}
