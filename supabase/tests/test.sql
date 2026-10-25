-- Group Attendance DB tests. Runs in one transaction and ROLLs BACK, so it leaves no rows.
-- Every check raises 'FAIL: ...' on mismatch; with ON_ERROR_STOP=1 psql exits non-zero.
-- Time is controlled with set_config('app.now', ..., true) (read by app_now()).
-- Shared values between DO blocks are passed through transaction-local GUCs ('t.*').
-- Dates are in November 2026 (Africa/Cairo = UTC+2, no DST). 2026-11-04 is a Wednesday,
-- 2026-11-06 / 13 / 20 are Fridays.

\set QUIET on
\set ON_ERROR_STOP on
begin;

create function pg_temp.expect_err(p_sql text, p_code text, p_label text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % expected error % but succeeded', p_label, p_code;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm <> p_code then
    raise exception 'FAIL: % expected error % but got %', p_label, p_code, sqlerrm;
  end if;
end $$;

create function pg_temp.ok(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- anon cannot select tables
-- ---------------------------------------------------------------------------
set local role anon;
do $$
declare t text;
begin
  foreach t in array array['groups','members','events','responses','attendance','skipped_occurrences'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon could select from %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.groups(name, timezone, share_code, admin_code_hash) values ('x','UTC','x','x');
    raise exception 'FAIL: anon could insert into groups';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- anon can execute only the public RPCs, not the internal helpers
do $$
declare f text;
begin
  foreach f in array array[
    'public.ping()',
    'public.create_group(text,text,text[])',
    'public.get_group_public(text)',
    'public.submit_response(text,uuid,date,uuid,text,text)',
    'public.admin_get_group(text)',
    'public.admin_rename_group(text,text,text)',
    'public.admin_upsert_member(text,uuid,text)',
    'public.admin_deactivate_member(text,uuid)',
    'public.admin_upsert_event(text,jsonb)',
    'public.admin_end_event(text,uuid)',
    'public.admin_skip_occurrence(text,uuid,date,text)',
    'public.admin_unskip_occurrence(text,uuid,date)',
    'public.admin_set_response(text,uuid,date,uuid,text,text)',
    'public.admin_mark_attendance(text,uuid,date,jsonb)',
    'public.admin_get_history(text,date)'] loop
    perform pg_temp.ok(has_function_privilege('anon', f, 'execute'), 'anon should execute ' || f);
    perform pg_temp.ok(has_function_privilege('authenticated', f, 'execute'), 'authenticated should execute ' || f);
  end loop;
  foreach f in array array[
    'public.app_now()', 'public.gen_code(integer)', 'public.normalize_code(text)',
    'public.clean_text(text)', 'public.group_by_share(text)', 'public.group_by_admin(text)',
    'public.local_today(text)', 'public.occurrence_dates(public.events,date,date,boolean)',
    'public.next_occurrence(public.events)', 'public.event_json(public.events)',
    'public.member_json(public.members)', 'public.session_json(public.events,date)',
    'public.group_sessions(uuid)', 'public.end_date_for(public.events)',
    'public.put_response(public.events,date,uuid,text,text,boolean)'] loop
    perform pg_temp.ok(not has_function_privilege('anon', f, 'execute'), 'anon must not execute ' || f);
    perform pg_temp.ok(not has_function_privilege('authenticated', f, 'execute'), 'authenticated must not execute ' || f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- create_group returns 10/16-char codes and stores hash only (called as anon)
-- ---------------------------------------------------------------------------
set local role anon;
do $$
declare r jsonb;
begin
  perform pg_temp.ok(public.ping() = 'ok', 'ping returns ok');
  r := public.create_group('  Friday   football ', 'Africa/Cairo', array['Omar', 'Ali', 'Sara']);
  perform pg_temp.ok(r->>'share_code' ~ '^[0-9A-HJKMNP-TV-Z]{10}$', 'share_code is 10 Crockford chars: ' || r::text);
  perform pg_temp.ok(r->>'admin_code' ~ '^[0-9A-HJKMNP-TV-Z]{16}$', 'admin_code is 16 Crockford chars: ' || r::text);
  perform set_config('t.share', r->>'share_code', true);
  perform set_config('t.admin', r->>'admin_code', true);
  -- anon can read its own group through the RPC
  r := public.get_group_public(r->>'share_code');
  perform pg_temp.ok(r->>'name' = 'Friday football', 'group name trimmed/collapsed: ' || (r->>'name'));
  perform pg_temp.ok(jsonb_array_length(r->'members') = 3, 'three members');
end $$;
reset role;

do $$
declare g public.groups; adm text := current_setting('t.admin');
begin
  select * into g from public.groups where share_code = current_setting('t.share');
  perform pg_temp.ok(g.admin_code = adm, 'admin code stored plain');
  perform pg_temp.ok(g.admin_code_hash is null, 'new groups store no admin code hash');
  perform pg_temp.ok(not exists (select 1 from public.members m where m.group_id = g.id and position(adm in row_to_json(m)::text) > 0),
                        'plain admin code not stored in members');
  perform set_config('t.gid', g.id::text, true);
  -- codes are case/lookalike tolerant
  perform pg_temp.ok(public.get_group_public(lower(g.share_code))->>'name' = 'Friday football', 'share code lookup is case-insensitive');
  perform pg_temp.ok(public.admin_get_group(lower(adm))->>'share_code' = g.share_code, 'admin lookup returns share code');
end $$;

-- legacy hashed admin code converts to plain on first use
do $$
declare g public.groups; legacy text := '7K3P9QZM2XVB4N6R';
begin
  insert into public.groups (name, timezone, share_code, admin_code_hash)
  values ('Legacy', 'UTC', 'LEGACY0001', encode(extensions.digest(legacy, 'sha256'), 'hex'));
  perform pg_temp.ok(public.admin_get_group(lower(legacy))->>'name' = 'Legacy', 'legacy hashed code still opens the group');
  select * into g from public.groups where share_code = 'LEGACY0001';
  perform pg_temp.ok(g.admin_code = legacy and g.admin_code_hash is null, 'legacy code converted to plain, hash cleared');
  perform pg_temp.ok(public.admin_get_group(legacy)->>'name' = 'Legacy', 'converted code opens the group');
end $$;

-- ---------------------------------------------------------------------------
-- create_group cleans names
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; names text[];
begin
  perform pg_temp.expect_err($q$select public.create_group('Club', 'Africa/Cairo', array[' Omar','omar','',' Ali '])$q$,
                             'duplicate_name', 'case-insensitive duplicate member names');
  r := public.create_group('Club', 'Africa/Cairo', array[' Omar','',' Ali ']);
  select array_agg(m->>'name' order by m->>'name') into names
    from jsonb_array_elements(public.get_group_public(r->>'share_code')->'members') m;
  perform pg_temp.ok(names = array['Ali','Omar'], 'cleaned members are Ali, Omar: ' || names::text);
  perform pg_temp.expect_err($q$select public.create_group('Club', 'Africa/Cairo', array['', '  '])$q$, 'invalid_input', 'no members');
  perform pg_temp.expect_err($q$select public.create_group('Club', 'Africa/Cairo', null)$q$, 'invalid_input', 'null members');
  perform pg_temp.expect_err($q$select public.create_group('   ', 'Africa/Cairo', array['A'])$q$, 'invalid_input', 'blank group name');
  perform pg_temp.expect_err(format('select public.create_group(%L, %L, array[%L])', repeat('x', 81), 'UTC', 'A'), 'invalid_input', 'group name > 80');
  perform pg_temp.expect_err($q$select public.create_group('Club', 'Mars/Olympus', array['A'])$q$, 'invalid_input', 'unknown timezone');
  perform pg_temp.expect_err(format('select public.create_group(%L, %L, array[%L])', 'Club', 'UTC', repeat('n', 61)), 'invalid_input', 'member name > 60');
end $$;

-- ---------------------------------------------------------------------------
-- weekly next occurrence (Fri weekly, local Wed -> this Fri)
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); e jsonb; s jsonb;
begin
  perform set_config('app.now', '2026-11-04 12:00:00+02', true);
  e := public.admin_upsert_event(adm, jsonb_build_object(
         'title', 'Football', 'location', 'Pitch 3', 'kind', 'weekly',
         'starts_on', '2026-10-01', 'weekdays', jsonb_build_array(5), 'start_time', '19:00'));
  perform pg_temp.ok((e->>'id') = (e->>'series_id'), 'new event series_id = id');
  perform pg_temp.ok(e->>'start_time' = '19:00' and e->'weekdays' = '[5]'::jsonb and (e->>'active')::boolean, 'event json shape: ' || e::text);
  perform set_config('t.ev', e->>'id', true);
  s := public.get_group_public(current_setting('t.share'))->'sessions'->0;
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-06', 'next occurrence is Fri 2026-11-06: ' || s::text);
  perform pg_temp.ok((s->>'starts_at')::timestamptz = '2026-11-06 17:00:00+00', 'starts_at is 19:00 Cairo');
  perform pg_temp.ok(s->'answers' = '[]'::jsonb, 'no answers yet');
  -- once event: today, later today -> today
  e := public.admin_upsert_event(adm, jsonb_build_object(
         'title', 'Dinner', 'kind', 'once', 'starts_on', '2026-11-04', 'start_time', '20:30'));
  perform pg_temp.ok(e->'weekdays' = 'null'::jsonb and e->'location' = 'null'::jsonb, 'once event has null weekdays/location');
  perform set_config('t.once', e->>'id', true);
  s := public.session_json((select ev from public.events ev where ev.id = (e->>'id')::uuid));
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-04', 'once event later today is upcoming');
  -- event validation
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"weekly","starts_on":"2026-11-01","weekdays":[],"start_time":"19:00"}')$q$, adm), 'invalid_input', 'weekly with no weekdays');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"weekly","starts_on":"2026-11-01","weekdays":[7],"start_time":"19:00"}')$q$, adm), 'invalid_input', 'weekday out of range');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"daily","starts_on":"2026-11-01","start_time":"19:00"}')$q$, adm), 'invalid_input', 'bad kind');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"once","starts_on":"not-a-date","start_time":"19:00"}')$q$, adm), 'invalid_input', 'bad date');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":" ","kind":"once","starts_on":"2026-11-01","start_time":"19:00"}')$q$, adm), 'invalid_input', 'blank title');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"once","starts_on":"2026-11-05","start_time":"19:00","ends_on":"2026-11-01"}')$q$, adm), 'invalid_input', 'ends_on before starts_on');
end $$;

