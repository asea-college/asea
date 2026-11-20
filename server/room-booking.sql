create table public.tt_departments(name text primary key, sort_order integer not null);
insert into public.tt_departments values ('기획처',1),('교육처',2),('행정관리처',3),('입학처',4),('항공정비계열',5),('스마트안전진단계열',6),('항공관광계열',7),('항공보안계열',8),('국방경찰계열',9),('기종교육원',10),('무인항공교육원',11),('온라인평생교육원',12);
create table public.tt_bookings(
 id uuid primary key,series_id uuid not null,version integer not null default 1,
 starts_at timestamp not null,ends_at timestamp not null,rooms text[] not null,
 department text not null references public.tt_departments(name),category text not null check(category in ('대관','특강','행사','외부','기타')),
 purpose text not null check(length(btrim(purpose)) between 1 and 300),security_notes text not null default '' check(length(security_notes)<=2000),applicant text not null default '' check(length(applicant)<=80),phone text not null default '' check(length(phone)<=40),
 status text not null default 'active' check(status in ('active','cancelled')),updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '1 day'),check(cardinality(rooms) between 1 and 50)
);
create index tt_bookings_room_idx on public.tt_bookings using gin(rooms);
create index tt_bookings_time_idx on public.tt_bookings(starts_at,ends_at) where status='active';
create index tt_bookings_series_idx on public.tt_bookings(series_id);
create table public.tt_booking_history(id bigint generated always as identity primary key,booking_id uuid not null,at timestamptz not null default now(),action text not null,before_doc jsonb,after_doc jsonb);
create index tt_booking_history_booking_idx on public.tt_booking_history(booking_id,id desc);
create table public.tt_booking_requests(id uuid primary key,response jsonb not null,at timestamptz not null default now());
alter table public.tt_departments enable row level security;
alter table public.tt_bookings enable row level security;
alter table public.tt_booking_history enable row level security;
alter table public.tt_booking_requests enable row level security;
revoke all on public.tt_departments,public.tt_bookings,public.tt_booking_history,public.tt_booking_requests from public,anon,authenticated;
grant select on public.tt_departments to service_role;
grant select,insert,update,delete on public.tt_bookings to service_role;
grant select,insert on public.tt_booking_history,public.tt_booking_requests to service_role;
grant usage,select on sequence public.tt_booking_history_id_seq to service_role;

create function public.tt_booking_conflicts(items jsonb,skip_ids uuid[] default '{}') returns jsonb language sql stable security invoker set search_path='' as $$
 with pending as materialized(select x.id,x.starts_at,x.ends_at,x.rooms from jsonb_to_recordset(items) x(id uuid,starts_at timestamp,ends_at timestamp,rooms text[])),
 doc as materialized(select document from public.tt_state where id=true), kai as materialized(select document from public.kai_schedule_state where id='2026-kai'),
 slots as materialized(select s.*,(s.day||' '||s.starts)::timestamp a,(s.day||' '||s.ends)::timestamp b from doc,kai,public.tt_slots(doc.document,kai.document) s),
 conflicts as (
 select distinct jsonb_build_object('kind','lesson','id',s.id,'roomId',s.room,'courseId',s.course,'group',s.grp,'teacherId',s.teacher,'title',s.title,'date',s.day,'start',s.starts,'end',s.ends) value
 from pending p join slots s on s.room=any(p.rooms) and p.starts_at<s.b and p.ends_at>s.a
 union all
 select distinct jsonb_build_object('kind','booking','id',b.id,'roomId',r,'title','['||b.category||'] '||b.purpose,'date',to_char(b.starts_at,'YYYY-MM-DD'),'start',to_char(b.starts_at,'HH24:MI'),'end',to_char(b.ends_at,'HH24:MI'),'endDate',to_char(b.ends_at,'YYYY-MM-DD'))
 from pending p join public.tt_bookings b on b.status='active' and b.id<>all(skip_ids) and b.rooms&&p.rooms and p.starts_at<b.ends_at and p.ends_at>b.starts_at cross join lateral unnest(b.rooms) r where r=any(p.rooms)
 union all
 select distinct jsonb_build_object('kind','pending','id',b.id,'roomId',r,'title','입력한 반복·여러 날짜 예약끼리 겹칩니다.','date',to_char(b.starts_at,'YYYY-MM-DD'),'start',to_char(b.starts_at,'HH24:MI'),'end',to_char(b.ends_at,'HH24:MI'))
 from pending a join pending b on a.id<b.id and a.rooms&&b.rooms and a.starts_at<b.ends_at and a.ends_at>b.starts_at cross join lateral unnest(b.rooms) r where r=any(a.rooms)
 ) select coalesce(jsonb_agg(value),'[]'::jsonb) from (select value from conflicts limit 100) c
