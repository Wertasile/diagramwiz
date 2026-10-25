'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type EraserOptionsProps = {
  width: number
  onWidthChange: (value: number) => void
  /** "Restore" paints erased areas back instead of erasing */
  restore: boolean
  onRestoreChange: (value: boolean) => void
  removeFullyErased: boolean
  onRemoveFullyErasedChange: (value: boolean) => void
}

/** Floating options bar shown while the eraser tool is active. */
export default function EraserOptions({
  width,
  onWidthChange,
  restore,
  onRestoreChange,
  removeFullyErased,
  onRemoveFullyErasedChange,
}: EraserOptionsProps) {
  return (
    <div
      role="group"
      aria-label="Eraser options"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 border-[3px] border-black px-3 py-2 text-sm shadow-md"
      style={{background: `color-mix(in oklch, var(--muted) 35%, transparent)`}}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="eraser-size">Size</Label>
        <input
          id="eraser-size"
          type="range"
          min={2}
          max={80}
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          className="w-28 accent-primary"
        />
        <span className="w-6 text-muted-foreground tabular-nums">{width}</span>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="eraser-restore">Restore</Label>
        <Switch
          id="eraser-restore"
          size="sm"
          checked={restore}
          onCheckedChange={onRestoreChange}
        />
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="eraser-remove">Remove fully erased</Label>
        <Switch
          id="eraser-remove"
          size="sm"
          disabled={restore}
          checked={removeFullyErased}
          onCheckedChange={onRemoveFullyErasedChange}
        />
      </div>
    </div>
  )
}