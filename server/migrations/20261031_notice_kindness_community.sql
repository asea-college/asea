-- ASEA IEUM "Small Connection" v0.2: non-destructive, opt-out by default OFF.
-- Daily missions assigned by explicitly authorized administrator; scheduler/push NOT installed.
create table if not exists public.notice_kindness_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 opted_out boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists public.notice_kindness_missions(
 id uuid primary key default gen_random_uuid(),
 mission_day date not null,
 actor_id uuid not null references auth.users(id),
 recipient_id uuid not null references auth.users(id),
 mission_code text not null check(mission_code in ('greeting','gratitude','help','encourage','coffee_optional')),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(mission_day,actor_id),
 check(actor_id<>recipient_id)
);
create index if not exists notice_kindness_missions_day on public.notice_kindness_missions(mission_day);
create table if not exists public.notice_kindness_notes(
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id),
 recipient_id uuid references auth.users(id),
 channel text not null check(channel in ('anonymous_thanks','radio_story','department_relay')),
 body text not null check(length(trim(body)) between 4 and 500),
 created_at timestamptz not null default now(),
 check(recipient_id is null or sender_id<>recipient_id)
);
create index if not exists notice_kindness_notes_inbox on public.notice_kindness_notes(recipient_id,created_at desc);
create table if not exists public.notice_coffee_matches(
 id uuid primary key default gen_random_uuid(),
 match_day date not null,
 first_id uuid not null references auth.users(id),
 second_id uuid not null references auth.users(id),
 accepted_first boolean,
 accepted_second boolean,
 created_at timestamptz not null default now(),
 check(first_id<>second_id),
 unique(match_day,first_id),
 unique(match_day,second_id)
);
-- Hide identity mappings: only privileged SQL and carefully scoped RPCs access them.
do $$ declare t text; begin
 foreach t in array array['notice_kindness_preferences','notice_kindness_missions','notice_kindness_notes','notice_coffee_matches'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;

create or replace function public.notice_kindness_opt(p_opt_out boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active')
 then raise exception 'approved staff only' using errcode='42501'; end if;
 insert into public.notice_kindness_preferences(user_id,opted_out) values(auth.uid(),p_opt_out)
 on conflict(user_id) do update set opted_out=excluded.opted_out,updated_at=now();
end;$$;
create or replace function public.notice_kindness_my_status()
returns table(opted_out boolean,mission_day date,recipient_name text,recipient_department text,mission_code text,completed boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active')
 then raise exception 'approved staff only' using errcode='42501'; end if;
 return query
 select coalesce(pref.opted_out,false),m.mission_day,recipient.full_name,d.name,m.mission_code,m.completed_at is not null
 from (select auth.uid() as id) me
 left join public.notice_kindness_preferences pref on pref.user_id=me.id
 left join public.notice_kindness_missions m on m.actor_id=me.id and m.mission_day=(now() at time zone 'Asia/Seoul')::date
 left join public.notice_profiles recipient on recipient.id=m.recipient_id
 left join public.notice_departments d on d.id=recipient.department_id;
end;$$;
create or replace function public.notice_kindness_complete()
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.notice_kindness_missions
 set completed_at=coalesce(completed_at,now())
 where actor_id=auth.uid() and mission_day=(now() at time zone 'Asia/Seoul')::date;
 if not found then raise exception 'no assignment today'; end if;
end;$$;
create or replace function public.notice_kindness_dispatch(p_day date)
returns integer language plpgsql security definer set search_path='' as $$
declare a record; dest uuid; code text; count_added integer:=0; ix integer:=0;
begin
 if not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active' and p.role='super')
 then raise exception 'super administrator only' using errcode='42501'; end if;
 if p_day is distinct from (now() at time zone 'Asia/Seoul')::date or extract(isodow from p_day)>=6
 then raise exception 'today on weekdays only'; end if;
 perform pg_advisory_xact_lock(20261031,1);
 for a in
  select p.id,p.department_id from public.notice_profiles p
  left join public.notice_kindness_preferences pref on pref.user_id=p.id
  where p.status='active' and not coalesce(pref.opted_out,false)
  and not exists(select 1 from public.notice_kindness_missions m where m.actor_id=p.id and m.mission_day=p_day)
  order by p.id
 loop
  select p.id into dest
  from public.notice_profiles p
  left join public.notice_kindness_preferences pref on pref.user_id=p.id
  where p.status='active' and p.id<>a.id and not coalesce(pref.opted_out,false)
  order by case when p.department_id is distinct from a.department_id then 0 else 1 end,random() limit 1;
  if dest is null then continue; end if;
  ix:=ix+1;
  code:=(array['greeting','gratitude','help','encourage','coffee_optional'])[(ix%5)+1];
  insert into public.notice_kindness_missions(mission_day,actor_id,recipient_id,mission_code)
  values(p_day,a.id,dest,code) on conflict do nothing;
  count_added:=count_added+1;
 end loop;
 return count_added;
end;$$;
create or replace function public.notice_kindness_send(p_recipient uuid,p_channel text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); result uuid; sent integer;
begin
 if not exists(select 1 from public.notice_profiles p where p.id=me and p.status='active')
 then raise exception 'approved staff only' using errcode='42501'; end if;
 if p_channel not in ('anonymous_thanks','radio_story','department_relay')
 or length(trim(p_body)) not between 4 and 500 then raise exception 'invalid message'; end if;
 if p_channel='anonymous_thanks' and (p_recipient is null or p_recipient=me
   or not exists(select 1 from public.notice_profiles where id=p_recipient and status='active'))
 then raise exception 'invalid recipient'; end if;
 if p_channel<>'anonymous_thanks' and p_recipient is not null then raise exception 'recipient not allowed for public submissions'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||current_date::text,1));
 select count(*) into sent from public.notice_kindness_notes n
 where n.sender_id=me and n.created_at>=(now() at time zone 'Asia/Seoul')::date at time zone 'Asia/Seoul';
 if sent>=3 then raise exception 'daily note limit reached'; end if;
 insert into public.notice_kindness_notes(sender_id,recipient_id,channel,body)
 values(me,p_recipient,p_channel,trim(p_body)) returning id into result;
 return result;
end;$$;
create or replace function public.notice_kindness_inbox()
returns table(note_id uuid,body text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active')
 then raise exception 'approved staff only' using errcode='42501'; end if;
 return query select n.id,n.body,n.created_at from public.notice_kindness_notes n
 where n.recipient_id=auth.uid() and n.channel='anonymous_thanks'
 order by n.created_at desc limit 50;
end;$$;
do $$ declare n text; begin
 foreach n in array array['notice_kindness_opt(boolean)','notice_kindness_my_status()','notice_kindness_complete()','notice_kindness_dispatch(date)','notice_kindness_send(uuid,text,text)','notice_kindness_inbox()'] loop
  execute 'revoke all on function public.'||n||' from public,anon';
  execute 'grant execute on function public.'||n||' to authenticated';
 end loop;
end $$;
