import { Canvas, Circle, FabricObject, Point, Polyline, Textbox, util } from 'fabric'
import type { ConnectionPoint, ConnectorLine } from '../add-shapes'
import { isCropFrame, isExportExcluded } from '../export-utils'
import { getFlowchartShape, isFlowchartNode } from '../flowchart-node'
import { ensureObjectId } from '../object-utils'

export type XY = { x: number; y: number }
export type PortType = ConnectionPoint['type']
export type PortMap = Record<PortType, XY>

export type PortMarker = Circle & {
  id?: string
  objectId?: string
  portHostId?: string
  portType?: PortType
  isPortMarker?: boolean
}

export const DEFAULT_SNAP_DISTANCE = 20
/** Visual / hit radius of connection port handles. */
export const PORT_RADIUS = 6
/** Push ports outward so they clear the shape edge + selection chrome. */
export const PORT_OUTSET = 10
export const PORT_COLOR = '#0D99FF'

export const PORT_DIRECTIONS: Record<PortType, XY> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export const OPPOSITE_PORT: Record<PortType, PortType> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** Anything exposing `reroute` is treated as an auto-routed elbow connector. */
export type Reroutable = Polyline & {
  connectorKind?: string
  reroute: (canvas: Canvas) => void
}

export const isElbowConnector = (object: unknown): object is Reroutable =>
  Boolean(
    object &&
      (object as { connectorKind?: string }).connectorKind === 'elbow' &&
      typeof (object as { reroute?: unknown }).reroute === 'function'
  )

export const isPortMarker = (object: FabricObject | null | undefined): object is PortMarker => {
  if (!object) return false
  const tagged = object as PortMarker
  return (
    tagged.isPortMarker === true ||
    Boolean(tagged.id?.startsWith('__port-')) ||
    Boolean(tagged.objectId?.startsWith('__port-'))
  )
}

export const isConnectableObject = (object: FabricObject | null | undefined): boolean => {
  if (!object || isPortMarker(object) || isExportExcluded(object)) return false
  if (object instanceof Polyline) return false
  if (object instanceof Textbox) return false
  if (isCropFrame(object)) return false

  if (isFlowchartNode(object)) return true

  const kind = (object as FabricObject & { shapeKind?: string }).shapeKind
  if (
    kind === 'image' ||
    kind === 'comment' ||
    kind === 'stickyNote' ||
    kind === 'textbox' ||
    kind === 'crop' ||
    kind === 'line'
  ) {
    return false
  }
  if (kind === 'rectangle' || kind === 'circle' || kind === 'triangle' || kind === 'polygon') {
    return true
  }

  const type = String(object.type || '').toLowerCase()
  return ['rect', 'circle', 'triangle', 'ellipse', 'polygon'].includes(type)
}

const outsetPortsFromCenter = (ports: PortMap, center: XY, distance: number): PortMap => {
  const out = { ...ports }
  for (const key of Object.keys(out) as PortType[]) {
    const p = out[key]
    const dx = p.x - center.x
    const dy = p.y - center.y
    const len = Math.hypot(dx, dy) || 1
    out[key] = {
      x: p.x + (dx / len) * distance,
      y: p.y + (dy / len) * distance,
    }
  }
  return out
}

/** The visible shape of an object (flowchart groups use the shape child). */
export const getVisibleShape = (object: FabricObject): FabricObject => {
  if (isFlowchartNode(object)) {
    return getFlowchartShape(object) ?? object
  }
  return object
}

