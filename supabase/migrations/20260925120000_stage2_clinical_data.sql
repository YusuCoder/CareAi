-- stage 2: the clinical data itself.
-- diagnoses / observations / labs / meds / procedures / allergies, plus
-- twin_events which is just the timeline on top of them.

-- composite keys, so a clinical row cannot reference another patients episode
alter table public.hospitalizations
  add constraint hospitalizations_id_patient_key unique (id, patient_id);

alter table public.care_plans
  add constraint care_plans_id_patient_key unique (id, patient_id);


-- provenance. a ward thermometer and the patients own thermometer are not
-- the same thing and the twin has to show which is which.
create type public.clinical_source as enum (
  'HOSPITAL',
  'POLYCLINIC',
  'NURSE',
  'PATIENT',
  'DEVICE',
  'AI_DRAFT'
);

create type public.diagnosis_type as enum (
  'PRIMARY',
  'SECONDARY',
  'COMORBIDITY',
  'COMPLICATION'
);

create type public.diagnosis_status as enum (
  'ACTIVE',
  'RESOLVED',
  'IN_REMISSION',
  'RULED_OUT'
);

create type public.observation_type as enum (

  'TEMPERATURE',
  'HEART_RATE',
  'BLOOD_PRESSURE',
  'SPO2',
  'RESPIRATORY_RATE',
  'WEIGHT',
  'GLUCOSE',

  'PAIN',
  'NAUSEA',
  'WEAKNESS',
  'DIZZINESS',
  'WOUND_REDNESS',
  'SHORTNESS_OF_BREATH',
  'SWELLING'
);

create type public.lab_flag as enum ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

create type public.medication_frequency as enum (
  'ONCE_DAILY',
  'TWICE_DAILY',
  'THREE_TIMES_DAILY',
  'FOUR_TIMES_DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'AS_NEEDED',
  'OTHER'
);

create type public.medication_route as enum (
  'ORAL',
  'IV',
  'IM',
  'SUBCUTANEOUS',
  'TOPICAL',
  'INHALATION',
  'RECTAL',
  'OTHER'
);

create type public.medication_status as enum (
  'ACTIVE',
  'COMPLETED',
  'STOPPED',
  'ON_HOLD'
);

create type public.procedure_category as enum (
  'SURGERY',
  'IMAGING',
  'DIAGNOSTIC',
  'THERAPEUTIC',
  'OTHER'
);

create type public.allergy_severity as enum ('MILD', 'MODERATE', 'SEVERE');

create type public.allergy_status as enum ('ACTIVE', 'INACTIVE');


create type public.care_phase as enum ('HOSPITAL', 'HOME');

create type public.twin_event_severity as enum ('INFO', 'WARNING', 'CRITICAL');

create type public.twin_event_type as enum (
  'TWIN_CREATED',
  'HOSPITAL_ADMISSION',
  'DIAGNOSIS_ADDED',
  'PROCEDURE_COMPLETED',
  'LAB_RESULT_ADDED',
  'MEDICATION_PRESCRIBED',
  'ALLERGY_RECORDED',
  'OBSERVATION_RECORDED',
  'PATIENT_DISCHARGED',
  'CARE_PLAN_CREATED',
  'CARE_PLAN_APPROVED',
  'NURSE_ASSIGNED',
  'CARE_ASSIGNMENT_ACCEPTED',
  'PATIENT_CHECK_IN',
  'RISK_LEVEL_CHANGED',
  'ALERT_CREATED',
  'ALERT_RESOLVED',
  'NOTE_ADDED'
);


