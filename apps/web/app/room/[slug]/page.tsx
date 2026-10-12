"use client";

import {
    ArrowUpRight,
    Command,
    ChevronDown,
    Moon,
    Monitor,
    Download,
    FileImage,
    FolderOpen,
    HelpCircle,
    Link2,
    Lock,
    Menu,
    Minus,
    Palette,
    PanelRight,
    Plus,
    RotateCcw,
    Search,
    Settings,
    Share2,
    Sun,
    Users,
    X,
    type LucideIcon,
    Play,
    Check,
    Copy,
} from "lucide-react";

import {
    useParams,
    useRouter,
} from "next/navigation";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import WhiteboardCanvas from "./components/WhiteboardCanvas";
import WhiteboardToolbar from "./components/WhiteboardToolbar";

import type {
    CanvasElement,
    ElementPropertyUpdater,
    ElementStylePatch,
    ThemeMode,
    ToolId,
} from "./types/whiteboard";


const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:3001";

const LIGHT_CANVAS_BACKGROUNDS = [
    "#ffffff",
    "#f5f5f5",
    "#f4f7ff",
    "#fff9df",
    "#fff3ef",
    "#eefbf5",
];

const DARK_CANVAS_BACKGROUNDS = [
    "#111111",
    "#181818",
    "#151a1d",
    "#252309",
    "#211b1b",
    "#303030",
];

const ELEMENT_COLORS = [
    "#27272a",
    "#ffffff",
    "#625df5",
    "#ef4444",
    "#22a35a",
    "#f08c36",
    "#315dcc",
    "#eab308",
    "#ec4899",
    "#14b8a6",
];

function MenuItem({
    icon: Icon,
    title,
    shortcut,
    isDark,
    onClick,
}: {
    icon: LucideIcon;
    title: string;
    shortcut?: string;
    isDark: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12px] transition-colors",
                isDark
                    ? "text-white/75 hover:bg-white/[0.07]"
                    : "text-[#46464f] hover:bg-[#f5f4fa]",
            ].join(" ")}
        >
            <span
                className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center",
                    isDark
                        ? "text-white/50"
                        : "text-[#72727c]",
                ].join(" ")}
            >
                <Icon className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1 truncate">
                {title}
            </span>

            {shortcut && (
                <span
                    className={[
                        "shrink-0 text-[10px]",
                        isDark
                            ? "text-white/35"
                            : "text-[#a1a1aa]",
                    ].join(" ")}
                >
                    {shortcut}
                </span>
            )}
        </button>
    );
}

function Divider({
    isDark,
}: {
    isDark: boolean;
}) {
    return (
        <div
            className={[
                "my-1.5 h-px",
                isDark
                    ? "bg-white/[0.08]"
                    : "bg-black/[0.06]",
            ].join(" ")}
        />
    );
}