export const getObjectPorts = (object: FabricObject): PortMap | null => {
  const target = getVisibleShape(object)

  target.setCoords()
  const matrix = target.calcTransformMatrix()
  const w = target.width ?? 0
  const h = target.height ?? 0
  // width/height already equal 2r / 2rx / 2ry for circles and ellipses. (Rect's rx/ry are
  // corner radii, not half-extents, so they must not be used here.)
  const halfX = w / 2
  const halfY = h / 2
  const strokePad =
    ((target.strokeWidth ?? 0) * Math.max(target.scaleX || 1, target.scaleY || 1)) / 2
  const outset = PORT_OUTSET + strokePad + PORT_RADIUS

  const centerPt = util.transformPoint(new Point(0, 0), matrix)
  const center = { x: centerPt.x, y: centerPt.y }

  // Always transform local edge midpoints through the full matrix so grouped
  // flowchart children resolve to true canvas / world coordinates.
  const localMidpoints: Record<PortType, Point> = {
    top: new Point(0, -halfY),
    right: new Point(halfX, 0),
    bottom: new Point(0, halfY),
    left: new Point(-halfX, 0),
  }

  const boxPorts = {
    top: util.transformPoint(localMidpoints.top, matrix),
    right: util.transformPoint(localMidpoints.right, matrix),
    bottom: util.transformPoint(localMidpoints.bottom, matrix),
    left: util.transformPoint(localMidpoints.left, matrix),
  }
  const aabbPorts: PortMap = {
    top: { x: boxPorts.top.x, y: boxPorts.top.y },
    right: { x: boxPorts.right.x, y: boxPorts.right.y },
    bottom: { x: boxPorts.bottom.x, y: boxPorts.bottom.y },
    left: { x: boxPorts.left.x, y: boxPorts.left.y },
  }

  // Build world-space silhouette vertices when the box midpoints sit outside the fill.
  const vertices: XY[] = []
  const polyPoints = (target as FabricObject & { points?: { x: number; y: number }[] }).points
  const pathOffset = (target as FabricObject & { pathOffset?: XY }).pathOffset ?? { x: 0, y: 0 }

  if (polyPoints && polyPoints.length >= 3) {
    for (const p of polyPoints) {
      const world = util.transformPoint(new Point(p.x - pathOffset.x, p.y - pathOffset.y), matrix)
      vertices.push({ x: world.x, y: world.y })
    }
  } else if (target.type === 'triangle') {
    const locals = [
      { x: 0, y: -h / 2 },
      { x: -w / 2, y: h / 2 },
      { x: w / 2, y: h / 2 },
    ]
    for (const p of locals) {
      const world = util.transformPoint(new Point(p.x, p.y), matrix)
      vertices.push({ x: world.x, y: world.y })
    }
  } else {
    return outsetPortsFromCenter(aabbPorts, center, outset)
  }

  if (vertices.length < 3) {
    return outsetPortsFromCenter(aabbPorts, center, outset)
  }

  const ports = { ...aabbPorts }
  for (const key of Object.keys(PORT_DIRECTIONS) as PortType[]) {
    const dir = PORT_DIRECTIONS[key]
    let bestT = 0
    let best: XY | null = null

    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]
      const b = vertices[(i + 1) % vertices.length]
      const edge = { x: b.x - a.x, y: b.y - a.y }
      const denom = dir.x * edge.y - dir.y * edge.x
      if (Math.abs(denom) < 1e-8) continue

      const fromCenter = { x: a.x - center.x, y: a.y - center.y }
      const t = (fromCenter.x * edge.y - fromCenter.y * edge.x) / denom
      const u = (fromCenter.x * dir.y - fromCenter.y * dir.x) / denom
      if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && t > bestT) {
        bestT = t
        best = { x: center.x + dir.x * t, y: center.y + dir.y * t }
      }
    }

    if (best) {
      ports[key] = best
    }
  }

  return outsetPortsFromCenter(ports, center, outset)
}

/** Axis-aligned world bounds of an object's visible shape. */
export const getObjectBounds = (object: FabricObject) => {
  const shape = getVisibleShape(object)
  shape.setCoords()
  return shape.getBoundingRect()
}

export const calculateCanvasObjectPoints = (canvas: Canvas) => {
  const objects = canvas
    .getObjects()
    .filter((object) => !(object instanceof Polyline) && !isPortMarker(object) && !isExportExcluded(object))
  return objects.flatMap((object) => {
    if (!isConnectableObject(object)) return []
    const objectPosition = getObjectPorts(object)
    if (!objectPosition) {
      return []
    }
    return [
      {
        objectId: ensureObjectId(object),
        objectPosition,
      },
    ]
  })
}

