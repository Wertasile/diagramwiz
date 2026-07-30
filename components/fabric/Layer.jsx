import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Canvas, Textbox } from 'fabric'
import {
  Trash2,
  Copy,
  ArrowUpToLine,
  ArrowUp,
  ArrowDown,
  ArrowDownToLine,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  GripVertical,
  ImageDown,
} from 'lucide-react'
import { LayerIcon, getLayerDisplayName, resolveLayerSymbol } from './LayerIcon'
import { exportObjectAsPng, exportCropFrameAsPng, isCropFrame } from '@/components/fabric-helper/export-utils'
import './layer.css'

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function isManagedLayerObject(object) {
  const id = object?.id ?? ''
  if (!id) return true
  return !(
    id.startsWith('vertical') ||
    id.startsWith('horizontal') ||
    id.startsWith('__pen-')
  )
}

function Layer({ canvas }) {
  const [layers, setLayers] = useState([])
  const [selectedLayer, setSelectedLayer] = useState(null)
  const [menu, setMenu] = useState(null) // { x, y, layerId }
  const [draggingId, setDraggingId] = useState(null)
  const [dropIndex, setDropIndex] = useState(null) // insert position in UI list
  const menuRef = useRef(null)
  const dragIdRef = useRef(null)
  const reorderingRef = useRef(false)

  const addIdToObjects = (object) => {
    if (!object.id) {
      const timestamp = Date.now()
      object.id = `${object.type}_${timestamp}`
    }
  }

  Canvas.prototype.updateZIndices = function () {
    const objects = this.getObjects()
    objects.forEach((object, index) => {
      addIdToObjects(object)
      object.zIndex = index
    })
  }

  const findObjectById = useCallback(
    (layerId) => canvas.getObjects().find((object) => object.id === layerId),
    [canvas]
  )

  const updateLayers = useCallback(() => {
    if (!canvas || reorderingRef.current) return

    // Ensures object.id + zIndex — does not change existing ids
    canvas.updateZIndices()

    const typeCounts = {}

    const objects = canvas
      .getObjects()
      .filter(isManagedLayerObject)
      .map((object) => {
        const label =
          object.flowchartNode && typeof object.getObjects === 'function'
            ? object.getObjects().find((child) => child instanceof Textbox)?.text
            : undefined

        const layerMeta = {
          id: object.id, // keep original id system
          name: object.name,
          type: object.type,
          shapeKind: object.shapeKind,
          label,
          zIndex: object.zIndex,
          visible: object.visible !== false,
          locked: object.selectable === false,
        }

        const kind = resolveLayerSymbol(layerMeta)
        typeCounts[kind] = (typeCounts[kind] || 0) + 1

        return {
          ...layerMeta,
          displayNumber: typeCounts[kind],
        }
      })

    setLayers([...objects].reverse())
  }, [canvas])

  /**
   * Apply UI layer order (top-first = front) to Fabric stacking
   * (canvas index 0 = back, last = front).
   */
  const applyUiOrderToCanvas = useCallback(
    (uiTopFirst) => {
      const bottomFirst = [...uiTopFirst].reverse()
      const managed = bottomFirst
        .map((layer) => findObjectById(layer.id))
        .filter(Boolean)

      if (managed.length === 0) return

      const prevRender = canvas.renderOnAddRemove
      reorderingRef.current = true
      canvas.renderOnAddRemove = false

      try {
        canvas.remove(...managed)
        for (const object of managed) {
          canvas.add(object)
        }
      } finally {
        canvas.renderOnAddRemove = prevRender
        reorderingRef.current = false
      }

      canvas.requestRenderAll()
      updateLayers()
    },
    [canvas, findObjectById, updateLayers]
  )

  const moveLayerInList = useCallback(
    (fromIndex, toIndex) => {
      // Same slot / immediately after self = no-op
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= layers.length ||
        toIndex > layers.length ||
        fromIndex === toIndex ||
        fromIndex + 1 === toIndex
      ) {
        return
      }

      const next = [...layers]
      const [item] = next.splice(fromIndex, 1)
      const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
      next.splice(insertAt, 0, item)

      setLayers(next)
      applyUiOrderToCanvas(next)
    },
    [layers, applyUiOrderToCanvas]
  )

  const selectLayer = useCallback(
    (layerId) => {
      const object = findObjectById(layerId)
      if (!object) return
      canvas.discardActiveObject()
      canvas.setActiveObject(object)
      canvas.requestRenderAll()
      setSelectedLayer(layerId)
    },
    [canvas, findObjectById]
  )

  const deleteLayer = useCallback(
    (layerId) => {
      const object = findObjectById(layerId)
      if (!object) return
      canvas.remove(object)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      setSelectedLayer((prev) => (prev === layerId ? null : prev))
      setMenu(null)
    },
    [canvas, findObjectById]
  )

  const duplicateLayer = useCallback(
    async (layerId) => {
      const object = findObjectById(layerId)
      if (!object) return

      const cloned = await object.clone()
      // Fresh id for the clone — keep original id system
      cloned.id = undefined
      cloned.set({
        left: (object.left ?? 0) + 20,
        top: (object.top ?? 0) + 20,
      })
      if (object.shapeKind) cloned.shapeKind = object.shapeKind
      if (object.flowchartNode) cloned.flowchartNode = true
      if (object.isConnector) cloned.isConnector = true
      if (object.isOpenPolygon) cloned.isOpenPolygon = true
      if (object.isCropFrame) cloned.isCropFrame = true

      canvas.add(cloned)
      canvas.setActiveObject(cloned)
      canvas.requestRenderAll()
      setMenu(null)
    },
    [canvas, findObjectById]
  )

  const exportLayer = useCallback(
    (layerId) => {
      const object = findObjectById(layerId)
      if (!object) return

      const layer = layers.find((item) => item.id === layerId)
      const filename = layer ? getLayerDisplayName(layer) : object.name || object.id || 'layer'

      if (isCropFrame(object)) {
        exportCropFrameAsPng(canvas, object, filename)
      } else {
        exportObjectAsPng(object, filename)
      }
      setMenu(null)
    },
    [canvas, findObjectById, layers]
  )

  const reorderLayer = useCallback(
    (layerId, action) => {
      const object = findObjectById(layerId)
      if (!object) return

      switch (action) {
        case 'front':
          canvas.bringObjectToFront(object)
          break
        case 'forward':
          canvas.bringObjectForward(object)
          break
        case 'backward':
          canvas.sendObjectBackwards(object)
          break
        case 'back':
          canvas.sendObjectToBack(object)
          break
        default:
          break
      }

      canvas.requestRenderAll()
      updateLayers()
      setMenu(null)
    },
    [canvas, findObjectById, updateLayers]
  )

  const toggleVisibility = useCallback(
    (layerId) => {
      const object = findObjectById(layerId)
      if (!object) return
      object.set('visible', object.visible === false)
      if (object.visible === false && canvas.getActiveObject() === object) {
        canvas.discardActiveObject()
      }
      canvas.requestRenderAll()
      updateLayers()
      setMenu(null)
    },
    [canvas, findObjectById, updateLayers]
  )

  const toggleLock = useCallback(
    (layerId) => {
      const object = findObjectById(layerId)
      if (!object) return
      const locked = object.selectable === false
      object.set({
        selectable: locked,
        evented: locked,
        hasControls: locked,
      })
      if (!locked && canvas.getActiveObject() === object) {
        canvas.discardActiveObject()
      }
      canvas.requestRenderAll()
      updateLayers()
      setMenu(null)
    },
    [canvas, findObjectById, updateLayers]
  )

  const openContextMenu = (event, layerId) => {
    event.preventDefault()
    event.stopPropagation()
    selectLayer(layerId)

    const menuWidth = 200
    const menuHeight = 280
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)

    setMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      layerId,
    })
  }

  const handleObjectSelected = (object) => {
    const selectedObject = object.selected ? object.selected[0] : null
    if (selectedObject) {
      setSelectedLayer(selectedObject.id)
    } else {
      setSelectedLayer(null)
    }
  }

  const onDragStart = (event, layerId) => {
    dragIdRef.current = layerId
    setDraggingId(layerId)
    setMenu(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', layerId)
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.classList.add('dragging')
    }
  }

  const onDragEnd = (event) => {
    dragIdRef.current = null
    setDraggingId(null)
    setDropIndex(null)
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.classList.remove('dragging')
    }
  }

  const onDragOverItem = (event, index) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    const nextIndex = before ? index : index + 1
    setDropIndex(nextIndex)
  }

  const onDragOverList = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onDropList = (event) => {
    event.preventDefault()
    const fromId = dragIdRef.current || event.dataTransfer.getData('text/plain')
    if (!fromId || dropIndex == null) {
      setDraggingId(null)
      setDropIndex(null)
      return
    }

    const fromIndex = layers.findIndex((layer) => layer.id === fromId)
    if (fromIndex === -1) {
      setDraggingId(null)
      setDropIndex(null)
      return
    }

    moveLayerInList(fromIndex, dropIndex)
    setDraggingId(null)
    setDropIndex(null)
  }

  useEffect(() => {
    canvas.on('object:added', updateLayers)
    canvas.on('object:removed', updateLayers)
    canvas.on('object:modified', updateLayers)

    canvas.on('selection:created', handleObjectSelected)
    canvas.on('selection:updated', handleObjectSelected)
    canvas.on('selection:cleared', handleObjectSelected)
    updateLayers()
    return () => {
      canvas.off('object:added', updateLayers)
      canvas.off('object:removed', updateLayers)
      canvas.off('object:modified', updateLayers)

      canvas.off('selection:created', handleObjectSelected)
      canvas.off('selection:updated', handleObjectSelected)
      canvas.off('selection:cleared', handleObjectSelected)
    }
  }, [canvas, updateLayers])

  // Close context menu on outside click / escape / scroll
  useEffect(() => {
    if (!menu) return

    const close = (e) => {
      if (menuRef.current?.contains(e.target)) return
      setMenu(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenu(null)
    }
    const onScroll = () => setMenu(null)

    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu])

  // Delete / Shift+Backspace removes selected layer (or active canvas object)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return

      const isDelete = e.key === 'Delete'
      const isShiftBackspace = e.key === 'Backspace' && e.shiftKey
      if (!isDelete && !isShiftBackspace) return

      // Don't fight the pen tool while a path is in progress
      const penInProgress = canvas
        .getObjects()
        .some((object) => object.id?.startsWith('__pen-'))
      if (penInProgress) return

      e.preventDefault()

      const active = canvas.getActiveObject()
      const layerId = active?.id || selectedLayer
      if (!layerId) return

      deleteLayer(layerId)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canvas, selectedLayer, deleteLayer])

  const menuLayer = menu ? layers.find((l) => l.id === menu.layerId) : null

  return (
    <div className="layerContainer">
      <h3>Layers</h3>
      <div
        className="layerList"
        onDragOver={onDragOverList}
        onDrop={onDropList}
      >
        {layers.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
            No objects yet
          </p>
        )}
        {layers.map((layer, index) => (
          <React.Fragment key={layer.id}>
            {dropIndex === index && draggingId && draggingId !== layer.id && (
              <div className="layerDropIndicator" aria-hidden />
            )}
            <div
              role="button"
              tabIndex={0}
              draggable
              className={[
                'layerItem',
                selectedLayer === layer.id ? 'selected' : '',
                draggingId === layer.id ? 'dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => selectLayer(layer.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  selectLayer(layer.id)
                }
              }}
              onContextMenu={(e) => openContextMenu(e, layer.id)}
              onDragStart={(e) => onDragStart(e, layer.id)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => onDragOverItem(e, index)}
            >
              <span className="layerDragHandle" title="Drag to reorder" aria-hidden>
                <GripVertical size={14} />
              </span>
              <LayerIcon
                shapeKind={layer.shapeKind}
                type={layer.type}
                name={layer.name}
                label={layer.label}
              />
              <span className="layerName">{getLayerDisplayName(layer)}</span>
              {layer.visible === false && (
                <EyeOff size={12} className="layerMetaIcon" aria-label="Hidden" />
              )}
              {layer.locked && (
                <Lock size={12} className="layerMetaIcon" aria-label="Locked" />
              )}
            </div>
          </React.Fragment>
        ))}
        {dropIndex === layers.length && draggingId && (
          <div className="layerDropIndicator" aria-hidden />
        )}
      </div>

      {menu && menuLayer && (
        <div
          ref={menuRef}
          className="layerContextMenu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => duplicateLayer(menu.layerId)}
          >
            <Copy size={14} />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => exportLayer(menu.layerId)}
          >
            <ImageDown size={14} />
            <span>Export PNG</span>
          </button>

          <div className="layerContextSeparator" />

          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => reorderLayer(menu.layerId, 'front')}
          >
            <ArrowUpToLine size={14} />
            <span>Bring to front</span>
          </button>
          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => reorderLayer(menu.layerId, 'forward')}
          >
            <ArrowUp size={14} />
            <span>Bring forward</span>
          </button>
          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => reorderLayer(menu.layerId, 'backward')}
          >
            <ArrowDown size={14} />
            <span>Send backward</span>
          </button>
          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => reorderLayer(menu.layerId, 'back')}
          >
            <ArrowDownToLine size={14} />
            <span>Send to back</span>
          </button>

          <div className="layerContextSeparator" />

          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => toggleVisibility(menu.layerId)}
          >
            {menuLayer.visible === false ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{menuLayer.visible === false ? 'Show' : 'Hide'}</span>
          </button>
          <button
            type="button"
            className="layerContextItem"
            role="menuitem"
            onClick={() => toggleLock(menu.layerId)}
          >
            {menuLayer.locked ? <Unlock size={14} /> : <Lock size={14} />}
            <span>{menuLayer.locked ? 'Unlock' : 'Lock'}</span>
          </button>

          <div className="layerContextSeparator" />

          <button
            type="button"
            className="layerContextItem destructive"
            role="menuitem"
            onClick={() => deleteLayer(menu.layerId)}
          >
            <Trash2 size={14} />
            <span>Delete</span>
            <span className="layerContextShortcut">Del</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default Layer
