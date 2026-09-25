alter table public.care_plans
  add column if not exists completed_by uuid references public.profiles (id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists completion_note text;

comment on column public.care_plans.completed_by is 'Врач, завершивший наблюдение. NULL при завершении сервером или загрузкой демоданных.';
comment on column public.care_plans.completion_note is 'Причина завершения наблюдения, указанная врачом.';

create index if not exists care_plans_completed_by_idx on public.care_plans (completed_by);


create or replace function public.care_plans_after_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed boolean;
begin
  if tg_op = 'UPDATE' then
    v_closed := new.status in ('COMPLETED', 'CANCELLED')
            and old.status is distinct from new.status;
  else
    v_closed := false;
  end if;

  if not v_closed then
    return null;
  end if;

  update public.care_assignments
     set status = 'COMPLETED', completed_at = coalesce(completed_at, now())
   where care_plan_id = new.id
     and status in ('ACCEPTED', 'ACTIVE');

  update public.care_assignments
     set status = 'CANCELLED'
   where care_plan_id = new.id
     and status = 'PENDING';

  return null;
end;
$$;

create or replace function public.care_plans_completion_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status in ('COMPLETED', 'CANCELLED')
     and old.status is distinct from new.status
     and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists care_plans_stamp_completion on public.care_plans;
create trigger care_plans_stamp_completion
  before update on public.care_plans
  for each row execute function public.care_plans_completion_stamp();

drop trigger if exists care_plans_release_assignments on public.care_plans;
create trigger care_plans_release_assignments
  after update on public.care_plans
  for each row execute function public.care_plans_after_completion();

revoke execute on function
  public.care_plans_after_completion(),
  public.care_plans_completion_stamp()
from public, anon, authenticated;


create or replace function public.follow_up_candidates()
returns table (
  care_plan_id        uuid,
  patient_id          uuid,
  patient_number      bigint,
  first_name          text,
  last_name           text,
  plan_title          text,
  plan_end_date       date,
  risk_level          public.risk_level,
  last_observation_at timestamptz,
  last_abnormal_at    timestamptz,
  patient_reports     integer,
  stable_days         integer,
  plan_overdue        boolean,
  silent              boolean,
  ready               boolean
)
language sql
stable
set search_path = ''
as $$
  with plans as (
    select cp.id, cp.patient_id, cp.title, cp.end_date, cp.start_date
      from public.care_plans cp
     where cp.status = 'ACTIVE'
  ),
  signals as (
    select p.id, p.patient_id, p.title, p.end_date, p.start_date,
           max(o.recorded_at)                                      as last_obs,
           max(o.recorded_at) filter (where o.is_abnormal)         as last_abnormal,
           count(*) filter (
             where o.source = 'PATIENT' and o.recorded_at > now() - interval '7 days'
           )::int                                                  as reports
      from plans p
      left join public.observations o on o.patient_id = p.patient_id
     group by p.id, p.patient_id, p.title, p.end_date, p.start_date
  )
  select
    s.id,
    s.patient_id,
    pt.patient_number,
    pt.first_name,
    pt.last_name,
    s.title,
    s.end_date,
    dt.risk_level,
    s.last_obs,
    s.last_abnormal,
    s.reports,
    greatest(0, extract(day from now() - coalesce(s.last_abnormal, s.start_date::timestamptz))::int),
    (s.end_date is not null and s.end_date <= current_date),
    (s.last_obs is null or s.last_obs < now() - interval '3 days'),
    (
      (s.last_obs is not null and s.last_obs >= now() - interval '3 days')
      and (dt.risk_level is null or dt.risk_level = 'LOW')
      and coalesce(s.last_abnormal, s.start_date::timestamptz) < now() - interval '5 days'
      and s.reports >= 2
      and not exists (
        select 1 from public.hospitalizations h
         where h.patient_id = s.patient_id and h.status = 'ACTIVE'
      )
    )
  from signals s
  join public.patients pt on pt.id = s.patient_id
  left join public.digital_twins dt on dt.patient_id = s.patient_id;
$$;

comment on function public.follow_up_candidates() is 'Активные планы с признаками готовности к завершению. Решение о завершении принимает врач.';

grant execute on function public.follow_up_candidates() to authenticated;
