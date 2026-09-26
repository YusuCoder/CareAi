-- активный вызов ("Aktiv chaqiruv").
--
-- при выписке система сама ставит задачу территориальной поликлинике: связаться
-- с пациентом в течение 24 часов и подтвердить это в системе. человек в этой
-- цепочке не участвует — именно отсутствие автоматической передачи и есть
-- проблема, которую решаем.
--
-- отдельная таблица, а не care_assignments: здесь обязательство со сроком, а не
-- постоянная ответственность.

create type public.active_call_status as enum (
  'PENDING',       -- создан, никто не взял
  'ACKNOWLEDGED',  -- врач принял в работу
  'COMPLETED',     -- контакт состоялся и подтверждён
  'CANCELLED'      -- отменён (например, пациент вновь госпитализирован)
);

-- OVERDUE намеренно НЕ является статусом: он вычисляется при чтении
-- (now() > due_at и статус PENDING). иначе он зависел бы от фонового задания,
-- которое на демонстрации может не работать.

create type public.active_call_outcome as enum (
  'CONTACTED',   -- дозвонились
  'VISITED',     -- посетили на дому
  'UNREACHABLE', -- не удалось связаться
  'REFUSED',     -- пациент отказался
  'ESCALATED'    -- передано выше / повторная госпитализация
);

create table public.active_calls (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  hospitalization_id uuid not null,
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  care_plan_id       uuid,
  status             public.active_call_status not null default 'PENDING',
  created_at         timestamptz not null default now(),
  due_at             timestamptz not null,
  acknowledged_by    uuid references public.profiles (id) on delete set null,
  acknowledged_at    timestamptz,
  completed_by       uuid references public.profiles (id) on delete set null,
  completed_at       timestamptz,
  outcome            public.active_call_outcome,
  notes              text,

  constraint active_calls_due_after_created check (due_at > created_at),
  constraint active_calls_acknowledged_has_timestamp
    check (status not in ('ACKNOWLEDGED', 'COMPLETED') or acknowledged_at is not null),
  constraint active_calls_completed_has_outcome
    check (status <> 'COMPLETED' or (completed_at is not null and outcome is not null)),
  constraint active_calls_timestamps_ordered
    check (completed_at is null or acknowledged_at is null or completed_at >= acknowledged_at),
  constraint active_calls_hospitalization_fkey
    foreign key (hospitalization_id, patient_id)
    references public.hospitalizations (id, patient_id) on delete cascade,
  constraint active_calls_care_plan_fkey
    foreign key (care_plan_id, patient_id)
    references public.care_plans (id, patient_id) on delete set null
);

comment on table public.active_calls is
  'Обязательство связаться с выписанным пациентом в течение 24 часов. Создаётся автоматически при выписке, закрывается врачом.';
comment on column public.active_calls.due_at is
  'Хранится, а не вычисляется: для тяжёлых пациентов окно можно будет сделать короче.';

create index active_calls_org_status_idx on public.active_calls (organization_id, status, due_at);
create index active_calls_patient_idx on public.active_calls (patient_id);
create index active_calls_due_idx on public.active_calls (due_at)
  where status in ('PENDING', 'ACKNOWLEDGED');

-- один открытый вызов на госпитализацию
create unique index active_calls_one_open_per_hospitalization
  on public.active_calls (hospitalization_id)
  where status in ('PENDING', 'ACKNOWLEDGED');


-- выписка ставит задачу сама
create or replace function public.hospitalizations_dispatch_active_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic uuid;
  v_discharged boolean;
begin
  if tg_op = 'UPDATE' then
    v_discharged := new.status = 'DISCHARGED' and old.status is distinct from 'DISCHARGED';
  else
    v_discharged := new.status = 'DISCHARGED';
  end if;

  if not v_discharged then
    return null;
  end if;

  select p.primary_clinic_id into v_clinic
    from public.patients p where p.id = new.patient_id;

  -- без прикреплённой поликлиники задачу некому отдать. выписку не срываем, но
  -- и молчать нельзя: проблема должна быть видна на хронологии пациента.
  if v_clinic is null then
    perform public.log_twin_event(
      new.patient_id, 'ACTIVE_CALL_CREATED', 'HOME',
      'Активный вызов не создан: пациент не прикреплён к поликлинике',
      now(), 'Укажите поликлинику в карте пациента', 'WARNING',
      'hospitalizations', new.id, new.attending_doctor_id, new.organization_id,
      '{}'::jsonb);
    return null;
  end if;

  insert into public.active_calls (patient_id, hospitalization_id, organization_id, due_at)
  values (new.patient_id, new.id, v_clinic, coalesce(new.discharged_at, now()) + interval '24 hours')
  on conflict do nothing;

  return null;
