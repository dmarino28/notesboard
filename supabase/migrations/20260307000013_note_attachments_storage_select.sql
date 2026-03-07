-- Allow authenticated users to generate signed URLs for note attachments.
--
-- Context: the bucket has no public SELECT (direct downloads are blocked).
-- All file access goes through the signed-URL API route, which:
--   1. Authenticates the caller
--   2. Verifies note access via a DB lookup of note_attachments (user client + RLS)
--   3. Calls storage.createSignedUrl using the caller's own authenticated client
--
-- Without this policy, createSignedUrl returns a permissions error even for
-- authenticated users, causing the preview modal to fail. Signed URLs themselves
-- are time-limited (1 hour) and unguessable (path includes a random UUID),
-- so this is safe without a service role key.
CREATE POLICY "note_attachments_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'note-attachments'
    AND auth.uid() IS NOT NULL
  );
