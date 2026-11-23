-- ASEA budget workflow: isolated tables and functions for the asea-workspace project.
create schema if not exists budget_private;
revoke all on schema budget_private from public, anon;
grant usage on schema budget_private to authenticated;

create table if not exists public.budget_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.budget_departments (code,name,sort_order) values
 ('1-2-VOC','교육처 · 직업훈련팀',10),
 ('1-2-ACA','교육처 · 학사운영팀',20),
 ('2-1','항공정비계열',30),
 ('2-2','스마트안전진단계열',40),
 ('2-4','항공보안계열',50),
 ('2-5','국방경찰계열',60),
 ('2-6','군사교육단',70),
 ('3-1','기종교육원',80),
 ('3-3','무인항공교육원',90)
on conflict (code) do update set name=excluded.name, sort_order=excluded.sort_order;

create table if not exists public.budget_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  department_id uuid references public.budget_departments(id),
  role text not null default 'staff' check (role in ('staff','dept_budget','dept_head','budget_admin','executive')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  fiscal_year integer not null,
  department_id uuid not null references public.budget_departments(id),
  account_code text not null,
  account_name text not null,
  category text not null default '',
  allocated_amount bigint not null check (allocated_amount >= 0),
  approved_amount bigint check (approved_amount is null or approved_amount >= 0),
  basis text not null default '',
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year,department_id,account_code)
);

