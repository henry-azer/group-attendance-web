-- Group Attendance: schema + code-gated RPC functions.
--
-- Security model (no sign-in):
--   * RLS is enabled on every table with NO policies, and all table privileges are revoked
--     from anon/authenticated, so the browser (anon key) cannot touch tables directly.
--   * The browser calls only the SECURITY DEFINER RPCs below. Each takes a share code or an
--     admin code and checks it. EXECUTE is granted to anon/authenticated on those RPCs only;
--     internal helpers are not executable by them.
--   * Share code: 10 chars Crockford base32, stored plain (unique).
--     Admin code: 16 chars Crockford base32, stored as SHA-256 hex; returned plain only by
--     create_group.
--
-- Errors are raised as RAISE EXCEPTION '<code>' with one of:
--   not_found, invalid_input, duplicate_name, session_closed, not_started
--
-- Time: every function reads "now" via app_now(), which honours the transaction setting
-- app.now (used by tests; PostgREST clients cannot set it).
--
-- Idempotent: safe to re-run (create ... if not exists / create or replace).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 80),
  timezone        text not null,
  share_code      text not null unique,
  admin_code_hash text not null unique,
  created_at      timestamptz not null default now()
);

create table if not exists public.members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.groups(id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 60),
  active    boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at   timestamptz
);
create index if not exists members_group_idx on public.members(group_id);
-- Active member names are unique per group, case-insensitively.
create unique index if not exists members_active_name_uq on public.members(group_id, lower(name)) where active;

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  series_id  uuid not null,
  title      text not null check (char_length(title) between 1 and 80),
  location   text check (location is null or char_length(location) <= 120),
  kind       text not null check (kind in ('once', 'weekly')),
  starts_on  date not null,          -- once: the date; weekly: first date
  weekdays   smallint[],             -- weekly: 0=Sun..6=Sat
  start_time time not null,
  ends_on    date,                   -- inclusive last date
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint events_weekdays_ck check (
    (kind = 'once' and weekdays is null)
    or (kind = 'weekly' and weekdays is not null and cardinality(weekdays) between 1 and 7
        and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]))
);
create index if not exists events_group_idx on public.events(group_id);
create index if not exists events_series_idx on public.events(series_id);

create table if not exists public.responses (
  event_id          uuid not null references public.events(id) on delete cascade,
  occurrence_date   date not null,
  member_id         uuid not null references public.members(id) on delete cascade,
  status            text not null check (status in ('going', 'cant')),
  note              text check (note is null or char_length(note) <= 140),
  first_answered_at timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id, occurrence_date, member_id)
);
create index if not exists responses_member_idx on public.responses(member_id);

create table if not exists public.attendance (
  event_id        uuid not null references public.events(id) on delete cascade,
  occurrence_date date not null,
  member_id       uuid not null references public.members(id) on delete cascade,
  attended        boolean not null,
  marked_at       timestamptz not null default now(),
  primary key (event_id, occurrence_date, member_id)
);
create index if not exists attendance_member_idx on public.attendance(member_id);

create table if not exists public.skipped_occurrences (
  event_id        uuid not null references public.events(id) on delete cascade,
  occurrence_date date not null,
  reason          text check (reason is null or char_length(reason) <= 140),
  primary key (event_id, occurrence_date)
);

alter table public.groups              enable row level security;
alter table public.members             enable row level security;
alter table public.events              enable row level security;
alter table public.responses           enable row level security;
alter table public.attendance          enable row level security;
alter table public.skipped_occurrences enable row level security;

-- Defense in depth beyond RLS: Supabase's default privileges grant anon/authenticated
-- full table access; take it away.
revoke all on table public.groups, public.members, public.events, public.responses,
                    public.attendance, public.skipped_occurrences
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (NOT executable by anon/authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.app_now() returns timestamptz
language sql stable set search_path = public, extensions, pg_temp as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now())
$$;

-- n random Crockford base32 chars. 256 is a multiple of 32, so (byte & 31) is uniform.
create or replace function public.gen_code(n integer) returns text
language plpgsql volatile set search_path = public, extensions, pg_temp as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := extensions.gen_random_bytes(n);
  r text := '';
