'use client'

import React, { useEffect, useState } from 'react'
import { Canvas, Point } from 'fabric'
import { Minus, MoveRight, MoveLeft, ArrowLeftRight, Ban, Spline, CornerDownRight, Slash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  type ElbowConnector,
  type HeadKind,
  type RouteType,
} from '@/components/fabric-helper/connectors/elbow-connector'
import styles from './flowchart-text-menu.module.css'

type Props = { canvas: Canvas; connector: ElbowConnector }
type Panel = 'dash' | 'head' | 'route' | 'dir' | null

const DASHES: { id: string; label: string; value: number[] | null }[] = [
  { id: 'solid', label: 'Solid', value: null },
  { id: 'dashed', label: 'Dashed', value: [10, 6] },
  { id: 'dotted', label: 'Dotted', value: [2, 6] },
]

const HEADS: { id: HeadKind; glyph: string; label: string }[] = [
  { id: 'none', glyph: '—', label: 'No head' },
  { id: 'arrow', glyph: '←', label: 'Arrow' },
  { id: 'triangle', glyph: '◀', label: 'Filled triangle' },
  { id: 'triangleOpen', glyph: '◁', label: 'Open triangle' },
  { id: 'circle', glyph: '○', label: 'Circle' },
  { id: 'diamond', glyph: '◇', label: 'Diamond' },
]

const ROUTES: { id: RouteType; label: string; Icon: typeof Spline }[] = [
  { id: 'elbow', label: 'Elbow', Icon: CornerDownRight },
  { id: 'curve', label: 'Curved', Icon: Spline },
  { id: 'straight', label: 'Straight', Icon: Slash },
]

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 4,
  padding: 4,
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--popover)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
}

function ConnectorMenu({ canvas, connector }: Props) {
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [panel, setPanel] = useState<Panel>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const update = () => {
      const r = connector.getBoundingRect()
      const vt = canvas.viewportTransform
      const tl = new Point(r.left, r.top).transform(vt)
      const bounds = canvas.upperCanvasEl.getBoundingClientRect()
      setPosition({
        left: bounds.left + tl.x + (r.width * vt[0]) / 2,
        top: bounds.top + tl.y - 28,
      })
    }
    update()
    canvas.on('after:render', update)
    return () => {
      canvas.off('after:render', update)
    }
  }, [canvas, connector])

  const commit = (mutate: () => void) => {
    mutate()
    connector.set('dirty', true)
    canvas.requestRenderAll()
    canvas.fire('object:modified', { target: connector })
    setTick((n) => n + 1)
  }

  const stroke = typeof connector.stroke === 'string' ? connector.stroke : '#000000'
  const dash = connector.strokeDashArray
  const dashId = !dash || dash.length === 0 ? 'solid' : dash[0] <= 3 ? 'dotted' : 'dashed'
  const dir =
    connector.startHead !== 'none' && connector.endHead !== 'none'
      ? 'double'
      : connector.endHead !== 'none' || connector.startHead !== 'none'
        ? 'single'
        : 'none'

  const setDirection = (mode: 'single' | 'double' | 'none') =>
    commit(() => {
      if (mode === 'none') {
        connector.startHead = 'none'
        connector.endHead = 'none'
      } else if (mode === 'single') {
        connector.startHead = 'none'
        connector.endHead = connector.endHead === 'none' ? 'arrow' : connector.endHead
      } else {
        connector.startHead = connector.startHead === 'none' ? 'arrow' : connector.startHead
        connector.endHead = connector.endHead === 'none' ? 'arrow' : connector.endHead
      }
    })

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p))

  return (
    <div
      className={styles.menu}
      style={{ left: position.left, top: position.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <label className={styles.field} title="Colour">
        <input
          type="color"
          className={styles.colorInput}
          value={stroke}
          onChange={(e) => commit(() => connector.set('stroke', e.target.value))}
        />
      </label>

      <label className={styles.field} title="Weight">
        <input
          type="number"
          min={1}
          max={16}
          value={connector.strokeWidth ?? 2}
          style={{ width: 44, background: 'transparent', color: 'inherit', fontSize: 12 }}
          onChange={(e) =>
            commit(() => connector.set('strokeWidth', Math.max(1, Number(e.target.value) || 1)))
          }
        />
      </label>

      <div className={styles.divider} />

      <div style={{ position: 'relative' }}>
        <Button type="button" variant={panel === 'dash' ? 'secondary' : 'ghost'} size="icon-xs" title="Line style" onClick={() => toggle('dash')}>
          <Minus />
        </Button>
        {panel === 'dash' && (
          <div style={popoverStyle}>
            {DASHES.map((d) => (
              <Button
                key={d.id}
                type="button"
                variant={dashId === d.id ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => commit(() => connector.set('strokeDashArray', d.value))}
              >
                {d.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <Button type="button" variant={panel === 'head' ? 'secondary' : 'ghost'} size="icon-xs" title="Start head" onClick={() => toggle('head')}>
          <MoveLeft />
        </Button>
        {panel === 'head' && (
          <div style={popoverStyle}>
            {HEADS.map((h) => (
              <Button
                key={h.id}
                type="button"
                variant={connector.startHead === h.id ? 'secondary' : 'ghost'}
                size="icon-xs"
                title={h.label}
                onClick={() => commit(() => (connector.startHead = h.id))}
              >
                {h.glyph}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <Button type="button" variant={panel === 'route' ? 'secondary' : 'ghost'} size="icon-xs" title="Line type" onClick={() => toggle('route')}>
          {React.createElement((ROUTES.find((r) => r.id === connector.routeType) ?? ROUTES[0]).Icon)}
        </Button>
        {panel === 'route' && (
          <div style={popoverStyle}>
            {ROUTES.map(({ id, label, Icon }) => (
              <Button
                key={id}
                type="button"
                variant={connector.routeType === id ? 'secondary' : 'ghost'}
                size="icon-xs"
                title={label}
                onClick={() => commit(() => connector.setRouteType(canvas, id))}
              >
                <Icon />
              </Button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <Button type="button" variant={panel === 'dir' ? 'secondary' : 'ghost'} size="icon-xs" title="Arrows" onClick={() => toggle('dir')}>
          {dir === 'double' ? <ArrowLeftRight /> : dir === 'single' ? <MoveRight /> : <Ban />}
        </Button>
        {panel === 'dir' && (
          <div style={popoverStyle}>
            <Button type="button" variant={dir === 'single' ? 'secondary' : 'ghost'} size="icon-xs" title="Single arrow" onClick={() => setDirection('single')}>
              <MoveRight />
            </Button>
            <Button type="button" variant={dir === 'double' ? 'secondary' : 'ghost'} size="icon-xs" title="Double arrow" onClick={() => setDirection('double')}>
              <ArrowLeftRight />
            </Button>
            <Button type="button" variant={dir === 'none' ? 'secondary' : 'ghost'} size="icon-xs" title="No arrows" onClick={() => setDirection('none')}>
              <Ban />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConnectorMenu
