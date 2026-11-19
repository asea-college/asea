-- FCM/APNs registration storage; no provider secret stored in DB or client.
create table if not exists public.notice_push_devices(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in ('android','ios')),
 token text not null check(length(token) between 20 and 2048),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(platform,token)
);
create index if not exists notice_push_devices_user on public.notice_push_devices(user_id);
alter table public.notice_push_devices enable row level security;
revoke all on public.notice_push_devices from anon,authenticated;
grant select,insert,update,delete on public.notice_push_devices to authenticated;
drop policy if exists notice_push_devices_self_select on public.notice_push_devices;
create policy notice_push_devices_self_select on public.notice_push_devices for select to authenticated
 using (user_id=(select auth.uid()));
drop policy if exists notice_push_devices_self_insert on public.notice_push_devices;
create policy notice_push_devices_self_insert on public.notice_push_devices for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.notice_profiles p where p.id=(select auth.uid()) and p.status='active'));
drop policy if exists notice_push_devices_self_update on public.notice_push_devices;
create policy notice_push_devices_self_update on public.notice_push_devices for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists notice_push_devices_self_delete on public.notice_push_devices;
create policy notice_push_devices_self_delete on public.notice_push_devices for delete to authenticated
 using(user_id=(select auth.uid()));
-- Push provider server credentials stay in server secrets, never in database rows or public clients.
