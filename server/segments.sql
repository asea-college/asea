create or replace function public.tt_slots(doc jsonb,kai jsonb) returns table(id text,course text,grp text,day text,starts text,ends text,teacher text,room text,title text) language sql stable security invoker set search_path='' as $$
 select (e->>'id')||case when e ? 'segments' then '#'||s.n else '' end,e->>'courseId',e->>'group',e->>'date',s.seg->>'start',s.seg->>'end',e->>'teacherId',e->>'roomId',e->>'title'
 from jsonb_array_elements(doc->'lessons') e cross join lateral jsonb_array_elements(coalesce(e->'segments',jsonb_build_array(jsonb_build_object('start',e->>'start','end',e->>'end')))) with ordinality s(seg,n)
 union all
 select 'kai:'||(e->>'id'),'2026-kai',e->>'group',e->>'date',kai->'times'->(e->>'period')->>0,kai->'times'->(e->>'period')->>1,
 coalesce((select t->>'id' from jsonb_array_elements(doc->'teachers') t where t->>'name'=btrim(e->>'teacher') limit 1),'teacher-'||md5(btrim(e->>'teacher'))),
 coalesce((select r->>'id' from jsonb_array_elements(doc->'rooms') r where r->>'name'=btrim(e->>'room') and r->>'building'='본관' limit 1),'room-'||md5(btrim(e->>'room'))),e->>'title' from jsonb_array_elements(kai->'events') e
$$;
create function public.tt_validate_segments() returns trigger language plpgsql security invoker set search_path='' as $$
declare e jsonb; s jsonb; prev text; first_start text; total integer;
begin
for e in select value from jsonb_array_elements(new.document->'lessons') loop
 if not (e ? 'segments') then continue;end if;
 if jsonb_typeof(e->'segments')<>'array' or jsonb_array_length(e->'segments') not between 1 and 24 then raise exception '수업 교시 구간을 확인하세요.';end if;
 prev:='00:00';first_start:=null;total:=0;
 for s in select value from jsonb_array_elements(e->'segments') loop
 if coalesce(s->>'start','')!~'^([01]\d|2[0-3]):[0-5]\d$' or coalesce(s->>'end','')!~'^([01]\d|2[0-3]):[0-5]\d$' or s->>'start'<prev or s->>'start'>=s->>'end' then raise exception '수업 교시 구간이 겹치거나 시간이 잘못되었습니다.';end if;
 first_start:=coalesce(first_start,s->>'start');prev:=s->>'end';total:=total+(extract(epoch from ((s->>'end')::time-(s->>'start')::time))/60)::int;
 end loop;
 if first_start is distinct from e->>'start' or prev is distinct from e->>'end' or (e->>'teachingMinutes')::int is distinct from total then raise exception '수업 표시 시간과 실제 교시 시간이 일치하지 않습니다.';end if;
end loop;return new;
end $$;
create trigger tt_validate_segments_before_save before update on public.tt_state for each row execute function public.tt_validate_segments();
revoke execute on function public.tt_validate_segments() from public,anon,authenticated;
grant execute on function public.tt_validate_segments() to service_role;

