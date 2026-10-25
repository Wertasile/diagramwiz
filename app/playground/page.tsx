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
import { isCropFrame, isExportExcluded } from '@/components/fabric-helper/export-utils'
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

type XY = { x: number; y: number }

type PortMarker = Circle & {
    id?: string
    objectId?: string
    portHostId?: string
    portType?: ConnectionPoint['type']
    isPortMarker?: boolean
}

type ConnectDragState = {
    line: ConnectorLine
    sourceObjectId: string
    sourcePort: ConnectionPoint['type']
}

// ------------------------------------- HELPERS FUNCTIONS FOR LINE SNAPPING TO OBJECT -------------------------------------
const DEFAULT_SNAP_DISTANCE = 20
/** Visual / hit radius of connection port handles. */
const PORT_RADIUS = 6
/** Push ports outward so they clear the shape edge + selection chrome. */
const PORT_OUTSET = 10
const PORT_COLOR = '#0D99FF'

const isPortMarker = (object: FabricObject | null | undefined): object is PortMarker => {
    if (!object) return false
    const tagged = object as PortMarker
    return (
        tagged.isPortMarker === true ||
        Boolean(tagged.id?.startsWith('__port-')) ||
        Boolean(tagged.objectId?.startsWith('__port-'))
    )
}

const isConnectableObject = (object: FabricObject | null | undefined): boolean => {
    if (!object || isPortMarker(object) || isExportExcluded(object)) return false
    if (object instanceof Polyline) return false
    if (object instanceof Textbox) return false
    if (isCropFrame(object)) return false

    if (isFlowchartNode(object)) return true

    const kind = (object as FabricObject & { shapeKind?: string }).shapeKind
    if (
        kind === 'image' ||
        kind === 'comment' ||
        kind === 'stickyNote' ||
        kind === 'textbox' ||
        kind === 'crop' ||
        kind === 'line'
    ) {
        return false
    }
    if (
        kind === 'rectangle' ||
        kind === 'circle' ||
        kind === 'triangle' ||
        kind === 'polygon'
    ) {
        return true
    }

    const type = String(object.type || '').toLowerCase()
    return ['rect', 'circle', 'triangle', 'ellipse', 'polygon'].includes(type)
}

const outsetPortsFromCenter = (
    ports: Record<ConnectionPoint['type'], XY>,
    center: XY,
    distance: number
): Record<ConnectionPoint['type'], XY> => {
    const out = { ...ports }
    for (const key of Object.keys(out) as ConnectionPoint['type'][]) {
        const p = out[key]
        const dx = p.x - center.x
        const dy = p.y - center.y
        const len = Math.hypot(dx, dy) || 1
        out[key] = {
            x: p.x + (dx / len) * distance,
            y: p.y + (dy / len) * distance,
        }
    }
    return out
}

