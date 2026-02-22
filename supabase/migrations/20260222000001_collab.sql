-- ─── Collaboration Layer ─────────────────────────────────────────────────────
-- Adds: status field, activity tracking fields to notes;
--       note_updates (user-authored feed); note_activity (system event log)

-- 1. Extend notes table
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_public_activity_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_public_activity_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_public_activity_preview text DEFAULT NULL;

-- 2. note_updates — user-authored chronological feed
CREATE TABLE IF NOT EXISTS note_updates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id         uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content         text NOT NULL CHECK (char_length(content) > 0),
  status_change   text DEFAULT NULL,       -- new status value if this update changed it
  due_date_change text DEFAULT NULL,       -- ISO date string if changed, or 'cleared'
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_updates_note_id_idx ON note_updates(note_id, created_at);

ALTER TABLE note_updates ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "updates_select" ON note_updates
  FOR SELECT USING (true);

-- Auth required to post
CREATE POLICY "updates_insert" ON note_updates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. note_activity — system event log
CREATE TABLE IF NOT EXISTS note_activity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id       uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  activity_type text NOT NULL,     -- 'status_changed' | 'due_date_changed' | 'update_posted'
  payload       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_activity_note_id_idx ON note_activity(note_id, created_at);

ALTER TABLE note_activity ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "activity_select" ON note_activity
  FOR SELECT USING (true);

-- Auth required to log (API route uses user client)
CREATE POLICY "activity_insert" ON note_activity
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
