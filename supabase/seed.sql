-- Только для разработки: данные вымышлены. Не запускать в рабочей базе.
-- Для записей персонала и наблюдения заранее создайте пользователей через Supabase Auth:
-- doctor.demo@twincare.test, admin.demo@twincare.test, nurse.demo@twincare.test.
-- Пациенты старой версии без national_id не сопоставляются автоматически.

insert into public.organizations (name, type, region, district, address, phone, latitude, longitude)
select 'Наманганская городская центральная больница', 'CENTRAL_HOSPITAL', 'Namangan', 'Namangan city',
       'Demo street 1', '+998000000001', 40.998300, 71.672600
 where not exists (
   select 1 from public.organizations where name = 'Наманганская городская центральная больница'
 );

insert into public.organizations (name, type, region, district, address, phone, latitude, longitude)
select 'Семейная поликлиника №17', 'POLYCLINIC', 'Namangan', 'Namangan city',
       'Demo street 17', '+998000000017', 41.004000, 71.668000
 where not exists (
   select 1 from public.organizations where name = 'Семейная поликлиника №17'
 );

insert into public.patients (national_id, first_name, last_name, birth_date, gender,
    phone, region, district, address, primary_clinic_id)
select 'SYNTHETIC-DEMO-0001', 'Akmal', 'Karimov', date '1968-03-14', 'MALE',
       '+998000000100', 'Namangan', 'Namangan city', 'Demo street 42 (synthetic)', o.id
  from public.organizations o
 where o.name = 'Семейная поликлиника №17'
on conflict (national_id) do nothing;



do $$
declare
  v_hospital   uuid;
  v_polyclinic uuid;
  v_patient    uuid;
  v_doctor     uuid;
  v_admin      uuid;
  v_nurse      uuid;
  v_hosp_id    uuid;
  v_plan_id    uuid;
begin
  select id into v_hospital   from public.organizations where name = 'Наманганская городская центральная больница';
  select id into v_polyclinic from public.organizations where name = 'Семейная поликлиника №17';
  select id into v_patient    from public.patients      where national_id = 'SYNTHETIC-DEMO-0001';

  select id into v_doctor from auth.users where email = 'doctor.demo@twincare.test';
  select id into v_admin  from auth.users where email = 'admin.demo@twincare.test';
  select id into v_nurse  from auth.users where email = 'nurse.demo@twincare.test';

  if v_doctor is null or v_admin is null or v_nurse is null then
    raise notice 'Demo auth users not found — skipped memberships and discharge workflow. See header of supabase/seed.sql.';
    return;
  end if;

  update public.profiles set first_name = 'Bahodir', last_name = 'Demo-Doctor' where id = v_doctor and first_name is null;
  update public.profiles set first_name = 'Malika',  last_name = 'Demo-Admin'  where id = v_admin  and first_name is null;
  update public.profiles set first_name = 'Dilnoza', last_name = 'Demo-Nurse'  where id = v_nurse  and first_name is null;

  insert into public.organization_memberships (organization_id, user_id, role, job_title) values
    (v_hospital,   v_doctor, 'HOSPITAL_DOCTOR',    'Хирург'),
    (v_polyclinic, v_admin,  'ORGANIZATION_ADMIN', 'Заведующая поликлиникой'),
    (v_polyclinic, v_nurse,  'NURSE',              'Патронажная медсестра')
  on conflict (organization_id, user_id) do nothing;

  select id into v_hosp_id
    from public.hospitalizations
   where patient_id = v_patient and organization_id = v_hospital
   order by admitted_at desc
   limit 1;

  if v_hosp_id is null then
    insert into public.hospitalizations (patient_id, organization_id, attending_doctor_id,
        admitted_at, discharged_at, admission_reason, primary_diagnosis,
        procedure_summary, discharge_summary, status)
    values (v_patient, v_hospital, v_doctor,
        now() - interval '9 days', now() - interval '1 day',
        'Synthetic demo: acute abdominal pain', 'Synthetic demo: acute appendicitis',
        'Synthetic demo: laparoscopic appendectomy', 'Synthetic demo: stable, wound care and follow-up required',
        'DISCHARGED')
    returning id into v_hosp_id;
  end if;

  select id into v_plan_id
    from public.care_plans
   where patient_id = v_patient and hospitalization_id = v_hosp_id
   order by created_at desc
   limit 1;

  if v_plan_id is null then
    insert into public.care_plans (patient_id, hospitalization_id, source_organization_id,
        created_by, approved_by, title, summary, instructions, start_date, end_date, status)
    values (v_patient, v_hosp_id, v_hospital,
        v_doctor, v_doctor, 'Послеоперационное наблюдение',
        'Синтетический демо-план', 'Осмотр раны раз в два дня, термометрия ежедневно.',
        current_date, current_date + 14, 'ACTIVE')
    returning id into v_plan_id;
  end if;

  if not exists (
    select 1 from public.care_assignments
     where care_plan_id = v_plan_id and assigned_user_id = v_nurse
  ) then
    insert into public.care_assignments (patient_id, care_plan_id, organization_id,
        assigned_user_id, assigned_by, status, assigned_at, accepted_at, notes)
    values (v_patient, v_plan_id, v_polyclinic,
        v_nurse, v_admin, 'ACTIVE', now() - interval '20 hours', now() - interval '18 hours',
        'Синтетическое демо-назначение');
  end if;

  update public.digital_twins
     set risk_level = 'MEDIUM'
   where patient_id = v_patient and risk_level is null;
end;
$$;



do $$
declare
  v_hospital   uuid;
  v_polyclinic uuid;
  v_patient    uuid;
  v_doctor     uuid;
  v_nurse      uuid;
  v_hosp_id    uuid;
  v_plan_id    uuid;
