-- ── Note Links ──────────────────────────────────────────────────────────────
CREATE TABLE note_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  url        text        NOT NULL,
  title      text,
  created_by uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE note_links ENABLE ROW LEVEL SECURITY;

-- Read: authenticated + parent note exists (consistent with note_updates/note_activity)
CREATE POLICY "note_links_select"
  ON note_links FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.notes WHERE id = note_links.note_id)
  );

-- Insert: authenticated + parent note exists (created_by set by column DEFAULT)
CREATE POLICY "note_links_insert"
  ON note_links FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.notes WHERE id = note_links.note_id)
  );

-- Delete: only the creator can delete (keeps storage/metadata ownership aligned)
CREATE POLICY "note_links_delete"
  ON note_links FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );


-- ── Note Attachments (metadata) ─────────────────────────────────────────────
CREATE TABLE note_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  file_name    text        NOT NULL,
  file_size    bigint,
  mime_type    text,
  created_by   uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;

-- Read: authenticated + parent note exists
CREATE POLICY "note_attachments_select"
  ON note_attachments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.notes WHERE id = note_attachments.note_id)
  );

-- Insert: authenticated + parent note exists (created_by set by column DEFAULT)
CREATE POLICY "note_attachments_insert"
  ON note_attachments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.notes WHERE id = note_attachments.note_id)
  );

-- Delete: only the creator — aligns with storage DELETE policy (owner = auth.uid())
CREATE POLICY "note_attachments_delete"
  ON note_attachments FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );


-- ── Storage bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-attachments', 'note-attachments', false)
ON CONFLICT DO NOTHING;

-- Upload: any authenticated user may PUT objects.
-- The metadata INSERT above is the real access gate (requires note to exist).
CREATE POLICY "note_attachments_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'note-attachments'
    AND auth.uid() IS NOT NULL
  );

-- No SELECT policy: direct object reads are blocked.
-- All file access goes through the signed-URL API route, which:
--   1. Authenticates the caller
--   2. Verifies note access via a DB lookup of note_attachments (user client + RLS)
--   3. Uses the service role key to generate a short-lived signed URL
-- This prevents any user from fetching raw storage objects without going through the app.

-- Delete: users may only remove objects they own (storage owner = auth.uid() at upload time)
CREATE POLICY "note_attachments_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'note-attachments'
    AND owner = auth.uid()
  );
