-- ── note_action_state enum ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE note_action_state AS ENUM ('needs_action', 'waiting', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── note_user_actions table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_user_actions (
  user_id           uuid              NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  note_id           uuid              NOT NULL REFERENCES notes(id)        ON DELETE CASCADE,
  action_state      note_action_state NOT NULL,
  personal_due_date date,
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, note_id)
);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS note_user_actions_updated_at ON note_user_actions;
CREATE TRIGGER note_user_actions_updated_at
  BEFORE UPDATE ON note_user_actions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE note_user_actions ENABLE ROW LEVEL SECURITY;

-- Users can read only their own rows
CREATE POLICY "own_select"
  ON note_user_actions FOR SELECT
  USING (user_id = auth.uid());

-- Insert: user must own the row AND the note must exist (respects notes RLS via EXISTS)
CREATE POLICY "own_insert"
  ON note_user_actions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM notes WHERE id = note_id)
  );

-- Update and delete: own rows only
CREATE POLICY "own_update"
  ON note_user_actions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "own_delete"
  ON note_user_actions FOR DELETE
  USING (user_id = auth.uid());
