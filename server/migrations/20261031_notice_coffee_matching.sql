-- Optional coffee-meet opt-in and consented matches.
create table if not exists public.notice_coffee_participants (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.notice_coffee_participants enable row level security;
revoke all on public.notice_coffee_participants from anon,authenticated;

create or replace function public.notice_coffee_participate(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notice_profiles where id=auth.uid() and status='active') then
  raise exception 'approved staff only' using errcode='42501'; end if;
 insert into public.notice_coffee_participants(user_id,enabled) values(auth.uid(),p_enabled)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
end;$$;
create or replace function public.notice_coffee_match()
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); partner uuid; room uuid; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if not exists(select 1 from public.notice_profiles p join public.notice_coffee_participants s on s.user_id=p.id
 where p.id=me and p.status='active' and s.enabled) then raise exception 'join coffee matching first' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(20261031,2);
 select m.id into room from public.notice_coffee_matches m
 where m.match_day=today and (m.first_id=me or m.second_id=me) limit 1;
 if room is not null then return room; end if;
 select candidate.id into partner from public.notice_profiles candidate
 join public.notice_coffee_participants cp on cp.user_id=candidate.id and cp.enabled
 left join public.notice_profiles self on self.id=me
 where candidate.status='active' and candidate.id<>me
 and not exists(select 1 from public.notice_coffee_matches m
 where m.match_day=today and (m.first_id=candidate.id or m.second_id=candidate.id))
 order by case when candidate.department_id is distinct from self.department_id then 0 else 1 end,random() limit 1;
 if partner is null then return null; end if;
 insert into public.notice_coffee_matches(match_day,first_id,second_id) values(today,me,partner) returning id into room;
 return room;
end;$$;
create or replace function public.notice_coffee_my_match()
returns table(enabled boolean,partner_name text,partner_department text,match_id uuid,my_acceptance boolean,partner_acceptance boolean)
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if not exists(select 1 from public.notice_profiles where id=me and status='active') then raise exception 'approved staff only' using errcode='42501'; end if;
 return query select coalesce(opt.enabled,false),p.full_name,d.name,m.id,
 case when m.first_id=me then m.accepted_first else m.accepted_second end,
 case when m.first_id=me then m.accepted_second else m.accepted_first end
 from (select me as uid) myself
 left join public.notice_coffee_participants opt on opt.user_id=me
 left join public.notice_coffee_matches m on m.match_day=today and (m.first_id=me or m.second_id=me)
 left join public.notice_profiles p on p.id=(case when m.first_id=me then m.second_id else m.first_id end)
 left join public.notice_departments d on d.id=p.department_id;
end;$$;
create or replace function public.notice_coffee_respond(p_match uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 update public.notice_coffee_matches m
 set accepted_first=case when m.first_id=me then p_accept else m.accepted_first end,
 accepted_second=case when m.second_id=me then p_accept else m.accepted_second end
 where m.id=p_match and m.match_day=(now() at time zone 'Asia/Seoul')::date and (m.first_id=me or m.second_id=me);
 if not found then raise exception 'not your match' using errcode='42501'; end if;
end;$$;
do $$ declare n text; begin
 foreach n in array array['notice_coffee_participate(boolean)','notice_coffee_match()','notice_coffee_my_match()','notice_coffee_respond(uuid,boolean)'] loop
 execute 'revoke all on function public.'||n||' from public,anon';
 execute 'grant execute on function public.'||n||' to authenticated';
 end loop;
end $$;
