"use client"

// utility that creates eraser brush and applies erasable defaults to objects


import { ActiveSelection, Canvas, FabricObject, Group } from 'fabric'
import { EraserBrush } from '@erase2d/fabric'
import { useEffect, useState } from 'react'

export type Erasable = boolean | 'deep'

// Make `erasable` part of toObject() / toJSON() / clone(), so it survives
// save + load and the Layers "Duplicate" action. Guarded so Next.js hot reload
// does not add it twice.
if (!FabricObject.customProperties.includes('erasable')) {
  FabricObject.customProperties = [...FabricObject.customProperties, 'erasable']
}

/** Set `erasable` on objects and let the sidebar / layers panel know. */
export function setErasable(
  canvas: Canvas,
  objects: FabricObject[],
  value: Erasable
) {
  for (const object of objects) {
    object.set('erasable', value)
    canvas.fire('object:modified', { target: object })
  }
  canvas.requestRenderAll()
}

/**
 * Give every object that is added to the canvas an `erasable` value unless it
 * already has one (so saved diagrams and explicit choices are never overridden).
 * Freehand strokes, shapes and flowchart nodes all come through here, so none
 * of your add* functions need to know about erasing.
 * @param isProtected objects that should start out NOT erasable (crop frames, guides...)
 * @returns call to unsubscribe
 */
export function applyErasableDefaults(
  canvas: Canvas,
  isProtected: (object: FabricObject) => boolean = () => false
) {
  const onAdded = ({ target }: { target: FabricObject }) => {
    if (target.erasable === undefined) {
      target.set('erasable', !isProtected(target))
    }
  }
  canvas.on('object:added', onAdded)
  return () => canvas.off('object:added', onAdded)
}

// A real parent group, not the temporary ActiveSelection Fabric uses for multi-select.
const realParent = (object: FabricObject): Group | undefined =>
  object.group && !(object.group instanceof ActiveSelection)
    ? object.group
    : undefined

/** Alpha (0-255) at or below this counts as erased. Antialiasing leaves faint
 *  pixels behind a stroke, so requiring exactly 0 would rarely ever match. */
const INVISIBLE_ALPHA = 12
/** Longest side (px) we rasterize when checking; big objects are scaled down. */
const MAX_CHECK_SIDE = 512

/**
 * True when nothing of `object` is visible any more. Same idea as erase2d's
 * isTransparent(), but tolerant of faint antialiasing residue and safe for
 * empty groups. Any failure counts as "still visible" so we never delete by mistake.
 */
function hasNothingVisible(object: FabricObject): boolean {
  try {
    const longest = Math.max(
      object.width + object.strokeWidth,
      object.height + object.strokeWidth
    )
    const canvas = object.toCanvasElement({
      enableRetinaScaling: false,
      viewportTransform: false,
      withoutTransform: true,
      withoutShadow: true,
      multiplier: longest > MAX_CHECK_SIDE ? MAX_CHECK_SIDE / longest : 1,
    })
    if (canvas.width === 0 || canvas.height === 0) return true
    const { data } = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > INVISIBLE_ALPHA) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Remove every object in `objects` whose pixels are all transparent after erasing.
 * Children of 'deep' groups are removed from their group, and a group whose
 * children are all gone (or fully transparent) is removed too.
 * @returns the removed objects
 */
export async function removeFullyErased(
  canvas: Canvas,
  objects: FabricObject[]
): Promise<FabricObject[]> {
  const removed: FabricObject[] = []
  const parents = new Set<Group>()

  const onCanvas = new Set(canvas.getObjects())

  for (const object of objects) {
    const parent = realParent(object)
    // commit() also returns erasable background/overlay images: never delete those.
    if (!parent && !onCanvas.has(object)) continue
    if (!hasNothingVisible(object)) continue
    if (parent) {
      parent.remove(object)
      parents.add(parent)
    } else {
      canvas.remove(object)
    }
    removed.push(object)
  }

  let level = [...parents]
  while (level.length > 0) {
    const next = new Set<Group>()
    for (const group of level) {
      if (group.size() > 0 && !hasNothingVisible(group)) continue
      const parent = realParent(group)
      if (parent) {
        parent.remove(group)
        next.add(parent)
      } else {
        canvas.remove(group)
      }
      removed.push(group)
    }
    level = [...next]
  }

  if (removed.length > 0) canvas.requestRenderAll()
  return removed
}

export type EraserHandle = {
  eraser: EraserBrush
  /** Call when leaving eraser mode / unmounting (frees the offscreen effect canvas). */
  dispose: () => void
}

export function createEraser(
  canvas: Canvas,
  options: {
    width: number
    /** true = "restore" brush that paints erased areas back */
    inverted: boolean
    /** read at the end of every stroke, so a React ref works well here */
    shouldRemoveFullyErased: () => boolean
  }
): EraserHandle {
  const eraser = new EraserBrush(canvas)
  eraser.width = options.width
  eraser.inverted = options.inverted

  const offEnd = eraser.on('end', (event) => {
    // We commit ourselves so we can clean up afterwards.
    event.preventDefault()
    const { path, targets } = event.detail

    void (async () => {
      // erase2d's live preview skips invisible objects but its commit does not,
      // so hidden layers would be erased silently. Leave them alone.
      const visibleTargets = targets.filter((object) => !object.isNotVisible())
      const erased = await eraser.commit({ path, targets: visibleTargets })

      if (!eraser.inverted && options.shouldRemoveFullyErased()) {
        await removeFullyErased(canvas, [...erased.keys()])
      }
      canvas.requestRenderAll()
    })().catch((error) => console.error('[eraser] commit failed', error))
  })

  return {
    eraser,
    dispose: () => {
      offEnd()
      eraser.dispose()
    },
  }
}

// --------------------------- CURSOR FOR ERASER MODE ---------------------------



export const eraserBrushCursorUrl = (eraserWidth: number): string => {
  const size = Math.max(2, Math.round(eraserWidth));

  const cursorSvg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${size}" height="${size}"
         viewBox="0 0 ${size} ${size}">
      <circle
        cx="${size / 2}"
        cy="${size / 2}"
        r="${Math.max(0.5, size / 2 - 1)}"
        fill="white"
        fill-opacity="0.25"
        stroke="black"
        stroke-width="1.5"
      />
    </svg>
  `;

  return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") ${size / 2} ${size / 2}, crosshair`;
};

/** Pencil tip cursor for free-draw mode. Hotspot is near the tip. */
export const pencilBrushCursorUrl = (color = '#171717'): string => {
  const stroke = color.replace(/"/g, '')
  const cursorSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 21l3.75-.75L19.5 7.5a2.121 2.121 0 0 0-3-3L3.75 17.25 3 21z"
        fill="${stroke}"
        fill-opacity="0.85"
        stroke="#fff"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
      <path d="M14.5 5.5l3 3" stroke="#fff" stroke-width="1.25" stroke-linecap="round"/>
    </svg>
  `
  // Tip sits near bottom-left of the glyph
  return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") 2 22, crosshair`
}