-- ---------------------------------------------------------------------------
-- note over 140 -> invalid_input (and other submit validation)
-- ---------------------------------------------------------------------------
do $$
declare sh text := current_setting('t.share'); ev text := current_setting('t.ev'); omar text; s jsonb;
begin
  select m.id::text into omar from public.members m where m.group_id = current_setting('t.gid')::uuid and m.name = 'Omar';
  perform set_config('t.omar', omar, true);
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, %L)', sh, ev, '2026-11-06', omar, 'going', repeat('n', 141)),
                             'invalid_input', 'note over 140');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, ev, '2026-11-06', omar, 'maybe'),
                             'invalid_input', 'bad status');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, ev, '2026-11-13', omar, 'going'),
                             'invalid_input', 'future date that is not the next occurrence');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, ev, '2026-11-05', omar, 'going'),
                             'invalid_input', 'date that is not scheduled');
  s := public.submit_response(sh, ev::uuid, '2026-11-06', omar::uuid, 'going', repeat('n', 140));
  perform pg_temp.ok(s->'answers'->0->>'status' = 'going' and length(s->'answers'->0->>'note') = 140, 'note of 140 accepted');
end $$;

-- ---------------------------------------------------------------------------
-- rolls past started session (local Fri 20:00, start 19:00 -> next Fri; old date -> session_closed)
-- ---------------------------------------------------------------------------
do $$
declare sh text := current_setting('t.share'); ev uuid := current_setting('t.ev')::uuid; omar uuid := current_setting('t.omar')::uuid;
        s jsonb; first_at timestamptz; r public.responses;
