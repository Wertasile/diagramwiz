/**
 * Pure orthogonal connector router (no Fabric imports).
 *
 * Builds a sparse visibility grid from stub points and padded obstacle edges, then runs
 * A* with a bend penalty so routes are short, have few corners, and go around obstacles.
 */

export type XY = { x: number; y: number }
export type Side = 'top' | 'right' | 'bottom' | 'left'
export type Rect = { left: number; top: number; right: number; bottom: number }
/** `count` = number of route points when the user adjusted it (so stale offsets are ignored). */
export type ManualSegment = { index: number; axis: 'x' | 'y'; value: number; count?: number }

export type RouteInput = {
  start: XY
  startDir: Side
  end: XY
  /** null = free end (cursor drag): any approach direction is fine. */
  endDir: Side | null
  /** Already padded world rects the route must not cross. */
  obstacles: Rect[]
  manual?: ManualSegment[]
  /** While the user is dragging a segment, skip the obstacle check on manual offsets. */
  trustManual?: boolean
  stub?: number
}

export const DEFAULT_STUB = 20
export const OBSTACLE_PAD = 16
export const ENDPOINT_PAD = 4
const BEND_PENALTY = 40
const EPS = 0.01

const DIR_INDEX: Record<Side, number> = { top: 0, right: 1, bottom: 2, left: 3 }
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

export const sideVector = (side: Side): XY => ({ x: DX[DIR_INDEX[side]], y: DY[DIR_INDEX[side]] })

export const padRect = (rect: Rect, pad: number): Rect => ({
  left: rect.left - pad,
  top: rect.top - pad,
  right: rect.right + pad,
  bottom: rect.bottom + pad,
})

export const rectFromBounds = (b: { left: number; top: number; width: number; height: number }): Rect => ({
  left: b.left,
  top: b.top,
  right: b.left + b.width,
  bottom: b.top + b.height,
})

/** True when an axis-aligned segment passes through the interior of the rect. */
const segmentHitsRect = (a: XY, b: XY, r: Rect): boolean => {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return maxX > r.left + EPS && minX < r.right - EPS && maxY > r.top + EPS && minY < r.bottom - EPS
}

export const segmentBlocked = (a: XY, b: XY, obstacles: Rect[]) => obstacles.some((r) => segmentHitsRect(a, b, r))

const uniqueSorted = (values: number[]) => {
  const sorted = [...values].sort((p, q) => p - q)
  const out: number[] = []
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(out[out.length - 1] - v) > EPS) out.push(v)
  }
  return out
}

const indexOfValue = (arr: number[], v: number) => {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (Math.abs(arr[mid] - v) <= EPS) return mid
    if (arr[mid] < v) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

class MinHeap {
  private items: { key: number; value: number }[] = []
  get size() {
    return this.items.length
  }
  push(key: number, value: number) {
    const items = this.items
    items.push({ key, value })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].key <= items[i].key) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let smallest = i
        if (l < items.length && items[l].key < items[smallest].key) smallest = l
        if (r < items.length && items[r].key < items[smallest].key) smallest = r
        if (smallest === i) break
        ;[items[smallest], items[i]] = [items[i], items[smallest]]
        i = smallest
      }
    }
    return top
  }
}

/** Remove duplicate and collinear interior points (keeps first and last). */
export const simplifyRoute = (points: XY[]): XY[] => {
  const dedup: XY[] = []
  for (const p of points) {
    const prev = dedup[dedup.length - 1]
    if (!prev || Math.abs(prev.x - p.x) > EPS || Math.abs(prev.y - p.y) > EPS) dedup.push(p)
  }
  if (dedup.length <= 2) return dedup
  const out: XY[] = [dedup[0]]
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1]
    const b = dedup[i]
    const c = dedup[i + 1]
    const collinearX = Math.abs(a.x - b.x) <= EPS && Math.abs(b.x - c.x) <= EPS
    const collinearY = Math.abs(a.y - b.y) <= EPS && Math.abs(b.y - c.y) <= EPS
    if (collinearX || collinearY) continue
    out.push(b)
  }
  out.push(dedup[dedup.length - 1])
  return out
}

