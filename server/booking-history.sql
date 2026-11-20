create function public.tt_booking_history_list(first_day date,last_day date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>400 then raise exception '조회 기간을 확인하세요.';end if;
 return coalesce((select jsonb_agg(to_jsonb(h) order by h.id desc) from (select id,booking_id,at,action,(coalesce(after_doc,before_doc)-'applicant'-'phone'-'security_notes') snapshot from public.tt_booking_history where (coalesce(after_doc,before_doc)->>'starts_at')::timestamp>=first_day::timestamp and (coalesce(after_doc,before_doc)->>'starts_at')::timestamp<(last_day+1)::timestamp order by id desc limit 200) h),'[]'::jsonb);
end $$;
revoke all on function public.tt_booking_history_list(date,date) from public,anon,authenticated;
grant execute on function public.tt_booking_history_list(date,date) to service_role;
