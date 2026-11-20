create function public.tt_validate_subject_links() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from jsonb_array_elements(new.document->'lessons') l where coalesce(l->>'subjectId','')<>'' and not exists(select 1 from public.tt_subject_catalog s where s.id::text=l->>'subjectId')) then raise exception '공통 과목 DB에서 과목을 선택하세요.';end if;
 return new;
end $$;
create trigger tt_validate_subject_links before update on public.tt_state for each row execute function public.tt_validate_subject_links();
revoke all on function public.tt_validate_subject_links() from public,anon,authenticated;
grant execute on function public.tt_validate_subject_links() to service_role;
do $update_functions$
declare definition text;
begin
 definition:=pg_get_functiondef('public.tt_booking_calendar(date,date)'::regprocedure);
 definition:=replace(definition,'from public.tt_departments)','from public.tt_departments where active)');execute definition;
 definition:=pg_get_functiondef('public.tt_booking_write(jsonb)'::regprocedure);
 definition:=replace(definition,'where name=row_data->>''department'')','where name=row_data->>''department'' and (active or (operation=''update'' and old.department=row_data->>''department'')))');
 definition:=replace(definition,'and coalesce((r->>''active'')::boolean,false)','and (coalesce((r->>''active'')::boolean,false) or (operation=''update'' and room_key=any(old.rooms)))');execute definition;
end $update_functions$;
