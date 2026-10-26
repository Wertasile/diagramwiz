import { Canvas, classRegistry, Control, Point, Polyline, util, type TOptions } from 'fabric'
import type { ConnectionPoint } from '../add-shapes'
import { getThemeLineStroke, LINE_CORNER_COLOR, LINE_CORNER_STROKE } from '../theme-lines'
import {
  findObjectById,
  getEdgePoint,
  getObjectBounds,
  getObjectCenter,
  getObjectPorts,
  isConnectableObject,
  type PortType,
  type XY,
} from './ports'
import {
  DEFAULT_STUB,
  ENDPOINT_PAD,
  OBSTACLE_PAD,
  padRect,
  rectFromBounds,
  routeOrthogonal,
  segmentBlocked,
  sideVector,
  type Rect,
  type Side,
} from './router'

const CORNER_RADIUS = 8
const HEAD_SIZE = 10
/** Snap a dragged segment onto a neighbour when within this many px. */
const SEGMENT_SNAP = 8
const EPS = 0.5

export type RouteType = 'elbow' | 'curve' | 'straight'
export type HeadKind = 'none' | 'arrow' | 'triangle' | 'triangleOpen' | 'circle' | 'diamond'
export type EndpointIndex = 0 | 1
export type SnapTarget = { objectId: string; type: PortType } | null

/** Callbacks supplied by the interaction layer (snap highlight, re-attach on drop). */
export type ElbowHooks = {
  onEndpointDrag?: (connector: ElbowConnector, endpoint: EndpointIndex, world: XY) => SnapTarget
  onEndpointDrop?: (connector: ElbowConnector, endpoint: EndpointIndex) => void
}

export const elbowHooks: ElbowHooks = {}

type ResolvedEnd = {
  pt: XY
  side: Side | null
  obj: ReturnType<typeof findObjectById> | null
}

type RerouteOptions = {
  override?: Partial<Record<EndpointIndex, XY>>
  /** Skip the obstacle check on user waypoints (while dragging a segment). */
  trustWaypoints?: boolean
  /** Keep the current controls (they are rebuilt on drop instead). */
  rebuild?: boolean
}

// ------------------------------------------------------------------ geometry

const isHorizontal = (a: XY, b: XY) => Math.abs(a.y - b.y) < EPS
const isVertical = (a: XY, b: XY) => Math.abs(a.x - b.x) < EPS
const isAxisAligned = (a: XY, b: XY) => isHorizontal(a, b) || isVertical(a, b)
const nearlyEqual = (a: XY, b: XY) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1

const stubPoint = (pt: XY, side: Side | null): XY => {
  if (!side) return { ...pt }
  const v = sideVector(side)
  return { x: pt.x + v.x * DEFAULT_STUB, y: pt.y + v.y * DEFAULT_STUB }
}

/**
 * Re-assert fixed port stubs and drop collinear interior points, but never remove
 * the first/last stubs (indices 1 and n-2 after forcing).
 */
const forceStubsAndSimplify = (pts: XY[], startDir: Side | null, endDir: Side | null): XY[] => {
  if (pts.length < 2) return pts.map((p) => ({ ...p }))
  const start = { ...pts[0] }
  const end = { ...pts[pts.length - 1] }
  const sStub = stubPoint(start, startDir)
  const eStub = stubPoint(end, endDir)

  // Interior between the two stubs (drop anything that collides with the stubs).
  const mid: XY[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    if (nearlyEqual(p, start) || nearlyEqual(p, end) || nearlyEqual(p, sStub) || nearlyEqual(p, eStub)) {
      continue
    }
    mid.push({ ...p })
  }

  const raw = [start, sStub, ...mid, eStub, end]
  const dedup: XY[] = []
  for (const p of raw) {
    const prev = dedup[dedup.length - 1]
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > EPS) dedup.push(p)
  }
  if (dedup.length <= 4) return dedup.length >= 2 ? dedup : [start, end]

  // Indices 0,1 and n-2,n-1 are fixed; only simplify the true middle.
  const out: XY[] = [dedup[0], dedup[1]]
  for (let i = 2; i < dedup.length - 2; i++) {
    const a = out[out.length - 1]
    const b = dedup[i]
    const c = dedup[i + 1]
    const collinearX = Math.abs(a.x - b.x) <= EPS && Math.abs(b.x - c.x) <= EPS
    const collinearY = Math.abs(a.y - b.y) <= EPS && Math.abs(b.y - c.y) <= EPS
    if (collinearX || collinearY) continue
    out.push(b)
  }
  out.push(dedup[dedup.length - 2], dedup[dedup.length - 1])
  const cleaned: XY[] = []
  for (const p of out) {
    const prev = cleaned[cleaned.length - 1]
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > EPS) cleaned.push(p)
  }
  return cleaned.length >= 2 ? cleaned : [start, end]
}

