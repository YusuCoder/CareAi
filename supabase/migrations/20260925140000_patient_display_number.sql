-- readable patient number for the ui. id stays a uuid, this is a label only,
-- never use it for access checks.

alter table public.patients
  add column patient_number bigint generated always as identity;

alter table public.patients
  add constraint patients_patient_number_key unique (patient_number);

comment on column public.patients.patient_number is
  'Medical record number for display and search (1, 2, 3 …).';
