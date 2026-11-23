-- ASEA Budget: monthly department profit/loss management accounting
-- Apply after budget core schema. Internal management report, not statutory ledger.
create table if not exists public.budget_pl_allocation_rules (
 id uuid primary key default gen_random_uuid(), period text not null check(period ~ '^[0-9]{4}-[0-9]{2}$'),
 rule_name text not null, basis_name text not null, memo text not null default '', active boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.budget_pl_allocation_factors (
 id uuid primary key default gen_random_uuid(), rule_id uuid not null references public.budget_pl_allocation_rules(id) on delete cascade,
 department_id uuid not null references public.budget_departments(id), factor_value numeric(18,3) not null default 0 check(factor_value>=0),
 evidence text not null default '', created_at timestamptz not null default now(), unique(rule_id,department_id)
);
create table if not exists public.budget_pl_revenues (
 id uuid primary key default gen_random_uuid(), period text not null check(period ~ '^[0-9]{4}-[0-9]{2}$'),
 department_id uuid not null references public.budget_departments(id), revenue_code text not null, revenue_name text not null,
 amount bigint not null default 0 check(amount>=0), memo text not null default '', entered_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.budget_pl_cost_entries (
 id uuid primary key default gen_random_uuid(), period text not null check(period ~ '^[0-9]{4}-[0-9]{2}$'),
 scope text not null check(scope in ('direct','shared')), department_id uuid not null references public.budget_departments(id),
 allocation_rule_id uuid references public.budget_pl_allocation_rules(id), cost_code text not null, cost_name text not null,
 amount bigint not null default 0 check(amount>=0), memo text not null default '', entered_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.budget_pl_allocation_runs (
 id uuid primary key default gen_random_uuid(), period text not null check(period ~ '^[0-9]{4}-[0-9]{2}$'), run_no integer not null,
 note text not null default '', total_shared_cost bigint not null default 0, total_allocated bigint not null default 0,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(period,run_no)
);
create table if not exists public.budget_pl_cost_allocations (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.budget_pl_allocation_runs(id) on delete cascade,
 source_cost_id uuid not null references public.budget_pl_cost_entries(id), department_id uuid not null references public.budget_departments(id),
 rule_id uuid not null references public.budget_pl_allocation_rules(id), factor_value numeric(18,3) not null, ratio numeric(18,10) not null,
 allocated_amount bigint not null, calculation_note text not null default '', created_at timestamptz not null default now()
);
create index if not exists budget_pl_rev_period_dept_idx on public.budget_pl_revenues(period,department_id);
create index if not exists budget_pl_cost_period_scope_idx on public.budget_pl_cost_entries(period,scope,department_id);
create index if not exists budget_pl_runs_period_idx on public.budget_pl_allocation_runs(period,run_no desc);

do $$ declare t text; begin
 foreach t in array array['budget_pl_allocation_rules','budget_pl_allocation_factors','budget_pl_revenues','budget_pl_cost_entries','budget_pl_allocation_runs','budget_pl_cost_allocations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists %I on public.%I',t||'_admin_policy',t);
  if t in ('budget_pl_allocation_runs','budget_pl_cost_allocations') then
   execute format('create policy %I on public.%I for select to authenticated using (exists(select 1 from public.budget_profiles p where p.user_id=auth.uid() and p.is_active and p.role in (''budget_admin'',''executive'')))',t||'_admin_policy',t);
  else
   execute format('create policy %I on public.%I for all to authenticated using (exists(select 1 from public.budget_profiles p where p.user_id=auth.uid() and p.is_active and p.role in (''budget_admin'',''executive''))) with check (exists(select 1 from public.budget_profiles p where p.user_id=auth.uid() and p.is_active and p.role in (''budget_admin'',''executive'')))',t||'_admin_policy',t);
  end if;
 end loop;
end $$;
grant select,insert,update,delete on public.budget_pl_allocation_rules,public.budget_pl_allocation_factors,public.budget_pl_revenues,public.budget_pl_cost_entries to authenticated;
grant select on public.budget_pl_allocation_runs,public.budget_pl_cost_allocations to authenticated;
revoke all on public.budget_pl_allocation_rules,public.budget_pl_allocation_factors,public.budget_pl_revenues,public.budget_pl_cost_entries,public.budget_pl_allocation_runs,public.budget_pl_cost_allocations from anon;

create or replace function public.budget_pl_run_allocation(p_period text,p_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_common uuid; v_role text; v_run uuid:=gen_random_uuid(); v_no integer; v_pool bigint; v_allocated bigint;
begin
 if p_period !~ '^[0-9]{4}-[0-9]{2}$' then raise exception '기간은 YYYY-MM 형식이어야 합니다.'; end if;
 select role into v_role from public.budget_profiles where user_id=auth.uid() and is_active;
 if v_role not in ('budget_admin','executive') then raise exception '예산관리 담당자 또는 임원만 실행할 수 있습니다.'; end if;
 select id into v_common from public.budget_departments where code='0' and active;
 if v_common is null then raise exception '공통(0) 부서를 등록해 주세요.'; end if;
 if exists(select 1 from public.budget_pl_cost_entries c where c.period=p_period and c.scope='shared' and
   (c.department_id<>v_common or c.allocation_rule_id is null or not exists(select 1 from public.budget_pl_allocation_rules r join public.budget_pl_allocation_factors f on f.rule_id=r.id join public.budget_departments d on d.id=f.department_id and d.active and d.code<>'0' where r.id=c.allocation_rule_id and r.period=p_period and r.active and f.factor_value>0))) then
   raise exception '공통 비용마다 유효한 배부 기준과 부서별 배부값을 지정해 주세요.';
 end if;
 select coalesce(sum(amount),0)::bigint into v_pool from public.budget_pl_cost_entries where period=p_period and scope='shared';
 select coalesce(max(run_no),0)+1 into v_no from public.budget_pl_allocation_runs where period=p_period;
 insert into public.budget_pl_allocation_runs(id,period,run_no,note,total_shared_cost,total_allocated,created_by) values(v_run,p_period,v_no,coalesce(p_note,''),v_pool,0,auth.uid());
 with raw as (
  select c.id source_cost_id,c.amount,c.allocation_rule_id,f.department_id,f.factor_value,
   sum(f.factor_value) over(partition by c.id) factor_sum,
   row_number() over(partition by c.id order by f.department_id) rn,count(*) over(partition by c.id) cnt
  from public.budget_pl_cost_entries c join public.budget_pl_allocation_rules r on r.id=c.allocation_rule_id and r.period=c.period and r.active
  join public.budget_pl_allocation_factors f on f.rule_id=r.id and f.factor_value>0
  join public.budget_departments d on d.id=f.department_id and d.active and d.code<>'0'
  where c.period=p_period and c.scope='shared' and c.department_id=v_common
 ), calc as (
  select *,case when rn=cnt then amount-coalesce(sum(round(amount*factor_value/factor_sum)::bigint) over(partition by source_cost_id order by department_id rows between unbounded preceding and 1 preceding),0)
   else round(amount*factor_value/factor_sum)::bigint end allocated from raw
 )
 insert into public.budget_pl_cost_allocations(run_id,source_cost_id,department_id,rule_id,factor_value,ratio,allocated_amount,calculation_note)
 select v_run,source_cost_id,department_id,allocation_rule_id,factor_value,factor_value/factor_sum,allocated,'비용 × 배부값 ÷ 활성 부서 배부값 합계; 반올림 잔액은 마지막 부서에 배정' from calc;
 select coalesce(sum(allocated_amount),0)::bigint into v_allocated from public.budget_pl_cost_allocations where run_id=v_run;
 update public.budget_pl_allocation_runs set total_allocated=v_allocated where id=v_run;
 return v_run;
end; $$;
revoke all on function public.budget_pl_run_allocation(text,text) from public,anon;
grant execute on function public.budget_pl_run_allocation(text,text) to authenticated;