begin
  -- upsert keeps first_answered_at, bumps updated_at
  select * into r from public.responses where event_id = ev and member_id = omar;
  first_at := r.first_answered_at;
  perform set_config('app.now', '2026-11-05 09:00:00+02', true);
  s := public.submit_response(sh, ev, '2026-11-06', omar, 'cant', '  ');
  select * into r from public.responses where event_id = ev and member_id = omar;
  perform pg_temp.ok(r.status = 'cant' and r.note is null, 'answer changed, blank note -> null');
  perform pg_temp.ok(r.first_answered_at = first_at and r.updated_at = '2026-11-05 09:00:00+02', 'first_answered_at kept, updated_at bumped');
  perform pg_temp.ok((select count(*) from public.responses where event_id = ev) = 1, 'upsert did not duplicate');

  perform set_config('app.now', '2026-11-06 20:00:00+02', true);
  s := public.get_group_public(sh)->'sessions'->0;
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-13', 'after start rolls to next Fri: ' || s::text);
  perform pg_temp.ok(s->'answers' = '[]'::jsonb, 'new session starts with no answers');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, ev, '2026-11-06', omar, 'going'),
                             'session_closed', 'submit for started session');
  perform pg_temp.expect_err(format('select public.admin_set_response(%L, %L, %L, %L, %L, null)', current_setting('t.admin'), ev, '2026-11-06', omar, 'going'),
                             'session_closed', 'admin_set_response for started session');
  s := public.submit_response(sh, ev, '2026-11-13', omar, 'going', null);
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-13' and jsonb_array_length(s->'answers') = 1, 'answer for next Fri accepted');
  -- exactly at start time is started
  perform set_config('app.now', '2026-11-13 19:00:00+02', true);
  perform pg_temp.ok(public.get_group_public(sh)->'sessions'->0->>'occurrence_date' = '2026-11-20', 'start == now counts as started');
end $$;

-- ---------------------------------------------------------------------------
-- uses group timezone (Africa/Cairo vs UTC)
-- ---------------------------------------------------------------------------
do $$
declare cairo_adm text := current_setting('t.admin'); utc jsonb; s jsonb;
begin
  -- 18:30 UTC = 20:30 Cairo: Cairo's 19:00 session has started, UTC's has not.
  perform set_config('app.now', '2026-11-06 18:30:00+00', true);
  utc := public.create_group('UTC club', 'UTC', array['Zed']);
  perform public.admin_upsert_event(utc->>'admin_code', jsonb_build_object(
    'title', 'Football', 'kind', 'weekly', 'starts_on', '2026-10-01', 'weekdays', jsonb_build_array(5), 'start_time', '19:00'));
  s := public.get_group_public(utc->>'share_code')->'sessions'->0;
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-06', 'UTC group: Fri 19:00 UTC not started yet');
  perform pg_temp.ok((s->>'starts_at')::timestamptz = '2026-11-06 19:00:00+00', 'UTC starts_at');
  s := public.get_group_public(current_setting('t.share'))->'sessions'->0;
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-13', 'Cairo group: Fri 19:00 Cairo already started');
  -- local_today follows the group timezone: Thu 23:30 UTC is Fri 01:30 in Cairo
  perform set_config('app.now', '2026-11-05 23:30:00+00', true);
  perform pg_temp.ok(public.local_today('Africa/Cairo') = '2026-11-06' and public.local_today('UTC') = '2026-11-05', 'local_today uses tz');
end $$;

-- ---------------------------------------------------------------------------
-- skip moves next occurrence
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); sh text := current_setting('t.share'); ev uuid := current_setting('t.ev')::uuid;
        r jsonb; s jsonb; h jsonb;
begin
  perform set_config('app.now', '2026-11-18 12:00:00+02', true);  -- Wed; next is Fri 11-20
  perform pg_temp.ok(public.get_group_public(sh)->'sessions'->0->>'occurrence_date' = '2026-11-20', 'before skip: 11-20');
  r := public.admin_skip_occurrence(adm, ev, '2026-11-20', ' Holiday ');
  perform pg_temp.ok((r->>'skipped')::boolean and r->>'reason' = 'Holiday', 'skip result: ' || r::text);
  s := public.get_group_public(sh)->'sessions'->0;
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-27', 'after skip: 11-27, got ' || coalesce(s->>'occurrence_date', 'null'));
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, ev, '2026-11-20', current_setting('t.omar'), 'going'),
                             'invalid_input', 'submit for skipped date');
  perform pg_temp.expect_err(format('select public.admin_skip_occurrence(%L, %L, %L, null)', adm, ev, '2026-11-19'),
                             'invalid_input', 'skip a date that is not scheduled');
  -- history lists the skipped date, flagged
  h := public.admin_get_history(adm, '2026-11-01');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                where o->>'event_id' = ev::text and o->>'occurrence_date' = '2026-11-20' and (o->>'skipped')::boolean),
                        'history lists skipped 11-20 flagged: ' || (h->'occurrences')::text);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                where o->>'event_id' = ev::text and o->>'occurrence_date' = '2026-11-27' and not (o->>'skipped')::boolean),
                        'history includes the next upcoming 11-27');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                    where o->>'event_id' = ev::text and o->>'occurrence_date' > '2026-11-27'),
                        'history stops at next upcoming');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                    where o->>'event_id' = ev::text and o->>'occurrence_date' < '2026-11-01'),
                        'history respects p_from');
  r := public.admin_unskip_occurrence(adm, ev, '2026-11-20');
  perform pg_temp.ok(not (r->>'skipped')::boolean, 'unskip result');
  perform pg_temp.ok(public.get_group_public(sh)->'sessions'->0->>'occurrence_date' = '2026-11-20', 'after unskip: 11-20');
