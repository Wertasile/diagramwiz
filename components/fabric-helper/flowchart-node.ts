import {
  Canvas,
  FabricObject,
  Group,
  Textbox,
  type TPointerEventInfo,
} from 'fabric'
import { DEFAULT_SHAPE_OPTIONS } from './object-utils'
import {
  clearPlaceholderOnEdit,
  withPlaceholder,
  type PlaceholderTextbox,
} from './text-placeholder'

const LABEL_PADDING = 16

export type FlowchartNode = Group & {
  flowchartNode: true
  shapeKind?: string
}

export type FlowchartTextEditHandlers = {
  onEditStart: (group: FlowchartNode, textbox: Textbox) => void
  onEditEnd: () => void
  onEditChange?: (group: FlowchartNode, textbox: Textbox) => void
}

export const isFlowchartNode = (obj: FabricObject | null | undefined): obj is FlowchartNode =>
  Boolean(obj && (obj as FabricObject & { flowchartNode?: boolean }).flowchartNode)

// extracts the textbox from the group
export const getFlowchartLabel = (group: Group): Textbox | null => {
  const label = group.getObjects().find((obj) => obj instanceof Textbox)
  return label instanceof Textbox ? label : null
}

// extracts the shape from the group
export const getFlowchartShape = (group: Group): FabricObject | null => {
  const shape = group.getObjects().find((obj) => !(obj instanceof Textbox))
  return shape ?? null
}

/** Walk up from a child to its flowchart group, if any. */
export const getParentFlowchartNode = (
  object: FabricObject | null | undefined
): FlowchartNode | null => {
  let parent: FabricObject | undefined =
    object && 'group' in object ? (object.group as FabricObject | undefined) : undefined
  while (parent) {
    if (isFlowchartNode(parent)) return parent
    parent =
      'group' in parent ? (parent.group as FabricObject | undefined) : undefined
  }
  return null
}

/**
 * Shape/label must never become the canvas active object for transforms.
 * Hit-testing stays on the group; the label is only selectable while text-editing.
 */
export const lockFlowchartChildren = (group: Group) => {
  const shape = getFlowchartShape(group)
  const label = getFlowchartLabel(group)
  shape?.set({ selectable: false, evented: false })
  label?.set({ selectable: false, evented: true, editable: true })
  group.set({ interactive: false, subTargetCheck: true })
}

const createLabel = (width: number, height: number, text: string, fontSize = 16) => {
  const textbox = new Textbox('', {
    left: width / 2,
    top: height / 2,
    originX: 'center',
    originY: 'center',
    width: Math.max(40, width - LABEL_PADDING),
    fontSize,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    fill: '#000000',
    textAlign: 'center',
    splitByGrapheme: true,
    editable: true,
    selectable: false,
    evented: true,
    objectCaching: false,
  })

  withPlaceholder(textbox, text || 'Text', {
    contentFill: '#000000',
    placeholderFill: 'rgba(107, 114, 128, 0.75)',
  })

  return textbox
}

/**
 * Wrap a flowchart shape with an editable centered Textbox.
 * Group scaling enlarges the shape only — label font size stays constant.
 */
export const createFlowchartNode = (
  shape: FabricObject,
  options: {
    label?: string
    left?: number
    top?: number
    fontSize?: number
    shapeKind?: string
  } = {}
): FlowchartNode => {
  const {
    label = 'Text',
    left = DEFAULT_SHAPE_OPTIONS.left,
    top = DEFAULT_SHAPE_OPTIONS.top,
    fontSize = 16,
    shapeKind = 'process',
  } = options

  // Normalize shape into top-left local space for predictable grouping.
  shape.set({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    strokeUniform: true,
    selectable: false,
    evented: false,
  })
  shape.setCoords()

  const width = shape.getScaledWidth()
  const height = shape.getScaledHeight()
  const textbox = createLabel(width, height, label, fontSize)

  const group = new Group([shape, textbox], {
    left,
    top,
    subTargetCheck: true,
    interactive: false,
  }) as FlowchartNode

  group.flowchartNode = true
  group.shapeKind = shapeKind
  lockFlowchartChildren(group)
  attachFlowchartScaleBehavior(group)

  return group
}

/** Keep label font-size visually constant while the group is scaled. */
const syncLabelCounterScale = (group: Group) => {
  const text = getFlowchartLabel(group)
  if (!text) return

  const sx = group.scaleX || 1
  const sy = group.scaleY || 1
  text.set({
    scaleX: 1 / sx,
    scaleY: 1 / sy,
  })
}

/**
 * Bake group scale into the shape child, reset group/text scales to 1,
 * and resize/recenter the textbox so wrapping follows the new bounds.
 */