export default function RoomPage() {
    const params = useParams<{ slug: string }>();
    const router = useRouter();

    const slug = decodeURIComponent(params.slug);

    const [roomId, setRoomId] =
        useState<number | null>(null);

    const [authToken, setAuthToken] =
        useState<string | null>(null);

    const [roomLoadError, setRoomLoadError] =
        useState("");

    const [participantCount, setParticipantCount] =
        useState(0);

    const [shareOpen, setShareOpen] =
        useState(false);

    const [shareLink, setShareLink] =
        useState("");

    const [linkCopied, setLinkCopied] =
        useState(false);

    const [menuOpen, setMenuOpen] = useState(false);
    const [activeTool, setActiveTool] =
        useState<ToolId>("select");

    const [zoom, setZoom] = useState(100);

    const [theme, setTheme] =
        useState<ThemeMode>("light");

    const [systemDark, setSystemDark] =
        useState(false);

    // null means that the canvas follows the active theme.
    const [
        canvasBackground,
        setCanvasBackground,
    ] = useState<string | null>(null);

    const [
        menuSearchOpen,
        setMenuSearchOpen,
    ] = useState(false);

    const [locked, setLocked] = useState(false);

    const [propertiesOpen, setPropertiesOpen] =
        useState(false);

    const [
        selectedElement,
        setSelectedElement,
    ] = useState<CanvasElement | null>(null);

    const propertyUpdaterRef =
        useRef<ElementPropertyUpdater | null>(null);

    const [preferencesLoaded, setPreferencesLoaded] =
        useState(false);

    const isDark =
        theme === "dark" ||
        (theme === "system" && systemDark);

    const effectiveCanvasBackground =
        canvasBackground ??
        (isDark ? "#111111" : "#ffffff");

    const canvasBackgroundOptions = isDark
        ? DARK_CANVAS_BACKGROUNDS
        : LIGHT_CANVAS_BACKGROUNDS;


    useEffect(() => {
        let cancelled = false;

        const savedToken = localStorage.getItem("token");

        if (!savedToken) {
            router.push("/signin");
            return;
        }

        setAuthToken(savedToken);

        async function loadRoomId() {
            try {
                const response = await fetch(
                    `${BACKEND_URL}/room/${encodeURIComponent(slug)}`
                );

                const data = await response.json();
                const numericRoomId = Number(data?.room?.id);

                if (
                    !response.ok ||
                    !Number.isInteger(numericRoomId) ||
                    numericRoomId <= 0
                ) {
                    throw new Error(
                        data?.message ?? "Board not found."
                    );
                }

                if (!cancelled) {
                    setRoomId(numericRoomId);
                    setRoomLoadError("");
                }
            } catch (error) {
                if (!cancelled) {
                    setRoomLoadError(
                        error instanceof Error
                            ? error.message
                            : "Could not load this board."
                    );
                }
            }
        }

        void loadRoomId();

        return () => {
            cancelled = true;
        };
    }, [slug, router]);

    const handleParticipantsChange = useCallback(
        (count: number) => {
            setParticipantCount(count);
        },
        []
    );

    function openShareDialog() {
        setShareLink(window.location.href);
        setLinkCopied(false);
        setShareOpen(true);
        setMenuOpen(false);
    }

    async function copyShareLink() {
        if (!shareLink) {
            return;
        }

        try {
            await navigator.clipboard.writeText(shareLink);
            setLinkCopied(true);
        } catch {
            window.prompt(
                "Copy this board link:",
                shareLink
            );
        }
    }
    /*
     * Load saved preferences.
     */
    useEffect(() => {
        const savedTheme =
            localStorage.getItem("draivo-theme");

        const savedBackground =
            localStorage.getItem(
                "draivo-canvas-background"
            );

        const savedBackgroundMode =
            localStorage.getItem(
                "draivo-canvas-background-mode"
            );

        if (
            savedTheme === "light" ||
            savedTheme === "dark" ||
            savedTheme === "system"
        ) {
            setTheme(savedTheme);
        }

        if (
            savedBackground &&
            /^#[0-9a-fA-F]{6}$/.test(savedBackground)
        ) {
            const isLegacyDefaultWhite =
                savedBackgroundMode === null &&
                savedBackground.toLowerCase() === "#ffffff";

            const hasCustomBackground =
                savedBackgroundMode === "custom" ||
                (
                    savedBackgroundMode !== "theme" &&
                    !isLegacyDefaultWhite
                );

            if (hasCustomBackground) {
                setCanvasBackground(savedBackground);
            }
        }

        setPreferencesLoaded(true);
    }, []);

    /*
     * Save the selected theme.
     */
    useEffect(() => {
        if (!preferencesLoaded) {
            return;
        }

        localStorage.setItem(
            "draivo-theme",
            theme
        );
    }, [theme, preferencesLoaded]);

    /*
     * Save custom background preferences.
     */
    useEffect(() => {
        if (!preferencesLoaded) {
            return;
        }

        if (canvasBackground === null) {
            localStorage.setItem(
                "draivo-canvas-background-mode",
                "theme"
            );

            localStorage.removeItem(
                "draivo-canvas-background"
            );

            return;
        }

        localStorage.setItem(
            "draivo-canvas-background-mode",
            "custom"
        );

        localStorage.setItem(
            "draivo-canvas-background",
            canvasBackground
        );
    }, [canvasBackground, preferencesLoaded]);

    /*
     * Track the operating system theme.
     */
    useEffect(() => {
        const mediaQuery = window.matchMedia(
            "(prefers-color-scheme: dark)"
        );

        const updateSystemTheme = () => {
            setSystemDark(mediaQuery.matches);
        };

        updateSystemTheme();

        mediaQuery.addEventListener(
            "change",
            updateSystemTheme
        );

        return () => {
            mediaQuery.removeEventListener(
                "change",
                updateSystemTheme
            );
        };
    }, []);

    /*
     * Keyboard shortcuts.
     */
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            const target =
                event.target as HTMLElement | null;

            const isTyping =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.tagName === "SELECT" ||
                target?.isContentEditable;

            if (isTyping) {
                if (event.key === "Escape") {
                    setMenuSearchOpen(false);
                    setMenuOpen(false);
                }

                return;
            }

            if (event.key === "Escape") {
                setMenuOpen(false);
                setMenuSearchOpen(false);
                return;
            }

            switch (event.key.toLowerCase()) {
                case "v":
                    setActiveTool("select");
                    break;
                case "r":
                    setActiveTool("rectangle");
                    break;
                case "d":
                    setActiveTool("diamond");
                    break;
                case "o":
                    setActiveTool("ellipse");
                    break;
                case "a":
                    setActiveTool("arrow");
                    break;
                case "l":
                    setActiveTool("line");
                    break;
                case "p":
                    setActiveTool("draw");
                    break;
                case "t":
                    setActiveTool("text");
                    break;
                case "n":
                    setActiveTool("note");
                    break;
                case "e":
                    setActiveTool("eraser");
                    break;
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
    }, []);

    // Zoom controls

    function zoomIn() {
        setZoom((value) =>
            Math.min(value + 10, 500)
        );
    }

    function zoomOut() {
        setZoom((value) =>
            Math.max(value - 10, 10)
        );
    }

    function resetZoom() {
        setZoom(100);
    }

    // Canvas and tool actions

    function handleResetCanvas() {
        setZoom(100);
        setActiveTool("select");
        setCanvasBackground(null);
        setLocked(false);
        setMenuOpen(false);
        setMenuSearchOpen(false);
        setPropertiesOpen(false);
    }

    function handleToolChange(tool: ToolId) {
        setActiveTool(tool);
        setMenuOpen(false);
        setMenuSearchOpen(false);
    }

    function handleThemeChange(nextTheme: ThemeMode) {
        setCanvasBackground(null);
        setTheme(nextTheme);
    }

    /*
     * Keep the selected element synchronized with the canvas.
     */
    const handleSelectionChange = useCallback(
        (element: CanvasElement | null) => {
            setSelectedElement(element);

            if (element) {
                setPropertiesOpen(true);
            }
        },
        []
    );

    const handlePropertyUpdaterReady = useCallback(
        (updater: ElementPropertyUpdater) => {
            propertyUpdaterRef.current = updater;
        },
        []
    );

    function updateSelectedElementProperties(
        patch: ElementStylePatch
    ) {
        if (!selectedElement) {
            return;
        }

        propertyUpdaterRef.current?.(
            selectedElement.id,
            patch
        );
    }

    const selectedCanFill =
        selectedElement !== null &&
        [
            "rectangle",
            "diamond",
            "ellipse",
            "note",
        ].includes(selectedElement.type);

    const selectedCanHaveStroke =
        selectedElement !== null &&
        selectedElement.type !== "text";

    const selectedCanHaveTextColor =
        selectedElement !== null &&
        (
            selectedElement.type === "text" ||
            selectedElement.type === "note"
        );

    const defaultStrokeColor =
        isDark ? "#f4f4f5" : "#27272a";

    const selectedStrokeColor =
        selectedElement?.strokeColor ??
        (
            selectedElement?.type === "note"
                ? "#d8c95f"
                : defaultStrokeColor
        );

    const selectedFillColor =
        selectedElement?.fillColor ??
        (
            selectedElement?.type === "note"
                ? "#fff3a8"
                : "#ffffff"
        );

    const selectedTextColor =
        selectedElement?.textColor ??
        (
            selectedElement?.type === "note"
                ? "#403d2e"
                : defaultStrokeColor
        );

    const surfaceClass = isDark
        ? "border-white/10 bg-[#242429]/[0.98] text-white"
        : "border-black/[0.08] bg-white/[0.98] text-[#27272a]";

    const mutedTextClass = isDark
        ? "text-white/45"
        : "text-[#888891]";

    const inputClass = isDark
        ? "border-white/10 bg-white/[0.05] text-white"
        : "border-black/[0.08] bg-[#f7f7f9] text-[#27272a]";

    return (
        <main
            className={[
                "fixed inset-0 overflow-hidden transition-colors duration-200",
                isDark
                    ? "bg-[#17171b] text-white"
                    : "bg-white text-[#17171b]",
            ].join(" ")}
        >
            {/* CANVAS */}

            <WhiteboardCanvas
                zoom={zoom}
                onZoomChange={setZoom}
                background={effectiveCanvasBackground}
                dark={isDark}
                activeTool={activeTool}
                onSelectionChange={handleSelectionChange}
                onPropertyUpdaterReady={
                    handlePropertyUpdaterReady
                }
                onToolChange={handleToolChange}
                roomId={roomId}
                token={authToken}
                onParticipantsChange={handleParticipantsChange}
            />

            {/* MENU DISMISS BACKDROP */}

            {menuOpen && (
                <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => {
                        setMenuOpen(false);
                        setMenuSearchOpen(false);
                    }}
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                />
            )}

            {/* TOP LEFT MENU */}

            <div className="absolute left-4 top-4 z-50">
                <div className="flex items-center">
                    <button
                        type="button"
                        aria-label="Open menu"
                        onClick={() => {
                            setMenuOpen((value) => !value);
                            setMenuSearchOpen(false);
                        }}
                        className={[
                            "flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-colors",
                            isDark
                                ? "border-white/10 bg-[#242429]/95 text-white/75 hover:bg-[#2b2b31]"
                                : "border-black/[0.07] bg-white/95 text-[#66666f] hover:bg-white",
                        ].join(" ")}
                    >
                        <Menu className="h-[18px] w-[18px]" />
                    </button>

                    <div
                        className={[
                            "ml-2 max-w-[260px] truncate px-2 text-[13px] font-medium",
                            isDark
                                ? "text-white/75"
                                : "text-[#4b4b53]",
                        ].join(" ")}
                    >
                        {slug}
                    </div>
                </div>

                {/* SIDEBAR MENU */}

                {menuOpen && (
                    <div
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                        className={[
                            "absolute left-0 top-12 w-[240px] overflow-hidden rounded-xl border p-1.5 shadow-[0_24px_70px_rgba(20,20,30,.20)] backdrop-blur-2xl",
                            surfaceClass,
                        ].join(" ")}
                    >
                        <MenuItem
                            icon={FolderOpen}
                            title="Open"
                            shortcut="⌘O"
                            isDark={isDark}
                            onClick={() => {
                                setMenuOpen(false);
                                router.push("/dashboard");
                            }}
                        />

                        <MenuItem
                            icon={Download}
                            title="Save to..."
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={FileImage}
                            title="Export image..."
                            shortcut="⌘⇧E"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={Users}
                            title="Live collaboration..."
                            isDark={isDark}
                            onClick={openShareDialog}
                        />

                        <MenuItem
                            icon={Command}
                            title="Command palette"
                            shortcut="⌘/"
                            isDark={isDark}
                            onClick={() => {
                                setMenuSearchOpen(true);
                                setMenuOpen(false);
                            }}
                        />

                        <MenuItem
                            icon={Search}
                            title="Find on canvas"
                            shortcut="⌘F"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={HelpCircle}
                            title="Help"
                            shortcut="?"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={RotateCcw}
                            title="Reset the canvas"
                            isDark={isDark}
                            onClick={handleResetCanvas}
                        />

                        <Divider isDark={isDark} />

                        <MenuItem
                            icon={Palette}
                            title="Draivo+"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={Link2}
                            title="GitHub"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={Users}
                            title="Follow us"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={Share2}
                            title="Discord chat"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <MenuItem
                            icon={ArrowUpRight}
                            title="Sign up"
                            isDark={isDark}
                            onClick={() => setMenuOpen(false)}
                        />

                        <Divider isDark={isDark} />

                        <MenuItem
                            icon={Settings}
                            title="Preferences"
                            shortcut="›"
                            isDark={isDark}
                            onClick={() => {
                                setPropertiesOpen(true);
                                setMenuOpen(false);
                            }}
                        />

                        {/* COMPACT THEME SELECTOR */}

                        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                            <span className="text-[12px]">
                                Theme
                            </span>

                            <div
                                className={[
                                    "flex items-center gap-0.5 rounded-lg border p-1",
                                    isDark
                                        ? "border-white/10 bg-white/[0.04]"
                                        : "border-black/[0.06] bg-[#f7f7f9]",
                                ].join(" ")}
                            >
                                {(
                                    [
                                        "light",
                                        "dark",
                                        "system",
                                    ] as ThemeMode[]
                                ).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        title={`${mode} theme`}
                                        aria-label={`Use ${mode} theme`}
                                        aria-pressed={theme === mode}
                                        onClick={() =>
                                            handleThemeChange(mode)
                                        }
                                        className={[
                                            "flex h-7 w-8 items-center justify-center rounded-md transition-colors",
                                            theme === mode
                                                ? "bg-[#625DF5] text-white shadow-sm"
                                                : isDark
                                                    ? "text-white/55 hover:bg-white/[0.07]"
                                                    : "text-[#777781] hover:bg-white",
                                        ].join(" ")}
                                    >
                                        {mode === "light" ? (
                                            <Sun className="h-3.5 w-3.5" />
                                        ) : mode === "dark" ? (
                                            <Moon className="h-3.5 w-3.5" />
                                        ) : (
                                            <Monitor className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* LANGUAGE */}

                        <button
                            type="button"
                            onClick={() => setMenuOpen(false)}
                            className={[
                                "mx-1.5 flex h-9 w-[calc(100%-12px)] items-center justify-between rounded-lg border px-3 text-left text-[12px] transition-colors",
                                isDark
                                    ? "border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
                                    : "border-black/[0.07] bg-white text-[#45454d] hover:bg-[#f8f8fb]",
                            ].join(" ")}
                        >
                            <span>English</span>

                            <ChevronDown
                                className={[
                                    "h-3.5 w-3.5",
                                    mutedTextClass,
                                ].join(" ")}
                            />
                        </button>

                        {/* CANVAS BACKGROUND PRESETS */}

                        <div className="px-2.5 pb-2 pt-3">
                            <p
                                className={[
                                    "px-1 text-[11px] font-medium",
                                    mutedTextClass,
                                ].join(" ")}
                            >
                                Canvas background
                            </p>

                            <div className="mt-2 flex items-center justify-between gap-1 px-1">
                                {canvasBackgroundOptions.map((color) => {
                                    const isActive =
                                        canvasBackground === color ||
                                        (
                                            canvasBackground === null &&
                                            effectiveCanvasBackground.toLowerCase() ===
                                            color.toLowerCase()
                                        );

                                    return (
                                        <button
                                            key={color}
                                            type="button"
                                            title={`Canvas ${color}`}
                                            aria-label={`Set canvas background to ${color}`}
                                            aria-pressed={isActive}
                                            onClick={() =>
                                                setCanvasBackground(color)
                                            }
                                            className={[
                                                "h-7 w-7 shrink-0 rounded-lg border transition-all hover:scale-105",
                                                isActive
                                                    ? "border-[#625DF5] ring-2 ring-[#625DF5]/25"
                                                    : isDark
                                                        ? "border-white/10"
                                                        : "border-black/[0.08]",
                                            ].join(" ")}
                                            style={{
                                                backgroundColor: color,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* DRAWING TOOLBAR */}

            <WhiteboardToolbar
                activeTool={activeTool}
                isDark={isDark}
                onToolChange={handleToolChange}
            />

            {/* TOP RIGHT ACTIONS */}

            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
                <button
                    type="button"
                    className={[
                        "hidden h-10 items-center rounded-xl border px-4 text-[11px] font-medium shadow-sm sm:flex",
                        isDark
                            ? "border-white/10 bg-[#242429]/95 text-white/70 hover:bg-[#2b2b31]"
                            : "border-black/[0.07] bg-white/95 text-[#56565f] hover:bg-white",
                    ].join(" ")}
                >
                    Upgrade
                </button>

                <button
                    type="button"
                    onClick={openShareDialog}
                    className="flex h-10 items-center gap-2 rounded-xl bg-[#625DF5] px-4 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(98,93,245,.22)] transition-colors hover:bg-[#554ff0]"
                >
                    <Users className="h-4 w-4" />

                    <span className="hidden sm:inline">
                        Share
                    </span>
                </button>

                <button
                    type="button"
                    title={
                        propertiesOpen
                            ? "Close properties"
                            : "Open properties"
                    }
                    aria-label="Toggle properties panel"
                    aria-pressed={propertiesOpen}
                    onClick={() => {
                        setPropertiesOpen((value) => !value);
                        setMenuOpen(false);
                    }}
                    className={[
                        "flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-colors",
                        propertiesOpen
                            ? "border-[#625DF5]/25 bg-[#625DF5]/10 text-[#625DF5]"
                            : isDark
                                ? "border-white/10 bg-[#242429]/95 text-white/60 hover:bg-[#2b2b31]"
                                : "border-black/[0.07] bg-white/95 text-[#676770] hover:bg-white",
                    ].join(" ")}
                >
                    <PanelRight className="h-4 w-4" />
                </button>
            </div>

            {/* SHARE BOARD DIALOG */}
            {shareOpen && (
    <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-[3px]"
        onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                setShareOpen(false);
            }
        }}
    >
        <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            className="relative w-full max-w-[570px] rounded-xl border border-black/[0.06] bg-white px-7 py-8 text-[#25252b] shadow-[0_28px_90px_rgba(0,0,0,.22)] sm:px-10 sm:py-10"
        >
            <button
                type="button"
                aria-label="Close share dialog"
                onClick={() => setShareOpen(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[#85858e] transition-colors hover:bg-[#f3f3f7] hover:text-[#373741]"
            >
                <X className="h-4 w-4" />
            </button>

            <h2
                id="share-dialog-title"
                className="text-center text-xl font-bold tracking-[-0.02em] text-[#625DF5] sm:text-[21px]"
            >
                Live collaboration
            </h2>

            <p className="mt-7 text-center text-sm text-[#34343b]">
                Invite people to collaborate on your drawing.
            </p>

            <p className="mx-auto mt-4 max-w-[470px] text-center text-sm leading-6 text-[#45454e]">
                Start a live session to work on the same whiteboard together.
                Your existing room and sign-in are used for access.
            </p>

            <div className="mt-6 flex justify-center">
                <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="inline-flex h-[50px] min-w-[170px] items-center justify-center gap-3 rounded-lg bg-[#625DF5] px-6 text-sm font-semibold text-white shadow-[0_5px_12px_rgba(98,93,245,.18)] transition-colors hover:bg-[#554ff0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#625DF5]/25"
                >
                    <Play className="h-4 w-4 fill-current" />
                    Start session
                </button>
            </div>

            <div className="my-8 flex items-center gap-3 text-sm text-[#27272e]">
                <span className="h-px flex-1 bg-[#e7e7eb]" />
                <span>Or</span>
                <span className="h-px flex-1 bg-[#e7e7eb]" />
            </div>

            <h3 className="text-center text-xl font-bold tracking-[-0.02em] text-[#625DF5] sm:text-[21px]">
                Shareable link
            </h3>

            <p className="mt-5 text-center text-sm text-[#34343b]">
                Export as a read-only link.
            </p>

            <div className="mt-6 flex justify-center">
                <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="inline-flex h-[50px] min-w-[190px] items-center justify-center gap-3 rounded-lg bg-[#625DF5] px-6 text-sm font-semibold text-white shadow-[0_5px_12px_rgba(98,93,245,.18)] transition-colors hover:bg-[#554ff0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#625DF5]/25"
                >
                    <Link2 className="h-4 w-4" />
                    Export to Link
                </button>
            </div>

            {roomLoadError && (
                <p
                    role="status"
                    className="mt-5 rounded-lg border border-[#e6e4ff] bg-[#f7f6ff] px-3 py-2.5 text-xs leading-5 text-[#5952d9]"
                >
                    {roomLoadError}
                </p>
            )}

            <div className="mt-5 flex justify-center">
                <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-[#6f6f79] transition-colors hover:bg-[#f4f4f8] hover:text-[#33333b]"
                >
                    {linkCopied ? (
                        <Check className="h-3.5 w-3.5" />
                    ) : (
                        <Copy className="h-3.5 w-3.5" />
                    )}
                    {linkCopied
                        ? "Board link copied"
                        : "Copy current room link"}
                </button>
            </div>
        </section>
    </div>
)}

            {/* FLOATING CONTEXTUAL PROPERTIES PANEL */}

            {propertiesOpen && (
                <aside
                    aria-label="Properties panel"
                    onPointerDown={(event) =>
                        event.stopPropagation()
                    }
                    onPointerUp={(event) =>
                        event.stopPropagation()
                    }
                    className={[
                        "absolute left-4 top-16 z-40 flex max-h-[calc(100vh-7rem)] w-[min(268px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-[0_20px_60px_rgba(20,20,30,.18)] backdrop-blur-xl",
                        surfaceClass,
                    ].join(" ")}
                >
                    <div
                        className={[
                            "flex items-center justify-between border-b px-4 py-3",
                            isDark
                                ? "border-white/10"
                                : "border-black/[0.07]",
                        ].join(" ")}
                    >
                        <div>
                            <p className="text-sm font-semibold">
                                {selectedElement
                                    ? "Properties"
                                    : "Canvas settings"}
                            </p>

                            <p
                                className={[
                                    "mt-1 text-[11px] capitalize",
                                    mutedTextClass,
                                ].join(" ")}
                            >
                                {selectedElement
                                    ? `${selectedElement.type} selected`
                                    : "Customize workspace"}
                            </p>
                        </div>

                        <button
                            type="button"
                            aria-label="Close properties panel"
                            onClick={() =>
                                setPropertiesOpen(false)
                            }
                            className={[
                                "flex h-8 w-8 items-center justify-center rounded-lg",
                                isDark
                                    ? "text-white/55 hover:bg-white/[0.07]"
                                    : "text-[#777781] hover:bg-black/[0.05]",
                            ].join(" ")}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-5 overflow-y-auto p-4">
                        {selectedElement ? (
                            <>
                                {/* STROKE COLOR */}

                                {selectedCanHaveStroke && (
                                    <section>
                                        <p className="text-xs font-medium">
                                            Stroke color
                                        </p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <input
                                                type="color"
                                                aria-label="Stroke color"
                                                value={selectedStrokeColor}
                                                onChange={(event) =>
                                                    updateSelectedElementProperties({
                                                        strokeColor:
                                                            event.currentTarget.value,
                                                    })
                                                }
                                                className="h-9 w-11 cursor-pointer rounded-md border-0 bg-transparent"
                                            />

                                            <input
                                                type="text"
                                                aria-label="Stroke HEX color"
                                                value={selectedStrokeColor}
                                                onChange={(event) => {
                                                    const value =
                                                        event.currentTarget.value;

                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(value)
                                                    ) {
                                                        updateSelectedElementProperties({
                                                            strokeColor: value,
                                                        });
                                                    }
                                                }}
                                                className={[
                                                    "min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-[11px] outline-none focus:border-[#625DF5]",
                                                    inputClass,
                                                ].join(" ")}
                                            />
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {ELEMENT_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    title={color}
                                                    aria-label={`Set stroke to ${color}`}
                                                    onClick={() =>
                                                        updateSelectedElementProperties({
                                                            strokeColor: color,
                                                        })
                                                    }
                                                    className={[
                                                        "h-5 w-5 rounded-md border transition-transform hover:scale-110",
                                                        selectedStrokeColor === color
                                                            ? "border-[#625DF5] ring-2 ring-[#625DF5]/30"
                                                            : "border-black/10",
                                                    ].join(" ")}
                                                    style={{
                                                        backgroundColor: color,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* FILL / NOTE BACKGROUND */}

                                {selectedCanFill && (
                                    <section>
                                        <p className="text-xs font-medium">
                                            {selectedElement.type === "note"
                                                ? "Note background"
                                                : "Background"}
                                        </p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <input
                                                type="color"
                                                aria-label="Element fill color"
                                                value={selectedFillColor}
                                                onChange={(event) =>
                                                    updateSelectedElementProperties({
                                                        fillColor:
                                                            event.currentTarget.value,
                                                    })
                                                }
                                                className="h-9 w-11 cursor-pointer rounded-md border-0 bg-transparent"
                                            />

                                            <input
                                                type="text"
                                                aria-label="Fill HEX color"
                                                value={selectedFillColor}
                                                onChange={(event) => {
                                                    const value =
                                                        event.currentTarget.value;

                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(value)
                                                    ) {
                                                        updateSelectedElementProperties({
                                                            fillColor: value,
                                                        });
                                                    }
                                                }}
                                                className={[
                                                    "min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-[11px] outline-none focus:border-[#625DF5]",
                                                    inputClass,
                                                ].join(" ")}
                                            />
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {ELEMENT_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    title={color}
                                                    aria-label={`Set fill to ${color}`}
                                                    onClick={() =>
                                                        updateSelectedElementProperties({
                                                            fillColor: color,
                                                        })
                                                    }
                                                    className={[
                                                        "h-5 w-5 rounded-md border transition-transform hover:scale-110",
                                                        selectedFillColor === color
                                                            ? "border-[#625DF5] ring-2 ring-[#625DF5]/30"
                                                            : "border-black/10",
                                                    ].join(" ")}
                                                    style={{
                                                        backgroundColor: color,
                                                    }}
                                                />
                                            ))}
                                        </div>

                                        {selectedElement.type !== "note" && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateSelectedElementProperties({
                                                        fillColor: undefined,
                                                    })
                                                }
                                                className={[
                                                    "mt-2 rounded-lg px-2.5 py-1.5 text-[11px]",
                                                    isDark
                                                        ? "bg-white/[0.06] text-white/70 hover:bg-white/[0.10]"
                                                        : "bg-black/[0.04] text-[#62626c] hover:bg-black/[0.07]",
                                                ].join(" ")}
                                            >
                                                Remove fill
                                            </button>
                                        )}
                                    </section>
                                )}

                                {/* TEXT COLOR */}

                                {selectedCanHaveTextColor && (
                                    <section>
                                        <p className="text-xs font-medium">
                                            Text color
                                        </p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <input
                                                type="color"
                                                aria-label="Text color"
                                                value={selectedTextColor}
                                                onChange={(event) =>
                                                    updateSelectedElementProperties({
                                                        textColor:
                                                            event.currentTarget.value,
                                                    })
                                                }
                                                className="h-9 w-11 cursor-pointer rounded-md border-0 bg-transparent"
                                            />

                                            <input
                                                type="text"
                                                aria-label="Text HEX color"
                                                value={selectedTextColor}
                                                onChange={(event) => {
                                                    const value =
                                                        event.currentTarget.value;

                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(value)
                                                    ) {
                                                        updateSelectedElementProperties({
                                                            textColor: value,
                                                        });
                                                    }
                                                }}
                                                className={[
                                                    "min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-[11px] outline-none focus:border-[#625DF5]",
                                                    inputClass,
                                                ].join(" ")}
                                            />
                                        </div>
                                    </section>
                                )}

                                {/* STROKE WIDTH */}

                                {selectedCanHaveStroke && (
                                    <section>
                                        <div className="flex items-center justify-between">
                                            <label
                                                htmlFor="element-stroke-width"
                                                className="text-xs font-medium"
                                            >
                                                Stroke width
                                            </label>

                                            <span
                                                className={[
                                                    "text-xs tabular-nums",
                                                    mutedTextClass,
                                                ].join(" ")}
                                            >
                                                {selectedElement.strokeWidth ?? 2}px
                                            </span>
                                        </div>

                                        <input
                                            id="element-stroke-width"
                                            type="range"
                                            min={1}
                                            max={8}
                                            step={1}
                                            value={
                                                selectedElement.strokeWidth ?? 2
                                            }
                                            onChange={(event) =>
                                                updateSelectedElementProperties({
                                                    strokeWidth:
                                                        Number(event.currentTarget.value),
                                                })
                                            }
                                            className="mt-3 w-full accent-[#625DF5]"
                                        />
                                    </section>
                                )}

                                {/* FONT SIZE */}

                                {selectedElement.type === "text" && (
                                    <section>
                                        <div className="flex items-center justify-between">
                                            <label
                                                htmlFor="element-font-size"
                                                className="text-xs font-medium"
                                            >
                                                Font size
                                            </label>

                                            <span
                                                className={[
                                                    "text-xs tabular-nums",
                                                    mutedTextClass,
                                                ].join(" ")}
                                            >
                                                {selectedElement.fontSize ?? 20}px
                                            </span>
                                        </div>

                                        <input
                                            id="element-font-size"
                                            type="range"
                                            min={10}
                                            max={64}
                                            step={1}
                                            value={
                                                selectedElement.fontSize ?? 20
                                            }
                                            onChange={(event) =>
                                                updateSelectedElementProperties({
                                                    fontSize:
                                                        Number(event.currentTarget.value),
                                                })
                                            }
                                            className="mt-3 w-full accent-[#625DF5]"
                                        />
                                    </section>
                                )}

                                {/* OPACITY */}

                                <section>
                                    <div className="flex items-center justify-between">
                                        <label
                                            htmlFor="element-opacity"
                                            className="text-xs font-medium"
                                        >
                                            Opacity
                                        </label>

                                        <span
                                            className={[
                                                "text-xs tabular-nums",
                                                mutedTextClass,
                                            ].join(" ")}
                                        >
                                            {Math.round(
                                                (selectedElement.opacity ?? 1) * 100
                                            )}%
                                        </span>
                                    </div>

                                    <input
                                        id="element-opacity"
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={selectedElement.opacity ?? 1}
                                        onChange={(event) =>
                                            updateSelectedElementProperties({
                                                opacity:
                                                    Number(event.currentTarget.value),
                                            })
                                        }
                                        className="mt-3 w-full accent-[#625DF5]"
                                    />
                                </section>
                            </>
                        ) : (
                            <>
                                {/* APPEARANCE SETTINGS */}

                                <section>
                                    <p className="text-xs font-semibold">
                                        Appearance
                                    </p>

                                    <div
                                        className={[
                                            "mt-3 grid grid-cols-3 gap-1 rounded-xl border p-1",
                                            isDark
                                                ? "border-white/10 bg-white/[0.04]"
                                                : "border-black/[0.07] bg-[#f7f7f9]",
                                        ].join(" ")}
                                    >
                                        {(
                                            [
                                                "light",
                                                "dark",
                                                "system",
                                            ] as ThemeMode[]
                                        ).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                aria-pressed={theme === mode}
                                                onClick={() =>
                                                    handleThemeChange(mode)
                                                }
                                                className={[
                                                    "rounded-lg px-2 py-2 text-[11px] capitalize transition-colors",
                                                    theme === mode
                                                        ? "bg-[#625DF5] text-white"
                                                        : isDark
                                                            ? "text-white/60 hover:bg-white/[0.06]"
                                                            : "text-[#666670] hover:bg-white",
                                                ].join(" ")}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                {/* CANVAS BACKGROUND SETTINGS */}

                                <section>
                                    <p className="text-xs font-semibold">
                                        Canvas background
                                    </p>

                                    <div className="mt-3 flex items-center gap-2">
                                        <input
                                            type="color"
                                            aria-label="Custom canvas background"
                                            value={effectiveCanvasBackground}
                                            onChange={(event) =>
                                                setCanvasBackground(
                                                    event.currentTarget.value
                                                )
                                            }
                                            className="h-9 w-11 cursor-pointer rounded-md border-0 bg-transparent"
                                        />

                                        <input
                                            type="text"
                                            aria-label="Canvas HEX color"
                                            value={effectiveCanvasBackground}
                                            onChange={(event) => {
                                                const value =
                                                    event.currentTarget.value;

                                                if (
                                                    /^#[0-9a-fA-F]{6}$/.test(value)
                                                ) {
                                                    setCanvasBackground(value);
                                                }
                                            }}
                                            className={[
                                                "min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-[11px] outline-none focus:border-[#625DF5]",
                                                inputClass,
                                            ].join(" ")}
                                        />
                                    </div>

                                    <div className="mt-3 grid grid-cols-6 gap-2">
                                        {canvasBackgroundOptions.map((color) => {
                                            const isActive =
                                                canvasBackground === color ||
                                                (
                                                    canvasBackground === null &&
                                                    effectiveCanvasBackground.toLowerCase() ===
                                                    color.toLowerCase()
                                                );

                                            return (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    title={color}
                                                    aria-label={`Set canvas background to ${color}`}
                                                    aria-pressed={isActive}
                                                    onClick={() =>
                                                        setCanvasBackground(color)
                                                    }
                                                    className={[
                                                        "h-8 w-full rounded-lg border transition-transform hover:scale-105",
                                                        isActive
                                                            ? "border-[#625DF5] ring-2 ring-[#625DF5]/25"
                                                            : isDark
                                                                ? "border-white/10"
                                                                : "border-black/[0.08]",
                                                    ].join(" ")}
                                                    style={{
                                                        backgroundColor: color,
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            </>
                        )}
                    </div>
                </aside>
            )}

            {/* ZOOM CONTROLS */}

            <div
                className={[
                    "absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center rounded-xl border p-1 shadow-[0_8px_30px_rgba(20,20,30,.08)] backdrop-blur-xl",
                    isDark
                        ? "border-white/10 bg-[#242429]/95"
                        : "border-black/[0.07] bg-white/[0.96]",
                ].join(" ")}
            >
                <button
                    type="button"
                    title="Zoom out"
                    aria-label="Zoom out"
                    onClick={zoomOut}
                    className={[
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        isDark
                            ? "text-white/55 hover:bg-white/[0.07]"
                            : "text-[#696973] hover:bg-[#f5f4fa]",
                    ].join(" ")}
                >
                    <Minus className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title="Reset zoom"
                    onClick={resetZoom}
                    className={[
                        "min-w-[62px] rounded-lg px-2 py-2 text-[11px] font-medium",
                        isDark
                            ? "text-white/75 hover:bg-white/[0.06]"
                            : "text-[#55555e] hover:bg-[#f5f4fa]",
                    ].join(" ")}
                >
                    {zoom}%
                </button>

                <button
                    type="button"
                    title="Zoom in"
                    aria-label="Zoom in"
                    onClick={zoomIn}
                    className={[
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        isDark
                            ? "text-white/55 hover:bg-white/[0.07]"
                            : "text-[#696973] hover:bg-[#f5f4fa]",
                    ].join(" ")}
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>

            {/* LOCK / HELP */}

            <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2">
                <button
                    type="button"
                    title={locked ? "Unlock canvas" : "Lock canvas"}
                    aria-pressed={locked}
                    onClick={() =>
                        setLocked((value) => !value)
                    }
                    className={[
                        "flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm",
                        locked
                            ? "border-[#625DF5]/20 bg-[#625DF5] text-white"
                            : isDark
                                ? "border-white/10 bg-[#242429]/95 text-white/45"
                                : "border-black/[0.07] bg-white/95 text-[#8d8d96]",
                    ].join(" ")}
                >
                    <Lock className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title="Help"
                    className={[
                        "hidden h-9 w-9 items-center justify-center rounded-xl border shadow-sm sm:flex",
                        isDark
                            ? "border-white/10 bg-[#242429]/95 text-white/45"
                            : "border-black/[0.07] bg-white/95 text-[#8d8d96]",
                    ].join(" ")}
                >
                    <HelpCircle className="h-4 w-4" />
                </button>
            </div>

            {/* COMMAND PALETTE */}

            {menuSearchOpen && (
                <div
                    className="fixed inset-0 z-[70] flex items-start justify-center bg-black/20 px-4 pt-[18vh] backdrop-blur-[2px]"
                    onClick={() =>
                        setMenuSearchOpen(false)
                    }
                >
                    <div
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                        className={[
                            "w-full max-w-[520px] overflow-hidden rounded-2xl border shadow-[0_30px_100px_rgba(0,0,0,.20)]",
                            surfaceClass,
                        ].join(" ")}
                    >
                        <div
                            className={[
                                "flex items-center gap-3 border-b px-4 py-3",
                                isDark
                                    ? "border-white/10"
                                    : "border-black/[0.06]",
                            ].join(" ")}
                        >
                            <Command
                                className={[
                                    "h-4 w-4",
                                    mutedTextClass,
                                ].join(" ")}
                            />

                            <input
                                autoFocus
                                placeholder="Search commands..."
                                className={[
                                    "min-w-0 flex-1 bg-transparent text-sm outline-none",
                                    isDark
                                        ? "text-white placeholder:text-white/30"
                                        : "text-[#2f2f36] placeholder:text-[#aaaab2]",
                                ].join(" ")}
                            />

                            <button
                                type="button"
                                aria-label="Close command palette"
                                onClick={() =>
                                    setMenuSearchOpen(false)
                                }
                                className={[
                                    "flex h-7 w-7 items-center justify-center rounded-md",
                                    isDark
                                        ? "text-white/55 hover:bg-white/[0.07]"
                                        : "text-[#888891] hover:bg-black/[0.05]",
                                ].join(" ")}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-2">
                            {(
                                [
                                    {
                                        label: "Select tool",
                                        tool: "select" as ToolId,
                                    },
                                    {
                                        label: "Draw",
                                        tool: "draw" as ToolId,
                                    },
                                    {
                                        label: "Rectangle",
                                        tool: "rectangle" as ToolId,
                                    },
                                    {
                                        label: "Ellipse",
                                        tool: "ellipse" as ToolId,
                                    },
                                    {
                                        label: "Text",
                                        tool: "text" as ToolId,
                                    },
                                    {
                                        label: "Note",
                                        tool: "note" as ToolId,
                                    },
                                ]
                            ).map((commandItem) => (
                                <button
                                    key={commandItem.label}
                                    type="button"
                                    onClick={() => {
                                        setActiveTool(commandItem.tool);
                                        setMenuSearchOpen(false);
                                        setMenuOpen(false);
                                    }}
                                    className={[
                                        "flex w-full items-center rounded-lg px-3 py-2.5 text-left text-xs transition-colors",
                                        isDark
                                            ? "text-white/70 hover:bg-white/[0.06]"
                                            : "text-[#666670] hover:bg-[#f5f4fa]",
                                    ].join(" ")}
                                >
                                    {commandItem.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}