begin
  select id into v_hospital   from public.organizations where name = 'Наманганская городская центральная больница';
  select id into v_polyclinic from public.organizations where name = 'Семейная поликлиника №17';
  select id into v_patient    from public.patients      where national_id = 'SYNTHETIC-DEMO-0001';

  select id into v_doctor from auth.users where email = 'doctor.demo@twincare.test';
  select id into v_nurse  from auth.users where email = 'nurse.demo@twincare.test';

  if v_doctor is null or v_nurse is null then
    raise notice 'Demo auth users not found — skipped clinical history.';
    return;
  end if;

  select id into v_hosp_id
    from public.hospitalizations
   where patient_id = v_patient and organization_id = v_hospital
   order by admitted_at desc
   limit 1;

  select id into v_plan_id
    from public.care_plans
   where patient_id = v_patient and hospitalization_id = v_hosp_id
   order by created_at desc
   limit 1;

  if v_hosp_id is null or v_plan_id is null then
    raise notice 'Demo hospitalization / care plan not found — skipped clinical history.';
    return;
  end if;

  if exists (select 1 from public.observations where patient_id = v_patient) then
    raise notice 'Clinical history already seeded — nothing to do.';
    return;
  end if;


  insert into public.diagnoses (patient_id, name, code, type, status, diagnosed_at,
      source, recorded_by, organization_id)
  values
    (v_patient, 'Гипертония', 'I10', 'COMORBIDITY', 'ACTIVE',
     date '2021-04-12', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, 'Сахарный диабет 2 типа', 'E11.9', 'COMORBIDITY', 'ACTIVE',
     date '2023-02-18', 'HOSPITAL', v_doctor, v_hospital);

  insert into public.allergies (patient_id, substance, reaction, severity, status,
      noted_at, source, recorded_by, organization_id)
  values
    (v_patient, 'Пенициллин', 'Кожная сыпь', 'MODERATE', 'ACTIVE',
     date '2019-08-02', 'HOSPITAL', v_doctor, v_hospital);


  insert into public.diagnoses (patient_id, hospitalization_id, name, code, type, status,
      diagnosed_at, resolved_at, source, recorded_by, organization_id)
  values
    (v_patient, v_hosp_id, 'Острый аппендицит с местным перитонитом', 'K35.30',
     'PRIMARY', 'RESOLVED', current_date - 9, current_date - 8,
     'HOSPITAL', v_doctor, v_hospital);

  insert into public.procedures (patient_id, hospitalization_id, name, code, category,
      performed_at, performed_by, organization_id, outcome, source)
  values
    (v_patient, v_hosp_id, 'КТ брюшной полости', 'CT-ABD', 'IMAGING',
     now() - interval '9 days' + interval '3 hours', v_doctor, v_hospital,
     'Аппендицит подтверждён', 'HOSPITAL'),
    (v_patient, v_hosp_id, 'Лапароскопическая аппендэктомия', 'K35-LAP', 'SURGERY',
     now() - interval '8 days' + interval '9 hours', v_doctor, v_hospital,
     'Без осложнений, дренаж не оставлен', 'HOSPITAL');

  insert into public.lab_results (patient_id, hospitalization_id, panel, analyte,
      value_numeric, unit, reference_low, reference_high, collected_at, resulted_at,
      lab_name, source, recorded_by, organization_id)
  values
    (v_patient, v_hosp_id, 'Биохимия', 'СРБ', 45, 'mg/L', 0, 5,
     now() - interval '9 days', now() - interval '9 days' + interval '2 hours',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Биохимия', 'СРБ', 28, 'mg/L', 0, 5,
     now() - interval '7 days', now() - interval '7 days' + interval '2 hours',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Биохимия', 'СРБ', 18, 'mg/L', 0, 5,
     now() - interval '5 days', now() - interval '5 days' + interval '2 hours',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Биохимия', 'СРБ', 7, 'mg/L', 0, 5,
     now() - interval '2 days', now() - interval '2 days' + interval '2 hours',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Общий анализ крови', 'Лейкоциты', 14.2, '10^9/L', 4, 10,
     now() - interval '9 days', now() - interval '9 days' + interval '1 hour',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Общий анализ крови', 'Лейкоциты', 11.0, '10^9/L', 4, 10,
     now() - interval '7 days', now() - interval '7 days' + interval '1 hour',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Общий анализ крови', 'Лейкоциты', 8.4, '10^9/L', 4, 10,
     now() - interval '2 days', now() - interval '2 days' + interval '1 hour',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Общий анализ крови', 'Гемоглобин', 138, 'g/L', 130, 170,
     now() - interval '9 days', now() - interval '9 days' + interval '1 hour',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Биохимия', 'Креатинин', 92, 'µmol/L', 62, 106,
     now() - interval '9 days', now() - interval '9 days' + interval '2 hours',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'Биохимия', 'Глюкоза натощак', 7.8, 'mmol/L', 3.9, 5.6,
     now() - interval '9 days', now() - interval '9 days' + interval '2 hours',
     'Лаборатория центральной больницы', 'HOSPITAL', v_doctor, v_hospital);

  insert into public.observations (patient_id, hospitalization_id, type, value_numeric,
      value_secondary, unit, is_abnormal, source, recorded_at, recorded_by, organization_id)
  values
    (v_patient, v_hosp_id, 'TEMPERATURE',    38.6, null, '°C',   true,  'HOSPITAL', now() - interval '9 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'HEART_RATE',      104, null, 'bpm',  true,  'HOSPITAL', now() - interval '9 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'BLOOD_PRESSURE',  150,   95, 'mmHg', true,  'HOSPITAL', now() - interval '9 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'SPO2',             97, null, '%',    false, 'HOSPITAL', now() - interval '9 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'PAIN',              8, null, null,   true,  'HOSPITAL', now() - interval '9 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'TEMPERATURE',    37.8, null, '°C',   false, 'HOSPITAL', now() - interval '8 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'HEART_RATE',       92, null, 'bpm',  false, 'HOSPITAL', now() - interval '8 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'BLOOD_PRESSURE',  140,   88, 'mmHg', false, 'HOSPITAL', now() - interval '8 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'PAIN',              6, null, null,   false, 'HOSPITAL', now() - interval '8 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'TEMPERATURE',    37.2, null, '°C',   false, 'HOSPITAL', now() - interval '6 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'HEART_RATE',       80, null, 'bpm',  false, 'HOSPITAL', now() - interval '6 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'PAIN',              4, null, null,   false, 'HOSPITAL', now() - interval '6 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'TEMPERATURE',    36.8, null, '°C',   false, 'HOSPITAL', now() - interval '3 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'BLOOD_PRESSURE',  135,   85, 'mmHg', false, 'HOSPITAL', now() - interval '3 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'PAIN',              2, null, null,   false, 'HOSPITAL', now() - interval '3 days', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'TEMPERATURE',    36.7, null, '°C',   false, 'HOSPITAL', now() - interval '1 day', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'HEART_RATE',       72, null, 'bpm',  false, 'HOSPITAL', now() - interval '1 day', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'SPO2',             98, null, '%',    false, 'HOSPITAL', now() - interval '1 day', v_doctor, v_hospital),
    (v_patient, v_hosp_id, 'WEIGHT',           82, null, 'kg',   false, 'HOSPITAL', now() - interval '1 day', v_doctor, v_hospital);


  insert into public.medications (patient_id, hospitalization_id, care_plan_id, name,
      dose, dose_unit, frequency, route, instructions, start_date, end_date, status,
      prescribed_by, organization_id, source)
  values
    (v_patient, v_hosp_id, null, 'Цефтриаксон', 1, 'g', 'TWICE_DAILY', 'IV',
     'Периоперационный курс', current_date - 8, current_date - 2, 'COMPLETED',
     v_doctor, v_hospital, 'HOSPITAL'),
    (v_patient, null, null, 'Метформин', 1000, 'mg', 'TWICE_DAILY', 'ORAL',
     'Постоянная терапия, во время еды', date '2023-02-18', null, 'ACTIVE',
     v_doctor, v_hospital, 'HOSPITAL'),
    (v_patient, null, null, 'Амлодипин', 5, 'mg', 'ONCE_DAILY', 'ORAL',
     'Постоянная терапия, утром', date '2021-04-12', null, 'ACTIVE',
     v_doctor, v_hospital, 'HOSPITAL'),
    (v_patient, v_hosp_id, v_plan_id, 'Цефуроксим', 500, 'mg', 'TWICE_DAILY', 'ORAL',
     'После еды, 7 дней', current_date - 1, current_date + 6, 'ACTIVE',
     v_doctor, v_hospital, 'HOSPITAL'),
    (v_patient, v_hosp_id, v_plan_id, 'Парацетамол', 500, 'mg', 'AS_NEEDED', 'ORAL',
     'При боли, не более 3 раз в день', current_date - 1, current_date + 6, 'ACTIVE',
     v_doctor, v_hospital, 'HOSPITAL');


  insert into public.observations (patient_id, care_plan_id, type, value_numeric,
      value_secondary, unit, is_abnormal, note, source, recorded_at, recorded_by, organization_id)
  values
    (v_patient, v_plan_id, 'BLOOD_PRESSURE', 135, 85, 'mmHg', false,
     'Home visit; wound dry and clean', 'NURSE',
     now() - interval '18 hours', v_nurse, v_polyclinic);

  insert into public.observations (patient_id, care_plan_id, type, value_numeric,
      value_boolean, unit, is_abnormal, source, recorded_at)
  values
    (v_patient, v_plan_id, 'TEMPERATURE',   37.1, null,  '°C', false, 'PATIENT', now() - interval '22 hours'),
    (v_patient, v_plan_id, 'PAIN',             4, null,  null, false, 'PATIENT', now() - interval '22 hours'),
    (v_patient, v_plan_id, 'TEMPERATURE',   37.4, null,  '°C', false, 'PATIENT', now() - interval '12 hours'),
    (v_patient, v_plan_id, 'PAIN',             5, null,  null, false, 'PATIENT', now() - interval '12 hours'),
    (v_patient, v_plan_id, 'TEMPERATURE',   38.2, null,  '°C', true,  'PATIENT', now() - interval '2 hours'),
    (v_patient, v_plan_id, 'PAIN',             8, null,  null, true,  'PATIENT', now() - interval '2 hours'),
    (v_patient, v_plan_id, 'WEAKNESS',      null, true,  null, true,  'PATIENT', now() - interval '2 hours'),
    (v_patient, v_plan_id, 'WOUND_REDNESS', null, true,  null, true,  'PATIENT', now() - interval '2 hours');

  update public.digital_twins
     set risk_level = 'HIGH'
   where patient_id = v_patient;

  raise notice 'Clinical history seeded for the synthetic demo patient.';