const simpleRoute = (start: XY, sPt: XY, ePt: XY, end: XY, startDir: Side): XY[] => {
  const horizontalStart = startDir === 'left' || startDir === 'right'
  const corner = horizontalStart ? { x: ePt.x, y: sPt.y } : { x: sPt.x, y: ePt.y }
  return simplifyRoute([start, sPt, corner, ePt, end])
}

const astar = (
  sPt: XY,
  startDir: Side,
  ePt: XY,
  approachDir: number | null,
  obstacles: Rect[],
  extraXs: number[],
  extraYs: number[]
): XY[] | null => {
  const xs = uniqueSorted([
    sPt.x,
    ePt.x,
    (sPt.x + ePt.x) / 2,
    ...extraXs,
    ...obstacles.flatMap((r) => [r.left, r.right]),
  ])
  const ys = uniqueSorted([
    sPt.y,
    ePt.y,
    (sPt.y + ePt.y) / 2,
    ...extraYs,
    ...obstacles.flatMap((r) => [r.top, r.bottom]),
  ])
  const H = ys.length
  const sx = indexOfValue(xs, sPt.x)
  const sy = indexOfValue(ys, sPt.y)
  const ex = indexOfValue(xs, ePt.x)
  const ey = indexOfValue(ys, ePt.y)
  if (sx < 0 || sy < 0 || ex < 0 || ey < 0) return null

  const stateId = (xi: number, yi: number, d: number) => (xi * H + yi) * 4 + d
  const best = new Map<number, number>()
  const parent = new Map<number, number>()

  const heap = new MinHeap()
  const startD = DIR_INDEX[startDir]
  const startState = stateId(sx, sy, startD)
  best.set(startState, 0)
  heap.push(Math.abs(xs[sx] - xs[ex]) + Math.abs(ys[sy] - ys[ey]), startState)

  const closed = new Set<number>()
  let goalState = -1

  while (heap.size > 0) {
    const { value: state } = heap.pop()
    if (closed.has(state)) continue
    closed.add(state)

    const d = state % 4
    const node = (state - d) / 4
    const yi = node % H
    const xi = (node - yi) / H
    const g = best.get(state)!

    if (xi === ex && yi === ey) {
      // Arriving against the required approach direction costs an extra bend.
      if (approachDir === null || d === approachDir) {
        goalState = state
        break
      }
    }

    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue // no U-turns
      const nx = xi + DX[nd]
      const ny = yi + DY[nd]
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= H) continue
      const a = { x: xs[xi], y: ys[yi] }
      const b = { x: xs[nx], y: ys[ny] }
      if (segmentBlocked(a, b, obstacles)) continue

      const cost = g + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (nd !== d ? BEND_PENALTY : 0)
      const nState = stateId(nx, ny, nd)
      if (cost < (best.get(nState) ?? Infinity)) {
        best.set(nState, cost)
        parent.set(nState, state)
        heap.push(cost + Math.abs(xs[nx] - xs[ex]) + Math.abs(ys[ny] - ys[ey]), nState)
      }
    }
  }

  // Goal reached with the wrong heading: accept the cheapest heading with a bend instead.
  if (goalState < 0 && approachDir !== null) {
    let bestCost = Infinity
    for (let d = 0; d < 4; d++) {
      const s = stateId(ex, ey, d)
      const c = best.get(s)
      if (c !== undefined && c + BEND_PENALTY < bestCost) {
        bestCost = c + BEND_PENALTY
        goalState = s
      }
    }
  }
  if (goalState < 0) return null

  const nodes: XY[] = []
  let cur: number | undefined = goalState
  while (cur !== undefined) {
    const d = cur % 4
    const node = (cur - d) / 4
    const yi = node % H
    const xi = (node - yi) / H
    nodes.push({ x: xs[xi], y: ys[yi] })
    cur = parent.get(cur)
  }
  return nodes.reverse()
}

