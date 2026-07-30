'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/seperator'
import { SettingsIcon, Focus, RotateCcw } from 'lucide-react'
import { Canvas } from 'fabric'
import React, { useEffect, useState } from 'react'
import {
  type PlaygroundSettings,
  DEFAULT_PLAYGROUND_SETTINGS,
} from '@/components/fabric-helper/playground-settings'
import { resetViewport, zoomToFitContent } from '@/components/fabric-helper/viewport'

type SettingsProps = {
  canvas: Canvas
  settings: PlaygroundSettings
  onSettingsChange: (next: PlaygroundSettings) => void
}

function SettingRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string
  htmlFor?: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description ? (
          <p className="text-xs text-muted-foreground leading-snug">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Settings({ canvas, settings, onSettingsChange }: SettingsProps) {
  const [zoomPercent, setZoomPercent] = useState(() => Math.round(canvas.getZoom() * 100))

  useEffect(() => {
    const syncZoom = () => setZoomPercent(Math.round(canvas.getZoom() * 100))
    syncZoom()
    canvas.on('after:render', syncZoom)
    return () => {
      canvas.off('after:render', syncZoom)
    }
  }, [canvas])

  const patch = (partial: Partial<PlaygroundSettings>) => {
    onSettingsChange({ ...settings, ...partial })
  }

  const handleResetDefaults = () => {
    onSettingsChange({ ...DEFAULT_PLAYGROUND_SETTINGS })
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Settings" title="Settings">
            <SettingsIcon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Canvas preferences for this playground. Changes save automatically in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(70vh,520px)] space-y-5 overflow-y-auto px-4 pb-2">
          <section className="space-y-3">
            <h3 className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Canvas
            </h3>
            <SettingRow
              label="Show grid"
              htmlFor="setting-grid"
              description="Dot grid behind the infinite canvas"
            >
              <Switch
                id="setting-grid"
                size="sm"
                checked={settings.showGrid}
                onCheckedChange={(checked) => patch({ showGrid: checked })}
              />
            </SettingRow>
            <SettingRow
              label="Grid size"
              htmlFor="setting-grid-size"
              description="Spacing between dots (px)"
            >
              <Input
                id="setting-grid-size"
                className="h-7 w-20"
                type="number"
                min={8}
                max={64}
                disabled={!settings.showGrid}
                value={settings.gridSize}
                onChange={(e) => patch({ gridSize: Number(e.target.value) })}
              />
            </SettingRow>
            <SettingRow
              label="Show minimap"
              htmlFor="setting-minimap"
              description="Overview map in the corner"
            >
              <Switch
                id="setting-minimap"
                size="sm"
                checked={settings.showMinimap}
                onCheckedChange={(checked) => patch({ showMinimap: checked })}
              />
            </SettingRow>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Editing
            </h3>
            <SettingRow
              label="Connector snap"
              htmlFor="setting-snap"
              description="Snap line endpoints to shape midpoints"
            >
              <Switch
                id="setting-snap"
                size="sm"
                checked={settings.connectorSnap}
                onCheckedChange={(checked) => patch({ connectorSnap: checked })}
              />
            </SettingRow>
            <SettingRow
              label="Snap distance"
              htmlFor="setting-snap-distance"
              description="How close endpoints must be to snap"
            >
              <Input
                id="setting-snap-distance"
                className="h-7 w-20"
                type="number"
                min={0}
                max={40}
                disabled={!settings.connectorSnap}
                value={settings.snapDistance}
                onChange={(e) => patch({ snapDistance: Number(e.target.value) })}
              />
            </SettingRow>
            <SettingRow
              label="Brush width"
              htmlFor="setting-brush"
              description="Stroke width for freehand draw"
            >
              <Input
                id="setting-brush"
                className="h-7 w-20"
                type="number"
                min={1}
                max={24}
                value={settings.brushWidth}
                onChange={(e) => patch({ brushWidth: Number(e.target.value) })}
              />
            </SettingRow>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Viewport
            </h3>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Current zoom</span>
              <span className="tabular-nums font-medium">{zoomPercent}%</span>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => resetViewport(canvas)}
              >
                <RotateCcw />
                Reset view (100%)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => zoomToFitContent(canvas)}
              >
                <Focus />
                Zoom to fit content
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Scroll to zoom. Space + drag or middle-mouse to pan.
            </p>
          </section>
        </div>

        <DialogFooter className="border-t border-border p-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={handleResetDefaults}>
            Restore defaults
          </Button>
          <DialogClose render={<Button type="button" size="sm">Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