begin
  for i in 0 .. n - 1 loop
    r := r || substr(alphabet, (get_byte(b, i) & 31) + 1, 1);
  end loop;
  return r;
end $$;

-- Crockford decoding leniency: case-insensitive, O->0, I/L->1, ignore spaces and dashes.
create or replace function public.normalize_code(p text) returns text
language sql immutable set search_path = public, extensions, pg_temp as $$
  select translate(upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')), 'OIL', '011')
$$;

-- Trim and collapse internal whitespace. NULL stays NULL.
create or replace function public.clean_text(p text) returns text
language sql immutable set search_path = public, extensions, pg_temp as $$
  select btrim(regexp_replace(p, '\s+', ' ', 'g'))
$$;

create or replace function public.group_by_share(p_share text) returns public.groups
language plpgsql stable set search_path = public, extensions, pg_temp as $$
declare g public.groups;
begin
  select * into g from public.groups where share_code = public.normalize_code(p_share);
  if not found then raise exception 'not_found'; end if;
  return g;
end $$;

create or replace function public.group_by_admin(p_admin text) returns public.groups
language plpgsql stable set search_path = public, extensions, pg_temp as $$
declare g public.groups;
begin
  select * into g from public.groups
   where admin_code_hash = encode(extensions.digest(public.normalize_code(p_admin), 'sha256'), 'hex');
  if not found then raise exception 'not_found'; end if;
  return g;
end $$;

create or replace function public.local_today(tz text) returns date
language sql stable set search_path = public, extensions, pg_temp as $$
  select (public.app_now() at time zone tz)::date
$$;

-- Scheduled dates of an event within [p_from, p_to], bounded by starts_on/ends_on.
-- Skipped dates are excluded unless p_include_skipped.
create or replace function public.occurrence_dates(e public.events, p_from date, p_to date,
                                                   p_include_skipped boolean default false)
returns setof date
language sql stable set search_path = public, extensions, pg_temp as $$
  select g.d::date
    from generate_series(greatest(e.starts_on, p_from)::timestamp,
                         least(coalesce(e.ends_on, p_to), p_to)::timestamp,
                         interval '1 day') as g(d)
   where case when e.kind = 'once' then g.d::date = e.starts_on
              else extract(dow from g.d)::smallint = any(e.weekdays) end
     and (p_include_skipped or not exists (
           select 1 from public.skipped_occurrences s
            where s.event_id = e.id and s.occurrence_date = g.d::date))
   order by 1
$$;

-- First scheduled, non-skipped date whose start (in the group's timezone) is after now.
-- NULL for inactive events or when the series has ended.
create or replace function public.next_occurrence(e public.events) returns date
language plpgsql stable set search_path = public, extensions, pg_temp as $$
declare tz text; today date;
begin
  if e is null or not e.active then return null; end if;
  select timezone into tz from public.groups where id = e.group_id;
  today := public.local_today(tz);
  return (select d from public.occurrence_dates(e, today - 1, greatest(today + 800, e.starts_on)) as d
           where (d + e.start_time) at time zone tz > public.app_now()
           order by d limit 1);
end $$;

-- Last day an event row should run when it is ended or versioned today: yesterday, unless
-- today's occurrence has already started (then today, so its check-in stays reachable).
create or replace function public.end_date_for(e public.events) returns date
language plpgsql stable set search_path = public, extensions, pg_temp as $$
declare tz text; today date;
begin
  select timezone into tz from public.groups where id = e.group_id;
  today := public.local_today(tz);
  if exists (select 1 from public.occurrence_dates(e, today, today) as d
              where (d + e.start_time) at time zone tz <= public.app_now()) then
    return today;
  end if;
  return today - 1;
end $$;

create or replace function public.event_json(e public.events) returns jsonb
language sql stable set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'series_id', e.series_id, 'title', e.title, 'location', e.location,
    'kind', e.kind, 'starts_on', e.starts_on, 'weekdays', to_jsonb(e.weekdays),
    'start_time', to_char(e.start_time, 'HH24:MI'), 'ends_on', e.ends_on, 'active', e.active)
$$;

create or replace function public.member_json(m public.members) returns jsonb
language sql stable set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('id', m.id, 'name', m.name, 'active', m.active,
                            'joined_at', m.joined_at, 'left_at', m.left_at)
$$;

-- Session = {event, occurrence_date, starts_at, answers:[{member_id,status,note}]}.
-- p_date NULL => the event's next occurrence (may be NULL when none is upcoming).
-- Answers only include active members.
create or replace function public.session_json(e public.events, p_date date default null) returns jsonb
language plpgsql stable set search_path = public, extensions, pg_temp as $$
declare d date; tz text;
begin
  d := coalesce(p_date, public.next_occurrence(e));
  select timezone into tz from public.groups where id = e.group_id;
  return jsonb_build_object(
    'event', public.event_json(e),
    'occurrence_date', d,
    'starts_at', case when d is null then null else to_jsonb((d + e.start_time) at time zone tz) end,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', r.member_id, 'status', r.status, 'note', r.note)
                       order by r.first_answered_at, r.member_id)
        from public.responses r
        join public.members m on m.id = r.member_id and m.active
       where d is not null and r.event_id = e.id and r.occurrence_date = d), '[]'::jsonb));
