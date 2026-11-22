begin;

-- Account documents contain validated application data, never provider tokens.
-- All writes use the revision-checked function below; clients cannot bypass CAS.
create table public.workspace_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null check (
    document_key in ('personal', 'sat', 'planning') or
    document_key ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ),
  revision bigint not null check (revision between 1 and 9007199254740991),
  payload jsonb check (payload is null or (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2097152)),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_key)
);

alter table public.workspace_documents enable row level security;
create policy own_workspace_documents_read on public.workspace_documents
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.workspace_documents from public, anon, authenticated;
grant select on public.workspace_documents to authenticated;

-- SECURITY DEFINER is deliberately limited to this owner-bound CAS operation.
-- No dynamic SQL, no caller-controlled owner, no credentials, and no arbitrary keys.
-- A NULL payload is a tombstone, so deletion never resets a revision to zero.
create function public.save_workspace_documents(p_owner uuid, p_changes jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  change jsonb;
  document_name text;
  expected_revision bigint;
  next_payload jsonb;
  saved public.workspace_documents%rowtype;
  result jsonb := '[]'::jsonb;
  seen text[] := array[]::text[];
begin
  if current_owner is null or p_owner is null or current_owner <> p_owner then
    raise exception using errcode = '42501', message = 'workspace_owner_mismatch';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or
     jsonb_array_length(p_changes) not between 1 and 200 or
     octet_length(p_changes::text) > 4194304 then
    raise exception using errcode = '22023', message = 'workspace_invalid_batch';
  end if;
  for change in select value from jsonb_array_elements(p_changes) order by value->>'key' loop
    if jsonb_typeof(change) <> 'object' or
       not (change ? 'key' and change ? 'expectedRevision' and change ? 'payload') or
       (select count(*) from jsonb_object_keys(change)) <> 3 or
       jsonb_typeof(change->'key') <> 'string' or
       jsonb_typeof(change->'expectedRevision') <> 'number' or
       (change->>'expectedRevision') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'workspace_invalid_change';
    end if;
    document_name := change->>'key';
    expected_revision := (change->>'expectedRevision')::bigint;
    next_payload := nullif(change->'payload', 'null'::jsonb);
    if expected_revision < 0 or expected_revision >= 9007199254740991 or
       document_name = any(seen) or
       not (document_name in ('personal', 'sat', 'planning') or document_name ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$') or
       (next_payload is not null and (jsonb_typeof(next_payload) <> 'object' or octet_length(next_payload::text) > 2097152)) then
      raise exception using errcode = '22023', message = 'workspace_invalid_change';
    end if;
    if left(document_name, 4) = 'day:' then
      perform substring(document_name from 5)::date;
    end if;
    seen := array_append(seen, document_name);
    if expected_revision = 0 then
      insert into public.workspace_documents(user_id, document_key, revision, payload)
        values (current_owner, document_name, 1, next_payload)
        on conflict (user_id, document_key) do nothing returning * into saved;
    else
      update public.workspace_documents set payload = next_payload,
        revision = revision + 1, updated_at = now()
        where user_id = current_owner and document_key = document_name and revision = expected_revision
        returning * into saved;
    end if;
    if not found then
      raise exception using errcode = '40001', message = 'workspace_revision_conflict';
    end if;
    result := result || jsonb_build_array(to_jsonb(saved));
  end loop;
  return result;
end;
$$;
revoke all on function public.save_workspace_documents(uuid, jsonb) from public, anon;
grant execute on function public.save_workspace_documents(uuid, jsonb) to authenticated;
commit;
