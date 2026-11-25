"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, PencilLine, Trash2 } from "lucide-react";
import type { GoDeeperFlowNode, NotePage } from "@/lib/types";
import {
  MAX_NOTE_PAGES,
  appendNotePage,
  clampNotePageIndex,
  createNotePage,
  notePageLabel,
  notePageMarkdown,
  notePagesToBody,
  removeNotePage,
  updateNotePage,
} from "@/lib/note-pages";
import { compressNoteImage, dataUrlToBlob, isNoteImageFile, NoteImageError } from "@/lib/note-image";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT, type S } from "@/lib/i18n";
import { NodeShell } from "./node-shell";
import { MentionLink } from "./node-markdown";
import { findMentionTrigger, insertMention, isMentionHref, type MentionTarget } from "@/lib/mentions";

function imageErrorMessage(error: unknown, t: (key: S) => string): string {
  if (error instanceof NoteImageError) {
    switch (error.message) {
      case "NOTE_IMAGE_UNSUPPORTED":
        return t("noteImageUnsupported");
      case "NOTE_IMAGE_TOO_LARGE":
        return t("noteImageTooLarge");
      case "NOTE_IMAGE_DECODE_FAILED":
        return t("noteImageDecodeFailed");
      default:
        return t("noteImageCompressFailed");
    }
  }
  return t("noteImageCompressFailed");
}

function ocrErrorMessage(error: unknown, t: (key: S) => string): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "OCR_NOT_CONFIGURED") return t("noteOcrNotConfigured");
  if (code === "OCR_TIMEOUT") return t("noteOcrFailed");
  const message = error instanceof Error ? error.message : "";
  return message ? `${t("noteOcrFailed")}: ${message}` : t("noteOcrFailed");
}

function statusLabel(page: NotePage, t: (key: S) => string): string {
  if (page.status === "running") return t("noteOcrRunning");
  if (page.status === "error") return t("noteOcrFailed");
  if (page.status === "idle") return t("noteOcrIdle");
  return "";
}