end $$;

-- Sessions for every active event of a group, soonest first (no upcoming date last).
create or replace function public.group_sessions(p_group uuid) returns jsonb
language sql stable set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(s order by (s->>'starts_at')::timestamptz nulls last, s->'event'->>'title'), '[]'::jsonb)
    from (select public.session_json(e) as s
            from public.events e where e.group_id = p_group and e.active) x
$$;

-- Validate and write (or clear, when p_status is NULL) one answer.
-- Caller has already checked group/event/member ownership and status/note values.
create or replace function public.put_response(e public.events, p_date date, p_member uuid,
                                               p_status text, p_note text, p_next_only boolean)
returns void
language plpgsql volatile set search_path = public, extensions, pg_temp as $$
declare tz text;
begin
  select timezone into tz from public.groups where id = e.group_id;
  if p_date is null or not exists (select 1 from public.occurrence_dates(e, p_date, p_date)) then
    raise exception 'invalid_input';
  end if;
  if (p_date + e.start_time) at time zone tz <= public.app_now() then
    raise exception 'session_closed';
  end if;
  if p_next_only and p_date is distinct from public.next_occurrence(e) then
    raise exception 'invalid_input';
  end if;
  if p_status is null then
    delete from public.responses where event_id = e.id and occurrence_date = p_date and member_id = p_member;
  else
    insert into public.responses as r (event_id, occurrence_date, member_id, status, note, first_answered_at, updated_at)
    values (e.id, p_date, p_member, p_status, p_note, public.app_now(), public.app_now())
    on conflict (event_id, occurrence_date, member_id)
    do update set status = excluded.status, note = excluded.note, updated_at = excluded.updated_at;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create or replace function public.ping() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select 'ok'::text
$$;

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
  select array_agg(n order by ord) into v_names
    from (select public.clean_text(x) as n, ord from unnest(p_members) with ordinality as u(x, ord)) c
   where n <> '';
  if v_names is null or cardinality(v_names) = 0 then raise exception 'invalid_input'; end if;
  if exists (select 1 from unnest(v_names) n where char_length(n) > 60) then raise exception 'invalid_input'; end if;
  if (select count(distinct lower(n)) from unnest(v_names) n) <> cardinality(v_names) then
    raise exception 'duplicate_name';
  end if;

  loop
    v_share := public.gen_code(10);
    v_admin := public.gen_code(16);
    begin
      insert into public.groups (name, timezone, share_code, admin_code_hash, created_at)
      values (v_name, p_timezone, v_share, encode(extensions.digest(v_admin, 'sha256'), 'hex'), public.app_now())
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

create or replace function public.get_group_public(p_share text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare g public.groups := public.group_by_share(p_share);
begin
  return jsonb_build_object(
    'name', g.name,
    'timezone', g.timezone,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by lower(m.name), m.id)
                           from public.members m where m.group_id = g.id and m.active), '[]'::jsonb),
    'sessions', public.group_sessions(g.id));
