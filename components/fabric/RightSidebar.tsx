import { Canvas, FabricObject } from 'fabric'
import React, { useState, useEffect } from 'react'
import './RightSidebar.css'
import CroppingSettings from './cropping/CroppingSettings'
import Cropping from './cropping/Cropping'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { setErasable } from '@/components/fabric-helper/erase-utils'
import {
  bakeFlowchartScale,
  getFlowchartShape,
  isFlowchartNode,
} from '@/components/fabric-helper/flowchart-node'

type SidebarProps = {
  canvas: Canvas
  refreshKey: number
  handleFramesUpdated: () => void
}

/** Appearance props live on the shape child for flowchart groups. */
const resolveStyleTarget = (object: FabricObject) =>
  isFlowchartNode(object) ? (getFlowchartShape(object) ?? object) : object

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
  const [erasable, setErasableState] = useState(false)

  useEffect(() => {
    const handleObjectSelection = (object: FabricObject | undefined) => {
      if (!object) {
        setSelectedObject(null)
        clearSettings()
        return
      }

      setSelectedObject(object)

      const styleTarget = resolveStyleTarget(object)
      const sizeSource = isFlowchartNode(object)
        ? (getFlowchartShape(object) ?? object)
        : object

      const scaledWidth = Math.round(sizeSource.getScaledWidth())
      const scaledHeight = Math.round(sizeSource.getScaledHeight())

      setLeft(Math.round(object.left ?? 0))
      setTop(Math.round(object.top ?? 0))
      setWidth(scaledWidth)
      setHeight(scaledHeight)
      setColor(typeof styleTarget.fill === 'string' ? styleTarget.fill : '#000000')
      setBorderColor(typeof styleTarget.stroke === 'string' ? styleTarget.stroke : '#000000')
      setBorderWidth(styleTarget.strokeWidth ?? 0)
      setOpacity(styleTarget.opacity ?? 1)
      setVisible(styleTarget.visible ?? true)
      setErasableState(Boolean(styleTarget.erasable))
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
      setErasableState(false)
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

  /** Position / group-level changes stay on the active object. */
  const applyObjectChange = (updates: Record<string, unknown>) => {
    if (!selectedObject) return
    selectedObject.set(updates)
    selectedObject.setCoords()
    canvas.requestRenderAll()
  }

  /** Fill / stroke / etc. go to the shape child when a flowchart is selected. */
  const applyStyleChange = (updates: Record<string, unknown>) => {
    if (!selectedObject) return
    const target = resolveStyleTarget(selectedObject)
    target.set(updates)
    target.setCoords()
    if (isFlowchartNode(selectedObject)) {
      selectedObject.setCoords()
      selectedObject.dirty = true
    }
    canvas.requestRenderAll()
  }

  const resizeFlowchartAxis = (axis: 'width' | 'height', value: number) => {
    if (!selectedObject || !isFlowchartNode(selectedObject)) return
    const shape = getFlowchartShape(selectedObject)
    if (!shape) return

    const safe = Math.max(1, value)
    if (axis === 'width') {
      const current = shape.getScaledWidth()
      if (current > 0) {
        shape.set({ scaleX: (shape.scaleX || 1) * (safe / current) })
      }
      setWidth(safe)
    } else {
      const current = shape.getScaledHeight()
      if (current > 0) {
        shape.set({ scaleY: (shape.scaleY || 1) * (safe / current) })
      }
      setHeight(safe)
    }

    bakeFlowchartScale(selectedObject)
    selectedObject.setCoords()
    canvas.fire('object:modified', { target: selectedObject })
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
    if (selectedObject && isFlowchartNode(selectedObject)) {
      resizeFlowchartAxis('width', value)
      return
    }
    setWidth(value)
    applyObjectChange({ width: value, scaleX: 1 })
  }

  const handleHeightChange = (value: number) => {
    if (selectedObject && isFlowchartNode(selectedObject)) {
      resizeFlowchartAxis('height', value)
      return
    }
    setHeight(value)
    applyObjectChange({ height: value, scaleY: 1 })
  }

  const handleColorChange = (value: string) => {
    setColor(value)
    applyStyleChange({ fill: value })
  }

  const handleBorderColorChange = (value: string) => {
    setBorderColor(value)
    applyStyleChange({ stroke: value })
  }

  const handleBorderWidthChange = (value: number) => {
    setBorderWidth(value)
    applyStyleChange({ strokeWidth: value })
  }

  const handleOpacityChange = (value: number) => {
    setOpacity(value)
    applyStyleChange({ opacity: value })
  }

  const handleVisibleChange = (value: boolean) => {
    setVisible(value)
    applyStyleChange({ visible: value })
  }

  const handleErasableChange = (value: boolean) => {
    if (!selectedObject) return
    setErasableState(value)
    const active = canvas.getActiveObjects()
    const targets = (active.length > 0 ? active : [selectedObject]).map((obj) =>
      isFlowchartNode(obj) ? (getFlowchartShape(obj) ?? obj) : obj
    )
    setErasable(canvas, targets, value)
  }

  const disabled = !selectedObject

  return (
    <>
    <div className="sidebarContainer">
      <div className="sidebarSection">
        <h3>Position</h3>
        <div className='flex flex-row gap-4'>
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
      </div>

      <div className="sidebarSection">
        <h3>Size</h3>
        <div className='flex flex-row gap-4'>
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
      </div>

      <div className="sidebarSection">
        <h3>Appearance</h3>
        <div className="sidebarRow">
          <Label htmlFor="object-fill">Fill</Label>
          <input
            id="object-fill"
            className="color-picker"
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
            className="color-picker"
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
        <h3>Erasing</h3>
        <div className="sidebarRow">
          <Label htmlFor="object-erasable">Erasable</Label>
          <Switch
            id="object-erasable"
            size="sm"
            disabled={disabled}
            checked={erasable}
            onCheckedChange={handleErasableChange}
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

    <script>

    </script>

    </>
  )
}

export default Sidebar