end $$;

-- ---------------------------------------------------------------------------
-- mark_attendance before start -> not_started
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); ev uuid := current_setting('t.ev')::uuid; omar uuid := current_setting('t.omar')::uuid;
        ali uuid; r jsonb; h jsonb;
begin
  perform set_config('app.now', '2026-11-18 12:00:00+02', true);
  select id into ali from public.members where group_id = current_setting('t.gid')::uuid and name = 'Ali';
  perform pg_temp.expect_err(format($q$select public.admin_mark_attendance(%L, %L, %L, %L::jsonb)$q$, adm, ev, '2026-11-20',
                                    jsonb_build_array(jsonb_build_object('member_id', omar, 'attended', true))),
                             'not_started', 'mark attendance before start');
  r := public.admin_mark_attendance(adm, ev, '2026-11-13', jsonb_build_array(
         jsonb_build_object('member_id', omar, 'attended', true), jsonb_build_object('member_id', ali, 'attended', false)));
  perform pg_temp.ok(jsonb_array_length(r->'attendance') = 2, 'two marks saved');
  -- replaces the session's rows
  r := public.admin_mark_attendance(adm, ev, '2026-11-13', jsonb_build_array(jsonb_build_object('member_id', ali, 'attended', true)));
  perform pg_temp.ok((select count(*) from public.attendance where event_id = ev and occurrence_date = '2026-11-13') = 1, 'marks replaced');
  perform pg_temp.ok((select attended from public.attendance where event_id = ev and member_id = ali), 'ali attended');
  perform pg_temp.expect_err(format($q$select public.admin_mark_attendance(%L, %L, %L, %L::jsonb)$q$, adm, ev, '2026-11-13',
                                    jsonb_build_array(jsonb_build_object('member_id', gen_random_uuid(), 'attended', true))),
                             'not_found', 'mark unknown member');
  perform pg_temp.expect_err(format($q$select public.admin_mark_attendance(%L, %L, %L, %L::jsonb)$q$, adm, ev, '2026-11-13', '{"a":1}'),
                             'invalid_input', 'marks not an array');
  h := public.admin_get_history(adm, null);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                where o->>'event_id' = ev::text and o->>'occurrence_date' = '2026-11-13' and (o->>'checked')::boolean),
                        'history: 11-13 checked');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                where o->>'event_id' = ev::text and o->>'occurrence_date' = '2026-11-06' and not (o->>'checked')::boolean),
                        'history: 11-06 unchecked');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'occurrences') o
                                where o->>'event_id' = ev::text and o->>'occurrence_date' = '2026-10-02'),
                        'history with null p_from starts at starts_on');
  perform pg_temp.ok(jsonb_array_length(h->'attendance') = 1 and jsonb_array_length(h->'members') = 3, 'history attendance/members');
end $$;

-- ---------------------------------------------------------------------------
-- admin_set_response: fills, corrects, clears with null status
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); ev uuid := current_setting('t.ev')::uuid; ali uuid; s jsonb;
begin
  perform set_config('app.now', '2026-11-18 12:00:00+02', true);
  select id into ali from public.members where group_id = current_setting('t.gid')::uuid and name = 'Ali';
  s := public.admin_set_response(adm, ev, '2026-11-27', ali, 'cant', 'Away');
  perform pg_temp.ok(s->>'occurrence_date' = '2026-11-27' and s->'answers'->0->>'note' = 'Away', 'admin can answer a later future date');
  s := public.admin_set_response(adm, ev, '2026-11-27', ali, null, null);
  perform pg_temp.ok(s->'answers' = '[]'::jsonb, 'null status clears the answer');
end $$;

-- ---------------------------------------------------------------------------
-- members: upsert, duplicates, deactivate
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); sh text := current_setting('t.share'); m jsonb; sara uuid;
begin
  perform set_config('app.now', '2026-11-18 12:00:00+02', true);
  perform pg_temp.expect_err(format('select public.admin_upsert_member(%L, null, %L)', adm, ' omar '), 'duplicate_name', 'duplicate new member');
  m := public.admin_upsert_member(adm, null, '  Nour  ');
  perform pg_temp.ok(m->>'name' = 'Nour' and (m->>'active')::boolean and m->'left_at' = 'null'::jsonb, 'new member json: ' || m::text);
  m := public.admin_upsert_member(adm, (m->>'id')::uuid, 'Nour A.');
  perform pg_temp.ok(m->>'name' = 'Nour A.', 'rename member');
  perform pg_temp.expect_err(format('select public.admin_upsert_member(%L, %L, %L)', adm, m->>'id', 'Ali'), 'duplicate_name', 'rename to existing name');
  select id into sara from public.members where group_id = current_setting('t.gid')::uuid and name = 'Sara';
  m := public.admin_deactivate_member(adm, sara);
  perform pg_temp.ok(not (m->>'active')::boolean and (m->>'left_at')::timestamptz = '2026-11-18 10:00:00+00', 'deactivated: ' || m::text);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.get_group_public(sh)->'members') x where x->>'id' = sara::text),
                        'inactive member hidden from public');
  perform pg_temp.ok(jsonb_array_length(public.admin_get_group(adm)->'members') = 4, 'admin sees all 4 members');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, current_setting('t.ev'), '2026-11-20', sara, 'going'),
                             'not_found', 'inactive member cannot answer');
  -- name of an inactive member can be reused
  m := public.admin_upsert_member(adm, null, 'Sara');
  perform pg_temp.ok((m->>'active')::boolean, 're-add Sara as a new member');
  -- rename group
  m := public.admin_rename_group(adm, ' Thursday  football ', null);
  perform pg_temp.ok(m->>'name' = 'Thursday football' and m->>'timezone' = 'Africa/Cairo', 'rename group keeps tz: ' || m::text);
  perform pg_temp.expect_err(format('select public.admin_rename_group(%L, %L, %L)', adm, 'X', 'Nowhere/Land'), 'invalid_input', 'rename with bad tz');