end $$;

create or replace function public.submit_response(p_share text, p_event uuid, p_date date, p_member uuid,
                                                  p_status text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_share(p_share);
  e public.events;
  v_note text := nullif(public.clean_text(p_note), '');
begin
  select * into e from public.events where id = p_event and group_id = g.id and active;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from public.members where id = p_member and group_id = g.id and active) then
    raise exception 'not_found';
  end if;
  if p_status is null or p_status not in ('going', 'cant') then raise exception 'invalid_input'; end if;
  if char_length(v_note) > 140 then raise exception 'invalid_input'; end if;
  perform public.put_response(e, p_date, p_member, p_status, v_note, true);
  return public.session_json(e, p_date);
end $$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_group(p_admin text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare g public.groups := public.group_by_admin(p_admin);
begin
  return jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'timezone', g.timezone,
    'share_code', g.share_code,
    'members', coalesce((select jsonb_agg(public.member_json(m) order by m.active desc, lower(m.name), m.id)
                           from public.members m where m.group_id = g.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(public.event_json(e) order by e.created_at, e.id)
                          from public.events e where e.group_id = g.id), '[]'::jsonb),
    'sessions', public.group_sessions(g.id));
end $$;

-- p_timezone NULL keeps the current timezone.
create or replace function public.admin_rename_group(p_admin text, p_name text, p_timezone text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  v_name text := public.clean_text(p_name);
  v_tz text := coalesce(p_timezone, g.timezone);
begin
  if v_name is null or char_length(v_name) not between 1 and 80 then raise exception 'invalid_input'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'invalid_input'; end if;
  update public.groups set name = v_name, timezone = v_tz where id = g.id;
  return jsonb_build_object('name', v_name, 'timezone', v_tz);
end $$;

-- p_id NULL = add a member; otherwise rename that member.
create or replace function public.admin_upsert_member(p_admin text, p_id uuid, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  v_name text := public.clean_text(p_name);
  m public.members;
begin
  if v_name is null or char_length(v_name) not between 1 and 60 then raise exception 'invalid_input'; end if;
  if p_id is not null and not exists (select 1 from public.members where id = p_id and group_id = g.id) then
    raise exception 'not_found';
  end if;
  if exists (select 1 from public.members
              where group_id = g.id and active and lower(name) = lower(v_name)
                and id is distinct from p_id) then
    raise exception 'duplicate_name';
  end if;
  begin
    if p_id is null then
      insert into public.members (group_id, name, joined_at) values (g.id, v_name, public.app_now())
      returning * into m;
    else
      update public.members set name = v_name where id = p_id and group_id = g.id returning * into m;
    end if;
  exception when unique_violation then
    raise exception 'duplicate_name';
  end;
  return public.member_json(m);
end $$;

create or replace function public.admin_deactivate_member(p_admin text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare g public.groups := public.group_by_admin(p_admin); m public.members;
begin
  update public.members
     set active = false, left_at = coalesce(left_at, public.app_now())
   where id = p_id and group_id = g.id
  returning * into m;
  if not found then raise exception 'not_found'; end if;
  return public.member_json(m);
end $$;

-- p_event keys: title, location, kind, starts_on, weekdays, start_time, ends_on (+ id to edit).
-- Edits: a schedule change (kind, starts_on, weekdays or start_time) on an event that already
-- has responses or attendance ends the current row (ends_on = end_date_for, active = false)
-- and inserts a new row with the same series_id, starting no earlier than the day after the
-- old row's ends_on. Otherwise the row is edited in place.
-- 'active' in p_event is ignored; use admin_end_event to end an event.
create or replace function public.admin_upsert_event(p_admin text, p_event jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  v_id uuid;
  v_title text;
  v_location text;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_start_time time;
  v_ends_on date;
  old public.events;
  v_old_end date;
  e public.events;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'invalid_input'; end if;
  begin
    v_id := nullif(p_event->>'id', '')::uuid;
    v_title := public.clean_text(p_event->>'title');
    v_location := nullif(public.clean_text(p_event->>'location'), '');
    v_kind := p_event->>'kind';
    v_starts_on := (p_event->>'starts_on')::date;
    v_start_time := (p_event->>'start_time')::time;
    v_ends_on := nullif(p_event->>'ends_on', '')::date;
    if v_kind = 'weekly' then
      if jsonb_typeof(p_event->'weekdays') is distinct from 'array' then raise exception 'invalid_input'; end if;
      select array_agg(distinct x::smallint order by x::smallint) into v_weekdays
        from jsonb_array_elements_text(p_event->'weekdays') x;
    end if;
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range then
      raise exception 'invalid_input';
  end;

  if v_title is null or char_length(v_title) not between 1 and 80 then raise exception 'invalid_input'; end if;
  if char_length(v_location) > 120 then raise exception 'invalid_input'; end if;
  if v_kind is null or v_kind not in ('once', 'weekly') then raise exception 'invalid_input'; end if;
  if v_starts_on is null or v_start_time is null then raise exception 'invalid_input'; end if;
  if v_ends_on < v_starts_on then raise exception 'invalid_input'; end if;
  if v_kind = 'weekly' then
    if v_weekdays is null or cardinality(v_weekdays) = 0
       or exists (select 1 from unnest(v_weekdays) w where w not between 0 and 6) then
      raise exception 'invalid_input';
    end if;
  else
    v_weekdays := null;
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.events (id, group_id, series_id, title, location, kind, starts_on, weekdays,
                               start_time, ends_on, created_at)
    values (v_id, g.id, v_id, v_title, v_location, v_kind, v_starts_on, v_weekdays,
            v_start_time, v_ends_on, public.app_now())
    returning * into e;
    return public.event_json(e);
  end if;

  select * into old from public.events where id = v_id and group_id = g.id for update;
  if not found then raise exception 'not_found'; end if;
  if not old.active then raise exception 'invalid_input'; end if;

  if (old.kind is distinct from v_kind or old.starts_on is distinct from v_starts_on
      or old.weekdays is distinct from v_weekdays or old.start_time is distinct from v_start_time)
     and (exists (select 1 from public.responses where event_id = old.id)
          or exists (select 1 from public.attendance where event_id = old.id)) then
    v_old_end := least(coalesce(old.ends_on, public.end_date_for(old)), public.end_date_for(old));
    update public.events set ends_on = v_old_end, active = false where id = old.id;
    -- The new version starts after the old one ends, so no (series_id, date) is generated
    -- twice (the edit form usually resends the original starts_on).
    insert into public.events (group_id, series_id, title, location, kind, starts_on, weekdays,
                               start_time, ends_on, created_at)
    values (g.id, old.series_id, v_title, v_location, v_kind, greatest(v_starts_on, v_old_end + 1), v_weekdays,
            v_start_time, v_ends_on, public.app_now())
    returning * into e;
  else
    update public.events
       set title = v_title, location = v_location, kind = v_kind, starts_on = v_starts_on,
           weekdays = v_weekdays, start_time = v_start_time, ends_on = v_ends_on
     where id = old.id
    returning * into e;
  end if;
  return public.event_json(e);
end $$;

-- Ends an event: active = false, ends_on = end_date_for (yesterday, or today if today's
-- occurrence has already started). History is kept.
create or replace function public.admin_end_event(p_admin text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare g public.groups := public.group_by_admin(p_admin); e public.events; v_end date;
begin
  select * into e from public.events where id = p_id and group_id = g.id for update;
  if not found then raise exception 'not_found'; end if;
  v_end := public.end_date_for(e);
  update public.events
     set active = false, ends_on = least(coalesce(ends_on, v_end), v_end)
   where id = e.id
  returning * into e;
  return public.event_json(e);
end $$;

-- Skips one scheduled date (past or future). Re-skipping updates the reason.
create or replace function public.admin_skip_occurrence(p_admin text, p_event uuid, p_date date, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  e public.events;
  v_reason text := nullif(public.clean_text(p_reason), '');
begin
  select * into e from public.events where id = p_event and group_id = g.id;
  if not found then raise exception 'not_found'; end if;
  if char_length(v_reason) > 140 then raise exception 'invalid_input'; end if;
  if p_date is null or not exists (select 1 from public.occurrence_dates(e, p_date, p_date, true)) then
    raise exception 'invalid_input';
  end if;
  insert into public.skipped_occurrences (event_id, occurrence_date, reason)
  values (e.id, p_date, v_reason)
  on conflict (event_id, occurrence_date) do update set reason = excluded.reason;
  return jsonb_build_object('event_id', e.id, 'occurrence_date', p_date, 'skipped', true, 'reason', v_reason);
end $$;

create or replace function public.admin_unskip_occurrence(p_admin text, p_event uuid, p_date date) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare g public.groups := public.group_by_admin(p_admin);
begin
  if not exists (select 1 from public.events where id = p_event and group_id = g.id) then
    raise exception 'not_found';
  end if;
  delete from public.skipped_occurrences where event_id = p_event and occurrence_date = p_date;
  return jsonb_build_object('event_id', p_event, 'occurrence_date', p_date, 'skipped', false, 'reason', null);
end $$;

-- Admin fills in / corrects an answer for any upcoming (not started, not skipped) occurrence
-- of an active event. p_status NULL clears the member's answer. Returns that date's Session.
create or replace function public.admin_set_response(p_admin text, p_event uuid, p_date date, p_member uuid,
                                                     p_status text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  e public.events;
  v_note text := nullif(public.clean_text(p_note), '');
begin
  select * into e from public.events where id = p_event and group_id = g.id and active;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from public.members where id = p_member and group_id = g.id and active) then
    raise exception 'not_found';
  end if;
  if p_status is not null and p_status not in ('going', 'cant') then raise exception 'invalid_input'; end if;
  if char_length(v_note) > 140 then raise exception 'invalid_input'; end if;
  perform public.put_response(e, p_date, p_member, p_status, case when p_status is null then null else v_note end, false);
  return public.session_json(e, p_date);
end $$;

-- Replaces all attendance rows for one started occurrence. p_marks = [{member_id, attended}].
-- An empty array clears the session's marks (it becomes unchecked again).
create or replace function public.admin_mark_attendance(p_admin text, p_event uuid, p_date date, p_marks jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  e public.events;
  tz text := g.timezone;
  v_marks jsonb;
  v_ids uuid[];
  v_att boolean[];
begin
  select * into e from public.events where id = p_event and group_id = g.id;
  if not found then raise exception 'not_found'; end if;
  if p_date is null or not exists (select 1 from public.occurrence_dates(e, p_date, p_date)) then
    raise exception 'invalid_input';
  end if;
  if (p_date + e.start_time) at time zone tz > public.app_now() then raise exception 'not_started'; end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' then raise exception 'invalid_input'; end if;

  begin
    select coalesce(array_agg((x->>'member_id')::uuid order by ord), '{}'),
           coalesce(array_agg((x->>'attended')::boolean order by ord), '{}')
      into v_ids, v_att
      from jsonb_array_elements(p_marks) with ordinality as t(x, ord);
  exception when invalid_text_representation or cannot_coerce or invalid_parameter_value then
    raise exception 'invalid_input';
  end;
  if array_position(v_ids, null) is not null or array_position(v_att, null) is not null then
    raise exception 'invalid_input';
  end if;
  if (select count(distinct i) from unnest(v_ids) i) <> cardinality(v_ids) then raise exception 'invalid_input'; end if;
  if exists (select 1 from unnest(v_ids) i where not exists (
               select 1 from public.members m where m.id = i and m.group_id = g.id)) then
    raise exception 'not_found';
  end if;

  delete from public.attendance where event_id = e.id and occurrence_date = p_date;
  insert into public.attendance (event_id, occurrence_date, member_id, attended, marked_at)
  select e.id, p_date, k.i, k.a, public.app_now() from unnest(v_ids, v_att) as k(i, a);

  select coalesce(jsonb_agg(jsonb_build_object('member_id', a.member_id, 'attended', a.attended) order by a.member_id), '[]'::jsonb)
    into v_marks
    from public.attendance a where a.event_id = e.id and a.occurrence_date = p_date;
  return jsonb_build_object('event_id', e.id, 'occurrence_date', p_date, 'attendance', v_marks);
end $$;

-- History for insights. occurrences: every scheduled date of every event from starts_on (or
-- p_from) through the next upcoming one, including skipped dates (flagged). For events with
-- no upcoming date, only dates that have started are listed.
-- responses / attendance: all rows on or after p_from (all when NULL).
create or replace function public.admin_get_history(p_admin text, p_from date) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  tz text := g.timezone;
  v_from date := coalesce(p_from, '-infinity'::date);
  today date := public.local_today(g.timezone);
begin
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(public.member_json(m) order by m.active desc, lower(m.name), m.id)
                           from public.members m where m.group_id = g.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(public.event_json(e) order by e.created_at, e.id)
                          from public.events e where e.group_id = g.id), '[]'::jsonb),
    'occurrences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', e.id, 'series_id', e.series_id, 'occurrence_date', d,
               'starts_at', (d + e.start_time) at time zone tz,
               'skipped', exists (select 1 from public.skipped_occurrences s
                                   where s.event_id = e.id and s.occurrence_date = d),
               'checked', exists (select 1 from public.attendance a
                                   where a.event_id = e.id and a.occurrence_date = d))
             order by (d + e.start_time) at time zone tz, e.id)
        from public.events e
        cross join lateral (select public.next_occurrence(e) as nxt) n
        cross join lateral public.occurrence_dates(
                     e, coalesce(p_from, e.starts_on), coalesce(n.nxt, today + 1), true) as d
       where e.group_id = g.id
         and ((d + e.start_time) at time zone tz <= public.app_now() or d <= n.nxt)), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', r.event_id, 'occurrence_date', r.occurrence_date, 'member_id', r.member_id,
               'status', r.status, 'note', r.note,
               'first_answered_at', r.first_answered_at, 'updated_at', r.updated_at)
             order by r.occurrence_date, r.event_id, r.first_answered_at)
        from public.responses r join public.events e on e.id = r.event_id
       where e.group_id = g.id and r.occurrence_date >= v_from), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', a.event_id, 'occurrence_date', a.occurrence_date,
               'member_id', a.member_id, 'attended', a.attended)
             order by a.occurrence_date, a.event_id, a.member_id)
        from public.attendance a join public.events e on e.id = a.event_id
       where e.group_id = g.id and a.occurrence_date >= v_from), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Privileges: nothing by default, public RPCs only for anon/authenticated
