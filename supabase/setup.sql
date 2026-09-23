-- Run once in the Supabase SQL Editor. Safe to run again.
begin;
create schema if not exists flatplan_private;
revoke all on schema flatplan_private from public, anon, authenticated;
create table if not exists flatplan_private.plans (
  token_hash text primary key,
  state jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table flatplan_private.plans enable row level security;
revoke all on flatplan_private.plans from public, anon, authenticated;

create or replace function flatplan_private.valid_state(s jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare collection text; item jsonb; field text; ids text[];
begin
  if s is null or jsonb_typeof(s) <> 'object' or s->'version' is distinct from '1'::jsonb then return false; end if;
  if not (s ?& array['limit','reserve','tasks','materials','decisions']) then return false; end if;
  if s->'limit' <> 'null'::jsonb and (jsonb_typeof(s->'limit') <> 'number' or (s->>'limit')::numeric not between 0 and 10000000000) then return false; end if;
  if jsonb_typeof(s->'reserve') <> 'number' or (s->>'reserve')::numeric not between 0 and 100 then return false; end if;
  foreach collection in array array['tasks','materials','decisions'] loop
    if jsonb_typeof(s->collection) <> 'array' or jsonb_array_length(s->collection) > 5000 then return false; end if;
    ids := array[]::text[];
    for item in select value from jsonb_array_elements(s->collection) loop
      if jsonb_typeof(item) <> 'object' or not (item ?& array['id','note']) then return false; end if;
      foreach field in array array['id','note'] loop
        if jsonb_typeof(item->field) <> 'string' or length(item->>field) >= 20000 then return false; end if;
      end loop;
      if item->>'id' = any(ids) then return false; end if;
      ids := array_append(ids,item->>'id');
      if collection = 'decisions' then
        if not (item ? 'done') or item->>'id' !~ '^[0-8]$' or jsonb_typeof(item->'done') <> 'boolean' then return false; end if;
      else
        if not (item ?& array['room','name','price','status']) then return false; end if;
        if item->>'room' not in ('hall','newbath','oldbath','store','wc','room4','room3','kitchen') or jsonb_typeof(item->'room') <> 'string' then return false; end if;
        if jsonb_typeof(item->'name') <> 'string' or length(item->>'name') >= 20000 then return false; end if;
        if item->'price' <> 'null'::jsonb and (jsonb_typeof(item->'price') <> 'number' or (item->>'price')::numeric not between 0 and 10000000000) then return false; end if;
        if collection = 'tasks' then
          if not (item ?& array['who','priority']) then return false; end if;
          if item->>'status' not in ('todo','doing','done') or item->>'priority' not in ('must','later') or item->>'who' not in ('undecided','pro','self') then return false; end if;
          if jsonb_typeof(item->'status') <> 'string' or jsonb_typeof(item->'priority') <> 'string' or jsonb_typeof(item->'who') <> 'string' then return false; end if;
        else
          if not (item ?& array['url','unit','quantity']) then return false; end if;
          foreach field in array array['url','unit'] loop
            if jsonb_typeof(item->field) <> 'string' or length(item->>field) >= 20000 then return false; end if;
          end loop;
          if item->>'url' <> '' and item->>'url' !~* '^https?://' then return false; end if;
          if jsonb_typeof(item->'quantity') <> 'number' or (item->>'quantity')::numeric <= 0 or (item->>'quantity')::numeric > 100000000 then return false; end if;
          if jsonb_typeof(item->'status') <> 'string' or item->>'status' not in ('idea','selected','bought') then return false; end if;
        end if;
      end if;
    end loop;
  end loop;
  return jsonb_array_length(s->'decisions') = 9;
exception when others then return false;
end;
$$;
revoke all on function flatplan_private.valid_state(jsonb) from public, anon, authenticated;

create or replace function public.flatplan_read(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid link'; end if;
  select jsonb_build_object('state',p.state,'revision',p.revision) into result
    from flatplan_private.plans p
    where p.token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex');
  return result;
end;
$$;

create or replace function public.flatplan_write(p_token text, p_revision bigint, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hashed text; next_revision bigint;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid link'; end if;
  if p_revision is null or p_revision < 0 then raise exception 'Invalid revision'; end if;
  if p_state is null or octet_length(p_state::text) > 5000000 or not flatplan_private.valid_state(p_state) then raise exception 'Invalid plan'; end if;
  hashed := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if p_revision = 0 then
    insert into flatplan_private.plans(token_hash,state) values(hashed,p_state)
      on conflict do nothing returning revision into next_revision;
  else
    update flatplan_private.plans set state=p_state, revision=revision+1, updated_at=now()
      where token_hash=hashed and revision=p_revision returning revision into next_revision;
  end if;
  if next_revision is null then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'revision',next_revision);
end;
$$;
revoke all on function public.flatplan_read(text) from public, anon, authenticated;
revoke all on function public.flatplan_write(text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.flatplan_read(text) to anon;
grant execute on function public.flatplan_write(text,bigint,jsonb) to anon;
commit;