end $$;

-- ---------------------------------------------------------------------------
-- ends_on stops series (occurrence_date null)
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); e jsonb; s jsonb;
begin
  perform set_config('app.now', '2026-11-18 12:00:00+02', true);
  e := public.admin_upsert_event(adm, jsonb_build_object(
         'title', 'Yoga', 'kind', 'weekly', 'starts_on', '2026-10-01', 'weekdays', jsonb_build_array(1, 3), 'start_time', '08:00'));
  perform pg_temp.ok(e->'weekdays' = '[1, 3]'::jsonb, 'multiple weekdays');
  e := public.admin_upsert_event(adm, (e - 'id' - 'series_id' - 'active') || jsonb_build_object('id', e->>'id', 'ends_on', '2026-11-15'));
  perform pg_temp.ok(e->>'ends_on' = '2026-11-15', 'ends_on edited in place');
  s := (select x from jsonb_array_elements(public.get_group_public(current_setting('t.share'))->'sessions') x
        where x->'event'->>'id' = e->>'id');
  perform pg_temp.ok(s is not null and s->'occurrence_date' = 'null'::jsonb and s->'starts_at' = 'null'::jsonb,
                        'ended series has null occurrence: ' || coalesce(s::text, 'missing'));
  -- admin_end_event deactivates and removes it from public sessions
  e := public.admin_end_event(adm, current_setting('t.once')::uuid);
  perform pg_temp.ok(not (e->>'active')::boolean, 'end_event sets active=false');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.get_group_public(current_setting('t.share'))->'sessions') x
                                    where x->'event'->>'id' = current_setting('t.once')), 'ended event not in public sessions');
end $$;

-- ---------------------------------------------------------------------------
-- schedule edit versions series
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); ev uuid := current_setting('t.ev')::uuid; old public.events; e jsonb; h jsonb; ids text[];
        fresh jsonb;
begin
  perform set_config('app.now', '2026-11-18 12:00:00+02', true);
  -- title-only edit stays in place even with answers
  e := public.admin_upsert_event(adm, jsonb_build_object('id', ev, 'title', 'Football!', 'location', 'Pitch 3', 'kind', 'weekly',
         'starts_on', '2026-10-01', 'weekdays', jsonb_build_array(5), 'start_time', '19:00'));
  perform pg_temp.ok(e->>'id' = ev::text and e->>'title' = 'Football!', 'title edit in place');
  -- schedule edit with answers -> new version
  e := public.admin_upsert_event(adm, jsonb_build_object('id', ev, 'title', 'Football', 'location', 'Pitch 3', 'kind', 'weekly',
         'starts_on', '2026-11-18', 'weekdays', jsonb_build_array(5), 'start_time', '18:00'));
  select * into old from public.events where id = ev;
  perform pg_temp.ok(e->>'id' <> ev::text, 'schedule edit inserted a new row');
  perform pg_temp.ok(e->>'series_id' = old.series_id::text, 'same series_id');
  perform pg_temp.ok(old.ends_on = '2026-11-17' and not old.active, 'old row ended yesterday: ' || coalesce(old.ends_on::text, 'null'));
  perform pg_temp.ok(e->>'start_time' = '18:00' and e->'ends_on' = 'null'::jsonb and (e->>'active')::boolean, 'new row values');
  select array_agg(x->'event'->>'id') into ids from jsonb_array_elements(public.get_group_public(current_setting('t.share'))->'sessions') x;
  perform pg_temp.ok(e->>'id' = any(ids) and not (ev::text = any(ids)), 'public shows only the new version');
  h := public.admin_get_history(adm, null);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'responses') r where r->>'event_id' = ev::text and r->>'occurrence_date' = '2026-11-06'),
                        'old responses still in history');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'events') x where x->>'id' = ev::text)
                        and exists (select 1 from jsonb_array_elements(h->'events') x where x->>'id' = e->>'id'), 'history has both versions');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(h->'occurrences') o where o->>'event_id' = e->>'id'
                                and o->>'occurrence_date' = '2026-11-20' and o->>'series_id' = old.series_id::text), 'new version occurrence in history');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(h->'occurrences') o where o->>'event_id' = ev::text
                                    and o->>'occurrence_date' > '2026-11-17'), 'old version stops at ends_on');
  -- schedule edit without answers stays in place
  fresh := public.admin_upsert_event(adm, jsonb_build_object('title', 'Chess', 'kind', 'weekly', 'starts_on', '2026-11-01',
             'weekdays', jsonb_build_array(2), 'start_time', '17:00'));
  e := public.admin_upsert_event(adm, jsonb_build_object('id', fresh->>'id', 'title', 'Chess', 'kind', 'weekly', 'starts_on', '2026-11-01',
             'weekdays', jsonb_build_array(4), 'start_time', '17:30'));
  perform pg_temp.ok(e->>'id' = fresh->>'id' and e->'weekdays' = '[4]'::jsonb, 'schedule edit without answers is in place');
end $$;

