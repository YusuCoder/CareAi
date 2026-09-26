create type public.smoking_status as enum ('NEVER', 'FORMER', 'CURRENT', 'UNKNOWN');
create type public.alcohol_use as enum ('NONE', 'OCCASIONAL', 'REGULAR', 'HEAVY', 'UNKNOWN');
create type public.physical_activity as enum ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'UNKNOWN');

create table public.patient_profile (
  patient_id          uuid primary key references public.patients (id) on delete cascade,
  smoking_status      public.smoking_status not null default 'UNKNOWN',
  smoking_pack_years  numeric(4, 1) check (smoking_pack_years is null or smoking_pack_years >= 0),
  alcohol_use         public.alcohol_use not null default 'UNKNOWN',
  physical_activity   public.physical_activity not null default 'UNKNOWN',
  family_history      text[] not null default '{}',
  genetic_markers     jsonb not null default '{}'::jsonb,
  notes               text,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.patient_profile is 'Образ жизни, семейный анамнез и генетические маркеры. Одна запись на пациента.';
comment on column public.patient_profile.genetic_markers is 'Маркеры в формате {маркер: значение}. Используются только после оценки врачом.';
comment on column public.patient_profile.family_history is 'Заболевания родственников, например: инфаркт у отца до 60 лет, диабет 2 типа у матери.';

create index patient_profile_updated_by_idx on public.patient_profile (updated_by);

create trigger patient_profile_set_updated_at
  before update on public.patient_profile
  for each row execute function public.set_updated_at();

alter table public.patient_profile enable row level security;
revoke all on table public.patient_profile from anon;
revoke delete, truncate on table public.patient_profile from authenticated;
grant select, insert, update on table public.patient_profile to authenticated;

drop policy if exists "Read accessible patient profiles" on public.patient_profile;
create policy "Read accessible patient profiles"
  on public.patient_profile for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can record patient profiles" on public.patient_profile;
create policy "Clinicians can record patient profiles"
  on public.patient_profile for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
    and updated_by = (select auth.uid())
  );

drop policy if exists "Clinicians can update patient profiles" on public.patient_profile;
create policy "Clinicians can update patient profiles"
  on public.patient_profile for update to authenticated
  using ((select private.can_access_patient(patient_id))
         and (select private.is_clinician()))
  with check (updated_by = (select auth.uid()));


create or replace function public.simulation_inputs(p_patient_id uuid)
returns table (
  patient_id         uuid,
  age_years          int,
  sex                public.gender,
  height_cm          numeric,
  weight_kg          numeric,
  bmi                numeric,
  systolic           numeric,
  diastolic          numeric,
  hba1c              numeric,
  total_cholesterol  numeric,
  hdl                numeric,
  creatinine         numeric,
  smoking            public.smoking_status,
  alcohol            public.alcohol_use,
  activity           public.physical_activity,
  has_diabetes       boolean,
  diabetes_years     numeric,
  has_heart_failure  boolean,
  has_hypertension   boolean,
  family_history     text[],
  genetic_markers    jsonb,
  missing            text[]
)
language plpgsql
stable
as $$
declare
  r record;
  v_missing text[] := '{}';
