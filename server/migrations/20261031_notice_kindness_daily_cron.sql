-- Daily assignment at 09:00 KST (00:00 UTC), weekdays only.
-- pg_cron already enabled in this Supabase project and cron.timezone = GMT.
-- It creates metadata assignments only, NOT push messages or purchases.
create or replace function notice_private.assign_kindness_today()
returns integer language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date;
 p record; other uuid; n integer := 0; codes text[] := array['greeting','gratitude','help','encourage','coffee_optional'];
begin
 if extract(isodow from today)>5 then return 0; end if;
 perform pg_advisory_xact_lock(20261031,1);
 for p in
  select a.id,a.department_id from public.notice_profiles a
  left join public.notice_kindness_preferences opt on opt.user_id=a.id
  where a.status='active' and not coalesce(opt.opted_out,false)
  and not exists(select 1 from public.notice_kindness_missions x where x.actor_id=a.id and x.mission_day=today)
  order by a.id
 loop
  select a.id into other from public.notice_profiles a
  left join public.notice_kindness_preferences opt on opt.user_id=a.id
  where a.status='active' and a.id<>p.id and not coalesce(opt.opted_out,false)
  order by case when a.department_id is distinct from p.department_id then 0 else 1 end,random() limit 1;
  if other is null then continue; end if;
  insert into public.notice_kindness_missions(mission_day,actor_id,recipient_id,mission_code)
  values(today,p.id,other,codes[(n%5)+1]) on conflict do nothing;
  n := n + 1;
 end loop;
 return n;
end;$$;
revoke all on function notice_private.assign_kindness_today() from public,anon,authenticated;
-- Cron runs as trusted DB owner; never expose this function through REST API.
select cron.schedule('asea-ieum-kindness-0900-kst','0 0 * * 1-5','select notice_private.assign_kindness_today()');
