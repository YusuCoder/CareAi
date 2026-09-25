-- core schema for TwinCare.
-- one patient = one digital twin. organizations never get their own copy of a
-- patient, they get access through hospitalizations and care plans.

create type public.organization_type as enum (
  'CENTRAL_HOSPITAL',
  'POLYCLINIC',
  'PRIVATE_CLINIC',
  'REHABILITATION_CENTER',
  'OTHER'
);

create type public.membership_role as enum (
  'SUPER_ADMIN',
  'ORGANIZATION_ADMIN',
  'HOSPITAL_DOCTOR',
  'POLYCLINIC_DOCTOR',
  'NURSE'
);

create type public.gender as enum ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

create type public.twin_status as enum (
  'NEW',
  'HOSPITALIZED',
  'POST_DISCHARGE_MONITORING',
  'STABLE',
  'INACTIVE'
);

create type public.risk_level as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

create type public.hospitalization_status as enum (
  'ACTIVE',
  'DISCHARGED',
  'TRANSFERRED',
  'CANCELLED'
);

create type public.care_plan_status as enum (
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED'
);

create type public.care_assignment_status as enum (
  'PENDING',
  'ACCEPTED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED'
);


create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: keeps updated_at current.';


-- one profile per auth user
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text,
  last_name   text,
  phone       text,
  avatar_url  text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for every Supabase Auth user (1:1 with auth.users).';
comment on column public.profiles.is_active is
  'Deactivate instead of deleting: users referenced by clinical records cannot be hard-deleted.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- role is NOT taken from raw_user_meta_data, users can edit that themselves
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    coalesce(nullif(new.phone, ''), nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT trigger on auth.users: creates the matching public.profiles row.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  type        public.organization_type not null,
  region      text,
  district    text,
  address     text,
  phone       text,
  latitude    numeric(9, 6) check (latitude between -90 and 90),
  longitude   numeric(9, 6) check (longitude between -180 and 180),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organizations is
  'Medical organizations: central hospitals, polyclinics, private clinics, rehabilitation centers.';

create index organizations_type_idx on public.organizations (type);
create index organizations_region_district_idx on public.organizations (region, district);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();


create table public.organization_memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             public.membership_role not null,
  job_title        text,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint organization_memberships_org_user_key unique (organization_id, user_id)
);

comment on table public.organization_memberships is
  'Links a user to an organization with a role.';
comment on column public.organization_memberships.role is
  'Role of the user inside this organization.';


create index organization_memberships_user_id_idx on public.organization_memberships (user_id);

create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();


-- a patient is not owned by any organization
create table public.patients (
  id                 uuid primary key default gen_random_uuid(),
  national_id        text unique check (national_id is null or btrim(national_id) <> ''),
  first_name         text not null check (btrim(first_name) <> ''),
  last_name          text not null check (btrim(last_name) <> ''),
  birth_date         date check (birth_date >= date '1900-01-01'),
  gender             public.gender not null default 'UNKNOWN',
  phone              text,
  telegram_id        bigint unique,
  region             text,
  district           text,
  address            text,
  primary_clinic_id  uuid references public.organizations (id) on delete restrict,
  is_active          boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.patients is 'A person receiving care.';
comment on column public.patients.national_id is 'National identifier (PINFL).';
comment on column public.patients.telegram_id is
  'Telegram user id for future patient monitoring bot (Stage 2).';
comment on column public.patients.primary_clinic_id is
  'Territorial/local polyclinic responsible for the patient''s follow-up care.';

create index patients_primary_clinic_id_idx on public.patients (primary_clinic_id);
create index patients_name_idx on public.patients (lower(last_name), lower(first_name));
create index patients_birth_date_idx on public.patients (birth_date);

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();


-- unique patient_id + trigger below = exactly one twin per patient
create table public.digital_twins (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  current_status   public.twin_status not null default 'NEW',
  risk_level       public.risk_level,
  last_updated_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),

  constraint digital_twins_patient_id_key unique (patient_id)
);

comment on table public.digital_twins is
  'Persistent longitudinal Digital Twin of a patient — identity and current state only.';
comment on column public.digital_twins.risk_level is 'Current clinical risk.';


create or replace function public.create_digital_twin_for_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.digital_twins (patient_id)
  values (new.id)
  on conflict (patient_id) do nothing;
  return new;
