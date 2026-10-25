'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type PenOptionsProps = {
  strokeWidth: number
  onStrokeWidthChange: (value: number) => void
  strokeColor: string
  onStrokeColorChange: (value: string) => void
  fillColor: string
  onFillColorChange: (value: string) => void
  /** When false, fill is transparent */
  useFill: boolean
  onUseFillChange: (value: boolean) => void
}

/** Floating options bar shown while the polygon pen tool is active. */
export default function PenOptions({
  strokeWidth,
  onStrokeWidthChange,
  strokeColor,
  onStrokeColorChange,
  fillColor,
  onFillColorChange,
  useFill,
  onUseFillChange,
}: PenOptionsProps) {
  return (
    <div
      role="group"
      aria-label="Pen options"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 border-[3px] border-black px-3 py-2 text-sm shadow-md"
      style={{background: `color-mix(in oklch, var(--muted) 35%, transparent)`}}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="pen-stroke-width">Stroke</Label>
        <input
          id="pen-stroke-width"
          type="range"
          min={1}
          max={24}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="w-28 accent-primary"
        />
        <span className="w-6 text-muted-foreground tabular-nums">{strokeWidth}</span>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="pen-stroke-color">Color</Label>
        <input
          id="pen-stroke-color"
          type="color"
          value={strokeColor}
          onChange={(e) => onStrokeColorChange(e.target.value)}
          className="h-7 w-8 cursor-pointer rounded border bg-transparent p-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="pen-use-fill">Fill</Label>
        <Switch
          id="pen-use-fill"
          size="sm"
          checked={useFill}
          onCheckedChange={onUseFillChange}
        />
        <input
          id="pen-fill-color"
          type="color"
          value={fillColor}
          disabled={!useFill}
          onChange={(e) => onFillColorChange(e.target.value)}
          className="h-7 w-8 cursor-pointer rounded border bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
    </div>
  )
}
