import { Canvas, FabricObject, Polyline } from "fabric"

// defines how close object needs to be to snap to another edge
const snappingDistance = 20;

export type Guideline = Polyline & { id: string };

type HandleObjectMovingProps = {
    canvas: Canvas;
    obj: FabricObject;
    guidelines: Guideline[];
    setGuidelines: (guidelines: Guideline[]) => void;
}

// Canvas, moving object, 
export const handleObjectMoving = ({ canvas, obj, guidelines, setGuidelines }: HandleObjectMovingProps) => {

    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;

    const objLeft = obj.left;
    const objTop = obj.top;
    const objRight = objLeft + obj.width * obj.scaleX;
    const objBottom = objTop + obj.height * obj.scaleY;

    const centerX = objLeft + (obj.width * obj.scaleX) / 2;
    const centerY = objTop + (obj.height * obj.scaleY) / 2;
    
    let newGuidelines = []
    clearGuidelines(canvas);
    
    let snapped = false;

    // check if the object is close to the canvas left edge
    if (Math.abs(objLeft) < snappingDistance) {
        obj.set({ left: 0 });
        if (!guidelineExists(canvas,"vertical-left")){

            const line = createVerticalGuideline(canvas, 0, "vertical-left");
            newGuidelines.push(line);
            canvas.add(line);
        }
        snapped = true;
    }

    // check if the object is close to the canvas right edge
    if (Math.abs(objRight - canvasWidth) < snappingDistance) {
        obj.set({ left: canvasWidth - obj.width * obj.scaleX });
        if (!guidelineExists(canvas,"vertical-right")){
            const line = createVerticalGuideline(canvas, canvasWidth, "vertical-right");
            newGuidelines.push(line);
            canvas.add(line);
        }
        snapped = true;
    }

    // check if the object is close to the canvas top edge
    if (Math.abs(objTop) < snappingDistance) {
        obj.set({ top: 0 });
        if (!guidelineExists(canvas,"horizontal-top")){
            const line = createHorizontalGuideline(canvas, 0, "horizontal-top");
            newGuidelines.push(line);
            canvas.add(line);
        }
        snapped = true;
    }

    // check if the object is close to the canvas bottom edge
    if (Math.abs(objBottom - canvasHeight) < snappingDistance) {
        obj.set({ top: canvasHeight - obj.height * obj.scaleY });
        if (!guidelineExists(canvas,"horizontal-bottom")){
            const line = createHorizontalGuideline(canvas, canvasHeight, "horizontal-bottom");
            newGuidelines.push(line);
            canvas.add(line);
        }
        snapped = true;
    }

    if (!snapped) {
        clearGuidelines(canvas);
    } else {
        setGuidelines(newGuidelines as Guideline[]);
    }

    canvas.renderAll();
}

export const createVerticalGuideline = (canvas: Canvas, x: number, id: string) => {
    return new Polyline([{ x, y: 0 }, { x, y: canvas.height }], {
        stroke: 'red',
        strokeWidth: 2,
        id: id,
    });
}

export const createHorizontalGuideline = (canvas: Canvas, y: number, id: string) => {
    return new Polyline([{ x: 0, y }, { x: canvas.width, y }], {
        id: id,
        stroke: 'red',
        strokeWidth: 2,
    });
}

export const clearGuidelines = (canvas: Canvas) => {
    const objects = canvas.getObjects("polyline") as Guideline[];
    objects.forEach((object) => {
        if ((object as Guideline).id?.startsWith("vertical-") || (object as Guideline).id?.startsWith("horizontal-")) {
            canvas.remove(object);
        }
    });
    canvas.renderAll();
}

export const guidelineExists = (canvas: Canvas, id: string) => {
    const objects = canvas.getObjects("polyline") as Guideline[];
    return objects.some((object) => (object as Guideline).id === id);
}