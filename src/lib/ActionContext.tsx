"use client";

import { createContext, useContext } from "react";
import type { ActionState, NoteActionMap } from "./userActions";

type ActionContextValue = {
  actionMap: NoteActionMap;
  onActionChange: (noteId: string, next: ActionState | "none") => void;
};

const DEFAULT: ActionContextValue = {
  actionMap: {},
  onActionChange: () => {},
};

export const ActionContext = createContext<ActionContextValue>(DEFAULT);

export function useActions(): ActionContextValue {
  return useContext(ActionContext);
}