end;
$$;

comment on function public.create_digital_twin_for_patient() is
  'AFTER INSERT trigger on patients: creates the patient''s single Digital Twin.';

create trigger patients_create_digital_twin
  after insert on public.patients
  for each row execute function public.create_digital_twin_for_patient();


create or replace function public.digital_twins_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.patient_id is distinct from old.patient_id then
    raise exception 'digital_twins.patient_id is immutable (twin %)', old.id
      using errcode = '23514';
  end if;
  new.last_updated_at := now();
  return new;
end;
$$;

create trigger digital_twins_before_update
  before update on public.digital_twins
  for each row execute function public.digital_twins_before_update();


-- one inpatient episode
create table public.hospitalizations (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.patients (id) on delete restrict,
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  attending_doctor_id  uuid references public.profiles (id) on delete restrict,
  admitted_at          timestamptz not null default now(),
  discharged_at        timestamptz,
  admission_reason     text,
  primary_diagnosis    text,
  procedure_summary    text,
  discharge_summary    text,
  status               public.hospitalization_status not null default 'ACTIVE',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint hospitalizations_discharge_after_admission
    check (discharged_at is null or discharged_at >= admitted_at),
  constraint hospitalizations_active_has_no_discharge
    check (status <> 'ACTIVE' or discharged_at is null),
  constraint hospitalizations_discharge_has_timestamp
    check (status not in ('DISCHARGED', 'TRANSFERRED') or discharged_at is not null),

  constraint hospitalizations_attending_doctor_membership_fkey
    foreign key (organization_id, attending_doctor_id)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict,

  constraint hospitalizations_id_patient_org_key unique (id, patient_id, organization_id)
);

comment on table public.hospitalizations is
  'An inpatient episode of a patient in an organization.';
comment on column public.hospitalizations.discharged_at is
  'Time the patient left the organization (discharge or transfer).';

create index hospitalizations_patient_id_idx on public.hospitalizations (patient_id);
create index hospitalizations_organization_status_idx on public.hospitalizations (organization_id, status);
create index hospitalizations_status_idx on public.hospitalizations (status);
create index hospitalizations_attending_doctor_id_idx on public.hospitalizations (attending_doctor_id);

create unique index hospitalizations_one_active_per_patient
  on public.hospitalizations (patient_id) where status = 'ACTIVE';

create trigger hospitalizations_set_updated_at
  before update on public.hospitalizations
  for each row execute function public.set_updated_at();


-- discharge handover, hospital -> polyclinic
create table public.care_plans (
  id                         uuid primary key default gen_random_uuid(),
  patient_id                 uuid not null references public.patients (id) on delete restrict,
  hospitalization_id         uuid,
  source_organization_id     uuid not null references public.organizations (id) on delete restrict,
  receiving_organization_id  uuid not null references public.organizations (id) on delete restrict,
  created_by                 uuid references public.profiles (id) on delete restrict,
  approved_by                uuid references public.profiles (id) on delete restrict,
  title                      text not null check (btrim(title) <> ''),
  summary                    text,
  instructions               text,
  start_date                 date,
  end_date                   date,
  status                     public.care_plan_status not null default 'DRAFT',
  approved_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint care_plans_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date),

  constraint care_plans_active_requires_approval
    check (status not in ('ACTIVE', 'COMPLETED') or approved_by is not null),
  constraint care_plans_draft_not_approved
    check (status not in ('DRAFT', 'PENDING_APPROVAL') or approved_by is null),
  constraint care_plans_approval_fields_together
    check ((approved_by is null) = (approved_at is null)),

  constraint care_plans_hospitalization_fkey
    foreign key (hospitalization_id, patient_id, source_organization_id)
    references public.hospitalizations (id, patient_id, organization_id)
    on delete restrict,

  constraint care_plans_id_patient_receiving_key unique (id, patient_id, receiving_organization_id)
);

comment on table public.care_plans is
  'Post-discharge care plan handing follow-up responsibility from a source organization (usually the hospital) to a receiving organization (usually the patient''s polyclinic).';
comment on column public.care_plans.created_by is 'Author of the plan.';
comment on column public.care_plans.approved_by is
  'Clinician (HOSPITAL_DOCTOR / POLYCLINIC_DOCTOR of the source or receiving organization) who approved the plan.';