end;
$$;



do $$
declare
  v_patient   uuid;
  v_hosp_id   uuid;
  v_plan_id   uuid;
  v_device_id uuid;
begin
  select id into v_patient from public.patients where national_id = 'SYNTHETIC-DEMO-0001';

  if v_patient is null then
    raise notice 'Demo patient not found — skipped wearable data.';
    return;
  end if;

  select id into v_hosp_id
    from public.hospitalizations
   where patient_id = v_patient
   order by admitted_at desc
   limit 1;

  select id into v_plan_id
    from public.care_plans
   where patient_id = v_patient
   order by created_at desc
   limit 1;

  if v_hosp_id is null or v_plan_id is null then
    raise notice 'Demo episode not found — skipped wearable data.';
    return;
  end if;

  if exists (
    select 1 from public.observations
     where patient_id = v_patient and device_id is not null
  ) then
    raise notice 'Wearable data already seeded — nothing to do.';
    return;
  end if;

  select id into v_device_id
    from public.devices
   where patient_id = v_patient and provider = 'WHOOP';

  if v_device_id is null then
    insert into public.devices (patient_id, provider, model, external_device_id,
        is_simulated, status, linked_at, last_sync_at, notes)
    values (v_patient, 'WHOOP', 'Band 4.0', 'SIM-WHOOP-0001',
        true, 'ACTIVE', now() - interval '10 days', now() - interval '5 minutes',
        'Synthetic demo device — telemetry is simulated, not from real hardware')
    returning id into v_device_id;
  end if;

  insert into public.observations (patient_id, hospitalization_id, care_plan_id,
      device_id, external_id, type, value_numeric, unit, is_abnormal, source, recorded_at)
  values
    (v_patient, null, null, v_device_id, 'sim-n1-rhr',      'RESTING_HEART_RATE',  58, 'bpm',    false, 'DEVICE', now() - interval '10 days'),
    (v_patient, null, null, v_device_id, 'sim-n1-hrv',      'HRV',                 64, 'ms',     false, 'DEVICE', now() - interval '10 days'),
    (v_patient, null, null, v_device_id, 'sim-n1-rr',       'RESPIRATORY_RATE',    14, 'br/min', false, 'DEVICE', now() - interval '10 days'),
    (v_patient, null, null, v_device_id, 'sim-n1-recovery', 'RECOVERY_SCORE',      78, '%',      false, 'DEVICE', now() - interval '10 days'),
    (v_patient, null, null, v_device_id, 'sim-n1-sleep',    'SLEEP_DURATION',     7.5, 'h',      false, 'DEVICE', now() - interval '10 days'),
    (v_patient, null, null, v_device_id, 'sim-n1-eff',      'SLEEP_EFFICIENCY',    90, '%',      false, 'DEVICE', now() - interval '10 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n2-rhr',      'RESTING_HEART_RATE', 72, 'bpm',    false, 'DEVICE', now() - interval '7 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n2-hrv',      'HRV',                42, 'ms',     false, 'DEVICE', now() - interval '7 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n2-rr',       'RESPIRATORY_RATE',   17, 'br/min', false, 'DEVICE', now() - interval '7 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n2-recovery', 'RECOVERY_SCORE',     42, '%',      false, 'DEVICE', now() - interval '7 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n2-skin',     'SKIN_TEMPERATURE_DELTA', 0.6, '°C', false, 'DEVICE', now() - interval '7 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n3-rhr',      'RESTING_HEART_RATE', 66, 'bpm',    false, 'DEVICE', now() - interval '5 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n3-hrv',      'HRV',                50, 'ms',     false, 'DEVICE', now() - interval '5 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n3-rr',       'RESPIRATORY_RATE',   15, 'br/min', false, 'DEVICE', now() - interval '5 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n3-recovery', 'RECOVERY_SCORE',     55, '%',      false, 'DEVICE', now() - interval '5 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n4-rhr',      'RESTING_HEART_RATE', 61, 'bpm',    false, 'DEVICE', now() - interval '3 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n4-hrv',      'HRV',                58, 'ms',     false, 'DEVICE', now() - interval '3 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n4-rr',       'RESPIRATORY_RATE',   14, 'br/min', false, 'DEVICE', now() - interval '3 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n4-recovery', 'RECOVERY_SCORE',     68, '%',      false, 'DEVICE', now() - interval '3 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n5-rhr',      'RESTING_HEART_RATE', 60, 'bpm',    false, 'DEVICE', now() - interval '2 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n5-hrv',      'HRV',                61, 'ms',     false, 'DEVICE', now() - interval '2 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n5-rr',       'RESPIRATORY_RATE',   14, 'br/min', false, 'DEVICE', now() - interval '2 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n5-recovery', 'RECOVERY_SCORE',     74, '%',      false, 'DEVICE', now() - interval '2 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n5-sleep',    'SLEEP_DURATION',    7.2, 'h',      false, 'DEVICE', now() - interval '2 days'),
    (v_patient, v_hosp_id, null, v_device_id, 'sim-n5-eff',      'SLEEP_EFFICIENCY',   87, '%',      false, 'DEVICE', now() - interval '2 days'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n6-rhr',      'RESTING_HEART_RATE', 62, 'bpm',    false, 'DEVICE', now() - interval '16 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n6-hrv',      'HRV',                51, 'ms',     false, 'DEVICE', now() - interval '16 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n6-rr',       'RESPIRATORY_RATE',   15, 'br/min', false, 'DEVICE', now() - interval '16 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n6-recovery', 'RECOVERY_SCORE',     62, '%',      false, 'DEVICE', now() - interval '16 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n6-sleep',    'SLEEP_DURATION',    6.6, 'h',      false, 'DEVICE', now() - interval '16 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n6-eff',      'SLEEP_EFFICIENCY',   80, '%',      false, 'DEVICE', now() - interval '16 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n7-rhr',      'RESTING_HEART_RATE', 68, 'bpm',    true,  'DEVICE', now() - interval '6 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n7-hrv',      'HRV',                38, 'ms',     true,  'DEVICE', now() - interval '6 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n7-rr',       'RESPIRATORY_RATE',   18, 'br/min', true,  'DEVICE', now() - interval '6 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n7-recovery', 'RECOVERY_SCORE',     31, '%',      true,  'DEVICE', now() - interval '6 hours'),
    (v_patient, null, v_plan_id, v_device_id, 'sim-n7-skin',     'SKIN_TEMPERATURE_DELTA', 0.8, '°C', true, 'DEVICE', now() - interval '6 hours');

  insert into public.device_sync_log (device_id, patient_id, started_at, finished_at,
      status, observations_ingested, observations_skipped)
  values
    (v_device_id, v_patient, now() - interval '16 hours', now() - interval '16 hours' + interval '4 seconds', 'SUCCESS', 6, 0),
    (v_device_id, v_patient, now() - interval '6 hours',  now() - interval '6 hours'  + interval '3 seconds', 'SUCCESS', 5, 0),
    (v_device_id, v_patient, now() - interval '5 minutes', now() - interval '5 minutes' + interval '2 seconds', 'SUCCESS', 0, 5);

  raise notice 'Simulated wearable seeded for the synthetic demo patient.';
end;
$$;



do $$
declare
  v_hospital   uuid;
  v_polyclinic uuid;
  v_doctor     uuid;
  v_admin      uuid;
  v_nurse      uuid;

  s            record;
  v_patient    uuid;
  v_hosp       uuid;
  v_plan       uuid;
  v_admit      timestamptz;
  v_discharge  timestamptz;
begin
  select id into v_hospital   from public.organizations where name = 'Наманганская городская центральная больница';
  select id into v_polyclinic from public.organizations where name = 'Семейная поликлиника №17';
  select id into v_doctor from auth.users where email = 'doctor.demo@twincare.test';
  select id into v_admin  from auth.users where email = 'admin.demo@twincare.test';
  select id into v_nurse  from auth.users where email = 'nurse.demo@twincare.test';

  if v_doctor is null or v_admin is null or v_nurse is null then
    raise notice 'Demo auth users not found - skipped extra patients.';
    return;
  end if;

  if exists (select 1 from public.patients where national_id = 'SYNTHETIC-DEMO-0003') then
    raise notice 'Extra demo patients already seeded - nothing to do.';
    return;
  end if;

  create or replace function pg_temp.seed_series(
    p_patient uuid, p_hosp uuid, p_plan uuid,
    p_type public.observation_type, p_from numeric, p_to numeric,
    p_unit text, p_points int, p_hours_from int, p_hours_to int,
    p_source public.clinical_source, p_by uuid, p_org uuid,
    p_abnormal_last boolean default false
  ) returns void language plpgsql as $fn$
  declare i int;
  begin
    for i in 0 .. p_points - 1 loop
      insert into public.observations (
        patient_id, hospitalization_id, care_plan_id, type, value_numeric, unit,
        is_abnormal, source, recorded_at, recorded_by, organization_id)
      values (
        p_patient, p_hosp, p_plan, p_type,
        round((p_from + (p_to - p_from) * i / greatest(p_points - 1, 1))::numeric, 1),
        p_unit,
        p_abnormal_last and i = p_points - 1,
        p_source,
        now() - make_interval(hours => round(p_hours_from + (p_hours_to - p_hours_from)::numeric * i / greatest(p_points - 1, 1))::int),
        p_by, p_org);
    end loop;
  end $fn$;

  for s in
    select * from (values
      ('0003', 'Расулова',   'Мадина',   '1975-11-02', 'FEMALE',   14,     5, 'LOW',      'recovering'),
      ('0004', 'Юсупов',     'Шухрат',   '1962-06-18', 'MALE',      4,  null, 'MEDIUM',   'in_hospital'),
      ('0005', 'Тошматова',  'Зулфия',   '1954-01-27', 'FEMALE',   16,     6, 'CRITICAL', 'deteriorating'),
      ('0006', 'Абдуллаев',  'Ботир',    '1981-09-09', 'MALE',      9,     3, 'MEDIUM',   'unassigned'),
      ('0007', 'Мирзаева',   'Нигора',   '1968-04-21', 'FEMALE',   11,     4, 'MEDIUM',   'diabetes'),
      ('0008', 'Салимов',    'Жасур',    '1989-12-05', 'MALE',     19,    12, 'MEDIUM',   'silent'),
      ('0009', 'Каримова',   'Дилрабо',  '1997-03-30', 'FEMALE',   27,    20, 'LOW',      'completed'),
      ('0010', 'Эргашев',    'Улугбек',  '1958-08-14', 'MALE',      2,  null, 'MEDIUM',   'post_op_ward'),
      ('0011', 'Хасанова',   'Феруза',   '1993-05-11', 'FEMALE', null,  null, null,       'no_episode'),
      ('0012', 'Назаров',    'Отабек',   '1971-02-23', 'MALE',     10,     2, 'HIGH',     'wearable')
    ) as x(nid, surname, given, born, sex, admit_days, disch_days, risk, scenario)
  loop
    insert into public.patients (national_id, first_name, last_name, birth_date, gender,
        phone, region, district, address, primary_clinic_id)
    values ('SYNTHETIC-DEMO-' || s.nid, s.given, s.surname, s.born::date, s.sex::public.gender,
        '+9980000001' || s.nid, 'Namangan', 'Namangan city', 'Синтетический адрес', v_polyclinic)
    returning id into v_patient;

    if s.scenario = 'no_episode' then
      insert into public.diagnoses (patient_id, name, code, type, status, diagnosed_at,
          source, recorded_by, organization_id)
      values (v_patient, 'Железодефицитная анемия', 'D50.9', 'SECONDARY', 'ACTIVE',
          current_date - 40, 'POLYCLINIC', v_doctor, v_hospital);
      continue;
    end if;

    v_admit := now() - make_interval(days => s.admit_days);
    v_discharge := case when s.disch_days is null then null
                        else now() - make_interval(days => s.disch_days) end;

    insert into public.hospitalizations (patient_id, organization_id, attending_doctor_id,
        admitted_at, discharged_at, admission_reason, primary_diagnosis, discharge_summary, status)
    values (v_patient, v_hospital, v_doctor, v_admit, v_discharge,
        case s.scenario
          when 'in_hospital'   then 'Синтетический демо: одышка и лихорадка'
          when 'post_op_ward'  then 'Синтетический демо: плановая операция'
          when 'deteriorating' then 'Синтетический демо: декомпенсация сердечной недостаточности'
          when 'diabetes'      then 'Синтетический демо: декомпенсация диабета'
          else 'Синтетический демо: плановая госпитализация' end,
        case s.scenario
          when 'in_hospital'   then 'Синтетический демо: внебольничная пневмония'
          when 'deteriorating' then 'Синтетический демо: хроническая сердечная недостаточность'
          when 'diabetes'      then 'Синтетический демо: сахарный диабет 2 типа'
          else 'Синтетический демо: состояние после вмешательства' end,
        case when v_discharge is null then null
             else 'Синтетический демо: выписан на амбулаторное наблюдение' end,
        case when v_discharge is null then 'ACTIVE' else 'DISCHARGED' end::public.hospitalization_status)
    returning id into v_hosp;

    insert into public.diagnoses (patient_id, hospitalization_id, name, code, type, status,
        diagnosed_at, resolved_at, source, recorded_by, organization_id)
    values (v_patient, v_hosp,
        case s.scenario
          when 'in_hospital'   then 'Внебольничная пневмония'
          when 'post_op_ward'  then 'Паховая грыжа'
          when 'deteriorating' then 'Хроническая сердечная недостаточность'
          when 'diabetes'      then 'Сахарный диабет 2 типа'
          when 'silent'        then 'Острый холецистит'
          when 'completed'     then 'Острый аппендицит'
          else 'Состояние после операции' end,
        case s.scenario
          when 'in_hospital'   then 'J18.9'    
          when 'post_op_ward'  then 'K40.9'    
          when 'deteriorating' then 'I50.0'    
          when 'diabetes'      then 'E11.9'    
          when 'silent'        then 'K81.0'    
          else 'K35.80' end,                   
        'PRIMARY',
        case when s.scenario in ('completed', 'silent') then 'RESOLVED' else 'ACTIVE' end::public.diagnosis_status,
        (v_admit)::date,
        case when s.scenario in ('completed', 'silent') then (v_discharge)::date else null end,
        'HOSPITAL', v_doctor, v_hospital);

    if s.scenario in ('post_op_ward', 'completed', 'recovering') then
      insert into public.procedures (patient_id, hospitalization_id, name, category,
          performed_at, performed_by, organization_id, outcome, source)
      values (v_patient, v_hosp, 'Лапароскопическая операция', 'SURGERY',
          v_admit + interval '1 day', v_doctor, v_hospital, 'Без осложнений', 'HOSPITAL');
    end if;

    insert into public.medications (patient_id, hospitalization_id, name, dose, dose_unit,
        frequency, route, start_date, status, prescribed_by, organization_id, source)
    values (v_patient, v_hosp, 'Парацетамол', 500, 'мг', 'THREE_TIMES_DAILY', 'ORAL',
        (v_admit)::date, 'ACTIVE', v_doctor, v_hospital, 'HOSPITAL');

    insert into public.lab_results (patient_id, hospitalization_id, panel, analyte,
        value_numeric, unit, reference_low, reference_high, collected_at,
        source, recorded_by, organization_id)
    values
      (v_patient, v_hosp, 'Биохимия', 'СРБ',
       case s.scenario when 'deteriorating' then 62 when 'in_hospital' then 48 else 22 end,
       'мг/л', 0, 5, v_admit, 'HOSPITAL', v_doctor, v_hospital),
      (v_patient, v_hosp, 'Общий анализ крови', 'Лейкоциты',
       case s.scenario when 'deteriorating' then 13.8 else 9.4 end,
       '10^9/л', 4, 10, v_admit, 'HOSPITAL', v_doctor, v_hospital);

    perform pg_temp.seed_series(v_patient, v_hosp, null, 'TEMPERATURE', 38.4, 36.9, '°C', 4,
        s.admit_days * 24, coalesce(s.disch_days, 0) * 24 + 6, 'HOSPITAL', v_doctor, v_hospital);
    perform pg_temp.seed_series(v_patient, v_hosp, null, 'HEART_RATE', 98, 78, 'уд/мин', 4,
        s.admit_days * 24, coalesce(s.disch_days, 0) * 24 + 6, 'HOSPITAL', v_doctor, v_hospital);

    if v_discharge is null then
      update public.digital_twins set risk_level = s.risk::public.risk_level where patient_id = v_patient;
      continue;
    end if;

    insert into public.care_plans (patient_id, hospitalization_id, source_organization_id,
        created_by, approved_by, title, summary, instructions, start_date, end_date, status)
    values (v_patient, v_hosp, v_hospital, v_doctor, v_doctor,
        case s.scenario
          when 'deteriorating' then 'Наблюдение при сердечной недостаточности'
          when 'diabetes'      then 'Контроль гликемии после выписки'
          else 'Послеоперационное наблюдение' end,
        'Синтетический демо-план', 'Ежедневный опрос, контроль показателей.',
        (v_discharge)::date, (v_discharge)::date + 14, 'ACTIVE')
    returning id into v_plan;

    if s.scenario <> 'unassigned' then
      insert into public.care_assignments (patient_id, care_plan_id, organization_id,
          assigned_user_id, assigned_by, status, assigned_at, accepted_at, completed_at, notes)
      values (v_patient, v_plan, v_polyclinic, v_nurse, v_admin,
          case when s.scenario = 'completed' then 'COMPLETED' else 'ACTIVE' end::public.care_assignment_status,
          v_discharge + interval '2 hours', v_discharge + interval '4 hours',
          case when s.scenario = 'completed' then v_discharge + interval '10 days' else null end,
          'Синтетическое демо-назначение');
    end if;

    if s.scenario = 'completed' then
      update public.care_plans set status = 'COMPLETED' where id = v_plan;
    end if;

    if s.scenario = 'deteriorating' then
      perform pg_temp.seed_series(v_patient, null, v_plan, 'TEMPERATURE', 36.9, 37.9, '°C', 4,
          s.disch_days * 24, 3, 'PATIENT', null, null, true);
      perform pg_temp.seed_series(v_patient, null, v_plan, 'HEART_RATE', 84, 116, 'уд/мин', 4,
          s.disch_days * 24, 3, 'PATIENT', null, null, true);
      perform pg_temp.seed_series(v_patient, null, v_plan, 'WEIGHT', 74, 78.5, 'кг', 4,
          s.disch_days * 24, 3, 'PATIENT', null, null, true);
    elsif s.scenario = 'diabetes' then
      perform pg_temp.seed_series(v_patient, null, v_plan, 'GLUCOSE', 7.4, 11.2, 'ммоль/л', 5,
          s.disch_days * 24, 5, 'PATIENT', null, null, true);
      perform pg_temp.seed_series(v_patient, null, v_plan, 'TEMPERATURE', 36.6, 36.8, '°C', 3,
          s.disch_days * 24, 5, 'PATIENT', null, null);
    elsif s.scenario = 'silent' then
      perform pg_temp.seed_series(v_patient, null, v_plan, 'TEMPERATURE', 37.0, 36.8, '°C', 2,
          s.disch_days * 24, (s.disch_days - 1) * 24, 'PATIENT', null, null);
    elsif s.scenario = 'wearable' then
      perform pg_temp.seed_series(v_patient, null, v_plan, 'TEMPERATURE', 36.8, 38.0, '°C', 4,
          s.disch_days * 24, 2, 'PATIENT', null, null, true);
      perform pg_temp.seed_series(v_patient, null, v_plan, 'RESTING_HEART_RATE', 61, 74, 'уд/мин', 4,
          s.disch_days * 24, 4, 'DEVICE', null, null, true);
      perform pg_temp.seed_series(v_patient, null, v_plan, 'HRV', 58, 34, 'мс', 4,
          s.disch_days * 24, 4, 'DEVICE', null, null, true);

      insert into public.devices (patient_id, provider, model, external_device_id,
          is_simulated, status, linked_at, last_sync_at, notes)
      values (v_patient, 'FITBIT', 'Sense 2', 'SIM-FITBIT-' || s.nid, true, 'ACTIVE',
          v_admit, now() - interval '20 minutes',
          'Синтетическое демо-устройство, телеметрия смоделирована');
    else
      perform pg_temp.seed_series(v_patient, null, v_plan, 'TEMPERATURE', 37.0, 36.6, '°C', 4,
          s.disch_days * 24, 4, 'PATIENT', null, null);
      perform pg_temp.seed_series(v_patient, null, v_plan, 'PAIN', 5, 2, null, 4,
          s.disch_days * 24, 4, 'PATIENT', null, null);
    end if;

    if s.scenario in ('recovering', 'deteriorating', 'diabetes', 'wearable') then
      insert into public.observations (patient_id, care_plan_id, type, value_numeric,
          value_secondary, unit, source, recorded_at, recorded_by, organization_id, note)
      values (v_patient, v_plan, 'BLOOD_PRESSURE',
          case s.scenario when 'deteriorating' then 155 else 132 end,
          case s.scenario when 'deteriorating' then 96 else 84 end,
          'мм рт.ст.', 'NURSE', now() - interval '1 day', v_nurse, v_polyclinic,
          'Патронажный визит');
    end if;

    update public.digital_twins
       set risk_level = s.risk::public.risk_level
     where patient_id = v_patient;
  end loop;

  raise notice 'Extra demo patients seeded.';
end;
$$;



do $$
declare
  v_doctor   uuid;
  v_hospital uuid;
  v_patient  uuid;
  p          record;
begin
  select id into v_hospital from public.organizations where name = 'Наманганская городская центральная больница';
  select id into v_doctor from auth.users where email = 'doctor.demo@twincare.test';

  if v_doctor is null then
    raise notice 'Demo auth users not found - skipped simulation profiles.';
    return;
  end if;

  if exists (select 1 from public.patient_profile) then
    raise notice 'Simulation profiles already seeded - nothing to do.';
    return;
  end if;

  for p in
    select * from (values
      ('0001', 174, 'FORMER',  'OCCASIONAL', 'LIGHT',     array['инфаркт у отца до 60 лет','диабет 2 типа у матери']),
      ('0003', 162, 'NEVER',   'NONE',       'MODERATE',  array['гипертония у матери']),
      ('0004', 178, 'CURRENT', 'REGULAR',    'SEDENTARY', array['ХОБЛ у отца']),
      ('0005', 158, 'FORMER',  'NONE',       'SEDENTARY', array['сердечная недостаточность у матери','инсульт у брата']),
      ('0006', 181, 'NEVER',   'OCCASIONAL', 'ACTIVE',    array[]::text[]),
      ('0007', 165, 'NEVER',   'NONE',       'LIGHT',     array['диабет 2 типа у отца','диабет 2 типа у сестры']),
      ('0009', 169, 'NEVER',   'OCCASIONAL', 'ACTIVE',    array[]::text[]),
      ('0010', 176, 'FORMER',  'OCCASIONAL', 'LIGHT',     array['онкология у матери']),
      ('0012', 172, 'CURRENT', 'REGULAR',    'SEDENTARY', array['инфаркт у отца'])
    ) as x(nid, height, smoking, alcohol, activity, family)
  loop
    select id into v_patient from public.patients
     where national_id = 'SYNTHETIC-DEMO-' || p.nid;
    continue when v_patient is null;

    insert into public.patient_profile (patient_id, smoking_status, alcohol_use,
        physical_activity, family_history, updated_by)
    values (v_patient, p.smoking::public.smoking_status, p.alcohol::public.alcohol_use,
        p.activity::public.physical_activity, p.family, v_doctor)
    on conflict (patient_id) do nothing;

    insert into public.observations (patient_id, type, value_numeric, unit,
        source, recorded_at, recorded_by, organization_id)
    values (v_patient, 'HEIGHT', p.height, 'см', 'HOSPITAL',
        now() - interval '30 days', v_doctor, v_hospital);

    insert into public.observations (patient_id, type, value_numeric, unit,
        source, recorded_at, recorded_by, organization_id)
    select v_patient, 'WEIGHT', round((p.height - 100 + (p.height % 9))::numeric, 1), 'кг',
           'HOSPITAL', now() - interval '30 days', v_doctor, v_hospital
     where not exists (
       select 1 from public.observations o
        where o.patient_id = v_patient and o.type = 'WEIGHT');

    insert into public.lab_results (patient_id, panel, analyte, value_numeric, unit,
        reference_low, reference_high, collected_at, source, recorded_by, organization_id)
    values
      (v_patient, 'Липидный профиль', 'Общий холестерин',
       round((4.4 + (p.height % 7) * 0.22)::numeric, 1), 'ммоль/л', 3.0, 5.2,
       now() - interval '30 days', 'HOSPITAL', v_doctor, v_hospital),
      (v_patient, 'Липидный профиль', 'ЛПВП',
       round((1.0 + (p.height % 5) * 0.09)::numeric, 2), 'ммоль/л', 1.0, 2.2,
       now() - interval '30 days', 'HOSPITAL', v_doctor, v_hospital),
      -- функция почек: от неё зависит выбор препаратов, без неё расчёт
      -- отказывается считать
      (v_patient, 'Биохимия', 'Креатинин',
       round((72 + (p.height % 11) * 3.5)::numeric, 0), 'мкмоль/л', 62, 106,
       now() - interval '30 days', 'HOSPITAL', v_doctor, v_hospital);
  end loop;

  -- Записанная непереносимость статина, чтобы проверка противопоказаний была
  -- наглядной, а не теоретической.
  select id into v_patient from public.patients where national_id = 'SYNTHETIC-DEMO-0005';
  if v_patient is not null then
    insert into public.allergies (patient_id, substance, reaction, severity, status,
        noted_at, source, recorded_by, organization_id)
    select v_patient, 'Аторвастатин', 'Миалгия', 'MODERATE', 'ACTIVE',
        current_date - 400, 'POLYCLINIC', v_doctor, v_hospital
     where not exists (
       select 1 from public.allergies a
        where a.patient_id = v_patient and a.substance = 'Аторвастатин');
  end if;

  for p in
    select distinct d.patient_id
      from public.diagnoses d
     where d.code like 'E11%' and d.status = 'ACTIVE'
  loop
    insert into public.lab_results (patient_id, panel, analyte, value_numeric, unit,
        reference_low, reference_high, collected_at, source, recorded_by, organization_id)
    values
      (p.patient_id, 'Биохимия', 'HbA1c', 8.4, '%', 4.0, 6.0,
       now() - interval '180 days', 'HOSPITAL', v_doctor, v_hospital),
      (p.patient_id, 'Биохимия', 'HbA1c', 8.1, '%', 4.0, 6.0,
       now() - interval '90 days', 'HOSPITAL', v_doctor, v_hospital),
      (p.patient_id, 'Биохимия', 'HbA1c', 8.6, '%', 4.0, 6.0,
       now() - interval '20 days', 'HOSPITAL', v_doctor, v_hospital);
  end loop;

  for p in
    select distinct d.patient_id
      from public.diagnoses d
     where d.code like 'I50%' and d.status = 'ACTIVE'
  loop
    insert into public.lab_results (patient_id, panel, analyte, value_numeric, unit,
        reference_low, reference_high, collected_at, source, recorded_by, organization_id)
    values
      (p.patient_id, 'Биохимия', 'NT-proBNP', 1840, 'пг/мл', 0, 125,
       now() - interval '20 days', 'HOSPITAL', v_doctor, v_hospital),
      (p.patient_id, 'Биохимия', 'NT-proBNP', 2260, 'пг/мл', 0, 125,
       now() - interval '5 days', 'HOSPITAL', v_doctor, v_hospital);
  end loop;

  raise notice 'Simulation profiles seeded.';
end;
$$;


-- Часть 7: активные вызовы ------------------------------------------------------
--
-- Для новых выписок вызов создаёт триггер. Здесь — история по уже выписанным
-- пациентам, чтобы на экране были все состояния: уложились в срок, приняли в
-- работу, просрочено и закрыто с опозданием.
--
-- Сам вызов ставит триггер при активации плана наблюдения. Здесь мы только
-- переводим его в нужное состояние: так срабатывают те же триггеры, что и в
-- жизни, и события попадают на хронологию.

do $$
declare
  v_doctor uuid;
  v_nurse  uuid;
  h        record;
  v_call   uuid;
  v_state  text;
  v_hours  numeric;
begin
  select id into v_doctor from auth.users where email = 'admin.demo@twincare.test';
  select id into v_nurse  from auth.users where email = 'nurse.demo@twincare.test';

  if v_doctor is null or v_nurse is null then
    raise notice 'Демо-пользователи не найдены — активные вызовы пропущены.';
    return;
  end if;

  -- вызовы ставит триггер при активации плана наблюдения. сид не создаёт их,
  -- а доигрывает историю: кто взял, кто закрыл и с каким опозданием.
  if exists (select 1 from public.active_calls where status <> 'PENDING') then
    raise notice 'История активных вызовов уже проиграна — пропускаем.';
    return;
  end if;

  for h in
    select ho.id, ho.patient_id, ho.discharged_at, p.national_id, p.primary_clinic_id
      from public.hospitalizations ho
      join public.patients p on p.id = ho.patient_id
     where ho.status = 'DISCHARGED'
       and p.primary_clinic_id is not null
     order by ho.discharged_at
  loop
    -- кто в каком состоянии
    v_state := case right(h.national_id, 4)
      when '0006' then 'OVERDUE'        -- никто не взял, срок вышел
      when '0012' then 'ACKNOWLEDGED'   -- приняли, но не подтвердили
      when '0008' then 'LATE'           -- закрыли, но позже 24 часов
      else 'IN_TIME' end;

    v_hours := case right(h.national_id, 4)
      when '0001' then 6 when '0003' then 10 when '0005' then 20
      when '0007' then 22 when '0008' then 31 when '0009' then 4
      else 8 end;

    select id into v_call
      from public.active_calls
     where hospitalization_id = h.id
     limit 1;

    -- нет плана наблюдения — нет вызова, и это нормально
    if v_call is null then
      continue;
    end if;

    if v_state = 'OVERDUE' then
      continue;  -- остаётся PENDING, срок уже прошёл
    end if;

    update public.active_calls
       set status = 'ACKNOWLEDGED',
           acknowledged_by = v_nurse,
           acknowledged_at = h.discharged_at + interval '2 hours'
     where id = v_call;

    if v_state = 'ACKNOWLEDGED' then
      continue;  -- взяли в работу и не закрыли
    end if;

    update public.active_calls
       set status = 'COMPLETED',
           completed_by = v_nurse,
           completed_at = h.discharged_at + make_interval(mins => (v_hours * 60)::int),
           outcome = (case when v_hours > 24 then 'CONTACTED' else 'VISITED' end)::public.active_call_outcome,
           notes = case when v_hours > 24
                        then 'Синтетические демо-данные: связались с опозданием'
                        else 'Синтетические демо-данные: состояние удовлетворительное' end
     where id = v_call;
  end loop;

  raise notice 'Активные вызовы созданы.';
end;
$$;


-- Часть 8: план осмотра ---------------------------------------------------------
--
-- У каждого действующего плана наблюдения появляется график осмотров. Часть из
-- них уже состоялась, один у ухудшающегося пациента пропущен — пропуск должен
-- быть виден на хронологии, ради этого визиты и вынесены в отдельную таблицу.

do $$
declare
  v_nurse  uuid;
  v_doctor uuid;
  pl       record;
  v_day    int;
  v_kind   public.visit_kind;
  v_status public.visit_status;
  v_title  text;
  v_when   date;
begin
  select id into v_doctor from auth.users where email = 'admin.demo@twincare.test';
  select id into v_nurse  from auth.users where email = 'nurse.demo@twincare.test';

  if v_doctor is null then
    raise notice 'Демо-пользователи не найдены — план осмотра пропущен.';
    return;
  end if;

  if exists (select 1 from public.care_plan_visits) then
    raise notice 'План осмотра уже создан — пропускаем.';
    return;
  end if;

  for pl in
    select cp.id, cp.patient_id, cp.receiving_organization_id, cp.start_date,
           p.national_id
      from public.care_plans cp
      join public.patients p on p.id = cp.patient_id
     where cp.status in ('ACTIVE', 'COMPLETED')
       and cp.start_date is not null
     order by cp.start_date
  loop
    foreach v_day in array array[3, 10, 21]
    loop
      v_when := pl.start_date + v_day;

      v_kind := (case v_day when 3 then 'HOME' when 10 then 'CLINIC' else 'CALL' end)::public.visit_kind;
      v_title := case v_day
                   when 3  then 'Первичный патронаж на дому'
                   when 10 then 'Контрольный осмотр в поликлинике'
                   else 'Контрольный звонок'
                 end;

      -- пропущенный осмотр только у пациента с ухудшением
      if right(pl.national_id, 4) = '0002' and v_day = 10 then
        v_status := 'MISSED';
      elsif v_when <= current_date then
        v_status := 'COMPLETED';
      else
        v_status := 'PLANNED';
      end if;

      insert into public.care_plan_visits (
        care_plan_id, patient_id, organization_id, scheduled_for, kind, title,
        assigned_user_id, status, completed_at, completed_by, notes, created_by, created_at
      )
      values (
        pl.id, pl.patient_id, pl.receiving_organization_id, v_when, v_kind, v_title,
        v_nurse, v_status,
        case when v_status in ('COMPLETED', 'MISSED')
             then (v_when + 1)::timestamptz else null end,
        case when v_status in ('COMPLETED', 'MISSED') then v_nurse else null end,
        case v_status
          when 'COMPLETED' then 'Синтетические демо-данные: жалоб нет'
          when 'MISSED'    then 'Синтетические демо-данные: пациент не явился, связаться не удалось'
          else null end,
        v_doctor,
        pl.start_date::timestamptz
      );
    end loop;
  end loop;

  raise notice 'План осмотра создан.';
end;
$$;
