create table public.tt_subject_catalog(id uuid primary key default gen_random_uuid(),name text not null unique check(length(btrim(name)) between 1 and 200),aliases text[] not null default '{}',active boolean not null default true,version integer not null default 1);
alter table public.tt_subject_catalog enable row level security;
revoke all on public.tt_subject_catalog from public,anon,authenticated;
grant select,insert,update on public.tt_subject_catalog to service_role;
create policy tt_subject_catalog_private on public.tt_subject_catalog for all to anon,authenticated using(false) with check(false);
alter table public.tt_departments add column active boolean not null default true,add column version integer not null default 1;
grant insert,update on public.tt_departments to service_role;
alter table public.tt_bookings drop constraint tt_bookings_department_fkey;
alter table public.tt_bookings add constraint tt_bookings_department_fkey foreign key(department) references public.tt_departments(name) on update cascade;
create table public.tt_registry_history(id bigint generated always as identity primary key,at timestamptz not null default now(),kind text not null,before_doc jsonb,after_doc jsonb);
alter table public.tt_registry_history enable row level security;
revoke all on public.tt_registry_history from public,anon,authenticated;
grant select,insert on public.tt_registry_history to service_role;
grant usage,select on sequence public.tt_registry_history_id_seq to service_role;
create policy tt_registry_history_private on public.tt_registry_history for all to anon,authenticated using(false) with check(false);

create function public.tt_sync_subject_catalog() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='tt_state' then
  insert into public.tt_subject_catalog(name)
  select distinct btrim(name) from (
    select coalesce(nullif(e->>'subject',''),e->>'title') name from jsonb_array_elements(new.document->'lessons') e
    union all select s->>'name' from jsonb_array_elements(new.document->'courses') c cross join lateral jsonb_array_elements(coalesce(c->'subjects','[]'::jsonb)) s
  ) n where length(btrim(coalesce(name,''))) between 1 and 200 and not exists(select 1 from public.tt_subject_catalog c where c.name=btrim(n.name) or btrim(n.name)=any(c.aliases)) on conflict(name) do nothing;
 else
  insert into public.tt_subject_catalog(name) select distinct btrim(coalesce(nullif(e->>'subject',''),e->>'title')) from jsonb_array_elements(new.document->'events') e where length(btrim(coalesce(nullif(e->>'subject',''),e->>'title',''))) between 1 and 200 and not exists(select 1 from public.tt_subject_catalog c where c.name=btrim(coalesce(nullif(e->>'subject',''),e->>'title')) or btrim(coalesce(nullif(e->>'subject',''),e->>'title'))=any(c.aliases)) on conflict(name) do nothing;
 end if;return new;
end $$;
insert into public.tt_subject_catalog(name)
select distinct btrim(name) from (
 select coalesce(nullif(e->>'subject',''),e->>'title') name from public.tt_state t cross join lateral jsonb_array_elements(t.document->'lessons') e where t.id=true
 union all select s->>'name' from public.tt_state t cross join lateral jsonb_array_elements(t.document->'courses') c cross join lateral jsonb_array_elements(coalesce(c->'subjects','[]'::jsonb)) s where t.id=true
 union all select coalesce(nullif(e->>'subject',''),e->>'title') from public.kai_schedule_state k cross join lateral jsonb_array_elements(k.document->'events') e where k.id='2026-kai'
) n where length(btrim(coalesce(name,''))) between 1 and 200 on conflict(name) do nothing;
create trigger tt_sync_subject_catalog after update on public.tt_state for each row execute function public.tt_sync_subject_catalog();
create trigger tt_sync_subject_catalog after update on public.kai_schedule_state for each row execute function public.tt_sync_subject_catalog();

create function public.tt_registry_read() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('subjects',coalesce((select jsonb_agg(to_jsonb(s) order by name) from public.tt_subject_catalog s),'[]'::jsonb),'departments',coalesce((select jsonb_agg(to_jsonb(d) order by sort_order,name) from public.tt_departments d),'[]'::jsonb))
$$;
create function public.tt_registry_write(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_subject public.tt_subject_catalog;new_subject public.tt_subject_catalog;old_department public.tt_departments;new_department public.tt_departments;n text:=btrim(payload->>'name');kind text:=payload->>'kind';enabled boolean:=coalesce((payload->>'active')::boolean,true);rank integer:=coalesce((payload->>'sort_order')::integer,100);key uuid;
begin
 perform pg_advisory_xact_lock(7720261119);
 if n is null or length(n) not between 1 and 200 then raise exception '명칭을 입력하세요.';end if;
 if kind='subject' then
  key:=nullif(payload->>'id','')::uuid;
  if exists(select 1 from public.tt_subject_catalog c where (c.name=n or n=any(c.aliases)) and (key is null or c.id<>key)) then raise exception '같은 과목 또는 기존 명칭이 이미 있습니다.';end if;
  if key is null then insert into public.tt_subject_catalog(name,active) values(n,enabled) returning * into new_subject;
  else
   select * into old_subject from public.tt_subject_catalog where id=key for update;
   if not found or old_subject.version is distinct from (payload->>'version')::integer then raise exception '다른 사람이 먼저 수정했습니다. 목록을 다시 불러오세요.';end if;
   update public.tt_subject_catalog set name=n,active=enabled,version=version+1,aliases=case when name<>n then array(select distinct a from unnest(aliases||array[name]) a where a<>n) else aliases end where id=key returning * into new_subject;
  end if;
  insert into public.tt_registry_history(kind,before_doc,after_doc) values(kind,case when key is not null then to_jsonb(old_subject) end,to_jsonb(new_subject));
 elsif kind='department' then
  if length(n)>80 or rank not between 0 and 1000 then raise exception '부서명·정렬 순서를 확인하세요.';end if;
  if coalesce(payload->>'original','')='' then insert into public.tt_departments(name,sort_order,active) values(n,rank,enabled) returning * into new_department;
  else
   select * into old_department from public.tt_departments where name=payload->>'original' for update;
   if not found or old_department.version is distinct from (payload->>'version')::integer then raise exception '다른 사람이 먼저 수정했습니다. 목록을 다시 불러오세요.';end if;
   update public.tt_departments set name=n,sort_order=rank,active=enabled,version=version+1 where name=old_department.name returning * into new_department;
  end if;
  insert into public.tt_registry_history(kind,before_doc,after_doc) values(kind,to_jsonb(old_department),to_jsonb(new_department));
 else raise exception '관리 항목을 확인하세요.';end if;
 return public.tt_registry_read();
end $$;
revoke all on function public.tt_sync_subject_catalog(),public.tt_registry_read(),public.tt_registry_write(jsonb) from public,anon,authenticated;
grant execute on function public.tt_sync_subject_catalog(),public.tt_registry_read(),public.tt_registry_write(jsonb) to service_role;