/** Convert a polyline local path point into canvas/world coordinates. */
export const getWorldPointForLinePoint = (line: Polyline, index: number): XY | null => {
  const points = line.points
  if (!points?.[index]) {
    return null
  }

  const localPoint = new Point(
    points[index].x - line.pathOffset.x,
    points[index].y - line.pathOffset.y
  )
  const worldPoint = localPoint.transform(line.calcOwnMatrix())
  return { x: worldPoint.x, y: worldPoint.y }
}

/**
 * Write a canvas/world point back into polyline local path coordinates.
 * Must call setDimensions() afterwards — otherwise Fabric keeps the old bbox
 * and the stroke gets clipped while control handles still look correct.
 */
export const setLinePointFromWorld = (line: Polyline, index: number, worldPoint: XY): boolean => {
  const points = line.points
  if (!points?.[index]) {
    return false
  }

  // Keep another vertex fixed in world space while dimensions/pathOffset are recalculated
  // (same approach Fabric uses in createPolyControls).
  const anchorIndex = index === 0 ? Math.min(1, points.length - 1) : 0
  const anchorBefore = new Point(points[anchorIndex].x, points[anchorIndex].y)
    .subtract(line.pathOffset)
    .transform(line.calcOwnMatrix())

  const local = util.transformPoint(
    new Point(worldPoint.x, worldPoint.y),
    util.invertTransform(line.calcOwnMatrix())
  )
  points[index].x = local.x + line.pathOffset.x
  points[index].y = local.y + line.pathOffset.y

  line.setDimensions()
  line.set('dirty', true)

  const anchorAfter = new Point(points[anchorIndex].x, points[anchorIndex].y)
    .subtract(line.pathOffset)
    .transform(line.calcOwnMatrix())
  const diff = anchorAfter.subtract(anchorBefore)
  line.left -= diff.x
  line.top -= diff.y
  line.setCoords()
  return true
}

/** Snap one dragged vertex to the nearest object edge midpoint within snapDistance. */
export const snapLinePointToNearestMidpoint = (
  line: Polyline,
  pointIndex: number, // which point on the line is being dragged
  canvas: Canvas,
  snapDistance = DEFAULT_SNAP_DISTANCE
) => {
  if (snapDistance <= 0) {
    const connector = line as ConnectorLine
    if (connector.endpointConnections?.[pointIndex]) {
      connector.endpointConnections[pointIndex] = null
    }
    return
  }
  const worldPoint = getWorldPointForLinePoint(line, pointIndex)
  if (!worldPoint) {
    return
  }

  const objectPoints = calculateCanvasObjectPoints(canvas)
  let best: {
    point: XY
    distance: number
    objectId: string
    type: PortType
  } | null = null

  for (const objPoint of objectPoints) {
    for (const [port, mid] of Object.entries(objPoint.objectPosition) as [PortType, XY][]) {
      const distance = Math.hypot(mid.x - worldPoint.x, mid.y - worldPoint.y)
      if (distance <= snapDistance && (!best || distance < best.distance)) {
        best = {
          point: mid,
          distance,
          objectId: objPoint.objectId,
          type: port,
        }
      }
    }
  }

  if (best) {
    // Snap the dragged endpoint to the nearest object edge midpoint and remember the attachment.
    setLinePointFromWorld(line, pointIndex, best.point)

    const connector = line as ConnectorLine
    connector.endpointConnections ??= {}
    connector.endpointConnections[pointIndex] = {
      objectId: best.objectId,
      type: best.type,
    }
  } else {
    const connector = line as ConnectorLine
    if (connector.endpointConnections?.[pointIndex]) {
      connector.endpointConnections[pointIndex] = null
    }
  }
}

/**
 * Re-glue every connector attached to `obj`. Elbow connectors re-route as a whole;
 * straight lines only move the attached endpoints.
 */
