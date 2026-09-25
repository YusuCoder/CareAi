-- wearables. readings land in observations like everything else, the device
-- just says where they came from. oauth tokens go in the private schema so
-- postgrest cannot reach them.

create type public.device_provider as enum (
  'WHOOP',
  'APPLE_HEALTH',
  'GOOGLE_FIT',
  'FITBIT',
  'GARMIN',
  'OTHER'
);

create type public.device_status as enum (
  'ACTIVE',
  'INACTIVE',
  'REVOKED',
  'ERROR'
);

create type public.device_sync_status as enum ('SUCCESS', 'PARTIAL', 'FAILED');


-- one active device per provider per patient
create table public.devices (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  provider            public.device_provider not null,
  model               text,
  external_device_id  text,
  is_simulated        boolean not null default false,
  status              public.device_status not null default 'ACTIVE',
  linked_at           timestamptz not null default now(),
  unlinked_at         timestamptz,
  last_sync_at        timestamptz,
  linked_by           uuid references public.profiles (id) on delete set null,
  organization_id     uuid references public.organizations (id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint devices_unlinked_after_linked
    check (unlinked_at is null or unlinked_at >= linked_at),
  constraint devices_revoked_has_timestamp
    check (status <> 'REVOKED' or unlinked_at is not null)
);

comment on table public.devices is 'A connected wearable linked to a patient.';
comment on column public.devices.is_simulated is 'TRUE for demo/simulator devices.';
comment on column public.devices.external_device_id is
  'The provider''s own identifier for this device, used to match incoming sync payloads.';
comment on column public.devices.last_sync_at is 'Last successful ingestion.';

create index devices_patient_status_idx on public.devices (patient_id, status);
create index devices_status_idx on public.devices (status);
create index devices_linked_by_idx on public.devices (linked_by);
create index devices_organization_id_idx on public.devices (organization_id);

create unique index devices_one_active_per_provider
  on public.devices (patient_id, provider) where status = 'ACTIVE';

create unique index devices_provider_external_key
  on public.devices (provider, external_device_id) where external_device_id is not null;

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();


create schema if not exists private;

comment on schema private is 'Server-only objects.';

revoke all on schema private from public;
grant usage on schema private to service_role;

-- secrets. service role only.
create table private.device_connections (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  device_id          uuid references public.devices (id) on delete set null,
  provider           public.device_provider not null,
  external_user_id   text,
  access_token       text not null,
  refresh_token      text,
  token_expires_at   timestamptz,
  scopes             text[],
  status             public.device_status not null default 'ACTIVE',
  last_refreshed_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint device_connections_one_per_patient_provider
    unique (patient_id, provider)
);

comment on table private.device_connections is 'Provider OAuth tokens.';

create index device_connections_device_id_idx on private.device_connections (device_id);
create index device_connections_status_idx on private.device_connections (status);

create trigger device_connections_set_updated_at
  before update on private.device_connections
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on private.device_connections to service_role;


alter table private.device_connections enable row level security;


create table public.device_sync_log (
  id                     uuid primary key default gen_random_uuid(),
  device_id              uuid not null references public.devices (id) on delete cascade,
  patient_id             uuid not null references public.patients (id) on delete cascade,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 public.device_sync_status not null default 'SUCCESS',
  observations_ingested  integer not null default 0 check (observations_ingested >= 0),
  observations_skipped   integer not null default 0 check (observations_skipped >= 0),
  error_message          text,
  created_at             timestamptz not null default now(),

  constraint device_sync_log_finished_after_started
    check (finished_at is null or finished_at >= started_at),
  constraint device_sync_log_failed_has_reason
    check (status <> 'FAILED' or error_message is not null)
);

comment on table public.device_sync_log is 'One row per ingestion run.';

create index device_sync_log_device_started_idx
  on public.device_sync_log (device_id, started_at desc);
create index device_sync_log_patient_started_idx
  on public.device_sync_log (patient_id, started_at desc);
create index device_sync_log_failures_idx
  on public.device_sync_log (started_at desc) where status <> 'SUCCESS';


-- (device_id, external_id) is the idempotency key, otherwise every resync
-- duplicates the whole history
alter table public.observations
  add column device_id   uuid references public.devices (id) on delete set null,
  add column external_id text;

comment on column public.observations.device_id is
  'The device that produced this reading, when source = DEVICE.';
comment on column public.observations.external_id is 'The provider''s own id for this reading.';


create unique index observations_device_external_id_key
  on public.observations (device_id, external_id)
  where device_id is not null and external_id is not null;

create index observations_device_recorded_at_idx
  on public.observations (device_id, recorded_at desc) where device_id is not null;


-- a band reports every night. if each reading became an event the timeline
-- would be unreadable, so routine device data is charted but not logged.
create or replace function public.observations_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Routine device telemetry stays off the timeline (see note above).
  if new.source = 'DEVICE' and not new.is_abnormal then
    return null;
  end if;

  perform public.log_twin_event(
    new.patient_id,
    'OBSERVATION_RECORDED',
    public.clinical_phase(new.source, new.hospitalization_id),
    public.observation_label(new.type, new.value_numeric, new.value_secondary,
                             new.value_boolean, new.value_text, new.unit),
    new.recorded_at,
    case
      when new.source = 'PATIENT' then 'Reported by the patient'
      when new.source = 'DEVICE'  then 'Measured by a connected device'
      else new.note
    end,
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
      'source', new.source::text,
      'device_id', new.device_id
    )
  );
  return null;
end;
$$;


create or replace function public.devices_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admitted boolean;
  v_phase    public.care_phase;
  v_label    text;
  v_revoked  boolean;
begin
  if tg_op = 'UPDATE' then
    v_revoked := new.status = 'REVOKED' and old.status is distinct from 'REVOKED';
  else
    v_revoked := false;
  end if;

  select exists (
    select 1 from public.hospitalizations h
     where h.patient_id = new.patient_id and h.status = 'ACTIVE'
  ) into v_admitted;

  v_phase := case when v_admitted then 'HOSPITAL'::public.care_phase
                  else 'HOME'::public.care_phase end;

  v_label := initcap(replace(new.provider::text, '_', ' '))
             || coalesce(' ' || new.model, '')
             || case when new.is_simulated then ' (simulated)' else '' end;

  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'DEVICE_LINKED', v_phase,
      'Device linked: ' || v_label,
      new.linked_at, new.notes, 'INFO',
      'devices', new.id, new.linked_by, new.organization_id,
      jsonb_build_object('provider', new.provider::text,
                         'model', new.model,
                         'is_simulated', new.is_simulated)
    );
  end if;

  if v_revoked then
    perform public.log_twin_event(
      new.patient_id, 'DEVICE_UNLINKED', v_phase,
      'Device unlinked: ' || v_label,
      coalesce(new.unlinked_at, now()), null::text, 'INFO',
      'devices', new.id, null::uuid, new.organization_id,
      jsonb_build_object('provider', new.provider::text)
    );
  end if;

  return null;
end;
$$;

create trigger devices_log_twin_event
  after insert or update on public.devices
  for each row execute function public.devices_after_write();


revoke execute on function public.devices_after_write() from public, anon, authenticated;

alter table public.devices         enable row level security;
alter table public.device_sync_log enable row level security;

revoke all on table
  public.devices,
  public.device_sync_log
from anon;
