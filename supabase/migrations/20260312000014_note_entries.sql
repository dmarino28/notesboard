-- ─────────────────────────────────────────────────────────────────────────────
-- Notes system: note_pages, note_entries, note_entry_signals, note_ai_suggestions
-- ─────────────────────────────────────────────────────────────────────────────

-- note_pages: optional named containers; entries can also be pageless (grouped by date)
create table if not exists note_pages (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text,
  page_date   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived    boolean     not null default false
);

-- note_entries: individual bullet blocks
create table if not exists note_entries (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  page_id           uuid        references note_pages(id) on delete set null,
  content           text        not null default '',
  -- float position within the day; insert-between uses midpoint
  position          double precision not null default 0,
  indent_level      integer     not null default 0 check (indent_level between 0 and 8),
  parent_entry_id   uuid        references note_entries(id) on delete set null,

  -- context fields set by detection + inference
  explicit_board_id uuid        references boards(id) on delete set null,
  inferred_board_id uuid        references boards(id) on delete set null,
  context_source    text        not null default 'unknown'
                    check (context_source in ('direct_match', 'inherited', 'unknown')),

  -- temporal grouping
  entry_date        date        not null default current_date,

  -- future: meeting mode
  meeting_timestamp timestamptz,

  -- lifecycle
  status            text        not null default 'active'
                    check (status in ('active', 'applied', 'archived')),

  -- future: research clipping
  clip_url          text,
  clip_source       text,
  clip_metadata     jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- note_entry_signals: detected signals per entry
create table if not exists note_entry_signals (
  id               uuid  primary key default gen_random_uuid(),
  entry_id         uuid  not null references note_entries(id) on delete cascade,
  signal_type      text  not null
                   check (signal_type in ('board', 'milestone', 'channel', 'market', 'date')),
  signal_value     text  not null,
  normalized_value text,
  match_text       text  not null,
  match_start      integer,
  match_end        integer,
  created_at       timestamptz not null default now()
);

-- note_ai_suggestions: AI-generated board/card suggestions pending user review
-- v1: stored in React state; this schema is future-ready for persistence
create table if not exists note_ai_suggestions (
  id               uuid  primary key default gen_random_uuid(),
  user_id          uuid  not null references auth.users(id) on delete cascade,
  suggestion_type  text  not null
                   check (suggestion_type in (
                     'create_card', 'update_card', 'update_board_metadata',
                     'add_milestone', 'attach_note_reference'
                   )),
  target_board_id  uuid  references boards(id) on delete set null,
  target_note_id   uuid  references notes(id)  on delete set null,
  target_column_id uuid  references columns(id) on delete set null,
  source_entry_ids uuid[] not null default '{}',
  payload          jsonb not null default '{}',
  status           text  not null default 'pending'
                   check (status in ('pending', 'applied', 'edited', 'ignored')),
  applied_at       timestamptz,
  applied_note_id  uuid  references notes(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists note_pages_user_idx
  on note_pages(user_id, created_at desc);

create index if not exists note_entries_user_date_idx
  on note_entries(user_id, entry_date desc, position asc);

create index if not exists note_entries_explicit_board_idx
  on note_entries(user_id, explicit_board_id)
  where explicit_board_id is not null;

create index if not exists note_entries_inferred_board_idx
  on note_entries(user_id, inferred_board_id)
  where inferred_board_id is not null;

create index if not exists note_entry_signals_entry_idx
  on note_entry_signals(entry_id);

create index if not exists note_entry_signals_type_idx
  on note_entry_signals(signal_type, signal_value);

create index if not exists note_ai_suggestions_user_idx
  on note_ai_suggestions(user_id, created_at desc);

-- Full-text search index on entry content
create index if not exists note_entries_content_fts_idx
  on note_entries using gin(to_tsvector('english', content));

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table note_pages           enable row level security;
alter table note_entries         enable row level security;
alter table note_entry_signals   enable row level security;
alter table note_ai_suggestions  enable row level security;

-- note_pages: fully user-scoped
create policy "note_pages_select" on note_pages for select using (auth.uid() = user_id);
create policy "note_pages_insert" on note_pages for insert with check (auth.uid() = user_id);
create policy "note_pages_update" on note_pages for update using (auth.uid() = user_id);
create policy "note_pages_delete" on note_pages for delete using (auth.uid() = user_id);

-- note_entries: fully user-scoped
create policy "note_entries_select" on note_entries for select using (auth.uid() = user_id);
create policy "note_entries_insert" on note_entries for insert with check (auth.uid() = user_id);
create policy "note_entries_update" on note_entries for update using (auth.uid() = user_id);
create policy "note_entries_delete" on note_entries for delete using (auth.uid() = user_id);

-- note_entry_signals: accessible only through owner's entries
create policy "note_entry_signals_select" on note_entry_signals
  for select using (
    exists (select 1 from note_entries e where e.id = entry_id and e.user_id = auth.uid())
  );
create policy "note_entry_signals_insert" on note_entry_signals
  for insert with check (
    exists (select 1 from note_entries e where e.id = entry_id and e.user_id = auth.uid())
  );
create policy "note_entry_signals_delete" on note_entry_signals
  for delete using (
    exists (select 1 from note_entries e where e.id = entry_id and e.user_id = auth.uid())
  );

-- note_ai_suggestions: fully user-scoped
create policy "note_ai_suggestions_select" on note_ai_suggestions for select using (auth.uid() = user_id);
create policy "note_ai_suggestions_insert" on note_ai_suggestions for insert with check (auth.uid() = user_id);
create policy "note_ai_suggestions_update" on note_ai_suggestions for update using (auth.uid() = user_id);
create policy "note_ai_suggestions_delete" on note_ai_suggestions for delete using (auth.uid() = user_id);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create or replace function set_note_pages_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger note_pages_updated_at
  before update on note_pages
  for each row execute function set_note_pages_updated_at();

create or replace function set_note_entries_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger note_entries_updated_at
  before update on note_entries
  for each row execute function set_note_entries_updated_at();

create or replace function set_note_ai_suggestions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger note_ai_suggestions_updated_at
  before update on note_ai_suggestions
  for each row execute function set_note_ai_suggestions_updated_at();
