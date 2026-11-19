-- Additive migration only; scoped to new notice_* tables. No calendar tables touched.
create table if not exists public.notice_departments(
 id uuid primary key default gen_random_uuid(), name text not null unique,
 active boolean not null default true
);
create table if not exists public.notice_profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null, login_id text unique,
 department_id uuid references public.notice_departments(id),
 role text not null default 'staff' check(role in ('staff','writer','dept','super')),
 status text not null default 'pending' check(status in ('pending','active','disabled')),
 created_at timestamptz not null default now()
);
create table if not exists public.notice_announcements(
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references public.notice_profiles(id),
 title text not null check(length(title) between 1 and 160),
 blocks jsonb not null default '[]'::jsonb,
 response_type text not null default 'ack' check(response_type in ('ack','agree','comment')),
 audience text not null check(audience in ('all','department','person')),
 target_id uuid,
 scheduled_at timestamptz not null default now(),
 status text not null default 'scheduled' check(status in ('draft','scheduled','published','cancelled')),
 created_at timestamptz not null default now(),
 check ((audience='all' and target_id is null) or (audience <> 'all' and target_id is not null))
);
create table if not exists public.notice_responses(
 id uuid primary key default gen_random_uuid(),
 notice_id uuid not null references public.notice_announcements(id),
 person_id uuid not null references public.notice_profiles(id),
 answer text not null check(answer in ('ack','agree','disagree','comment')),
 comment text,
 client_request_id uuid not null unique,
 created_at timestamptz not null default now(),
 unique(notice_id,person_id)
);
create index if not exists notice_announcements_schedule_idx on public.notice_announcements(status,scheduled_at);
create index if not exists notice_profiles_dept_idx on public.notice_profiles(department_id);
alter table public.notice_departments enable row level security;
alter table public.notice_profiles enable row level security;
alter table public.notice_announcements enable row level security;
alter table public.notice_responses enable row level security;
-- Grants and RLS: auth roles are only taken from server-managed profiles, never user_metadata.
create or replace function public.notice_is_admin() returns boolean language sql stable security invoker
as $$ select exists(select 1 from public.notice_profiles p where p.id = (select auth.uid()) and p.status='active' and p.role in ('super','dept','writer')) $$;
-- Avoid recursive RLS by using direct self profile reads; administrative profile reads remain service-managed in v0.1.
drop policy if exists notice_profiles_self_select on public.notice_profiles;
create policy notice_profiles_self_select on public.notice_profiles for select to authenticated using(id=(select auth.uid()));
drop policy if exists notice_departments_read on public.notice_departments;
create policy notice_departments_read on public.notice_departments for select to authenticated using(true);
drop policy if exists notice_announcements_read on public.notice_announcements;
create policy notice_announcements_read on public.notice_announcements for select to authenticated
using (
 (select auth.uid()) is not null and
 status='published' and scheduled_at<=now() and
 exists(select 1 from public.notice_profiles p where p.id=(select auth.uid()) and p.status='active'
 and (audience='all' or (audience='department' and target_id=p.department_id) or (audience='person' and target_id=p.id)))
 or created_by=(select auth.uid())
);
-- Strictly restrict creation to super/writer; dept-scoped creation is intentionally server-gated until authorization API is implemented.
drop policy if exists notice_announcements_insert on public.notice_announcements;
create policy notice_announcements_insert on public.notice_announcements for insert to authenticated
with check(created_by=(select auth.uid()) and exists(select 1 from public.notice_profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super','writer')) and (audience='all' or audience='person'));
drop policy if exists notice_responses_self_insert on public.notice_responses;
create policy notice_responses_self_insert on public.notice_responses for insert to authenticated
with check(person_id=(select auth.uid()) and exists(select 1 from public.notice_announcements n where n.id=notice_id and n.status='published' and n.scheduled_at<=now() and exists(select 1 from public.notice_profiles p where p.id=(select auth.uid()) and p.status='active' and (n.audience='all' or (n.audience='department' and n.target_id=p.department_id) or (n.audience='person' and n.target_id=p.id)))));
drop policy if exists notice_responses_self_read on public.notice_responses;
create policy notice_responses_self_read on public.notice_responses for select to authenticated using(person_id=(select auth.uid()));
grant select on public.notice_departments,public.notice_profiles to authenticated;
grant select,insert on public.notice_announcements,public.notice_responses to authenticated;
-- Scheduled publication, department manager scopes, staff onboarding and privileged analytics
-- must be implemented via authenticated server API before production release.