export const updateConnectedLines = ({ canvas, obj }: { canvas: Canvas; obj: FabricObject }) => {
  if (obj instanceof Polyline || isPortMarker(obj)) {
    return
  }

  const movedId = (obj as FabricObject & { objectId?: string }).objectId
  if (!movedId) {
    return
  }

  const ports = getObjectPorts(obj)
  if (!ports) {
    return
  }

  for (const object of canvas.getObjects()) {
    if (!(object instanceof Polyline)) {
      continue
    }

    const line = object as ConnectorLine
    if (!line.endpointConnections) {
      continue
    }

    const attached = Object.values(line.endpointConnections).some(
      (conn) => conn && conn.objectId === movedId
    )
    if (!attached) continue

    if (isElbowConnector(line)) {
      line.reroute(canvas)
      continue
    }

    let changed = false
    for (const [indexStr, conn] of Object.entries(line.endpointConnections)) {
      if (!conn || conn.objectId !== movedId) {
        continue
      }
      if (setLinePointFromWorld(line, Number(indexStr), ports[conn.type])) {
        changed = true
      }
    }

    if (changed) {
      line.setCoords()
    }
  }

  canvas.requestRenderAll()
}

/** Find a connectable object by its objectId. */
export const findObjectById = (canvas: Canvas, objectId: string): FabricObject | undefined =>
  canvas.getObjects().find((obj) => ensureObjectId(obj) === objectId && isConnectableObject(obj))

/** World-space centre of an object's visible shape. */
export const getObjectCenter = (object: FabricObject): XY => {
  const shape = getVisibleShape(object)
  shape.setCoords()
  const c = util.transformPoint(new Point(0, 0), shape.calcTransformMatrix())
  return { x: c.x, y: c.y }
}

/**
 * Where a ray from the object's centre toward `toward` leaves the visible shape
 * (polygon outline, ellipse, or box). Used by diagonal "straight" connectors.
 */
export const getEdgePoint = (object: FabricObject, toward: XY, gap = 2): XY => {
  const shape = getVisibleShape(object)
  const matrix = shape.calcTransformMatrix()
  const center = getObjectCenter(object)
  let dx = toward.x - center.x
  let dy = toward.y - center.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return center
  dx /= len
  dy /= len

  const w = shape.width ?? 0
  const h = shape.height ?? 0
  const poly = (shape as FabricObject & { points?: XY[] }).points
  const offset = (shape as FabricObject & { pathOffset?: XY }).pathOffset ?? { x: 0, y: 0 }
  let local: XY[] | null = null
  if (poly && poly.length >= 3) {
    local = poly.map((p) => ({ x: p.x - offset.x, y: p.y - offset.y }))
  } else if (shape.type === 'triangle') {
    local = [
      { x: 0, y: -h / 2 },
      { x: -w / 2, y: h / 2 },
      { x: w / 2, y: h / 2 },
    ]
  }

  let t: number | null = null
  if (local) {
    const verts = local.map((p) => util.transformPoint(new Point(p.x, p.y), matrix))
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % verts.length]
      const ex = b.x - a.x
      const ey = b.y - a.y
      const denom = dx * ey - dy * ex
      if (Math.abs(denom) < 1e-9) continue
      const fx = a.x - center.x
      const fy = a.y - center.y
      const tt = (fx * ey - fy * ex) / denom
      const u = (fx * dy - fy * dx) / denom
      if (tt > 0 && u >= 0 && u <= 1 && (t === null || tt > t)) t = tt
    }
  } else {
    const b = shape.getBoundingRect()
    const rx = b.width / 2
    const ry = b.height / 2
    if (shape.type === 'circle' || shape.type === 'ellipse') {
      t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
    } else {
      t = Math.min(rx / Math.max(Math.abs(dx), 1e-9), ry / Math.max(Math.abs(dy), 1e-9))
    }
  }
  const dist = (t ?? 0) + gap
  return { x: center.x + dx * dist, y: center.y + dy * dist }
}
