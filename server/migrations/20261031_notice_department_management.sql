-- Admin controlled department setup for staff approvals.
create or replace function public.notice_resolve_department(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); dept uuid; name text:=trim(p_name);
begin
 if not exists(select 1 from public.notice_profiles p where p.id=me and p.status='active' and p.role='super') then
  raise exception 'super administrator required' using errcode='42501';
 end if;
 if name is null or length(name) not between 1 and 100 then
  raise exception 'invalid department name';
 end if;
 insert into public.notice_departments(name) values(name)
 on conflict(name) do update set active=true
 returning id into dept;
 return dept;
end;$$;
revoke all on function public.notice_resolve_department(text) from public,anon;
grant execute on function public.notice_resolve_department(text) to authenticated;