/** Apply user-dragged segment offsets; returns null when they no longer fit. */
const applyManual = (
  points: XY[],
  manual: ManualSegment[],
  obstacles: Rect[],
  startDir: Side,
  endDir: Side | null,
  trust: boolean
): XY[] | null => {
  const next = points.map((p) => ({ ...p }))
  let applied = false
  for (const m of manual) {
    if (m.count !== undefined && m.count !== points.length) return null
    const i = m.index
    // Only middle segments are adjustable (first/last stay glued to their ports).
    if (i < 1 || i > next.length - 3) return null
    const a = next[i]
    const b = next[i + 1]
    const vertical = Math.abs(a.x - b.x) <= EPS
    const horizontal = Math.abs(a.y - b.y) <= EPS
    if (m.axis === 'x' && !vertical) return null
    if (m.axis === 'y' && !horizontal) return null
    if (m.axis === 'x') {
      a.x = m.value
      b.x = m.value
    } else {
      a.y = m.value
      b.y = m.value
    }
    applied = true
  }
  if (!applied) return null

  // Stubs must keep leaving / entering their ports in the right direction.
  const first = { x: next[1].x - next[0].x, y: next[1].y - next[0].y }
  const sv = sideVector(startDir)
  if (first.x * sv.x + first.y * sv.y < -EPS) return null
  if (endDir) {
    const last = next[next.length - 1]
    const prev = next[next.length - 2]
    const ev = sideVector(endDir)
    const into = { x: prev.x - last.x, y: prev.y - last.y }
    if (into.x * ev.x + into.y * ev.y < -EPS) return null
  }

  if (!trust) {
    for (let i = 0; i < next.length - 1; i++) {
      // Only check segments that are not glued to the endpoints' own stubs.
      if (i === 0 || i === next.length - 2) continue
      if (segmentBlocked(next[i], next[i + 1], obstacles)) return null
    }
  }
  return next
}

export const routeOrthogonal = (input: RouteInput): XY[] => {
  const { start, startDir, end, endDir, obstacles, manual } = input
  const stub = input.stub ?? DEFAULT_STUB

  // Straight line when ports face each other and share an axis.
  if (endDir && DIR_INDEX[endDir] === (DIR_INDEX[startDir] + 2) % 4) {
    const horizontal = startDir === 'left' || startDir === 'right'
    const aligned = horizontal ? Math.abs(start.y - end.y) <= 1 : Math.abs(start.x - end.x) <= 1
    const sv = sideVector(startDir)
    const forward = (end.x - start.x) * sv.x + (end.y - start.y) * sv.y > 0
    if (aligned && forward && !segmentBlocked(start, end, obstacles)) {
      return [start, end]
    }
  }

  const sv = sideVector(startDir)
  const sPt = { x: start.x + sv.x * stub, y: start.y + sv.y * stub }
  let ePt = { ...end }
  let approachDir: number | null = null
  if (endDir) {
    const ev = sideVector(endDir)
    ePt = { x: end.x + ev.x * stub, y: end.y + ev.y * stub }
    // Heading needed to travel from ePt into the end port.
    approachDir = (DIR_INDEX[endDir] + 2) % 4
  }

  const path = astar(sPt, startDir, ePt, approachDir, obstacles, [start.x, end.x], [start.y, end.y])
  const route = path
    ? simplifyRoute(endDir ? [start, ...path, end] : [start, ...path])
    : simpleRoute(start, sPt, ePt, end, startDir)

  if (manual && manual.length > 0) {
    // Not simplified on purpose: collapsing points would shift segment indices.
    const adjusted = applyManual(route, manual, obstacles, startDir, endDir, input.trustManual === true)
    if (adjusted) return adjusted
  }
  return route
}

/** Segments the user may drag: all but the first and last. */
export const adjustableSegmentIndices = (points: XY[]): number[] => {
  const out: number[] = []
  for (let i = 1; i <= points.length - 3; i++) out.push(i)
  return out
}
