-- ── Waiting automation fields ─────────────────────────────────────────────────
-- When a card is moved to Waiting state, these fields are populated from the
-- linked email thread so the poll-waiting route can check for new replies.

ALTER TABLE note_user_actions
  ADD COLUMN IF NOT EXISTS waiting_conversation_id text NULL,
  ADD COLUMN IF NOT EXISTS waiting_since_at        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS waiting_mailbox         text NULL;