-- ---------------------------------------------------------------------------
-- versioning with unchanged starts_on does not duplicate occurrences (incl. ended-today)
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; adm text; sh text; m uuid; e jsonb; v2 jsonb; v3 jsonb; h jsonb; dups int; base jsonb;
begin
  perform set_config('app.now', '2026-11-04 12:00:00+02', true);  -- Wed
  r := public.create_group('Versioning', 'Africa/Cairo', array['Vee']);
  adm := r->>'admin_code'; sh := r->>'share_code';
  select id into m from public.members where group_id = (select id from public.groups where share_code = sh);
  base := jsonb_build_object('title', 'Run', 'kind', 'weekly', 'starts_on', '2026-10-01',
                             'weekdays', jsonb_build_array(5), 'start_time', '19:00');
  e := public.admin_upsert_event(adm, base);
  perform public.submit_response(sh, (e->>'id')::uuid, '2026-11-06', m, 'going', null);
  -- past attendance is what makes the schedule edit version the event
  perform public.admin_mark_attendance(adm, (e->>'id')::uuid, '2026-10-30', jsonb_build_array(jsonb_build_object('member_id', m, 'attended', true)));
  -- time-only change, starts_on resent unchanged (no session today)
  v2 := public.admin_upsert_event(adm, base || jsonb_build_object('id', e->>'id', 'start_time', '18:00'));
  perform pg_temp.ok(v2->>'id' <> e->>'id' and v2->>'starts_on' = '2026-11-04',
                     'new version starts the day after old ends_on: ' || v2::text);
  -- ended-today case: Fri 11-06 20:00, the 18:00 session has started and has an answer path via attendance
  perform set_config('app.now', '2026-11-06 20:00:00+02', true);
  perform public.admin_mark_attendance(adm, (v2->>'id')::uuid, '2026-11-06', jsonb_build_array(jsonb_build_object('member_id', m, 'attended', true)));
  v3 := public.admin_upsert_event(adm, base || jsonb_build_object('id', v2->>'id', 'start_time', '21:00'));
  perform pg_temp.ok((select ends_on from public.events where id = (v2->>'id')::uuid) = '2026-11-06', 'old version ends today (started)');
  perform pg_temp.ok(v3->>'starts_on' = '2026-11-07', 'newest version starts tomorrow: ' || v3::text);
  perform pg_temp.ok(public.get_group_public(sh)->'sessions'->0->>'occurrence_date' = '2026-11-13', 'no second session today');
  h := public.admin_get_history(adm, null);
  select count(*) into dups from (
    select o->>'series_id', o->>'occurrence_date' from jsonb_array_elements(h->'occurrences') o
     group by 1, 2 having count(*) > 1) d;
  perform pg_temp.ok(dups = 0, 'no (series_id, occurrence_date) appears twice in history: ' || (h->'occurrences')::text);
  perform pg_temp.ok(jsonb_array_length(h->'occurrences') = 7, 'Fridays 10-02..11-13 listed once each: ' || jsonb_array_length(h->'occurrences'));
  perform pg_temp.expect_err(format($q$select public.admin_mark_attendance(%L, %L, %L, '[]'::jsonb)$q$, adm, v3->>'id', '2026-10-30'),
                             'invalid_input', 'newest version has no past dates to mark');
end $$;

