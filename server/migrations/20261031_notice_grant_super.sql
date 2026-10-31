create or replace function public.notice_grant_super(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists (select 1 from public.notice_profiles p
 where p.id=auth.uid() and p.role='super' and p.status='active')
 then raise exception 'super administrator required' using errcode='42501'; end if;
 if p_user=auth.uid() then raise exception 'self-change not allowed'; end if;
 update public.notice_profiles set role='super'
 where id=p_user and status='active';
 if not found then raise exception 'active staff required'; end if;
end;$$;
revoke all on function public.notice_grant_super(uuid) from public,anon;
grant execute on function public.notice_grant_super(uuid) to authenticated;