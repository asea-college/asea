-- ASEA Notice self-registration: additive, pending users only.
alter table public.notice_profiles add column if not exists requested_department text;
create schema if not exists notice_private;
create or replace function notice_private.create_staff_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notice_profiles(id,full_name,login_id,role,status,requested_department)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'신규 교직원'),100),
    null,
    'staff','pending',
    left(nullif(trim(coalesce(new.raw_user_meta_data->>'requested_department','')),''),100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function notice_private.create_staff_profile() from public,anon,authenticated;
drop trigger if exists notice_staff_auth_signup on auth.users;
create trigger notice_staff_auth_signup after insert on auth.users
for each row execute function notice_private.create_staff_profile();
-- Guard against privilege assignment through frontend; signup is allowed, approval requires privileged administrator.
