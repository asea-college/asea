-- Additive ASEA organizational continuity / polls / schedule / radio metadata.
-- Existing messages, calendar and staff records are untouched.
create table if not exists public.notice_department_transfers(
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references auth.users(id),
 old_department_id uuid references public.notice_departments(id),
 new_department_id uuid not null references public.notice_departments(id),
 approved_by uuid not null references auth.users(id),
 transferred_at timestamptz not null default now()
);
alter table public.notice_department_transfers enable row level security;
revoke all on public.notice_department_transfers from anon,authenticated;
grant select on public.notice_department_transfers to authenticated;
create policy notice_transfers_own on public.notice_department_transfers for select to authenticated using(staff_id=(select auth.uid()));

-- Active former department membership keeps official channel history accessible until voluntarily leaving.
-- No departure broadcast; audit event remains private to super-admin and individual user.
create table if not exists public.notice_room_departures(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.notice_rooms(id),
 staff_id uuid not null references auth.users(id),
 left_at timestamptz not null default now(),
 unique(room_id,staff_id)
);
alter table public.notice_room_departures enable row level security;
revoke all on public.notice_room_departures from anon,authenticated;
grant select on public.notice_room_departures to authenticated;
create policy notice_departures_own on public.notice_room_departures for select to authenticated using(staff_id=(select auth.uid()));

create or replace function notice_private.can_use_room(p_room uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.notice_rooms r
 join public.notice_profiles p on p.id=p_user and p.status='active'
 where r.id=p_room and (
 r.kind='all'
 or (r.kind='department' and (
  (r.department_id=p.department_id and not exists(select 1 from public.notice_room_departures d where d.room_id=r.id and d.staff_id=p_user))
  or (exists(select 1 from public.notice_room_members m where m.room_id=r.id and m.user_id=p_user)
  and not exists(select 1 from public.notice_room_departures d where d.room_id=r.id and d.staff_id=p_user))
 ))
 or (r.kind='direct' and exists(select 1 from public.notice_room_members m where m.room_id=r.id and m.user_id=p_user))
 )) $$;
revoke all on function notice_private.can_use_room(uuid,uuid) from public,anon;
grant execute on function notice_private.can_use_room(uuid,uuid) to authenticated;

create or replace function public.notice_transfer_staff(p_staff uuid,p_to uuid)
returns void language plpgsql security definer set search_path='' as $$
declare operator_id uuid:=auth.uid(); old_id uuid;
begin
 if not exists(select 1 from public.notice_profiles where id=operator_id and role='super' and status='active') then
  raise exception 'administrator only' using errcode='42501';
 end if;
 if not exists(select 1 from public.notice_departments where id=p_to and active) then raise exception 'invalid department'; end if;
 select department_id into old_id from public.notice_profiles where id=p_staff and status='active' for update;
 if not found then raise exception 'staff not active'; end if;
 if old_id is not distinct from p_to then return; end if;
 -- Preserve access to the former official department channels until quiet leave.
 if old_id is not null then
  insert into public.notice_room_members(room_id,user_id)
  select id,p_staff from public.notice_rooms where kind='department' and department_id=old_id
  on conflict do nothing;
 end if;
 update public.notice_profiles set department_id=p_to where id=p_staff;
 insert into public.notice_department_transfers(staff_id,old_department_id,new_department_id,approved_by)
 values(p_staff,old_id,p_to,operator_id);
end;$$;
revoke all on function public.notice_transfer_staff(uuid,uuid) from public,anon;
grant execute on function public.notice_transfer_staff(uuid,uuid) to authenticated;

create or replace function public.notice_quiet_leave(p_room uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); target_dept uuid; current_dept uuid;
begin
 select r.department_id into target_dept from public.notice_rooms r where r.id=p_room and r.kind='department';
 if target_dept is null then raise exception 'department channel only'; end if;
 select p.department_id into current_dept from public.notice_profiles p where p.id=me and p.status='active';
 if not found or target_dept is not distinct from current_dept then
  raise exception 'cannot leave active department channel' using errcode='42501';
 end if;
 if not exists(select 1 from public.notice_room_members where room_id=p_room and user_id=me) then raise exception 'not a former member'; end if;
 insert into public.notice_room_departures(room_id,staff_id) values(p_room,me) on conflict do nothing;
 delete from public.notice_room_members where room_id=p_room and user_id=me;
 -- Do not write a chat event, send push, or notify other members.
end;$$;
revoke all on function public.notice_quiet_leave(uuid) from public,anon;
grant execute on function public.notice_quiet_leave(uuid) to authenticated;