comment on column public.care_plans.receiving_organization_id is
  'Defaults to patients.primary_clinic_id when omitted on insert.';

create index care_plans_patient_id_idx on public.care_plans (patient_id);
create index care_plans_receiving_org_status_idx on public.care_plans (receiving_organization_id, status);
create index care_plans_status_idx on public.care_plans (status);
create index care_plans_hospitalization_id_idx on public.care_plans (hospitalization_id);
create index care_plans_source_organization_id_idx on public.care_plans (source_organization_id);
create index care_plans_created_by_idx on public.care_plans (created_by);
create index care_plans_approved_by_idx on public.care_plans (approved_by);

create trigger care_plans_set_updated_at
  before update on public.care_plans
  for each row execute function public.set_updated_at();


create or replace function public.care_plans_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hospitalization_status public.hospitalization_status;
begin
  -- Receiving organization defaults to the patient's territorial polyclinic.
  if tg_op = 'INSERT' and new.receiving_organization_id is null then
    select p.primary_clinic_id
      into new.receiving_organization_id
      from public.patients p
     where p.id = new.patient_id;

    if new.receiving_organization_id is null then
      raise exception 'Patient % has no primary_clinic_id; set it or pass receiving_organization_id explicitly', new.patient_id
        using errcode = '23502';
    end if;
  end if;

  -- A plan cannot take effect while the patient is still admitted.
  if new.status in ('ACTIVE', 'COMPLETED') and new.hospitalization_id is not null then
    select h.status
      into v_hospitalization_status
      from public.hospitalizations h
     where h.id = new.hospitalization_id;

    if v_hospitalization_status = 'ACTIVE' then
      raise exception 'Care plan cannot be % while hospitalization % is still ACTIVE', new.status, new.hospitalization_id
        using errcode = '23514';
    end if;
  end if;

  -- Only a clinician of the source or receiving organization may approve.
  if new.approved_by is not null
     and (tg_op = 'INSERT' or new.approved_by is distinct from old.approved_by) then
    if not exists (
      select 1
        from public.organization_memberships m
       where m.user_id = new.approved_by
         and m.is_active
         and m.organization_id in (new.source_organization_id, new.receiving_organization_id)
         and m.role in ('HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR')
    ) then
      raise exception 'Approver % must be an active HOSPITAL_DOCTOR or POLYCLINIC_DOCTOR of the source or receiving organization', new.approved_by
        using errcode = '42501';
    end if;

    if new.approved_at is null then
      new.approved_at := now();
    end if;
  end if;

  return new;
end;
$$;

comment on function public.care_plans_before_write() is
  'BEFORE INSERT/UPDATE on care_plans: defaults receiving org to the patient''s polyclinic, blocks activation before discharge, and requires clinician approval.';

create trigger care_plans_before_write
  before insert or update on public.care_plans
  for each row execute function public.care_plans_before_write();


-- who actually follows the patient at home
create table public.care_assignments (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients (id) on delete restrict,
  care_plan_id      uuid not null,
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  assigned_user_id  uuid not null references public.profiles (id) on delete restrict,
  assigned_by       uuid references public.profiles (id) on delete restrict,
  status            public.care_assignment_status not null default 'PENDING',
  assigned_at       timestamptz not null default now(),
  accepted_at       timestamptz,
  completed_at      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),


  constraint care_assignments_care_plan_fkey
    foreign key (care_plan_id, patient_id, organization_id)
    references public.care_plans (id, patient_id, receiving_organization_id)
    on delete restrict,

  constraint care_assignments_assignee_membership_fkey
    foreign key (organization_id, assigned_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict,
  constraint care_assignments_accepted_has_timestamp
    check (status not in ('ACCEPTED', 'ACTIVE', 'COMPLETED') or accepted_at is not null),
  constraint care_assignments_completed_has_timestamp
    check (status <> 'COMPLETED' or completed_at is not null),
  constraint care_assignments_accepted_after_assigned
    check (accepted_at is null or accepted_at >= assigned_at),
  constraint care_assignments_completed_after_accepted
    check (completed_at is null or completed_at >= coalesce(accepted_at, assigned_at))
);

comment on table public.care_assignments is
  'Transfer of follow-up responsibility for a care plan to a specific nurse / polyclinic doctor of the receiving organization.';
