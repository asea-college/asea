CREATE OR REPLACE FUNCTION public.tt_ai_quota(daily_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare c integer; k text:='ai-usage-'||to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'); begin perform pg_advisory_xact_lock(7720261120); select (value->>'count')::integer into c from public.tt_private where id=k; c:=coalesce(c,0); if c>=daily_limit then raise exception '오늘 AI 호출 한도를 초과했습니다.';end if; insert into public.tt_private(id,value) values(k,jsonb_build_object('count',c+1)) on conflict(id) do update set value=excluded.value;return c+1;end $function$

CREATE OR REPLACE FUNCTION public.tt_collisions(doc jsonb, kai jsonb)
 RETURNS TABLE(signature text, description text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with s as (select * from public.tt_slots(doc,kai))
 select a.id||'|'||b.id||'|'||a.day||'|'||a.starts||'|'||b.starts||'|'||a.ends||'|'||b.ends||'|'||v.kind||'|'||v.resource,
 a.day||' '||a.starts||' '||a.title||' / '||b.title||' : '||v.kind
 from s a join s b on a.id<b.id and a.day=b.day and a.starts<b.ends and b.starts<a.ends
 cross join lateral (values ('교수님',case when a.teacher=b.teacher then a.teacher end),('강의실',case when a.room=b.room then a.room end),('반',case when a.course=b.course and a.grp=b.grp then a.course||a.grp end)) v(kind,resource) where v.resource is not null and v.resource<>''
$function$

CREATE OR REPLACE FUNCTION public.tt_guard_kai()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare doc jsonb; problem text;
begin
 perform pg_advisory_xact_lock(7720261119);
 select document into doc from public.tt_state where id=true;
 if doc is null then return new; end if;
 select string_agg(c.description,E'\n') into problem from public.tt_collisions(doc,new.document) c where not exists(select 1 from public.tt_collisions(doc,old.document) o where o.signature=c.signature);
 if problem is not null then raise exception '%',problem;end if;
 return new;
end $function$

CREATE OR REPLACE FUNCTION public.tt_read()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with s as(select * from public.tt_state where id=true),k as(select document from public.kai_schedule_state where id='2026-kai'),
teachers as(select s.document->'teachers'||coalesce((select jsonb_agg(jsonb_build_object('id','teacher-'||md5(n),'name',n,'affiliation','','active',true)) from(select distinct btrim(e->>'teacher') n from k,jsonb_array_elements(k.document->'events') e where coalesce(btrim(e->>'teacher'),'') not in ('','KAI') and not exists(select 1 from jsonb_array_elements(s.document->'teachers') t where t->>'name'=btrim(e->>'teacher'))) x),'[]'::jsonb) arr from s),
rooms as(select s.document->'rooms'||coalesce((select jsonb_agg(jsonb_build_object('id','room-'||md5(n),'name',n,'building','본관','capacity',0,'active',true)) from(select distinct btrim(e->>'room') n from k,jsonb_array_elements(k.document->'events') e where coalesce(btrim(e->>'room'),'')<>'' and not exists(select 1 from jsonb_array_elements(s.document->'rooms') r where r->>'name'=btrim(e->>'room') and r->>'building'='본관')) x),'[]'::jsonb) arr from s)
select jsonb_build_object('revision',s.revision,'document',jsonb_set(jsonb_set(s.document,'{teachers}',teachers.arr),'{rooms}',rooms.arr)) from s,teachers,rooms
$function$

CREATE OR REPLACE FUNCTION public.tt_save(base_revision integer, next_doc jsonb, reason text, restore_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare old public.tt_state; kai jsonb; problem text; saved jsonb; a jsonb; b jsonb; k text; ids integer;
begin
 perform pg_advisory_xact_lock(7720261119);
 select * into old from public.tt_state where id=true for update;
 if old.revision<>base_revision then raise exception '다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.' using errcode='40001'; end if;
 select document into kai from public.kai_schedule_state where id='2026-kai';
 if next_doc is null or length(next_doc::text)>3000000 then raise exception '자료 크기 또는 형식 오류'; end if;
 foreach k in array array['courses','teachers','rooms','lessons'] loop
 if jsonb_typeof(next_doc->k) is distinct from 'array' or jsonb_array_length(next_doc->k)>20000 then raise exception '자료 배열 오류: %',k; end if;
 select count(distinct x->>'id') into ids from jsonb_array_elements(next_doc->k) x where coalesce(x->>'id','')<>'';
 if ids<>jsonb_array_length(next_doc->k) then raise exception '중복되거나 빈 ID: %',k; end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(next_doc->'courses') x where x->>'id'='2026-kai') then raise exception '기존 KAI 과정은 유지해야 합니다.'; end if;
 for a in select value from jsonb_array_elements(next_doc->'courses') loop
 if coalesce(a->>'name','')='' or a->>'start'>a->>'end' or jsonb_typeof(a->'groups')<>'array' then raise exception '과정명·기간·반을 확인하세요.'; end if;
 end loop;
 for a in select value from jsonb_array_elements(next_doc->'lessons') loop
 if a->>'courseId'='2026-kai' then raise exception 'KAI 일정은 기존 과정 시간표에서 수정하세요.'; end if;
 select x into b from jsonb_array_elements(next_doc->'courses') x where x->>'id'=a->>'courseId';
 if b is null or not (b->'groups' ? (a->>'group')) or (a->>'date')::date<(b->>'start')::date or (a->>'date')::date>(b->>'end')::date or (a->>'start')::time >= (a->>'end')::time or coalesce(a->>'title','')='' then raise exception '수업 날짜·시간·반·과목을 확인하세요.'; end if;
 if not exists(select 1 from jsonb_array_elements(next_doc->'teachers') x where x->>'id'=a->>'teacherId') or not exists(select 1 from jsonb_array_elements(next_doc->'rooms') x where x->>'id'=a->>'roomId') then raise exception '통합 교수님·강의실을 선택하세요.'; end if;
 end loop;
 for k in select unnest(array['teachers','rooms']) loop
 for a in select value from jsonb_array_elements(old.document->k) loop
 if not exists(select 1 from jsonb_array_elements(next_doc->k) x where x->>'id'=a->>'id') then raise exception '공통 목록은 삭제 대신 사용 안 함으로 설정하세요.'; end if;
 if exists(select 1 from public.tt_slots(old.document,kai) s where case when k='teachers' then s.teacher else s.room end=a->>'id' and s.course='2026-kai') and not exists(select 1 from jsonb_array_elements(next_doc->k) x where x->>'id'=a->>'id' and x->>'name'=a->>'name' and (k='teachers' or x->>'building'=a->>'building')) then raise exception 'KAI 연결 항목의 이름·건물 변경은 이관 검토가 필요합니다.'; end if;
 end loop;end loop;
 select string_agg(c.description,E'\n') into problem from public.tt_collisions(next_doc,kai) c where not exists(select 1 from public.tt_collisions(old.document,kai) o where o.signature=c.signature);
 if problem is not null then raise exception '%',problem; end if;
 update public.tt_state set revision=revision+1,document=next_doc where id=true;
 insert into public.tt_audit(reason,before_doc,after_doc,restored_from) values(left(coalesce(reason,'변경'),1000),old.document,next_doc,restore_id);
 return jsonb_build_object('revision',old.revision+1,'document',next_doc);
end $function$

CREATE OR REPLACE FUNCTION public.tt_slots(doc jsonb, kai jsonb)
 RETURNS TABLE(id text, course text, grp text, day text, starts text, ends text, teacher text, room text, title text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select e->>'id',e->>'courseId',e->>'group',e->>'date',e->>'start',e->>'end',e->>'teacherId',e->>'roomId',e->>'title' from jsonb_array_elements(doc->'lessons') e
 union all
 select 'kai:'||(e->>'id'),'2026-kai',e->>'group',e->>'date',kai->'times'->(e->>'period')->>0,kai->'times'->(e->>'period')->>1,
 coalesce((select t->>'id' from jsonb_array_elements(doc->'teachers') t where t->>'name'=btrim(e->>'teacher') limit 1),'teacher-'||md5(btrim(e->>'teacher'))),
 coalesce((select r->>'id' from jsonb_array_elements(doc->'rooms') r where r->>'name'=btrim(e->>'room') and r->>'building'='본관' limit 1),'room-'||md5(btrim(e->>'room'))),e->>'title' from jsonb_array_elements(kai->'events') e
$function$

CREATE OR REPLACE FUNCTION public.tt_validate_registry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a jsonb; item jsonb; k text;
begin
foreach k in array array['teachers','rooms'] loop
for a in select value from jsonb_array_elements(new.document->k) loop
if jsonb_typeof(a->'name') is distinct from 'string' or length(btrim(a->>'name')) not between 1 and 150 or jsonb_typeof(a->'active') is distinct from 'boolean' then raise exception '공통 목록의 이름·사용 여부를 확인하세요.'; end if;
if k='rooms' and (coalesce(a->>'building','')='' or coalesce(a->>'capacity','')!~'^\d+$') then raise exception '강의실 건물·수용 인원을 확인하세요.'; end if;
end loop;
if exists(select 1 from jsonb_array_elements(new.document->k) rr group by btrim(rr->>'name'),case when k='teachers' then btrim(coalesce(rr->>'affiliation','')) else btrim(rr->>'building') end having count(*)>1) then raise exception '통합 목록에 중복 이름·소속 또는 건물·호실이 있습니다.';end if;
end loop;
for a in select value from jsonb_array_elements(new.document->'courses') loop
if coalesce(a->>'name','')='' or coalesce(a->>'start','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(a->>'end','')!~'^\d{4}-\d{2}-\d{2}$' or (a->>'start')::date>(a->>'end')::date or jsonb_array_length(a->'groups')=0 then raise exception '과정명·운영 기간·반을 확인하세요.';end if;
end loop;
for a in select value from jsonb_array_elements(new.document->'lessons') loop
if a->>'id' like 'kai:%' or coalesce(a->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(a->>'start','')!~'^([01]\d|2[0-3]):[0-5]\d$' or coalesce(a->>'end','')!~'^([01]\d|2[0-3]):[0-5]\d$' or coalesce(a->>'group','')='' or coalesce(a->>'teacherId','')='' or coalesce(a->>'roomId','')='' or coalesce(a->>'title','')='' then raise exception '수업 필수 항목·시간 형식 오류';end if;
end loop;
return new;
end $function$

