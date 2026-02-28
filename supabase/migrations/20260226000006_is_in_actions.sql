-- Add is_in_actions to note_user_actions.
-- Controls visibility on the timed board independently of action_state.
-- Existing rows are "in actions" by default.
ALTER TABLE note_user_actions
  ADD COLUMN IF NOT EXISTS is_in_actions boolean NOT NULL DEFAULT true;
