-- ── Bucket 4: Awareness & Signal ─────────────────────────────────────────────
-- Migration 000007
-- 1. Add notes.updated_at: NULL for existing rows; set via trigger on INSERT / UPDATE.
--    This drives the "recent update" signal and the per-user unseen dot.
-- 2. Create note_user_awareness: per-user last_viewed_at for every note opened.

-- ── 1. notes.updated_at ──────────────────────────────────────────────────────

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;

-- Reuse the set_updated_at() function defined in migration 000000.
-- Fire on INSERT (new notes) and UPDATE (edits) so the field is always current.
DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. note_user_awareness ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.note_user_awareness (
  user_id        uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  note_id        uuid        NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, note_id)
);

ALTER TABLE public.note_user_awareness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own awareness rows"
  ON public.note_user_awareness FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own awareness rows"
  ON public.note_user_awareness FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own awareness rows"
  ON public.note_user_awareness FOR UPDATE
  USING (user_id = auth.uid());

-- updated_at auto-maintenance
DROP TRIGGER IF EXISTS note_user_awareness_updated_at ON public.note_user_awareness;
CREATE TRIGGER note_user_awareness_updated_at
  BEFORE UPDATE ON public.note_user_awareness
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
