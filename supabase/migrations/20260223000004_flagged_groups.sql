-- ── action_tag_defs ──────────────────────────────────────────────────────────
-- Managed, per-user group definitions for the Flagged section of My Actions.

CREATE TABLE IF NOT EXISTS action_tag_defs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE action_tag_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_tag_defs" ON action_tag_defs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_action_tag_defs_updated_at
  BEFORE UPDATE ON action_tag_defs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── note_user_actions: add action_mode ───────────────────────────────────────

ALTER TABLE note_user_actions
  ADD COLUMN IF NOT EXISTS action_mode text NOT NULL DEFAULT 'timed';

ALTER TABLE note_user_actions
  DROP CONSTRAINT IF EXISTS action_mode_values;

ALTER TABLE note_user_actions
  ADD CONSTRAINT action_mode_values CHECK (action_mode IN ('timed', 'flagged'));

-- ── Helper functions for tag rename / delete propagation ─────────────────────

-- replace_action_tag: rename a tag across all note_user_actions.private_tags for a user
CREATE OR REPLACE FUNCTION replace_action_tag(
  p_user_id uuid,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE note_user_actions
  SET private_tags = array_replace(private_tags, p_old_name, p_new_name)
  WHERE user_id = p_user_id
    AND p_old_name = ANY(private_tags);
$$;

-- remove_action_tag: delete a tag from all note_user_actions.private_tags for a user
CREATE OR REPLACE FUNCTION remove_action_tag(
  p_user_id uuid,
  p_tag_name text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE note_user_actions
  SET private_tags = array_remove(private_tags, p_tag_name)
  WHERE user_id = p_user_id
    AND p_tag_name = ANY(private_tags);
$$;
