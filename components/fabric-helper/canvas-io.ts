import {
  Canvas,
  FabricImage,
  FabricObject,
  Group,
  Polyline,
  Textbox,
  type TMat2D,
} from 'fabric'
import { isExportExcluded } from './export-utils'
import {
  attachFlowchartScaleBehavior,
  isFlowchartNode,
} from './flowchart-node'
import { enableLineVertexEditing, type ConnectorLine } from './add-shapes'
import { bindPlaceholderHandlers } from './text-placeholder'
import { addObjectToCanvas, centerObjectInViewport, ensureObjectId } from './object-utils'

/** Custom fields we stamp on objects — must round-trip through JSON. */
export const CANVAS_CUSTOM_PROPERTIES = [
  'id',
  'objectId',
  'shapeKind',
  'name',
  'zIndex',
  'isCropFrame',
  'isConnector',
  'endpointConnections',
  'flowchartNode',
  'isOpenPolygon',
  'placeholderText',
  'isPlaceholder',
  'placeholderFill',
  'contentFill',
] as const

let customPropsRegistered = false

export function registerCanvasCustomProperties() {
  if (customPropsRegistered) return
  FabricObject.customProperties = [
    ...new Set([...FabricObject.customProperties, ...CANVAS_CUSTOM_PROPERTIES]),
  ]
  customPropsRegistered = true
}

export type PlaygroundDocument = {
  version: 1
  app: 'fabric-playground'
  exportedAt: string
  canvas: Record<string, unknown>
}

function isPlaygroundDocument(value: unknown): value is PlaygroundDocument {
  if (!value || typeof value !== 'object') return false
  const doc = value as Record<string, unknown>
  return doc.version === 1 && typeof doc.canvas === 'object' && doc.canvas !== null
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'export'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function walkObjects(objects: FabricObject[], visit: (object: FabricObject) => void) {
  for (const object of objects) {
    visit(object)
    if (object instanceof Group) {
      walkObjects(object.getObjects(), visit)
    }
  }
}

function isExcludedSerialized(serialized: Record<string, unknown>) {
  const id = typeof serialized.id === 'string' ? serialized.id : ''
  return (
    id.startsWith('vertical') ||
    id.startsWith('horizontal') ||
    id.startsWith('__pen-')
  )
}

export type RehydrateOptions = {
  onEndpointDrag?: (line: Polyline, pointIndex: number) => void
}

/** Restore behaviors that don't survive Fabric JSON (controls, listeners). */
export function rehydrateCanvasObjects(canvas: Canvas, options: RehydrateOptions = {}) {
  registerCanvasCustomProperties()

  const topLevel = canvas.getObjects()

  for (const object of topLevel) {
    ensureObjectId(object)

    const connector = object as ConnectorLine
    if (connector.isConnector || (object as FabricObject & { shapeKind?: string }).shapeKind === 'line') {
      if (!(object instanceof Polyline)) continue
      connector.isConnector = true
      if (!connector.endpointConnections) {
        connector.endpointConnections = { 0: null, 1: null }
      }
      enableLineVertexEditing(canvas, object, options.onEndpointDrag)
      object.off('selected')
      object.on('selected', () => {
        enableLineVertexEditing(canvas, object, options.onEndpointDrag)
      })
    }

    if (isFlowchartNode(object)) {
      attachFlowchartScaleBehavior(object)
    }
  }

  walkObjects(topLevel, (object) => {
    if (object instanceof Textbox) {
      bindPlaceholderHandlers(object)
    }
  })

  canvas.requestRenderAll()
}

/** Build a serializable playground document from the live canvas. */
export function canvasToDocument(canvas: Canvas): PlaygroundDocument {
  registerCanvasCustomProperties()

  const raw = canvas.toObject([...CANVAS_CUSTOM_PROPERTIES]) as Record<string, unknown>
  const objects = Array.isArray(raw.objects) ? raw.objects : []
  raw.objects = objects.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !isExcludedSerialized(entry as Record<string, unknown>)
  )

  // Drop viewport size / transform — restored canvas keeps the live stage size & pan/zoom.
  delete raw.width
  delete raw.height
  delete raw.viewportTransform

  return {
    version: 1,
    app: 'fabric-playground',
    exportedAt: new Date().toISOString(),
    canvas: raw,
  }
}

export function exportCanvasAsJson(canvas: Canvas, filename = 'canvas') {
  const document = canvasToDocument(canvas)
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, `${sanitizeFilename(filename)}.json`)
  return document
}

function extractFabricJson(parsed: unknown): Record<string, unknown> {
  if (isPlaygroundDocument(parsed)) {
    return parsed.canvas
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { objects?: unknown }).objects)) {
    return parsed as Record<string, unknown>
  }
  throw new Error('Unrecognized JSON — expected a Fabric canvas or playground export.')
}

export async function importCanvasFromJson(
  canvas: Canvas,
  json: string | Record<string, unknown>,
  options: RehydrateOptions = {}
) {
  registerCanvasCustomProperties()

  const parsed = typeof json === 'string' ? (JSON.parse(json) as unknown) : json
  const fabricJson = extractFabricJson(parsed)

  const previousVpt = [...canvas.viewportTransform] as TMat2D
  const width = canvas.getWidth()
  const height = canvas.getHeight()

  // Drop ephemeral objects before load so they don't linger if load fails mid-way
  for (const object of [...canvas.getObjects()]) {
    if (isExportExcluded(object)) {
      canvas.remove(object)
    }
  }

  await canvas.loadFromJSON(fabricJson)
  canvas.setDimensions({ width, height })
  canvas.setViewportTransform(previousVpt)
  rehydrateCanvasObjects(canvas, options)
  canvas.discardActiveObject()
  canvas.requestRenderAll()
}

export async function importCanvasFromJsonFile(
  canvas: Canvas,
  file: File,
  options: RehydrateOptions = {}
) {
  const text = await file.text()
  await importCanvasFromJson(canvas, text, options)
}

/** Place a PNG/JPG as a Fabric image at the viewport center. */
export async function importImageFile(canvas: Canvas, file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image.')
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await FabricImage.fromURL(url)
    const tagged = image as FabricImage & { shapeKind?: string; name?: string }
    tagged.shapeKind = 'image'
    tagged.name = file.name.replace(/\.[^.]+$/, '') || 'Image'

    // Keep huge images manageable on the stage
    const maxEdge = Math.max(canvas.getWidth(), canvas.getHeight()) * 0.65
    const iw = image.getScaledWidth()
    const ih = image.getScaledHeight()
    const longest = Math.max(iw, ih)
    if (longest > maxEdge && longest > 0) {
      const scale = maxEdge / longest
      image.scale(scale)
    }

    centerObjectInViewport(canvas, image)
    addObjectToCanvas(canvas, image, { centerInViewport: false })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Remove all editable content (keeps pan/zoom). */
export function clearCanvasContent(canvas: Canvas) {
  canvas.discardActiveObject()
  const toRemove = canvas.getObjects().filter((object) => !isExportExcluded(object))
  for (const object of toRemove) {
    canvas.remove(object)
  }
  canvas.requestRenderAll()
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      input.remove()
    }

    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0] ?? null
        cleanup()
        resolve(file)
      },
      { once: true }
    )

    // If the user cancels, some browsers never fire change — best-effort cleanup
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (document.body.contains(input) && !input.files?.length) {
            cleanup()
            resolve(null)
          }
        }, 400)
      },
      { once: true }
    )

    input.click()
  })
}
