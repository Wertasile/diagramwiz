import { Canvas, Circle, FabricObject, Group, Point, Polyline, Rect, Triangle } from 'fabric'
import { addObjectToCanvas, ensureObjectId } from '../object-utils'
import { getFlowchartShape, getParentFlowchartNode, isFlowchartNode } from '../flowchart-node'
import {
  createElbowConnector,
  elbowHooks,
  type ElbowConnector,
  type EndpointIndex,
  type SnapTarget,
} from './elbow-connector'
import {
  findObjectById,
  getObjectBounds,
  getObjectPorts,
  getVisibleShape,
  isConnectableObject,
  isElbowConnector,
  isPortMarker,
  OPPOSITE_PORT,
  PORT_COLOR,
  PORT_DIRECTIONS,
  PORT_RADIUS,
  updateConnectedLines,
  type PortMarker,
  type PortType,
  type XY,
} from './ports'
import {
  buildPlaceable,
  makeGhost,
  placeableIdForObject,
} from './placement'

export type ConnectorInteractionOptions = {
  /** Snap radius (px) used while dragging a connector; 0 disables snapping. */
  getSnapDistance: () => number
  /** Mirrors the active object into React state / refs. */
  onSelectionChange: (active: FabricObject | undefined) => void
}

const DRAG_THRESHOLD = 4
const HOLD_MS = 220
const HOVER_CLEAR_MS = 350
const HOVER_RADIUS = 14
const SNAP_MIN_RADIUS = 28
const NEIGHBOUR_RANGE = 400
const NEIGHBOUR_BAND = 40
const NEW_OBJECT_GAP = 80
const GHOST_CONNECTOR_OPACITY = 0.5
const GHOST_OBJECT_OPACITY = 0.35

const HL_RECT_ID = '__hl-rect'
const HL_SNAP_ID = '__hl-snap'
const HL_ARROW_ID = '__hl-arrow'
const GHOST_OBJECT_ID = '__ghost-object'
const GHOST_CONNECTOR_ID = '__ghost-connector'

type PendingPress = {
  host: FabricObject
  type: PortType
  startClient: XY
  timer: ReturnType<typeof setTimeout>
}

type DragState = {
  connector: ElbowConnector
  source: FabricObject
  type: PortType
  snap: SnapTarget
}

type PreviewPlan =
  | {
      kind: 'neighbour'
      host: FabricObject
      type: PortType
      neighbour: FabricObject
    }
  | {
      kind: 'new'
      host: FabricObject
      type: PortType
      shapeId: string
      center: XY
    }

const resolveConnectable = (target: FabricObject | undefined | null): FabricObject | null => {
  if (!target) return null
  if (isConnectableObject(target)) return target
  const parent = getParentFlowchartNode(target)
  return parent && isConnectableObject(parent) ? parent : null
}

const boundsCorners = (b: { left: number; top: number; width: number; height: number }): XY[] => [
  { x: b.left, y: b.top },
  { x: b.left + b.width, y: b.top },
  { x: b.left, y: b.top + b.height },
  { x: b.left + b.width, y: b.top + b.height },
]