-- chronic history and episode diagnoses in one table
create table public.diagnoses (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  hospitalization_id  uuid,
  name                text not null check (btrim(name) <> ''),
  code                text,
  type                public.diagnosis_type not null default 'SECONDARY',
  status              public.diagnosis_status not null default 'ACTIVE',
  diagnosed_at        date,
  resolved_at         date,
  notes               text,
  source              public.clinical_source not null default 'HOSPITAL',
  recorded_by         uuid references public.profiles (id) on delete restrict,
  organization_id     uuid references public.organizations (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint diagnoses_dates_ordered
    check (resolved_at is null or diagnosed_at is null or resolved_at >= diagnosed_at),
  constraint diagnoses_resolved_has_date
    check (status <> 'RESOLVED' or resolved_at is not null),

  constraint diagnoses_hospitalization_fkey
    foreign key (hospitalization_id, patient_id)
    references public.hospitalizations (id, patient_id)
    on delete restrict,


  constraint diagnoses_recorder_membership_fkey
    foreign key (organization_id, recorded_by)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict
);

comment on table public.diagnoses is 'Historical and active diagnoses of a patient.';
comment on column public.diagnoses.code is 'ICD-10 code as plain text (e.g.';
comment on column public.diagnoses.diagnosed_at is
  'Date, not timestamp: the onset hour of a chronic condition is never known.';

create index diagnoses_patient_status_idx on public.diagnoses (patient_id, status);
create index diagnoses_patient_diagnosed_at_idx on public.diagnoses (patient_id, diagnosed_at desc);
create index diagnoses_hospitalization_id_idx on public.diagnoses (hospitalization_id);
create index diagnoses_recorded_by_idx on public.diagnoses (recorded_by);
create index diagnoses_organization_id_idx on public.diagnoses (organization_id);

create trigger diagnoses_set_updated_at
  before update on public.diagnoses
  for each row execute function public.set_updated_at();


-- the busiest table. vitals and patient reported symptoms live together so
-- they chart on one line, source tells them apart.
create table public.observations (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  hospitalization_id  uuid,
  care_plan_id        uuid,
  type                public.observation_type not null,
  value_numeric       numeric,
  value_secondary     numeric,
  value_boolean       boolean,
  value_text          text,
  unit                text,
  is_abnormal         boolean not null default false,
  note                text,
  source              public.clinical_source not null,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid references public.profiles (id) on delete restrict,
  organization_id     uuid references public.organizations (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint observations_has_a_value
    check (num_nonnulls(value_numeric, value_boolean, value_text) >= 1),


  constraint observations_secondary_is_blood_pressure
    check (value_secondary is null or type = 'BLOOD_PRESSURE'),
  constraint observations_blood_pressure_needs_both
    check (type <> 'BLOOD_PRESSURE' or (value_numeric is not null and value_secondary is not null)),
  constraint observations_pain_scale
    check (type <> 'PAIN' or value_numeric is null or value_numeric between 0 and 10),
  constraint observations_spo2_range
    check (type <> 'SPO2' or value_numeric is null or value_numeric between 0 and 100),
  constraint observations_hospitalization_fkey
    foreign key (hospitalization_id, patient_id)
    references public.hospitalizations (id, patient_id)
    on delete restrict,
  constraint observations_care_plan_fkey
    foreign key (care_plan_id, patient_id)
    references public.care_plans (id, patient_id)
    on delete restrict,
  constraint observations_recorder_membership_fkey
    foreign key (organization_id, recorded_by)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict
);

comment on table public.observations is
  'Longitudinal measurements and patient-reported observations.';
comment on column public.observations.value_secondary is
  'Diastolic value; used by BLOOD_PRESSURE only.';
comment on column public.observations.recorded_at is 'When the measurement was TAKEN.';
comment on column public.observations.source is 'Provenance.';
comment on column public.observations.is_abnormal is
  'Set by the clinician or by the Stage 8 risk engine.';

create index observations_patient_recorded_at_idx
  on public.observations (patient_id, recorded_at desc);
create index observations_patient_type_recorded_at_idx
  on public.observations (patient_id, type, recorded_at desc);
create index observations_care_plan_id_idx on public.observations (care_plan_id);
create index observations_hospitalization_id_idx on public.observations (hospitalization_id);
create index observations_source_idx on public.observations (source);
create index observations_recorded_by_idx on public.observations (recorded_by);
create index observations_organization_id_idx on public.observations (organization_id);
create index observations_abnormal_idx
  on public.observations (patient_id, recorded_at desc) where is_abnormal;

create trigger observations_set_updated_at
  before update on public.observations
  for each row execute function public.set_updated_at();


-- separate from observations because labs have reference ranges and panels
create table public.lab_results (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  hospitalization_id  uuid,
  panel               text,
  analyte             text not null check (btrim(analyte) <> ''),
  value_numeric       numeric,
  value_text          text,
  unit                text,
  reference_low       numeric,
  reference_high      numeric,
  flag                public.lab_flag,
  collected_at        timestamptz not null default now(),
  resulted_at         timestamptz,
  lab_name            text,
  note                text,
  source              public.clinical_source not null default 'HOSPITAL',
  recorded_by         uuid references public.profiles (id) on delete restrict,
  organization_id     uuid references public.organizations (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint lab_results_has_a_value
    check (value_numeric is not null or value_text is not null),
  constraint lab_results_reference_ordered
    check (reference_low is null or reference_high is null or reference_high >= reference_low),
  constraint lab_results_resulted_after_collected
    check (resulted_at is null or resulted_at >= collected_at),
  constraint lab_results_hospitalization_fkey
    foreign key (hospitalization_id, patient_id)
    references public.hospitalizations (id, patient_id)
    on delete restrict,
  constraint lab_results_recorder_membership_fkey
    foreign key (organization_id, recorded_by)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict
);

comment on table public.lab_results is 'Laboratory measurements.';
comment on column public.lab_results.flag is 'LOW/NORMAL/HIGH/CRITICAL.';

create index lab_results_patient_collected_at_idx
  on public.lab_results (patient_id, collected_at desc);
create index lab_results_patient_analyte_collected_at_idx
  on public.lab_results (patient_id, lower(analyte), collected_at desc);
create index lab_results_hospitalization_id_idx on public.lab_results (hospitalization_id);
create index lab_results_flag_idx on public.lab_results (patient_id, flag);
create index lab_results_recorded_by_idx on public.lab_results (recorded_by);
create index lab_results_organization_id_idx on public.lab_results (organization_id);

create trigger lab_results_set_updated_at
  before update on public.lab_results
  for each row execute function public.set_updated_at();


-- prescriptions only. no adherence tracking here, that comes with the bot.
create table public.medications (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  hospitalization_id  uuid,
  care_plan_id        uuid,
  name                text not null check (btrim(name) <> ''),
  dose                numeric check (dose is null or dose > 0),
  dose_unit           text,
  frequency           public.medication_frequency,
  frequency_text      text,
  route               public.medication_route,
  instructions        text,
  start_date          date,
  end_date            date,
  status              public.medication_status not null default 'ACTIVE',
  prescribed_by       uuid references public.profiles (id) on delete restrict,
  organization_id     uuid references public.organizations (id) on delete restrict,
  source              public.clinical_source not null default 'HOSPITAL',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint medications_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date),
  constraint medications_finished_has_end_date
    check (status not in ('COMPLETED', 'STOPPED') or end_date is not null),
  constraint medications_hospitalization_fkey
    foreign key (hospitalization_id, patient_id)
    references public.hospitalizations (id, patient_id)
    on delete restrict,
  constraint medications_care_plan_fkey
    foreign key (care_plan_id, patient_id)
    references public.care_plans (id, patient_id)
    on delete restrict,
  constraint medications_prescriber_membership_fkey
    foreign key (organization_id, prescribed_by)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict
);

comment on table public.medications is 'Medications prescribed to a patient.';
comment on column public.medications.frequency_text is
  'Free-text schedule for anything the enum cannot express.';
comment on column public.medications.prescribed_by is 'Prescribing clinician.';

create index medications_patient_status_idx on public.medications (patient_id, status);
create index medications_care_plan_id_idx on public.medications (care_plan_id);
create index medications_hospitalization_id_idx on public.medications (hospitalization_id);
create index medications_prescribed_by_idx on public.medications (prescribed_by);
create index medications_organization_id_idx on public.medications (organization_id);
create index medications_active_idx
  on public.medications (patient_id, start_date desc) where status = 'ACTIVE';

create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();


create table public.procedures (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  hospitalization_id  uuid,
  name                text not null check (btrim(name) <> ''),
  code                text,
  category            public.procedure_category not null default 'OTHER',
  performed_at        timestamptz not null default now(),
  performed_by        uuid references public.profiles (id) on delete restrict,
  organization_id     uuid references public.organizations (id) on delete restrict,
  outcome             text,
  notes               text,
  source              public.clinical_source not null default 'HOSPITAL',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint procedures_hospitalization_fkey
    foreign key (hospitalization_id, patient_id)
    references public.hospitalizations (id, patient_id)
    on delete restrict,
  constraint procedures_performer_membership_fkey
    foreign key (organization_id, performed_by)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict
);

comment on table public.procedures is
  'Medical procedures and interventions (surgery, imaging, diagnostic, therapeutic).';

create index procedures_patient_performed_at_idx
  on public.procedures (patient_id, performed_at desc);
create index procedures_hospitalization_id_idx on public.procedures (hospitalization_id);
create index procedures_category_idx on public.procedures (patient_id, category);
create index procedures_performed_by_idx on public.procedures (performed_by);
create index procedures_organization_id_idx on public.procedures (organization_id);

create trigger procedures_set_updated_at
  before update on public.procedures
  for each row execute function public.set_updated_at();


-- small on purpose, just enough for a warning badge
create table public.allergies (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  substance        text not null check (btrim(substance) <> ''),
  reaction         text,
  severity         public.allergy_severity not null default 'MODERATE',
  status           public.allergy_status not null default 'ACTIVE',
  noted_at         date,
  note             text,
  source           public.clinical_source not null default 'HOSPITAL',
  recorded_by      uuid references public.profiles (id) on delete restrict,
  organization_id  uuid references public.organizations (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint allergies_recorder_membership_fkey
    foreign key (organization_id, recorded_by)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict
);

comment on table public.allergies is 'Patient allergies.';

create index allergies_patient_status_idx on public.allergies (patient_id, status);
create index allergies_recorded_by_idx on public.allergies (recorded_by);
create index allergies_organization_id_idx on public.allergies (organization_id);

create unique index allergies_one_active_per_substance
  on public.allergies (patient_id, lower(btrim(substance))) where status = 'ACTIVE';

create trigger allergies_set_updated_at
  before update on public.allergies
  for each row execute function public.set_updated_at();


-- timeline layer. every row points back at the real record, nothing medical
-- is stored only here.
create table public.twin_events (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  event_type       public.twin_event_type not null,
  phase            public.care_phase not null,
  severity         public.twin_event_severity not null default 'INFO',
  occurred_at      timestamptz not null default now(),
  title            text not null check (btrim(title) <> ''),
  description      text,
  source_table     text,
  source_id        uuid,
  actor_id         uuid references public.profiles (id) on delete set null,
  organization_id  uuid references public.organizations (id) on delete set null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),

  constraint twin_events_source_pair
    check ((source_table is null) = (source_id is null))
);

comment on table public.twin_events is
  'Append-only chronological event stream of the Digital Twin.';
comment on column public.twin_events.phase is
  'HOSPITAL or HOME — which side of the discharge line the event sits on.';
comment on column public.twin_events.title is
  'Pre-rendered one-line label ("Temperature 38.2 °C"), so the timeline does not need to join six tables.';
comment on column public.twin_events.metadata is 'Event-specific extras only.';

create index twin_events_patient_occurred_at_idx
  on public.twin_events (patient_id, occurred_at desc);
create index twin_events_patient_type_idx on public.twin_events (patient_id, event_type);
create index twin_events_patient_phase_idx on public.twin_events (patient_id, phase, occurred_at desc);
create index twin_events_severity_idx
  on public.twin_events (patient_id, occurred_at desc) where severity <> 'INFO';
create index twin_events_source_idx on public.twin_events (source_table, source_id);


-- append only
create or replace function public.twin_events_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'twin_events is append-only (attempted % on event %)', tg_op, old.id
    using errcode = '42501';
end;
$$;

comment on function public.twin_events_block_mutation() is
  'BEFORE UPDATE/DELETE on twin_events: the Digital Twin timeline is immutable.';

create trigger twin_events_no_update
  before update on public.twin_events
  for each row execute function public.twin_events_block_mutation();

create trigger twin_events_no_delete
  before delete on public.twin_events
  for each row execute function public.twin_events_block_mutation();


create or replace function public.clinical_phase(
  p_source public.clinical_source,
  p_hospitalization_id uuid
)
returns public.care_phase
language sql
immutable
set search_path = ''
as $$
  select case
    when p_hospitalization_id is not null or p_source = 'HOSPITAL'
      then 'HOSPITAL'::public.care_phase
    else 'HOME'::public.care_phase
  end;
$$;


create or replace function public.observation_label(
  p_type      public.observation_type,
  p_numeric   numeric,
  p_secondary numeric,
  p_boolean   boolean,
  p_text      text,
  p_unit      text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'BLOOD_PRESSURE' then
      'Blood pressure ' || p_numeric::text || '/' || p_secondary::text || coalesce(' ' || p_unit, '')
    when p_numeric is not null then
      initcap(replace(p_type::text, '_', ' ')) || ' ' || p_numeric::text || coalesce(' ' || p_unit, '')
    when p_boolean is not null then
      initcap(replace(p_type::text, '_', ' ')) || ': ' || case when p_boolean then 'yes' else 'no' end
    else
      initcap(replace(p_type::text, '_', ' ')) || coalesce(': ' || p_text, '')
  end;
$$;


-- the only thing that writes twin_events
create or replace function public.log_twin_event(
  p_patient_id      uuid,
  p_event_type      public.twin_event_type,
  p_phase           public.care_phase,
  p_title           text,
  p_occurred_at     timestamptz default now(),
  p_description     text default null,
  p_severity        public.twin_event_severity default 'INFO',
  p_source_table    text default null,
  p_source_id       uuid default null,
  p_actor_id        uuid default null,
  p_organization_id uuid default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  insert into public.twin_events (
    patient_id, event_type, phase, severity, occurred_at, title, description,
    source_table, source_id, actor_id, organization_id, metadata
  )
  values (
    p_patient_id, p_event_type, p_phase, p_severity,
    coalesce(p_occurred_at, now()), p_title, p_description,
    p_source_table, p_source_id, p_actor_id, p_organization_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  update public.digital_twins
     set last_updated_at = now()
   where patient_id = p_patient_id;

  return v_event_id;
end;
$$;

comment on function public.log_twin_event is
  'Appends one event to the Digital Twin timeline and refreshes digital_twins.last_updated_at.';


create or replace function public.diagnoses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'DIAGNOSIS_ADDED',
    public.clinical_phase(new.source, new.hospitalization_id),
    new.name,
    coalesce(new.diagnosed_at::timestamptz, new.created_at),
    nullif(concat_ws(' · ', new.code, initcap(replace(new.type::text, '_', ' '))), ''),
    'INFO',
    'diagnoses',
    new.id,
    new.recorded_by,
    new.organization_id,
    jsonb_build_object('code', new.code, 'type', new.type::text, 'status', new.status::text)
  );
  return null;
end;
$$;

create trigger diagnoses_log_twin_event
  after insert on public.diagnoses
  for each row execute function public.diagnoses_after_insert();


create or replace function public.observations_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'OBSERVATION_RECORDED',
    public.clinical_phase(new.source, new.hospitalization_id),
    public.observation_label(new.type, new.value_numeric, new.value_secondary,
                             new.value_boolean, new.value_text, new.unit),
    new.recorded_at,
    case when new.source = 'PATIENT' then 'Reported by the patient' else new.note end,
    case when new.is_abnormal then 'WARNING'::public.twin_event_severity
         else 'INFO'::public.twin_event_severity end,
    'observations',
    new.id,
    new.recorded_by,
    new.organization_id,
    jsonb_build_object(
      'type', new.type::text,
      'value', new.value_numeric,
      'value_secondary', new.value_secondary,
      'value_boolean', new.value_boolean,
      'unit', new.unit,
      'source', new.source::text
    )
  );
  return null;
end;
$$;

create trigger observations_log_twin_event
  after insert on public.observations
  for each row execute function public.observations_after_insert();


create or replace function public.lab_results_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.flag is null and new.value_numeric is not null then
    if new.reference_high is not null and new.value_numeric > new.reference_high then
      new.flag := 'HIGH';
    elsif new.reference_low is not null and new.value_numeric < new.reference_low then
      new.flag := 'LOW';
    elsif new.reference_low is not null or new.reference_high is not null then
      new.flag := 'NORMAL';
    end if;
  end if;
  return new;
end;
$$;

create trigger lab_results_before_write
  before insert or update on public.lab_results
  for each row execute function public.lab_results_before_write();


create or replace function public.lab_results_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'LAB_RESULT_ADDED',
    public.clinical_phase(new.source, new.hospitalization_id),
    new.analyte || ' ' || coalesce(new.value_numeric::text, new.value_text)
      || coalesce(' ' || new.unit, ''),
    coalesce(new.resulted_at, new.collected_at),
    new.panel,
    case new.flag
      when 'CRITICAL' then 'CRITICAL'::public.twin_event_severity
      when 'HIGH'     then 'WARNING'::public.twin_event_severity
      when 'LOW'      then 'WARNING'::public.twin_event_severity
      else 'INFO'::public.twin_event_severity
    end,
    'lab_results',
    new.id,
    new.recorded_by,
    new.organization_id,
    jsonb_build_object(
      'analyte', new.analyte,
      'value', new.value_numeric,
      'unit', new.unit,
      'flag', new.flag::text,
      'reference_low', new.reference_low,
      'reference_high', new.reference_high
    )
  );
  return null;
end;
$$;

create trigger lab_results_log_twin_event
  after insert on public.lab_results
  for each row execute function public.lab_results_after_insert();


create or replace function public.medications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'MEDICATION_PRESCRIBED',
    public.clinical_phase(new.source, new.hospitalization_id),
    new.name || coalesce(' ' || new.dose::text, '') || coalesce(' ' || new.dose_unit, ''),
    coalesce(new.start_date::timestamptz, new.created_at),
    nullif(concat_ws(' · ',
      initcap(replace(new.frequency::text, '_', ' ')),
      new.route::text,
      new.instructions), ''),
    'INFO',
    'medications',
    new.id,
    new.prescribed_by,
    new.organization_id,
    jsonb_build_object(
      'name', new.name,
      'dose', new.dose,
      'dose_unit', new.dose_unit,
      'frequency', new.frequency::text,
      'route', new.route::text
    )
  );
  return null;
end;
$$;

create trigger medications_log_twin_event
  after insert on public.medications
  for each row execute function public.medications_after_insert();


create or replace function public.procedures_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'PROCEDURE_COMPLETED',
    public.clinical_phase(new.source, new.hospitalization_id),
    new.name,
    new.performed_at,
    nullif(concat_ws(' · ', initcap(replace(new.category::text, '_', ' ')), new.outcome), ''),
    'INFO',
    'procedures',
    new.id,
    new.performed_by,
    new.organization_id,
    jsonb_build_object('category', new.category::text, 'code', new.code)
  );
  return null;