-- ---------------------------------------------------------------------------
-- versioning carries upcoming answers: (c) ended-today + (a) time-only change
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; adm text; sh text; m uuid; e jsonb; v2 jsonb; s jsonb; base jsonb;
begin
  perform set_config('app.now', '2026-11-06 10:00:00+02', true);  -- Fri morning
  r := public.create_group('Carry', 'Africa/Cairo', array['Cee']);
  adm := r->>'admin_code'; sh := r->>'share_code';
  select id into m from public.members where group_id = (select id from public.groups where share_code = sh);
  base := jsonb_build_object('title', 'Gym', 'kind', 'weekly', 'starts_on', '2026-10-01',
                             'weekdays', jsonb_build_array(1, 5), 'start_time', '19:00');
  e := public.admin_upsert_event(adm, base);
  perform public.submit_response(sh, (e->>'id')::uuid, '2026-11-06', m, 'going', 'today');
  perform public.admin_set_response(adm, (e->>'id')::uuid, '2026-11-09', m, 'going', 'mon');
  perform public.admin_set_response(adm, (e->>'id')::uuid, '2026-11-13', m, 'cant', 'fri');
  perform public.admin_set_response(adm, (e->>'id')::uuid, '2026-11-16', m, 'going', 'mon2');
  perform public.admin_skip_occurrence(adm, (e->>'id')::uuid, '2026-11-20', 'Holiday');
  -- Fri 20:00: today's 19:00 session has started, so the old row ends today
  perform set_config('app.now', '2026-11-06 20:00:00+02', true);
  v2 := public.admin_upsert_event(adm, base || jsonb_build_object('id', e->>'id', 'start_time', '18:30'));
  perform pg_temp.ok(v2->>'id' <> e->>'id', '(c) answer on today (started) versions the event');
  perform pg_temp.ok((select ends_on from public.events where id = (e->>'id')::uuid) = '2026-11-06', '(c) old row ends today');
  perform pg_temp.ok(exists (select 1 from public.responses where event_id = (e->>'id')::uuid and occurrence_date = '2026-11-06'),
                     '(c) today''s answer stays on the old row');
  perform pg_temp.ok((select count(*) from public.responses where event_id = (v2->>'id')::uuid) = 3
                     and not exists (select 1 from public.responses where event_id = (e->>'id')::uuid and occurrence_date > '2026-11-06'),
                     '(a) upcoming answers moved to the new version');
  perform pg_temp.ok((select note from public.responses where event_id = (v2->>'id')::uuid and occurrence_date = '2026-11-13') = 'fri',
                     '(a) moved answer keeps its note');
  perform pg_temp.ok(exists (select 1 from public.skipped_occurrences where event_id = (v2->>'id')::uuid and occurrence_date = '2026-11-20'),
                     '(a) upcoming skip moved to the new version');
  s := public.get_group_public(sh)->'sessions'->0;
  perform pg_temp.ok(s->'event'->>'id' = v2->>'id' and s->>'occurrence_date' = '2026-11-09'
                     and s->'answers'->0->>'note' = 'mon', '(a) next session shows the carried answer: ' || s::text);
  perform set_config('t.carry_adm', adm, true);
  perform set_config('t.carry_v2', v2->>'id', true);
  perform set_config('t.carry_m', m::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- (b) day change drops answers for dates no longer scheduled
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.carry_adm'); v2 uuid := current_setting('t.carry_v2')::uuid;
        m uuid := current_setting('t.carry_m')::uuid; v3 jsonb;
begin
  perform set_config('app.now', '2026-11-10 12:00:00+02', true);  -- Tue
  perform public.admin_mark_attendance(adm, v2, '2026-11-09', jsonb_build_array(jsonb_build_object('member_id', m, 'attended', true)));
  v3 := public.admin_upsert_event(adm, jsonb_build_object('id', v2, 'title', 'Gym', 'kind', 'weekly', 'starts_on', '2026-10-01',
          'weekdays', jsonb_build_array(5), 'start_time', '18:30'));
  perform pg_temp.ok(v3->>'id' <> v2::text and v3->>'starts_on' = '2026-11-10', '(b) day change versions: ' || v3::text);
  perform pg_temp.ok(exists (select 1 from public.responses where event_id = v2 and occurrence_date = '2026-11-09'),
                     '(b) past Monday answer stays on the old row');
  perform pg_temp.ok(exists (select 1 from public.responses where event_id = (v3->>'id')::uuid and occurrence_date = '2026-11-13'),
                     '(b) Friday answer moved');
  perform pg_temp.ok(not exists (select 1 from public.responses where occurrence_date = '2026-11-16'
                                    and member_id = m), '(b) Monday answer no longer scheduled is deleted');
end $$;

-- ---------------------------------------------------------------------------
-- (d) attendance alone triggers versioning; future-only answers edit in place
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; adm text; sh text; m uuid; swim jsonb; s2 jsonb; row jsonb; base jsonb;
begin
  perform set_config('app.now', '2026-11-04 12:00:00+02', true);  -- Wed
  r := public.create_group('Pool', 'Africa/Cairo', array['Dee']);
  adm := r->>'admin_code'; sh := r->>'share_code';
  select id into m from public.members where group_id = (select id from public.groups where share_code = sh);
  base := jsonb_build_object('title', 'Swim', 'kind', 'weekly', 'starts_on', '2026-10-01',
                             'weekdays', jsonb_build_array(5), 'start_time', '07:00');
  swim := public.admin_upsert_event(adm, base);
  perform public.admin_mark_attendance(adm, (swim->>'id')::uuid, '2026-10-30', jsonb_build_array(jsonb_build_object('member_id', m, 'attended', true)));
  row := public.admin_upsert_event(adm, base || jsonb_build_object('id', swim->>'id', 'start_time', '08:00'));
  perform pg_temp.ok(row->>'id' <> swim->>'id', '(d) attendance-only history versions the event');
  -- future answers only: stays in place, keeps answers that are still scheduled, drops the rest
  s2 := public.admin_upsert_event(adm, jsonb_build_object('title', 'Lift', 'kind', 'weekly', 'starts_on', '2026-11-01',
          'weekdays', jsonb_build_array(1, 5), 'start_time', '07:00'));
  perform public.admin_set_response(adm, (s2->>'id')::uuid, '2026-11-06', m, 'going', null);
  perform public.admin_set_response(adm, (s2->>'id')::uuid, '2026-11-09', m, 'going', null);
  row := public.admin_upsert_event(adm, jsonb_build_object('id', s2->>'id', 'title', 'Lift', 'kind', 'weekly', 'starts_on', '2026-11-01',
          'weekdays', jsonb_build_array(5), 'start_time', '07:30'));
  perform pg_temp.ok(row->>'id' = s2->>'id', '(d) future-only answers: edited in place');
  perform pg_temp.ok(exists (select 1 from public.responses where event_id = (s2->>'id')::uuid and occurrence_date = '2026-11-06')
                     and not exists (select 1 from public.responses where event_id = (s2->>'id')::uuid and occurrence_date = '2026-11-09'),
                     '(d) in-place edit keeps Friday answer, drops unscheduled Monday');
end $$;

-- ---------------------------------------------------------------------------
-- abuse caps and bounds
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; adm text; sh text; gid uuid; e jsonb; m uuid; i int; one jsonb;
begin
  perform set_config('app.now', '2027-03-03 12:00:00+02', true);  -- Wed
  perform pg_temp.expect_err(format('select public.create_group(%L, %L, %L::text[])', 'Big', 'UTC',
                               (select array_agg('M' || g) from generate_series(1, 201) g)),
                             'invalid_input', 'create_group with 201 members');
  r := public.create_group('Caps', 'Africa/Cairo', (select array_agg('M' || g) from generate_series(1, 200) g));
  adm := r->>'admin_code'; sh := r->>'share_code';
  select id into gid from public.groups where share_code = sh;
  perform pg_temp.ok((select count(*) from public.members where group_id = gid) = 200, '200 members accepted');
  perform pg_temp.expect_err(format('select public.admin_upsert_member(%L, null, %L)', adm, 'One more'), 'invalid_input', '201st active member');
  select id into m from public.members where group_id = gid and name = 'M1';
  perform public.admin_upsert_member(adm, m, 'M1 renamed');
  perform public.admin_deactivate_member(adm, m);
  perform pg_temp.ok((public.admin_upsert_member(adm, null, 'One more')->>'active')::boolean, 'add works again below the cap');

  -- event date bounds (local today 2027-03-03)
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"once","starts_on":"2029-03-04","start_time":"19:00"}')$q$, adm), 'invalid_input', 'starts_on > 2 years ahead');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"once","starts_on":"2025-03-02","start_time":"19:00"}')$q$, adm), 'invalid_input', 'starts_on > 2 years back');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"weekly","starts_on":"2027-03-01","weekdays":[5],"start_time":"19:00","ends_on":"9999-12-31"}')$q$, adm), 'invalid_input', 'ends_on > 2 years ahead');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"weekly","starts_on":"2027-03-01","weekdays":[null],"start_time":"19:00"}')$q$, adm), 'invalid_input', 'weekdays [null]');
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"X","kind":"weekly","starts_on":"2027-03-01","weekdays":[1,null],"start_time":"19:00"}')$q$, adm), 'invalid_input', 'weekdays with a null');
  one := public.admin_upsert_event(adm, jsonb_build_object('title', 'Edge', 'kind', 'once', 'starts_on', '2029-03-03', 'start_time', '19:00'));
  perform pg_temp.ok(one->>'starts_on' = '2029-03-03', 'starts_on exactly 2 years ahead accepted');

  -- answers at most a year ahead
  e := public.admin_upsert_event(adm, jsonb_build_object('title', 'Fri', 'kind', 'weekly', 'starts_on', '2027-03-01',
         'weekdays', jsonb_build_array(5), 'start_time', '19:00'));
  select id into m from public.members where group_id = gid and name = 'M2';
  perform public.admin_set_response(adm, (e->>'id')::uuid, '2028-03-03', m, 'going', null);
  perform pg_temp.expect_err(format('select public.admin_set_response(%L, %L, %L, %L, %L, null)', adm, e->>'id', '2028-03-10', m, 'going'),
                             'invalid_input', 'admin_set_response more than a year ahead');

  -- at most 20 active events (2 exist)
  for i in 3 .. 20 loop
    perform public.admin_upsert_event(adm, jsonb_build_object('title', 'E' || i, 'kind', 'once', 'starts_on', '2027-04-01', 'start_time', '19:00'));
  end loop;
  perform pg_temp.expect_err(format($q$select public.admin_upsert_event(%L, '{"title":"E21","kind":"once","starts_on":"2027-04-01","start_time":"19:00"}')$q$, adm), 'invalid_input', '21st active event');
  -- editing at the cap still works; ending one frees a slot
  perform public.admin_upsert_event(adm, (e - 'id' - 'series_id' - 'active') || jsonb_build_object('id', e->>'id', 'title', 'Friday'));
  perform public.admin_end_event(adm, (one->>'id')::uuid);
  perform public.admin_upsert_event(adm, jsonb_build_object('title', 'E21', 'kind', 'once', 'starts_on', '2027-04-01', 'start_time', '19:00'));