const getObjectPorts = (object: FabricObject): Record<ConnectionPoint['type'], XY> | null => {
    // Snap to the visible shape — flowchart groups use the shape child, not the label box.
    let target: FabricObject = object
    if (isFlowchartNode(object)) {
        const shape = getFlowchartShape(object)
        if (shape) target = shape
    }

    target.setCoords()
    const matrix = target.calcTransformMatrix()
    const w = target.width ?? 0
    const h = target.height ?? 0
    const typed = target as FabricObject & { radius?: number; rx?: number; ry?: number }
    // Circles use radius; ellipses use rx/ry; boxes use width/height (center origin).
    const halfX = typed.radius ?? typed.rx ?? w / 2
    const halfY = typed.radius ?? typed.ry ?? h / 2
    const strokePad = ((target.strokeWidth ?? 0) * Math.max(target.scaleX || 1, target.scaleY || 1)) / 2
    const outset = PORT_OUTSET + strokePad + PORT_RADIUS

    const centerPt = util.transformPoint(new Point(0, 0), matrix)
    const center = { x: centerPt.x, y: centerPt.y }

    // Always transform local edge midpoints through the full matrix so grouped
    // flowchart children resolve to true canvas / world coordinates.
    const localMidpoints: Record<ConnectionPoint['type'], Point> = {
        top: new Point(0, -halfY),
        right: new Point(halfX, 0),
        bottom: new Point(0, halfY),
        left: new Point(-halfX, 0),
    }

    const boxPorts = {
        top: util.transformPoint(localMidpoints.top, matrix),
        right: util.transformPoint(localMidpoints.right, matrix),
        bottom: util.transformPoint(localMidpoints.bottom, matrix),
        left: util.transformPoint(localMidpoints.left, matrix),
    }
    const aabbPorts: Record<ConnectionPoint['type'], XY> = {
        top: { x: boxPorts.top.x, y: boxPorts.top.y },
        right: { x: boxPorts.right.x, y: boxPorts.right.y },
        bottom: { x: boxPorts.bottom.x, y: boxPorts.bottom.y },
        left: { x: boxPorts.left.x, y: boxPorts.left.y },
    }

    // Build world-space silhouette vertices when the box midpoints sit outside the fill.
    const vertices: XY[] = []
    const polyPoints = (target as FabricObject & { points?: { x: number; y: number }[] }).points
    const pathOffset = (target as FabricObject & { pathOffset?: XY }).pathOffset ?? { x: 0, y: 0 }

    if (polyPoints && polyPoints.length >= 3) {
        for (const p of polyPoints) {
            const world = util.transformPoint(
                new Point(p.x - pathOffset.x, p.y - pathOffset.y),
                matrix
            )
            vertices.push({ x: world.x, y: world.y })
        }
    } else if (target.type === 'triangle') {
        const locals = [
            { x: 0, y: -h / 2 },
            { x: -w / 2, y: h / 2 },
            { x: w / 2, y: h / 2 },
        ]
        for (const p of locals) {
            const world = util.transformPoint(new Point(p.x, p.y), matrix)
            vertices.push({ x: world.x, y: world.y })
        }
    } else {
        return outsetPortsFromCenter(aabbPorts, center, outset)
    }

    if (vertices.length < 3) {
        return outsetPortsFromCenter(aabbPorts, center, outset)
    }

    const directions: Record<ConnectionPoint['type'], XY> = {
        top: { x: 0, y: -1 },
        right: { x: 1, y: 0 },
        bottom: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
    }

    const ports = { ...aabbPorts }
    for (const key of Object.keys(directions) as ConnectionPoint['type'][]) {
        const dir = directions[key]
        let bestT = 0
        let best: XY | null = null

        for (let i = 0; i < vertices.length; i++) {
            const a = vertices[i]
            const b = vertices[(i + 1) % vertices.length]
            const edge = { x: b.x - a.x, y: b.y - a.y }
            const denom = dir.x * edge.y - dir.y * edge.x
            if (Math.abs(denom) < 1e-8) continue

            const fromCenter = { x: a.x - center.x, y: a.y - center.y }
            const t = (fromCenter.x * edge.y - fromCenter.y * edge.x) / denom
            const u = (fromCenter.x * dir.y - fromCenter.y * dir.x) / denom
            if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && t > bestT) {
                bestT = t
                best = { x: center.x + dir.x * t, y: center.y + dir.y * t }
            }
        }

        if (best) {
            ports[key] = best
        }
    }

    return outsetPortsFromCenter(ports, center, outset)
}

