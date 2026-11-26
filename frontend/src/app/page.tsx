"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LinkNode } from "@/components/nodes/link-node";
import { TaskNode } from "@/components/nodes/task-node";
import { TextNode } from "@/components/nodes/text-node";
import { ResultNode } from "@/components/nodes/result-node";
import { FreeNode } from "@/components/nodes/free-node";
import { InspireNode } from "@/components/nodes/inspire-node";
import { NoteNode } from "@/components/nodes/note-node";
import { ImageNode } from "@/components/nodes/image-node";
import { GroupFrameNode } from "@/components/canvas/group-frame-node";
import { buildGroupFrames } from "@/lib/canvas-groups";
import { Icons } from "@/components/icons";
import { useCanvasStore } from "@/lib/canvas-store";
import { toCanvasStateSnapshot } from "@/lib/canvas-store";
import { isAuthenticated, getUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { BASE_NODE_WIDTH, WIDTH_BY_KIND } from "@/data/node-defaults";
import { NODE_HEIGHT_BY_KIND } from "@/data/layout-constants";
import { useKeyboardShortcuts, isTypingTarget } from "@/hooks/use-keyboard-shortcuts";
import { useContextMenu } from "@/hooks/use-context-menu";
import { TopBar } from "@/components/layout/top-bar";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { CanvasToolbar } from "@/components/layout/canvas-toolbar";
import { MobileBar } from "@/components/layout/mobile-bar";
import { ReasoningPanel } from "@/components/panels/reasoning-panel";
import { SocraticPanel } from "@/components/panels/socratic-panel";
import { MentionPickerHost } from "@/components/panels/mention-picker";
import { ProfileModal } from "@/components/panels/profile-modal";
import { toast } from "sonner";
import { ExportDialog } from "@/components/panels/export-dialog";
import { parseCanvasExport, type CanvasExportFile } from "@/lib/canvas-export";
import { useT, t as i18nT } from "@/lib/i18n";
import { SHORTCUT_ACTIONS, SHORTCUT_LABELS, getShortcuts, subscribeShortcuts } from "@/lib/shortcut-settings";
import { computeDragPosition } from "@/lib/floating-drag";
import { miniMapNodeColor, nodeKindColor } from "@/lib/node-colors";
import { isImageFile, readImageFile } from "@/lib/image-import";

const nodeTypes = {
  linkNode: LinkNode,
  taskNode: TaskNode,
  textNode: TextNode,
  resultNode: ResultNode,
  freeNode: FreeNode,
  inspireNode: InspireNode,
  noteNode: NoteNode,
  imageNode: ImageNode,
  groupFrame: GroupFrameNode,
};

function hasFilePayload(event: { dataTransfer: DataTransfer }) {
  return Array.from(event.dataTransfer.types ?? []).includes("Files");
}

function WorkspacePage() {
  const [edgeContextMenu, setEdgeContextMenu] = useState<{x: number; y: number; edgeId: string} | null>(null);
  const [paneContextMenu, setPaneContextMenu] = useState<{x: number; y: number} | null>(null);
  const [connectMenu, setConnectMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
    fromNodeId: string;
    fromHandleId?: string | null;
    fromHandleType?: "source" | "target";
  } | null>(null);
  const [inspireOpen, setInspireOpen] = useState(false);
  const inspireEntryRef = useRef<HTMLDivElement>(null);
  const inspireDragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    width: number;
    height: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    onMove?: (event: PointerEvent) => void;
    onUp?: (event: PointerEvent) => void;
  } | null>(null);
  const suppressInspireClickRef = useRef(false);
  const [inspirePos, setInspirePos] = useState<{ x: number; y: number } | null>(null);
  const [inspireDragging, setInspireDragging] = useState(false);

  // 在挂载后再读 localStorage：服务端渲染阶段没有 window，不能放在 useState 初始化里
  useEffect(() => {
    try {
      const raw = localStorage.getItem("godeeper-inspire-pos");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return;
      // 换到更小的窗口时也要能看见，避免上次保存的位置落到视口外
      setInspirePos({
        x: Math.min(Math.max(8, parsed.x), Math.max(8, window.innerWidth - 40)),
        y: Math.min(Math.max(56, parsed.y), Math.max(56, window.innerHeight - 40)),
      });
    } catch {
      /* ignore malformed position */
    }
  }, []);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const {
    nodes,
    edges,
    groups,
    createGroupFromSelection,
    ungroupSelected,
    search,
    gridVisible,
    panelCollapsed,
    isLayoutAnimating,
    selectedNodeIds,
    focusNodeId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onReconnect,
    clearSelection,
    addNode,
    addConnectedNode,
    createAiQuestionFromTask,
    createInspireActionCard,
    selectedNodeId,
    setSearch,
    focusMode,
    focusPath,
    enterFocusMode,
    drillDown,
    exitDrillDown,
    drillDownActive,
    socraticActive,
    socraticNodes,
    startSocratic,
    resumeSocratic,
    mentionPicking,
    selectNode,
  } = useCanvasStore();

  const importUrl = useCanvasStore((s) => s.importUrl);
  const importDocumentAt = useCanvasStore((s) => s.importDocumentAt);
  const importTextAt = useCanvasStore((s) => s.importTextAt);
  const restoreCanvas = useCanvasStore((s) => s.restoreCanvas);
  const profileOpen = useCanvasStore((s) => s.profileOpen);
  const exportOpen = useCanvasStore((s) => s.exportOpen);
  const canvasNodes = useCanvasStore((s) => s.nodes);

  const reactFlow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const didInitialFit = useRef(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const language = useCanvasStore((s) => s.language);
  const [shortcutMap, setShortcutMap] = useState(getShortcuts);
  const t = useT();

  useEffect(() => subscribeShortcuts(() => setShortcutMap(getShortcuts())), []);

  useKeyboardShortcuts();

  useEffect(() => {
    if (!inspireOpen) return;
    const handler = (event: MouseEvent) => {
      if (inspireEntryRef.current && !inspireEntryRef.current.contains(event.target as Node)) {
        setInspireOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inspireOpen]);

  // React Flow's fitView prop runs before node sizes are measured, which leaves
  // the demo nodes partially off-screen. Re-fit once, after every node reports
  // its measured size, then leave the viewport under the user's control.
  useEffect(() => {
    if (!nodesInitialized || didInitialFit.current) return;
    didInitialFit.current = true;
    reactFlow.fitView({ padding: 0.12, maxZoom: 1 });
  }, [nodesInitialized, reactFlow]);

  // 自动布局只改坐标，如果不重新 fitView，节点会被排到视野外，用户以为卡片消失了。
  const layoutVersion = useCanvasStore((state) => state.layoutVersion);
  useEffect(() => {
    if (layoutVersion === 0) return;
    const timer = setTimeout(() => {
      reactFlow.fitView({ padding: 0.15, duration: 300, minZoom: 0.45 });
    }, 380);
    return () => clearTimeout(timer);
  }, [layoutVersion, reactFlow]);

  // 主题必须由工作区统一应用：只在设置弹窗里切换会导致“弹窗关掉就恢复浅色、刷新也不记住”。
  const theme = useCanvasStore((state) => state.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 追问会话每次新增卡片后把会话画布收进视野；主画布视口不受影响。
  useEffect(() => {
    if (!socraticActive) return;
    const timer = setTimeout(() => {
      reactFlow.fitView({ padding: 0.18, maxZoom: 1 });
    }, 160);
    return () => clearTimeout(timer);
  }, [socraticActive, socraticNodes.length, reactFlow]);

  // 提及画布点选：Esc 随时取消，即使焦点在输入框里。
  useEffect(() => {
    if (!mentionPicking) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        useCanvasStore.getState().cancelMentionPicking();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [mentionPicking]);

  // Multi-select Delete key → confirmation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      if (useCanvasStore.getState().socraticActive) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const { selectedNodeIds } = useCanvasStore.getState();
      if (selectedNodeIds.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirm(true);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Auto-save canvas with debounce
  useEffect(() => {
    const state = useCanvasStore.getState();
    state.setSaveState?.("Unsaved");
    const timer = setTimeout(() => {
      const s = useCanvasStore.getState();
      s.setSaveState("Saving");
      const canvasId = s.activeCanvasId;

      // Auto-name: if still default, try first node title
      if (s.canvasName === "Untitled Canvas" && s.nodes.length > 0) {
        const firstTitle = s.nodes[0].data.title?.trim();
        if (firstTitle && firstTitle !== "Untitled" && firstTitle !== "新想法" && firstTitle !== "New idea") {
          useCanvasStore.setState({ canvasName: firstTitle });
        }
      }

      // 复用 store 的完整快照，避免遗漏 groups / concepts / guideMode 等字段。
      const currentSeed = toCanvasStateSnapshot(useCanvasStore.getState());
      useCanvasStore.setState({
        canvases: { ...s.canvases, [canvasId]: currentSeed },
        // 未登录时 saveCurrentCanvas 会直接跳过，不能显示成「已保存」
        saveState: isAuthenticated() ? "Saved" : "Unsaved",
      });
      s.saveCurrentCanvas();
    }, 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const {
    contextMenu,
    setContextMenu,
    handleNodeContextMenu,
    closeContextMenu,
    handleDuplicate,
    handleAddToSelection,
    handleCreateTask,
    handleDelete,
  } = useContextMenu();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const { selectedNodeId, selectedNodeIds } = useCanvasStore.getState();
        const nodeId = selectedNodeId ?? selectedNodeIds[0];
        if (!nodeId) return;
        e.preventDefault();
        const nodeEl = document.querySelector(
          `.react-flow__node[data-id="${nodeId}"]`
        );
        if (nodeEl) {
          const rect = nodeEl.getBoundingClientRect();
          setContextMenu({ x: rect.right, y: rect.top, nodeId });
        }
      }
      if (e.key === "Escape") {
        setShortcutsOpen(false);
        setConnectMenu(null);
        setInspireOpen(false);
        closeContextMenu();
        setEdgeContextMenu(null);
        setPaneContextMenu(null);
        const store = useCanvasStore.getState();
        if (store.focusMode) store.exitFocusMode();
      }
    };
    // 右键菜单需要全局关闭：点击任意非菜单区域、按 Esc、打开其它菜单时都应消失。
    const closeMenusOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".context-menu")) return;
      closeContextMenu();
      setEdgeContextMenu(null);
      setPaneContextMenu(null);
      setConnectMenu(null);
    };
    window.addEventListener("keydown", handler);
    document.addEventListener("mousedown", closeMenusOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", handler);
      document.removeEventListener("mousedown", closeMenusOnOutsideClick);
    };
  }, [setContextMenu, closeContextMenu]);

  const isUrl = (text: string) => {
    try {
      const u = new URL(text.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const lastPanePointRef = useRef<{ x: number; y: number } | null>(null);

  // 链接节点以落点为中心偏上放置，避免覆盖用户刚点击的位置
  const linkInsertPosition = useCallback(() => {
    const width = WIDTH_BY_KIND.link ?? 480;
    const panePoint = lastPanePointRef.current;
    if (panePoint) {
      return { x: panePoint.x - width / 2, y: panePoint.y - 60 };
    }
    const center = reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    return { x: center.x - width / 2, y: center.y - 60 };
  }, [reactFlow]);

  const handlePaste = useCallback((event: ClipboardEvent) => {
    // 输入框/可编辑区域内的粘贴交给浏览器；登录、导出等弹窗打开时也不要在画布上创建节点
    if (isTypingTarget(event.target)) return;
    if (document.querySelector(".modal-shell, [role='dialog']")) return;

    const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!text && files.length === 0) return;
    event.preventDefault();

    const language = useCanvasStore.getState().language;
    const point = linkInsertPosition();

    if (text) {
      if (isUrl(text)) {
        try {
          importUrl(text, point.x, point.y);
          toast.success(i18nT("urlImported", language));
        } catch {
          toast.error(i18nT("importUrlFailed", language));
        }
      } else {
        void importTextAt(text, point.x, point.y);
        toast.success(i18nT("textNodeAdded", language));
      }
    }

    files.forEach((file, index) => {
      // 剪贴板里的 JSON 不自动覆盖画布，避免误操作
      if (/\.json$/i.test(file.name)) return;
      if (isImageFile(file)) {
        void (async () => {
          try {
            const image = await readImageFile(file);
            useCanvasStore.getState().addImageNodeAt(
              { imageUrl: image.dataUrl, title: file.name, naturalWidth: image.width, naturalHeight: image.height },
              point.x,
              point.y + index * 40,
            );
            toast.success(i18nT("imageNodeAdded", language));
          } catch {
            toast.error(i18nT("imageImportFailed", language));
          }
        })();
        return;
      }
      void importDocumentAt(file, point.x, point.y + index * 40);
    });
  }, [importDocumentAt, importTextAt, importUrl, linkInsertPosition]);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const lastPaneClickRef = useRef<number>(0);

  const handlePaneClick = useCallback((event: ReactMouseEvent) => {
    if (profileOpen || exportOpen) return;
    closeContextMenu();
    setEdgeContextMenu(null);
    setPaneContextMenu(null);
    setConnectMenu(null);
    setInspireOpen(false);
    clearSelection();
    setSearch("");

    const flowPoint = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    // 记录空白处落点：之后粘贴链接/文本就在这个位置生成链接节点
    lastPanePointRef.current = flowPoint;

    const now = Date.now();
    if (now - lastPaneClickRef.current < 350) {
      lastPaneClickRef.current = 0;
      addNode(
        flowPoint.x - BASE_NODE_WIDTH / 2,
        flowPoint.y - NODE_HEIGHT_BY_KIND.text / 2,
      );
    } else {
      lastPaneClickRef.current = now;
    }
  }, [closeContextMenu, clearSelection, setSearch, reactFlow, addNode, profileOpen, exportOpen]);

  const handleConnectEnd = useCallback<OnConnectEnd>((event, state) => {
    if (state.toNode || !state.fromNode || !state.fromHandle) return;
    const touch =
      "changedTouches" in event
        ? event.changedTouches?.[0] ?? event.touches?.[0]
        : null;
    const clientX = "clientX" in event ? event.clientX : touch?.clientX ?? 0;
    const clientY = "clientY" in event ? event.clientY : touch?.clientY ?? 0;
    const flowPoint = reactFlow.screenToFlowPosition({ x: clientX, y: clientY });
    setConnectMenu({
      x: Math.min(clientX, window.innerWidth - 276),
      y: Math.min(clientY, window.innerHeight - 136),
      flowX: flowPoint.x,
      flowY: flowPoint.y,
      fromNodeId: state.fromNode.id,
      fromHandleId: state.fromHandle.id,
      fromHandleType: state.fromHandle.type,
    });
  }, [reactFlow]);

  const createConnectedNode = useCallback((kind: "text" | "task") => {
    if (!connectMenu) return;
    addConnectedNode({
      fromNodeId: connectMenu.fromNodeId,
      fromHandleId: connectMenu.fromHandleId,
      fromHandleType: connectMenu.fromHandleType,
      x: connectMenu.flowX,
      y: connectMenu.flowY,
      kind,
    });
    setConnectMenu(null);
  }, [addConnectedNode, connectMenu]);

  const handleInspireAction = useCallback((action: "inspire" | "challenge" | "rebut") => {
    if (!selectedNodeId) {
      toast(i18nT("inspireNeedSelect", language));
      return;
    }
    setInspireOpen(false);
    if (action === "inspire") {
      void createAiQuestionFromTask(selectedNodeId);
    } else {
      createInspireActionCard(action);
    }
  }, [createAiQuestionFromTask, createInspireActionCard, language, selectedNodeId]);

  const detachInspireDragListeners = () => {
    const drag = inspireDragRef.current;
    if (!drag) return;
    if (drag.onMove) window.removeEventListener("pointermove", drag.onMove);
    if (drag.onUp) {
      window.removeEventListener("pointerup", drag.onUp);
      window.removeEventListener("pointercancel", drag.onUp);
    }
  };

  const handleInspirePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const entry = inspireEntryRef.current;
    if (!entry) return;
    const rect = entry.getBoundingClientRect();
    setInspireDragging(true);

    const drag = {
      startX: event.clientX,
      startY: event.clientY,
      origX: rect.left,
      origY: rect.top,
      width: rect.width,
      height: rect.height,
      lastX: rect.left,
      lastY: rect.top,
      moved: false,
      onMove: undefined as ((event: PointerEvent) => void) | undefined,
      onUp: undefined as ((event: PointerEvent) => void) | undefined,
    };

    const onMove = (moveEvent: PointerEvent) => {
      const next = computeDragPosition({
        startX: drag.startX,
        startY: drag.startY,
        originX: drag.origX,
        originY: drag.origY,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        width: drag.width,
        height: drag.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      if (!next.moved) return;
      drag.moved = true;
      drag.lastX = next.x;
      drag.lastY = next.y;
      setInspirePos({ x: next.x, y: next.y });
    };

    const onUp = () => {
      if (drag.moved) {
        suppressInspireClickRef.current = true;
        const x = Math.round(drag.lastX);
        const y = Math.round(drag.lastY);
        setInspirePos({ x, y });
        try {
          localStorage.setItem("godeeper-inspire-pos", JSON.stringify({ x, y }));
        } catch {
          /* storage may be unavailable */
        }
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      inspireDragRef.current = null;
      setInspireDragging(false);
    };

    drag.onMove = onMove;
    drag.onUp = onUp;
    inspireDragRef.current = drag;
    // 窗口级监听：指针离开按钮、组件重渲染或移出窗口时仍能持续跟随
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => () => {
    detachInspireDragListeners();
    inspireDragRef.current = null;
  }, []);

  const handleInspireFabClick = () => {
    if (suppressInspireClickRef.current) {
      suppressInspireClickRef.current = false;
      return;
    }
    setInspireOpen((open) => !open);
  };

  const [dragActive, setDragActive] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ file: CanvasExportFile; name: string } | null>(null);
  const dragDepthRef = useRef(0);

  const applyRestore = useCallback((file: CanvasExportFile) => {
    restoreCanvas(file);
    // 等 React Flow 接收新节点后再恢复视口，保证下一次导出仍是同一视角
    window.setTimeout(() => {
      if (file.viewport) {
        reactFlow.setViewport(file.viewport);
      } else {
        reactFlow.fitView({ padding: 0.12 });
      }
    }, 80);
    toast.success(t("restoreDone"), {
      description: `${file.nodes.length} ${t("nodes")} · ${file.edges.length} ${t("links")}`,
    });
  }, [reactFlow, restoreCanvas, t]);

  const handleDragEnter = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDrop = useCallback(async (event: ReactDragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;

    const language = useCanvasStore.getState().language;
    const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const width = WIDTH_BY_KIND.link ?? 480;

    // 1) 本项目的 JSON：校验后恢复整张画布
    const jsonFile = files.find((file) => /\.json$/i.test(file.name));
    if (jsonFile) {
      try {
        const parsed = parseCanvasExport(await jsonFile.text());
        if (useCanvasStore.getState().nodes.length > 0) {
          setPendingRestore({ file: parsed, name: jsonFile.name });
        } else {
          applyRestore(parsed);
        }
      } catch (err) {
        toast.error(i18nT("restoreFailed", language), {
          description: err instanceof Error ? err.message : undefined,
        });
      }
      return;
    }

    // 2) 图片：在落点生成图片节点
    const imageFiles = files.filter(isImageFile);
    imageFiles.forEach((file, index) => {
      void (async () => {
        try {
          const image = await readImageFile(file);
          useCanvasStore.getState().addImageNodeAt(
            { imageUrl: image.dataUrl, title: file.name, naturalWidth: image.width, naturalHeight: image.height },
            point.x,
            point.y + index * 40,
          );
          toast.success(i18nT("imageNodeAdded", language));
        } catch {
          toast.error(i18nT("imageImportFailed", language));
        }
      })();
    });

    // 3) 文档：在落点生成链接节点
    const docFiles = files.filter(
      (file) =>
        /\.(txt|md|markdown|pdf)$/i.test(file.name) ||
        file.type.startsWith("text/") ||
        file.type === "application/pdf",
    );
    docFiles.forEach((file, index) => {
      void importDocumentAt(file, point.x - width / 2, point.y - 60 + index * 40);
    });
    if (docFiles.length > 0) {
      toast.success(i18nT("linkNodeAdded", language));
    }

    const unsupported = files.filter((file) => !docFiles.includes(file) && !imageFiles.includes(file));
    if (unsupported.length > 0) {
      toast.error(i18nT("fileNotSupported", language), {
        description: unsupported.map((file) => file.name).join(", "),
      });
    }
  }, [applyRestore, importDocumentAt, reactFlow]);

  // 防止在画布外松手时浏览器直接打开文件、离开当前页面
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  useEffect(() => {
    if (focusNodeId) {
      reactFlow.fitView({ nodes: [{ id: focusNodeId }], duration: 300, padding: 0.3 });
    }
  }, [focusNodeId, reactFlow]);

  useEffect(() => {
    if (!isLayoutAnimating) return;
    const timer = setTimeout(() => {
      reactFlow.fitView({ duration: 400, padding: 0.15 });
    }, 400);
    return () => clearTimeout(timer);
  }, [isLayoutAnimating, reactFlow]);

  const filteredNodeIds = useMemo(() => {
    if (!search.trim()) return null;
    const query = search.toLowerCase();
    return new Set(
      nodes
        .filter(
          (node) =>
            node.data.title.toLowerCase().includes(query) ||
            node.data.body.toLowerCase().includes(query),
        )
        .map((node) => node.id),
    );
  }, [nodes, search]);

  const groupFrames = useMemo(() => buildGroupFrames(groups, nodes), [groups, nodes]);

  const flowNodes = useMemo(() => {
    if (socraticActive) {
      return socraticNodes.map((node) => ({
        ...node,
        className: `${node.className ?? ""} socratic-session-node`.trim(),
        selected: false,
      }));
    }
    return [
      ...groupFrames,
      ...nodes.map((node) => {
        const isFiltered = filteredNodeIds && !filteredNodeIds.has(node.id);
        const isMultiSelected = selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id);
        const isFocused = focusNodeId === node.id;
        const isFocusDimmed = focusMode && !focusPath.has(node.id);
        let className = node.className ?? "";
        if (isFiltered || isFocusDimmed) className = `${className} flow-node-dimmed`.trim();
        if (isMultiSelected) className = `${className} flow-node-multi-selected`.trim();
        if (isFocused) className = `${className} flow-node-focused`.trim();
        return { ...node, className, selected: selectedNodeIds.includes(node.id) };
      }),
    ];
  }, [
    groupFrames,
    filteredNodeIds,
    nodes,
    selectedNodeIds,
    focusNodeId,
    focusMode,
    focusPath,
    socraticActive,
    socraticNodes,
  ]);

  // 记录“选中文字来自哪张卡片”，供拖到右侧栏时创建概念使用。
  useEffect(() => {
    const recordSelectionSource = (event?: DragEvent) => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text) return;
      // 主动写入拖拽数据，避免部分浏览器/输入框场景下 dataTransfer 为空
      if (event?.dataTransfer) {
        event.dataTransfer.setData("text/plain", text);
        event.dataTransfer.effectAllowed = "copy";
      }
      const anchor = selection?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const nodeElement = element?.closest(".react-flow__node") as HTMLElement | null;
      const nodeId = nodeElement?.getAttribute("data-id");
      if (nodeId && !nodeId.startsWith("group-frame-")) {
        useCanvasStore.getState().setConceptSourceNodeId(nodeId);
      }
    };
    const handleMouseUp = () => recordSelectionSource();
    const handleDragStart = (event: DragEvent) => recordSelectionSource(event);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("dragstart", handleDragStart);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("dragstart", handleDragStart);
    };
  }, []);

  const contextMenuSelection = contextMenu && typeof window !== "undefined"
    ? window.getSelection()?.toString().trim() ?? ""
    : "";

  const flowEdges = useMemo(() => {
    if (socraticActive) return [];
    if (!focusMode) return edges;

    return edges.map((edge) => {
      const inPath = focusPath.has(edge.source) && focusPath.has(edge.target);
      if (inPath) {
        return {
          ...edge,
          animated: true,
          style: {
            stroke: "rgba(53, 112, 212, 0.85)",
            strokeWidth: 2.2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: "#3570d4",
          },
        };
      }
      return { ...edge, animated: false, style: { opacity: 0.15 } };
    });
  }, [edges, focusMode, focusPath, socraticActive]);

  return (
    <div className={`workspace-app${socraticActive ? " socratic-mode" : ""}`}>
      <h1 className="sr-only">GoDeeper</h1>
      <TopBar onHelp={() => setShortcutsOpen(true)} />

      <div className="workspace-body">
        <LeftSidebar />

        <section className={`stage${panelCollapsed ? " panel-collapsed" : ""}`}>
          {drillDownActive && (
            <button className="toolbar-pill" style={{ position: "absolute", top: 8, left: 8, zIndex: 30 }} onClick={exitDrillDown}>
              {t("exitDrillDown") ?? "Exit Drill Down"}
            </button>
          )}
          {mentionPicking && (
            <div className="mention-pick-hint" role="status">
              {t("mentionPickHint")}
            </div>
          )}

          <div
            className={`canvas-viewport flow-shell${isLayoutAnimating ? " layout-animating" : ""}${dragActive ? " drag-active" : ""}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={handleConnectEnd}
            onReconnect={onReconnect}
            connectionMode={ConnectionMode.Loose}
            multiSelectionKeyCode={["Control", "Meta", "Alt"]}
            deleteKeyCode={socraticActive || selectedNodeIds.length > 1 ? null : "Delete"}
            selectionOnDrag
            panOnDrag={[1]}
            nodesDraggable={!mentionPicking}
            onNodeClick={(event, node) => {
              if (node.id.startsWith("group-frame-")) return;
              if (socraticActive) return;
              if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
                // 聚焦模式单独占用 Ctrl+Shift+点击，避免和多选冲突
                selectNode(node.id);
                enterFocusMode(node.id);
                return;
              }
              if (event.ctrlKey || event.metaKey || event.altKey) {
                // 多选切换由 React Flow 的 multiSelectionKeyCode 处理，
                // 这里不能再 toggle，否则会把刚加入的节点又移除。
                return;
              }
              selectNode(node.id);
            }}
            onNodeContextMenu={socraticActive ? undefined : (event, node) => {
              setEdgeContextMenu(null);
              setPaneContextMenu(null);
              handleNodeContextMenu(event, node);
            }}
            onEdgeContextMenu={(event, edge) => {
              if (socraticActive) return;
              event.preventDefault();
              closeContextMenu();
              setPaneContextMenu(null);
              setEdgeContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
            }}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={(event) => {
              if (socraticActive) return;
              event.preventDefault();
              closeContextMenu();
              setEdgeContextMenu(null);
              setPaneContextMenu({ x: event.clientX, y: event.clientY });
            }}
            fitView
            defaultViewport={{ x: 0, y: 0, zoom: 0.72 }}
            minZoom={0.2}
            maxZoom={1.4}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Controls className="flow-controls" showInteractive={false} />
            <div className="minimap-card">
              <div className="mm-head">
                <span>{t("miniMap")}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </div>
              <MiniMap
                className="flow-minimap"
                pannable
                zoomable
                style={{ width: 136, height: 92 }}
                nodeColor={(node) => (
                  node.type === "groupFrame"
                    ? "transparent"
                    : miniMapNodeColor((node.data as { kind?: string } | undefined)?.kind)
                )}
                nodeStrokeColor={(node) => (
                  node.type === "groupFrame"
                    ? "transparent"
                    : nodeKindColor((node.data as { kind?: string } | undefined)?.kind)
                )}
                nodeStrokeWidth={1}
              />
            </div>
            {gridVisible ? (
              <Background
                color="#d7d0c1"
                gap={22}
                size={1.2}
                variant={BackgroundVariant.Dots}
              />
            ) : null}
          </ReactFlow>
          {!socraticActive && (
            <div
              ref={inspireEntryRef}
              className={`inspire-entry${inspireOpen ? " open" : ""}${inspirePos ? " positioned" : ""}${inspireDragging ? " dragging" : ""}`}
              style={inspirePos ? { position: "fixed", left: inspirePos.x, top: inspirePos.y, right: "auto", bottom: "auto" } : undefined}
            >
              <div className="inspire-fan">
                <button
                  className="inspire-fan-item inspire-fan-item--inspire"
                  onClick={() => handleInspireAction("inspire")}
                >
                  <Icons.lightbulb style={{ width: 13, height: 13 }} />
                  {t("inspireNode")}
                </button>
                <button
                  className="inspire-fan-item inspire-fan-item--challenge"
                  onClick={() => handleInspireAction("challenge")}
                >
                  <Icons.alertCircle style={{ width: 13, height: 13 }} />
                  {t("critiqueRun")}
                </button>
                <button
                  className="inspire-fan-item inspire-fan-item--rebut"
                  onClick={() => handleInspireAction("rebut")}
                >
                  <Icons.help style={{ width: 13, height: 13 }} />
                  {t("taskTypeCritique")}
                </button>
              </div>
              <button
                className="inspire-fab"
                style={inspireDragging ? { transform: "none" } : undefined}
                aria-label={t("inspireTooltip")}
                title={t("inspireTooltip")}
                onClick={handleInspireFabClick}
                onPointerDown={handleInspirePointerDown}
              >
                <Icons.lightbulb style={{ width: 22, height: 22 }} />
              </button>
            </div>
          )}
          {dragActive && !socraticActive && (
            <div className="canvas-drop-overlay" aria-hidden>
              <div className="canvas-drop-card">
                <span className="canvas-drop-icon">
                  <Icons.upload style={{ width: 20, height: 20 }} />
                </span>
                <strong>{t("dropDocumentHint")}</strong>
                <span className="canvas-drop-sub">{t("jsonRoundTripDesc")}</span>
              </div>
            </div>
          )}
          {nodes.length === 0 && !socraticActive && !search.trim() && (
            <div className="canvas-onboard">
              <h2>{t("onboardTitle")}</h2>
              <div className="canvas-onboard-hints">
                <div className="canvas-onboard-hint">
                  <span className="canvas-onboard-hint-icon">+</span>
                  <span>{t("onboardDoubleclick")}</span>
                </div>
                <div className="canvas-onboard-hint">
                  <span className="canvas-onboard-hint-icon">🔗</span>
                  <span>{t("pasteHint")}</span>
                </div>
                <div className="canvas-onboard-hint">
                  <span className="canvas-onboard-hint-icon">⌘</span>
                  <span>{t("onboardSearch")}</span>
                </div>
              </div>
              <button
                className="canvas-onboard-cta"
                onClick={() => {
                  const canvas = reactFlow.screenToFlowPosition({
                    x: window.innerWidth * 0.45,
                    y: window.innerHeight / 2,
                  });
                  addNode(canvas.x, canvas.y);
                }}
              >
                {t("onboardCreate")}
              </button>
            </div>
          )}
          {filteredNodeIds !== null && filteredNodeIds.size === 0 && !socraticActive && (
            <div className="canvas-search-empty">
              <span>{t("noSearchResult")}</span>
              <button className="ghost-button small" onClick={() => setSearch("")}>{t("clearSearch")}</button>
            </div>
          )}
        </div>
          {!socraticActive && <CanvasToolbar />}
        </section>

        {socraticActive ? <SocraticPanel /> : <ReasoningPanel />}
      </div>

      <MobileBar onHelp={() => setShortcutsOpen(true)} />

      <ProfileModal />
      <ExportDialog />
      <MentionPickerHost />

      {contextMenu ? (
        <div
          className="context-menu glass-panel"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 100,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleDuplicate}>
            {t("duplicateNode")}
          </button>
          <button className="context-menu-item" onClick={handleAddToSelection}>
            {t("addToSelection")}
          </button>
          {contextMenuSelection && (
            <button className="context-menu-item" onClick={() => {
              void useCanvasStore
                .getState()
                .createConceptFromSelection(contextMenuSelection, contextMenu.nodeId);
              closeContextMenu();
            }}>
              {t("conceptCreateMenu")}
            </button>
          )}
          {selectedNodeIds.length >= 2 && (
            <button className="context-menu-item" onClick={() => {
              const state = useCanvasStore.getState();
              if (!state.selectedNodeIds.includes(contextMenu.nodeId)) {
                state.toggleNodeSelection(contextMenu.nodeId);
              }
              state.createGroupFromSelection();
              closeContextMenu();
            }}>
              {t("groupCreate")} · Ctrl+G
            </button>
          )}
          {contextMenu && groups.some((group) => group.nodeIds.includes(contextMenu.nodeId)) && (
            <button className="context-menu-item" onClick={() => {
              const state = useCanvasStore.getState();
              if (!state.selectedNodeIds.includes(contextMenu.nodeId)) {
                state.toggleNodeSelection(contextMenu.nodeId);
              }
              state.ungroupSelected();
              closeContextMenu();
            }}>
              {t("groupUngroup")}
            </button>
          )}
          {contextMenu && (() => {
            const ids = Array.from(new Set([...selectedNodeIds, contextMenu.nodeId]));
            const resultIds = ids.filter((id) => canvasNodes.find((node) => node.id === id)?.data.kind === "result");
            if (resultIds.length < 2) return null;
            return (
              <button className="context-menu-item" onClick={() => {
                useCanvasStore.getState().mergeResultNodes(resultIds);
                closeContextMenu();
              }}>
                {t("mergeResultNodes")}
              </button>
            );
          })()}
          <button className="context-menu-item" onClick={handleCreateTask}>
            {t("createTaskFromNode")}
          </button>
          <button className="context-menu-item" onClick={() => {
            if (!hasCapability(getUser(), "ai.socratic")) {
              toast.error(t("socraticProRequired"));
              closeContextMenu();
              return;
            }
            if (contextMenu?.nodeId) void startSocratic(contextMenu.nodeId);
            closeContextMenu();
          }}>
            {t("socraticStart")}
          </button>
          <button className="context-menu-item" onClick={() => { if (contextMenu?.nodeId) drillDown(contextMenu.nodeId); closeContextMenu(); }}>
            {t("drillDown") ?? "Drill Down"}
          </button>
          <button className="context-menu-item danger" onClick={handleDelete}>
            {t("deleteNode")}
          </button>
        </div>
      ) : null}

      {edgeContextMenu ? (
        <div
          className="context-menu glass-panel"
          style={{
            position: "fixed",
            left: edgeContextMenu.x,
            top: edgeContextMenu.y,
            zIndex: 100,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="context-menu-item danger" onClick={() => {
            useCanvasStore.getState().onEdgesChange([{ id: edgeContextMenu.edgeId, type: "remove" }]);
            setEdgeContextMenu(null);
          }}>
            {t("deleteEdge")}
          </button>
        </div>
      ) : null}

      {paneContextMenu ? (
        <div
          className="context-menu glass-panel"
          style={{
            position: "fixed",
            left: paneContextMenu.x,
            top: paneContextMenu.y,
            zIndex: 100,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => {
            const canvas = reactFlow.screenToFlowPosition({ x: paneContextMenu.x, y: paneContextMenu.y });
            addNode(canvas.x, canvas.y);
            setPaneContextMenu(null);
          }}>
            {t("newNode")}
          </button>
          <button className="context-menu-item" onClick={() => {
            const canvas = reactFlow.screenToFlowPosition({ x: paneContextMenu.x, y: paneContextMenu.y });
            const width = WIDTH_BY_KIND.note ?? 760;
            const height = NODE_HEIGHT_BY_KIND.note ?? 540;
            addNode(canvas.x - width / 2, canvas.y - height / 2, "note");
            setPaneContextMenu(null);
          }}>
            {t("noteNode")}
          </button>
          <button className="context-menu-item" onClick={async () => {
            const pos = paneContextMenu;
            setPaneContextMenu(null);
            try {
              const text = await navigator.clipboard.readText();
              if (text && isUrl(text)) {
                const canvas = reactFlow.screenToFlowPosition({ x: pos.x, y: pos.y });
                importUrl(text, canvas.x, canvas.y);
              }
            } catch { /* clipboard read denied */ }
          }}>
            {t("pasteLink")}
          </button>
        </div>
      ) : null}

      {connectMenu ? (
        <div
          className="connect-menu glass-panel"
          style={{
            position: "fixed",
            left: connectMenu.x,
            top: connectMenu.y,
            zIndex: 100,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="connect-card connect-card--text" onClick={() => createConnectedNode("text")}>
            <span className="connect-card-icon">
              <Icons.edit size={16} />
            </span>
            <strong>{t("textNode")}</strong>
            <small>{language === "zh" ? "记录一个想法或笔记" : "Capture an idea or note"}</small>
          </button>
          <button className="connect-card connect-card--task" onClick={() => createConnectedNode("task")}>
            <span className="connect-card-icon">
              <Icons.sparkles size={16} />
            </span>
            <strong>{t("taskNode")}</strong>
            <small>{language === "zh" ? "把问题交给 AI 推理" : "Ask AI to reason"}</small>
          </button>
        </div>
      ) : null}

      {deleteConfirm && (
        <div className="modal-shell" onClick={() => setDeleteConfirm(false)}>
          <div className="delete-confirm-dialog glass-panel" onClick={(e) => e.stopPropagation()}>
            <p>{t("confirmDeleteMulti")}</p>
            <div className="delete-confirm-actions">
              <button className="ghost-button" onClick={() => setDeleteConfirm(false)}>{t("cancel")}</button>
              <button className="primary-button" style={{ background: "#ba1a1a" }} onClick={() => {
                const { deleteSelectedNodes } = useCanvasStore.getState();
                deleteSelectedNodes();
                setDeleteConfirm(false);
              }}>{t("deleteLabel")}</button>
            </div>
          </div>
        </div>
      )}

      {pendingRestore && (
        <div className="modal-shell" onClick={() => setPendingRestore(null)}>
          <div className="delete-confirm-dialog restore-confirm-dialog glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t("restoreTitle")}</h2>
            <p>{t("restoreConfirm")}</p>
            <p className="restore-file-meta">
              {pendingRestore.name} · {pendingRestore.file.nodes.length} {t("nodes")} · {pendingRestore.file.edges.length} {t("links")}
            </p>
            <div className="delete-confirm-actions">
              <button className="ghost-button" onClick={() => setPendingRestore(null)}>{t("cancel")}</button>
              <button className="primary-button" onClick={() => {
                const pending = pendingRestore;
                setPendingRestore(null);
                applyRestore(pending.file);
              }}>{t("restoreAction")}</button>
            </div>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div className="modal-shell" onClick={() => setShortcutsOpen(false)}>
          <section className="shortcuts-panel glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-header">
              <h2>{t("keyboardShortcuts")}</h2>
              <button className="ghost-button" onClick={() => setShortcutsOpen(false)}>{t("close")}</button>
            </div>
            <div className="shortcuts-list">
              {SHORTCUT_ACTIONS.map((action) => (
                <div className="shortcut-row" key={action}>
                  <kbd>{shortcutMap[action]}</kbd>
                  <span>{SHORTCUT_LABELS[action][language]}</span>
                </div>
              ))}
              <div className="shortcut-row"><kbd>Ctrl+Shift+Click</kbd><span>{t("focusMode")}</span></div>
              <div className="shortcut-row"><kbd>?</kbd><span>{t("scPanel")}</span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <ReactFlowProvider>
      <WorkspacePage />
    </ReactFlowProvider>
  );
}