end $$;

-- old events keep their original dates on edit even if now out of bounds
do $$
declare r jsonb; adm text; e jsonb;
begin
  perform set_config('app.now', '2026-11-04 12:00:00+02', true);
  r := public.create_group('Old', 'UTC', array['Oz']);
  adm := r->>'admin_code';
  e := public.admin_upsert_event(adm, jsonb_build_object('title', 'Long', 'kind', 'weekly', 'starts_on', '2025-01-01',
         'weekdays', jsonb_build_array(2), 'start_time', '19:00'));
  perform set_config('app.now', '2027-06-01 12:00:00+00', true);  -- starts_on now > 2 years back
  e := public.admin_upsert_event(adm, (e - 'id' - 'series_id' - 'active') || jsonb_build_object('id', e->>'id', 'title', 'Longer'));
  perform pg_temp.ok(e->>'title' = 'Longer' and e->>'starts_on' = '2025-01-01', 'unchanged old starts_on accepted on edit');
end $$;

-- create_group global throttle: 30 groups in the last minute -> rate_limited
do $$
declare r jsonb;
begin
  perform set_config('app.now', '2027-05-05 12:00:00+00', true);
  insert into public.groups (name, timezone, share_code, admin_code_hash, created_at)
  select 'R' || g, 'UTC', 'RL' || g, 'rl-hash-' || g, public.app_now() - interval '30 seconds'
    from generate_series(1, 30) g;
  perform pg_temp.expect_err($q$select public.create_group('Spam', 'UTC', array['S'])$q$, 'rate_limited', '31st group in a minute');
  perform set_config('app.now', '2027-05-05 12:00:31+00', true);
  r := public.create_group('Later', 'UTC', array['S']);
  perform pg_temp.ok(r ? 'share_code', 'create_group works again a minute later');
end $$;

-- ---------------------------------------------------------------------------
-- wrong code -> not_found
-- ---------------------------------------------------------------------------
do $$
declare adm text := current_setting('t.admin'); sh text := current_setting('t.share'); other jsonb;
begin
  perform pg_temp.expect_err($q$select public.get_group_public('ZZZZZZZZZZ')$q$, 'not_found', 'bad share code');
  perform pg_temp.expect_err($q$select public.get_group_public(null)$q$, 'not_found', 'null share code');
  perform pg_temp.expect_err($q$select public.admin_get_group('ZZZZZZZZZZZZZZZZ')$q$, 'not_found', 'bad admin code');
  perform pg_temp.expect_err(format('select public.admin_get_group(%L)', sh), 'not_found', 'share code is not an admin code');
  perform pg_temp.expect_err(format('select public.get_group_public(%L)', adm), 'not_found', 'admin code is not a share code');
  perform pg_temp.expect_err(format('select public.admin_get_history(%L, null)', sh), 'not_found', 'history with share code');
  -- cross-group ids are not_found
  other := public.create_group('Other', 'UTC', array['Q']);
  perform pg_temp.expect_err(format('select public.admin_end_event(%L, %L)', other->>'admin_code', current_setting('t.ev')), 'not_found', 'end other group event');
  perform pg_temp.expect_err(format('select public.admin_deactivate_member(%L, %L)', other->>'admin_code', current_setting('t.omar')), 'not_found', 'deactivate other group member');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', other->>'share_code', current_setting('t.ev'), '2026-11-20', current_setting('t.omar'), 'going'),
                             'not_found', 'submit with other group share code');
  perform pg_temp.expect_err(format('select public.submit_response(%L, %L, %L, %L, %L, null)', sh, gen_random_uuid(), '2026-11-20', current_setting('t.omar'), 'going'),
                             'not_found', 'submit unknown event');
end $$;

\echo 'ALL TESTS PASSED'
rollback;
