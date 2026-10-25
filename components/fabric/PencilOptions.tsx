'use client'

import { Label } from '@/components/ui/label'

type PencilOptionsProps = {
  width: number
  onWidthChange: (value: number) => void
  color: string
  onColorChange: (value: string) => void
}

/** Floating options bar shown while the pencil (free-draw) tool is active. */
export default function PencilOptions({
  width,
  onWidthChange,
  color,
  onColorChange,
}: PencilOptionsProps) {
  return (
    <div
      role="group"
      aria-label="Pencil options"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 border-[3px] border-black px-3 py-2 text-sm shadow-md"
      style={{background: `color-mix(in oklch, var(--muted) 35%, transparent)`}}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="pencil-size">Size</Label>
        <input
          id="pencil-size"
          type="range"
          min={1}
          max={48}
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          className="w-28 accent-primary"
        />
        <span className="w-6 text-muted-foreground tabular-nums">{width}</span>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="pencil-color">Color</Label>
        <input
          id="pencil-color"
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-7 w-8 cursor-pointer rounded border bg-transparent p-0"
        />
      </div>
    </div>
  )
}