/** Make a polyline of free points orthogonal by inserting corners (respecting port directions). */
const orthogonalize = (pts: XY[], startDir: Side | null, endDir: Side | null): XY[] => {
  const out: XY[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1]
    const q = pts[i]
    if (!isAxisAligned(p, q)) {
      const last = i === pts.length - 1
      let horizFirst: boolean
      if (out.length >= 2) horizFirst = isHorizontal(out[out.length - 2], p)
      else if (startDir) horizFirst = startDir === 'left' || startDir === 'right'
      else horizFirst = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y)
      if (last && endDir) horizFirst = !(endDir === 'left' || endDir === 'right')
      out.push(horizFirst ? { x: q.x, y: p.y } : { x: p.x, y: q.y })
    }
    out.push(q)
  }
  return out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y) > EPS)
}

const pathsMatch = (a: XY[], b: XY[]) =>
  a.length === b.length && a.every((p, i) => nearlyEqual(p, b[i]))

/**
 * Move segment `i` perpendicular to itself to coordinate `v`. Collinear neighbours keep
 * their original point and gain a shifted copy, which inserts extra bends (straight → Z).
 * Stubs (indices 0 and n-2) are never the dragged segment.
 */
const moveSegment = (pts: XY[], i: number, v: number) => {
  const p = pts[i]
  const q = pts[i + 1]
  const horiz = isHorizontal(p, q)
  const shift = (pt: XY): XY => (horiz ? { x: pt.x, y: v } : { x: v, y: pt.y })
  const sameAxis = (a: XY | undefined, b: XY) => !!a && (horiz ? isHorizontal(a, b) : isVertical(a, b))
  // Always keep the point that sits on a stub boundary so stubs stay put.
  const keepP = i <= 1 || sameAxis(pts[i - 1], p)
  const keepQ = i + 1 >= pts.length - 2 || sameAxis(pts[i + 2], q)
  const out = [...pts.slice(0, i)]
  if (keepP) out.push(p)
  const index = out.length
  out.push(shift(p), shift(q))
  if (keepQ) out.push(q)
  out.push(...pts.slice(i + 2))
  return { points: out, index }
}

/** Snap `v` onto a neighbouring parallel segment's axis if within SEGMENT_SNAP. */
const snapSegmentValue = (pts: XY[], i: number, v: number): number => {
  const horiz = isHorizontal(pts[i], pts[i + 1])
  const axisOf = (a: XY, b: XY) => (horiz ? (a.y + b.y) / 2 : (a.x + b.x) / 2)
  const candidates: number[] = []
  for (let j = 0; j < pts.length - 1; j++) {
    if (j === i) continue
    const a = pts[j]
    const b = pts[j + 1]
    if (horiz ? isHorizontal(a, b) : isVertical(a, b)) candidates.push(axisOf(a, b))
  }
  let best = v
  let bestD = SEGMENT_SNAP
  for (const c of candidates) {
    const d = Math.abs(c - v)
    if (d < bestD) {
      bestD = d
      best = Math.round(c)
    }
  }
  return best
}

const drawHead = (ctx: CanvasRenderingContext2D, tip: XY, angle: number, kind: HeadKind) => {
  if (kind === 'none') return
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const S = HEAD_SIZE
  const back = (d: number, w: number): XY => ({
    x: tip.x - ux * d - uy * w,
    y: tip.y - uy * d + ux * w,
  })
  ctx.beginPath()
  if (kind === 'arrow') {
    const a = back(S, S * 0.55)
    const b = back(S, -S * 0.55)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.lineTo(b.x, b.y)
  } else if (kind === 'triangle' || kind === 'triangleOpen') {
    const a = back(S, S * 0.5)
    const b = back(S, -S * 0.5)
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.closePath()
    if (kind === 'triangle') ctx.fill()
  } else if (kind === 'circle') {
    const c = back(S * 0.45, 0)
    ctx.arc(c.x, c.y, S * 0.45, 0, Math.PI * 2)
  } else if (kind === 'diamond') {
    const a = back(S * 0.5, S * 0.4)
    const b = back(S, 0)
    const c = back(S * 0.5, -S * 0.4)
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
    ctx.closePath()
  }
  ctx.stroke()
}