-- ---------------------------------------------------------------------------

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'app_now', 'gen_code', 'normalize_code', 'clean_text', 'group_by_share', 'group_by_admin',
         'local_today', 'occurrence_dates', 'next_occurrence', 'end_date_for', 'event_json',
         'member_json', 'session_json', 'group_sessions', 'put_response',
         'ping', 'create_group', 'get_group_public', 'submit_response',
         'admin_get_group', 'admin_rename_group', 'admin_upsert_member', 'admin_deactivate_member',
         'admin_upsert_event', 'admin_end_event', 'admin_skip_occurrence', 'admin_unskip_occurrence',
         'admin_set_response', 'admin_mark_attendance', 'admin_get_history')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function
  public.ping(),
  public.create_group(text, text, text[]),
  public.get_group_public(text),
  public.submit_response(text, uuid, date, uuid, text, text),
  public.admin_get_group(text),
  public.admin_rename_group(text, text, text),
  public.admin_upsert_member(text, uuid, text),
  public.admin_deactivate_member(text, uuid),
  public.admin_upsert_event(text, jsonb),
  public.admin_end_event(text, uuid),
  public.admin_skip_occurrence(text, uuid, date, text),
  public.admin_unskip_occurrence(text, uuid, date),
  public.admin_set_response(text, uuid, date, uuid, text, text),
  public.admin_mark_attendance(text, uuid, date, jsonb),
  public.admin_get_history(text, date)
to anon, authenticated;

notify pgrst, 'reload schema';
