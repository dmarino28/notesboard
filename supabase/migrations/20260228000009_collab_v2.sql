-- ─── Collab v2 ───────────────────────────────────────────────────────────────
-- Adds:
--   1. last_public_activity_user_id to notes (for card-surface attribution)
--   2. actor_user_id to note_activity (who performed the activity)
--   3. Body-length constraint on note_updates.content (max 500 chars)
--   4. Trigger: sync notes.last_public_activity_* on note_updates INSERT

-- ── 1. notes: add user attribution column ─────────────────────────────────────

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS last_public_activity_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. note_activity: add actor column ────────────────────────────────────────

ALTER TABLE public.note_activity
  ADD COLUMN IF NOT EXISTS actor_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 3. note_updates: enforce body length ──────────────────────────────────────

ALTER TABLE public.note_updates
  DROP CONSTRAINT IF EXISTS note_updates_content_maxlen;

ALTER TABLE public.note_updates
  ADD CONSTRAINT note_updates_content_maxlen
  CHECK (char_length(content) <= 500);

-- ── 4. Trigger: sync last_public_activity_* when a note_update is inserted ────
--
-- Runs AFTER INSERT on note_updates. Updates the parent note's activity surface
-- fields so the board card reflects the latest update without extra queries.
--
-- SECURITY DEFINER: runs with owner's privileges so it can UPDATE notes even
-- when the session's RLS would otherwise block it (anon/service key mismatch).
-- Safe because the trigger only fires via an authenticated INSERT to note_updates.

CREATE OR REPLACE FUNCTION public.note_updates_sync_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notes
  SET
    last_public_activity_at      = NEW.created_at,
    last_public_activity_user_id = NEW.user_id,
    last_public_activity_type    = 'update',
    last_public_activity_preview = left(NEW.content, 80)
  WHERE id = NEW.note_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS note_updates_sync_activity_tg ON public.note_updates;
CREATE TRIGGER note_updates_sync_activity_tg
  AFTER INSERT ON public.note_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.note_updates_sync_activity();