end;
$$;

create trigger procedures_log_twin_event
  after insert on public.procedures
  for each row execute function public.procedures_after_insert();


create or replace function public.allergies_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'ALLERGY_RECORDED',
    public.clinical_phase(new.source, null::uuid),
    'Allergy: ' || new.substance,
    coalesce(new.noted_at::timestamptz, new.created_at),
    nullif(concat_ws(' · ', new.reaction, initcap(new.severity::text)), ''),
    case when new.severity = 'SEVERE' then 'WARNING'::public.twin_event_severity
         else 'INFO'::public.twin_event_severity end,
    'allergies',
    new.id,
    new.recorded_by,
    new.organization_id,
    jsonb_build_object('substance', new.substance, 'severity', new.severity::text)
  );
  return null;
end;
$$;

create trigger allergies_log_twin_event
  after insert on public.allergies
  for each row execute function public.allergies_after_insert();


-- also keeps digital_twins.current_status in sync
create or replace function public.hospitalizations_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_name       text;
  v_status_changed boolean;
begin
  -- OLD is unassigned on INSERT, so it is never touched in the same
  -- expression as a TG_OP test (PostgreSQL does not promise to short-circuit
  -- a boolean OR).
  if tg_op = 'UPDATE' then
    v_status_changed := old.status is distinct from new.status;
  else
    v_status_changed := true;
  end if;

  select o.name into v_org_name
    from public.organizations o
   where o.id = new.organization_id;

  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'HOSPITAL_ADMISSION', 'HOSPITAL',
      'Admitted to ' || coalesce(v_org_name, 'hospital'),
      new.admitted_at, new.admission_reason, 'INFO',
      'hospitalizations', new.id, new.attending_doctor_id, new.organization_id,
      jsonb_build_object('reason', new.admission_reason,
                         'primary_diagnosis', new.primary_diagnosis)
    );

    if new.status = 'ACTIVE' then
      update public.digital_twins
         set current_status = 'HOSPITALIZED'
       where patient_id = new.patient_id;
    end if;
  end if;

  -- Discharge: on UPDATE, or on INSERT of an already-closed episode (seed data).
  if new.status in ('DISCHARGED', 'TRANSFERRED') and v_status_changed then
    perform public.log_twin_event(
      new.patient_id, 'PATIENT_DISCHARGED', 'HOSPITAL',
      case when new.status = 'TRANSFERRED'
           then 'Transferred from ' || coalesce(v_org_name, 'hospital')
           else 'Discharged from ' || coalesce(v_org_name, 'hospital') end,
      new.discharged_at, new.discharge_summary, 'INFO',
      'hospitalizations', new.id, new.attending_doctor_id, new.organization_id,
      jsonb_build_object('status', new.status::text)
    );

    update public.digital_twins
       set current_status = 'POST_DISCHARGE_MONITORING'
     where patient_id = new.patient_id
       and current_status in ('NEW', 'HOSPITALIZED');
  end if;

  return null;
