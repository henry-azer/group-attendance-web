-- Group Attendance: hardening (abuse caps, input bounds, schedule-edit answer carry-over).
--
-- Applied after 0001_init.sql. Idempotent: only `create ... if not exists` and
-- `create or replace function` (same signatures, SECURITY DEFINER and search_path as 0001).
--
-- Adds error code: rate_limited (create_group global throttle).
--
-- Caps (the anon key is public, so every RPC is reachable by anyone):
--   * create_group: at most 200 members; at most 30 groups created per minute (global).
--   * admin_upsert_member: at most 200 active members per group.
--   * admin_upsert_event: at most 20 active events per group; starts_on / ends_on within
--     2 years either side of the group's local today (unchanged values on edit are allowed).
--   * put_response (submit_response / admin_set_response): no dates more than 1 year ahead.

create index if not exists groups_created_at_idx on public.groups(created_at);

-- ---------------------------------------------------------------------------
-- put_response: also rejects occurrence dates more than a year ahead.
-- ---------------------------------------------------------------------------
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
  if p_date > (public.local_today(tz) + interval '1 year')::date then
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
-- create_group: member cap + crude global throttle.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- admin_upsert_member: at most 200 active members per group (adding only).
-- ---------------------------------------------------------------------------
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
  if p_id is null and (select count(*) from public.members where group_id = g.id and active) >= 200 then
    raise exception 'invalid_input';
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

-- ---------------------------------------------------------------------------
-- admin_upsert_event
-- p_event keys: title, location, kind, starts_on, weekdays, start_time, ends_on (+ id to edit).
-- Limits: 20 active events per group; starts_on / ends_on within 2 years of local today
-- (a value resent unchanged on edit is accepted); weekdays must be 0..6, no nulls.
-- Edits: a schedule change (kind, starts_on, weekdays or start_time) on an event that has
-- responses or attendance on or before the day the current row would end (v_old_end =
-- end_date_for: yesterday, or today if today's session has started) ends the current row and
-- inserts a new row with the same series_id, starting no earlier than v_old_end + 1. Answers
-- for dates after v_old_end move to the new row when that date is still scheduled, and are
-- deleted otherwise (skipped dates likewise). With no such history the row is edited in place
-- and answers after v_old_end for dates that are no longer scheduled are deleted.
-- 'active' in p_event is ignored; use admin_end_event to end an event.
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_event(p_admin text, p_event jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.groups := public.group_by_admin(p_admin);
  today date := public.local_today(g.timezone);
  v_min date := (today - interval '2 years')::date;
  v_max date := (today + interval '2 years')::date;
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
    if v_weekdays is null or cardinality(v_weekdays) = 0 or array_position(v_weekdays, null) is not null
       or exists (select 1 from unnest(v_weekdays) w where w not between 0 and 6) then
      raise exception 'invalid_input';
    end if;
  else
    v_weekdays := null;
  end if;

  if v_id is not null then
    select * into old from public.events where id = v_id and group_id = g.id for update;
    if not found then raise exception 'not_found'; end if;
    if not old.active then raise exception 'invalid_input'; end if;
  end if;

  if v_starts_on not between v_min and v_max and v_starts_on is distinct from old.starts_on then
    raise exception 'invalid_input';
  end if;
  if v_ends_on is not null and v_ends_on not between v_min and v_max and v_ends_on is distinct from old.ends_on then
    raise exception 'invalid_input';
  end if;

  if v_id is null then
    if (select count(*) from public.events where group_id = g.id and active) >= 20 then
      raise exception 'invalid_input';
    end if;
    v_id := gen_random_uuid();
    insert into public.events (id, group_id, series_id, title, location, kind, starts_on, weekdays,
                               start_time, ends_on, created_at)
    values (v_id, g.id, v_id, v_title, v_location, v_kind, v_starts_on, v_weekdays,
            v_start_time, v_ends_on, public.app_now())
    returning * into e;
    return public.event_json(e);
  end if;

  v_old_end := least(coalesce(old.ends_on, public.end_date_for(old)), public.end_date_for(old));

  if (old.kind is distinct from v_kind or old.starts_on is distinct from v_starts_on
      or old.weekdays is distinct from v_weekdays or old.start_time is distinct from v_start_time)
     and (exists (select 1 from public.responses where event_id = old.id and occurrence_date <= v_old_end)
          or exists (select 1 from public.attendance where event_id = old.id and occurrence_date <= v_old_end)) then
    update public.events set ends_on = v_old_end, active = false where id = old.id;
    -- The new version starts after the old one ends, so no (series_id, date) is generated
    -- twice (the edit form usually resends the original starts_on).
    insert into public.events (group_id, series_id, title, location, kind, starts_on, weekdays,
                               start_time, ends_on, created_at)
    values (g.id, old.series_id, v_title, v_location, v_kind, greatest(v_starts_on, v_old_end + 1), v_weekdays,
            v_start_time, v_ends_on, public.app_now())
    returning * into e;

    -- Carry upcoming answers (and skips) over to the new version where the date is still
    -- scheduled; drop the ones the new schedule no longer has.
    update public.responses r set event_id = e.id
     where r.event_id = old.id and r.occurrence_date > v_old_end
       and exists (select 1 from public.occurrence_dates(e, r.occurrence_date, r.occurrence_date, true));
    delete from public.responses where event_id = old.id and occurrence_date > v_old_end;
    update public.skipped_occurrences s set event_id = e.id
     where s.event_id = old.id and s.occurrence_date > v_old_end
       and exists (select 1 from public.occurrence_dates(e, s.occurrence_date, s.occurrence_date, true));
    delete from public.skipped_occurrences where event_id = old.id and occurrence_date > v_old_end;
  else
    update public.events
       set title = v_title, location = v_location, kind = v_kind, starts_on = v_starts_on,
           weekdays = v_weekdays, start_time = v_start_time, ends_on = v_ends_on
     where id = old.id
    returning * into e;
    -- Upcoming answers for dates the edited schedule no longer has would be unreachable; drop
    -- them (answers on or before v_old_end are history and stay).
    delete from public.responses r
     where r.event_id = e.id and r.occurrence_date > v_old_end
       and not exists (select 1 from public.occurrence_dates(e, r.occurrence_date, r.occurrence_date, true));
  end if;
  return public.event_json(e);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges for the replaced functions (create or replace keeps ACLs; re-assert anyway).
-- ---------------------------------------------------------------------------
revoke all on function public.put_response(public.events, date, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.create_group(text, text, text[]),
                       public.admin_upsert_member(text, uuid, text),
                       public.admin_upsert_event(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_group(text, text, text[]),
                          public.admin_upsert_member(text, uuid, text),
                          public.admin_upsert_event(text, jsonb)
  to anon, authenticated;

notify pgrst, 'reload schema';
