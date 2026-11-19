-- Limit automatic notice profile provisioning to registrations explicitly made by the ASEA Notice client.
create or replace function notice_private.create_staff_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data->>'asea_notice_signup','') <> 'yes' then
    return new;
  end if;
  insert into public.notice_profiles(id,full_name,login_id,role,status,requested_department)
  values(
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'신규 교직원'),100),
    null,'staff','pending',
    left(nullif(trim(coalesce(new.raw_user_meta_data->>'requested_department','')),''),100)
  ) on conflict(id) do nothing;
  return new;
end;
$$;
revoke all on function notice_private.create_staff_profile() from public,anon,authenticated;
