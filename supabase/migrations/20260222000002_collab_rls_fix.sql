-- ─── Fix Bucket 3 RLS: no public read ───────────────────────────────────────
-- Replaces the USING(true) open-read policies on note_updates and note_activity
-- with policies gated on note visibility (inherits from notes RLS).

-- ── note_updates ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "updates_select" ON note_updates;
DROP POLICY IF EXISTS "updates_insert" ON note_updates;

-- Read: only if the parent note is accessible
CREATE POLICY "updates_select" ON note_updates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_updates.note_id
    )
  );

-- Insert: authenticated + note accessible + row's user_id must match caller
CREATE POLICY "updates_insert" ON note_updates
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_updates.note_id
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- ── note_activity ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activity_select" ON note_activity;
DROP POLICY IF EXISTS "activity_insert" ON note_activity;

-- Read: only if the parent note is accessible
CREATE POLICY "activity_select" ON note_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_activity.note_id
    )
  );

-- Insert: authenticated + note accessible (inserted only from trusted API route)
CREATE POLICY "activity_insert" ON note_activity
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_activity.note_id
    )
  );