const calculateCanvasObjectPoints = (canvas: Canvas) => {
    const objects = canvas.getObjects().filter(
        (object) => !(object instanceof Polyline) && !isPortMarker(object) && !isExportExcluded(object)
    )
    return objects.flatMap((object) => {
        if (!isConnectableObject(object)) return []
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
    if (obj instanceof Polyline || isPortMarker(obj)) {
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
    const connectDragRef = useRef<ConnectDragState | null>(null)
    const portHostRef = useRef<FabricObject | null>(null)

    const [, setSelectedObject] = useState<FabricObject | undefined>(undefined)
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

    const isHistoryExcluded = (serialized: Record<string, unknown>) => {
        const id = typeof serialized.id === 'string' ? serialized.id : ''
        return (
            id.startsWith('vertical') ||
            id.startsWith('horizontal') ||
            id.startsWith('__pen-') ||
            id.startsWith('__port-')
        )
    }

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
            return !!isCropFrame || /^(vertical|horizontal|__pen-)/.test(id ?? '')
        })
        resizeCanvasToStage(initCanvas, stage)
        initCanvas.renderAll()
        setCanvas(initCanvas)

        const teardownPanZoom = setupPanZoom(initCanvas)

        const onResize = () => resizeCanvasToStage(initCanvas, stage)
        window.addEventListener('resize', onResize)

        initCanvas.on('object:moving', (e) => {
            if (!e.target || isPortMarker(e.target)) return
            // Edge/center snapping + guidelines — re-enable later
            // handleObjectMoving({ canvas: initCanvas, obj: e.target, guidelines, setGuidelines });
            updateConnectedLines({ canvas: initCanvas, obj: e.target });
        });

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


    // Connection port circles + click-to-connect
    useEffect(() => {
        if (!canvas) return

        const clearPortMarkers = () => {
            const markers = canvas.getObjects().filter(isPortMarker)
            for (const marker of markers) {
                canvas.remove(marker)
            }
        }

        const hostsForPorts = (): FabricObject[] => {
            if (connectDragRef.current) {
                return canvas.getObjects().filter(isConnectableObject)
            }
            const active = canvas.getActiveObject()
            if (active && isConnectableObject(active)) {
                portHostRef.current = active
                return [active]
            }
            // Keep ports while a connectable host stays conceptually selected
            if (portHostRef.current && canvas.getObjects().includes(portHostRef.current)) {
                return [portHostRef.current]
            }
            return []
        }

        const syncPortMarkers = () => {
            clearPortMarkers()
            const hosts = hostsForPorts()
            if (hosts.length === 0) {
                canvas.requestRenderAll()
                return
            }

            for (const host of hosts) {
                const ports = getObjectPorts(host)
                if (!ports) continue
                const hostId = ensureObjectId(host)

                for (const portType of Object.keys(ports) as ConnectionPoint['type'][]) {
                    const pos = ports[portType]
                    const marker = new Circle({
                        left: pos.x,
                        top: pos.y,
                        originX: 'center',
                        originY: 'center',
                        radius: PORT_RADIUS,
                        fill: '#ffffff',
                        stroke: PORT_COLOR,
                        strokeWidth: 2,
                        strokeUniform: true,
                        selectable: false,
                        evented: true,
                        hasControls: false,
                        hasBorders: false,
                        hoverCursor: 'crosshair',
                        objectCaching: false,
                        excludeFromExport: true,
                        // Prefer the port over the host shape / selection handles underneath
                        perPixelTargetFind: false,
                    }) as PortMarker
                    marker.isPortMarker = true
                    marker.id = `__port-${hostId}-${portType}`
                    marker.objectId = marker.id
                    marker.portHostId = hostId
                    marker.portType = portType
                    canvas.add(marker)
                    canvas.bringObjectToFront(marker)
                }
            }
            canvas.requestRenderAll()
        }

        const cancelConnect = (removeLine: boolean) => {
            const drag = connectDragRef.current
            if (!drag) return
            if (removeLine && canvas.getObjects().includes(drag.line)) {
                canvas.remove(drag.line)
            }
            connectDragRef.current = null
            syncPortMarkers()
            canvas.requestRenderAll()
        }

        const startConnectFromPort = (host: FabricObject, portType: ConnectionPoint['type']) => {
            const ports = getObjectPorts(host)
            if (!ports) return
            const start = ports[portType]
            const hostId = ensureObjectId(host)

            // Pen-style open polyline (not the shape-sidebar "line" stub)
            const poly = new Polyline(
                [
                    { x: start.x, y: start.y },
                    { x: start.x + 1, y: start.y },
                ],
                {
                    fill: '',
                    stroke: getThemeLineStroke(),
                    strokeWidth: 2,
                    strokeUniform: true,
                    objectCaching: false,
                    hasBorders: false,
                    lockScalingX: true,
                    lockScalingY: true,
                    lockRotation: true,
                }
            )
            const connector = poly as ConnectorLine & {
                shapeKind?: string
                isOpenPolygon?: boolean
            }
            connector.shapeKind = 'polygon'
            connector.isOpenPolygon = true
            connector.isConnector = true
            connector.endpointConnections = {
                0: { objectId: hostId, type: portType },
                1: null,
            }

            const onEndpointDrag = (dragLine: Polyline, pointIndex: number) => {
                snapLinePointToNearestMidpoint(
                    dragLine,
                    pointIndex,
                    canvas,
                    getConnectorSnapDistance()
                )
            }
            enableLineVertexEditing(canvas, poly, onEndpointDrag)
            poly.on('selected', () => {
                enableLineVertexEditing(canvas, poly, onEndpointDrag)
            })

            addObjectToCanvas(canvas, poly, { centerInViewport: false })
            setLinePointFromWorld(connector, 0, start)
            setLinePointFromWorld(connector, 1, { x: start.x + 1, y: start.y })

            connectDragRef.current = {
                line: connector,
                sourceObjectId: hostId,
                sourcePort: portType,
            }
            canvas.discardActiveObject()
            syncPortMarkers()
        }

        const finishConnectOnPort = (host: FabricObject, portType: ConnectionPoint['type']) => {
            const drag = connectDragRef.current
            if (!drag) return
            const ports = getObjectPorts(host)
            if (!ports) return
            const end = ports[portType]
            const hostId = ensureObjectId(host)

            setLinePointFromWorld(drag.line, 1, end)
            drag.line.endpointConnections ??= { 0: null, 1: null }
            drag.line.endpointConnections[1] = { objectId: hostId, type: portType }
            // Keep source end locked to its port
            const source = canvas.getObjects().find(
                (obj) => ensureObjectId(obj) === drag.sourceObjectId && isConnectableObject(obj)
            )
            if (source) {
                const sourcePorts = getObjectPorts(source)
                if (sourcePorts) {
                    setLinePointFromWorld(drag.line, 0, sourcePorts[drag.sourcePort])
                }
            }
            connectDragRef.current = null
            canvas.setActiveObject(drag.line)
            portHostRef.current = null
            syncPortMarkers()
        }

        const onSelection = () => {
            if (connectDragRef.current) {
                syncPortMarkers()
                return
            }
            const active = canvas.getActiveObject()
            if (active && isConnectableObject(active)) {
                portHostRef.current = active
            } else if (!active) {
                portHostRef.current = null
            }
            setSelectedObject(active ?? undefined)
            selectedObjectRef.current = active ?? undefined
            syncPortMarkers()
        }

        const onMovingOrModified = (e: { target?: FabricObject }) => {
            if (!e.target || isPortMarker(e.target)) return
            if (e.target instanceof Polyline) return
            updateConnectedLines({ canvas, obj: e.target })
            syncPortMarkers()
        }

        const onMouseDown = (opt: { target?: FabricObject; e: Event }) => {
            const target = opt.target
            if (isPortMarker(target) && target.portHostId && target.portType) {
                opt.e.preventDefault()
                opt.e.stopPropagation()
                const host = canvas.getObjects().find(
                    (obj) => ensureObjectId(obj) === target.portHostId && isConnectableObject(obj)
                )
                if (!host) return

                if (connectDragRef.current) {
                    finishConnectOnPort(host, target.portType)
                } else {
                    startConnectFromPort(host, target.portType)
                }
                return
            }

            if (connectDragRef.current && !isPortMarker(target)) {
                // Empty / other click — keep free endpoint, exit connect mode
                connectDragRef.current = null
                syncPortMarkers()
            }
        }

        const onMouseMove = (opt: { e: Event }) => {
            const drag = connectDragRef.current
            if (!drag) return
            const e = opt.e as MouseEvent
            const pointer = canvas.getScenePoint(e)
            setLinePointFromWorld(drag.line, 1, { x: pointer.x, y: pointer.y })
            // Keep source glued while dragging
            const source = canvas.getObjects().find(
                (obj) => ensureObjectId(obj) === drag.sourceObjectId && isConnectableObject(obj)
            )
            if (source) {
                const sourcePorts = getObjectPorts(source)
                if (sourcePorts) {
                    setLinePointFromWorld(drag.line, 0, sourcePorts[drag.sourcePort])
                }
            }
            canvas.requestRenderAll()
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (!connectDragRef.current) return
            e.preventDefault()
            cancelConnect(true)
        }

        syncPortMarkers()
        canvas.on('selection:created', onSelection)
        canvas.on('selection:updated', onSelection)
        canvas.on('selection:cleared', onSelection)
        canvas.on('object:moving', onMovingOrModified)
        canvas.on('object:modified', onMovingOrModified)
        canvas.on('mouse:down', onMouseDown)
        canvas.on('mouse:move', onMouseMove)
        window.addEventListener('keydown', onKeyDown)

        return () => {
            const drag = connectDragRef.current
            if (drag && canvas.getObjects().includes(drag.line)) {
                canvas.remove(drag.line)
            }
            connectDragRef.current = null
            clearPortMarkers()
            canvas.off('selection:created', onSelection)
            canvas.off('selection:updated', onSelection)
            canvas.off('selection:cleared', onSelection)
            canvas.off('object:moving', onMovingOrModified)
            canvas.off('object:modified', onMovingOrModified)
            canvas.off('mouse:down', onMouseDown)
            canvas.off('mouse:move', onMouseMove)
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [canvas])

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

        {/* -------------------------- LEFT SIDEBAR -------------------------- */}
        {canvas && (
          <aside className={`${styles.panel} ${styles.leftPanel}`}>
            <ShapeSidebar onAddShape={handleAddShape} />
          </aside>
        )}

        {/* -------------------------- TEXT EDIT MENU -------------------------- */}
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