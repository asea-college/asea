insert into public.notice_departments(name,active) values('기획처',true) on conflict(name) do nothing;
drop policy if exists notice_departments_signup_read on public.notice_departments;
create policy notice_departments_signup_read on public.notice_departments for select to anon,authenticated using(active=true);
grant select on public.notice_departments to anon,authenticated;