// -------------------------------------------------------------------- class

export class ElbowConnector extends Polyline {
  static type = 'ElbowConnector'

  declare connectorKind: 'elbow'
  declare isConnector: boolean
  declare shapeKind: string
  declare endpointConnections: Record<number, ConnectionPoint | null>
  declare routeType: RouteType
  declare startHead: HeadKind
  declare endHead: HeadKind
  /** User-edited interior bends (world space). Empty = fully automatic route. */
  declare waypoints: XY[]
  /** Curve handle offset from the chord midpoint. */
  declare curveBend: { dx: number; dy: number }
  /** Runtime only: hover highlight and segment-drag bookkeeping. */
  declare __hovered?: boolean
  declare dragSeg?: { orig: number; cur: number }

  constructor(points: XY[] = [], options: TOptions<Record<string, unknown>> = {}) {
    super(points, {
      fill: '',
      stroke: getThemeLineStroke(),
      strokeWidth: 2,
      strokeUniform: true,
      strokeLineJoin: 'round',
      strokeLineCap: 'round',
      objectCaching: false,
      // Hit-test the drawn path via pixels, with padding so thin horizontal / vertical
      // lines (whose bounding box has no thickness) are still inside the selection area.
      perPixelTargetFind: true,
      padding: 10,
      hoverCursor: 'pointer',
      hasBorders: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      lockMovementX: true,
      lockMovementY: true,
      cornerStyle: 'circle',
      cornerColor: LINE_CORNER_COLOR,
      cornerStrokeColor: LINE_CORNER_STROKE,
      transparentCorners: false,
      ...options,
    } as never)
    this.connectorKind = 'elbow'
    this.isConnector = true
    this.shapeKind = this.shapeKind ?? 'elbowConnector'
    this.endpointConnections = this.endpointConnections ?? { 0: null, 1: null }
    this.routeType = this.routeType ?? 'elbow'
    this.startHead = this.startHead ?? 'none'
    this.endHead = this.endHead ?? 'arrow'
    this.waypoints = this.waypoints ?? []
    this.curveBend = this.curveBend ?? { dx: 0, dy: 0 }
    this.rebuildControls()
  }

  /** Current route as world-space points. */
  getWorldPoints(): XY[] {
    return this.points.map((p) => ({ x: p.x, y: p.y }))
  }

  /** Replace the route with world-space points and refit the bounding box. */
  setWorldPoints(world: XY[]) {
    this.points = world.map((p) => ({ x: p.x, y: p.y }))
    this.set({ scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 })
    this.setBoundingBox(true)
    this.set('dirty', true)
    this.setCoords()
  }

  /** Change route type from the menu; user bends belong to the previous type. */
  setRouteType(canvas: Canvas, type: RouteType) {
    this.routeType = type
    this.waypoints = []
    this.curveBend = { dx: 0, dy: 0 }
    this.reroute(canvas)
  }

  private resolveEnd(canvas: Canvas, k: EndpointIndex, override?: XY): ResolvedEnd {
    const idx = k === 0 ? 0 : this.points.length - 1
    if (override) return { pt: override, side: null, obj: null }

    const conn = this.endpointConnections?.[k]
    if (conn) {
      const obj = findObjectById(canvas, conn.objectId)
      const ports = obj ? getObjectPorts(obj) : null
      if (obj && ports) return { pt: ports[conn.type], side: conn.type, obj }
      // Attached object is gone: keep the line but detach this end.
      this.endpointConnections[k] = null
    }
    const p = this.points[idx]
    return { pt: { x: p.x, y: p.y }, side: null, obj: null }
  }

  private collectObstacles(canvas: Canvas, ends: ResolvedEnd[]): Rect[] {
    const attached = new Set(ends.map((e) => e.obj).filter(Boolean))
    const rects: Rect[] = []
    for (const obj of canvas.getObjects()) {
      if (!isConnectableObject(obj)) continue
      const pad = attached.has(obj) ? ENDPOINT_PAD : OBSTACLE_PAD
      rects.push(padRect(rectFromBounds(getObjectBounds(obj)), pad))
    }
    return rects
  }

