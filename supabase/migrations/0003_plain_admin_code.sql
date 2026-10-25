-- Admin codes are stored in plain text (product decision, 2026-10-25), replacing the SHA-256
-- hash used since 0001.
--
-- A hash can't be reversed, so groups created before this migration still hold only
-- admin_code_hash. Each one converts the first time its admin uses the code: group_by_admin
-- finds it by hash, writes the plain code and clears the hash. New groups never get a hash.
--
-- That lazy write happens inside admin lookups, so the two read-only admin RPCs (the admin
-- login path goes through admin_get_group) are made VOLATILE.
--
-- Idempotent: safe to re-run.

alter table public.groups add column if not exists admin_code text unique;
alter table public.groups alter column admin_code_hash drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_admin_code_present') then
    alter table public.groups add constraint groups_admin_code_present
      check (admin_code is not null or admin_code_hash is not null);
  end if;
end $$;

create or replace function public.group_by_admin(p_admin text) returns public.groups
language plpgsql volatile set search_path = public, extensions, pg_temp as $$
declare
  g public.groups;
  v_code text := public.normalize_code(p_admin);
begin
  select * into g from public.groups where admin_code = v_code;
  if found then return g; end if;

  -- Legacy group (pre-0003): matched by hash, converted to the plain code on first use.
  update public.groups
     set admin_code = v_code, admin_code_hash = null
   where admin_code is null
     and admin_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
  returning * into g;
  if not found then raise exception 'not_found'; end if;
  return g;
end $$;

alter function public.admin_get_group(text) volatile;
alter function public.admin_get_history(text, date) volatile;

-- create_group: unchanged from 0002 except the admin code is stored plain.
create or replace function public.create_group(p_name text, p_timezone text, p_members text[]) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_name text := public.clean_text(p_name);
  v_names text[];
  v_share text;
  v_admin text;
  v_group uuid;
  v_tries int := 0;
begin
  if v_name is null or char_length(v_name) not between 1 and 80 then raise exception 'invalid_input'; end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_input';
  end if;
  if cardinality(p_members) > 200 then raise exception 'invalid_input'; end if;
  select array_agg(n order by ord) into v_names
    from (select public.clean_text(x) as n, ord from unnest(p_members) with ordinality as u(x, ord)) c
   where n <> '';
  if v_names is null or cardinality(v_names) = 0 then raise exception 'invalid_input'; end if;
  if exists (select 1 from unnest(v_names) n where char_length(n) > 60) then raise exception 'invalid_input'; end if;
  if (select count(distinct lower(n)) from unnest(v_names) n) <> cardinality(v_names) then
    raise exception 'duplicate_name';
  end if;
  if (select count(*) from public.groups
       where created_at > public.app_now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited';
  end if;

  loop
    v_share := public.gen_code(10);
    v_admin := public.gen_code(16);
    begin
      insert into public.groups (name, timezone, share_code, admin_code, created_at)
      values (v_name, p_timezone, v_share, v_admin, public.app_now())
      returning id into v_group;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries >= 5 then raise; end if;
    end;
  end loop;

  insert into public.members (group_id, name, joined_at)
  select v_group, n, public.app_now() from unnest(v_names) n;

  return jsonb_build_object('share_code', v_share, 'admin_code', v_admin);
end $$;
