-- ── Bucket 5: Search & Organization ─────────────────────────────────────────
-- Migration 000008
-- Adds full-text search_vector to notes, maintained by trigger.
-- Notes schema has no title; we search description (weight A) + content (weight B).

-- ── 1. Add search_vector column (NOT generated — managed by trigger) ──────────

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ── 2. Trigger function to maintain search_vector ─────────────────────────────
-- description = weight A (shown as title in results)
-- content     = weight B (body text)
-- Uses 'english' dictionary for stemming (run/running/runs all match).

CREATE OR REPLACE FUNCTION public.notes_search_vector_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_search_vector_tg ON public.notes;
CREATE TRIGGER notes_search_vector_tg
  BEFORE INSERT OR UPDATE OF description, content ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_search_vector_update();

-- ── 3. Backfill existing rows ─────────────────────────────────────────────────

UPDATE public.notes
SET search_vector =
  setweight(to_tsvector('english', coalesce(description, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

-- GIN index for fast @@ queries on search_vector
CREATE INDEX IF NOT EXISTS notes_search_vector_gin
  ON public.notes USING GIN (search_vector);

-- B-tree index on updated_at for ORDER BY performance
-- (notes.updated_at added in migration 000007)
CREATE INDEX IF NOT EXISTS notes_updated_at_idx
  ON public.notes (updated_at DESC NULLS LAST);

-- ── 5. Verification query (run manually after applying) ───────────────────────
-- select id, description, ts_rank(search_vector, plainto_tsquery('english','test')) as r
-- from notes
-- where search_vector @@ plainto_tsquery('english','test')
-- order by r desc
-- limit 10;
