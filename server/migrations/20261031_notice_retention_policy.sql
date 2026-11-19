-- ASEA Notice retention classification, additive and non-destructive.
-- This is a policy registry, NOT a deletion trigger or automatic retention job.
create table if not exists public.notice_retention_policy (
  record_kind text primary key check (record_kind in ('general_message','official_notice','business_record')),
  retention_years integer not null check (retention_years between 1 and 30),
  effective_from date not null default current_date,
  updated_at timestamptz not null default now(),
  notes text not null default ''
);
insert into public.notice_retention_policy(record_kind,retention_years,notes) values
 ('general_message',3,'Policy proposal: ordinary messages. Preserve if legal hold or other obligation.'),
 ('official_notice',5,'Policy proposal: official notices and receipt evidence.'),
 ('business_record',5,'Policy proposal: business evidence; verify applicable statutory rules.')
on conflict(record_kind) do nothing;
alter table public.notice_retention_policy enable row level security;
revoke all on table public.notice_retention_policy from anon, authenticated;
-- Read by authenticated users only. Changes require DB/service administrator.
grant select on table public.notice_retention_policy to authenticated;
drop policy if exists notice_retention_policy_read on public.notice_retention_policy;
create policy notice_retention_policy_read on public.notice_retention_policy
 for select to authenticated using (true);
comment on table public.notice_retention_policy is 'ASEA policy registry; no automatic deletion. Legal review and backup required before purging records.';