export function NoteNode({ id, data, selected }: NodeProps<GoDeeperFlowNode>) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const openMentionPicker = useCanvasStore((state) => state.openMentionPicker);
  const mentionPicking = useCanvasStore((state) => state.mentionPicking);
  const t = useT();

  const pages = data.notePages ?? [];
  const activePage = clampNotePageIndex(data.noteActivePage, pages.length);
  const activePageData = pages[activePage];

  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const readerRef = useRef<HTMLTextAreaElement | null>(null);
  const wasPickingRef = useRef(false);

  // 画布点选结束/取消后，把焦点还给笔记编辑器。
  useEffect(() => {
    const wasMine = wasPickingRef.current;
    wasPickingRef.current = mentionPicking?.sourceNodeId === id;
    if (wasMine && !mentionPicking && editingPageId) {
      readerRef.current?.focus();
    }
  }, [editingPageId, id, mentionPicking]);

  const readPages = () => {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === id);
    return node?.data.notePages ?? [];
  };

  const commitPages = (nextPages: NotePage[], nextActivePage?: number) => {
    const latest = useCanvasStore.getState().nodes.find((item) => item.id === id);
    const latestActive = latest?.data.noteActivePage;
    updateNodeData(id, {
      notePages: nextPages,
      noteActivePage: nextPages.length > 0
        ? clampNotePageIndex(nextActivePage ?? latestActive ?? activePage, nextPages.length)
        : undefined,
      body: notePagesToBody(nextPages),
    });
  };

  const setActivePage = (index: number) => {
    const next = clampNotePageIndex(index, pages.length);
    if (next === activePage && data.noteActivePage !== undefined) return;
    updateNodeData(id, { noteActivePage: next });
  };

  const goToPage = (index: number) => {
    const next = clampNotePageIndex(index, pages.length);
    setActivePage(next);
    const section = sectionRefs.current[next];
    const root = scrollRef.current;
    if (section && root) {
      root.scrollTo({ top: section.offsetTop, behavior: "smooth" });
    }
  };

  const handleScroll = () => {
    const root = scrollRef.current;
    if (!root || pages.length <= 1) return;
    const threshold = root.scrollTop + root.clientHeight * 0.32;
    let next = 0;
    sectionRefs.current.forEach((section, index) => {
      if (section && section.offsetTop <= threshold) next = index;
    });
    if (next !== activePage) setActivePage(next);
  };

  const runOcr = async (page: NotePage) => {
    if (!isAuthenticated()) {
      const current = readPages();
      commitPages(updateNotePage(current, page.id, { status: "error", error: t("noteOcrLoginRequired") }));
      return;
    }

    const current = readPages();
    commitPages(updateNotePage(current, page.id, { status: "running", error: undefined }));
    try {
      const result = await api.parseNoteImage(
        dataUrlToBlob(page.imageDataUrl),
        page.fileName ?? "note-image.jpg",
      );
      const latest = readPages();
      commitPages(updateNotePage(latest, page.id, {
        ocrMarkdown: result.markdown,
        blocks: result.blocks,
        width: result.width || page.width,
        height: result.height || page.height,
        status: "done",
        error: undefined,
      }));
    } catch (error) {
      const latest = readPages();
      commitPages(updateNotePage(latest, page.id, {
        status: "error",
        error: ocrErrorMessage(error, t),
      }));
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;
    const current = readPages();
    const remaining = MAX_NOTE_PAGES - current.length;
    if (remaining <= 0) {
      setUploadError(t("noteMaxPages"));
      return;
    }

    const accepted = incoming.slice(0, remaining);
    const unsupported = accepted.some((file) => !isNoteImageFile(file));
    if (unsupported) setUploadError(t("noteImageUnsupported"));

    setIsUploading(true);
    setUploadError("");
    for (const file of accepted) {
      if (!isNoteImageFile(file)) continue;
      try {
        const compressed = await compressNoteImage(file);
        const latest = readPages();
        if (latest.length >= MAX_NOTE_PAGES) break;
        const page = createNotePage({
          imageDataUrl: compressed.dataUrl,
          fileName: compressed.fileName,
          width: compressed.width,
          height: compressed.height,
          status: "idle",
        });
        pushHistory();
        commitPages(appendNotePage(latest, page), latest.length);
        void runOcr(page);
      } catch (error) {
        setUploadError(imageErrorMessage(error, t));
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEdit = (page: NotePage) => {
    setEditingPageId(page.id);
    setDraft(notePageMarkdown(page));
    window.setTimeout(() => readerRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditingPageId(null);
    setDraft("");
  };

  const saveEdit = (page: NotePage) => {
    pushHistory();
    const latest = readPages();
    commitPages(updateNotePage(latest, page.id, {
      editedMarkdown: draft.trim() || undefined,
      status: page.ocrMarkdown ? page.status : "done",
      error: undefined,
    }));
    setEditingPageId(null);
    setDraft("");
  };

  const handleDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setDraft(next);

    const cursor = event.target.selectionStart ?? next.length;
    const trigger = findMentionTrigger(next, cursor);
    if (!trigger) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const insert = (target: MentionTarget) => {
      const inserted = insertMention(next, { start: trigger.start, end: trigger.end }, target);
      setDraft(inserted.text);
      requestAnimationFrame(() => {
        const input = readerRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(inserted.cursor, inserted.cursor);
      });
    };

    openMentionPicker({
      sourceNodeId: id,
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      query: trigger.query,
      onSelect: insert,
      onClose: () => requestAnimationFrame(() => readerRef.current?.focus()),
    });
  };

  const removePage = (page: NotePage, index: number) => {    pushHistory();
    const latest = readPages();
    const next = removeNotePage(latest, page.id, index);
    commitPages(next.pages, next.activePage);
  };

  const retryPage = (page: NotePage) => {
    void runOcr(page);
  };

  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, page: NotePage) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEdit(page);
    }
  };

  useEffect(() => {
    if (!activePageData) setEditingPageId(null);
  }, [activePageData]);

  return (
    <NodeShell id={id} kind={data.kind} selected={selected}>
      <div className={`note-card ${pages.length === 0 ? "note-card--empty" : ""}`}>
        <aside className="note-card-left">
          <div className="note-card-left-head">
            <span className="node-chip">{t("noteNode")}</span>
            {pages.length > 0 && (
              <span className="note-page-counter">{notePageLabel(activePage, pages.length)}</span>
            )}
          </div>

          {pages.length === 0 ? (
            <div className="note-empty-drop">
              <ImagePlus size={28} />
              <strong>{t("noteEmptyTitle")}</strong>
              <span>{t("noteEmptyHint")}</span>
              <button type="button" className="note-primary-btn nodrag" onClick={() => fileInputRef.current?.click()}>
                {t("noteAddImages")}
              </button>
            </div>
          ) : (
            <>
              <div className="note-image-stage">
                {activePageData && (
                  <img
                    className="note-main-image"
                    src={activePageData.imageDataUrl}
                    alt={activePageData.fileName ?? `note page ${activePage + 1}`}
                    draggable={false}
                  />
                )}
              </div>

              {pages.length > 1 && (
                <div className="note-page-stack" role="tablist" aria-label={t("noteNode")}>
                  {pages.map((page, index) => (
                    <div
                      key={page.id}
                      className={`note-page-thumb ${index === activePage ? "is-active" : ""}`}
                      style={{ zIndex: pages.length - Math.abs(index - activePage) }}
                    >
                      <button
                        type="button"
                        className="note-page-thumb-btn nodrag"
                        onClick={() => goToPage(index)}
                        aria-label={notePageLabel(index, pages.length)}
                        aria-selected={index === activePage}
                        role="tab"
                      >
                        <img src={page.imageDataUrl} alt="" draggable={false} />
                        <span>{index + 1}</span>
                      </button>
                      <button
                        type="button"
                        className="note-page-remove nodrag"
                        title={t("noteRemovePage")}
                        onClick={() => removePage(page, index)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="note-card-left-foot">
                <button
                  type="button"
                  className="note-secondary-btn nodrag"
                  disabled={isUploading || pages.length >= MAX_NOTE_PAGES}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? <Loader2 size={13} className="spin" /> : <ImagePlus size={13} />}
                  {pages.length >= MAX_NOTE_PAGES ? t("noteMaxPages") : t("noteAddMore")}
                </button>
                {pages.length > 1 && (
                  <div className="note-page-arrows">
                    <button
                      type="button"
                      className="note-icon-btn nodrag"
                      disabled={activePage === 0}
                      onClick={() => goToPage(activePage - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      className="note-icon-btn nodrag"
                      disabled={activePage >= pages.length - 1}
                      onClick={() => goToPage(activePage + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {uploadError && <p className="note-upload-error">{uploadError}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void handleFiles(event.target.files);
            }}
          />
        </aside>

        <section className="note-card-right">
          <div className="note-card-right-head">
            <div>
              <h2 className="note-card-title">{data.title || t("newNote")}</h2>
              <p className="note-card-subtitle">{t("noteReadOnlyHint")}</p>
            </div>
            {activePageData && (
              <span className={`note-status note-status-${activePageData.status}`}>
                {activePageData.status === "running" && <Loader2 size={11} className="spin" />}
                {statusLabel(activePageData, t)}
              </span>
            )}
          </div>

          {pages.length === 0 ? (
            <div className="note-right-empty">
              <PencilLine size={22} />
              <p>{t("noteNoMarkdown")}</p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="note-markdown-scroll nodrag nowheel"
              onScroll={handleScroll}
            >
              {pages.map((page, index) => {
                const markdown = notePageMarkdown(page);
                const isEditing = editingPageId === page.id;
                return (
                  <section
                    key={page.id}
                    className={`note-page-section ${index === activePage ? "is-active" : ""}`}
                    data-page-index={index}
                    ref={(element) => { sectionRefs.current[index] = element; }}
                  >
                    <div className="note-page-section-head">
                      <span>{t("notePage")} {index + 1} {t("notePageTail")}</span>
                      {page.error && <span className="note-page-error">{page.error}</span>}
                    </div>

                    {isEditing ? (
                      <div className="note-edit">
                        <textarea
                          ref={(element) => { readerRef.current = element; }}
                          className="note-edit-textarea nodrag nowheel"
                          value={draft}
                          onChange={handleDraftChange}
                          onKeyDown={(event) => handleEditKeyDown(event, page)}
                          onMouseDown={(event) => event.stopPropagation()}
                          placeholder={t("noteEditPlaceholder")}
                          rows={Math.min(18, Math.max(6, Math.ceil((markdown.length || 100) / 56)))}
                        />
                        <div className="note-edit-actions">
                          <span>{t("noteEditHint")}</span>
                          <div>
                            {page.ocrMarkdown && (
                              <button
                                type="button"
                                className="note-ghost-btn nodrag"
                                onClick={() => setDraft(page.ocrMarkdown)}
                              >
                                {t("noteRestoreOcr")}
                              </button>
                            )}
                            <button type="button" className="note-ghost-btn nodrag" onClick={cancelEdit}>
                              {t("noteCancel")}
                            </button>
                            <button type="button" className="note-primary-btn nodrag" onClick={() => saveEdit(page)}>
                              {t("noteSave")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : markdown ? (
                      <div
                        className="note-markdown nodrag"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          startEdit(page);
                        }}
                        title={t("noteEditHint")}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node: _node, href, children, ...props }) => (
                              isMentionHref(href)
                                ? <MentionLink href={href}>{children}</MentionLink>
                                : <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>
                            ),
                            table: ({ node: _node, ...props }) => (
                              <div className="note-md-table"><table {...props} /></div>
                            ),
                          }}
                        >
                          {markdown}
                        </ReactMarkdown>
                      </div>
                    ) : page.status === "running" ? (
                      <div className="note-ocr-state">
                        <Loader2 size={16} className="spin" />
                        <span>{t("noteOcrRunning")}</span>
                      </div>
                    ) : (
                      <div className="note-ocr-state note-ocr-state--empty">
                        <p>{t("noteNoMarkdown")}</p>
                        <div className="note-ocr-actions">
                          <button type="button" className="note-primary-btn nodrag" onClick={() => startEdit(page)}>
                            {t("noteManualEdit")}
                          </button>
                          <button type="button" className="note-ghost-btn nodrag" onClick={() => retryPage(page)}>
                            {t("noteRetry")}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </NodeShell>
  );
}
