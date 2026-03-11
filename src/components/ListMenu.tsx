"use client";

import { useEffect, useRef, useState } from "react";
import { ColumnRow } from "@/lib/columns";
import { BoardRow } from "@/lib/boards";
import { LABEL_PALETTE } from "@/lib/palette";

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
  }

  function close() {
    setOpen(false);
    setSubMenu(null);
    setPendingDelete(false);
  }

  function toggleSub(name: "color" | "move" | "copy") {
    setSubMenu((v) => (v === name ? null : name));
    setPendingDelete(false);
  }

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={toggle}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-black/[0.06] hover:text-gray-600"
        aria-label="List options"
        title="List options"
      >
        <DotsIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 min-w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-elevated">
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
            <div className="border-t border-gray-100 px-3 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {/* No color option */}
                <button
                  onClick={() => { onChangeColor(""); close(); }}
                  className={`flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[9px] text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600${!column.color ? " ring-2 ring-gray-400/50 ring-offset-1 ring-offset-white" : ""}`}
                  title="No color"
                >
                  ✕
                </button>
                {LABEL_PALETTE.map(({ hex, label }) => (
                  <button
                    key={hex}
                    onClick={() => { onChangeColor(hex); close(); }}
                    className={`h-5 w-5 rounded-full transition-all duration-100${
                      column.color === hex
                        ? " scale-110 ring-2 ring-gray-400/60 ring-offset-1 ring-offset-white"
                        : " opacity-65 hover:opacity-100 hover:scale-105"
                    }`}
                    style={{ backgroundColor: hex }}
                    title={label}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Move to board */}
          {otherBoards.length > 0 && (
            <>
              <MenuItem onClick={() => toggleSub("move")} hasArrow active={subMenu === "move"}>
                Move to board…
              </MenuItem>
              {subMenu === "move" && (
                <div className="border-t border-gray-100 py-1">
                  {otherBoards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onMoveToBoard(b.id);
                        close();
                      }}
                      className="w-full px-4 py-1.5 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
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
                <div className="border-t border-gray-100 py-1">
                  {otherBoards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onCopyToBoard(b.id);
                        close();
                      }}
                      className="w-full px-4 py-1.5 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="my-1 border-t border-gray-100" />

          {/* Delete */}
          {!pendingDelete ? (
            <MenuItem onClick={() => setPendingDelete(true)} danger>
              Delete list
            </MenuItem>
          ) : (
            <div className="space-y-2 px-3 py-2">
              <p className="text-xs text-gray-700">
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
                  className="text-xs text-gray-500 transition-colors hover:text-gray-700"
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
      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 ${
        danger
          ? "text-red-500 hover:text-red-600"
          : active
            ? "text-gray-900"
            : "text-gray-700 hover:text-gray-900"
      }`}
    >
      <span>{children}</span>
      {hasArrow && (
        <span className="ml-2 text-gray-400">{active ? "▾" : "▸"}</span>
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