comment on column public.care_assignments.assigned_by is
  'ORGANIZATION_ADMIN of the receiving organization (or SUPER_ADMIN) who made the assignment.';

create index care_assignments_assigned_user_status_idx on public.care_assignments (assigned_user_id, status);
create index care_assignments_organization_status_idx on public.care_assignments (organization_id, status);
create index care_assignments_patient_id_idx on public.care_assignments (patient_id);
create index care_assignments_status_idx on public.care_assignments (status);
create index care_assignments_care_plan_id_idx on public.care_assignments (care_plan_id);
create index care_assignments_assigned_by_idx on public.care_assignments (assigned_by);

create unique index care_assignments_one_open_per_worker_plan
  on public.care_assignments (care_plan_id, assigned_user_id)
  where status in ('PENDING', 'ACCEPTED', 'ACTIVE');

create trigger care_assignments_set_updated_at
  before update on public.care_assignments
  for each row execute function public.set_updated_at();

create or replace function public.care_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_care_plan_status public.care_plan_status;
begin
  -- Only clinician-approved (ACTIVE) care plans can be assigned.
  if tg_op = 'INSERT' then
    select cp.status
      into v_care_plan_status
      from public.care_plans cp
     where cp.id = new.care_plan_id;

    if v_care_plan_status is distinct from 'ACTIVE' then
      raise exception 'Care plan % must be ACTIVE (approved) before assignment; it is %', new.care_plan_id, coalesce(v_care_plan_status::text, 'missing')
        using errcode = '23514';
    end if;
  end if;

  -- Assignee must be an active nurse or polyclinic doctor of the organization.
  if tg_op = 'INSERT'
     or new.assigned_user_id is distinct from old.assigned_user_id
     or new.organization_id is distinct from old.organization_id then
    if not exists (
      select 1
        from public.organization_memberships m
       where m.organization_id = new.organization_id
         and m.user_id = new.assigned_user_id
         and m.is_active
         and m.role in ('NURSE', 'POLYCLINIC_DOCTOR')
    ) then
      raise exception 'Assignee % must be an active NURSE or POLYCLINIC_DOCTOR of organization %', new.assigned_user_id, new.organization_id
        using errcode = '42501';
    end if;
  end if;

  -- Assigner must be the organization's admin or a super admin.
  if new.assigned_by is not null
     and (tg_op = 'INSERT' or new.assigned_by is distinct from old.assigned_by) then
    if not exists (
      select 1
        from public.organization_memberships m
       where m.user_id = new.assigned_by
         and m.is_active
         and (
           (m.organization_id = new.organization_id and m.role = 'ORGANIZATION_ADMIN')
           or m.role = 'SUPER_ADMIN'
         )
    ) then
      raise exception 'Assigner % must be ORGANIZATION_ADMIN of organization % or SUPER_ADMIN', new.assigned_by, new.organization_id
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.care_assignments_before_write() is
  'BEFORE INSERT/UPDATE on care_assignments: requires an ACTIVE care plan, an eligible assignee and an authorized assigner.';

create trigger care_assignments_before_write
  before insert or update on public.care_assignments
  for each row execute function public.care_assignments_before_write();


-- trigger functions are not meant to be called directly
revoke execute on function
  public.set_updated_at(),
  public.handle_new_user(),
  public.create_digital_twin_for_patient(),
  public.digital_twins_before_update(),
  public.care_plans_before_write(),
  public.care_assignments_before_write()
from public, anon, authenticated;


-- rls on everywhere. medical tables have no policies yet, only the service
-- role can read them until the policy migration.
alter table public.profiles                 enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.patients                 enable row level security;
alter table public.digital_twins            enable row level security;
alter table public.hospitalizations         enable row level security;
alter table public.care_plans               enable row level security;
alter table public.care_assignments         enable row level security;


revoke all on table
  public.profiles,
  public.organizations,
  public.organization_memberships,
  public.patients,
  public.digital_twins,
  public.hospitalizations,
  public.care_plans,
  public.care_assignments
from anon;


create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can read their own memberships"
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Members can read their organizations"
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.organization_memberships m
       where m.organization_id = organizations.id
         and m.user_id = (select auth.uid())
         and m.is_active
    )
  );