begin
  select
    p.id,
    extract(year from age(p.birth_date))::int                                as age_years,
    p.gender,
    (select o.value_numeric from public.observations o
      where o.patient_id = p.id and o.type = 'HEIGHT'
      order by o.recorded_at desc limit 1)                                   as height_cm,
    (select o.value_numeric from public.observations o
      where o.patient_id = p.id and o.type = 'WEIGHT'
      order by o.recorded_at desc limit 1)                                   as weight_kg,
    (select o.value_numeric from public.observations o
      where o.patient_id = p.id and o.type = 'BLOOD_PRESSURE'
      order by o.recorded_at desc limit 1)                                   as systolic,
    (select o.value_secondary from public.observations o
      where o.patient_id = p.id and o.type = 'BLOOD_PRESSURE'
      order by o.recorded_at desc limit 1)                                   as diastolic,
    (select l.value_numeric from public.lab_results l
      where l.patient_id = p.id and lower(l.analyte) like '%hba1c%'
      order by l.collected_at desc limit 1)                                  as hba1c,
    (select l.value_numeric from public.lab_results l
      where l.patient_id = p.id and lower(l.analyte) like '%общий холестерин%'
      order by l.collected_at desc limit 1)                                  as total_cholesterol,
    (select l.value_numeric from public.lab_results l
      where l.patient_id = p.id and lower(l.analyte) like '%лпвп%'
      order by l.collected_at desc limit 1)                                  as hdl,
    (select l.value_numeric from public.lab_results l
      where l.patient_id = p.id and lower(l.analyte) like '%креатинин%'
      order by l.collected_at desc limit 1)                                  as creatinine,
    coalesce(pr.smoking_status, 'UNKNOWN')                                   as smoking,
    coalesce(pr.alcohol_use, 'UNKNOWN')                                      as alcohol,
    coalesce(pr.physical_activity, 'UNKNOWN')                                as activity,
    coalesce(pr.family_history, '{}')                                        as family_history,
    coalesce(pr.genetic_markers, '{}'::jsonb)                                as genetic_markers,
    exists (select 1 from public.diagnoses d
             where d.patient_id = p.id and d.status = 'ACTIVE' and d.code like 'E11%')  as has_diabetes,
    (select min(d.diagnosed_at) from public.diagnoses d
      where d.patient_id = p.id and d.code like 'E11%')                      as diabetes_since,
    exists (select 1 from public.diagnoses d
             where d.patient_id = p.id and d.status = 'ACTIVE' and d.code like 'I50%')  as has_heart_failure,
    exists (select 1 from public.diagnoses d
             where d.patient_id = p.id and d.status = 'ACTIVE' and d.code like 'I10%')  as has_hypertension
  into r
  from public.patients p
  left join public.patient_profile pr on pr.patient_id = p.id
  where p.id = p_patient_id;

  if not found then
    return;
  end if;

  if r.age_years is null then v_missing := array_append(v_missing, 'birth_date'); end if;
  if r.height_cm is null then v_missing := array_append(v_missing, 'height_cm'); end if;
  if r.weight_kg is null then v_missing := array_append(v_missing, 'weight_kg'); end if;
  if r.systolic is null then v_missing := array_append(v_missing, 'systolic'); end if;
  if r.smoking = 'UNKNOWN' then v_missing := array_append(v_missing, 'smoking_status'); end if;
  if r.has_diabetes and r.hba1c is null then v_missing := array_append(v_missing, 'hba1c'); end if;
  if r.total_cholesterol is null then v_missing := array_append(v_missing, 'total_cholesterol'); end if;
  if r.creatinine is null then v_missing := array_append(v_missing, 'creatinine'); end if;
  if r.hdl is null then v_missing := array_append(v_missing, 'hdl'); end if;

  return query select
    r.id, r.age_years, r.gender, r.height_cm, r.weight_kg,
    case when r.height_cm > 0 and r.weight_kg is not null
         then round(r.weight_kg / ((r.height_cm / 100) ^ 2), 1) end,
    r.systolic, r.diastolic, r.hba1c, r.total_cholesterol, r.hdl, r.creatinine,
    r.smoking, r.alcohol, r.activity,
    r.has_diabetes,
    case when r.diabetes_since is not null
         then round(extract(epoch from (now() - r.diabetes_since::timestamptz)) / 31557600.0, 1) end,
    r.has_heart_failure, r.has_hypertension,
    r.family_history, r.genetic_markers, v_missing;
end;
$$;

comment on function public.simulation_inputs(uuid) is 'Параметры модели и список недостающих данных пациента. SECURITY INVOKER: доступ ограничен RLS.';

grant execute on function public.simulation_inputs(uuid) to authenticated;
