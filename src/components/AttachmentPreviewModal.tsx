"use client";

import { useState, useEffect, useRef } from "react";
import type { NoteAttachmentRow } from "@/lib/noteAttachments";

interface Props {
  attachment: NoteAttachmentRow;
  noteId: string;
  onClose: () => void;
}

type PreviewKind = "image" | "pdf" | "text" | null;

function detectKind(mime: string | null): PreviewKind {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain") return "text";
  return null;
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mime: string | null, fileName: string): { abbr: string; color: string } {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image/") || ["jpg","jpeg","png","gif","svg","webp","avif"].includes(ext))
    return { abbr: "IMG", color: "text-green-500" };
  if (mime === "application/pdf" || ext === "pdf")
    return { abbr: "PDF", color: "text-red-400" };
  if (["doc","docx"].includes(ext) || mime?.includes("wordprocessingml"))
    return { abbr: "DOC", color: "text-blue-400" };
  if (["xls","xlsx"].includes(ext) || mime?.includes("spreadsheetml"))
    return { abbr: "XLS", color: "text-emerald-400" };
  if (["txt","md"].includes(ext) || mime === "text/plain")
    return { abbr: "TXT", color: "text-neutral-400" };
  if (["zip","gz","tar"].includes(ext))
    return { abbr: "ZIP", color: "text-purple-400" };
  if (mime?.startsWith("video/"))
    return { abbr: "VID", color: "text-yellow-400" };
  if (mime?.startsWith("audio/"))
    return { abbr: "AUD", color: "text-pink-400" };
  return { abbr: "FILE", color: "text-neutral-500" };
}

export function AttachmentPreviewModal({ attachment, noteId, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kind = detectKind(attachment.mime_type);
  const ft = fileTypeLabel(attachment.mime_type, attachment.file_name);

  // Entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Fetch signed URL whenever attachment or retryKey changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);
      setSignedUrl(null);
      setTextContent(null);

      const res = await fetch(
        `/api/notes/${noteId}/attachment-url?id=${encodeURIComponent(attachment.id)}`,
      );

      if (cancelled) return;

      if (!res.ok) {
        let msg = `Could not load file (${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch { /* ignore parse errors */ }
        setFetchError(msg);
        setLoading(false);
        return;
      }

      const { signedUrl: url } = (await res.json()) as { signedUrl: string };
      setSignedUrl(url);

      // For text/plain: fetch and read content (cap at 20 000 chars for MVP)
      if (kind === "text") {
        try {
          const textRes = await fetch(url);
          const text = await textRes.text();
          if (!cancelled) setTextContent(text.slice(0, 20_000));
        } catch {
          if (!cancelled) setTextContent(null);
        }
      }

      if (!cancelled) setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [attachment.id, noteId, kind, retryKey]);

  // Escape closes this modal without also closing CardDetailsModal
  // (capture phase + stopPropagation beats the bubble-phase Escape handler on the outer modal)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerClose() {
    setVisible(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(onClose, 200);
  }

  async function handleDownload() {
    const url = signedUrl;
    if (!url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = attachment.file_name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in new tab so the user can still save the file
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/75 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
    >
      <div
        className={`relative mx-4 flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        } max-h-[90vh]`}
        role="dialog"
        aria-modal="true"
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-5 py-3">
          <span className={`shrink-0 font-mono text-[10px] font-bold tracking-wider ${ft.color}`}>{ft.abbr}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-100">
              {attachment.file_name}
            </p>
            {attachment.file_size != null && (
              <p className="text-[11px] text-neutral-600">
                {fmtFileSize(attachment.file_size)}
                {attachment.mime_type && ` · ${attachment.mime_type}`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={triggerClose}
            className="shrink-0 rounded p-1 text-neutral-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-auto bg-neutral-900/30">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-[11px] text-neutral-600">Loading…</p>
            </div>

          ) : fetchError ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-neutral-400">{fetchError}</p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Retry
              </button>
            </div>

          ) : kind === "image" ? (
            <div className="flex items-center justify-center p-4">
              <img
                src={signedUrl!}
                alt={attachment.file_name}
                className="max-h-[65vh] max-w-full object-contain"
              />
            </div>

          ) : kind === "pdf" ? (
            <div className="p-3">
              <div className="overflow-hidden rounded-lg border border-neutral-800/60 shadow-inner">
                <iframe
                  src={signedUrl!}
                  title={attachment.file_name}
                  className="h-[68vh] w-full border-0"
                />
              </div>
            </div>

          ) : kind === "text" ? (
            <div className="p-5">
              {textContent != null ? (
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-300">
                  {textContent}
                </pre>
              ) : (
                <p className="text-[11px] text-neutral-600">Could not load text content.</p>
              )}
            </div>

          ) : (
            /* Not previewable */
            <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-neutral-400">
                Preview not available for this file type.
              </p>
              <p className="text-[11px] text-neutral-700">
                {attachment.file_name}
                {attachment.mime_type && ` · ${attachment.mime_type}`}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-neutral-800 px-5 py-3">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!signedUrl || downloading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {downloading ? "Downloading…" : "Download"}
          </button>
          <button
            type="button"
            onClick={triggerClose}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
