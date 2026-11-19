create or replace function public.notice_rename_department(p_department uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notice_profiles where id=auth.uid() and role='super' and status='active')
 then raise exception 'administrator only' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'invalid name'; end if;
 update public.notice_departments set name=trim(p_name) where id=p_department;
 if not found then raise exception 'not found'; end if;
end;$$;
revoke all on function public.notice_rename_department(uuid,text) from public,anon;
grant execute on function public.notice_rename_department(uuid,text) to authenticated;
-- Renaming a department retains the stable UUID and does not rewrite message history.