end;
$$;

create trigger hospitalizations_log_twin_event
  after insert or update on public.hospitalizations
  for each row execute function public.hospitalizations_after_write();


create or replace function public.care_plans_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_became_active    boolean;
  v_became_completed boolean;
begin
  if tg_op = 'UPDATE' then
    v_became_active    := new.status = 'ACTIVE'    and old.status is distinct from 'ACTIVE';
    v_became_completed := new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED';
  else
    v_became_active    := new.status = 'ACTIVE';
    v_became_completed := false;
  end if;

  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'CARE_PLAN_CREATED', 'HOME',
      'Care plan: ' || new.title,
      new.created_at, new.summary, 'INFO',
      'care_plans', new.id, new.created_by, new.source_organization_id,
      jsonb_build_object('status', new.status::text,
                         'receiving_organization_id', new.receiving_organization_id)
    );
  end if;

  if v_became_active then
    perform public.log_twin_event(
      new.patient_id, 'CARE_PLAN_APPROVED', 'HOME',
      'Care plan approved: ' || new.title,
      coalesce(new.approved_at, now()), new.instructions, 'INFO',
      'care_plans', new.id, new.approved_by, new.receiving_organization_id,
      jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date)
    );

    update public.digital_twins
       set current_status = 'POST_DISCHARGE_MONITORING'
     where patient_id = new.patient_id
       and current_status <> 'HOSPITALIZED';
  end if;

  -- Follow-up finished and no other plan is running: back to stable.
  if v_became_completed then
    update public.digital_twins
       set current_status = 'STABLE'
     where patient_id = new.patient_id
       and current_status = 'POST_DISCHARGE_MONITORING'
       and not exists (
         select 1 from public.care_plans cp
          where cp.patient_id = new.patient_id
            and cp.id <> new.id
            and cp.status = 'ACTIVE'
       );
  end if;

  return null;
