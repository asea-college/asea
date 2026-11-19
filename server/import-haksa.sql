CREATE OR REPLACE FUNCTION public.tt_import_haksa(base_revision integer, next_doc jsonb, reason text, restore_id bigint DEFAULT NULL::bigint)
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
 if restore_id is not null or exists(select 1 from jsonb_array_elements(old.document->'courses') x where x->>'id'='credit-bank-2026-2') then raise exception '학점은행제 원본은 최초 1회만 등록할 수 있습니다.';end if;
 foreach k in array array['courses','teachers','rooms','lessons'] loop
 if (select coalesce(jsonb_agg(x.val order by x.n),'[]'::jsonb) from jsonb_array_elements(next_doc->k) with ordinality x(val,n) where n<=jsonb_array_length(old.document->k)) is distinct from old.document->k then raise exception '원본 등록 중 기존 자료를 변경할 수 없습니다.';end if;
 end loop;
 if jsonb_array_length(next_doc->'courses')<>jsonb_array_length(old.document->'courses')+1 or next_doc->'courses'->-1->>'id'<>'credit-bank-2026-2' then raise exception '등록 대상 과정이 올바르지 않습니다.';end if;
 for a in select x.val from jsonb_array_elements(next_doc->'lessons') with ordinality x(val,n) where n>jsonb_array_length(old.document->'lessons') loop
 if a->>'courseId'<>'credit-bank-2026-2' then raise exception '다른 과정의 신규 수업은 포함할 수 없습니다.';end if;
 end loop;

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
 -- Explicitly authorized source baseline import. Normal tt_save continues to reject every new collision.
 update public.tt_state set revision=revision+1,document=next_doc where id=true;
 insert into public.tt_audit(reason,before_doc,after_doc,restored_from) values(left(coalesce(reason,'변경'),1000),old.document,next_doc,restore_id);
 return jsonb_build_object('revision',old.revision+1,'document',next_doc);
end $function$
;
revoke execute on function public.tt_import_haksa(integer,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.tt_import_haksa(integer,jsonb,text,bigint) to service_role;

