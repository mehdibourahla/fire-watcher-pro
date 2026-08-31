-- Per-warning CAP detail: French headline shown to fr users, the area polygon
-- for future map display, instruction only when ONM writes a real one.
alter table onm_vigilance add column headline_fr text;
alter table onm_vigilance add column instruction_fr text;
alter table onm_vigilance add column polygon jsonb;
