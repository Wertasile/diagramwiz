'use client'

import { Canvas, FabricObject, PencilBrush, Point, Polyline, Textbox, util } from 'fabric'
import React, { useRef, useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import styles from './playground.module.css'
import { PointerIcon, WorkflowIcon, PencilIcon, PenToolIcon, MessageSquareText, StickyNote } from 'lucide-react'
import Sidebar from '@/components/fabric/Sidebar'
import Layer from '@/components/fabric/Layer'
import FlowchartTextMenu from '@/components/fabric/FlowchartTextMenu'
import Minimap from '@/components/fabric/Minimap'
import FilesMenu from '@/components/fabric/FilesMenu'
import { Settings } from '@/dialog/settings'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/seperator'
// Edge/center snapping + guidelines — re-enable later
// import { handleObjectMoving, clearGuidelines } from '@/components/fabric-helper/snapping-helper'
// import { Guideline } from '@/components/fabric-helper/snapping-helper'
import ShapeSidebar from '@/components/fabric/Shapes'
import { ensureObjectId } from '@/components/fabric-helper/object-utils'
import {
    SHAPE_ADDERS,
    isShapeId,
    type ConnectionPoint,
    type ConnectorLine,
} from '@/components/fabric-helper/add-shapes'
import { FLOWCHART_ADDERS, isFlowchartId } from '@/components/fabric-helper/add-flowchart'
import {
    setupFlowchartTextEditing,
    type FlowchartNode,
} from '@/components/fabric-helper/flowchart-node'
import { resizeCanvasToStage, setupPanZoom } from '@/components/fabric-helper/viewport'
import { getThemeLineStroke, syncThemeLineColors } from '@/components/fabric-helper/theme-lines'
import { activatePolygonPen } from '@/components/fabric-helper/polygon-pen'
import {
    type PlaygroundSettings,
    DEFAULT_PLAYGROUND_SETTINGS,
    loadPlaygroundSettings,
    sanitizePlaygroundSettings,
    savePlaygroundSettings,
} from '@/components/fabric-helper/playground-settings'

type XY = { x: number; y: number }

// ------------------------------------- HELPERS FUNCTIONS FOR LINE SNAPPING TO OBJECT -------------------------------------
const DEFAULT_SNAP_DISTANCE = 10

const getObjectPorts = (object: FabricObject): Record<ConnectionPoint['type'], XY> | null => {
    if (!object.aCoords) {
        return null
    }
    const { tl, tr, br, bl } = object.aCoords
    return {
        top: { x: (tl.x + tr.x) / 2, y: tl.y },
        right: { x: tr.x, y: (tr.y + br.y) / 2 },
        bottom: { x: (br.x + bl.x) / 2, y: br.y },
        left: { x: bl.x, y: (bl.y + tl.y) / 2 },
    }
}

const calculateCanvasObjectPoints = (canvas: Canvas) => {
    const objects = canvas.getObjects()
        .filter((object) => !(object instanceof Polyline)) // everything except connector lines
    return objects.flatMap((object) => {
        const objectPosition = getObjectPorts(object)
        if (!objectPosition) {
            return []
        }
        return [{
            objectId: ensureObjectId(object),
            objectPosition,
        }]
    })
}

/** Convert a polyline local path point into canvas/world coordinates. */
const getWorldPointForLinePoint = (line: Polyline, index: number): XY | null => {
    const points = line.points
    if (!points?.[index]) {
        return null
    }

    const localPoint = new Point(
        points[index].x - line.pathOffset.x,
        points[index].y - line.pathOffset.y
    )
    const worldPoint = localPoint.transform(line.calcOwnMatrix())
    return { x: worldPoint.x, y: worldPoint.y }
}

/**
 * Write a canvas/world point back into polyline local path coordinates.
 * Must call setDimensions() afterwards — otherwise Fabric keeps the old bbox
 * and the stroke gets clipped while control handles still look correct.
 */
const setLinePointFromWorld = (line: Polyline, index: number, worldPoint: XY): boolean => {
    const points = line.points
    if (!points?.[index]) {
        return false
    }

    // Keep another vertex fixed in world space while dimensions/pathOffset are recalculated
    // (same approach Fabric uses in createPolyControls).
    const anchorIndex = index === 0 ? Math.min(1, points.length - 1) : 0
    const anchorBefore = new Point(points[anchorIndex].x, points[anchorIndex].y)
        .subtract(line.pathOffset)
        .transform(line.calcOwnMatrix())

    const local = util.transformPoint(
        new Point(worldPoint.x, worldPoint.y),
        util.invertTransform(line.calcOwnMatrix())
    )
    points[index].x = local.x + line.pathOffset.x
    points[index].y = local.y + line.pathOffset.y

    line.setDimensions()
    line.set('dirty', true)

    const anchorAfter = new Point(points[anchorIndex].x, points[anchorIndex].y)
        .subtract(line.pathOffset)
        .transform(line.calcOwnMatrix())
    const diff = anchorAfter.subtract(anchorBefore)
    line.left -= diff.x
    line.top -= diff.y
    line.setCoords()
    return true
}

/** Snap one dragged vertex to the nearest object edge midpoint within snapDistance. */
const snapLinePointToNearestMidpoint = (
    line: Polyline,
    pointIndex: number,                   // indicate which point on the line is being dragged 0 = start point, 1 = end point
    canvas: Canvas,
    snapDistance = DEFAULT_SNAP_DISTANCE
) => {
    if (snapDistance <= 0) {
        const connector = line as ConnectorLine
        if (connector.endpointConnections?.[pointIndex]) {
            connector.endpointConnections[pointIndex] = null
        }
        return
    }
    const worldPoint = getWorldPointForLinePoint(line, pointIndex)
    if (!worldPoint) {
        return
    }

    const objectPoints = calculateCanvasObjectPoints(canvas)
    let best: {
        point: XY
        distance: number
        objectId: string
        type: ConnectionPoint['type']
    } | null = null

    for (const objPoint of objectPoints) {
        for (const [port, mid] of Object.entries(objPoint.objectPosition) as [ConnectionPoint['type'], XY][]) {
            const distance = Math.hypot(mid.x - worldPoint.x, mid.y - worldPoint.y)
            if (distance <= snapDistance && (!best || distance < best.distance)) {
                best = {
                    point: mid,
                    distance,
                    objectId: objPoint.objectId,
                    type: port,
                }
            }
        }
    }

    if (best) {
        // Snap the dragged endpoint to the nearest object edge midpoint and remember the attachment.
        setLinePointFromWorld(line, pointIndex, best.point)

        const connector = line as ConnectorLine
        connector.endpointConnections ??= {}
        connector.endpointConnections[pointIndex] = {
            objectId: best.objectId,
            type: best.type,
        }
    } else {
        const connector = line as ConnectorLine
        if (connector.endpointConnections?.[pointIndex]) {
            connector.endpointConnections[pointIndex] = null
        }
    }
}


const updateConnectedLines = ({ canvas, obj }: { canvas: Canvas; obj: FabricObject }) => {
    if (obj instanceof Polyline) {
        return
    }

    const movedId = (obj as FabricObject & { objectId?: string }).objectId
    if (!movedId) {
        return
    }

    const ports = getObjectPorts(obj)
    if (!ports) {
        return
    }

    for (const object of canvas.getObjects()) {
        if (!(object instanceof Polyline)) {
            continue
        }

        const line = object as ConnectorLine
        if (!line.endpointConnections) {
            continue
        }

        let changed = false
        for (const [indexStr, conn] of Object.entries(line.endpointConnections)) {
            if (!conn || conn.objectId !== movedId) {
                continue
            }
            if (setLinePointFromWorld(line, Number(indexStr), ports[conn.type])) {
                changed = true
            }
        }

        if (changed) {
            line.setCoords()
        }
    }

    canvas.requestRenderAll()
}


function page() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const { resolvedTheme } = useTheme()

    const [canvas, setCanvas] = useState<Canvas | null>(null)
    // Edge/center snapping guidelines — re-enable later
    // const [guidelines, setGuidelines] = useState<Guideline[]>([])

    // state variables updated whenever new frame is added or exisitng frame is modified
    const [refreshKey, setRefreshKey] = useState(0)

    const [drawingMode, setDrawingMode] = useState(false)
    const [flowchartMode, setFlowchartMode] = useState(false)

    const [penMode, setPenMode] = useState(false)
    const [textEdit, setTextEdit] = useState<{
        group: FlowchartNode
        textbox: Textbox
    } | null>(null)

    const [playgroundSettings, setPlaygroundSettings] = useState<PlaygroundSettings>(
        DEFAULT_PLAYGROUND_SETTINGS
    )
    const settingsRef = useRef(playgroundSettings)
    settingsRef.current = playgroundSettings

    useEffect(() => {
        setPlaygroundSettings(loadPlaygroundSettings())
    }, [])

    const updatePlaygroundSettings = (next: PlaygroundSettings) => {
        const sanitized = sanitizePlaygroundSettings(next)
        setPlaygroundSettings(sanitized)
        savePlaygroundSettings(sanitized)
    }

    const getConnectorSnapDistance = () => {
        const { connectorSnap, snapDistance } = settingsRef.current
        return connectorSnap ? snapDistance : 0
    }

    const handleFramesUpdated = () => {
        setRefreshKey(prev => prev + 1)
    }

    useEffect(() => {
        if (!canvas || !resolvedTheme) return
        syncThemeLineColors(canvas, resolvedTheme === 'dark')
    }, [canvas, resolvedTheme])

    // Figma-like polygon pen tool
    useEffect(() => {
        if (!canvas || !penMode) return

        if (canvas.isDrawingMode) {
            canvas.isDrawingMode = false
            setDrawingMode(false)
        }

        const cleanup = activatePolygonPen(canvas, {
            getStroke: () => getThemeLineStroke(resolvedTheme === 'dark'),
            getFill: () =>
                resolvedTheme === 'dark'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(23,23,23,0.04)',
            onRequestExit: () => setPenMode(false),
        })

        return cleanup
    }, [canvas, penMode, resolvedTheme])

    useEffect(() => {
        if (!canvasRef.current || !stageRef.current) return

        const stage = stageRef.current
        const initCanvas = new Canvas(canvasRef.current, {
            // let the CSS paper texture show through
            backgroundColor: '',
            selection: true,
        })
        resizeCanvasToStage(initCanvas, stage)
        initCanvas.renderAll()
        setCanvas(initCanvas)

        const teardownPanZoom = setupPanZoom(initCanvas)

        const onResize = () => resizeCanvasToStage(initCanvas, stage)
        window.addEventListener('resize', onResize)

        initCanvas.on('object:moving', (e) => {
            if (!e.target) return
            // Edge/center snapping + guidelines — re-enable later
            // handleObjectMoving({ canvas: initCanvas, obj: e.target, guidelines, setGuidelines });
            updateConnectedLines({ canvas: initCanvas, obj: e.target });
        });

        initCanvas.on('object:modified', (e) => {
            // clearGuidelines(initCanvas);
            console.log("object modified", e)
        });

        const teardownTextEditing = setupFlowchartTextEditing(initCanvas, {
            onEditStart: (group, textbox) => {
                setTextEdit({ group, textbox })
            },
            onEditEnd: () => {
                setTextEdit(null)
            },
            onEditChange: () => {
                // Keep React menu in sync via FlowchartTextMenu's own listeners.
            },
        })

        return () => {
            teardownTextEditing()
            teardownPanZoom()
            window.removeEventListener('resize', onResize)
            initCanvas.dispose()
            setCanvas(null)
        }
    }, [])

    const enterPenMode = () => {
        setPenMode((prev) => {
            const next = !prev
            if (next && drawingMode) {
                setDrawingMode(false)
                if (canvas) {
                    canvas.isDrawingMode = false
                }
            }
            return next
        })
    }

    const enterDrawingMode = () => {
        if (drawingMode) {
            setDrawingMode(false)
            if (canvas) {
                canvas.isDrawingMode = false
                canvas.renderAll()
            }
            return
        }

        setPenMode(false)
        setDrawingMode(true)
        if (canvas) {
            canvas.isDrawingMode = true
            const pencilBrush = new PencilBrush(canvas)
            pencilBrush.color = getThemeLineStroke(resolvedTheme === 'dark')
            pencilBrush.width = settingsRef.current.brushWidth
            canvas.freeDrawingBrush = pencilBrush
            canvas.renderAll()
        }
    }

    useEffect(() => {
        if (!canvas || !drawingMode || !canvas.freeDrawingBrush) return
        canvas.freeDrawingBrush.width = playgroundSettings.brushWidth
        canvas.requestRenderAll()
    }, [canvas, drawingMode, playgroundSettings.brushWidth])

    const enterFlowchartMode = () => {
        setFlowchartMode((prev) => !prev)
    }

    const handleAddShape = (shapeId: string) => {
        if (!canvas) return

        if (isShapeId(shapeId)) {
            if (shapeId === 'line') {
                SHAPE_ADDERS.line(canvas, {
                    onEndpointDrag: (line, pointIndex) => {
                        snapLinePointToNearestMidpoint(
                            line,
                            pointIndex,
                            canvas,
                            getConnectorSnapDistance()
                        )
                    },
                })
            } else {
                SHAPE_ADDERS[shapeId](canvas)
            }
            return
        }

        if (isFlowchartId(shapeId)) {
            FLOWCHART_ADDERS[shapeId](canvas)
        }
    }

  return (
    <div className={styles.page}>
        <div
          className={styles.canvasStage}
          ref={stageRef}
          data-grid={playgroundSettings.showGrid ? 'on' : 'off'}
          style={
            {
              ['--grid-size' as string]: `${playgroundSettings.gridSize}px`,
            } as React.CSSProperties
          }
        >
            <canvas className={styles.canvas} id="canvas" ref={canvasRef} />
            {canvas && playgroundSettings.showMinimap && <Minimap canvas={canvas} size={75} />}
        </div>

        {canvas && (
          <aside className={`${styles.panel} ${styles.leftPanel}`}>
            <ShapeSidebar onAddShape={handleAddShape} />
          </aside>
        )}

        {canvas && textEdit && (
            <FlowchartTextMenu
                canvas={canvas}
                group={textEdit.group}
                textbox={textEdit.textbox}
                visible
            />
        )}

        {canvas && (
          <div className={styles.topBar}>
            <FilesMenu
              canvas={canvas}
              onCanvasChanged={handleFramesUpdated}
              onConnectorEndpointDrag={(line, pointIndex) => {
                snapLinePointToNearestMidpoint(
                  line,
                  pointIndex,
                  canvas,
                  getConnectorSnapDistance()
                )
              }}
            />
            <Separator orientation="vertical" className="mx-0.5 data-vertical:h-6" />
            <Settings
              canvas={canvas}
              settings={playgroundSettings}
              onSettingsChange={updatePlaygroundSettings}
            />
            <ThemeToggle />
          </div>
        )}

        <div className={styles.toolbar}>
            <Button
              type="button"
              variant={!drawingMode && !penMode ? 'default' : 'ghost'}
              size="icon-sm"
              aria-pressed={!drawingMode && !penMode}
              title="Select"
              onClick={() => {
                setPenMode(false)
                if (drawingMode) enterDrawingMode()
              }}
            >
              <PointerIcon />
            </Button>
            <Button
              type="button"
              variant={drawingMode ? 'default' : 'ghost'}
              size="icon-sm"
              aria-pressed={drawingMode}
              title="Draw"
              onClick={enterDrawingMode}
            >
              <PencilIcon />
            </Button>
            <Button
              type="button"
              variant={penMode ? 'default' : 'ghost'}
              size="icon-sm"
              aria-pressed={penMode}
              title="Pen — draw polygon"
              onClick={enterPenMode}
            >
              <PenToolIcon />
            </Button>
            <Button
              type="button"
              variant={flowchartMode ? 'default' : 'ghost'}
              size="icon-sm"
              aria-pressed={flowchartMode}
              title="Flowchart"
              onClick={enterFlowchartMode}
            >
              <WorkflowIcon />
            </Button>

            <Separator orientation="vertical" className="mx-1 data-vertical:h-6" />

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Add comment"
              disabled={!canvas}
              onClick={() => {
                setPenMode(false)
                if (drawingMode) {
                  setDrawingMode(false)
                  canvas && (canvas.isDrawingMode = false)
                }
                handleAddShape('comment')
              }}
            >
              <MessageSquareText />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Add sticky note"
              disabled={!canvas}
              onClick={() => {
                setPenMode(false)
                if (drawingMode) {
                  setDrawingMode(false)
                  canvas && (canvas.isDrawingMode = false)
                }
                handleAddShape('stickyNote')
              }}
            >
              <StickyNote />
            </Button>
        </div>

        {canvas && (
          <aside className={`${styles.panel} ${styles.rightPanel}`}>
            <Sidebar
              canvas={canvas}
              refreshKey={refreshKey}
              handleFramesUpdated={handleFramesUpdated}
            />
            <Layer canvas={canvas} />
          </aside>
        )}
    </div>
  )
}

export default page