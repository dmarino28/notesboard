-- Bucket 6C: Territory release schedule per board (JSONB array)
-- Item shape: { region, territory, date (ISO), tba, no_release }
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS release_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;