export function setupConnectorInteractions(
  canvas: Canvas,
  options: ConnectorInteractionOptions
): () => void {
  let hoverHost: FabricObject | null = null
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let hoveredMarker: PortMarker | null = null
  let pending: PendingPress | null = null
  let drag: DragState | null = null
  let markerKey = ''
  let previewObjects: FabricObject[] = []
  const previousTolerance = canvas.targetFindTolerance
  // Must use the setter: it also resizes the offscreen hit-test buffer (otherwise it stays 1x1).
  canvas.setTargetFindTolerance(6)

  // ------------------------------------------------------------------ helpers

  const connectables = () => canvas.getObjects().filter(isConnectableObject)

  const addEphemeral = (object: FabricObject) => {
    canvas.add(object)
    canvas.bringObjectToFront(object)
  }

  const removeById = (id: string) => {
    for (const obj of canvas.getObjects()) {
      if ((obj as FabricObject & { id?: string }).id === id) canvas.remove(obj)
    }
  }

  // --------------------------------------------------------------- port markers

  const clearPortMarkers = () => {
    for (const marker of canvas.getObjects().filter(isPortMarker)) canvas.remove(marker)
    hoveredMarker = null
    markerKey = ''
  }

  const portHosts = (): FabricObject[] => {
    if (drag) return connectables()
    const hosts: FabricObject[] = []
    const active = canvas.getActiveObject()
    if (active && isConnectableObject(active)) {
      hosts.push(active)
    }
    if (hoverHost && !hosts.includes(hoverHost) && canvas.getObjects().includes(hoverHost)) {
      hosts.push(hoverHost)
    }
    return hosts
  }

  const syncPortMarkers = (force = false) => {
    const hosts = portHosts()
    const key = `${drag ? 'd' : 'n'}:${hosts.map((h) => ensureObjectId(h)).join(',')}`
    if (!force && key === markerKey) return
    clearPreview()
    clearPortMarkers()
    markerKey = key

    for (const host of hosts) {
      const ports = getObjectPorts(host)
      if (!ports) continue
      const hostId = ensureObjectId(host)
      for (const portType of Object.keys(ports) as PortType[]) {
        const pos = ports[portType]
        const marker = new Circle({
          left: pos.x,
          top: pos.y,
          originX: 'center',
          originY: 'center',
          radius: PORT_RADIUS,
          fill: '#ffffff',
          stroke: PORT_COLOR,
          strokeWidth: 2,
          strokeUniform: true,
          selectable: false,
          evented: true,
          hasControls: false,
          hasBorders: false,
          hoverCursor: 'crosshair',
          objectCaching: false,
          excludeFromExport: true,
          perPixelTargetFind: false,
        }) as PortMarker
        marker.isPortMarker = true
        marker.id = `__port-${hostId}-${portType}`
        marker.objectId = marker.id
        marker.portHostId = hostId
        marker.portType = portType
        canvas.add(marker)
        canvas.bringObjectToFront(marker)
      }
    }
    canvas.requestRenderAll()
  }

  const setHoverHost = (host: FabricObject | null) => {
    if (hoverHost === host) return
    hoverHost = host
    if (!pending && !drag) syncPortMarkers()
  }

  const cancelHoverClear = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }
  }

  const scheduleHoverClear = () => {
    cancelHoverClear()
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (pending || drag) return
      setHoverHost(null)
    }, HOVER_CLEAR_MS)
  }

  // ------------------------------------------------------------ snap + highlight

  const snapRadius = () => {
    const base = options.getSnapDistance()
    return base <= 0 ? 0 : Math.max(base, SNAP_MIN_RADIUS)
  }

  const findSnap = (pointer: XY, exclude?: FabricObject): { target: SnapTarget; object: FabricObject; point: XY } | null => {
    const radius = snapRadius()
    if (radius <= 0) return null
    let best: { score: number; target: SnapTarget; object: FabricObject; point: XY } | null = null

    for (const obj of connectables()) {
      if (obj === exclude) continue
      const ports = getObjectPorts(obj)
      if (!ports) continue
      const b = getObjectBounds(obj)
      const inside =
        pointer.x >= b.left &&
        pointer.x <= b.left + b.width &&
        pointer.y >= b.top &&
        pointer.y <= b.top + b.height

      let nearest: { type: PortType; d: number } | null = null
      for (const type of Object.keys(ports) as PortType[]) {
        const d = Math.hypot(ports[type].x - pointer.x, ports[type].y - pointer.y)
        if (!nearest || d < nearest.d) nearest = { type, d }
      }
      if (!nearest) continue
      if (!inside && nearest.d > radius) continue
      const score = inside ? nearest.d - 10000 : nearest.d
      if (!best || score < best.score) {
        best = {
          score,
          target: { objectId: ensureObjectId(obj), type: nearest.type },
          object: obj,
          point: ports[nearest.type],
        }
      }
    }
    return best
  }

  const showSnapHighlight = (object: FabricObject, point: XY) => {
    removeById(HL_RECT_ID)
    removeById(HL_SNAP_ID)
    const b = getObjectBounds(object)
    const rect = new Rect({
      left: b.left - 4,
      top: b.top - 4,
      width: b.width + 8,
      height: b.height + 8,
      fill: 'rgba(13,153,255,0.06)',
      stroke: PORT_COLOR,
      strokeWidth: 2,
      strokeUniform: true,
      rx: 4,
      ry: 4,
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true,
    })
    ;(rect as FabricObject & { id?: string }).id = HL_RECT_ID
    const snap = new Circle({
      left: point.x,
      top: point.y,
      originX: 'center',
      originY: 'center',
      radius: PORT_RADIUS + 3,
      fill: PORT_COLOR,
      stroke: '#ffffff',
      strokeWidth: 2,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true,
    })
    ;(snap as FabricObject & { id?: string }).id = HL_SNAP_ID
    addEphemeral(rect)
    addEphemeral(snap)
  }

  const clearSnapHighlight = () => {
    removeById(HL_RECT_ID)
    removeById(HL_SNAP_ID)
  }

  const updateSnapFeedback = (found: ReturnType<typeof findSnap>) => {
    if (found) showSnapHighlight(found.object, found.point)
    else clearSnapHighlight()
  }

  // -------------------------------------------------------------- hover preview

  function clearPreview() {
    for (const obj of previewObjects) {
      if (canvas.getObjects().includes(obj)) canvas.remove(obj)
    }
    previewObjects = []
    removeById(HL_ARROW_ID)
    removeById(GHOST_OBJECT_ID)
    removeById(GHOST_CONNECTOR_ID)
    if (hoveredMarker) {
      hoveredMarker.set({ radius: PORT_RADIUS, fill: '#ffffff' })
      hoveredMarker = null
    }
  }

  const findNeighbour = (host: FabricObject, type: PortType, from: XY): FabricObject | null => {
    const d = PORT_DIRECTIONS[type]
    const perp = { x: -d.y, y: d.x }
    let best: { obj: FabricObject; t: number } | null = null

    for (const obj of connectables()) {
      if (obj === host) continue
      const corners = boundsCorners(getObjectBounds(obj))
      const ts = corners.map((c) => (c.x - from.x) * d.x + (c.y - from.y) * d.y)
      const ps = corners.map((c) => (c.x - from.x) * perp.x + (c.y - from.y) * perp.y)
      const t0 = Math.min(...ts)
      const p0 = Math.min(...ps)
      const p1 = Math.max(...ps)
      if (t0 < -2 || t0 > NEIGHBOUR_RANGE) continue
      if (p0 > NEIGHBOUR_BAND || p1 < -NEIGHBOUR_BAND) continue
      if (!best || t0 < best.t) best = { obj, t: t0 }
    }
    return best?.obj ?? null
  }

  /** Where should a new object go so its facing port sits `NEW_OBJECT_GAP` from the host port? */
  const buildNewObject = (host: FabricObject, type: PortType, shapeId: string, from: XY) => {
    const obj = buildPlaceable(canvas, shapeId)
    if (!obj) return null
    const hostShape = getVisibleShape(host)
    const sourceShape = isFlowchartNode(obj) ? getFlowchartShape(obj) : obj
    sourceShape?.set({ fill: hostShape.fill, stroke: hostShape.stroke } as never)

    obj.setPositionByOrigin(host.getCenterPoint(), 'center', 'center')
    obj.setCoords()
    const ports = getObjectPorts(obj)
    if (!ports) return null
    const d = PORT_DIRECTIONS[type]
    const target = { x: from.x + d.x * NEW_OBJECT_GAP, y: from.y + d.y * NEW_OBJECT_GAP }
    const facing = ports[OPPOSITE_PORT[type]]
    const center = obj.getCenterPoint()
    obj.setPositionByOrigin(
      new Point(center.x + (target.x - facing.x), center.y + (target.y - facing.y)),
      'center',
      'center'
    )
    obj.setCoords()
    return obj
  }

  const planPreview = (host: FabricObject, type: PortType): PreviewPlan | null => {
    const ports = getObjectPorts(host)
    if (!ports) return null
    const from = ports[type]
    const neighbour = findNeighbour(host, type, from)
    if (neighbour) return { kind: 'neighbour', host, type, neighbour }
    const shapeId = placeableIdForObject(host)
    if (!shapeId) return null
    const probe = buildNewObject(host, type, shapeId, from)
    if (!probe) return null
    return { kind: 'new', host, type, shapeId, center: probe.getCenterPoint() }
  }

  const createArrowButton = (marker: PortMarker) => {
    const type = marker.portType as PortType
    const d = PORT_DIRECTIONS[type]
    const circle = new Circle({
      radius: HOVER_RADIUS,
      fill: PORT_COLOR,
      originX: 'center',
      originY: 'center',
    })
    const arrow = new Triangle({
      width: 10,
      height: 9,
      fill: '#ffffff',
      originX: 'center',
      originY: 'center',
      angle: (Math.atan2(d.y, d.x) * 180) / Math.PI + 90,
    })
    const group = new Group([circle, arrow], {
      left: marker.left,
      top: marker.top,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true,
    })
    ;(group as FabricObject & { id?: string }).id = HL_ARROW_ID
    return group
  }

  const showPreview = (marker: PortMarker) => {
    clearPreview()
    if (pending || drag || !marker.portHostId || !marker.portType) return
    const host = findObjectById(canvas, marker.portHostId)
    if (!host) return

    hoveredMarker = marker
    marker.set({ radius: HOVER_RADIUS, fill: PORT_COLOR })
    marker.setCoords()

    const plan = planPreview(host, marker.portType)
    const ports = getObjectPorts(host)
    if (plan && ports) {
      const from = ports[marker.portType]
      if (plan.kind === 'neighbour') {
        const connector = createElbowConnector(canvas, from, from, {
          0: { objectId: ensureObjectId(host), type: marker.portType },
          1: { objectId: ensureObjectId(plan.neighbour), type: OPPOSITE_PORT[marker.portType] },
        })
        makeGhost(connector, GHOST_CONNECTOR_ID, GHOST_CONNECTOR_OPACITY)
        canvas.add(connector)
        previewObjects.push(connector)
      } else {
        const ghost = buildNewObject(host, marker.portType, plan.shapeId, from)
        const ghostPorts = ghost ? getObjectPorts(ghost) : null
        if (ghost && ghostPorts) {
          makeGhost(ghost, GHOST_OBJECT_ID, GHOST_OBJECT_OPACITY)
          canvas.add(ghost)
          previewObjects.push(ghost)
          const connector = createElbowConnector(canvas, from, ghostPorts[OPPOSITE_PORT[marker.portType]], {
            0: { objectId: ensureObjectId(host), type: marker.portType },
            1: null,
          })
          connector.reroute(canvas, {
            override: { 1: ghostPorts[OPPOSITE_PORT[marker.portType]] },
          })
          makeGhost(connector, GHOST_CONNECTOR_ID, GHOST_CONNECTOR_OPACITY)
          canvas.add(connector)
          previewObjects.push(connector)
        }
      }
    }

    const arrow = createArrowButton(marker)
    canvas.add(arrow)
    previewObjects.push(arrow)
    canvas.bringObjectToFront(marker)
    canvas.bringObjectToFront(arrow)
    canvas.requestRenderAll()
  }

  /** Click on a port (no drag): materialise the previewed object / connection. */
  const quickAdd = (host: FabricObject, type: PortType) => {
    const ports = getObjectPorts(host)
    if (!ports) return
    const from = ports[type]
    const hostId = ensureObjectId(host)
    const plan = planPreview(host, type)

    clearPreview()
    if (!plan) return

    if (plan.kind === 'neighbour') {
      const connector = createElbowConnector(canvas, from, from, {
        0: { objectId: hostId, type },
        1: { objectId: ensureObjectId(plan.neighbour), type: OPPOSITE_PORT[type] },
      })
      addObjectToCanvas(canvas, connector, { centerInViewport: false })
      canvas.fire('object:modified', { target: connector })
      return
    }

    const created = buildNewObject(host, type, plan.shapeId, from)
    const createdPorts = created ? getObjectPorts(created) : null
    if (!created || !createdPorts) return
    addObjectToCanvas(canvas, created, { centerInViewport: false })
    const connector = createElbowConnector(canvas, from, createdPorts[OPPOSITE_PORT[type]], {
      0: { objectId: hostId, type },
      1: { objectId: ensureObjectId(created), type: OPPOSITE_PORT[type] },
    })
    addObjectToCanvas(canvas, connector, { centerInViewport: false })
    canvas.setActiveObject(created)
    canvas.fire('object:modified', { target: connector })
  }

  // ------------------------------------------------------------- press + drag

  const beginDrag = (press: PendingPress) => {
    clearTimeout(press.timer)
    pending = null
    clearPreview()
    const ports = getObjectPorts(press.host)
    if (!ports) {
      canvas.selection = true
      return
    }
    const start = ports[press.type]
    const connector = createElbowConnector(canvas, start, { x: start.x + 1, y: start.y }, {
      0: { objectId: ensureObjectId(press.host), type: press.type },
      1: null,
    })
    addObjectToCanvas(canvas, connector, { centerInViewport: false })
    canvas.discardActiveObject()
    drag = { connector, source: press.host, type: press.type, snap: null }
    syncPortMarkers(true)
  }

  const updateDrag = (pointer: XY) => {
    if (!drag) return
    const found = findSnap(pointer, drag.source)
    drag.snap = found?.target ?? null
    drag.connector.endpointConnections[1] = found ? { ...found.target! } : null
    drag.connector.reroute(canvas, found ? {} : { override: { 1: pointer } })
    updateSnapFeedback(found)
    canvas.requestRenderAll()
  }

  const endDrag = (cancel: boolean) => {
    const current = drag
    if (!current) return
    drag = null
    clearSnapHighlight()
    canvas.selection = true
    if (cancel) {
      if (canvas.getObjects().includes(current.connector)) canvas.remove(current.connector)
    } else {
      current.connector.setCoords()
      canvas.setActiveObject(current.connector)
      canvas.fire('object:modified', { target: current.connector })
    }
    syncPortMarkers(true)
    canvas.requestRenderAll()
  }

  // ------------------------------------------------- elbow connector endpoint drag

  elbowHooks.onEndpointDrag = (_connector, _k: EndpointIndex, world) => {
    const found = findSnap(world)
    updateSnapFeedback(found)
    return found?.target ?? null
  }
  elbowHooks.onEndpointDrop = () => {
    clearSnapHighlight()
    canvas.requestRenderAll()
  }

  // ------------------------------------------------------------------ handlers

  const onSelection = () => {
    if (pending || drag) return
    const active = canvas.getActiveObject()
    options.onSelectionChange(active ?? undefined)
    syncPortMarkers()
  }

  const onMovingOrModified = (e: { target?: FabricObject }) => {
    const target = e.target
    if (!target || isPortMarker(target) || target instanceof Polyline) return
    clearPreview()
    updateConnectedLines({ canvas, obj: target })
    syncPortMarkers(true)
  }

  const onMouseDownBefore = (opt: { target?: FabricObject; e: Event }) => {
    const target = opt.target
    if (!isPortMarker(target) || !target.portHostId || !target.portType) return
    const host = findObjectById(canvas, target.portHostId)
    if (!host) return
    const me = opt.e as MouseEvent
    // Stop Fabric from starting a rubber-band selection / clearing selection.
    canvas.selection = false
    const press: PendingPress = {
      host,
      type: target.portType,
      startClient: { x: me.clientX, y: me.clientY },
      timer: setTimeout(() => {
        if (pending === press) beginDrag(press)
      }, HOLD_MS),
    }
    pending = press
    clearPreview()
  }

  const onMouseMove = (opt: { e: Event }) => {
    const e = opt.e as MouseEvent
    if (pending) {
      const moved = Math.hypot(e.clientX - pending.startClient.x, e.clientY - pending.startClient.y)
      if (moved > DRAG_THRESHOLD) beginDrag(pending)
    }
    if (drag) {
      const p = canvas.getScenePoint(e)
      updateDrag({ x: p.x, y: p.y })
    }
  }

  const onMouseUp = () => {
    if (pending) {
      const press = pending
      clearTimeout(press.timer)
      pending = null
      canvas.selection = true
      // A plain click: quick-add / connect to the neighbour.
      quickAdd(press.host, press.type)
      if (!canvas.getActiveObject()) canvas.setActiveObject(press.host)
      hoverHost = null
      syncPortMarkers(true)
      return
    }
    if (drag) endDrag(false)
  }

  const setLineHover = (target: FabricObject | undefined, on: boolean) => {
    if (!isElbowConnector(target)) return
    ;(target as FabricObject & { __hovered?: boolean }).__hovered = on
    target.set('dirty', true)
    canvas.requestRenderAll()
  }

  const onMouseOver = (opt: { target?: FabricObject }) => {
    const target = opt.target
    setLineHover(target, true)
    if (pending || drag) return
    if (isPortMarker(target)) {
      cancelHoverClear()
      showPreview(target)
      return
    }
    const host = resolveConnectable(target)
    if (host) {
      cancelHoverClear()
      setHoverHost(host)
    }
  }

  const onMouseOut = (opt: { target?: FabricObject }) => {
    const target = opt.target
    setLineHover(target, false)
    if (pending || drag) return
    if (isPortMarker(target)) {
      clearPreview()
      canvas.requestRenderAll()
    }
    scheduleHoverClear()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (drag) {
      e.preventDefault()
      endDrag(true)
    } else if (pending) {
      clearTimeout(pending.timer)
      pending = null
      canvas.selection = true
    }
  }

  syncPortMarkers(true)
  canvas.on('selection:created', onSelection)
  canvas.on('selection:updated', onSelection)
  canvas.on('selection:cleared', onSelection)
  canvas.on('object:moving', onMovingOrModified)
  canvas.on('object:scaling', onMovingOrModified)
  canvas.on('object:rotating', onMovingOrModified)
  canvas.on('object:modified', onMovingOrModified)
  canvas.on('mouse:down:before', onMouseDownBefore)
  canvas.on('mouse:move', onMouseMove)
  canvas.on('mouse:up', onMouseUp)
  canvas.on('mouse:over', onMouseOver)
  canvas.on('mouse:out', onMouseOut)
  window.addEventListener('keydown', onKeyDown)

  return () => {
    cancelHoverClear()
    if (pending) clearTimeout(pending.timer)
    if (drag && canvas.getObjects().includes(drag.connector)) canvas.remove(drag.connector)
    pending = null
    drag = null
    clearSnapHighlight()
    clearPreview()
    clearPortMarkers()
    canvas.selection = true
    canvas.setTargetFindTolerance(previousTolerance)
    elbowHooks.onEndpointDrag = undefined
    elbowHooks.onEndpointDrop = undefined
    canvas.off('selection:created', onSelection)
    canvas.off('selection:updated', onSelection)
    canvas.off('selection:cleared', onSelection)
    canvas.off('object:moving', onMovingOrModified)
    canvas.off('object:scaling', onMovingOrModified)
    canvas.off('object:rotating', onMovingOrModified)
    canvas.off('object:modified', onMovingOrModified)
    canvas.off('mouse:down:before', onMouseDownBefore)
    canvas.off('mouse:move', onMouseMove)
    canvas.off('mouse:up', onMouseUp)
    canvas.off('mouse:over', onMouseOver)
    canvas.off('mouse:out', onMouseOut)
    window.removeEventListener('keydown', onKeyDown)
  }
}