$$;

create function public.tt_booking_calendar(first_day date,last_day date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>400 then raise exception '조회 기간은 401일 이내로 선택하세요.';end if;
 return jsonb_build_object('departments',(select jsonb_agg(name order by sort_order) from public.tt_departments),'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'seriesId',series_id,'version',version,'date',to_char(starts_at,'YYYY-MM-DD'),'start',to_char(starts_at,'HH24:MI'),'end',to_char(ends_at,'HH24:MI'),'endDate',to_char(ends_at,'YYYY-MM-DD'),'roomIds',rooms,'department',department,'category',category,'purpose',purpose,'status',status) order by starts_at,id) from public.tt_bookings where starts_at>=first_day::timestamp and starts_at<(last_day+1)::timestamp),'[]'::jsonb));
end $$;

create function public.tt_booking_detail(booking_key uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('booking',(select to_jsonb(b) from public.tt_bookings b where b.id=booking_key),'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.id desc) from (select id,at,action,before_doc,after_doc from public.tt_booking_history where booking_id=booking_key order by id desc limit 100) h),'[]'::jsonb))
$$;

create function public.tt_booking_write(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.tt_bookings; row_data jsonb; items jsonb; clashes jsonb; result jsonb; saved public.tt_bookings; key uuid; request_key uuid; operation text; skip uuid[]:='{}'; doc jsonb;room_key text; n integer:=0;
begin
 perform pg_advisory_xact_lock(7720261119);
 request_key:=(payload->>'requestId')::uuid; if request_key is null then raise exception '요청 번호가 없습니다.';end if;
 select response into result from public.tt_booking_requests where id=request_key;if found then return result;end if;
 operation:=payload->>'operation'; key:=nullif(payload->>'id','')::uuid;
 select document->'rooms' into doc from public.tt_state where id=true;
 if operation in ('update','cancel','delete','reactivate') then
  select * into old from public.tt_bookings where id=key for update;
  if not found then raise exception '예약이 삭제되었거나 없습니다.';end if;
  if old.version is distinct from (payload->>'version')::integer then raise exception '다른 사람이 먼저 수정했습니다. 예약을 다시 열어 주세요.' using errcode='40001';end if;
  skip:=array[key];
 end if;
 if operation='create' or operation='update' then
  items:=payload->'items';
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 366 or (operation='update' and jsonb_array_length(items)<>1) then raise exception '한 번에 1~366개 날짜를 예약할 수 있습니다.';end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception '예약 번호가 중복되었습니다.';end if;
  for row_data in select value from jsonb_array_elements(items) loop
   if operation='update' and row_data->>'id'<>key::text then raise exception '수정할 예약이 일치하지 않습니다.';end if;
   if (row_data->>'starts_at')::timestamp is null or (row_data->>'ends_at')::timestamp is null or (row_data->>'ends_at')::timestamp<=(row_data->>'starts_at')::timestamp or (row_data->>'ends_at')::timestamp>(row_data->>'starts_at')::timestamp+interval '1 day' then raise exception '사용 날짜·시간을 확인하세요. 1회 예약은 최대 24시간입니다.';end if;
   if jsonb_typeof(row_data->'rooms') is distinct from 'array' or jsonb_array_length(row_data->'rooms') not between 1 and 50 or jsonb_array_length(row_data->'rooms')<>(select count(distinct value) from jsonb_array_elements_text(row_data->'rooms')) then raise exception '강의실을 중복 없이 선택하세요.';end if;
   for room_key in select jsonb_array_elements_text(row_data->'rooms') loop
    if not exists(select 1 from jsonb_array_elements(doc) r where r->>'id'=room_key and coalesce((r->>'active')::boolean,false)) then raise exception '현재 통합 DB에서 사용 중인 강의실을 선택하세요.';end if;
   end loop;
   if not exists(select 1 from public.tt_departments where name=row_data->>'department') or coalesce(row_data->>'category','') not in ('대관','특강','행사','외부','기타') or length(btrim(coalesce(row_data->>'purpose',''))) not between 1 and 300 then raise exception '신청부서·사용목적 분류·간단한 설명은 필수입니다.';end if;
  end loop;
  clashes:=public.tt_booking_conflicts(items,skip);
  if jsonb_array_length(clashes)>0 then return jsonb_build_object('ok',false,'conflicts',clashes,'error','겹치는 일정이 있어 전체 예약을 저장하지 않았습니다. 담당자와 상의하여 조율해 주세요.');end if;
  for row_data in select value from jsonb_array_elements(items) loop
   if operation='update' then
    update public.tt_bookings set starts_at=(row_data->>'starts_at')::timestamp,ends_at=(row_data->>'ends_at')::timestamp,rooms=array(select jsonb_array_elements_text(row_data->'rooms')),department=row_data->>'department',category=row_data->>'category',purpose=btrim(row_data->>'purpose'),security_notes=coalesce(row_data->>'security_notes',''),applicant=coalesce(row_data->>'applicant',''),phone=coalesce(row_data->>'phone',''),version=version+1,status='active',updated_at=now() where id=key returning * into saved;
   else
    insert into public.tt_bookings(id,series_id,starts_at,ends_at,rooms,department,category,purpose,security_notes,applicant,phone) values((row_data->>'id')::uuid,(payload->>'seriesId')::uuid,(row_data->>'starts_at')::timestamp,(row_data->>'ends_at')::timestamp,array(select jsonb_array_elements_text(row_data->'rooms')),row_data->>'department',row_data->>'category',btrim(row_data->>'purpose'),coalesce(row_data->>'security_notes',''),coalesce(row_data->>'applicant',''),coalesce(row_data->>'phone','')) returning * into saved;
   end if;
   insert into public.tt_booking_history(booking_id,action,before_doc,after_doc) values(saved.id,operation,case when operation='update' then to_jsonb(old) end,to_jsonb(saved));n:=n+1;
  end loop;
 elsif operation='reactivate' then
  clashes:=public.tt_booking_conflicts(jsonb_build_array(jsonb_build_object('id',old.id,'starts_at',old.starts_at,'ends_at',old.ends_at,'rooms',to_jsonb(old.rooms))),skip);
  if jsonb_array_length(clashes)>0 then return jsonb_build_object('ok',false,'conflicts',clashes,'error','겹치는 일정이 있어 취소를 복원하지 않았습니다.');end if;
  update public.tt_bookings set status='active',version=version+1,updated_at=now() where id=key returning * into saved;
  insert into public.tt_booking_history(booking_id,action,before_doc,after_doc) values(key,operation,to_jsonb(old),to_jsonb(saved));n:=1;
 elsif operation='cancel' or operation='delete' then
  if operation='cancel' then update public.tt_bookings set status='cancelled',version=version+1,updated_at=now() where id=key returning * into saved;
  else delete from public.tt_bookings where id=key;end if;
  insert into public.tt_booking_history(booking_id,action,before_doc,after_doc) values(key,operation,to_jsonb(old),case when operation='cancel' then to_jsonb(saved) end);n:=1;
 else raise exception '지원하지 않는 예약 작업입니다.';end if;
 result:=jsonb_build_object('ok',true,'count',n);insert into public.tt_booking_requests(id,response) values(request_key,result);return result;
end $$;

create function public.tt_guard_bookings() returns trigger language plpgsql security invoker set search_path='' as $$
declare doc jsonb;kai jsonb;problem text;
begin
 perform pg_advisory_xact_lock(7720261119);
 if not exists(select 1 from public.tt_bookings where status='active') then return new;end if;
 if tg_table_name='tt_state' then doc:=new.document;select document into kai from public.kai_schedule_state where id='2026-kai';else kai:=new.document;select document into doc from public.tt_state where id=true;end if;
 with slots as materialized(select * from public.tt_slots(doc,kai))
 select s.day||' '||s.starts||' '||s.title||' / ['||b.category||'] '||b.purpose into problem from slots s join public.tt_bookings b on b.status='active' and s.room=any(b.rooms) and (s.day||' '||s.starts)::timestamp<b.ends_at and (s.day||' '||s.ends)::timestamp>b.starts_at limit 1;
 if problem is not null then raise exception '확정된 강의실 예약과 겹칩니다: %. 예약 담당자와 상의하여 조율하세요.',problem;end if;
 return new;
end $$;
create trigger tt_reservation_cross_guard before update on public.tt_state for each row execute function public.tt_guard_bookings();
create trigger tt_reservation_cross_guard before update on public.kai_schedule_state for each row execute function public.tt_guard_bookings();
revoke all on function public.tt_booking_conflicts(jsonb,uuid[]),public.tt_booking_calendar(date,date),public.tt_booking_detail(uuid),public.tt_booking_write(jsonb),public.tt_guard_bookings() from public,anon,authenticated;
grant execute on function public.tt_booking_conflicts(jsonb,uuid[]),public.tt_booking_calendar(date,date),public.tt_booking_detail(uuid),public.tt_booking_write(jsonb),public.tt_guard_bookings() to service_role;

create policy tt_departments_private on public.tt_departments for all to anon,authenticated using(false) with check(false);
create policy tt_bookings_private on public.tt_bookings for all to anon,authenticated using(false) with check(false);
create policy tt_booking_history_private on public.tt_booking_history for all to anon,authenticated using(false) with check(false);
create policy tt_booking_requests_private on public.tt_booking_requests for all to anon,authenticated using(false) with check(false);