end;
$$;

create trigger care_plans_log_twin_event
  after insert or update on public.care_plans
  for each row execute function public.care_plans_after_write();


create or replace function public.care_assignments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker          text;
  v_role            public.membership_role;
  v_newly_accepted  boolean;
begin
  if tg_op = 'UPDATE' then
    v_newly_accepted := new.accepted_at is not null and old.accepted_at is null;
  else
    v_newly_accepted := new.accepted_at is not null;
  end if;

  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    into v_worker
    from public.profiles p
   where p.id = new.assigned_user_id;

  select m.role into v_role
    from public.organization_memberships m
   where m.organization_id = new.organization_id
     and m.user_id = new.assigned_user_id;

  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'NURSE_ASSIGNED', 'HOME',
      'Follow-up assigned to ' || coalesce(v_worker, 'medical worker'),
      new.assigned_at, new.notes, 'INFO',
      'care_assignments', new.id, new.assigned_by, new.organization_id,
      jsonb_build_object('assigned_user_id', new.assigned_user_id,
                         'role', v_role::text)
    );
  end if;

  if v_newly_accepted then
    perform public.log_twin_event(
      new.patient_id, 'CARE_ASSIGNMENT_ACCEPTED', 'HOME',
      coalesce(v_worker, 'Medical worker') || ' accepted responsibility',
      new.accepted_at, null::text, 'INFO',
      'care_assignments', new.id, new.assigned_user_id, new.organization_id,
      jsonb_build_object('role', v_role::text)
    );
  end if;

  return null;
