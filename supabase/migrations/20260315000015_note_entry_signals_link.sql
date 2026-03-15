-- Add 'link' to the allowed signal_type values for [[Board Name]] cross-references.
-- The original constraint only covered: board, milestone, channel, market, date.

alter table note_entry_signals
  drop constraint if exists note_entry_signals_signal_type_check;

alter table note_entry_signals
  add constraint note_entry_signals_signal_type_check
  check (signal_type in ('board', 'milestone', 'channel', 'market', 'date', 'link'));
