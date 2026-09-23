alter table public.civil_publication_revisions drop constraint civil_publication_revisions_actor_kind_check;
alter table public.civil_publication_revisions add constraint civil_publication_revisions_actor_kind_check
  check (actor_kind in ('human','agent','system'));
alter table public.civil_publication_revisions drop constraint civil_revision_actor;
alter table public.civil_publication_revisions add constraint civil_revision_actor
  check ((actor_kind='human' and actor_id is not null) or (actor_kind in ('agent','system') and actor_id is null));

-- publications made before the hazard lease (#147) kept a 72 h validity and stayed live for days
do $$
declare
  _before public.civil_publications;
  _row public.civil_publications;
begin
  for _before in
    select * from public.civil_publications
    where state='published' and published_at<'2026-09-23T00:00:00Z'
      and expires_at>source_published_at+case hazard when 'road' then interval '2 hours' when 'fire' then interval '3 hours' else interval '6 hours' end
    order by published_at for update
  loop
    update public.civil_publications set
      expires_at=source_published_at+case hazard when 'road' then interval '2 hours' when 'fire' then interval '3 hours' else interval '6 hours' end,
      revision=revision+1,updated_at=clock_timestamp(),
      cap_references=cap_references || jsonb_build_array(jsonb_build_object('revision',_before.revision,'sent',_before.updated_at))
    where id=_before.id returning * into _row;
    insert into public.civil_publication_revisions(publication_id,revision,actor_id,actor_kind,reason,action,prior_payload,new_payload)
    values (_row.id,_row.revision,null,'system','Validité ramenée au bail du danger : route 2 h, feu 3 h, autres 6 h','update',to_jsonb(_before),to_jsonb(_row));
  end loop;
end;
$$;
