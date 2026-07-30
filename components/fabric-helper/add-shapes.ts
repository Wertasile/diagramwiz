import {
  Canvas,
  Circle,
  controlsUtils,
  Polyline,
  Rect,
  Shadow,
  Textbox,
  Triangle,
} from 'fabric'
import { addObjectToCanvas, DEFAULT_SHAPE_OPTIONS, type ShapeOptions } from './object-utils'
import {
  getThemeLineStroke,
  LINE_CORNER_COLOR,
  LINE_CORNER_STROKE,
} from './theme-lines'
import { withPlaceholder } from './text-placeholder'

export type ConnectionPoint = {
  objectId: string
  type: 'top' | 'right' | 'bottom' | 'left'
}

export type ConnectorLine = Polyline & {
  isConnector?: boolean
  endpointConnections?: Record<number, ConnectionPoint | null>
}

export type AddLineOptions = ShapeOptions & {
  /** Called while a vertex control is dragged (e.g. snap to object ports). */
  onEndpointDrag?: (line: Polyline, pointIndex: number) => void
}

export const addRectangle = (canvas: Canvas, options: ShapeOptions = {}) => {
  const rect = new Rect({
    ...DEFAULT_SHAPE_OPTIONS,
    width: 100,
    height: 100,
    shapeKind: 'rectangle',
    ...options,
  })
  return addObjectToCanvas(canvas, rect)
}

export const addCircle = (canvas: Canvas, options: ShapeOptions = {}) => {
  const circle = new Circle({
    ...DEFAULT_SHAPE_OPTIONS,
    radius: 50,
    shapeKind: 'circle',
    ...options,
  })
  return addObjectToCanvas(canvas, circle)
}

export const addTriangle = (canvas: Canvas, options: ShapeOptions = {}) => {
  const triangle = new Triangle({
    ...DEFAULT_SHAPE_OPTIONS,
    width: 100,
    height: 100,
    shapeKind: 'triangle',
    ...options,
  })
  return addObjectToCanvas(canvas, triangle)
}

export const addTextbox = (canvas: Canvas, options: ShapeOptions = {}) => {
  const textbox = new Textbox('', {
    ...DEFAULT_SHAPE_OPTIONS,
    fill: '#000000',
    width: 120,
    fontSize: 20,
    fontFamily: 'Arial',
    fontWeight: 'bold',
    textAlign: 'center',
    editable: true,
    shapeKind: 'textbox',
    ...options,
  })
  withPlaceholder(textbox, 'Text', {
    contentFill: '#000000',
    placeholderFill: 'rgba(107, 114, 128, 0.75)',
  })
  return addObjectToCanvas(canvas, textbox)
}

/** Soft callout-style comment textbox. */
export const addComment = (canvas: Canvas, options: ShapeOptions = {}) => {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')

  const contentFill = isDark ? '#e5e7eb' : '#374151'
  const comment = new Textbox('', {
    left: DEFAULT_SHAPE_OPTIONS.left,
    top: DEFAULT_SHAPE_OPTIONS.top,
    width: 240,
    fontSize: 14,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    fontStyle: 'italic',
    fill: contentFill,
    textAlign: 'left',
    backgroundColor: isDark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(59, 130, 246, 0.10)',
    padding: 12,
    editable: true,
    splitByGrapheme: true,
    shapeKind: 'comment',
    ...options,
  })
  withPlaceholder(comment, 'Add a comment…', {
    contentFill,
    placeholderFill: isDark ? 'rgba(209, 213, 219, 0.7)' : 'rgba(107, 114, 128, 0.8)',
  })
  return addObjectToCanvas(canvas, comment)
}

/** Yellow sticky-note textbox. */
export const addStickyNote = (canvas: Canvas, options: ShapeOptions = {}) => {
  const sticky = new Textbox('', {
    left: DEFAULT_SHAPE_OPTIONS.left,
    top: DEFAULT_SHAPE_OPTIONS.top,
    width: 170,
    minWidth: 120,
    fontSize: 14,
    fontFamily: 'Comic Sans MS, "Segoe Print", "Bradley Hand", Arial',
    fontWeight: 'normal',
    fill: '#1f2937',
    textAlign: 'left',
    backgroundColor: '#fef08a',
    padding: 16,
    editable: true,
    splitByGrapheme: true,
    shadow: new Shadow({
      color: 'rgba(0, 0, 0, 0.2)',
      blur: 10,
      offsetX: 2,
      offsetY: 4,
    }),
    shapeKind: 'stickyNote',
    ...options,
  })
  withPlaceholder(sticky, 'Sticky note', {
    contentFill: '#1f2937',
    placeholderFill: 'rgba(55, 65, 81, 0.55)',
  })
  return addObjectToCanvas(canvas, sticky)
}

/** Vertex (polyline) editing controls — used immediately on select, no scale box. */
export function enableLineVertexEditing(
  canvas: Canvas,
  line: Polyline,
  onEndpointDrag?: (line: Polyline, pointIndex: number) => void
) {
  line.set({
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

  const controls = controlsUtils.createPolyControls(line)

  Object.keys(controls).forEach((key) => {
    const control = controls[key]
    const originalActionHandler = control.actionHandler
    const pointIndex = Number(key.replace(/^p/, ''))

    control.actionHandler = function (eventData, transform, x, y) {
      const result = originalActionHandler?.(eventData, transform, x, y)

      if (!Number.isNaN(pointIndex)) {
        onEndpointDrag?.(line, pointIndex)
      }

      canvas.requestRenderAll()
      return result ?? true
    }
  })

  line.controls = controls
  line.setCoords()
  canvas.requestRenderAll()
}

/**
 * Connector line with vertex editing on first select (no scale-box click).
 * Pass `onEndpointDrag` to snap endpoints while editing.
 */
export const addLine = (canvas: Canvas, options: AddLineOptions = {}) => {
  const { onEndpointDrag, ...shapeOptions } = options

  const line = new Polyline(
    [
      { x: 50, y: 50 },
      { x: 200, y: 50 },
    ],
    {
      fill: '',
      stroke: getThemeLineStroke(),
      strokeWidth: 2,
      strokeUniform: true,
      shapeKind: 'line',
      // Skip scale/rotate UI — vertex editing only
      hasBorders: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      objectCaching: false,
      cornerStyle: 'circle',
      cornerColor: LINE_CORNER_COLOR,
      cornerStrokeColor: LINE_CORNER_STROKE,
      transparentCorners: false,
      cornerSize: 12,
      ...shapeOptions,
    }
  )

  const connector = line as ConnectorLine
  connector.isConnector = true
  connector.endpointConnections = {
    0: null,
    1: null,
  }

  // Install vertex controls immediately so the first click is edit mode
  enableLineVertexEditing(canvas, line, onEndpointDrag)

  // Re-apply if Fabric ever resets controls on select
  line.on('selected', () => {
    enableLineVertexEditing(canvas, line, onEndpointDrag)
  })

  return addObjectToCanvas(canvas, line)
}

export type ShapeId =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'textbox'
  | 'comment'
  | 'stickyNote'

export const SHAPE_ADDERS: Record<
  ShapeId,
  (canvas: Canvas, options?: AddLineOptions | ShapeOptions) => unknown
> = {
  rectangle: addRectangle,
  circle: addCircle,
  triangle: addTriangle,
  line: addLine,
  textbox: addTextbox,
  comment: addComment,
  stickyNote: addStickyNote,
}

export const isShapeId = (id: string): id is ShapeId => id in SHAPE_ADDERS