create table if not exists public.budget_allocation_reviews (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.budget_allocations(id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references auth.users(id),
  decision text not null check (decision in ('approve','reject')),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.budget_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default ('BR-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  fiscal_year integer not null,
  department_id uuid not null references public.budget_departments(id),
  allocation_id uuid not null references public.budget_allocations(id),
  title text not null,
  purpose text not null default '',
  requested_amount bigint not null default 0 check (requested_amount >= 0),
  approved_amount bigint check (approved_amount is null or approved_amount >= 0),
  status text not null default 'draft' check (status in ('draft','review_department','review_budget','returned','rejected','approved','complete')),
  groupware_document_no text not null default '',
  groupware_url text not null default '',
  submitted_at timestamptz,
  approved_at timestamptz,
  public_token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.budget_requests(id) on delete cascade,
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default '식',
  unit_price bigint not null check (unit_price >= 0),
  line_amount bigint generated always as (round(quantity * unit_price)::bigint) stored,
  basis text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.budget_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.budget_requests(id) on delete cascade,
  stage text not null check (stage in ('department','budget')),
  reviewer_id uuid not null default auth.uid() references auth.users(id),
  decision text not null check (decision in ('approve','reject','return')),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.budget_actuals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.budget_requests(id),
  amount bigint not null check (amount > 0),
  spent_on date not null default current_date,
  evidence_url text not null default '',
  note text not null default '',
  is_final boolean not null default true,
  recorded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.budget_activity_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists budget_allocations_department_year_idx on public.budget_allocations(department_id,fiscal_year,status);
create index if not exists budget_requests_department_year_idx on public.budget_requests(department_id,fiscal_year,status);
create index if not exists budget_requests_allocation_idx on public.budget_requests(allocation_id);
create index if not exists budget_request_lines_request_idx on public.budget_request_lines(request_id);
create index if not exists budget_actuals_request_idx on public.budget_actuals(request_id,spent_on);
create index if not exists budget_activity_entity_idx on public.budget_activity_log(entity_type,entity_id,created_at desc);

create table if not exists budget_private.bootstrap_codes (
  code_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '14 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);
alter table budget_private.bootstrap_codes enable row level security;
revoke all on budget_private.bootstrap_codes from public, anon, authenticated;

create or replace function budget_private.current_role()
returns text language sql stable security definer set search_path = ''
as $$ select p.role from public.budget_profiles p where p.user_id=(select auth.uid()) and p.is_active $$;
create or replace function budget_private.current_department_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select p.department_id from public.budget_profiles p where p.user_id=(select auth.uid()) and p.is_active $$;
revoke all on function budget_private.current_role() from public, anon;
revoke all on function budget_private.current_department_id() from public, anon;
grant execute on function budget_private.current_role() to authenticated;
grant execute on function budget_private.current_department_id() to authenticated;

-- Signed-in users create their own staff profile. The RLS policy below restricts insertion to the current user.

create or replace function budget_private.log_budget_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_row jsonb; v_id uuid;
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id := (v_row->>'id')::uuid;
  insert into public.budget_activity_log(entity_type,entity_id,action,actor_id,details)
  values(tg_table_name,v_id,lower(tg_op),auth.uid(),v_row-'public_token');
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger budget_allocations_audit after insert or update on public.budget_allocations for each row execute function budget_private.log_budget_change();
create trigger budget_requests_audit after insert or update on public.budget_requests for each row execute function budget_private.log_budget_change();
create trigger budget_actuals_audit after insert on public.budget_actuals for each row execute function budget_private.log_budget_change();

create or replace function budget_private.issue_initial_admin_code()
returns text language plpgsql security definer set search_path = ''
as $$
declare v_code text;
begin
  if exists(select 1 from public.budget_profiles where role in ('budget_admin','executive') and is_active) then
    raise exception 'An active budget administrator already exists';
  end if;
  if exists(select 1 from budget_private.bootstrap_codes where used_at is null and expires_at>now()) then
    raise exception 'An unused bootstrap code already exists';
  end if;
  v_code := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into budget_private.bootstrap_codes(code_hash) values(v_code);
  return v_code;
end;
$$;
revoke all on function budget_private.issue_initial_admin_code() from public, anon, authenticated;

create or replace function public.budget_claim_initial_admin(p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_hash text;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if exists(select 1 from public.budget_profiles where role in ('budget_admin','executive') and is_active) then
    raise exception 'Budget administrator is already configured';
  end if;
  v_hash := p_code;
  update budget_private.bootstrap_codes set used_at=now(),used_by=v_uid
  where code_hash=v_hash and used_at is null and expires_at>now();
  if not found then raise exception 'Invalid or expired activation code'; end if;
  update public.budget_profiles set role='budget_admin',is_active=true,updated_at=now() where user_id=v_uid;
  if not found then raise exception 'User profile is not ready'; end if;
  return true;
end;
$$;
revoke all on function public.budget_claim_initial_admin(text) from public, anon;
grant execute on function public.budget_claim_initial_admin(text) to authenticated;

create or replace function public.budget_submit_allocation(p_allocation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.budget_allocations%rowtype; v_role text := budget_private.current_role(); v_dept uuid := budget_private.current_department_id();
begin
  select * into v_row from public.budget_allocations where id=p_allocation_id for update;
  if not found then raise exception 'Budget line not found'; end if;
  if v_row.status not in ('draft','rejected') then raise exception 'Only draft or rejected lines can be submitted'; end if;
  if not (v_role in ('budget_admin','dept_budget','dept_head') and (v_role='budget_admin' or v_row.department_id=v_dept)) then raise exception 'Not authorized'; end if;
  update public.budget_allocations set status='submitted',updated_at=now() where id=p_allocation_id;
end;
$$;

create or replace function public.budget_review_allocation(p_allocation_id uuid,p_decision text,p_comment text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.budget_allocations%rowtype; v_role text := budget_private.current_role();
begin
  if v_role not in ('budget_admin','executive') then raise exception 'Only budget management or executive users can review allocations'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  select * into v_row from public.budget_allocations where id=p_allocation_id for update;
  if not found or v_row.status<>'submitted' then raise exception 'Submitted budget line not found'; end if;
  if v_row.created_by=auth.uid() then raise exception 'A user cannot review their own budget line'; end if;
  update public.budget_allocations set status=case when p_decision='approve' then 'approved' else 'rejected' end,
    approved_amount=case when p_decision='approve' then allocated_amount else null end,updated_at=now() where id=p_allocation_id;
  insert into public.budget_allocation_reviews(allocation_id,decision,comment) values(p_allocation_id,p_decision,coalesce(p_comment,''));
end;
$$;

create or replace function public.budget_submit_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.budget_requests%rowtype; v_role text := budget_private.current_role(); v_dept uuid := budget_private.current_department_id(); v_total bigint;
begin
  select * into v_row from public.budget_requests where id=p_request_id for update;
  if not found or v_row.created_by<>auth.uid() then raise exception 'Request not found or not yours'; end if;
  if v_row.department_id<>v_dept or v_role not in ('staff','dept_budget','dept_head') then raise exception 'Not authorized'; end if;
  if v_row.status not in ('draft','returned') then raise exception 'Request cannot be submitted in this status'; end if;
  select coalesce(sum(line_amount),0) into v_total from public.budget_request_lines where request_id=p_request_id;
  if v_total<=0 then raise exception 'Add at least one cost item'; end if;
  if not exists(select 1 from public.budget_allocations a where a.id=v_row.allocation_id and a.status='approved' and a.department_id=v_row.department_id and a.fiscal_year=v_row.fiscal_year) then raise exception 'An approved budget line is required'; end if;
  update public.budget_requests set requested_amount=v_total,status='review_department',submitted_at=now(),updated_at=now() where id=p_request_id;
end;
$$;

create or replace function public.budget_review_request(p_request_id uuid,p_decision text,p_comment text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.budget_requests%rowtype; v_role text := budget_private.current_role(); v_dept uuid := budget_private.current_department_id(); v_stage text;
begin
  if p_decision not in ('approve','reject','return') then raise exception 'Invalid decision'; end if;
  select * into v_row from public.budget_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_row.created_by=auth.uid() then raise exception 'A user cannot review their own request'; end if;
  if v_row.status='review_department' and v_role in ('dept_head','budget_admin') and (v_role='budget_admin' or v_row.department_id=v_dept) then
    v_stage:='department';
    update public.budget_requests set status=case p_decision when 'approve' then 'review_budget' when 'reject' then 'rejected' else 'returned' end,updated_at=now() where id=p_request_id;
  elsif v_row.status='review_budget' and v_role in ('budget_admin','executive') then
    v_stage:='budget';
    update public.budget_requests set status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
      approved_amount=case when p_decision='approve' then requested_amount else null end,
      approved_at=case when p_decision='approve' then now() else null end,updated_at=now() where id=p_request_id;
  else raise exception 'Not authorized for this review stage'; end if;
  insert into public.budget_reviews(request_id,stage,decision,comment) values(p_request_id,v_stage,p_decision,coalesce(p_comment,''));
end;
$$;

create or replace function public.budget_link_groupware(p_request_id uuid,p_document_no text,p_document_url text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.budget_requests%rowtype; v_role text := budget_private.current_role();
begin
  select * into v_row from public.budget_requests where id=p_request_id for update;
  if not found or v_row.status not in ('approved','complete') then raise exception 'Only approved requests can be linked'; end if;
  if v_role not in ('budget_admin','dept_budget','dept_head') or (v_role<>'budget_admin' and v_row.department_id<>budget_private.current_department_id()) then raise exception 'Not authorized'; end if;
  if length(trim(coalesce(p_document_no,'')))=0 then raise exception 'Document number is required'; end if;
  update public.budget_requests set groupware_document_no=left(trim(p_document_no),120),groupware_url=left(coalesce(p_document_url,''),1000),updated_at=now() where id=p_request_id;
end;
$$;

create or replace function public.budget_record_actual(p_request_id uuid,p_amount bigint,p_spent_on date,p_evidence_url text default '',p_note text default '',p_is_final boolean default true)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.budget_requests%rowtype; v_role text := budget_private.current_role(); v_total bigint;
begin
  select * into v_row from public.budget_requests where id=p_request_id for update;
  if not found or v_row.status not in ('approved','complete') then raise exception 'Only approved requests can have actuals'; end if;
  if v_role not in ('budget_admin','dept_budget','dept_head') or (v_role<>'budget_admin' and v_row.department_id<>budget_private.current_department_id()) then raise exception 'Not authorized'; end if;
  if v_row.status='complete' then raise exception 'Request is already marked complete'; end if;
  if p_amount<=0 then raise exception 'Actual amount must be positive'; end if;
  select coalesce(sum(amount),0)+p_amount into v_total from public.budget_actuals where request_id=p_request_id;
  if v_total>coalesce(v_row.approved_amount,v_row.requested_amount) then raise exception 'Actual total exceeds the approved amount'; end if;
  insert into public.budget_actuals(request_id,amount,spent_on,evidence_url,note,is_final) values(p_request_id,p_amount,coalesce(p_spent_on,current_date),left(coalesce(p_evidence_url,''),1000),left(coalesce(p_note,''),2000),p_is_final);
  if p_is_final then update public.budget_requests set status='complete',updated_at=now() where id=p_request_id; end if;
end;
$$;

create or replace function public.budget_public_summary(p_token text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'request_no',r.request_no,'fiscal_year',r.fiscal_year,'title',r.title,'purpose',r.purpose,
    'department',d.name,'account_code',a.account_code,'account_name',a.account_name,
    'approved_amount',coalesce(r.approved_amount,r.requested_amount),
    'actual_amount',coalesce((select sum(x.amount) from public.budget_actuals x where x.request_id=r.id),0),
    'status',r.status,'groupware_document_no',r.groupware_document_no,'submitted_at',r.submitted_at,'approved_at',r.approved_at,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity,'unit',l.unit,'unit_price',l.unit_price,'line_amount',l.line_amount,'basis',l.basis) order by l.created_at) from public.budget_request_lines l where l.request_id=r.id),'[]'::jsonb)
  )
  from public.budget_requests r join public.budget_departments d on d.id=r.department_id join public.budget_allocations a on a.id=r.allocation_id
  where r.public_token=p_token and r.status in ('approved','complete')
  limit 1;
$$;

revoke all on function public.budget_submit_allocation(uuid) from public, anon;
revoke all on function public.budget_review_allocation(uuid,text,text) from public, anon;
revoke all on function public.budget_submit_request(uuid) from public, anon;
revoke all on function public.budget_review_request(uuid,text,text) from public, anon;
revoke all on function public.budget_link_groupware(uuid,text,text) from public, anon;
revoke all on function public.budget_record_actual(uuid,bigint,date,text,text,boolean) from public, anon;
revoke all on function public.budget_public_summary(text) from public;
grant execute on function public.budget_submit_allocation(uuid) to authenticated;
grant execute on function public.budget_review_allocation(uuid,text,text) to authenticated;
grant execute on function public.budget_submit_request(uuid) to authenticated;
grant execute on function public.budget_review_request(uuid,text,text) to authenticated;
grant execute on function public.budget_link_groupware(uuid,text,text) to authenticated;
grant execute on function public.budget_record_actual(uuid,bigint,date,text,text,boolean) to authenticated;
grant execute on function public.budget_public_summary(text) to anon, authenticated;

alter table public.budget_departments enable row level security;
alter table public.budget_profiles enable row level security;
alter table public.budget_allocations enable row level security;
alter table public.budget_allocation_reviews enable row level security;
alter table public.budget_requests enable row level security;
alter table public.budget_request_lines enable row level security;
alter table public.budget_reviews enable row level security;
alter table public.budget_actuals enable row level security;
alter table public.budget_activity_log enable row level security;

create policy budget_departments_read on public.budget_departments for select to authenticated using (auth.uid() is not null);
create policy budget_departments_admin_write on public.budget_departments for all to authenticated
  using ((select budget_private.current_role()) in ('budget_admin','executive'))
  with check ((select budget_private.current_role()) in ('budget_admin','executive'));

create policy budget_profiles_read on public.budget_profiles for select to authenticated
  using (user_id=(select auth.uid()) or (select budget_private.current_role()) in ('budget_admin','executive'));
create policy budget_profiles_self_insert on public.budget_profiles for insert to authenticated with check (user_id=(select auth.uid()) and department_id is null and role='staff' and is_active);
create policy budget_profiles_admin_update on public.budget_profiles for update to authenticated
  using ((select budget_private.current_role()) in ('budget_admin','executive'))
  with check ((select budget_private.current_role()) in ('budget_admin','executive'));

create policy budget_allocations_read on public.budget_allocations for select to authenticated
  using (department_id=(select budget_private.current_department_id()) or (select budget_private.current_role()) in ('budget_admin','executive'));
create policy budget_allocations_insert on public.budget_allocations for insert to authenticated
  with check (department_id=(select budget_private.current_department_id()) and (select budget_private.current_role()) in ('dept_budget','dept_head','budget_admin'));
create policy budget_allocations_update on public.budget_allocations for update to authenticated
  using ((department_id=(select budget_private.current_department_id()) and (select budget_private.current_role()) in ('dept_budget','dept_head') and status in ('draft','rejected')) or (select budget_private.current_role()) in ('budget_admin','executive'))
  with check ((department_id=(select budget_private.current_department_id()) and (select budget_private.current_role()) in ('dept_budget','dept_head') and status in ('draft','rejected')) or (select budget_private.current_role()) in ('budget_admin','executive'));

create policy budget_allocation_reviews_read on public.budget_allocation_reviews for select to authenticated
  using (exists(select 1 from public.budget_allocations a where a.id=allocation_id and (a.department_id=(select budget_private.current_department_id()) or (select budget_private.current_role()) in ('budget_admin','executive'))));

create policy budget_requests_read on public.budget_requests for select to authenticated
  using (department_id=(select budget_private.current_department_id()) or (select budget_private.current_role()) in ('budget_admin','executive'));
create policy budget_requests_insert on public.budget_requests for insert to authenticated
  with check (department_id=(select budget_private.current_department_id()) and created_by=(select auth.uid()) and (select budget_private.current_role()) in ('staff','dept_budget','dept_head') and exists(select 1 from public.budget_allocations a where a.id=allocation_id and a.department_id=budget_requests.department_id and a.status='approved'));
create policy budget_requests_update_draft on public.budget_requests for update to authenticated
  using (created_by=(select auth.uid()) and department_id=(select budget_private.current_department_id()) and status in ('draft','returned'))
  with check (created_by=(select auth.uid()) and department_id=(select budget_private.current_department_id()) and status in ('draft','returned'));
create policy budget_requests_admin_update on public.budget_requests for update to authenticated
  using ((select budget_private.current_role()) in ('budget_admin','executive'))
  with check ((select budget_private.current_role()) in ('budget_admin','executive'));

create policy budget_request_lines_read on public.budget_request_lines for select to authenticated
  using (exists(select 1 from public.budget_requests r where r.id=request_id and (r.department_id=(select budget_private.current_department_id()) or (select budget_private.current_role()) in ('budget_admin','executive'))));
create policy budget_request_lines_insert on public.budget_request_lines for insert to authenticated
  with check (exists(select 1 from public.budget_requests r where r.id=request_id and r.created_by=(select auth.uid()) and r.department_id=(select budget_private.current_department_id()) and r.status in ('draft','returned')));
create policy budget_request_lines_update on public.budget_request_lines for update to authenticated
  using (exists(select 1 from public.budget_requests r where r.id=request_id and r.created_by=(select auth.uid()) and r.department_id=(select budget_private.current_department_id()) and r.status in ('draft','returned')))
  with check (exists(select 1 from public.budget_requests r where r.id=request_id and r.created_by=(select auth.uid()) and r.department_id=(select budget_private.current_department_id()) and r.status in ('draft','returned')));
create policy budget_request_lines_delete on public.budget_request_lines for delete to authenticated
  using (exists(select 1 from public.budget_requests r where r.id=request_id and r.created_by=(select auth.uid()) and r.department_id=(select budget_private.current_department_id()) and r.status in ('draft','returned')));

create policy budget_reviews_read on public.budget_reviews for select to authenticated
  using (exists(select 1 from public.budget_requests r where r.id=request_id and (r.department_id=(select budget_private.current_department_id()) or (select budget_private.current_role()) in ('budget_admin','executive'))));
create policy budget_actuals_read on public.budget_actuals for select to authenticated
  using (exists(select 1 from public.budget_requests r where r.id=request_id and (r.department_id=(select budget_private.current_department_id()) or (select budget_private.current_role()) in ('budget_admin','executive'))));
create policy budget_activity_read on public.budget_activity_log for select to authenticated
  using ((select budget_private.current_role()) in ('budget_admin','executive') or exists(select 1 from public.budget_requests r where r.id=entity_id and r.department_id=(select budget_private.current_department_id())) or exists(select 1 from public.budget_allocations a where a.id=entity_id and a.department_id=(select budget_private.current_department_id())));

revoke all on public.budget_departments,public.budget_profiles,public.budget_allocations,public.budget_allocation_reviews,public.budget_requests,public.budget_request_lines,public.budget_reviews,public.budget_actuals,public.budget_activity_log from anon;
grant select on public.budget_departments,public.budget_profiles,public.budget_allocations,public.budget_allocation_reviews,public.budget_requests,public.budget_request_lines,public.budget_reviews,public.budget_actuals,public.budget_activity_log to authenticated;
grant insert,update,delete on public.budget_departments to authenticated;
grant insert (user_id,email,display_name) on public.budget_profiles to authenticated;
grant update (department_id,role,is_active,display_name) on public.budget_profiles to authenticated;
grant insert (fiscal_year,department_id,account_code,account_name,category,allocated_amount,basis,created_by) on public.budget_allocations to authenticated;
grant update (fiscal_year,department_id,account_code,account_name,category,allocated_amount,basis) on public.budget_allocations to authenticated;
grant insert (fiscal_year,department_id,allocation_id,title,purpose,created_by) on public.budget_requests to authenticated;
grant update (title,purpose,allocation_id) on public.budget_requests to authenticated;
grant insert (request_id,description,quantity,unit,unit_price,basis) on public.budget_request_lines to authenticated;
grant update (description,quantity,unit,unit_price,basis) on public.budget_request_lines to authenticated;
grant delete on public.budget_request_lines to authenticated;

