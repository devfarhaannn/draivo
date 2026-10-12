"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useMemo,
    type PointerEvent as ReactPointerEvent,
    type MouseEvent as ReactMouseEvent,
} from "react";

import {
    Redo2,
    Undo2,
} from "lucide-react";

import {
    useCanvasDrawing,
    type TextEditingTarget,
    type NoteEditingTarget,
} from "../hooks/useCanvasDrawing";

import { useCanvasPan } from "../hooks/useCanvasPan";
import { useCanvasZoom } from "../hooks/useCanvasZoom";
import { useWhiteboard } from "../hooks/useWhiteBoard";
import { renderCanvas } from "../lib/canvas/renderCanvas";

import SelectionOverlay from "./SelectionOverlay";
import TextEditorOverlay from "./TextEditorOverlay";
import NoteEditorOverlay from "./NoteEditorOverlay";

import type {
    CanvasElement,
    ElementPropertyUpdater,
    ElementStylePatch,
    ToolId,
} from "../types/whiteboard";

const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ??
    "ws://localhost:8080";

type WhiteboardCanvasProps = {
    zoom: number;
    onZoomChange: (zoom: number) => void;
    background: string;
    dark: boolean;
    activeTool: ToolId;
    onToolChange: (tool: ToolId) => void;

    onSelectionChange?: (
        element: CanvasElement | null
    ) => void;

    onPropertyUpdaterReady?: (
        updater: ElementPropertyUpdater
    ) => void;

    roomId: number | null;
    token: string | null;
    onParticipantsChange?: (count: number) => void;
};

