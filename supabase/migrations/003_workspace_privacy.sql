begin;
create table public.workspace_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null check (generation between 1 and 9007199254740990),
  erasures jsonb not null check (jsonb_typeof(erasures) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.workspace_privacy enable row level security;
revoke all on public.workspace_privacy from public,anon,authenticated;
grant select on public.workspace_privacy to authenticated;
create policy own_workspace_privacy on public.workspace_privacy for select to authenticated
  using ((select auth.uid()) = user_id);

-- Retire the previous write entry point so old clients cannot bypass privacy checks.
alter function public.save_workspace_documents(uuid,jsonb) rename to save_workspace_documents_checked;
revoke all on function public.save_workspace_documents_checked(uuid,jsonb) from public,anon,authenticated;

create function public.read_workspace_privacy(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or p_owner is null or auth.uid() <> p_owner then
    raise exception using errcode='42501', message='workspace_owner_mismatch';
  end if;
  select jsonb_build_object('generation',generation,'erasures',erasures) into result
    from public.workspace_privacy where user_id=p_owner;
  return coalesce(result,'{"generation":0,"erasures":{}}'::jsonb);
end;
$$;

create function public.save_workspace_documents(p_owner uuid,p_changes jsonb,p_generation bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_generation bigint;
begin
  if auth.uid() is null or p_owner is null or auth.uid() <> p_owner then
    raise exception using errcode='42501',message='workspace_owner_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select generation into current_generation from public.workspace_privacy where user_id=p_owner;
  if p_generation is null or p_generation <> coalesce(current_generation,0) then
    raise exception using errcode='40001',message='workspace_privacy_changed';
  end if;
  return public.save_workspace_documents_checked(p_owner,p_changes);
end;
$$;

create function public.erase_workspace_scope(p_owner uuid,p_scope text,p_generation bigint,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_generation bigint; next_generation bigint; marks jsonb;
  item jsonb; key_name text; expected_revision bigint; expected_map jsonb := '{}'::jsonb;
  actual_map jsonb; target_keys text[]; count_changed integer;
begin
  if auth.uid() is null or p_owner is null or auth.uid() <> p_owner then
    raise exception using errcode='42501',message='workspace_owner_mismatch';
  end if;
  if p_scope is null or p_scope not in ('all','meals','training','calendars','preferences','sat','days') or
     p_expected is null or jsonb_typeof(p_expected)<>'array' or jsonb_array_length(p_expected)>2000 or octet_length(p_expected::text)>262144 then
    raise exception using errcode='22023',message='workspace_invalid_erasure';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select generation,erasures into current_generation,marks from public.workspace_privacy where user_id=p_owner;
  current_generation:=coalesce(current_generation,0);marks:=coalesce(marks,'{}'::jsonb);
  if p_generation is null or p_generation<>current_generation or current_generation>=9007199254740990 then
    raise exception using errcode='40001',message='workspace_privacy_changed';
  end if;
  for item in select value from jsonb_array_elements(p_expected) loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or
       jsonb_typeof(item->'key')<>'string' or jsonb_typeof(item->'revision')<>'number' or
       (item->>'revision')!~'^[0-9]+$' then
      raise exception using errcode='22023',message='workspace_invalid_erasure';
    end if;
    key_name:=item->>'key';expected_revision:=(item->>'revision')::bigint;
    if expected_revision<0 or expected_revision>=9007199254740991 or expected_map ? key_name or
       not (key_name in ('personal','sat','planning') or key_name ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$') or
       not (p_scope='all' or (p_scope='days' and left(key_name,4)='day:') or
            (p_scope='sat' and key_name='sat') or (p_scope in ('meals','training','calendars','preferences') and key_name='personal')) then
      raise exception using errcode='22023',message='workspace_invalid_erasure';
    end if;
    expected_map:=expected_map||jsonb_build_object(key_name,expected_revision);
  end loop;
  select coalesce(jsonb_object_agg(document_key,revision),'{}'::jsonb),array_agg(document_key)
    into actual_map,target_keys from public.workspace_documents where user_id=p_owner and
      (p_scope='all' or (p_scope='days' and left(document_key,4)='day:') or
       (p_scope='sat' and document_key='sat') or (p_scope in ('meals','training','calendars','preferences') and document_key='personal'));
  if actual_map <> (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(expected_map) where (value::text)::bigint>0) then
    raise exception using errcode='40001',message='workspace_revision_conflict';
  end if;
  if exists(select 1 from public.workspace_documents where user_id=p_owner and document_key=any(target_keys) and revision>=9007199254740991) then
    raise exception using errcode='22023',message='workspace_revision_limit';
  end if;
  update public.workspace_documents set
    payload=case when p_scope in ('all','sat','days') then null
      when payload is null then null
      when p_scope='meals' then jsonb_set(payload,'{nutrition}','{"recipes":[],"journal":[],"plans":[],"hiddenIdeas":[]}'::jsonb)
      when p_scope='training' then jsonb_set(payload,'{fitness}','{"routines":[],"plans":[],"logs":[],"preferences":{"equipment":"unknown","equipmentDetails":"","restrictionsStatus":"unknown","restrictions":""}}'::jsonb)
      when p_scope='calendars' then jsonb_set(payload,'{calendars}','{"version":1,"calendars":[]}'::jsonb)
      when p_scope='preferences' then payload||'{"displayName":"","food":{"likes":[],"dislikes":[],"ingredientExceptions":[],"favoriteMeals":[],"allergyStatus":"unknown","allergies":[],"meals":null},"news":["US","World","Politics","Technology","AI","Business","Science","Sports"]}'::jsonb
      else payload end,
    revision=revision+1,updated_at=now()
    where user_id=p_owner and document_key=any(target_keys);
  get diagnostics count_changed=row_count;
  next_generation:=current_generation+1;marks:=marks||jsonb_build_object(p_scope,next_generation);
  insert into public.workspace_privacy(user_id,generation,erasures) values(p_owner,next_generation,marks)
    on conflict(user_id) do update set generation=excluded.generation,erasures=excluded.erasures,updated_at=now();
  return jsonb_build_object('generation',next_generation,'erasures',marks,'scope',p_scope,'changedDocuments',count_changed);
end;
$$;
revoke all on function public.read_workspace_privacy(uuid) from public,anon;
revoke all on function public.save_workspace_documents(uuid,jsonb,bigint) from public,anon;
revoke all on function public.erase_workspace_scope(uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.read_workspace_privacy(uuid) to authenticated;
grant execute on function public.save_workspace_documents(uuid,jsonb,bigint) to authenticated;
grant execute on function public.erase_workspace_scope(uuid,text,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
