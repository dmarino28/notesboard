"use client";

import { useEffect, useRef, useState } from "react";
import { ColumnRow } from "@/lib/columns";
import { BoardRow } from "@/lib/boards";

type Props = {
  column: ColumnRow;
  boards: BoardRow[];
  currentBoardId: string;
  onRename: () => void;
  onChangeColor: (color: string) => void;
  onMoveToBoard: (targetBoardId: string) => void;
  onCopyToBoard: (targetBoardId: string) => void;
  onDelete: () => void;
};

export function ListMenu({
  column,
  boards,
  currentBoardId,
  onRename,
  onChangeColor,
  onMoveToBoard,
  onCopyToBoard,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [subMenu, setSubMenu] = useState<"color" | "move" | "copy" | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const otherBoards = boards.filter((b) => b.id !== currentBoardId);

  // Outside-click dismiss
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSubMenu(null);
        setPendingDelete(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function toggle() {
    setOpen((v) => !v);
    setSubMenu(null);
    setPendingDelete(false);
    setColorDraft(null);
  }

  function close() {
    setOpen(false);
    setSubMenu(null);
    setPendingDelete(false);
    setColorDraft(null);
  }

  function toggleSub(name: "color" | "move" | "copy") {
    setSubMenu((v) => (v === name ? null : name));
    setPendingDelete(false);
  }

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={toggle}
        className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-300"
        aria-label="List options"
        title="List options"
      >
        <DotsIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 min-w-48 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl">
          {/* Rename */}
          <MenuItem
            onClick={() => {
              onRename();
              close();
            }}
          >
            Rename
          </MenuItem>

          {/* Change color */}
          <MenuItem onClick={() => toggleSub("color")} hasArrow active={subMenu === "color"}>
            Change color
          </MenuItem>
          {subMenu === "color" && (
            <div className="border-t border-neutral-800 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="color"
                  value={colorDraft ?? column.color ?? "#6b7280"}
                  onChange={(e) => setColorDraft(e.target.value)}
                  onBlur={() => {
                    const color = colorDraft;
                    if (color && color !== column.color) onChangeColor(color);
                    setColorDraft(null);
                  }}
                  className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Pick color"
                />
                <span className="text-xs text-neutral-400">
                  {colorDraft ?? column.color ?? "No color"}
                </span>
              </label>
            </div>
          )}

          {/* Move to board */}
          {otherBoards.length > 0 && (
            <>
              <MenuItem onClick={() => toggleSub("move")} hasArrow active={subMenu === "move"}>
                Move to board…
              </MenuItem>
              {subMenu === "move" && (
                <div className="border-t border-neutral-800 py-1">
                  {otherBoards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onMoveToBoard(b.id);
                        close();
                      }}
                      className="w-full px-4 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Copy to board */}
          {otherBoards.length > 0 && (
            <>
              <MenuItem onClick={() => toggleSub("copy")} hasArrow active={subMenu === "copy"}>
                Copy to board…
              </MenuItem>
              {subMenu === "copy" && (
                <div className="border-t border-neutral-800 py-1">
                  {otherBoards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onCopyToBoard(b.id);
                        close();
                      }}
                      className="w-full px-4 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="my-1 border-t border-neutral-800" />

          {/* Delete */}
          {!pendingDelete ? (
            <MenuItem onClick={() => setPendingDelete(true)} danger>
              Delete list
            </MenuItem>
          ) : (
            <div className="space-y-2 px-3 py-2">
              <p className="text-xs text-neutral-300">
                Delete &quot;{column.name}&quot;? All cards will be lost.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onDelete();
                    close();
                  }}
                  className="rounded bg-red-600 px-2.5 py-1 text-xs text-white transition-colors hover:bg-red-500"
                >
                  Delete
                </button>
                <button
                  onClick={() => setPendingDelete(false)}
                  className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  danger,
  hasArrow,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  hasArrow?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/8 ${
        danger
          ? "text-red-400 hover:text-red-300"
          : active
            ? "text-white"
            : "text-neutral-300 hover:text-white"
      }`}
    >
      <span>{children}</span>
      {hasArrow && (
        <span className="ml-2 text-neutral-500">{active ? "▾" : "▸"}</span>
      )}
    </button>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="4" viewBox="0 0 14 4" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="7" cy="2" r="1.5" />
      <circle cx="12" cy="2" r="1.5" />
    </svg>
  );
}
