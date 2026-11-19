-- Confidential reports for inappropriate anonymous notes.
create table if not exists public.notice_kindness_reports (
 id uuid primary key default gen_random_uuid(),
 note_id uuid not null references public.notice_kindness_notes(id),
 reporter_id uuid not null references auth.users(id),
 reason text not null check(length(trim(reason)) between 5 and 500),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(note_id,reporter_id)
);
alter table public.notice_kindness_reports enable row level security;
revoke all on public.notice_kindness_reports from anon,authenticated;
create or replace function public.notice_kindness_report(p_note uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_reason)) not between 5 and 500 then raise exception 'report reason must be 5-500 characters'; end if;
 if not exists(select 1 from public.notice_kindness_notes n
 where n.id=p_note and n.recipient_id=auth.uid() and n.channel='anonymous_thanks') then
  raise exception 'cannot report this note' using errcode='42501'; end if;
 insert into public.notice_kindness_reports(note_id,reporter_id,reason)
 values(p_note,auth.uid(),trim(p_reason)) on conflict(note_id,reporter_id) do nothing;
end;$$;
create or replace function public.notice_kindness_admin_reports()
returns table(report_id uuid,note_body text,reason text,submitted_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notice_profiles p where p.id=auth.uid() and p.status='active' and p.role='super') then
  raise exception 'super administrator only' using errcode='42501'; end if;
 return query select r.id,n.body,r.reason,r.created_at
 from public.notice_kindness_reports r join public.notice_kindness_notes n on n.id=r.note_id
 where r.resolved_at is null order by r.created_at desc limit 100;
end;$$;
revoke all on function public.notice_kindness_report(uuid,text) from public,anon;
revoke all on function public.notice_kindness_admin_reports() from public,anon;
grant execute on function public.notice_kindness_report(uuid,text) to authenticated;
grant execute on function public.notice_kindness_admin_reports() to authenticated;