export default function WhiteboardCanvas({

    roomId,
    token,
    onParticipantsChange,

    zoom,
    onZoomChange,
    background,
    dark,
    activeTool,
    onToolChange,
    onSelectionChange,
    onPropertyUpdaterReady,
}: WhiteboardCanvasProps) {
    const containerRef =
        useRef<HTMLDivElement | null>(null);

    const canvasRef =
        useRef<HTMLCanvasElement | null>(null);

    const {
        elements,
        selectedId,
        addElement,
        updateElement,
        deleteElement,
        selectElement,
        beginHistory,
        commitHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        replaceElements,
    } = useWhiteboard();

    const [
        textEditor,
        setTextEditor,
    ] = useState<TextEditingTarget | null>(null);

    const [
        noteEditor,
        setNoteEditor,
    ] = useState<NoteEditingTarget | null>(null);

    // WEBSOCKET COLLABORATION

    const socketRef = useRef<WebSocket | null>(null);

    const hasInitialSnapshotRef = useRef(false);

    const lastIncomingSnapshotRef = useRef<string | null>(null);

    const replaceElementsRef = useRef(replaceElements);

    const onParticipantsChangeRef = useRef(onParticipantsChange);

    // Keep the latest callbacks available without reconnecting the socket.
    useEffect(() => {
        replaceElementsRef.current = replaceElements;
        onParticipantsChangeRef.current = onParticipantsChange;
    }, [replaceElements, onParticipantsChange]);

    // Connect to the existing WebSocket backend and join this room.
    useEffect(() => {
        if (roomId === null || !token) {
            return;
        }

        const socket = new WebSocket(
            `${WS_URL}?token=${encodeURIComponent(token)}`
        );

        socketRef.current = socket;
        hasInitialSnapshotRef.current = false;
        lastIncomingSnapshotRef.current = null;

        socket.onopen = () => {
            socket.send(
                JSON.stringify({
                    type: "join_room",
                    roomId,
                    elements: [],
                })
            );
        };

        socket.onmessage = (event) => {
            let message: {
                type?: string;
                roomId?: number;
                elements?: unknown;
                participants?: number;
                message?: string;
            };

            try {
                message = JSON.parse(String(event.data));
            } catch {
                console.error(
                    "Invalid message received from WebSocket"
                );
                return;
            }

            if (message.type === "error") {
                console.error(
                    "WebSocket error:",
                    message.message ?? "Unknown error"
                );
                return;
            }

            // Receive the shared canvas snapshot from the server.
            if (
                message.type === "canvas_state" &&
                Number(message.roomId) === roomId &&
                Array.isArray(message.elements)
            ) {
                const incomingElements =
                    message.elements as CanvasElement[];

                lastIncomingSnapshotRef.current =
                    JSON.stringify(incomingElements);

                hasInitialSnapshotRef.current = true;

                replaceElementsRef.current(incomingElements);

                return;
            }

            // Receive the room participant count.
            if (
                message.type === "room_presence" &&
                Number(message.roomId) === roomId
            ) {
                onParticipantsChangeRef.current?.(
                    Number(message.participants) || 0
                );
            }
        };

        socket.onerror = (event) => {
            console.error(
                "WebSocket connection error:",
                event
            );
        };

        socket.onclose = () => {
            if (socketRef.current === socket) {
                socketRef.current = null;
            }

            onParticipantsChangeRef.current?.(0);
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                    JSON.stringify({
                        type: "leave_room",
                        roomId,
                    })
                );
            }

            socket.close();

            if (socketRef.current === socket) {
                socketRef.current = null;
            }

            hasInitialSnapshotRef.current = false;
            lastIncomingSnapshotRef.current = null;
        };
    }, [roomId, token]);

    // Send local canvas changes to the other room participants.
    useEffect(() => {
        const socket = socketRef.current;

        if (
            roomId === null ||
            !hasInitialSnapshotRef.current ||
            !socket ||
            socket.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        const serializedElements = JSON.stringify(elements);

        // Do not send a snapshot straight back after receiving it.
        // This prevents clients from echoing updates to each other.
        if (
            serializedElements ===
            lastIncomingSnapshotRef.current
        ) {
            lastIncomingSnapshotRef.current = null;
            return;
        }

        socket.send(
            JSON.stringify({
                type: "canvas_update",
                roomId,
                elements,
            })
        );
    }, [elements, roomId]);

    // TEXT EDITING

    function startTextEditing(
        target: TextEditingTarget
    ) {
        setNoteEditor(null);
        setTextEditor(target);
    }

    function updateTextEditor(value: string) {
        setTextEditor((current) => {
            if (!current) {
                return null;
            }

            return {
                ...current,
                text: value,
            };
        });
    }

    function commitTextEditing() {
        if (!textEditor) {
            return;
        }

        const value = textEditor.text.trim();

        if (!value) {
            setTextEditor(null);
            return;
        }

        if (textEditor.elementId === null) {
            const id =
                Date.now() +
                Math.floor(Math.random() * 1000);

            addElement({
                id,
                type: "text",
                x: textEditor.x,
                y: textEditor.y,
                text: value,
                fontSize: textEditor.fontSize,
            });

            selectElement(id);
        } else {
            const beforeElements = beginHistory();

            updateElement(
                textEditor.elementId,
                (current) => {
                    if (current.type !== "text") {
                        return current;
                    }

                    return {
                        ...current,
                        text: value,
                        fontSize: textEditor.fontSize,
                    };
                }
            );

            commitHistory(beforeElements);
        }

        setTextEditor(null);
        onToolChange("select");
    }

    function cancelTextEditing() {
        setTextEditor(null);
    }

    // NOTE EDITING

    function startNoteEditing(
        target: NoteEditingTarget
    ) {
        setTextEditor(null);
        setNoteEditor(target);
    }

    function updateNoteEditor(value: string) {
        setNoteEditor((current) => {
            if (!current) {
                return null;
            }

            return {
                ...current,
                text: value,
            };
        });
    }

    function commitNoteEditing() {
        if (!noteEditor) {
            return;
        }

        const value = noteEditor.text.trim();
        const beforeElements = beginHistory();

        const isNewNote =
            noteEditor.elementId === null;

        const noteId = isNewNote
            ? Date.now() + Math.floor(Math.random() * 1000)
            : noteEditor.elementId!;

        if (isNewNote) {
            addElement({
                id: noteId,
                type: "note",
                x: noteEditor.x,
                y: noteEditor.y,
                width: noteEditor.width,
                height: noteEditor.height,
                text: value,
            });
        } else {
            updateElement(
                noteId,
                (current) => {
                    if (current.type !== "note") {
                        return current;
                    }

                    return {
                        ...current,
                        text: value,
                    };
                }
            );
        }

        commitHistory(beforeElements);

        selectElement(noteId);
        setNoteEditor(null);
        onToolChange("select");
    }

    function cancelNoteEditing() {
        setNoteEditor(null);
    }

    // PAN AND ZOOM

    const {
        pan,
        setPan,
        cursor,
        spacePressed,
    } = useCanvasPan({
        containerRef,
        activeTool,
    });

    const handPanRef = useRef<{
        pointerId: number;
        lastX: number;
        lastY: number;
    } | null>(null);

    const [isHandDragging, setIsHandDragging] =
        useState(false);

    useCanvasZoom({
        containerRef,
        zoom,
        onZoomChange,
        pan,
        onPanChange: setPan,
    });

    // DRAWING AND SELECTION

    const {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handleDoubleClick
    } = useCanvasDrawing({
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
        onStartTextEditing: startTextEditing,
        onStartNoteEditing: startNoteEditing,
        onToolChange,
    });

    // POINTER HANDLERS

    function handleCanvasPointerDown(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        const target = event.target as HTMLElement;

        const isCanvasSurface =
            target === canvasRef.current ||
            target === containerRef.current;

        // Ignore events originating from editor overlays
        // and other UI elements.
        if (!isCanvasSurface) {
            return;
        }

        // Clicking the canvas while editing commits the editor.
        // The same click must not start another drawing action.
        if (noteEditor) {
            event.preventDefault();
            event.stopPropagation();
            commitNoteEditing();
            return;
        }

        if (textEditor) {
            event.preventDefault();
            event.stopPropagation();
            commitTextEditing();
            return;
        }

        // Pan with the Hand tool, Space+drag, or middle mouse.
        const shouldPan =
            event.button === 1 ||
            (
                event.button === 0 &&
                (
                    activeTool === "hand" ||
                    spacePressed
                )
            );

        if (shouldPan) {
            event.preventDefault();

            handPanRef.current = {
                pointerId: event.pointerId,
                lastX: event.clientX,
                lastY: event.clientY,
            };

            event.currentTarget.setPointerCapture(
                event.pointerId
            );

            setIsHandDragging(true);
            return;
        }

        handlePointerDown(event);
    }

    function handleCanvasPointerMove(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        const drag = handPanRef.current;

        if (
            drag &&
            drag.pointerId === event.pointerId
        ) {
            event.preventDefault();

            const deltaX =
                event.clientX - drag.lastX;

            const deltaY =
                event.clientY - drag.lastY;

            drag.lastX = event.clientX;
            drag.lastY = event.clientY;

            setPan((current) => ({
                x: current.x + deltaX,
                y: current.y + deltaY,
            }));

            return;
        }

        handlePointerMove(event);
    }

    function handleCanvasPointerUp(
        event: ReactPointerEvent<HTMLDivElement>
    ) {
        const drag = handPanRef.current;

        if (
            drag &&
            drag.pointerId === event.pointerId
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

            handPanRef.current = null;
            setIsHandDragging(false);
            return;
        }

        handlePointerUp(event);
    }

    // UNDO / REDO KEYBOARD SHORTCUTS

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            const target =
                event.target as HTMLElement | null;

            const typing =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.tagName === "SELECT" ||
                target?.isContentEditable;

            if (typing) {
                return;
            }

            const modifier =
                event.metaKey || event.ctrlKey;

            if (
                modifier &&
                event.key.toLowerCase() === "z" &&
                !event.shiftKey
            ) {
                event.preventDefault();
                undo();
                return;
            }

            if (
                modifier &&
                event.key.toLowerCase() === "z" &&
                event.shiftKey
            ) {
                event.preventDefault();
                redo();
                return;
            }

            if (
                event.ctrlKey &&
                event.key.toLowerCase() === "y"
            ) {
                event.preventDefault();
                redo();
            }
        }

        window.addEventListener(
            "keydown",
            handleKeyDown
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown
            );
        };
    }, [undo, redo]);

    // Hide the saved text underneath the editor while editing.
    // The textarea displays the current text instead, so it
    // won't appear twice on the canvas.
    const elementsForRender = useMemo(
        () =>
            elements.map((element) => {
                if (
                    noteEditor?.elementId === element.id &&
                    element.type === "note"
                ) {
                    return {
                        ...element,
                        text: "",
                    };
                }

                if (
                    textEditor?.elementId === element.id &&
                    element.type === "text"
                ) {
                    return {
                        ...element,
                        text: "",
                    };
                }

                return element;
            }),
        [
            elements,
            noteEditor?.elementId,
            textEditor?.elementId,
        ]
    );

    // RENDER CANVAS

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;

        if (!canvas || !container) {
            return;
        }

        renderCanvas({
            canvas,
            container,
            elements: elementsForRender,
            pan,
            zoom,
            background,
            dark,

        });
    }, [
        elements,
        pan,
        zoom,
        background,
        dark,
        elementsForRender
    ]);

    // REDRAW WHEN THE CANVAS CONTAINER RESIZES

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;

        if (!canvas || !container) {
            return;
        }

        const resizeObserver = new ResizeObserver(() => {
            renderCanvas({
                canvas,
                container,
                elements,
                pan,
                zoom,
                background,
                dark,
            });
        });

        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
        };
    }, [
        elements,
        pan,
        zoom,
        background,
        dark,
    ]);

    // CURRENT SELECTION

    const selectedElement =
        selectedId === null
            ? null
            : elements.find(
                (element) => element.id === selectedId
            ) ?? null;

    // UPDATE SELECTED ELEMENT PROPERTIES

    const updateElementProperties =
        useCallback<ElementPropertyUpdater>(
            (
                id: number,
                patch: ElementStylePatch
            ) => {
                const beforeElements = beginHistory();

                updateElement(
                    id,
                    (current) => ({
                        ...current,
                        ...patch,
                    }) as CanvasElement
                );

                commitHistory(beforeElements);
            },
            [
                beginHistory,
                updateElement,
                commitHistory,
            ]
        );

    useEffect(() => {
        onSelectionChange?.(selectedElement);
    }, [
        selectedElement,
        onSelectionChange,
    ]);

    useEffect(() => {
        onPropertyUpdaterReady?.(
            updateElementProperties
        );
    }, [
        onPropertyUpdaterReady,
        updateElementProperties,
    ]);
    function handleCanvasDoubleClick(
        event: ReactMouseEvent<HTMLDivElement>
    ) {
        // Only respond to double-clicks on the canvas itself.
        if (event.target !== canvasRef.current) {
            return;
        }

        if (noteEditor || textEditor) {
            return;
        }

        handleDoubleClick(event);
    }

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 select-none overflow-hidden"
            style={{
                cursor: isHandDragging
                    ? "grabbing"
                    : activeTool === "hand"
                        ? "grab"
                        : cursor,
                touchAction: "none",
                overscrollBehavior: "none",
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onContextMenu={(event) => {
                event.preventDefault();
            }}
            onDoubleClick={handleCanvasDoubleClick}
        >
            <canvas
                ref={canvasRef}
                className="absolute inset-0 block h-full w-full"
            />

            {/* UNDO / REDO */}

            <div
                className={[
                    "absolute bottom-4 left-4 z-50 flex items-center rounded-xl border p-1 shadow-[0_8px_30px_rgba(20,20,30,.08)] backdrop-blur-xl",
                    dark
                        ? "border-white/10 bg-[#242429]/95"
                        : "border-black/[0.07] bg-white/[0.96]",
                ].join(" ")}
                onPointerDown={(event) => {
                    event.stopPropagation();
                }}
                onPointerUp={(event) => {
                    event.stopPropagation();
                }}
            >
                <button
                    type="button"
                    title="Undo"
                    aria-label="Undo"
                    disabled={!canUndo}
                    onPointerDown={(event) => {
                        event.stopPropagation();
                    }}
                    onPointerUp={(event) => {
                        event.stopPropagation();
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        undo();
                    }}
                    className={[
                        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                        !canUndo
                            ? dark
                                ? "cursor-not-allowed text-white/20"
                                : "cursor-not-allowed text-[#c6c6cc]"
                            : dark
                                ? "text-white/55 hover:bg-white/[0.07] hover:text-white"
                                : "text-[#696973] hover:bg-[#f5f4fa]",
                    ].join(" ")}
                >
                    <Undo2 className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title="Redo"
                    aria-label="Redo"
                    disabled={!canRedo}
                    onPointerDown={(event) => {
                        event.stopPropagation();
                    }}
                    onPointerUp={(event) => {
                        event.stopPropagation();
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        redo();
                    }}
                    className={[
                        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                        !canRedo
                            ? dark
                                ? "cursor-not-allowed text-white/20"
                                : "cursor-not-allowed text-[#c6c6cc]"
                            : dark
                                ? "text-white/55 hover:bg-white/[0.07] hover:text-white"
                                : "text-[#696973] hover:bg-[#f5f4fa]",
                    ].join(" ")}
                >
                    <Redo2 className="h-4 w-4" />
                </button>
            </div>

            {/* SELECTION / RESIZE OVERLAY */}

            {selectedElement && (
                <SelectionOverlay
                    containerRef={containerRef}
                    element={selectedElement}
                    zoom={zoom}
                    pan={pan}
                    updateElement={updateElement}
                    beginHistory={beginHistory}
                    commitHistory={commitHistory}
                />
            )}

            {/* TEXT EDITOR */}

            {textEditor && (
                <TextEditorOverlay
                    x={textEditor.x}
                    y={textEditor.y}
                    text={textEditor.text}
                    fontSize={textEditor.fontSize}
                    zoom={zoom}
                    pan={pan}
                    dark={dark}
                    onChange={updateTextEditor}
                    onCommit={commitTextEditing}
                    onCancel={cancelTextEditing}
                />
            )}

            {/* NOTE EDITOR */}

            {noteEditor && (
                <NoteEditorOverlay
                    x={noteEditor.x}
                    y={noteEditor.y}
                    width={noteEditor.width}
                    height={noteEditor.height}
                    text={noteEditor.text}
                    zoom={zoom}
                    pan={pan}
                    dark={dark}
                    onChange={updateNoteEditor}
                    onCommit={commitNoteEditing}
                    onCancel={cancelNoteEditing}
                />
            )}
        </div>
    );
}