  private autoElbow(a: ResolvedEnd, b: ResolvedEnd, obstacles: Rect[]): XY[] {
    let route: XY[]
    if (a.side) {
      route = routeOrthogonal({
        start: a.pt,
        startDir: a.side,
        end: b.pt,
        endDir: b.side,
        obstacles,
      })
    } else if (b.side) {
      route = routeOrthogonal({
        start: b.pt,
        startDir: b.side,
        end: a.pt,
        endDir: null,
        obstacles,
      }).reverse()
    } else {
      const dx = b.pt.x - a.pt.x
      const dy = b.pt.y - a.pt.y
      const side: Side =
        Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
      route = routeOrthogonal({ start: a.pt, startDir: side, end: b.pt, endDir: null, obstacles })
    }
    return forceStubsAndSimplify(route, a.side, b.side)
  }

  private elbowRoute(canvas: Canvas, a: ResolvedEnd, b: ResolvedEnd, trust: boolean): XY[] {
    const obstacles = this.collectObstacles(canvas, [a, b])
    const auto = this.autoElbow(a, b, obstacles)

    if (this.waypoints.length > 0) {
      const path = forceStubsAndSimplify(
        orthogonalize([a.pt, ...this.waypoints, b.pt], a.side, b.side),
        a.side,
        b.side
      )
      const blocked =
        !trust &&
        path.some(
          (p, i) =>
            i > 0 && i < path.length - 2 && segmentBlocked(path[i], path[i + 1], obstacles)
        )

      if (!blocked) {
        if (trust) return path

        // Object moved: only drop user bends when the rebuilt path itself went straight
        // (or matches auto). Keep deliberate Z jogs while objects stay aligned.
        if (path.length <= 4 || pathsMatch(path, auto)) {
          this.waypoints = []
          return auto
        }
        // Stubs are indices 1 and n-2 — only persist the true middle.
        this.waypoints = path.slice(2, -2)
        return path
      }
      this.waypoints = []
    }

    return auto
  }

  /**
   * Recompute the route from the attached objects' current ports.
   * `override` pins a free end to a world point (used while dragging).
   */
  reroute(canvas: Canvas, options: RerouteOptions = {}) {
    if (this.points.length < 2) return
    const a = this.resolveEnd(canvas, 0, options.override?.[0])
    const b = this.resolveEnd(canvas, 1, options.override?.[1])

    let route: XY[]
    if (this.routeType === 'straight') {
      // Floating attachment: aim at the other object's centre, stop at the shape edge.
      const ca = a.obj ? getObjectCenter(a.obj) : a.pt
      const cb = b.obj ? getObjectCenter(b.obj) : b.pt
      route = [a.obj ? getEdgePoint(a.obj, cb) : a.pt, b.obj ? getEdgePoint(b.obj, ca) : b.pt]
    } else if (this.routeType === 'curve') {
      const mid = { x: (a.pt.x + b.pt.x) / 2, y: (a.pt.y + b.pt.y) / 2 }
      route = [a.pt, { x: mid.x + this.curveBend.dx, y: mid.y + this.curveBend.dy }, b.pt]
    } else {
      route = this.elbowRoute(canvas, a, b, options.trustWaypoints === true)
    }

    this.setWorldPoints(route)
    if (options.rebuild !== false) this.rebuildControls()
  }

  rebuildControls() {
    const controls: Record<string, Control> = {}
    const n = this.points.length
    ;([0, 1] as EndpointIndex[]).forEach((k) => {
      controls[`ep${k}`] = createEndpointControl(k)
    })
    if (this.routeType === 'curve') {
      controls.curve = createCurveControl()
    } else if (this.routeType === 'elbow') {
      // First and last legs are fixed port stubs — only middle segments get handles.
      for (let i = 1; i <= n - 3; i++) controls[`seg${i}`] = createSegmentControl(i)
    }
    this.controls = controls
    // Control positions are cached in oCoords, so refresh them for the new control set.
    if (this.canvas) this.setCoords()
  }

  private tracePath(ctx: CanvasRenderingContext2D, pts: XY[]) {
    const n = pts.length
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    if (this.routeType === 'curve' && n === 3) {
      const c = curveControlPoint(pts)
      ctx.quadraticCurveTo(c.x, c.y, pts[2].x, pts[2].y)
    } else if (this.routeType === 'elbow') {
      for (let i = 1; i < n - 1; i++) {
        const cur = pts[i]
        const next = pts[i + 1]
        const prev = pts[i - 1]
        const r = Math.min(
          CORNER_RADIUS,
          Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2,
          Math.hypot(next.x - cur.x, next.y - cur.y) / 2
        )
        if (r > 0.5) ctx.arcTo(cur.x, cur.y, next.x, next.y, r)
        else ctx.lineTo(cur.x, cur.y)
      }
      ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
    } else {
      ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
    }
  }

