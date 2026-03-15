/**
 * noteTemplates.ts
 *
 * Lightweight template system for note capture.
 * Built-in templates are defined here; user-defined templates are stored in localStorage.
 *
 * Trigger: type "/" at the start of an empty capture entry.
 * The menu filters as you type (e.g. "/stand" → Standup).
 * Press Enter or click to insert the template. Escape dismisses.
 */

export interface NoteTemplate {
  id: string;
  label: string;
  /** Matched against the text typed after "/" for filtering. */
  shortcut: string;
  /** Single character or symbol shown in the menu. */
  icon: string;
  /** Template text inserted into the entry. */
  content: string;
  isBuiltIn: boolean;
}

const STORAGE_KEY = "nb:templates";

export function getBuiltinTemplates(): NoteTemplate[] {
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return [
    {
      id: "action",
      label: "Action item",
      shortcut: "action",
      icon: "→",
      content: "[ ] ",
      isBuiltIn: true,
    },
    {
      id: "follow",
      label: "Follow up",
      shortcut: "follow",
      icon: "↩",
      content: "Follow up with ",
      isBuiltIn: true,
    },
    {
      id: "blocker",
      label: "Blocker",
      shortcut: "blocker",
      icon: "⚠",
      content: "Blocker: ",
      isBuiltIn: true,
    },
    {
      id: "decision",
      label: "Decision",
      shortcut: "decision",
      icon: "✓",
      content: "Decision: \nRationale: ",
      isBuiltIn: true,
    },
    {
      id: "standup",
      label: "Standup",
      shortcut: "standup",
      icon: "◎",
      content: "Yesterday: \nToday: \nBlocking: ",
      isBuiltIn: true,
    },
    {
      id: "meeting",
      label: "Meeting notes",
      shortcut: "meeting",
      icon: "◷",
      content: `${today} Meeting\n- `,
      isBuiltIn: true,
    },
    {
      id: "weekly",
      label: "Weekly recap",
      shortcut: "weekly",
      icon: "◈",
      content: `Week of ${today}\n- `,
      isBuiltIn: true,
    },
  ];
}

export function loadUserTemplates(): NoteTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NoteTemplate[];
  } catch {
    return [];
  }
}

export function saveUserTemplate(template: Omit<NoteTemplate, "isBuiltIn">): NoteTemplate[] {
  const existing = loadUserTemplates();
  const idx = existing.findIndex((t) => t.id === template.id);
  const next = [...existing];
  const full: NoteTemplate = { ...template, isBuiltIn: false };
  if (idx !== -1) {
    next[idx] = full;
  } else {
    next.push(full);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteUserTemplate(id: string): NoteTemplate[] {
  const existing = loadUserTemplates();
  const next = existing.filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** All templates: built-ins first, then user-defined. */
export function getAllTemplates(): NoteTemplate[] {
  return [...getBuiltinTemplates(), ...loadUserTemplates()];
}

/** Filter templates by the text after the "/" trigger. */
export function filterTemplates(query: string, templates: NoteTemplate[]): NoteTemplate[] {
  if (!query) return templates;
  const q = query.toLowerCase();
  return templates.filter(
    (t) => t.shortcut.startsWith(q) || t.label.toLowerCase().startsWith(q)
  );
}
