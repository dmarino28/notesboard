-- ============================================================
-- Card Details migration – safe to re-run (idempotent)
-- ============================================================

-- 1. Extend notes table
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS due_date     timestamptz,
  ADD COLUMN IF NOT EXISTS event_start  timestamptz,
  ADD COLUMN IF NOT EXISTS event_end    timestamptz,
  ADD COLUMN IF NOT EXISTS archived     boolean NOT NULL DEFAULT false;

-- 2. Labels table (board-scoped)
CREATE TABLE IF NOT EXISTS labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  color      text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. Note-label junction
CREATE TABLE IF NOT EXISTS note_labels (
  note_id  uuid NOT NULL REFERENCES notes(id)  ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, label_id)
);

-- 4. Comments table
CREATE TABLE IF NOT EXISTS comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_labels_board_created   ON labels     (board_id,  created_at);
CREATE INDEX IF NOT EXISTS idx_note_labels_note       ON note_labels (note_id);
CREATE INDEX IF NOT EXISTS idx_note_labels_label      ON note_labels (label_id);
CREATE INDEX IF NOT EXISTS idx_comments_note_created  ON comments   (note_id,   created_at);
CREATE INDEX IF NOT EXISTS idx_notes_archived         ON notes      (board_id,  archived);

-- 6. RLS – permissive for local dev (mirrors existing pattern)
ALTER TABLE labels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments    ENABLE ROW LEVEL SECURITY;

-- labels
DROP POLICY IF EXISTS "labels public select" ON labels;
CREATE POLICY "labels public select" ON labels FOR SELECT USING (true);
DROP POLICY IF EXISTS "labels public insert" ON labels;
CREATE POLICY "labels public insert" ON labels FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "labels public update" ON labels;
CREATE POLICY "labels public update" ON labels FOR UPDATE USING (true);
DROP POLICY IF EXISTS "labels public delete" ON labels;
CREATE POLICY "labels public delete" ON labels FOR DELETE USING (true);

-- note_labels
DROP POLICY IF EXISTS "note_labels public select" ON note_labels;
CREATE POLICY "note_labels public select" ON note_labels FOR SELECT USING (true);
DROP POLICY IF EXISTS "note_labels public insert" ON note_labels;
CREATE POLICY "note_labels public insert" ON note_labels FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "note_labels public delete" ON note_labels;
CREATE POLICY "note_labels public delete" ON note_labels FOR DELETE USING (true);

-- comments
DROP POLICY IF EXISTS "comments public select" ON comments;
CREATE POLICY "comments public select" ON comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "comments public insert" ON comments;
CREATE POLICY "comments public insert" ON comments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "comments public delete" ON comments;
CREATE POLICY "comments public delete" ON comments FOR DELETE USING (true);