  _render(ctx: CanvasRenderingContext2D) {
    const n = this.points.length
    if (n < 2) return
    const ox = this.pathOffset.x
    const oy = this.pathOffset.y
    const pts = this.points.map((p) => ({ x: p.x - ox, y: p.y - oy }))

    if (this.__hovered && this.canvas?.getActiveObject() !== this) {
      ctx.save()
      this.tracePath(ctx, pts)
      ctx.strokeStyle = 'rgba(13,153,255,0.35)'
      ctx.lineWidth = (this.strokeWidth ?? 2) + 6
      ctx.setLineDash([])
      ctx.stroke()
      ctx.restore()
    }

    this.tracePath(ctx, pts)
    this._renderPaintInOrder(ctx)

    if (typeof this.stroke !== 'string') return
    const first = pts[0]
    const last = pts[n - 1]
    let startFrom = pts[1]
    let endFrom = pts[n - 2]
    if (this.routeType === 'curve' && n === 3) {
      const c = curveControlPoint(pts)
      startFrom = c
      endFrom = c
    }
    const pickFar = (tip: XY, order: XY[], fallback: XY) =>
      order.find((p) => Math.hypot(tip.x - p.x, tip.y - p.y) > 0.5) ?? fallback

    ctx.save()
    ctx.strokeStyle = this.stroke
    ctx.fillStyle = this.stroke
    ctx.lineWidth = this.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([])
    const sFrom = pickFar(first, [startFrom, ...pts.slice(1)], startFrom)
    drawHead(ctx, first, Math.atan2(first.y - sFrom.y, first.x - sFrom.x), this.startHead)
    const eFrom = pickFar(last, [endFrom, ...pts.slice(0, -1).reverse()], endFrom)
    drawHead(ctx, last, Math.atan2(last.y - eFrom.y, last.x - eFrom.x), this.endHead)
    ctx.restore()
  }
}

/** Quadratic control point so the curve passes through the middle point `pts[1]` at t = 0.5. */
const curveControlPoint = (pts: XY[]): XY => {
  const mid = { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 }
  return { x: 2 * pts[1].x - mid.x, y: 2 * pts[1].y - mid.y }
}

// ----------------------------- controls -----------------------------

const worldToViewport = (obj: ElbowConnector, world: XY) =>
  new Point(world.x, world.y)
    .subtract(obj.pathOffset)
    .transform(util.multiplyTransformMatrices(obj.getViewportTransform(), obj.calcTransformMatrix()))

const OFFSCREEN = new Point(-9999, -9999)

const createEndpointControl = (k: EndpointIndex) =>
  new Control({
    actionName: 'modifyElbowEndpoint',
    cursorStyle: 'crosshair',
    sizeX: 14,
    sizeY: 14,
    touchSizeX: 24,
    touchSizeY: 24,
    positionHandler: (_dim, _matrix, fabricObject) => {
      const c = fabricObject as ElbowConnector
      if (c.dragSeg) return OFFSCREEN
      const p = c.points[k === 0 ? 0 : c.points.length - 1]
      return worldToViewport(c, p)
    },
    actionHandler: (_event, transform, x, y) => {
      const c = transform.target as ElbowConnector
      const canvas = c.canvas
      if (!canvas) return false
      const snap = elbowHooks.onEndpointDrag?.(c, k, { x, y }) ?? null
      if (snap) {
        c.endpointConnections[k] = { objectId: snap.objectId, type: snap.type }
        c.reroute(canvas)
      } else {
        c.endpointConnections[k] = null
        c.reroute(canvas, { override: { [k]: { x, y } } as Partial<Record<EndpointIndex, XY>> })
      }
      canvas.requestRenderAll()
      return true
    },
    mouseUpHandler: (_event, transform) => {
      elbowHooks.onEndpointDrop?.(transform.target as ElbowConnector, k)
      return true
    },
    render: (ctx, left, top) => {
      ctx.save()
      ctx.beginPath()
      ctx.arc(left, top, 6, 0, Math.PI * 2)
      ctx.fillStyle = LINE_CORNER_COLOR
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = LINE_CORNER_STROKE
      ctx.stroke()
      ctx.restore()
    },
  })

/** The segment index currently represented by control `i` (it moves while being dragged). */
const segIndex = (c: ElbowConnector, i: number) => {
  if (!c.dragSeg) return i
  return c.dragSeg.orig === i ? c.dragSeg.cur : -1
}

