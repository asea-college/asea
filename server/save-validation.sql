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
 if exists (
 with cs as materialized(select x from jsonb_array_elements(next_doc->'courses') x),
 ts as materialized(select x->>'id' id from jsonb_array_elements(next_doc->'teachers') x),
 rs as materialized(select x->>'id' id from jsonb_array_elements(next_doc->'rooms') x)
 select 1 from jsonb_array_elements(next_doc->'lessons') l
 left join cs on cs.x->>'id'=l->>'courseId'
 left join ts on ts.id=l->>'teacherId'
 left join rs on rs.id=l->>'roomId'
 where l->>'courseId'='2026-kai' or cs.x is null or ts.id is null or rs.id is null
 or (cs.x->'groups' ? (l->>'group')) is distinct from true
 or (l->>'date')::date<(cs.x->>'start')::date or (l->>'date')::date>(cs.x->>'end')::date
 or (l->>'start')::time >= (l->>'end')::time or coalesce(l->>'title','')=''
 ) then raise exception '수업 날짜·시간·반·과목·통합 교수님·강의실을 확인하세요. KAI 일정은 기존 과정에서 수정하세요.'; end if;
 for k in select unnest(array['teachers','rooms']) loop
 for a in select value from jsonb_array_elements(old.document->k) loop
 if not exists(select 1 from jsonb_array_elements(next_doc->k) x where x->>'id'=a->>'id') then raise exception '공통 목록은 삭제 대신 사용 안 함으로 설정하세요.'; end if;
 if not exists(select 1 from jsonb_array_elements(next_doc->k) x where x->>'id'=a->>'id' and x->>'name'=a->>'name' and (k='teachers' or x->>'building'=a->>'building')) then if exists(select 1 from public.tt_slots(old.document,kai) s where case when k='teachers' then s.teacher else s.room end=a->>'id' and s.course='2026-kai') then raise exception 'KAI 연결 항목의 이름·건물 변경은 이관 검토가 필요합니다.'; end if; end if;
 end loop;end loop;
 with old_collisions as materialized (select signature from public.tt_collisions(old.document,kai)) select string_agg(c.description,E'\n') into problem from public.tt_collisions(next_doc,kai) c left join old_collisions o on o.signature=c.signature where o.signature is null;
 if problem is not null then raise exception '%',problem; end if;
 update public.tt_state set revision=revision+1,document=next_doc where id=true;
 insert into public.tt_audit(reason,before_doc,after_doc,restored_from) values(left(coalesce(reason,'변경'),1000),old.document,next_doc,restore_id);
 return jsonb_build_object('revision',old.revision+1,'document',next_doc);
end $function$
;
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
 with old_collisions as materialized (select signature from public.tt_collisions(doc,old.document)) select string_agg(c.description,E'\n') into problem from public.tt_collisions(doc,new.document) c left join old_collisions o on o.signature=c.signature where o.signature is null;
 if problem is not null then raise exception '%',problem;end if;
 return new;
end $function$
;
