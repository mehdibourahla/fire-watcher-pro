-- a document is stored before extraction and never revisited, so an LLM failure lost its
-- residue lines for good; this is the retry queue
create table public.document_extractions (
  document_id uuid primary key references public.source_documents(id) on delete cascade,
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  updated_at timestamptz not null default now()
);

create index document_extractions_pending_idx
  on public.document_extractions (updated_at) where attempts < 4;

alter table public.document_extractions enable row level security;
revoke all on public.document_extractions from anon, authenticated;
grant select, insert, update, delete on public.document_extractions to service_role;
