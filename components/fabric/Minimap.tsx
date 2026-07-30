'use client'

import React, { useEffect, useRef } from 'react'
import { Canvas, FabricObject, Point } from 'fabric'
import { getVisibleWorldRect } from '@/components/fabric-helper/viewport'
import styles from './minimap.module.css'

const DEFAULT_WORLD = 4000 // fallback world extent when canvas is empty
const PAD = 80

type MinimapProps = {
  canvas: Canvas
  size?: number
}

function isGuideline(object: FabricObject) {
  const id = (object as FabricObject & { id?: string }).id ?? ''
  return (
    id.startsWith('vertical') ||
    id.startsWith('horizontal') ||
    id.startsWith('__pen-')
  )
}

function getWorldBounds(canvas: Canvas) {
  const objects = canvas.getObjects().filter((o) => !isGuideline(o))
  if (objects.length === 0) {
    const half = DEFAULT_WORLD / 2
    return { left: -half, top: -half, width: DEFAULT_WORLD, height: DEFAULT_WORLD }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const obj of objects) {
    const bound = obj.getBoundingRect()
    minX = Math.min(minX, bound.left)
    minY = Math.min(minY, bound.top)
    maxX = Math.max(maxX, bound.left + bound.width)
    maxY = Math.max(maxY, bound.top + bound.height)
  }

  // Always include origin-ish working area so empty corners aren't confusing
  minX = Math.min(minX, -PAD)
  minY = Math.min(minY, -PAD)
  maxX = Math.max(maxX, PAD)
  maxY = Math.max(maxY, PAD)

  return {
    left: minX - PAD,
    top: minY - PAD,
    width: maxX - minX + PAD * 2,
    height: maxY - minY + PAD * 2,
  }
}

function Minimap({ canvas, size = 75 }: MinimapProps) {
  const miniRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = miniRef.current
    if (!el) return

    const ctx = el.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    el.width = size * dpr
    el.height = size * dpr
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const draw = () => {
      const world = getWorldBounds(canvas)
      const scale = Math.min(size / world.width, size / world.height)
      const offsetX = (size - world.width * scale) / 2
      const offsetY = (size - world.height * scale) / 2

      const toMini = (x: number, y: number) => ({
        x: (x - world.left) * scale + offsetX,
        y: (y - world.top) * scale + offsetY,
      })

      ctx.clearRect(0, 0, size, size)
      const isDark = document.documentElement.classList.contains('dark')
      ctx.fillStyle = isDark ? 'rgba(33, 37, 43, 0.95)' : 'rgba(243, 239, 230, 0.95)'
      ctx.fillRect(0, 0, size, size)

      // objects
      for (const obj of canvas.getObjects()) {
        if (isGuideline(obj)) continue
        const bound = obj.getBoundingRect()
        const p = toMini(bound.left, bound.top)
        const w = Math.max(2, bound.width * scale)
        const h = Math.max(2, bound.height * scale)
        ctx.fillStyle = isDark ? 'rgba(220, 220, 220, 0.55)' : 'rgba(40, 40, 40, 0.55)'
        ctx.fillRect(p.x, p.y, w, h)
      }

      // viewport
      const view = getVisibleWorldRect(canvas)
      const tl = toMini(view.left, view.top)
      const vw = Math.max(4, view.width * scale)
      const vh = Math.max(4, view.height * scale)
      ctx.strokeStyle = isDark ? 'rgba(96, 165, 250, 0.95)' : 'rgba(37, 99, 235, 0.9)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(tl.x, tl.y, vw, vh)
    }

    const onClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const world = getWorldBounds(canvas)
      const scale = Math.min(size / world.width, size / world.height)
      const offsetX = (size - world.width * scale) / 2
      const offsetY = (size - world.height * scale) / 2

      const worldX = (mx - offsetX) / scale + world.left
      const worldY = (my - offsetY) / scale + world.top

      const zoom = canvas.getZoom()
      // Center the main view on the clicked world point
      canvas.absolutePan(
        new Point(
          worldX * zoom - canvas.getWidth() / 2,
          worldY * zoom - canvas.getHeight() / 2
        )
      )
      draw()
    }

    draw()
    canvas.on('after:render', draw)
    canvas.on('object:added', draw)
    canvas.on('object:removed', draw)
    canvas.on('object:modified', draw)
    el.addEventListener('click', onClick)

    const themeObserver = new MutationObserver(draw)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      canvas.off('after:render', draw)
      canvas.off('object:added', draw)
      canvas.off('object:removed', draw)
      canvas.off('object:modified', draw)
      el.removeEventListener('click', onClick)
      themeObserver.disconnect()
    }
  }, [canvas, size])

  return (
    <canvas
      ref={miniRef}
      className={styles.minimap}
      width={size}
      height={size}
      aria-label="Canvas minimap"
    />
  )
}

export default Minimap
