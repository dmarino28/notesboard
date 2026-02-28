"use client";

import { createContext, useContext } from "react";
import type { ActionState, ActionMode, NoteActionMap, TagDef } from "./userActions";
import type { AwarenessMap } from "./awareness";

type ActionContextValue = {
  actionMap: NoteActionMap;
  tagDefs: TagDef[];
  awarenessMap: AwarenessMap;
  onActionChange: (noteId: string, next: ActionState | "none") => void;
  onTagsChange: (noteId: string, tags: string[]) => void;
  onModeChange: (noteId: string, mode: ActionMode) => void;
  onDueDateChange: (noteId: string, date: string | null) => void;
  onToggleInActions: (noteId: string, inActions: boolean) => void;
  onCreateTagDef: (name: string) => Promise<TagDef | null>;
};

const DEFAULT: ActionContextValue = {
  actionMap: {},
  tagDefs: [],
  awarenessMap: {},
  onActionChange: () => {},
  onTagsChange: () => {},
  onModeChange: () => {},
  onDueDateChange: () => {},
  onToggleInActions: () => {},
  onCreateTagDef: async () => null,
};

export const ActionContext = createContext<ActionContextValue>(DEFAULT);

export function useActions(): ActionContextValue {
  return useContext(ActionContext);
}
