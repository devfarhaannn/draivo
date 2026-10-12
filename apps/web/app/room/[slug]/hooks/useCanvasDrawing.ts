"use client";

import {
    useRef,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from "react";

import type {
    CanvasElement,
    Point,
    ToolId,
} from "../types/whiteboard";

import { hitTest } from "../lib/canvas/hitTest";

type Pan = {
    x: number;
    y: number;
};

export type TextEditingTarget = {
    x: number;
    y: number;
    text: string;
    fontSize: number;
    elementId: number | null;
};

export type NoteEditingTarget = {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    elementId: number | null;
};

type UseCanvasDrawingProps = {
    containerRef: RefObject<HTMLDivElement | null>;
    activeTool: ToolId;
    zoom: number;
    pan: Pan;
    elements: CanvasElement[];
    onToolChange: (tool: ToolId) => void;

    addElement: (element: CanvasElement) => void;

    updateElement: (
        id: number,
        update: (
            element: CanvasElement
        ) => CanvasElement
    ) => void;

    deleteElement: (id: number) => void;

    selectElement: (id: number | null) => void;

    beginHistory: () => CanvasElement[];

    commitHistory: (
        beforeElements: CanvasElement[]
    ) => void;

    spacePressed: boolean;

    onStartTextEditing: (
        target: TextEditingTarget
    ) => void;

    onStartNoteEditing: (
        target: NoteEditingTarget
    ) => void;
};

type DrawingState =
    | {
        active: false;
    }
    | {
        active: true;
        mode: "draw" | "move" | "erase";
        elementId: number;
        tool: ToolId;
        lastWorld: Point;
        startWorld?: Point;
        beforeElements: CanvasElement[];
    };

const MIN_SHAPE_SIZE = 12;
const MIN_NOTE_WIDTH = 80;
const MIN_NOTE_HEIGHT = 60;
const DEFAULT_NOTE_WIDTH = 180;
const DEFAULT_NOTE_HEIGHT = 120;

function createId() {
    return (
        Date.now() +
        Math.floor(Math.random() * 1000)
    );
}

function isShapeTool(
    tool: ToolId
): tool is
    | "rectangle"
    | "diamond"
    | "ellipse"
    | "line"
    | "arrow" {
    return (
        tool === "rectangle" ||
        tool === "diamond" ||
        tool === "ellipse" ||
        tool === "line" ||
        tool === "arrow"
    );
}

function moveElement(
    element: CanvasElement,
    deltaX: number,
    deltaY: number
): CanvasElement {
    switch (element.type) {
        case "rectangle":
        case "diamond":
        case "ellipse":
        case "line":
        case "arrow":
            return {
                ...element,
                x1: element.x1 + deltaX,
                y1: element.y1 + deltaY,
                x2: element.x2 + deltaX,
                y2: element.y2 + deltaY,
            };

        case "draw":
            return {
                ...element,
                points: element.points.map((point) => ({
                    x: point.x + deltaX,
                    y: point.y + deltaY,
                })),
            };

        case "text":
            return {
                ...element,
                x: element.x + deltaX,
                y: element.y + deltaY,
            };

        case "note":
            return {
                ...element,
                x: element.x + deltaX,
                y: element.y + deltaY,
            };
    }
}

export function useCanvasDrawing({
    containerRef,
    activeTool,
    zoom,
    pan,
    elements,
    addElement,
    updateElement,
    deleteElement,
    selectElement,
    beginHistory,
    commitHistory,
    spacePressed,
    onStartTextEditing,
    onStartNoteEditing,
    onToolChange,
}: UseCanvasDrawingProps) {
    const drawingRef = useRef<DrawingState>({
        active: false,
    });

    function screenToWorld(
        clientX: number,
        clientY: number
    ): Point {
        const container = containerRef.current;

        if (!container) {
            return { x: 0, y: 0 };
        }

        const rect = container.getBoundingClientRect();
        const scale = Math.max(zoom / 100, 0.01);

        return {
            x:
                (
                    clientX -
                    rect.left -
                    rect.width / 2 -
                    pan.x
                ) / scale,

            y:
                (
                    clientY -
                    rect.top -
                    rect.height / 2 -
                    pan.y
                ) / scale,
        };
    }
    function handleDoubleClick(
        event: ReactMouseEvent<HTMLDivElement>
    ) {
        if (
            activeTool !== "select" ||
            spacePressed ||
            event.button !== 0
        ) {
            return;
        }

        const world = screenToWorld(
            event.clientX,
            event.clientY
        );

        const selected = hitTest(world, elements);

        if (!selected) {
            return;
        }

        // Prevent the double-click from leaving a drag active.
        drawingRef.current = {
            active: false,
        };

        selectElement(selected.id);

        if (selected.type === "note") {
            onStartNoteEditing({
                x: selected.x,
                y: selected.y,
                width: selected.width,
                height: selected.height,
                text: selected.text,
                elementId: selected.id,
            });

            return;
        }

        if (selected.type === "text") {
            onStartTextEditing({
                x: selected.x,
                y: selected.y,
                text: selected.text,
                fontSize: selected.fontSize ?? 20,
                elementId: selected.id,
            });
        }
    }

    function releasePointer(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        if (
            event.currentTarget.hasPointerCapture(
                event.pointerId
            )
        ) {
            event.currentTarget.releasePointerCapture(
                event.pointerId
            );
        }
    }

    function handlePointerDown(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        if (event.button !== 0) {
            return;
        }

        // The Hand tool and Space+drag are handled
        // by the pan handlers in WhiteboardCanvas.
        if (
            activeTool === "hand" ||
            activeTool === "lock" ||
            spacePressed
        ) {
            return;
        }

        event.preventDefault();

        const world = screenToWorld(
            event.clientX,
            event.clientY
        );

        //SELECT AND MOVE
        if (activeTool === "select") {
            const selected = hitTest(world, elements);

            if (!selected) {
                selectElement(null);
                return;
            }

            selectElement(selected.id);

            if (
                selected.type === "text" &&
                event.detail === 2
            ) {
                drawingRef.current = {
                    active: false,
                };

                onStartTextEditing({
                    x: selected.x,
                    y: selected.y,
                    text: selected.text,
                    fontSize: selected.fontSize ?? 20,
                    elementId: selected.id,
                });

                return;
            }

            if (
                selected.type === "note" &&
                event.detail === 2
            ) {
                drawingRef.current = {
                    active: false,
                };

                onStartNoteEditing({
                    x: selected.x,
                    y: selected.y,
                    width: selected.width,
                    height: selected.height,
                    text: selected.text,
                    elementId: selected.id,
                });

                return;
            }

            event.currentTarget.setPointerCapture(
                event.pointerId
            );

            drawingRef.current = {
                active: true,
                mode: "move",
                elementId: selected.id,
                tool: "select",
                lastWorld: world,
                beforeElements: beginHistory(),
            };

            return;
        }

        // ERASER
        if (activeTool === "eraser") {
            const selected = hitTest(world, elements);

            if (!selected) {
                return;
            }

            deleteElement(selected.id);

            event.currentTarget.setPointerCapture(
                event.pointerId
            );

            drawingRef.current = {
                active: true,
                mode: "erase",
                elementId: selected.id,
                tool: "eraser",
                lastWorld: world,
                beforeElements: [],
            };

            return;
        }

        // TEXT TOOL: click once and type directly
        // at the clicked location on the canvas.
        if (activeTool === "text") {
            onStartTextEditing({
                x: world.x,
                y: world.y,
                text: "",
                fontSize: 20,
                elementId: null,
            });

            return;
        }

        // NOTE TOOL: start a resizable note.
        if (activeTool === "note") {
            const beforeElements = beginHistory();
            const id = createId();

            addElement({
                id,
                type: "note",
                x: world.x,
                y: world.y,
                width: 1,
                height: 1,
                text: "",
            });

            event.currentTarget.setPointerCapture(
                event.pointerId
            );

            drawingRef.current = {
                active: true,
                mode: "draw",
                elementId: id,
                tool: "note",
                lastWorld: world,
                startWorld: world,
                beforeElements,
            };

            return;
        }

        // FREEHAND DRAWING
        if (activeTool === "draw") {
            const beforeElements = beginHistory();
            const id = createId();

            addElement({
                id,
                type: "draw",
                points: [world],
            });

            event.currentTarget.setPointerCapture(
                event.pointerId
            );

            drawingRef.current = {
                active: true,
                mode: "draw",
                elementId: id,
                tool: "draw",
                lastWorld: world,
                startWorld: world,
                beforeElements,
            };

            return;
        }

        // SHAPES
        if (isShapeTool(activeTool)) {
            const beforeElements = beginHistory();
            const id = createId();

            addElement({
                id,
                type: activeTool,
                x1: world.x,
                y1: world.y,
                x2: world.x,
                y2: world.y,
            });

            event.currentTarget.setPointerCapture(
                event.pointerId
            );

            drawingRef.current = {
                active: true,
                mode: "draw",
                elementId: id,
                tool: activeTool,
                lastWorld: world,
                startWorld: world,
                beforeElements,
            };
        }
    }

    function handlePointerMove(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        const drawing = drawingRef.current;

        if (!drawing.active) {
            return;
        }

        const world = screenToWorld(
            event.clientX,
            event.clientY
        );

        // MOVE A SELECTED ELEMENT
        if (drawing.mode === "move") {
            const deltaX = world.x - drawing.lastWorld.x;
            const deltaY = world.y - drawing.lastWorld.y;

            if (deltaX !== 0 || deltaY !== 0) {
                updateElement(
                    drawing.elementId,
                    (element) =>
                        moveElement(element, deltaX, deltaY)
                );
            }

            drawing.lastWorld = world;
            return;
        }

        // ERASE WHILE DRAGGING
        if (drawing.mode === "erase") {
            const target = hitTest(world, elements);

            if (target) {
                deleteElement(target.id);
            }

            drawing.lastWorld = world;
            return;
        }

        // RESIZE THE NOTE WHILE DRAGGING
        if (drawing.tool === "note") {
            const start = drawing.startWorld;

            if (!start) {
                return;
            }

            const x = Math.min(start.x, world.x);
            const y = Math.min(start.y, world.y);
            const width = Math.max(
                Math.abs(world.x - start.x),
                1
            );
            const height = Math.max(
                Math.abs(world.y - start.y),
                1
            );

            updateElement(
                drawing.elementId,
                (element) => {
                    if (element.type !== "note") {
                        return element;
                    }

                    return {
                        ...element,
                        x,
                        y,
                        width,
                        height,
                    };
                }
            );

            drawing.lastWorld = world;
            return;
        }

        // FREEHAND
        if (drawing.tool === "draw") {
            updateElement(
                drawing.elementId,
                (element) => {
                    if (element.type !== "draw") {
                        return element;
                    }

                    const last =
                        element.points[element.points.length - 1];

                    if (
                        last &&
                        Math.hypot(
                            world.x - last.x,
                            world.y - last.y
                        ) < 0.5
                    ) {
                        return element;
                    }

                    return {
                        ...element,
                        points: [
                            ...element.points,
                            world,
                        ],
                    };
                }
            );

            drawing.lastWorld = world;
            return;
        }

        // RECTANGLE / DIAMOND / ELLIPSE / LINE / ARROW
        if (isShapeTool(drawing.tool)) {
            updateElement(
                drawing.elementId,
                (element) => {
                    if (
                        element.type !== "rectangle" &&
                        element.type !== "diamond" &&
                        element.type !== "ellipse" &&
                        element.type !== "line" &&
                        element.type !== "arrow"
                    ) {
                        return element;
                    }

                    let x2 = world.x;
                    let y2 = world.y;

                    const dx = world.x - element.x1;
                    const dy = world.y - element.y1;

                    const isAreaShape =
                        element.type === "rectangle" ||
                        element.type === "diamond" ||
                        element.type === "ellipse";

                    if (
                        event.shiftKey &&
                        isAreaShape
                    ) {
                        const size = Math.max(
                            Math.abs(dx),
                            Math.abs(dy)
                        );

                        x2 =
                            element.x1 +
                            Math.sign(dx || 1) * size;

                        y2 =
                            element.y1 +
                            Math.sign(dy || 1) * size;
                    }

                    return {
                        ...element,
                        x2,
                        y2,
                    };
                }
            );

            drawing.lastWorld = world;
        }
    }

    function handlePointerUp(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        const drawing = drawingRef.current;

        if (!drawing.active) {
            return;
        }

        const world = screenToWorld(
            event.clientX,
            event.clientY
        );

        // Apply the final pointer position when moving.
        if (drawing.mode === "move") {
            const deltaX =
                world.x - drawing.lastWorld.x;

            const deltaY =
                world.y - drawing.lastWorld.y;

            if (deltaX !== 0 || deltaY !== 0) {
                updateElement(
                    drawing.elementId,
                    (element) =>
                        moveElement(element, deltaX, deltaY)
                );
            }
        }

        // FINISH A CUSTOM-SIZE NOTE
        if (
            drawing.mode === "draw" &&
            drawing.tool === "note"
        ) {
            const start =
                drawing.startWorld ?? world;

            const rawWidth =
                Math.abs(world.x - start.x);

            const rawHeight =
                Math.abs(world.y - start.y);

            let x = Math.min(start.x, world.x);
            let y = Math.min(start.y, world.y);
            let width: number;
            let height: number;

            // A simple click creates a default-size note.
            // Dragging creates a custom-size note.
            if (
                rawWidth < 8 &&
                rawHeight < 8
            ) {
                x = start.x;
                y = start.y;
                width = DEFAULT_NOTE_WIDTH;
                height = DEFAULT_NOTE_HEIGHT;
            } else {
                width = Math.max(
                    rawWidth,
                    MIN_NOTE_WIDTH
                );

                height = Math.max(
                    rawHeight,
                    MIN_NOTE_HEIGHT
                );
            }

            updateElement(
                drawing.elementId,
                (element) => {
                    if (element.type !== "note") {
                        return element;
                    }

                    return {
                        ...element,
                        x,
                        y,
                        width,
                        height,
                    };
                }
            );

            releasePointer(event);

            // Record the creation as one history step.
            commitHistory(drawing.beforeElements);

            selectElement(drawing.elementId);

            // Open the editor directly inside the new note.
            onStartNoteEditing({
                x,
                y,
                width,
                height,
                text: "",
                elementId: drawing.elementId,
            });

            onToolChange("select");

            drawingRef.current = {
                active: false,
            };

            return;
        }

        // FINISH A SHAPE USING THE FINAL RELEASE POSITION
        if (
            drawing.mode === "draw" &&
            isShapeTool(drawing.tool)
        ) {
            updateElement(
                drawing.elementId,
                (element) => {
                    if (
                        element.type !== "rectangle" &&
                        element.type !== "diamond" &&
                        element.type !== "ellipse" &&
                        element.type !== "line" &&
                        element.type !== "arrow"
                    ) {
                        return element;
                    }

                    let x2 = world.x;
                    let y2 = world.y;

                    const dx = x2 - element.x1;
                    const dy = y2 - element.y1;

                    const isAreaShape =
                        element.type === "rectangle" ||
                        element.type === "diamond" ||
                        element.type === "ellipse";

                    if (
                        isAreaShape &&
                        event.shiftKey
                    ) {
                        const size = Math.max(
                            Math.abs(dx),
                            Math.abs(dy),
                            MIN_SHAPE_SIZE
                        );

                        x2 =
                            element.x1 +
                            Math.sign(dx || 1) * size;

                        y2 =
                            element.y1 +
                            Math.sign(dy || 1) * size;
                    } else if (isAreaShape) {
                        if (Math.abs(dx) < MIN_SHAPE_SIZE) {
                            x2 =
                                element.x1 +
                                Math.sign(dx || 1) * MIN_SHAPE_SIZE;
                        }

                        if (Math.abs(dy) < MIN_SHAPE_SIZE) {
                            y2 =
                                element.y1 +
                                Math.sign(dy || 1) * MIN_SHAPE_SIZE;
                        }
                    } else if (
                        Math.hypot(dx, dy) < MIN_SHAPE_SIZE
                    ) {
                        x2 = element.x1 + MIN_SHAPE_SIZE;
                        y2 = element.y1;
                    }

                    return {
                        ...element,
                        x2,
                        y2,
                    };
                }
            );
        }

        // Complete the freehand stroke at release.
        if (
            drawing.mode === "draw" &&
            drawing.tool === "draw"
        ) {
            updateElement(
                drawing.elementId,
                (element) => {
                    if (element.type !== "draw") {
                        return element;
                    }

                    const last =
                        element.points[element.points.length - 1];

                    if (
                        last &&
                        Math.hypot(
                            world.x - last.x,
                            world.y - last.y
                        ) < 0.25
                    ) {
                        return element;
                    }

                    return {
                        ...element,
                        points: [
                            ...element.points,
                            world,
                        ],
                    };
                }
            );
        }

        releasePointer(event);

        if (
            drawing.mode === "move" ||
            (
                drawing.mode === "draw" &&
                (
                    isShapeTool(drawing.tool) ||
                    drawing.tool === "draw"
                )
            )
        ) {
            commitHistory(drawing.beforeElements);
        }

        if (
            drawing.mode === "draw" &&
            isShapeTool(drawing.tool)
        ) {
            selectElement(drawing.elementId);
            onToolChange("select");
        }

        drawingRef.current = {
            active: false,
        };
    }

    return {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handleDoubleClick
    };
}