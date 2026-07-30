import {
  Canvas,
  Circle,
  Path,
  Polygon,
  Rect,
} from 'fabric'
import { addObjectToCanvas, DEFAULT_SHAPE_OPTIONS, type ShapeOptions } from './object-utils'
import { createFlowchartNode } from './flowchart-node'

const FLOWCHART_DEFAULTS = {
  ...DEFAULT_SHAPE_OPTIONS,
  originX: 'left' as const,
  originY: 'top' as const,
  strokeUniform: true,
}

const addNode = (
  canvas: Canvas,
  shape: Parameters<typeof createFlowchartNode>[0],
  label: string,
  options: ShapeOptions = {},
  fontSize?: number,
  shapeKind?: string
) => {
  const { left, top, ...rest } = options
  // Apply remaining style overrides to the shape before grouping.
  if (Object.keys(rest).length > 0) {
    shape.set(rest)
  }

  const node = createFlowchartNode(shape, {
    label,
    left: typeof left === 'number' ? left : FLOWCHART_DEFAULTS.left,
    top: typeof top === 'number' ? top : FLOWCHART_DEFAULTS.top,
    fontSize,
    shapeKind,
  })

  return addObjectToCanvas(canvas, node)
}

/** Process — rectangle */
export const addProcess = (
  canvas: Canvas,
  width = 140,
  height = 70,
  options: ShapeOptions = {}
) => {
  const process = new Rect({
    ...FLOWCHART_DEFAULTS,
    width,
    height,
    rx: 0,
    ry: 0,
  })
  return addNode(canvas, process, 'Process', options, undefined, 'process')
}

/** Decision — diamond */
export const addDecision = (
  canvas: Canvas,
  width = 120,
  height = 120,
  options: ShapeOptions = {}
) => {
  const decision = new Polygon(
    [
      { x: width / 2, y: 0 },
      { x: width, y: height / 2 },
      { x: width / 2, y: height },
      { x: 0, y: height / 2 },
    ],
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, decision, 'Decision', options, undefined, 'decision')
}

/** Terminator / start-end — pill */
export const addTerminator = (
  canvas: Canvas,
  width = 150,
  height = 70,
  options: ShapeOptions = {}
) => {
  const terminator = new Rect({
    ...FLOWCHART_DEFAULTS,
    width,
    height,
    rx: height / 2,
    ry: height / 2,
  })
  return addNode(canvas, terminator, 'Start', options, undefined, 'terminator')
}

/** Input / Output — parallelogram */
export const addInputOutput = (
  canvas: Canvas,
  width = 140,
  height = 70,
  skew = 25,
  options: ShapeOptions = {}
) => {
  const inputOutput = new Polygon(
    [
      { x: skew, y: 0 },
      { x: width, y: 0 },
      { x: width - skew, y: height },
      { x: 0, y: height },
    ],
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, inputOutput, 'Input / Output', options, undefined, 'inputOutput')
}

/** Document — rectangle with wavy bottom */
export const addDocument = (
  canvas: Canvas,
  width = 140,
  height = 90,
  options: ShapeOptions = {}
) => {
  const document = new Path(
    `
      M 0 0
      L ${width} 0
      L ${width} ${height - 15}
      Q ${width * 0.75} ${height + 10} ${width * 0.5} ${height - 5}
      Q ${width * 0.25} ${height - 20} 0 ${height - 5}
      Z
    `,
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, document, 'Document', options, undefined, 'document')
}

/** Database — cylinder */
export const addDatabase = (
  canvas: Canvas,
  width = 120,
  height = 140,
  options: ShapeOptions = {}
) => {
  const rx = width / 2
  const ry = 15

  const database = new Path(
    `
      M 0 ${ry}
      A ${rx} ${ry} 0 0 1 ${width} ${ry}
      L ${width} ${height - ry}
      A ${rx} ${ry} 0 0 1 0 ${height - ry}
      Z
      M 0 ${ry}
      A ${rx} ${ry} 0 0 0 ${width} ${ry}
    `,
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, database, 'Database', options, undefined, 'database')
}

