# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NotesBoard – Build Guidelines (Claude)

## Role
You are the coding agent. You can assume an expert operator is coordinating you. Do not write beginner explanations. Be direct, technical, and execution-focused.

## Project
NotesBoard: Next.js App Router + TypeScript + Tailwind v4 + Supabase (anon client). Current code concentrates UI + logic in src/app/page.tsx.

## Objectives (in order)
1) Reduce complexity: extract UI into components and move data operations into a small lib layer.
2) Keep behavior stable: refactor first, then add improvements in a separate step.
3) Improve UX basics only if low-risk: loading, empty state, error display.
4) Prepare for future Kanban and auth, but do NOT implement auth yet.

## Conventions
- Components live in src/components
- Data/helpers live in src/lib
- Keep Supabase client in src/lib/supabase.ts
- Prefer simple, readable code. No new libraries unless clearly justified.

## Workflow
- Before edits: bullet plan (5–10 bullets max)
- Make changes in cohesive commits-sized chunks
- Show diffs for edits
- After edits: list files changed + commands to verify (dev + typecheck/lint if present)
- Call out any risky assumptions

## Commands
```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build + type-check
npm run lint     # eslint
npx tsc --noEmit # type-check without building
```

## ⚠ After pulling new migrations
Run `supabase db push` to apply schema changes before starting the dev server.
New migrations add columns (`notes.status`, `last_public_activity_*`) and tables
(`note_updates`, `note_activity`). The app will crash with "column does not exist"
if migrations are not applied.

## Supabase Dashboard Settings (required for auth)
- **Authentication → Providers → Email**: must be enabled; "Confirm email" can be ON (magic link) or OFF (passwordless)
- **Authentication → URL Configuration → Redirect URLs**: add `http://localhost:3000/auth/callback` (dev) and your production URL e.g. `https://notesboard.vercel.app/auth/callback`
- Without the redirect URL allowlist entry, `signInWithOtp` will silently fail on the magic link click

## Architecture
- `src/app/page.tsx` — client component, orchestrates state (notes, loading, errors, toast); delegates to components
- `src/lib/notes.ts` — data layer: `NoteRow` type, `listNotes()`, `createNote()`
- `src/lib/supabase.ts` — singleton Supabase anon client (reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `src/components/NoteComposer.tsx` — owns `content`/`saving`/composer-error state; calls `onAdd(content: string): Promise<void>` (throws on error)
- `src/components/NoteList.tsx` — pure render: list | loading | empty | fetch-error states
- `src/components/NoteItem.tsx` — single note card

No API routes. Frontend hits Supabase directly via anon key; access control via RLS.
