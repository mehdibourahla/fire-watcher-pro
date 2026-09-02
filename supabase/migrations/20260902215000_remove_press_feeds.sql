-- the eight national press feeds (rss_*) produced nothing usable in production and are withdrawn
alter table public.incident_mentions disable trigger reject_incident_mention_mutation;
alter table public.source_documents disable trigger reject_source_document_mutation;

delete from public.incident_mentions
where text_source_id in (select id from public.text_sources where kind = 'rss');
delete from public.source_documents
where text_source_id in (select id from public.text_sources where kind = 'rss');

alter table public.incident_mentions enable trigger reject_incident_mention_mutation;
alter table public.source_documents enable trigger reject_source_document_mutation;

delete from public.text_sources where kind = 'rss';
delete from public.source_gaps where contract_key like 'rss\_%';
delete from public.source_runs where contract_key like 'rss\_%';
delete from public.source_job_leases where contract_key like 'rss\_%';
delete from public.source_jobs where contract_key like 'rss\_%';
delete from public.source_checkpoints where contract_key like 'rss\_%';
delete from public.source_contracts where key like 'rss\_%';

alter table public.text_sources drop constraint text_sources_kind_check;
alter table public.text_sources add constraint text_sources_kind_check check (kind in ('telegram_public'));
