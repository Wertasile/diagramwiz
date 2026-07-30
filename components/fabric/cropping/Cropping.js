import React from 'react'
import { Rect } from 'fabric'
import { CropIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { centerObjectInViewport, ensureObjectId } from '@/components/fabric-helper/object-utils'

const Cropping = ({ canvas, onFramesUpdated }) => {
  const addFrametoCanvas = () => {
    const existingCrops = canvas
      .getObjects('rect')
      .filter((obj) => obj.shapeKind === 'crop' || obj.name?.startsWith?.('Crop'))
    const frameName = `Crop_${existingCrops.length + 1}`

    const frame = new Rect({
      left: 0,
      top: 0,
      width: 200,
      height: 150,
      fill: 'transparent',
      stroke: '#22c55e',
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: true,
      evented: true,
      objectCaching: false,
      name: frameName,
      shapeKind: 'crop',
    })
    frame.isCropFrame = true
    ensureObjectId(frame)
    centerObjectInViewport(canvas, frame)

    canvas.add(frame)
    canvas.setActiveObject(frame)
    canvas.requestRenderAll()

    const maintainStrokeWidth = (object) => {
      const scaleX = object.scaleX || 1
      const scaleY = object.scaleY || 1

      object.set({
        width: object.width * scaleX,
        height: object.height * scaleY,
        scaleX: 1,
        scaleY: 1,
        strokeWidth: 2,
      })

      object.setCoords()
    }

    frame.on('scaling', () => {
      maintainStrokeWidth(frame)
      canvas.requestRenderAll()
    })

    frame.on('modified', () => {
      maintainStrokeWidth(frame)
      canvas.requestRenderAll()
    })

    onFramesUpdated?.()
  }

  return (
    <Button type="button" variant="outline" size="sm" className="w-full" onClick={addFrametoCanvas}>
      <CropIcon />
      Add crop frame
    </Button>
  )
}

export default Cropping