export const bakeFlowchartScale = (group: Group) => {
  const shape = getFlowchartShape(group)
  const text = getFlowchartLabel(group)
  if (!shape || !text) return

  const sx = group.scaleX || 1
  const sy = group.scaleY || 1
  const beforeLeft = group.left ?? 0
  const beforeTop = group.top ?? 0

  if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
    shape.set({
      scaleX: (shape.scaleX || 1) * sx,
      scaleY: (shape.scaleY || 1) * sy,
    })
    group.set({ scaleX: 1, scaleY: 1 })
  }

  text.set({ scaleX: 1, scaleY: 1 })
  group.triggerLayout()

  const width = shape.getScaledWidth()
  const height = shape.getScaledHeight()
  const shapeLeft = shape.left ?? 0
  const shapeTop = shape.top ?? 0

  text.set({
    width: Math.max(40, width - LABEL_PADDING),
    left: shapeLeft + width / 2,
    top: shapeTop + height / 2,
    originX: 'center',
    originY: 'center',
  })

  group.triggerLayout()
  group.set({ left: beforeLeft, top: beforeTop })
  group.setCoords()
}

/** Keep label font size constant while scaling; bake scale on modify. */
export const attachFlowchartScaleBehavior = (group: Group) => {
  lockFlowchartChildren(group)

  group.on('scaling', () => {
    syncLabelCounterScale(group)
  })

  group.on('modified', () => {
    bakeFlowchartScale(group)
  })
}

export const enterFlowchartTextEdit = (
  canvas: Canvas,
  group: FlowchartNode,
  handlers?: Partial<FlowchartTextEditHandlers>
) => {
  const textbox = getFlowchartLabel(group)
  if (!textbox || textbox.isEditing) return

  // Allow the label to become the active object for editing.
  group.set({ interactive: true, subTargetCheck: true })
  textbox.set({ selectable: true, evented: true, editable: true })

  canvas.discardActiveObject()
  canvas.setActiveObject(textbox)
  canvas.requestRenderAll()

  requestAnimationFrame(() => {
    if (!textbox.canvas) return

    const wasPlaceholder = Boolean((textbox as PlaceholderTextbox).isPlaceholder)
    clearPlaceholderOnEdit(textbox as PlaceholderTextbox)
    textbox.enterEditing()
    if (!wasPlaceholder) {
      textbox.selectAll()
    }
    canvas.requestRenderAll()
    handlers?.onEditStart?.(group, textbox)

    const handleChange = () => {
      handlers?.onEditChange?.(group, textbox)
    }

    const handleExit = () => {
      textbox.off('changed', handleChange)
      textbox.off('editing:exited', handleExit)
      // Relock children before reselecting so shape cannot stay active.
      lockFlowchartChildren(group)
      bakeFlowchartScale(group)
      handlers?.onEditEnd?.()

      // Restore group selection after editing finishes.
      canvas.setActiveObject(group)
      canvas.requestRenderAll()
    }

    textbox.on('changed', handleChange)
    textbox.on('editing:exited', handleExit)
  })
}

/**
 * If a flowchart child somehow becomes the active object (outside text edit),
 * bounce selection back to the parent group.
 */
const redirectFlowchartChildSelection = (canvas: Canvas) => {
  const active = canvas.getActiveObject()
  if (!active || isFlowchartNode(active)) return

  const parent = getParentFlowchartNode(active)
  if (!parent) return

  // Allow the label to stay active while entering / during text edit.
  if (active instanceof Textbox && (active.isEditing || parent.interactive)) {
    return
  }

  canvas.setActiveObject(parent)
  canvas.requestRenderAll()
}

/**
 * Canvas-level double-click → edit flowchart label.
 * Single click still selects/scales the whole group.
 */
export const setupFlowchartTextEditing = (
  canvas: Canvas,
  handlers: FlowchartTextEditHandlers
) => {
  const onDblClick = (opt: TPointerEventInfo) => {
    const target = opt.target
    if (!isFlowchartNode(target)) return
    enterFlowchartTextEdit(canvas, target, handlers)
  }

  const onSelectionCreated = () => redirectFlowchartChildSelection(canvas)
  const onSelectionUpdated = () => redirectFlowchartChildSelection(canvas)

  canvas.on('mouse:dblclick', onDblClick)
  canvas.on('selection:created', onSelectionCreated)
  canvas.on('selection:updated', onSelectionUpdated)

  return () => {
    canvas.off('mouse:dblclick', onDblClick)
    canvas.off('selection:created', onSelectionCreated)
    canvas.off('selection:updated', onSelectionUpdated)
  }
}

/** Screen-space rect for anchoring UI above a flowchart node / its label. */
export const getFlowchartAnchorScreenRect = (
  canvas: Canvas,
  group: Group
): { left: number; top: number; width: number; height: number; centerX: number } => {
  const bound = group.getBoundingRect()
  const el = canvas.getElement()
  const domRect = el.getBoundingClientRect()
  const cssScaleX = domRect.width / (canvas.getWidth() || 1)
  const cssScaleY = domRect.height / (canvas.getHeight() || 1)

  const left = domRect.left + bound.left * cssScaleX
  const top = domRect.top + bound.top * cssScaleY
  const width = bound.width * cssScaleX
  const height = bound.height * cssScaleY

  return {
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
  }
}
