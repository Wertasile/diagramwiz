import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  exportCropFrameAsPng,
  getCropFrames,
  isCropFrame,
} from '@/components/fabric-helper/export-utils'

const CroppingSettings = ({ canvas, refreshKey }) => {
  const [frames, setFrames] = useState([])
  const [selectedFrameName, setSelectedFrameName] = useState('')

  const updateFrames = () => {
    if (!canvas) {
      setFrames([])
      setSelectedFrameName('')
      return
    }

    const nextFrames = getCropFrames(canvas)
    setFrames(nextFrames)

    const active = canvas.getActiveObject()
    if (active && isCropFrame(active)) {
      setSelectedFrameName(active.name || '')
      return
    }

    if (nextFrames.length === 0) {
      setSelectedFrameName('')
      return
    }

    const stillExists = nextFrames.some((frame) => frame.name === selectedFrameName)
    if (!stillExists) {
      setSelectedFrameName(nextFrames[0].name || '')
    }
  }

  useEffect(() => {
    updateFrames()
  }, [canvas, refreshKey])

  useEffect(() => {
    if (!canvas) return

    const refresh = () => updateFrames()
    canvas.on('object:added', refresh)
    canvas.on('object:removed', refresh)
    canvas.on('selection:created', refresh)
    canvas.on('selection:updated', refresh)
    canvas.on('selection:cleared', refresh)

    return () => {
      canvas.off('object:added', refresh)
      canvas.off('object:removed', refresh)
      canvas.off('selection:created', refresh)
      canvas.off('selection:updated', refresh)
      canvas.off('selection:cleared', refresh)
    }
  }, [canvas])

  const selectedFrame = frames.find((frame) => frame.name === selectedFrameName) || null

  const handleFrameSelection = (event) => {
    const name = event.target.value
    setSelectedFrameName(name)
    const next = frames.find((frame) => frame.name === name)
    if (next) {
      canvas.setActiveObject(next)
      canvas.requestRenderAll()
    }
  }

  const exportFrameAsPNG = () => {
    if (!selectedFrame) return
    exportCropFrameAsPng(canvas, selectedFrame, selectedFrame.name || 'crop')
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectedFrameName}
        onChange={handleFrameSelection}
        disabled={frames.length === 0}
        className={cn(
          'h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 text-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
        )}
      >
        {frames.length === 0 && <option value="">No crop frames</option>}
        {frames.map((frame) => (
          <option key={frame.name} value={frame.name}>
            {frame.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!selectedFrame}
        onClick={exportFrameAsPNG}
      >
        Export crop PNG
      </Button>
    </div>
  )
}

export default CroppingSettings
