"use client";

import { useRef, useState } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { ColumnRow } from "@/lib/columns";
import { BoardRow } from "@/lib/boards";
import { ListMenu } from "./ListMenu";

type Props = {
  column: ColumnRow;
  noteCount: number;
  boards: BoardRow[];
  currentBoardId: string;
  dragHandleListeners?: DraggableSyntheticListeners;
  dragHandleAttributes?: DraggableAttributes;
  onRename: (name: string) => Promise<void>;
  onUpdateColor: (color: string) => void;
  onMoveToBoard: (targetBoardId: string) => void;
  onCopyToBoard: (targetBoardId: string) => void;
  onDelete: () => void;
  onEditingChange: (editing: boolean) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  headerBg?: string;
};

export function ListHeader({
  column,
  noteCount,
  boards,
  currentBoardId,
  dragHandleListeners,
  dragHandleAttributes,
  onRename,
  onUpdateColor,
  onMoveToBoard,
  onCopyToBoard,
  onDelete,
  onEditingChange,
  isCollapsed,
  onToggleCollapse,
  headerBg,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const savedRef = useRef(false);

  function startEdit() {
    setEditName(column.name);
    savedRef.current = false;
    setEditing(true);
    onEditingChange(true);
  }

  async function saveEdit() {
    if (savedRef.current) return;
    savedRef.current = true;
    const trimmed = editName.trim();
    setEditing(false);
    onEditingChange(false);
    if (trimmed && trimmed !== column.name) {
      await onRename(trimmed);
    }
  }

  function cancelEdit() {
    savedRef.current = true;
    setEditing(false);
    setEditName(column.name);
    onEditingChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  return (
    <div
      className="flex flex-shrink-0 cursor-grab items-center gap-1.5 rounded-t-xl px-3 py-3 active:cursor-grabbing"
      style={headerBg ? { backgroundColor: headerBg } : undefined}
      {...dragHandleListeners}
      {...dragHandleAttributes}
    >
      {/* Color dot */}
      {column.color && (
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: column.color }}
        />
      )}

      {/* Title — inline editable */}
      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void saveEdit()}
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[13px] font-semibold text-gray-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
        />
      ) : (
        <h2
          className="min-w-0 flex-1 cursor-pointer truncate text-[13px] font-semibold text-gray-900"
          onClick={startEdit}
          title="Click to rename"
        >
          {column.name}
        </h2>
      )}

      {/* Card count */}
      <span className="flex-shrink-0 min-w-[1.25rem] rounded bg-gray-100 px-1 text-center tabular-nums text-[11px] font-medium text-gray-500">{noteCount}</span>

      {/* Collapse/expand */}
      <button
        onClick={onToggleCollapse}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-black/[0.06] hover:text-gray-600"
        aria-label={isCollapsed ? "Expand list" : "Collapse list"}
        title={isCollapsed ? "Expand" : "Collapse"}
      >
        <CollapseIcon collapsed={isCollapsed} />
      </button>

      {/* 3-dot menu */}
      <ListMenu
        column={column}
        boards={boards}
        currentBoardId={currentBoardId}
        onRename={startEdit}
        onChangeColor={onUpdateColor}
        onMoveToBoard={onMoveToBoard}
        onCopyToBoard={onCopyToBoard}
        onDelete={onDelete}
      />
    </div>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  // Left chevron = collapse; right chevron = expand
  return collapsed ? (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4,2 8,6 4,10" />
    </svg>
  ) : (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="8,2 4,6 8,10" />
    </svg>
  );
}
