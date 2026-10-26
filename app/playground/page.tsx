'use client'

import {
    Canvas,
    Circle,
    FabricObject,
    InteractiveFabricObject,
    PencilBrush,
    Point,
    Polyline,
    Textbox,
    util,
} from 'fabric'
import React, { useRef, useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import styles from './playground.module.css'
import { PointerIcon, WorkflowIcon, PencilIcon, PenToolIcon, MessageSquareText, StickyNote, EraserIcon, Undo2, Redo2 } from 'lucide-react'
import Sidebar from '@/components/fabric/RightSidebar'
import Layer from '@/components/fabric/Layer'
import FlowchartTextMenu from '@/components/fabric/FlowchartTextMenu'
import ConnectorMenu from '@/components/fabric/ConnectorMenu'
import { ElbowConnector } from '@/components/fabric-helper/connectors/elbow-connector'
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
import { addObjectToCanvas, ensureObjectId } from '@/components/fabric-helper/object-utils'
import {
    SHAPE_ADDERS,
    enableLineVertexEditing,
    isShapeId,
    type ConnectionPoint,
    type ConnectorLine,
} from '@/components/fabric-helper/add-shapes'
import { isExportExcluded } from '@/components/fabric-helper/export-utils'
import { FLOWCHART_ADDERS, isFlowchartId } from '@/components/fabric-helper/add-flowchart'
import {
    getFlowchartShape,
    isFlowchartNode,
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
import { BroomIcon } from '@phosphor-icons/react'
import { applyErasableDefaults, createEraser, eraserBrushCursorUrl, pencilBrushCursorUrl, type EraserHandle } from '@/components/fabric-helper/erase-utils'
import EraserOptions from '@/components/fabric/EraserOptions'
import PencilOptions from '@/components/fabric/PencilOptions'
import PenOptions from '@/components/fabric/PenOptions'
import {
    CANVAS_CUSTOM_PROPERTIES,
    registerCanvasCustomProperties,
    rehydrateCanvasObjects,
} from '@/components/fabric-helper/canvas-io'
import {
    isPortMarker,
    snapLinePointToNearestMidpoint,
    updateConnectedLines,
} from '@/components/fabric-helper/connectors/ports'
import { setupConnectorInteractions } from '@/components/fabric-helper/connectors/interactions'
import { isPlaceableId, startPlacement } from '@/components/fabric-helper/connectors/placement'
import { isEphemeralId } from '@/components/fabric-helper/export-utils'

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

    const [eraserMode, setEraserMode] = useState(false)
    const [eraserWidth, setEraserWidth] = useState(24)
    const [eraserRestore, setEraserRestore] = useState(false)
    const [removeFullyErased, setRemoveFullyErased] = useState(true)
    const removeFullyErasedRef = useRef(removeFullyErased)
    removeFullyErasedRef.current = removeFullyErased
    const eraserRef = useRef<EraserHandle | null>(null)

    const [penMode, setPenMode] = useState(false)
    const [pencilWidth, setPencilWidth] = useState(DEFAULT_PLAYGROUND_SETTINGS.brushWidth)
    const [pencilColor, setPencilColor] = useState('#171717')
    const pencilWidthRef = useRef(pencilWidth)
    pencilWidthRef.current = pencilWidth
    const pencilColorRef = useRef(pencilColor)
    pencilColorRef.current = pencilColor

    const [penStrokeWidth, setPenStrokeWidth] = useState(2)
    const [penStrokeColor, setPenStrokeColor] = useState('#171717')
    const [penFillColor, setPenFillColor] = useState('#171717')
    const [penUseFill, setPenUseFill] = useState(false)
    const penStrokeWidthRef = useRef(penStrokeWidth)
    penStrokeWidthRef.current = penStrokeWidth
    const penStrokeColorRef = useRef(penStrokeColor)
    penStrokeColorRef.current = penStrokeColor
    const penFillColorRef = useRef(penFillColor)
    penFillColorRef.current = penFillColor
    const penUseFillRef = useRef(penUseFill)
    penUseFillRef.current = penUseFill

    const [textEdit, setTextEdit] = useState<{
        group: FlowchartNode
        textbox: Textbox
    } | null>(null)

    const [playgroundSettings, setPlaygroundSettings] = useState<PlaygroundSettings>(
        DEFAULT_PLAYGROUND_SETTINGS
    )
    const settingsRef = useRef(playgroundSettings)
    settingsRef.current = playgroundSettings

    const [selectedObject, setSelectedObject] = useState<FabricObject | undefined>(undefined)
    const selectedObjectRef = useRef<FabricObject | undefined>(undefined)

    // Undo / redo history
    const undoStackRef = useRef<string[]>([])
    const redoStackRef = useRef<string[]>([])
    const isProcessingHistoryRef = useRef(false)
    const historySaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)

    const updateHistoryButtons = () => {
        setCanUndo(undoStackRef.current.length > 1)
        setCanRedo(redoStackRef.current.length > 0)
    }

    const isHistoryExcluded = (serialized: Record<string, unknown>) => isEphemeralId(serialized.id)

    // Fabric v6: pass custom props to toObject(), not toJSON() (toJSON takes no args).
    const serializeCanvas = (targetCanvas: Canvas) => {
        registerCanvasCustomProperties()
        const raw = targetCanvas.toObject([...CANVAS_CUSTOM_PROPERTIES]) as Record<string, unknown>
        const objects = Array.isArray(raw.objects) ? raw.objects : []
        raw.objects = objects.filter(
            (entry): entry is Record<string, unknown> =>
                Boolean(entry) &&
                typeof entry === 'object' &&
                !isHistoryExcluded(entry as Record<string, unknown>)
        )
        // Keep live stage size & pan/zoom — only object graph belongs in history.
        delete raw.width
        delete raw.height
        delete raw.viewportTransform
        return JSON.stringify(raw)
    }

    const restoreHistoryState = async (targetCanvas: Canvas, snapshot: string) => {
        const previousVpt = [...targetCanvas.viewportTransform] as [
            number, number, number, number, number, number,
        ]
        const width = targetCanvas.getWidth()
        const height = targetCanvas.getHeight()

        targetCanvas.discardActiveObject()
        await targetCanvas.loadFromJSON(JSON.parse(snapshot))
        targetCanvas.setDimensions({ width, height })
        targetCanvas.setViewportTransform(previousVpt)
        rehydrateCanvasObjects(targetCanvas, {
            onEndpointDrag: (line, pointIndex) => {
                const { connectorSnap, snapDistance } = settingsRef.current
                snapLinePointToNearestMidpoint(
                    line,
                    pointIndex,
                    targetCanvas,
                    connectorSnap ? snapDistance : 0
                )
            },
        })
        // Drop any history saves queued by loadFromJSON's object:added events.
        if (historySaveTimeoutRef.current !== null) {
            clearTimeout(historySaveTimeoutRef.current)
            historySaveTimeoutRef.current = null
        }
        targetCanvas.requestRenderAll()
        setRefreshKey((prev) => prev + 1)
    }

    const saveHistoryState = (targetCanvas: Canvas) => {
        if (isProcessingHistoryRef.current) return

        const snapshot = serializeCanvas(targetCanvas)
        const history = undoStackRef.current

        // Avoid storing identical consecutive states.
        if (history[history.length - 1] === snapshot) return

        history.push(snapshot)

        // Keep history bounded.
        if (history.length > 50) {
            history.shift()
        }

        // A new action invalidates the redo timeline.
        redoStackRef.current = []
        updateHistoryButtons()
    }

    // Coalesce multiple canvas events from one operation into one snapshot.
    const scheduleHistorySave = (targetCanvas: Canvas) => {
        if (isProcessingHistoryRef.current) return

        if (historySaveTimeoutRef.current !== null) {
            clearTimeout(historySaveTimeoutRef.current)
        }

        historySaveTimeoutRef.current = setTimeout(() => {
            historySaveTimeoutRef.current = null
            saveHistoryState(targetCanvas)
        }, 0)
    }

    const handleUndo = async () => {
        const targetCanvas = canvas
        const history = undoStackRef.current

        if (!targetCanvas || history.length <= 1 || isProcessingHistoryRef.current) {
            return
        }

        isProcessingHistoryRef.current = true

        try {
            const currentState = history.pop()!
            redoStackRef.current.push(currentState)
            const previousState = history[history.length - 1]
            await restoreHistoryState(targetCanvas, previousState)
        } catch (error) {
            console.error('Undo failed:', error)
        } finally {
            isProcessingHistoryRef.current = false
            updateHistoryButtons()
        }
    }

    const handleRedo = async () => {
        const targetCanvas = canvas
        const redoStack = redoStackRef.current

        if (!targetCanvas || redoStack.length === 0 || isProcessingHistoryRef.current) {
            return
        }

        isProcessingHistoryRef.current = true

        try {
            const nextState = redoStack.pop()!
            undoStackRef.current.push(nextState)
            await restoreHistoryState(targetCanvas, nextState)
        } catch (error) {
            console.error('Redo failed:', error)
        } finally {
            isProcessingHistoryRef.current = false
            updateHistoryButtons()
        }
    }


    useEffect(() => {
        const loaded = loadPlaygroundSettings()
        setPlaygroundSettings(loaded)
        setPencilWidth(loaded.brushWidth)
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
        if (!resolvedTheme) return
        const stroke = getThemeLineStroke(resolvedTheme === 'dark')
        setPencilColor(stroke)
        setPenStrokeColor(stroke)
        setPenFillColor(resolvedTheme === 'dark' ? '#ffffff' : '#171717')
    }, [resolvedTheme])

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
            getStroke: () => penStrokeColorRef.current,
            getFill: () =>
                penUseFillRef.current
                    ? penFillColorRef.current
                    : 'transparent',
            getStrokeWidth: () => penStrokeWidthRef.current,
            onRequestExit: () => setPenMode(false),
            onEndpointDrag: (line, pointIndex) => {
                snapLinePointToNearestMidpoint(
                    line,
                    pointIndex,
                    canvas,
                    getConnectorSnapDistance()
                )
            },
        })

        return cleanup
    }, [canvas, penMode])

    useEffect(() => {
        if (!canvasRef.current || !stageRef.current) return

        const stage = stageRef.current

        // Figma-like selection chrome (deep blue border, white square handles)
        Object.assign(InteractiveFabricObject.ownDefaults, {
            borderColor: '#0D99FF',
            borderScaleFactor: 1.5,
            cornerColor: '#ffffff',
            cornerStrokeColor: '#0D99FF',
            cornerStyle: 'rect',
            cornerSize: 8,
            transparentCorners: false,
            padding: 0,
        })

        const initCanvas = new Canvas(canvasRef.current, {
            // let the CSS paper texture show through
            backgroundColor: '',
            selection: true,
        })
        const teardownErasableDefaults = applyErasableDefaults(initCanvas, (object) => {
            const { isCropFrame, id } = object as FabricObject & { isCropFrame?: boolean; id?: string }
            return !!isCropFrame || isEphemeralId(id)
        })
        resizeCanvasToStage(initCanvas, stage)
        initCanvas.renderAll()
        setCanvas(initCanvas)

        const teardownPanZoom = setupPanZoom(initCanvas)

        const onResize = () => resizeCanvasToStage(initCanvas, stage)
        window.addEventListener('resize', onResize)

        const onObjectTransforming = (e: { target?: FabricObject }) => {
            if (!e.target || isPortMarker(e.target)) return
            // Edge/center snapping + guidelines — re-enable later
            // handleObjectMoving({ canvas: initCanvas, obj: e.target, guidelines, setGuidelines });
            updateConnectedLines({ canvas: initCanvas, obj: e.target })
        }
        initCanvas.on('object:moving', onObjectTransforming)
        initCanvas.on('object:scaling', onObjectTransforming)
        initCanvas.on('object:rotating', onObjectTransforming)

        const isEphemeralHistoryTarget = (target?: FabricObject | null) => {
            if (!target) return true
            if (isPortMarker(target) || isExportExcluded(target)) return true
            return false
        }

        const handleObjectModified = () => {
            scheduleHistorySave(initCanvas)
        }
        const handleObjectAdded = (e: { target?: FabricObject }) => {
            if (isEphemeralHistoryTarget(e.target)) return
            scheduleHistorySave(initCanvas)
        }
        const handleObjectRemoved = (e: { target?: FabricObject }) => {
            if (isEphemeralHistoryTarget(e.target)) return
            scheduleHistorySave(initCanvas)
        }
        const handlePathCreated = () => {
            scheduleHistorySave(initCanvas)
        }

        initCanvas.on('object:modified', handleObjectModified)
        initCanvas.on('object:added', handleObjectAdded)
        initCanvas.on('object:removed', handleObjectRemoved)
        initCanvas.on('path:created', handlePathCreated)

        // Initial state: the empty canvas.
        saveHistoryState(initCanvas)

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

        const handleKeyDown = (e: KeyboardEvent) => {
            const activeObject = initCanvas.getActiveObject()

            // Ignore shortcuts while editing text in Fabric.js.
            if (activeObject instanceof Textbox && activeObject.isEditing) {
                return
            }

            // Ignore shortcuts in regular HTML input fields.
            const target = e.target
            if (
                target instanceof HTMLElement &&
                (
                    target.isContentEditable ||
                    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
                )
            ) {
                return
            }

            // Delete a selected textbox only when it isn't being edited.
            if (e.key === 'Backspace') {
                if (activeObject instanceof Textbox) {
                    e.preventDefault()
                    initCanvas.remove(activeObject)
                    initCanvas.discardActiveObject()
                    initCanvas.requestRenderAll()
                }
                return
            }

            // Disable tool shortcuts whenever a textbox is selected.
            if (selectedObjectRef.current instanceof Textbox) {
                return
            }

            if (e.shiftKey && e.key.toLowerCase() === 'p') {
                e.preventDefault()
                enterPenModeRef.current()
            } else if (e.key.toLowerCase() === 'p') {
                e.preventDefault()
                enterDrawingModeRef.current()
            } else if (e.key.toLowerCase() === 'e') {
                e.preventDefault()
                enterEraserModeRef.current()
            } else if (e.key.toLowerCase() === 'v') {
                e.preventDefault()
                enterSelectModeRef.current()
            } else if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase()

                if (key === 'z') {
                    e.preventDefault()
                    if (e.shiftKey) {
                        void handleRedoRef.current()
                    } else {
                        void handleUndoRef.current()
                    }
                    return
                }

                if (key === 'y') {
                    e.preventDefault()
                    void handleRedoRef.current()
                    return
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)

        return () => {
            teardownErasableDefaults()
            teardownTextEditing()
            teardownPanZoom()
            window.removeEventListener('resize', onResize)
            window.removeEventListener('keydown', handleKeyDown)
            initCanvas.off('object:moving', onObjectTransforming)
            initCanvas.off('object:scaling', onObjectTransforming)
            initCanvas.off('object:rotating', onObjectTransforming)
            initCanvas.off('object:modified', handleObjectModified)
            initCanvas.off('object:added', handleObjectAdded)
            initCanvas.off('object:removed', handleObjectRemoved)
            initCanvas.off('path:created', handlePathCreated)

            if (historySaveTimeoutRef.current !== null) {
                clearTimeout(historySaveTimeoutRef.current)
                historySaveTimeoutRef.current = null
            }
            initCanvas.dispose()
            setCanvas(null)
        }
    }, [])

    const enterSelectMode = () => {
        setPenMode(false)
        setDrawingMode(false)
        setEraserMode(false)
        if (canvas) {
            canvas.isDrawingMode = false
            canvas.renderAll()
        }
    }

    const enterPenMode = () => {
        setEraserMode(false)
        setDrawingMode(false)
        if (canvas) {
            canvas.isDrawingMode = false
        }
        setPenMode((prev) => !prev)
    }

    const enterDrawingMode = () => {
        if (drawingMode) {
            enterSelectMode()
            return
        }
        setPenMode(false)
        setEraserMode(false)
        setDrawingMode(true) // effect below installs the brush
    }

    const enterEraserMode = () => {
        if (eraserMode) {
            enterSelectMode()
            return
        }
        setPenMode(false)
        setDrawingMode(false)
        setEraserMode(true) // the effect below installs the brush
    }

    // Keep latest tool handlers for the mount-only keydown listener
    const enterSelectModeRef = useRef(enterSelectMode)
    enterSelectModeRef.current = enterSelectMode
    const enterPenModeRef = useRef(enterPenMode)
    enterPenModeRef.current = enterPenMode
    const enterDrawingModeRef = useRef(enterDrawingMode)
    enterDrawingModeRef.current = enterDrawingMode
    const enterEraserModeRef = useRef(enterEraserMode)
    enterEraserModeRef.current = enterEraserMode
    const handleUndoRef = useRef(handleUndo)
    handleUndoRef.current = handleUndo
    const handleRedoRef = useRef(handleRedo)
    handleRedoRef.current = handleRedo

    // Create / dispose the pencil brush while drawing mode is on
    useEffect(() => {
        if (!canvas || !drawingMode) return
        const pencilBrush = new PencilBrush(canvas)
        pencilBrush.color = pencilColorRef.current
        pencilBrush.width = pencilWidthRef.current
        canvas.freeDrawingBrush = pencilBrush
        canvas.freeDrawingCursor = pencilBrushCursorUrl(pencilColorRef.current)
        canvas.isDrawingMode = true
        canvas.renderAll()
        return () => {
            canvas.isDrawingMode = false
            if (canvas.freeDrawingBrush === pencilBrush) {
                canvas.freeDrawingBrush = undefined
            }
            canvas.freeDrawingCursor = 'default'
            canvas.renderAll()
        }
    }, [canvas, drawingMode])

    // Keep the live pencil brush in sync with the options bar
    useEffect(() => {
        if (!canvas || !drawingMode || !canvas.freeDrawingBrush) return
        canvas.freeDrawingBrush.width = pencilWidth
        canvas.freeDrawingBrush.color = pencilColor
        canvas.freeDrawingCursor = pencilBrushCursorUrl(pencilColor)
        canvas.requestRenderAll()
    }, [canvas, drawingMode, pencilWidth, pencilColor])

    // Create / dispose the eraser brush while eraser mode is on
    useEffect(() => {
        if (!canvas || !eraserMode) return
        const handle = createEraser(canvas, {
            width: eraserWidth,
            inverted: eraserRestore,
            shouldRemoveFullyErased: () => removeFullyErasedRef.current,
        })
        eraserRef.current = handle
        canvas.freeDrawingBrush = handle.eraser
        canvas.freeDrawingCursor = eraserBrushCursorUrl(eraserWidth)
        canvas.isDrawingMode = true
        canvas.renderAll()
        return () => {
            handle.dispose()
            eraserRef.current = null
            if (canvas.freeDrawingBrush === handle.eraser) canvas.freeDrawingBrush = undefined
            canvas.freeDrawingCursor = 'default'
        }
        // width / restore are pushed into the live brush below, so they are not deps here
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvas, eraserMode])

    // Keep the live eraser brush in sync with the options bar (must stay AFTER the effect above)
    useEffect(() => {
        if (!eraserMode || !canvas || !eraserRef.current) return

        eraserRef.current.eraser.width = eraserWidth
        eraserRef.current.eraser.inverted = eraserRestore

        canvas.freeDrawingCursor = eraserBrushCursorUrl(eraserWidth)
        canvas.renderAll()
    }, [canvas, eraserMode, eraserWidth, eraserRestore])


    // Connectors: port markers, drag-to-connect with snapping, hover quick-add
    useEffect(() => {
        if (!canvas) return
        return setupConnectorInteractions(canvas, {
            getSnapDistance: getConnectorSnapDistance,
            onSelectionChange: (active) => {
                setSelectedObject(active)
                selectedObjectRef.current = active
            },
        })
    }, [canvas])

    const enterFlowchartMode = () => {
        setFlowchartMode((prev) => !prev)
    }

    /** Sidebar click: shapes follow the cursor as a preview until the next click places them. */
    const handleSidebarAdd = (shapeId: string) => {
        if (!canvas) return
        if (isPlaceableId(shapeId) && startPlacement(canvas, shapeId)) return
        handleAddShape(shapeId)
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

        {/* -------------------------- LEFT SIDEBAR -------------------------- */}
        {canvas && (
          <aside className={`${styles.panel} ${styles.leftPanel}`}>
            <ShapeSidebar onAddShape={handleSidebarAdd} />
          </aside>
        )}

        {/* -------------------------- TEXT EDIT MENU -------------------------- */}
        {canvas && selectedObject instanceof ElbowConnector && (
            <ConnectorMenu canvas={canvas} connector={selectedObject} />
        )}

        {canvas && textEdit && (
            <FlowchartTextMenu
                canvas={canvas}
                group={textEdit.group}
                textbox={textEdit.textbox}
                visible
            />
        )}

        {/* -------------------------- TOP SETTINGS MENU -------------------------- */}
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
            <Button variant="outline" size="icon-sm" aria-label="Clear canvas" title="Clear canvas" 
              onClick={() => {
                if (canvas) {
                    canvas.clear()
                    canvas.renderAll()
                }
              }}
            >
                <BroomIcon />
            </Button>
          </div>
        )}

        {/* -------------------------- TOOLBAR -------------------------- */}
        <div className={styles.toolbar}>
            <Button
              type="button"
              variant={!drawingMode && !penMode && !eraserMode ? 'default' : 'ghost'}
              size="icon-lg"
              aria-pressed={!drawingMode && !penMode && !eraserMode}
              title="Select"
              onClick={enterSelectMode}
            >
              <PointerIcon />
            </Button>

            <Button
              type="button"
              variant={drawingMode ? 'default' : 'ghost'}
              size="icon-lg"
              aria-pressed={drawingMode}
              title="Draw"
              onClick={enterDrawingMode}
            >
              <PencilIcon />
            </Button>

            <Button
              type="button"
              variant={penMode ? 'default' : 'ghost'}
              size="icon-lg"
              aria-pressed={penMode}
              title="Pen — draw polygon"
              onClick={enterPenMode}
            >
              <PenToolIcon />
            </Button>
            <Button
              type="button"
              variant={flowchartMode ? 'default' : 'ghost'}
              size="icon-lg"
              aria-pressed={flowchartMode}
              title="Flowchart"
              onClick={enterFlowchartMode}
            >
              <WorkflowIcon />
            </Button>
            <Button
              type="button"
              variant={eraserMode ? 'default' : 'ghost'}
              size="icon-lg"
              aria-pressed={eraserMode}
              title="Eraser"
              onClick={enterEraserMode}
            >
              <EraserIcon />
            </Button>

            <Separator orientation="vertical" className="mx-1 data-vertical:h-6" />

            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              title="Add comment"
              disabled={!canvas}
              onClick={() => {
                enterSelectMode()
                handleAddShape('comment')
              }}
            >
              <MessageSquareText />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              title="Add sticky note"
              disabled={!canvas}
              onClick={() => {
                enterSelectMode()
                handleAddShape('stickyNote')
              }}
            >
              <StickyNote />
            </Button>

            <Separator orientation="vertical" className="mx-1 data-vertical:h-6" />

            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
              disabled={!canUndo}
              onClick={() => void handleUndo()}
            >
              <Undo2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Redo"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              disabled={!canRedo}
              onClick={() => void handleRedo()}
            >
              <Redo2 />
            </Button>
        </div>

        {canvas && drawingMode && (
          <PencilOptions
            width={pencilWidth}
            onWidthChange={setPencilWidth}
            color={pencilColor}
            onColorChange={setPencilColor}
          />
        )}

        {canvas && penMode && (
          <PenOptions
            strokeWidth={penStrokeWidth}
            onStrokeWidthChange={setPenStrokeWidth}
            strokeColor={penStrokeColor}
            onStrokeColorChange={setPenStrokeColor}
            fillColor={penFillColor}
            onFillColorChange={setPenFillColor}
            useFill={penUseFill}
            onUseFillChange={setPenUseFill}
          />
        )}

        {canvas && eraserMode && (
          <EraserOptions
            width={eraserWidth}
            onWidthChange={setEraserWidth}
            restore={eraserRestore}
            onRestoreChange={setEraserRestore}
            removeFullyErased={removeFullyErased}
            onRemoveFullyErasedChange={setRemoveFullyErased}
          />
        )}

        {/* -------------------------- RIGHT SIDEBAR -------------------------- */}
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