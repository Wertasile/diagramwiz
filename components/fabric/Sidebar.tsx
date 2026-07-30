import { Canvas, FabricObject } from 'fabric'
import React, { useState, useEffect } from 'react'
import './sidebar.css'
import CroppingSettings from './cropping/CroppingSettings'
import Cropping from './cropping/Cropping'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type SidebarProps = {
  canvas: Canvas
  refreshKey: number
  handleFramesUpdated: () => void
}

const Sidebar = ({ canvas, refreshKey, handleFramesUpdated }: SidebarProps) => {
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null)

  const [left, setLeft] = useState(0)
  const [top, setTop] = useState(0)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [color, setColor] = useState('#000000')
  const [borderColor, setBorderColor] = useState('#000000')
  const [borderWidth, setBorderWidth] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const handleObjectSelection = (object: FabricObject | undefined) => {
      if (!object) {
        setSelectedObject(null)
        clearSettings()
        return
      }

      setSelectedObject(object)

      const scaledWidth = Math.round((object.width ?? 0) * (object.scaleX ?? 1))
      const scaledHeight = Math.round((object.height ?? 0) * (object.scaleY ?? 1))

      setLeft(Math.round(object.left ?? 0))
      setTop(Math.round(object.top ?? 0))
      setWidth(scaledWidth)
      setHeight(scaledHeight)
      setColor(typeof object.fill === 'string' ? object.fill : '#000000')
      setBorderColor(typeof object.stroke === 'string' ? object.stroke : '#000000')
      setBorderWidth(object.strokeWidth ?? 0)
      setOpacity(object.opacity ?? 1)
      setVisible(object.visible ?? true)
    }

    const clearSettings = () => {
      setLeft(0)
      setTop(0)
      setWidth(0)
      setHeight(0)
      setColor('#000000')
      setBorderColor('#000000')
      setBorderWidth(0)
      setOpacity(1)
      setVisible(true)
    }

    const onSelectionCreated = (e: { selected?: FabricObject[] }) => {
      handleObjectSelection(e.selected?.[0])
    }
    const onSelectionUpdated = (e: { selected?: FabricObject[] }) => {
      handleObjectSelection(e.selected?.[0])
    }
    const onSelectionCleared = () => {
      setSelectedObject(null)
      clearSettings()
    }
    const onObjectModified = (e: { target?: FabricObject }) => {
      handleObjectSelection(e.target)
    }
    const onObjectScaling = (e: { target?: FabricObject }) => {
      handleObjectSelection(e.target)
    }
    const onObjectMoving = (e: { target?: FabricObject }) => {
      handleObjectSelection(e.target)
    }

    canvas.on('selection:created', onSelectionCreated)
    canvas.on('selection:updated', onSelectionUpdated)
    canvas.on('selection:cleared', onSelectionCleared)
    canvas.on('object:modified', onObjectModified)
    canvas.on('object:scaling', onObjectScaling)
    canvas.on('object:moving', onObjectMoving)

    return () => {
      canvas.off('selection:created', onSelectionCreated)
      canvas.off('selection:updated', onSelectionUpdated)
      canvas.off('selection:cleared', onSelectionCleared)
      canvas.off('object:modified', onObjectModified)
      canvas.off('object:scaling', onObjectScaling)
      canvas.off('object:moving', onObjectMoving)
    }
  }, [canvas])

  const applyObjectChange = (updates: Record<string, unknown>) => {
    if (!selectedObject) return
    selectedObject.set(updates)
    selectedObject.setCoords()
    canvas.requestRenderAll()
  }

  const handleLeftChange = (value: number) => {
    setLeft(value)
    applyObjectChange({ left: value })
  }

  const handleTopChange = (value: number) => {
    setTop(value)
    applyObjectChange({ top: value })
  }

  const handleWidthChange = (value: number) => {
    setWidth(value)
    applyObjectChange({ width: value, scaleX: 1 })
  }

  const handleHeightChange = (value: number) => {
    setHeight(value)
    applyObjectChange({ height: value, scaleY: 1 })
  }

  const handleColorChange = (value: string) => {
    setColor(value)
    applyObjectChange({ fill: value })
  }

  const handleBorderColorChange = (value: string) => {
    setBorderColor(value)
    applyObjectChange({ stroke: value })
  }

  const handleBorderWidthChange = (value: number) => {
    setBorderWidth(value)
    applyObjectChange({ strokeWidth: value })
  }

  const handleOpacityChange = (value: number) => {
    setOpacity(value)
    applyObjectChange({ opacity: value })
  }

  const handleVisibleChange = (value: boolean) => {
    setVisible(value)
    applyObjectChange({ visible: value })
  }

  const disabled = !selectedObject

  return (
    <div className="sidebarContainer">
      <div className="sidebarSection">
        <h3>Position</h3>
        <div className="sidebarRow">
          <Label htmlFor="object-x">X</Label>
          <Input
            id="object-x"
            type="number"
            disabled={disabled}
            value={left}
            onChange={(e) => handleLeftChange(Number(e.target.value))}
          />
        </div>
        <div className="sidebarRow">
          <Label htmlFor="object-y">Y</Label>
          <Input
            id="object-y"
            type="number"
            disabled={disabled}
            value={top}
            onChange={(e) => handleTopChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="sidebarSection">
        <h3>Size</h3>
        <div className="sidebarRow">
          <Label htmlFor="object-width">W</Label>
          <Input
            id="object-width"
            type="number"
            min={1}
            disabled={disabled}
            value={width}
            onChange={(e) => handleWidthChange(Number(e.target.value))}
          />
        </div>
        <div className="sidebarRow">
          <Label htmlFor="object-height">H</Label>
          <Input
            id="object-height"
            type="number"
            min={1}
            disabled={disabled}
            value={height}
            onChange={(e) => handleHeightChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="sidebarSection">
        <h3>Appearance</h3>
        <div className="sidebarRow">
          <Label htmlFor="object-fill">Fill</Label>
          <input
            id="object-fill"
            className="sidebarColor"
            type="color"
            disabled={disabled}
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
          />
        </div>
        <div className="sidebarRow">
          <Label htmlFor="object-stroke">Stroke</Label>
          <input
            id="object-stroke"
            className="sidebarColor"
            type="color"
            disabled={disabled}
            value={borderColor}
            onChange={(e) => handleBorderColorChange(e.target.value)}
          />
        </div>
        <div className="sidebarRow">
          <Label htmlFor="object-stroke-width">Stroke W</Label>
          <Input
            id="object-stroke-width"
            type="number"
            min={0}
            disabled={disabled}
            value={borderWidth}
            onChange={(e) => handleBorderWidthChange(Number(e.target.value))}
          />
        </div>
        <div className="sidebarRow">
          <Label htmlFor="object-opacity">Opacity</Label>
          <Input
            id="object-opacity"
            type="number"
            min={0}
            max={1}
            step={0.1}
            disabled={disabled}
            value={opacity}
            onChange={(e) => handleOpacityChange(Number(e.target.value))}
          />
        </div>
        <div className="sidebarRow">
          <Label htmlFor="object-visible">Visible</Label>
          <Switch
            id="object-visible"
            size="sm"
            disabled={disabled}
            checked={visible}
            onCheckedChange={handleVisibleChange}
          />
        </div>
      </div>

      <div className="sidebarSection">
        <h3>Crop & export</h3>
        <div className="cropRow">
          {canvas && <Cropping canvas={canvas} onFramesUpdated={handleFramesUpdated} />}
          {canvas && <CroppingSettings canvas={canvas} refreshKey={refreshKey} />}
        </div>
      </div>
    </div>
  )
}

export default Sidebar
