-- план осмотра: из чего он состоит и что с каждым визитом стало.
--
-- раньше график наблюдения жил в care_plans.instructions обычным текстом. из
-- текста нельзя узнать, состоялся ли осмотр на третьи сутки, поэтому пропуск
-- нигде не всплывал. твин обязан хранить историю целиком — значит каждый визит
-- должен быть строкой, а не предложением.

create type public.visit_kind as enum (
  'CALL',    -- телефонный контакт
  'CLINIC',  -- приём в поликлинике
  'HOME'     -- визит на дому
);

create type public.visit_status as enum (
  'PLANNED',
  'COMPLETED',
  'MISSED',
  'CANCELLED'
);

create table public.care_plan_visits (
  id               uuid primary key default gen_random_uuid(),
  care_plan_id     uuid not null,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  scheduled_for    date not null,
  kind             public.visit_kind not null default 'CLINIC',
  title            text,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  status           public.visit_status not null default 'PLANNED',
  completed_at     timestamptz,
  completed_by     uuid references public.profiles (id) on delete set null,
  notes            text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint care_plan_visits_completed_has_timestamp
    check (status <> 'COMPLETED' or completed_at is not null),
  constraint care_plan_visits_open_has_no_completion
    check (status in ('COMPLETED', 'MISSED') or completed_at is null),

  constraint care_plan_visits_plan_fkey
    foreign key (care_plan_id, patient_id, organization_id)
    references public.care_plans (id, patient_id, receiving_organization_id)
    on delete cascade
);

comment on table public.care_plan_visits is
  'Отдельные осмотры внутри плана наблюдения. Пропущенный осмотр видно, потому что он существует как запись.';
comment on column public.care_plan_visits.status is
  'MISSED ставит человек. Просрочку (scheduled_for в прошлом при PLANNED) считаем при чтении, чтобы не зависеть от фонового задания.';

create index care_plan_visits_plan_idx on public.care_plan_visits (care_plan_id, scheduled_for);
create index care_plan_visits_patient_idx on public.care_plan_visits (patient_id, scheduled_for);
create index care_plan_visits_assignee_idx on public.care_plan_visits (assigned_user_id, status);
create index care_plan_visits_open_idx on public.care_plan_visits (scheduled_for)
  where status = 'PLANNED';

create trigger care_plan_visits_set_updated_at
  before update on public.care_plan_visits
  for each row execute function public.set_updated_at();


-- каждый осмотр попадает на хронологию: и назначение, и исход
create or replace function public.care_plan_visits_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind      text;
  v_completed boolean;
  v_missed    boolean;
begin
  v_kind := case new.kind
              when 'CALL' then 'Телефонный контакт'
              when 'HOME' then 'Визит на дому'
              else 'Приём в поликлинике'
            end;

  -- сид заводит часть осмотров сразу состоявшимися, поэтому исход проверяем и
  -- при вставке, а не только при смене статуса
  if tg_op = 'INSERT' then
    v_completed := new.status = 'COMPLETED';
    v_missed    := new.status = 'MISSED';

    perform public.log_twin_event(
      new.patient_id, 'VISIT_SCHEDULED', 'HOME',
      coalesce(new.title, v_kind) || ': назначен на ' || to_char(new.scheduled_for, 'DD.MM.YYYY'),
      new.created_at, null, 'INFO',
      'care_plan_visits', new.id, new.created_by, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'scheduled_for', new.scheduled_for));
  else
    v_completed := new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED';
    v_missed    := new.status = 'MISSED'    and old.status is distinct from 'MISSED';
  end if;

  if v_completed then
    perform public.log_twin_event(
      new.patient_id, 'VISIT_COMPLETED', 'HOME',
      coalesce(new.title, v_kind) || ': состоялся',
      coalesce(new.completed_at, now()), new.notes, 'INFO',
      'care_plan_visits', new.id, new.completed_by, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'scheduled_for', new.scheduled_for));
  end if;

  if v_missed then
    perform public.log_twin_event(
      new.patient_id, 'VISIT_MISSED', 'HOME',
      coalesce(new.title, v_kind) || ': не состоялся',
      coalesce(new.completed_at, now()), new.notes, 'WARNING',
      'care_plan_visits', new.id, new.completed_by, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'scheduled_for', new.scheduled_for));
  end if;

  return null;
end;
$$;

create trigger care_plan_visits_log_twin_event
  after insert or update on public.care_plan_visits
  for each row execute function public.care_plan_visits_after_write();


alter table public.care_plan_visits enable row level security;

drop policy if exists "Read accessible visits" on public.care_plan_visits;
create policy "Read accessible visits"
  on public.care_plan_visits for select to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.can_access_patient(patient_id))
  );

drop policy if exists "Receiving organization can plan visits" on public.care_plan_visits;
create policy "Receiving organization can plan visits"
  on public.care_plan_visits for insert to authenticated
  with check (
    (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'HOSPITAL_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[]))
    or (select private.is_super_admin())
  );

drop policy if exists "Assignee or organization can update visits" on public.care_plan_visits;
create policy "Assignee or organization can update visits"
  on public.care_plan_visits for update to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  )
  with check (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  );

grant select, insert, update on public.care_plan_visits to authenticated;