const createSegmentControl = (i: number) =>
  new Control({
    actionName: 'modifyElbowSegment',
    sizeX: 22,
    sizeY: 22,
    touchSizeX: 28,
    touchSizeY: 28,
    cursorStyleHandler: (_event, _control, fabricObject) => {
      const c = fabricObject as ElbowConnector
      const idx = segIndex(c, i)
      const a = c.points[idx]
      const b = c.points[idx + 1]
      if (!a || !b) return 'move'
      return isVertical(a, b) ? 'ew-resize' : 'ns-resize'
    },
    positionHandler: (_dim, _matrix, fabricObject) => {
      const c = fabricObject as ElbowConnector
      const idx = segIndex(c, i)
      const a = c.points[idx]
      const b = c.points[idx + 1]
      if (!a || !b) return OFFSCREEN
      return worldToViewport(c, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    },
    actionHandler: (_event, transform, x, y) => {
      const c = transform.target as ElbowConnector
      const canvas = c.canvas
      if (!canvas) return false
      const t = transform as typeof transform & { elbowBase?: XY[] }
      t.elbowBase ??= c.getWorldPoints()
      const base = t.elbowBase
      if (!base[i] || !base[i + 1]) return false
      const raw = Math.round(isHorizontal(base[i], base[i + 1]) ? y : x)
      const v = snapSegmentValue(base, i, raw)
      const moved = moveSegment(base, i, v)
      // Persist middle only — indices 0..1 and n-2..n-1 are fixed stubs.
      c.waypoints = moved.points.length <= 4 ? [] : moved.points.slice(2, -2)
      c.dragSeg = { orig: i, cur: moved.index }
      c.reroute(canvas, { trustWaypoints: true, rebuild: false })
      canvas.requestRenderAll()
      return true
    },
    mouseUpHandler: (_event, transform) => {
      const c = transform.target as ElbowConnector
      const canvas = c.canvas
      c.dragSeg = undefined
      if (!canvas) return true
      // Collapse collinear runs (`_|‾` → `_`). Non-trust reroute clears waypoints when straight.
      const pts = c.getWorldPoints()
      c.waypoints = pts.length <= 4 ? [] : pts.slice(2, -2)
      c.reroute(canvas)
      canvas.requestRenderAll()
      return true
    },
    render: (ctx, left, top, _style, fabricObject) => {
      const c = fabricObject as ElbowConnector
      const idx = segIndex(c, i)
      const a = c.points[idx]
      const b = c.points[idx + 1]
      if (!a || !b) return
      const vertical = isVertical(a, b)
      const w = vertical ? 6 : 18
      const h = vertical ? 18 : 6
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(left - w / 2, top - h / 2, w, h, 3)
      ctx.fillStyle = LINE_CORNER_STROKE
      ctx.fill()
      ctx.restore()
    },
  })

const createCurveControl = () =>
  new Control({
    actionName: 'modifyCurve',
    cursorStyle: 'move',
    sizeX: 16,
    sizeY: 16,
    touchSizeX: 26,
    touchSizeY: 26,
    positionHandler: (_dim, _matrix, fabricObject) => {
      const c = fabricObject as ElbowConnector
      return c.points[1] ? worldToViewport(c, c.points[1]) : OFFSCREEN
    },
    actionHandler: (_event, transform, x, y) => {
      const c = transform.target as ElbowConnector
      const canvas = c.canvas
      if (!canvas || c.points.length < 3) return false
      const s = c.points[0]
      const e = c.points[c.points.length - 1]
      c.curveBend = { dx: x - (s.x + e.x) / 2, dy: y - (s.y + e.y) / 2 }
      c.reroute(canvas, { rebuild: false })
      canvas.requestRenderAll()
      return true
    },
    render: (ctx, left, top) => {
      ctx.save()
      ctx.beginPath()
      ctx.arc(left, top, 6, 0, Math.PI * 2)
      ctx.fillStyle = LINE_CORNER_STROKE
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = LINE_CORNER_COLOR
      ctx.stroke()
      ctx.restore()
    },
  })

classRegistry.setClass(ElbowConnector, 'ElbowConnector')
classRegistry.setClass(ElbowConnector, 'elbowconnector')

/** Create an elbow connector from `start` to `end` with no attachments. */
export const createElbowConnector = (
  canvas: Canvas,
  start: XY,
  end: XY,
  attachments: Record<number, ConnectionPoint | null> = { 0: null, 1: null }
) => {
  const connector = new ElbowConnector(
    [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ],
    { endpointConnections: attachments } as never
  )
  connector.reroute(canvas)
  return connector
}