create table if not exists public.notice_polls(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.notice_rooms(id),
 author_id uuid not null references auth.users(id),
 question text not null check(length(trim(question)) between 3 and 300),
 kind text not null check(kind in ('poll','schedule')),
 anonymous boolean not null default false,
 multiple boolean not null default false,
 closes_at timestamptz not null,
 created_at timestamptz not null default now(),
 check (closes_at>created_at)
);
create table if not exists public.notice_poll_options(
 id uuid primary key default gen_random_uuid(),
 poll_id uuid not null references public.notice_polls(id) on delete cascade,
 label text not null check(length(trim(label)) between 1 and 180),
 starts_at timestamptz,
 unique(poll_id,id)
);
create table if not exists public.notice_poll_votes(
 poll_id uuid not null references public.notice_polls(id) on delete cascade,
 option_id uuid not null,
 user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(poll_id,option_id,user_id),
 foreign key(poll_id,option_id) references public.notice_poll_options(poll_id,id)
);
create index if not exists notice_poll_room_created on public.notice_polls(room_id,created_at desc);
create index if not exists notice_votes_poll on public.notice_poll_votes(poll_id);
alter table public.notice_polls enable row level security;
alter table public.notice_poll_options enable row level security;
alter table public.notice_poll_votes enable row level security;
revoke all on public.notice_polls,public.notice_poll_options,public.notice_poll_votes from anon,authenticated;
grant select,insert on public.notice_polls,public.notice_poll_options to authenticated;
grant select on public.notice_poll_votes to authenticated;
create policy notice_polls_read on public.notice_polls for select to authenticated using(notice_private.can_use_room(room_id,(select auth.uid())));
create policy notice_polls_create on public.notice_polls for insert to authenticated with check(author_id=(select auth.uid()) and notice_private.can_use_room(room_id,(select auth.uid())) and closes_at>now());
create policy notice_options_read on public.notice_poll_options for select to authenticated using(exists(select 1 from public.notice_polls p where p.id=poll_id and notice_private.can_use_room(p.room_id,(select auth.uid()))));
create policy notice_options_write on public.notice_poll_options for insert to authenticated with check(exists(select 1 from public.notice_polls p where p.id=poll_id and p.author_id=(select auth.uid()) and notice_private.can_use_room(p.room_id,(select auth.uid()))));
create policy notice_votes_own on public.notice_poll_votes for select to authenticated using(user_id=(select auth.uid()));

-- Votes are inserted only through an RPC that enforces both single/multiple and deadline.
create or replace function public.notice_cast_vote(p_poll uuid,p_option uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); poll public.notice_polls%rowtype;
begin
 select * into poll from public.notice_polls where id=p_poll;
 if not found or poll.closes_at<=now() or not notice_private.can_use_room(poll.room_id,me)
 then raise exception 'not authorized or poll closed' using errcode='42501'; end if;
 if not exists(select 1 from public.notice_poll_options where poll_id=p_poll and id=p_option)
 then raise exception 'invalid option'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_poll::text||me::text,0));
 if not poll.multiple and exists(select 1 from public.notice_poll_votes where poll_id=p_poll and user_id=me)
 then raise exception 'already voted'; end if;
 insert into public.notice_poll_votes(poll_id,option_id,user_id) values(p_poll,p_option,me)
 on conflict do nothing;
end;$$;
revoke all on function public.notice_cast_vote(uuid,uuid) from public,anon;
grant execute on function public.notice_cast_vote(uuid,uuid) to authenticated;

create or replace function public.notice_poll_tally(p_poll uuid)
returns table(option_id uuid,label text,votes bigint)
language plpgsql stable security definer set search_path='' as $$
declare room uuid;
begin
 select p.room_id into room from public.notice_polls p where p.id=p_poll;
 if room is null or not notice_private.can_use_room(room,auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
 return query select o.id,o.label,count(v.user_id) from public.notice_poll_options o left join public.notice_poll_votes v on v.option_id=o.id and v.poll_id=o.poll_id where o.poll_id=p_poll group by o.id,o.label order by o.label;
end;$$;
revoke all on function public.notice_poll_tally(uuid) from public,anon;
grant execute on function public.notice_poll_tally(uuid) to authenticated;

-- ASEA Radio: schedule metadata only; actual playback requires opt-in and music rights.
create table if not exists public.notice_radio_schedule(
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 150),
 description text not null default '',
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 presenter_id uuid not null references auth.users(id),
 source_url text,
 rights_confirmed boolean not null default false,
 created_at timestamptz not null default now(),
 check(ends_at>starts_at),
 check(source_url is null or (source_url like 'https://%' and length(source_url)<2000))
);
alter table public.notice_radio_schedule enable row level security;
revoke all on public.notice_radio_schedule from anon,authenticated;
grant select,insert on public.notice_radio_schedule to authenticated;
create policy notice_radio_view on public.notice_radio_schedule for select to authenticated using(exists(select 1 from public.notice_profiles p where p.id=(select auth.uid()) and p.status='active'));
create policy notice_radio_create on public.notice_radio_schedule for insert to authenticated with check(
 presenter_id=(select auth.uid()) and rights_confirmed and exists(select 1 from public.notice_profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super','writer'))
);
