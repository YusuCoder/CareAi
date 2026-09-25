alter table public.patients
  add column patient_number bigint generated always as identity;

alter table public.patients
  add constraint patients_patient_number_key unique (patient_number);

comment on column public.patients.patient_number is 'Номер медицинской карты для отображения и поиска.';
