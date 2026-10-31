-- Additive: no existing ASEA/calendar records modified.
create table if not exists public.notice_rooms(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('all','department','direct')),
 title text not null check(length(title) between 1 and 120),
 department_id uuid references public.notice_departments(id),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check ((kind='department' and department_id is not null) or (kind<>'department' and department_id is null))
);
create table if not exists public.notice_room_members(
 room_id uuid not null references public.notice_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
create table if not exists public.notice_messages(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.notice_rooms(id),
 sender_id uuid not null references auth.users(id),
 body text not null check(length(trim(body)) between 1 and 10000),
 category text not null default 'general_message' check(category in ('general_message','official_notice','business_record')),
 created_at timestamptz not null default now(),
 legal_hold boolean not null default false,
 client_nonce uuid not null,
 unique(sender_id,client_nonce)
);
create index if not exists notice_messages_room_time on public.notice_messages(room_id,created_at desc,id desc);
create index if not exists notice_rooms_department on public.notice_rooms(department_id);
create index if not exists notice_room_members_user on public.notice_room_members(user_id);
alter table public.notice_rooms enable row level security;
alter table public.notice_room_members enable row level security;
alter table public.notice_messages enable row level security;
create schema if not exists notice_private;
create or replace function notice_private.can_use_room(p_room uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
 select 1 from public.notice_rooms r
 join public.notice_profiles p on p.id=p_user and p.status='active'
 where r.id=p_room and (
  r.kind='all'
  or (r.kind='department' and r.department_id=p.department_id)
  or (r.kind='direct' and exists(select 1 from public.notice_room_members rm where rm.room_id=r.id and rm.user_id=p_user))
 )
 )
$$;
revoke all on function notice_private.can_use_room(uuid,uuid) from public,anon,authenticated;
create or replace function notice_private.may_post_notice(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.notice_profiles p where p.id=p_user and p.status='active' and p.role in ('super','writer'))
$$;
revoke all on function notice_private.may_post_notice(uuid) from public,anon,authenticated;
drop policy if exists notice_rooms_read on public.notice_rooms;
create policy notice_rooms_read on public.notice_rooms for select to authenticated
 using (notice_private.can_use_room(id,(select auth.uid())));
drop policy if exists notice_members_read on public.notice_room_members;
create policy notice_members_read on public.notice_room_members for select to authenticated
 using(notice_private.can_use_room(room_id,(select auth.uid())));
drop policy if exists notice_messages_read on public.notice_messages;
create policy notice_messages_read on public.notice_messages for select to authenticated
 using(notice_private.can_use_room(room_id,(select auth.uid())));
drop policy if exists notice_messages_insert on public.notice_messages;
create policy notice_messages_insert on public.notice_messages for insert to authenticated
 with check(
 sender_id=(select auth.uid())
 and notice_private.can_use_room(room_id,(select auth.uid()))
 and (category='general_message' or notice_private.may_post_notice((select auth.uid())))
 );
-- Rooms and membership are provisioned by trusted administrator/server functions only.
revoke all on public.notice_rooms,public.notice_room_members,public.notice_messages from anon,authenticated;
grant select on public.notice_rooms, public.notice_room_members to authenticated;
grant select,insert on public.notice_messages to authenticated;
-- No automatic deletion trigger: legal review and preservation holds take precedence.
