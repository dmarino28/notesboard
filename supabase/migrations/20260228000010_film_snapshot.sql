-- ── Bucket 6A: Film Snapshot Header ──────────────────────────────────────────

-- boards: snapshot gate + manual snapshot fields
-- All new columns default to null/false/empty — existing boards unaffected.
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS show_snapshot_header  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS campaign_phase        text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS release_date          date     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS premiere_date         date     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trailer_debut_date    date     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS key_markets           text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS snapshot_notes        text     DEFAULT NULL;

-- notes: manual highlight flag for Snapshot Header card strip
-- Defaults false — zero disruption to existing notes.
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS highlight_on_snapshot boolean NOT NULL DEFAULT false;