end;
$$;

create trigger care_assignments_log_twin_event
  after insert or update on public.care_assignments
  for each row execute function public.care_assignments_after_write();


create or replace function public.digital_twins_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.risk_level is distinct from old.risk_level then
    perform public.log_twin_event(
      new.patient_id,
      'RISK_LEVEL_CHANGED',
      case when new.current_status = 'HOSPITALIZED'
           then 'HOSPITAL'::public.care_phase
           else 'HOME'::public.care_phase end,
      'Risk level: ' || coalesce(old.risk_level::text, 'not assessed')
        || ' → ' || coalesce(new.risk_level::text, 'not assessed'),
      now(), null::text,
      case new.risk_level
        when 'CRITICAL' then 'CRITICAL'::public.twin_event_severity
        when 'HIGH'     then 'WARNING'::public.twin_event_severity
        else 'INFO'::public.twin_event_severity
      end,
      'digital_twins', new.id, null::uuid, null::uuid,
      jsonb_build_object('from', old.risk_level::text, 'to', new.risk_level::text)
    );
  end if;
  return null;
end;
$$;

create trigger digital_twins_log_risk_change
  after update on public.digital_twins
  for each row execute function public.digital_twins_after_update();


revoke execute on function
  public.twin_events_block_mutation(),
  public.log_twin_event(uuid, public.twin_event_type, public.care_phase, text,
                        timestamptz, text, public.twin_event_severity, text, uuid,
                        uuid, uuid, jsonb),
  public.diagnoses_after_insert(),
  public.observations_after_insert(),
  public.lab_results_before_write(),
  public.lab_results_after_insert(),
  public.medications_after_insert(),
  public.procedures_after_insert(),
  public.allergies_after_insert(),
  public.hospitalizations_after_write(),
  public.care_plans_after_write(),
  public.care_assignments_after_write(),
  public.digital_twins_after_update()
from public, anon, authenticated;


-- same as stage 1: rls on, policies later
alter table public.diagnoses    enable row level security;
alter table public.observations enable row level security;
alter table public.lab_results  enable row level security;
alter table public.medications  enable row level security;
alter table public.procedures   enable row level security;
alter table public.allergies    enable row level security;
alter table public.twin_events  enable row level security;

revoke all on table
  public.diagnoses,
  public.observations,
  public.lab_results,
  public.medications,
  public.procedures,
  public.allergies,
  public.twin_events
from anon;


revoke update, delete on table public.twin_events from authenticated;