/** Manual Input — rectangle with slanted top */
export const addManualInput = (
  canvas: Canvas,
  width = 140,
  height = 70,
  offset = 30,
  options: ShapeOptions = {}
) => {
  const manualInput = new Polygon(
    [
      { x: offset, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, manualInput, 'Manual Input', options, undefined, 'manualInput')
}

/** Preparation — hexagon */
export const addPreparation = (
  canvas: Canvas,
  width = 140,
  height = 70,
  offset = 25,
  options: ShapeOptions = {}
) => {
  const preparation = new Polygon(
    [
      { x: offset, y: 0 },
      { x: width - offset, y: 0 },
      { x: width, y: height / 2 },
      { x: width - offset, y: height },
      { x: offset, y: height },
      { x: 0, y: height / 2 },
    ],
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, preparation, 'Preparation', options, undefined, 'preparation')
}

/** On-page connector — circle */
export const addConnector = (
  canvas: Canvas,
  radius = 25,
  options: ShapeOptions = {}
) => {
  const connector = new Circle({
    ...FLOWCHART_DEFAULTS,
    radius,
  })
  return addNode(canvas, connector, '', options, 14, 'connector')
}

/** Delay — D / bullet shape */
export const addDelay = (
  canvas: Canvas,
  width = 140,
  height = 70,
  options: ShapeOptions = {}
) => {
  const delay = new Path(
    `
      M 0 0
      L ${width / 2} 0
      A ${height / 2} ${height / 2} 0 0 1 ${width / 2} ${height}
      L 0 ${height}
      Z
    `,
    { ...FLOWCHART_DEFAULTS }
  )
  return addNode(canvas, delay, 'Delay', options, undefined, 'delay')
}

/** Logical OR — circle with + */
export const addLogicalOR = (canvas: Canvas, options: ShapeOptions = {}) => {
  const circle = new Circle({
    ...FLOWCHART_DEFAULTS,
    radius: 30,
  })
  return addNode(canvas, circle, '+', options, 22, 'logicalOR')
}

/** Logical AND — circle with & */
export const addLogicalAND = (canvas: Canvas, options: ShapeOptions = {}) => {
  const circle = new Circle({
    ...FLOWCHART_DEFAULTS,
    radius: 30,
  })
  return addNode(canvas, circle, '&', options, 22, 'logicalAND')
}

/** YES label */
export const addYES = (canvas: Canvas, options: ShapeOptions = {}) => {
  const box = new Rect({
    ...FLOWCHART_DEFAULTS,
    width: 80,
    height: 40,
    rx: 4,
    ry: 4,
  })
  return addNode(canvas, box, 'YES', options, 16, 'yes')
}

/** NO label */
export const addNO = (canvas: Canvas, options: ShapeOptions = {}) => {
  const box = new Rect({
    ...FLOWCHART_DEFAULTS,
    width: 80,
    height: 40,
    rx: 4,
    ry: 4,
  })
  return addNode(canvas, box, 'NO', options, 16, 'no')
}

export type FlowchartId =
  | 'process'
  | 'decision'
  | 'terminator'
  | 'inputOutput'
  | 'document'
  | 'database'
  | 'manualInput'
  | 'preparation'
  | 'connector'
  | 'delay'
  | 'logicalOR'
  | 'logicalAND'
  | 'yes'
  | 'no'

export const FLOWCHART_ADDERS: Record<FlowchartId, (canvas: Canvas) => unknown> = {
  process: (canvas) => addProcess(canvas),
  decision: (canvas) => addDecision(canvas),
  terminator: (canvas) => addTerminator(canvas),
  inputOutput: (canvas) => addInputOutput(canvas),
  document: (canvas) => addDocument(canvas),
  database: (canvas) => addDatabase(canvas),
  manualInput: (canvas) => addManualInput(canvas),
  preparation: (canvas) => addPreparation(canvas),
  connector: (canvas) => addConnector(canvas),
  delay: (canvas) => addDelay(canvas),
  logicalOR: addLogicalOR,
  logicalAND: addLogicalAND,
  yes: addYES,
  no: addNO,
}

export const isFlowchartId = (id: string): id is FlowchartId => id in FLOWCHART_ADDERS
