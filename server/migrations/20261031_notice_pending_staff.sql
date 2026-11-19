-- Scoped staff administration views, authenticated super administrators only.
create or replace function public.notice_pending_staff()
returns table(id uuid, full_name text, requested_department text, created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active' and p.role='super') then
   raise exception 'super administrator required' using errcode='42501';
 end if;
 return query select p.id,p.full_name,p.requested_department,p.created_at
 from public.notice_profiles p where p.status='pending' order by p.created_at asc;
end;$$;
revoke all on function public.notice_pending_staff() from public,anon;
grant execute on function public.notice_pending_staff() to authenticated;
-- department directory is read-only; mutating requires trusted backend.