end;
$$;

drop trigger if exists hospitalizations_dispatch_active_call on public.hospitalizations;
create trigger hospitalizations_dispatch_active_call
  after insert or update on public.hospitalizations
  for each row execute function public.hospitalizations_dispatch_active_call();


-- вызов виден на хронологии пациента
create or replace function public.active_calls_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic text;
begin
  select o.name into v_clinic from public.organizations o where o.id = new.organization_id;

  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'ACTIVE_CALL_CREATED', 'HOME',
      'Активный вызов направлен: ' || coalesce(v_clinic, 'поликлиника'),
      new.created_at, 'Связаться с пациентом в течение 24 часов', 'INFO',
      'active_calls', new.id, null, new.organization_id,
      jsonb_build_object('due_at', new.due_at));
    return null;
  end if;

  if new.status = 'ACKNOWLEDGED' and old.status is distinct from 'ACKNOWLEDGED' then
    perform public.log_twin_event(
      new.patient_id, 'ACTIVE_CALL_ACKNOWLEDGED', 'HOME',
      'Активный вызов принят в работу',
      coalesce(new.acknowledged_at, now()), null, 'INFO',
      'active_calls', new.id, new.acknowledged_by, new.organization_id, '{}'::jsonb);
  end if;

  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    perform public.log_twin_event(
      new.patient_id, 'ACTIVE_CALL_COMPLETED', 'HOME',
      'Контакт с пациентом подтверждён',
      coalesce(new.completed_at, now()), new.notes, 'INFO',
      'active_calls', new.id, new.completed_by, new.organization_id,
      jsonb_build_object('outcome', new.outcome::text,
                         'hours', round(extract(epoch from (coalesce(new.completed_at, now()) - new.created_at)) / 3600.0, 1)));
  end if;

  return null;
end;
$$;

drop trigger if exists active_calls_log_twin_event on public.active_calls;
create trigger active_calls_log_twin_event
  after insert or update on public.active_calls
  for each row execute function public.active_calls_after_write();

-- проставляем отметки времени, чтобы фронтенд не мог их забыть
create or replace function public.active_calls_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'ACKNOWLEDGED' and old.status is distinct from 'ACKNOWLEDGED'
       and new.acknowledged_at is null then
      new.acknowledged_at := now();
    end if;
    if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
      if new.acknowledged_at is null then new.acknowledged_at := now(); end if;
      if new.completed_at is null then new.completed_at := now(); end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists active_calls_stamp on public.active_calls;
create trigger active_calls_stamp
  before update on public.active_calls
  for each row execute function public.active_calls_stamp();

revoke execute on function
  public.hospitalizations_dispatch_active_call(),
  public.active_calls_after_write(),
  public.active_calls_stamp()
from public, anon, authenticated;


-- RLS
alter table public.active_calls enable row level security;
revoke all on table public.active_calls from anon;
revoke insert, delete, truncate on table public.active_calls from authenticated;
grant select, update on table public.active_calls to authenticated;

-- читают все, кто и так видит пациента: и стационар, который выписал, и
-- поликлиника, которая приняла
drop policy if exists "Read accessible active calls" on public.active_calls;
create policy "Read accessible active calls"
  on public.active_calls for select to authenticated
  using ((select private.can_access_patient(patient_id)));

-- закрывает только принимающая организация
drop policy if exists "Receiving organization works the call" on public.active_calls;
create policy "Receiving organization works the call"
  on public.active_calls for update to authenticated
  using ((select private.has_org_role(organization_id,
    array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[])))
  with check ((select private.has_org_role(organization_id,
    array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[])));


-- показатель, который и есть обещание продукта
create or replace function public.active_call_stats()
returns table (
  total            int,
  pending          int,
  overdue          int,
  completed        int,
  within_24h       int,
  median_hours     numeric
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where status = 'PENDING')::int,
    count(*) filter (where status in ('PENDING', 'ACKNOWLEDGED') and now() > due_at)::int,
    count(*) filter (where status = 'COMPLETED')::int,
    count(*) filter (where status = 'COMPLETED' and completed_at <= due_at)::int,
    round(percentile_cont(0.5) within group (
      order by extract(epoch from (completed_at - created_at)) / 3600.0
    ) filter (where status = 'COMPLETED')::numeric, 1)
  from public.active_calls;
$$;

comment on function public.active_call_stats() is
  'Сводка по активным вызовам: просрочено, уложились в 24 часа, медиана времени до контакта. SECURITY INVOKER: считает только по доступным строкам.';

grant execute on function public.active_call_stats() to authenticated;
