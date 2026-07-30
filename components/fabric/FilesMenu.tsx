'use client'

import React, { useEffect, useState } from 'react'
import { Canvas, FabricObject, Polyline } from 'fabric'
import { Menu } from '@base-ui/react/menu'
import {
  ChevronDown,
  Download,
  FileJson,
  FolderOpen,
  ImageDown,
  ImagePlus,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  clearCanvasContent,
  exportCanvasAsJson,
  importCanvasFromJsonFile,
  importImageFile,
  pickFile,
  registerCanvasCustomProperties,
} from '@/components/fabric-helper/canvas-io'
import {
  exportObjectAsPng,
  exportWorkedAreaAsPng,
  isCropFrame,
} from '@/components/fabric-helper/export-utils'

type FilesMenuProps = {
  canvas: Canvas
  onCanvasChanged?: () => void
  onConnectorEndpointDrag?: (line: Polyline, pointIndex: number) => void
}

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Menu.GroupLabel className="px-2 py-1.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </Menu.GroupLabel>
  )
}

function menuItemClassName(destructive = false) {
  return cn(
    'flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none select-none',
    'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
    'data-disabled:pointer-events-none data-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
    destructive &&
      'text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive'
  )
}

export default function FilesMenu({
  canvas,
  onCanvasChanged,
  onConnectorEndpointDrag,
}: FilesMenuProps) {
  const [hasSelection, setHasSelection] = useState(false)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    registerCanvasCustomProperties()

    const sync = () => {
      const active = canvas.getActiveObject()
      setHasSelection(Boolean(active && !isCropFrame(active)))
      setHasContent(
        canvas.getObjects().some((object) => {
          const id = (object as FabricObject & { id?: string }).id ?? ''
          return !(
            id.startsWith('vertical') ||
            id.startsWith('horizontal') ||
            id.startsWith('__pen-')
          )
        })
      )
    }

    sync()
    canvas.on('selection:created', sync)
    canvas.on('selection:updated', sync)
    canvas.on('selection:cleared', sync)
    canvas.on('object:added', sync)
    canvas.on('object:removed', sync)

    return () => {
      canvas.off('selection:created', sync)
      canvas.off('selection:updated', sync)
      canvas.off('selection:cleared', sync)
      canvas.off('object:added', sync)
      canvas.off('object:removed', sync)
    }
  }, [canvas])

  const handleImportJson = async () => {
    const file = await pickFile('.json,application/json')
    if (!file) return
    try {
      await importCanvasFromJsonFile(canvas, file, {
        onEndpointDrag: onConnectorEndpointDrag,
      })
      onCanvasChanged?.()
    } catch (error) {
      console.error(error)
      window.alert(error instanceof Error ? error.message : 'Failed to import JSON.')
    }
  }

  const handleImportImage = async () => {
    const file = await pickFile('image/png,image/jpeg,.png,.jpg,.jpeg')
    if (!file) return
    try {
      await importImageFile(canvas, file)
      onCanvasChanged?.()
    } catch (error) {
      console.error(error)
      window.alert(error instanceof Error ? error.message : 'Failed to import image.')
    }
  }

  const handleExportJson = () => {
    exportCanvasAsJson(canvas, 'canvas')
  }

  const handleExportWorkedArea = () => {
    exportWorkedAreaAsPng(canvas, 'canvas-export')
  }

  const handleExportSelection = () => {
    const selected = canvas.getActiveObject()
    if (!selected || isCropFrame(selected)) return
    const name =
      (selected as FabricObject & { name?: string }).name ||
      (selected as FabricObject & { id?: string }).id ||
      selected.type ||
      'layer'
    exportObjectAsPng(selected, String(name))
  }

  const handleClear = () => {
    if (!hasContent) return
    if (!window.confirm('Clear the canvas? This cannot be undone.')) return
    clearCanvasContent(canvas)
    onCanvasChanged?.()
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button type="button" variant="outline" size="sm" title="Files" />
        }
      >
        <FolderOpen />
        Files
        <ChevronDown className="opacity-60" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner className="z-[1100] outline-none" sideOffset={6} align="start">
          <Menu.Popup
            className={cn(
              'min-w-52 origin-[var(--transform-origin)] rounded-lg bg-popover p-1 text-popover-foreground',
              'shadow-md ring-1 ring-foreground/10 outline-none',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'
            )}
          >
            <Menu.Group>
              <MenuSectionLabel>Import</MenuSectionLabel>
              <Menu.Item className={menuItemClassName()} onClick={handleImportJson}>
                <Upload />
                Import JSON…
              </Menu.Item>
              <Menu.Item className={menuItemClassName()} onClick={handleImportImage}>
                <ImagePlus />
                Import PNG / JPG…
              </Menu.Item>
            </Menu.Group>

            <Menu.Separator className="my-1 h-px bg-border" />

            <Menu.Group>
              <MenuSectionLabel>Export</MenuSectionLabel>
              <Menu.Item className={menuItemClassName()} onClick={handleExportJson}>
                <FileJson />
                Export JSON
              </Menu.Item>
              <Menu.Item
                className={menuItemClassName()}
                disabled={!hasContent}
                onClick={handleExportWorkedArea}
              >
                <Download />
                Export worked area PNG
              </Menu.Item>
              <Menu.Item
                className={menuItemClassName()}
                disabled={!hasSelection}
                onClick={handleExportSelection}
              >
                <ImageDown />
                Export selected PNG
              </Menu.Item>
            </Menu.Group>

            <Menu.Separator className="my-1 h-px bg-border" />

            <Menu.Group>
              <Menu.Item
                className={menuItemClassName(true)}
                disabled={!hasContent}
                onClick={handleClear}
              >
                <Trash2 />
                Clear canvas
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
