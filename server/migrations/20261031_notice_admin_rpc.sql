-- Explicitly authorized server RPC; no secret key exposed to clients.
create or replace function public.notice_create_channel(p_kind text,p_title text,p_department uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); room uuid;
begin
 if not exists(select 1 from public.notice_profiles where id=me and status='active' and role='super') then
  raise exception 'super administrator required' using errcode='42501';
 end if;
 if p_kind not in ('all','department') or length(trim(p_title)) not between 1 and 120 then
  raise exception 'invalid channel';
 end if;
 if (p_kind='department') <> (p_department is not null) then
  raise exception 'invalid department';
 end if;
 if p_department is not null and not exists(select 1 from public.notice_departments where id=p_department and active) then
  raise exception 'unknown department';
 end if;
 insert into public.notice_rooms(kind,title,department_id,created_by)
 values(p_kind,trim(p_title),p_department,me) returning id into room;
 return room;
end;
$$;
create or replace function public.notice_open_direct(p_other uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); room uuid;
begin
 if me is null or me=p_other or not exists(select 1 from public.notice_profiles where id=me and status='active')
    or not exists(select 1 from public.notice_profiles where id=p_other and status='active') then
   raise exception 'invalid recipient' using errcode='42501';
 end if;
 select r.id into room
 from public.notice_rooms r
 join public.notice_room_members a on a.room_id=r.id and a.user_id=me
 join public.notice_room_members b on b.room_id=r.id and b.user_id=p_other
 where r.kind='direct'
 and (select count(*) from public.notice_room_members c where c.room_id=r.id)=2
 order by r.created_at limit 1;
 if room is not null then return room; end if;
 insert into public.notice_rooms(kind,title,created_by) values('direct','개인 메시지',me) returning id into room;
 insert into public.notice_room_members(room_id,user_id) values(room,me),(room,p_other);
 return room;
end;
$$;
create or replace function public.notice_approve_member(p_user uuid,p_department uuid default null,p_role text default 'staff')
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if not exists(select 1 from public.notice_profiles where id=me and status='active' and role='super') then
  raise exception 'super administrator required' using errcode='42501';
 end if;
 if p_role not in ('staff','dept','writer') then raise exception 'invalid role'; end if;
 if p_department is not null and not exists(select 1 from public.notice_departments where id=p_department and active) then
  raise exception 'unknown department'; end if;
 update public.notice_profiles set status='active',department_id=p_department,role=p_role where id=p_user and status='pending';
 if not found then raise exception 'pending profile not found'; end if;
end;
$$;
revoke all on function public.notice_create_channel(text,text,uuid) from public,anon;
revoke all on function public.notice_open_direct(uuid) from public,anon;
revoke all on function public.notice_approve_member(uuid,uuid,text) from public,anon;
grant execute on function public.notice_create_channel(text,text,uuid) to authenticated;
grant execute on function public.notice_open_direct(uuid) to authenticated;
grant execute on function public.notice_approve_member(uuid,uuid,text) to authenticated;
