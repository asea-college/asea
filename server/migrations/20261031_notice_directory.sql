-- Staff directory limited to authenticated and approved personnel.
create or replace function public.notice_staff_directory()
returns table(id uuid, full_name text, department_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active') then
  raise exception 'approved staff only' using errcode='42501';
 end if;
 return query select p.id,p.full_name,p.department_id
 from public.notice_profiles p where p.status='active'
 order by p.full_name limit 500;
end;$$;
revoke all on function public.notice_staff_directory() from public,anon;
grant execute on function public.notice_staff_directory() to authenticated;
-- Seed a single all-staff room, if a super administrator exists and no all-staff room exists.
insert into public.notice_rooms(kind,title,created_by)
select 'all','전체 교직원 메시지함',p.id
from public.notice_profiles p
where p.role='super' and p.status='active'
and not exists(select 1 from public.notice_rooms where kind='all')
order by p.created_at
limit 1;
