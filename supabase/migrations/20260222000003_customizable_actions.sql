-- ── private_tags on note_user_actions ────────────────────────────────────────
ALTER TABLE note_user_actions
  ADD COLUMN IF NOT EXISTS private_tags text[] NOT NULL DEFAULT '{}';

-- ── action_saved_views table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_saved_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  filters     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE action_saved_views ENABLE ROW LEVEL SECURITY;

-- Single policy covers SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "users_own_views"
  ON action_saved_views
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reuse the set_updated_at() trigger function from migration 000000
DROP TRIGGER IF EXISTS action_saved_views_updated_at ON action_saved_views;
CREATE TRIGGER action_saved_views_updated_at
  BEFORE UPDATE ON action_saved_views
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
