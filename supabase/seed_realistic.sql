-- =============================================================================
-- CareTwin AI — реалистичные пациенты для демонстрации
-- =============================================================================
--
-- Данные вымышленные, но клинически связные: у каждого пациента история на
-- несколько лет, обращения в разные учреждения, хронические болезни,
-- аллергии и непереносимости, текущая терапия, анализы в динамике, образ жизни
-- и наследственность. Всё по-русски, с кодами МКБ-10 и референсами — это читают
-- ИИ-сводки, проверка препаратов и прогноз.
--
-- Запуск: Supabase → SQL Editor, целиком, после supabase/seed.sql.
-- Повторный запуск безопасен: существующие пациенты (по ПИНФЛ), учреждения и
-- сотрудники пропускаются.
--
-- Что делает скрипт:
--   1. Переименовывает демо-учреждения по-русски и добавляет 8 новых.
--   2. Создаёт сотрудников этих учреждений (без пароля — войти под ними нельзя).
--   3. Загружает 12 пациентов, 57 обращений.
--   4. Приводит старых синтетических пациентов к реалистичному виду
--      (ПИНФЛ, телефон, адрес, тексты без пометок «Синтетический демо»).
--
-- События двойника создают триггеры — как в настоящей работе. Триггеры, которые
-- ставят время «сейчас» (закрытие плана), исправляются в конце: для этого на
-- время скрипта снимается запрет на изменение twin_events.
-- =============================================================================


-- 1. Учреждения ---------------------------------------------------------------

update public.organizations
   set name = 'Наманганская городская центральная больница',
       region = 'Наманганская область', district = 'г. Наманган',
       address = 'г. Наманган, ул. Ислама Каримова, 28', phone = '+998692272015'
 where name in ('Namangan Central Hospital', 'Наманганская городская центральная больница');

update public.organizations
   set name = 'Семейная поликлиника №17',
       region = 'Наманганская область', district = 'г. Наманган',
       address = 'г. Наманган, ул. Богишамол, 17', phone = '+998692260417'
 where name in ('Polyclinic #17', 'Семейная поликлиника №17');

insert into public.organizations (name, type, region, district, address, phone, latitude, longitude)
select x.name, x.type::public.organization_type, 'Наманганская область', x.district, x.address, x.phone, x.lat, x.lng
  from (values
    ('Наманганский областной кардиологический центр', 'CENTRAL_HOSPITAL', 'г. Наманган',
     'г. Наманган, ул. Лермонтова, 4', '+998692263311', 40.995100, 71.662400),
    ('Республиканский специализированный кардиологический центр', 'CENTRAL_HOSPITAL', 'г. Ташкент',
     'г. Ташкент, ул. Осиё, 4', '+998712373831', 41.337400, 69.285800),
    ('Наманганский областной эндокринологический диспансер', 'OTHER', 'г. Наманган',
     'г. Наманган, ул. Машраба, 12', '+998692275120', 40.992800, 71.679900),
    ('Наманганская областная многопрофильная больница', 'CENTRAL_HOSPITAL', 'г. Наманган',
     'г. Наманган, проспект Навои, 58', '+998692264402', 41.001700, 71.655300),
    ('Реабилитационный центр «Шифо»', 'REHABILITATION_CENTER', 'Наманганский район',
     'Наманганский район, посёлок Тошбулок, ул. Бобура, 3', '+998692291503', 40.964200, 71.590100),
    ('Частная клиника «Медиор»', 'PRIVATE_CLINIC', 'г. Наманган',
     'г. Наманган, ул. Уйчи, 21А', '+998692222121', 41.006300, 71.648800),
    ('Семейная поликлиника №3', 'POLYCLINIC', 'г. Наманган',
     'г. Наманган, ул. Амира Темура, 140', '+998692263003', 41.011200, 71.641700),
    ('Семейная поликлиника №5', 'POLYCLINIC', 'Чустский район',
     'Чустский район, г. Чуст, ул. Мустакиллик, 9', '+998692530505', 41.003400, 71.237300)
  ) as x(name, type, district, address, phone, lat, lng)
 where not exists (select 1 from public.organizations o where o.name = x.name);

drop table if exists _org;
create temp table _org (key text primary key, name text not null, id uuid, doctor_email text, head_email text);
-- head_email — заведующий: только он может закрепить медсестру за пациентом
insert into _org (key, name, doctor_email, head_email) values
  ('central', 'Наманганская городская центральная больница', null, null),
  ('p17',     'Семейная поликлиника №17', 'mamatova.gulchehra@caretwin.test', 'admin.demo@twincare.test'),
  ('p3',      'Семейная поликлиника №3',  'ahmedov.bobur@caretwin.test',      'yuldasheva.shahnoza@caretwin.test'),
  ('p5',      'Семейная поликлиника №5',  'normatov.oybek@caretwin.test',     'tojiboev.ulugbek@caretwin.test'),
  ('kardio',  'Наманганский областной кардиологический центр', null, null),
  ('rkc',     'Республиканский специализированный кардиологический центр', null, null),
  ('endo',    'Наманганский областной эндокринологический диспансер', null, null),
  ('multi',   'Наманганская областная многопрофильная больница', null, null),
  ('shifo',   'Реабилитационный центр «Шифо»', null, null),
  ('medior',  'Частная клиника «Медиор»', null, null);
update _org set id = o.id from public.organizations o where o.name = _org.name;

do $$
begin
  if exists (select 1 from _org where id is null) then
    raise exception 'Не найдены учреждения: %. Сначала запустите supabase/seed.sql.',
      (select string_agg(name, ', ') from _org where id is null);
  end if;
  if (select count(*) from auth.users
       where email in ('doctor.demo@twincare.test', 'nurse.demo@twincare.test', 'admin.demo@twincare.test')) < 3 then
    raise exception 'Нет демо-пользователей doctor.demo / nurse.demo / admin.demo@twincare.test — создайте их в Supabase Auth и запустите supabase/seed.sql.';
  end if;
end;
$$;


-- 2. Сотрудники ---------------------------------------------------------------
-- Учётные записи без пароля: нужны, чтобы у записей были настоящие авторы из
-- нужного учреждения (этого требуют внешние ключи на членство).

drop table if exists _staff;
create temp table _staff (key text primary key, email text not null, first_name text, last_name text,
                          org text, role text, job text, id uuid);
insert into _staff (key, email, first_name, last_name, org, role, job) values
  ('doc',       'doctor.demo@twincare.test',        null,       null,        null,     null,               null),
  ('nurse17',   'nurse.demo@twincare.test',         null,       null,        null,     null,               null),
  ('olimova',   'olimova.sevara@caretwin.test',     'Севара',   'Олимова',   'central','HOSPITAL_DOCTOR',  'Терапевт-кардиолог'),
  ('turdiev',   'turdiev.jamshid@caretwin.test',    'Жамшид',   'Турдиев',   'central','HOSPITAL_DOCTOR',  'Невролог'),
  ('alimov',    'alimov.shuhrat@caretwin.test',     'Шухрат',   'Алимов',    'kardio', 'HOSPITAL_DOCTOR',  'Кардиолог'),
  ('kurbanov',  'kurbanov.ravshan@caretwin.test',   'Равшан',   'Курбанов',  'rkc',    'HOSPITAL_DOCTOR',  'Интервенционный кардиолог'),
  ('saidova',   'saidova.nodira@caretwin.test',     'Нодира',   'Саидова',   'endo',   'HOSPITAL_DOCTOR',  'Эндокринолог'),
  ('isakov',    'isakov.farruh@caretwin.test',      'Фаррух',   'Исаков',    'multi',  'HOSPITAL_DOCTOR',  'Терапевт'),
  ('hakimov',   'hakimov.aziz@caretwin.test',       'Азиз',     'Хакимов',   'multi',  'HOSPITAL_DOCTOR',  'Хирург'),
  ('nazirova',  'nazirova.lola@caretwin.test',      'Лола',     'Назирова',  'shifo',  'HOSPITAL_DOCTOR',  'Невролог-реабилитолог'),
  ('rashidov',  'rashidov.timur@caretwin.test',     'Тимур',    'Рашидов',   'medior', 'HOSPITAL_DOCTOR',  'Хирург'),
  ('mamatova',  'mamatova.gulchehra@caretwin.test', 'Гулчехра', 'Маматова',  'p17',    'POLYCLINIC_DOCTOR','Врач общей практики'),
  ('ahmedov',   'ahmedov.bobur@caretwin.test',      'Бобур',    'Ахмедов',   'p3',     'POLYCLINIC_DOCTOR','Врач общей практики'),
  ('karimovaz', 'karimova.zuhra@caretwin.test',     'Зухра',    'Каримова',  'p3',     'NURSE',            'Патронажная медсестра'),
  ('normatov',  'normatov.oybek@caretwin.test',     'Ойбек',    'Норматов',  'p5',     'POLYCLINIC_DOCTOR','Врач общей практики'),
  ('ergasheva', 'ergasheva.mohira@caretwin.test',   'Мохира',   'Эргашева',  'p5',     'NURSE',            'Патронажная медсестра'),
  ('head3',     'yuldasheva.shahnoza@caretwin.test','Шахноза',  'Юлдашева',  'p3',     'ORGANIZATION_ADMIN','Заведующая поликлиникой'),
  ('head5',     'tojiboev.ulugbek@caretwin.test',   'Улугбек',  'Тожибоев',  'p5',     'ORGANIZATION_ADMIN','Заведующий поликлиникой');

do $$
declare
  s    record;
  v_id uuid;
begin
  for s in select * from _staff where org is not null loop
    select id into v_id from auth.users where email = s.email;

    if v_id is null then
      v_id := gen_random_uuid();
      -- пустые строки в токенах обязательны: с NULL ломается список пользователей в Auth
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          s.email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('first_name', s.first_name, 'last_name', s.last_name),
          now(), now(), '', '', '', '');
    end if;

    insert into public.profiles (id, first_name, last_name)
    values (v_id, s.first_name, s.last_name)
    on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name;

    insert into public.organization_memberships (organization_id, user_id, role, job_title)
    select o.id, v_id, s.role::public.membership_role, s.job from _org o where o.key = s.org
    on conflict (organization_id, user_id) do nothing;
  end loop;
end;
$$;

update _staff set id = u.id from auth.users u where u.email = _staff.email;

-- Демо-учётки с понятными именами вместо «Demo-Doctor»
update public.profiles p set first_name = 'Баходир', last_name = 'Юнусов'
  from _staff s where s.key = 'doc' and p.id = s.id and (p.last_name is null or p.last_name like 'Demo%');
update public.profiles p set first_name = 'Дилноза', last_name = 'Ахмедова'
  from _staff s where s.key = 'nurse17' and p.id = s.id and (p.last_name is null or p.last_name like 'Demo%');
update public.profiles set first_name = 'Малика', last_name = 'Турсунова'
 where id = (select id from auth.users where email = 'admin.demo@twincare.test')
   and (last_name is null or last_name like 'Demo%');


-- 3. Загрузчик ----------------------------------------------------------------

create or replace function pg_temp.org(p_key text) returns uuid language sql stable as
$$ select id from _org where key = p_key $$;

create or replace function pg_temp.staff(p_key text) returns uuid language sql stable as
$$ select id from _staff where key = p_key $$;

create or replace function pg_temp.src(p_org uuid) returns public.clinical_source language sql stable as
$$ select case when o.type = 'POLYCLINIC' then 'POLYCLINIC' else 'HOSPITAL' end::public.clinical_source
     from public.organizations o where o.id = p_org $$;

-- день N назад, время по Ташкенту
create or replace function pg_temp.day_at(p_days_ago int, p_time text) returns timestamptz language sql stable as
$$ select ((current_date - p_days_ago) + coalesce(p_time, '10:00')::time) at time zone 'Asia/Tashkent' $$;

create or replace function pg_temp.past(p_at timestamptz) returns timestamptz language sql stable as
$$ select least(p_at, now() - interval '5 minutes') $$;

create or replace function pg_temp.seed_patient(p jsonb) returns void language plpgsql as $fn$
declare
  v_patient uuid;
  v_clinic  uuid;
  v_clinic_doc uuid;
  v_clinic_head uuid;
  r   jsonb;
  e   jsonb;
  pl  jsonb;
  v_org   uuid;
  v_doc   uuid;
  v_nurse uuid;
  v_hosp  uuid;
  v_plan  uuid;
  v_call  uuid;
  v_admit timestamptz;
  v_dis   timestamptz;
  v_at    timestamptz;
  v_ack   timestamptz;
  v_start date;
  v_when  date;
  v_status public.visit_status;
begin
  if exists (select 1 from public.patients where national_id = p->>'pinfl') then
    raise notice 'Пациент % % уже загружен — пропускаем', p->>'last', p->>'first';
    return;
  end if;

  v_clinic := pg_temp.org(p->>'clinic');
  select s.id into v_clinic_doc from _org o join _staff s on s.email = o.doctor_email where o.key = p->>'clinic';
  select u.id into v_clinic_head from _org o join auth.users u on u.email = o.head_email where o.key = p->>'clinic';

  insert into public.patients (national_id, first_name, last_name, birth_date, gender,
      phone, region, district, address, primary_clinic_id)
  values (p->>'pinfl', p->>'first', p->>'last', (p->>'born')::date, (p->>'sex')::public.gender,
      p->>'phone', 'Наманганская область', p->>'district', p->>'address', v_clinic)
  returning id into v_patient;

  -- образ жизни, наследственность, генетика
  r := p->'profile';
  insert into public.patient_profile (patient_id, smoking_status, smoking_pack_years, alcohol_use,
      physical_activity, family_history, genetic_markers, notes, updated_by)
  values (v_patient, (r->>'smoking')::public.smoking_status, (r->>'pack_years')::numeric,
      (r->>'alcohol')::public.alcohol_use, (r->>'activity')::public.physical_activity,
      coalesce(array(select jsonb_array_elements_text(r->'family')), '{}'),
      coalesce(r->'genetics', '{}'::jsonb), r->>'notes', v_clinic_doc)
  on conflict (patient_id) do nothing;

  insert into public.observations (patient_id, type, value_numeric, unit, source, recorded_at, organization_id)
  values (v_patient, 'HEIGHT', (p->>'height')::numeric, 'см', 'POLYCLINIC', pg_temp.day_at(400, '09:30'), v_clinic);

  -- хронические диагнозы (список проблем пациента, вне госпитализаций)
  for r in select * from jsonb_array_elements(coalesce(p->'chronic', '[]')) loop
    insert into public.diagnoses (patient_id, name, code, type, status, diagnosed_at, resolved_at,
        notes, source, organization_id)
    values (v_patient, r->>0, r->>1, (r->>2)::public.diagnosis_type, (r->>3)::public.diagnosis_status,
        current_date - (r->>4)::int,
        case when r->>5 is null then null else current_date - (r->>5)::int end,
        r->>7, pg_temp.src(pg_temp.org(r->>6)), pg_temp.org(r->>6));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'allergies', '[]')) loop
    insert into public.allergies (patient_id, substance, reaction, severity, status, noted_at, note,
        source, organization_id)
    values (v_patient, r->>0, r->>1, (r->>2)::public.allergy_severity, 'ACTIVE',
        current_date - (r->>3)::int, r->>5, pg_temp.src(pg_temp.org(r->>4)), pg_temp.org(r->>4));
  end loop;

  -- постоянная терапия
  for r in select * from jsonb_array_elements(coalesce(p->'meds', '[]')) loop
    insert into public.medications (patient_id, name, dose, dose_unit, frequency, route, instructions,
        start_date, end_date, status, source, organization_id)
    values (v_patient, r->>0, (r->>1)::numeric, r->>2, (r->>3)::public.medication_frequency,
        (r->>4)::public.medication_route, r->>5, current_date - (r->>6)::int,
        case when r->>8 is null then null else current_date - (r->>8)::int end,
        (r->>7)::public.medication_status, pg_temp.src(pg_temp.org(r->>9)), pg_temp.org(r->>9));
  end loop;

  -- амбулаторные анализы и измерения
  for r in select * from jsonb_array_elements(coalesce(p->'labs', '[]')) loop
    v_at := pg_temp.past(pg_temp.day_at((r->>0)::int, '08:30'));
    insert into public.lab_results (patient_id, panel, analyte, value_numeric, unit, reference_low,
        reference_high, flag, collected_at, resulted_at, lab_name, source, organization_id)
    values (v_patient, r->>1, r->>2, (r->>3)::numeric, r->>4, (r->>5)::numeric, (r->>6)::numeric,
        (r->>7)::public.lab_flag, v_at, pg_temp.past(v_at + interval '5 hours'),
        (select name from _org where key = r->>8), pg_temp.src(pg_temp.org(r->>8)), pg_temp.org(r->>8));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'obs', '[]')) loop
    insert into public.observations (patient_id, type, value_numeric, value_secondary, unit,
        is_abnormal, source, recorded_at, organization_id)
    values (v_patient, (r->>1)::public.observation_type, (r->>2)::numeric, (r->>3)::numeric, r->>4,
        (r->>5)::boolean, pg_temp.src(pg_temp.org(r->>6)),
        pg_temp.past(pg_temp.day_at((r->>0)::int, '10:15')), pg_temp.org(r->>6));
  end loop;

  -- обращения, от старых к новым
  for e in select * from jsonb_array_elements(coalesce(p->'episodes', '[]')) loop
    v_org := pg_temp.org(e->>'org');
    v_doc := pg_temp.staff(e->>'doc');
    v_admit := pg_temp.day_at((e->>'days_ago')::int, coalesce(e->>'at', '10:00'));
    v_dis := case
      when e->>'status' = 'ACTIVE' then null
      when e ? 'dis_hours_ago' then now() - make_interval(hours => (e->>'dis_hours_ago')::int)
      else pg_temp.day_at((e->>'days_ago')::int - (e->>'los')::int, coalesce(e->>'dis_at', '11:00')) end;

    insert into public.hospitalizations (patient_id, organization_id, attending_doctor_id, admitted_at,
        discharged_at, admission_reason, primary_diagnosis, procedure_summary, discharge_summary, status)
    values (v_patient, v_org, v_doc, v_admit, v_dis, e->>'reason', e->>'dx_main', e->>'done',
        e->>'summary', (e->>'status')::public.hospitalization_status)
    returning id into v_hosp;

    for r in select * from jsonb_array_elements(coalesce(e->'dx', '[]')) loop
      insert into public.diagnoses (patient_id, hospitalization_id, name, code, type, status,
          diagnosed_at, resolved_at, source, recorded_by, organization_id)
      values (v_patient, v_hosp, r->>0, r->>1, (r->>2)::public.diagnosis_type, (r->>3)::public.diagnosis_status,
          v_admit::date,
          case when r->>3 = 'RESOLVED' then coalesce(v_dis, now())::date else null end,
          'HOSPITAL', v_doc, v_org);
    end loop;

    for r in select * from jsonb_array_elements(coalesce(e->'proc', '[]')) loop
      insert into public.procedures (patient_id, hospitalization_id, name, code, category,
          performed_at, performed_by, organization_id, outcome, source)
      values (v_patient, v_hosp, r->>1, r->>2, (r->>3)::public.procedure_category,
          pg_temp.past(v_admit + make_interval(days => (r->>0)::int, hours => 2)),
          v_doc, v_org, r->>4, 'HOSPITAL');
    end loop;

    for r in select * from jsonb_array_elements(coalesce(e->'labs', '[]')) loop
      v_at := pg_temp.past(v_admit + make_interval(days => (r->>0)::int, hours => 1));
      insert into public.lab_results (patient_id, hospitalization_id, panel, analyte, value_numeric,
          unit, reference_low, reference_high, flag, collected_at, resulted_at, lab_name, source,
          recorded_by, organization_id)
      values (v_patient, v_hosp, r->>1, r->>2, (r->>3)::numeric, r->>4, (r->>5)::numeric,
          (r->>6)::numeric, (r->>7)::public.lab_flag, v_at, pg_temp.past(v_at + interval '2 hours'),
          'Лаборатория: ' || (select name from _org where key = e->>'org'), 'HOSPITAL', v_doc, v_org);
    end loop;

    for r in select * from jsonb_array_elements(coalesce(e->'meds', '[]')) loop
      insert into public.medications (patient_id, hospitalization_id, name, dose, dose_unit, frequency,
          route, instructions, start_date, end_date, status, prescribed_by, organization_id, source)
      values (v_patient, v_hosp, r->>0, (r->>1)::numeric, r->>2, (r->>3)::public.medication_frequency,
          (r->>4)::public.medication_route, r->>5, v_admit::date + (r->>6)::int,
          case when r->>7 is null then null else v_admit::date + (r->>7)::int end,
          (r->>8)::public.medication_status, v_doc, v_org, 'HOSPITAL');
    end loop;

    for r in select * from jsonb_array_elements(coalesce(e->'vitals', '[]')) loop
      insert into public.observations (patient_id, hospitalization_id, type, value_numeric,
          value_secondary, value_boolean, unit, is_abnormal, source, recorded_at, recorded_by, organization_id)
      values (v_patient, v_hosp, (r->>1)::public.observation_type, (r->>2)::numeric, (r->>3)::numeric,
          case when r->>2 is null then true end, r->>4, (r->>5)::boolean, 'HOSPITAL',
          pg_temp.past(v_admit + make_interval(days => (r->>0)::int, hours => 3)), v_doc, v_org);
    end loop;

    -- план наблюдения после выписки
    continue when v_dis is null or not (e ? 'plan');
    pl := e->'plan';
    v_nurse := pg_temp.staff(pl->>'nurse');
    v_start := (v_dis at time zone 'Asia/Tashkent')::date;

    insert into public.care_plans (patient_id, hospitalization_id, source_organization_id,
        receiving_organization_id, created_by, approved_by, approved_at, title, summary, instructions,
        start_date, end_date, status, created_at)
    values (v_patient, v_hosp, v_org, v_clinic, v_doc, v_doc, v_dis + interval '20 minutes',
        pl->>'title', pl->>'summary', pl->>'instructions', v_start, v_start + (pl->>'days')::int,
        'ACTIVE', v_dis)
    returning id into v_plan;

    -- активный вызов ставит триггер; здесь проигрываем, что с ним было
    select id into v_call from public.active_calls where care_plan_id = v_plan limit 1;
    r := pl->'call';
    if v_call is not null and r->>'state' in ('ack', 'done') then
      v_ack := pg_temp.past(v_dis + make_interval(hours => coalesce((r->>'ack_h')::int, 1)));
      update public.active_calls
         set status = 'ACKNOWLEDGED', acknowledged_by = v_nurse, acknowledged_at = v_ack
       where id = v_call;

      if r->>'state' = 'done' then
        update public.active_calls
           set status = 'COMPLETED', completed_by = v_nurse,
               completed_at = greatest(v_ack, pg_temp.past(v_dis + make_interval(hours => (r->>'done_h')::int))),
               outcome = (r->>'outcome')::public.active_call_outcome, notes = r->>'note'
         where id = v_call;
      end if;
    end if;

    if v_nurse is not null then
      insert into public.care_assignments (patient_id, care_plan_id, organization_id, assigned_user_id,
          assigned_by, status, assigned_at, accepted_at, notes)
      values (v_patient, v_plan, v_clinic, v_nurse, v_clinic_head,
          case when v_dis + interval '4 hours' < now() then 'ACTIVE' else 'PENDING' end::public.care_assignment_status,
          pg_temp.past(v_dis + interval '2 hours'),
          case when v_dis + interval '4 hours' < now() then v_dis + interval '4 hours' end,
          'Закреплена поликлиникой по месту жительства');
    end if;

    for r in select * from jsonb_array_elements(coalesce(pl->'visits', '[]')) loop
      v_when := v_start + (r->>0)::int;
      v_status := case
        when v_when >= current_date then 'PLANNED'
        when r->>3 = 'MISSED' then 'MISSED'
        else 'COMPLETED' end::public.visit_status;

      insert into public.care_plan_visits (care_plan_id, patient_id, organization_id, scheduled_for,
          kind, title, assigned_user_id, status, completed_at, completed_by, notes, created_by, created_at)
      values (v_plan, v_patient, v_clinic, v_when, (r->>1)::public.visit_kind, r->>2, v_nurse, v_status,
          case when v_status in ('COMPLETED', 'MISSED')
               then pg_temp.past((v_when + time '11:30') at time zone 'Asia/Tashkent') end,
          case when v_status in ('COMPLETED', 'MISSED') then v_nurse end,
          case when v_status in ('COMPLETED', 'MISSED') then r->>4 end,
          v_clinic_doc, v_dis + interval '1 hour');
    end loop;

    for r in select * from jsonb_array_elements(coalesce(pl->'home', '[]')) loop
      v_at := v_dis + (r->>0)::numeric * interval '1 day';
      continue when v_at > now();
      insert into public.observations (patient_id, care_plan_id, type, value_numeric, value_secondary,
          value_boolean, unit, is_abnormal, note, source, recorded_at, recorded_by, organization_id)
      values (v_patient, v_plan, (r->>1)::public.observation_type, (r->>2)::numeric, (r->>3)::numeric,
          case when r->>2 is null then true end, r->>4, (r->>5)::boolean, r->>7,
          (r->>6)::public.clinical_source, v_at,
          case when r->>6 = 'NURSE' then v_nurse end,
          case when r->>6 = 'NURSE' then v_clinic end);
    end loop;

    for r in select * from jsonb_array_elements(coalesce(pl->'meds', '[]')) loop
      insert into public.medications (patient_id, hospitalization_id, care_plan_id, name, dose, dose_unit,
          frequency, route, instructions, start_date, end_date, status, prescribed_by, organization_id, source)
      values (v_patient, v_hosp, v_plan, r->>0, (r->>1)::numeric, r->>2, (r->>3)::public.medication_frequency,
          (r->>4)::public.medication_route, r->>5, v_start + (r->>6)::int,
          case when r->>7 is null then null else v_start + (r->>7)::int end,
          (r->>8)::public.medication_status, v_doc, v_org, 'HOSPITAL');
    end loop;

    -- закрытие наблюдения (только если дата закрытия уже прошла)
    r := pl->'complete';
    if r is not null then
      v_at := (v_start + (r->>'after_days')::int + time '16:00') at time zone 'Asia/Tashkent';
      if v_at < now() then
        update public.care_assignments set status = 'COMPLETED', completed_at = v_at
         where care_plan_id = v_plan and status in ('ACTIVE', 'ACCEPTED');
        update public.care_plans
           set status = 'COMPLETED', completed_at = v_at, completed_by = v_clinic_doc,
               completion_note = r->>'note'
         where id = v_plan;
        update public.twin_events set occurred_at = v_at
         where source_table = 'care_plans' and source_id = v_plan and event_type = 'CARE_PLAN_COMPLETED';
      end if;
    end if;
  end loop;

  update public.digital_twins
     set current_status = (p->>'twin')::public.twin_status,
         risk_level = (p->>'risk')::public.risk_level
   where patient_id = v_patient;

  raise notice 'Загружен: % % (%)', p->>'last', p->>'first', p->>'pinfl';
end;
$fn$;

-- закрытие плана пишет событие с временем «сейчас»; исправляем его в загрузчике
alter table public.twin_events disable trigger twin_events_no_update;


-- 4. Пациенты -----------------------------------------------------------------

-- 4.1 Турсунов Абдулла — ИБС, ХСН с низкой ФВ, СД2, ХБП, ФП. 10 обращений.
-- Сейчас: декомпенсация после выписки — вес растёт, пропущен визит.
select pg_temp.seed_patient($p$
{
  "pinfl": "31403565620187", "last": "Турсунов", "first": "Абдулла", "born": "1956-03-14", "sex": "MALE",
  "phone": "+998905521843", "district": "г. Наманган", "address": "г. Наманган, ул. Алишера Навои, 112, кв. 34",
  "clinic": "p17", "twin": "POST_DISCHARGE_MONITORING", "risk": "CRITICAL", "height": 171,
  "profile": {
    "smoking": "FORMER", "pack_years": 30, "alcohol": "NONE", "activity": "SEDENTARY",
    "family": ["инфаркт миокарда у отца в 58 лет", "сахарный диабет 2 типа у матери", "внезапная сердечная смерть у брата в 61 год"],
    "genetics": {"9p21 rs1333049": "risk", "APOE ε3/ε4": "risk"},
    "notes": "Бросил курить после инфаркта в 2017 г. Живёт с женой на 4 этаже без лифта."
  },
  "chronic": [
    ["Гипертоническая болезнь III стадии", "I10", "COMORBIDITY", "ACTIVE", 5800, null, "p17", null],
    ["Сахарный диабет 2 типа", "E11.9", "COMORBIDITY", "ACTIVE", 4200, null, "endo", "Целевой HbA1c < 7,5%"],
    ["Постинфарктный кардиосклероз (ИМ передней стенки, 2017)", "I25.2", "COMORBIDITY", "ACTIVE", 3280, null, "rkc", null],
    ["Хроническая сердечная недостаточность с низкой фракцией выброса", "I50.0", "COMORBIDITY", "ACTIVE", 1890, null, "kardio", "ФВ ЛЖ 28–32%, NYHA III"],
    ["Хроническая болезнь почек С3б", "N18.3", "COMORBIDITY", "ACTIVE", 1090, null, "p17", "СКФ 38–45 мл/мин/1,73 м²"],
    ["Пароксизмальная фибрилляция предсердий", "I48.0", "COMORBIDITY", "ACTIVE", 418, null, "kardio", "CHA₂DS₂-VASc 5 баллов"]
  ],
  "allergies": [
    ["Йодсодержащие рентгеноконтрастные средства", "Крапивница и отёк Квинке во время коронарографии", "SEVERE", 3290, "rkc", "Повторные исследования — только с премедикацией"],
    ["Эналаприл", "Упорный сухой кашель, препарат отменён", "MILD", 1850, "kardio", "Непереносимость ингибиторов АПФ"]
  ],
  "meds": [
    ["Бисопролол", 5, "мг", "ONCE_DAILY", "ORAL", "Утром, контроль ЧСС", 1880, "ACTIVE", null, "kardio"],
    ["Сакубитрил/валсартан", 100, "мг", "TWICE_DAILY", "ORAL", "49/51 мг, контроль калия и креатинина", 1840, "ACTIVE", null, "kardio"],
    ["Спиронолактон", 25, "мг", "ONCE_DAILY", "ORAL", "Утром", 1880, "ACTIVE", null, "kardio"],
    ["Дапаглифлозин", 10, "мг", "ONCE_DAILY", "ORAL", "Утром", 1080, "ACTIVE", null, "central"],
    ["Торасемид", 10, "мг", "ONCE_DAILY", "ORAL", "Утром, дозу корректировать по весу", 1090, "ACTIVE", null, "central"],
    ["Аторвастатин", 40, "мг", "ONCE_DAILY", "ORAL", "Вечером", 3280, "ACTIVE", null, "rkc"],
    ["Апиксабан", 5, "мг", "TWICE_DAILY", "ORAL", "Постоянно, не пропускать", 412, "ACTIVE", null, "kardio"],
    ["Метформин", 500, "мг", "TWICE_DAILY", "ORAL", "Доза снижена из-за ХБП", 4200, "ACTIVE", null, "endo"],
    ["Ацетилсалициловая кислота", 100, "мг", "ONCE_DAILY", "ORAL", "Отменена при назначении апиксабана", 3280, "STOPPED", 412, "rkc"],
    ["Эналаприл", 5, "мг", "TWICE_DAILY", "ORAL", "Отменён из-за кашля", 1890, "STOPPED", 1850, "kardio"]
  ],
  "labs": [
    [3000, "Биохимия", "HbA1c", 7.1, "%", 4.0, 6.0, null, "p17"],
    [2200, "Биохимия", "HbA1c", 7.8, "%", 4.0, 6.0, null, "p17"],
    [1500, "Биохимия", "HbA1c", 8.3, "%", 4.0, 6.0, null, "p17"],
    [900, "Биохимия", "HbA1c", 7.6, "%", 4.0, 6.0, null, "p17"],
    [400, "Биохимия", "HbA1c", 7.4, "%", 4.0, 6.0, null, "p17"],
    [120, "Биохимия", "HbA1c", 7.9, "%", 4.0, 6.0, null, "p17"],
    [60, "Липидный профиль", "Общий холестерин", 4.9, "ммоль/л", 3.0, 5.2, null, "p17"],
    [60, "Липидный профиль", "ЛПВП", 0.92, "ммоль/л", 1.0, 2.2, null, "p17"],
    [60, "Липидный профиль", "ЛПНП", 2.8, "ммоль/л", 0, 1.4, null, "p17"],
    [60, "Липидный профиль", "Триглицериды", 2.3, "ммоль/л", 0, 1.7, null, "p17"],
    [120, "Биохимия", "Креатинин", 124, "мкмоль/л", 62, 106, null, "p17"],
    [120, "Биохимия", "СКФ (CKD-EPI)", 51, "мл/мин/1,73м²", 60, 120, null, "p17"]
  ],
  "obs": [
    [60, "BLOOD_PRESSURE", 128, 78, "мм рт. ст.", false, "p17"],
    [60, "WEIGHT", 80.4, null, "кг", false, "p17"]
  ],
  "episodes": [
    {
      "org": "rkc", "doc": "kurbanov", "days_ago": 3290, "at": "05:40", "los": 8, "status": "DISCHARGED",
      "reason": "Интенсивная давящая загрудинная боль более 40 минут, холодный пот, слабость",
      "dx_main": "Острый трансмуральный инфаркт миокарда передней стенки левого желудочка",
      "summary": "Доставлен СМП через 2,5 часа от начала боли. Выполнено первичное ЧКВ: стентирование ПНА. Во время коронарографии развилась реакция на йодсодержащий контраст (крапивница, отёк Квинке), купирована преднизолоном и хлоропирамином. Течение без рецидива ишемии, ФВ ЛЖ при выписке 41%. Выписан в удовлетворительном состоянии на двойной антиагрегантной терапии.",
      "done": "Коронарография, стентирование ПНА стентом с лекарственным покрытием, ЭхоКГ",
      "dx": [["Острый трансмуральный инфаркт миокарда передней стенки", "I21.0", "PRIMARY", "RESOLVED"],
             ["Кардиогенный шок I степени", "R57.0", "COMPLICATION", "RESOLVED"],
             ["Аллергическая реакция на рентгеноконтрастное средство", "T88.7", "COMPLICATION", "RESOLVED"]],
      "proc": [[0, "Коронарография", "CAG", "DIAGNOSTIC", "Окклюзия проксимального сегмента ПНА, стеноз ОА 60%"],
               [0, "Стентирование ПНА", "PCI-LAD", "SURGERY", "Имплантирован 1 стент с лекарственным покрытием, кровоток TIMI III"],
               [2, "Эхокардиография", "ECHO", "IMAGING", "ФВ ЛЖ 41%, акинез передней стенки и верхушки"]],
      "labs": [[0, "Кардиомаркеры", "Тропонин I", 18.4, "нг/мл", 0, 0.04, "CRITICAL"],
               [0, "Биохимия", "Креатинин", 98, "мкмоль/л", 62, 106, null],
               [1, "Липидный профиль", "Общий холестерин", 6.4, "ммоль/л", 3.0, 5.2, null],
               [1, "Липидный профиль", "ЛПНП", 4.3, "ммоль/л", 0, 3.0, null],
               [1, "Биохимия", "Глюкоза натощак", 8.9, "ммоль/л", 3.9, 6.1, null]],
      "meds": [["Гепарин натрия", 5000, "ЕД", "FOUR_TIMES_DAILY", "IV", "Под контролем АЧТВ", 0, 2, "COMPLETED"],
               ["Клопидогрел", 75, "мг", "ONCE_DAILY", "ORAL", "12 месяцев после стентирования", 0, 365, "COMPLETED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 92, 58, "мм рт. ст.", true], [0, "HEART_RATE", 112, null, "уд/мин", true],
                 [3, "BLOOD_PRESSURE", 124, 76, "мм рт. ст.", false], [7, "HEART_RATE", 68, null, "уд/мин", false]],
      "plan": {
        "title": "Наблюдение после инфаркта миокарда", "days": 90, "nurse": "nurse17",
        "summary": "Контроль гемодинамики, приверженности ДАТТ и липидов",
        "instructions": "Патронаж на 3-и сутки, осмотр кардиолога через 2 недели, липиды через 6 недель",
        "call": {"state": "done", "ack_h": 2, "done_h": 7, "outcome": "VISITED", "note": "Жалоб нет, препараты получает"},
        "visits": [[3, "HOME", "Патронаж на дому", "COMPLETED", "АД 118/74, ЧСС 64, одышки нет"],
                   [14, "CLINIC", "Осмотр кардиолога", "COMPLETED", "ЭКГ без отрицательной динамики"],
                   [45, "CLINIC", "Контроль липидов", "COMPLETED", "ЛПНП 2,1 ммоль/л на аторвастатине 40 мг"]],
        "complete": {"after_days": 90, "note": "Стабилен, передан под диспансерное наблюдение кардиолога"}
      }
    },
    {
      "org": "kardio", "doc": "alimov", "days_ago": 2900, "los": 6, "status": "DISCHARGED",
      "reason": "Учащение приступов загрудинной боли при ходьбе до 100 м",
      "dx_main": "Нестабильная стенокардия",
      "summary": "Приступы купированы на фоне антиангинальной терапии. Коронарография не выполнялась из-за аллергии на контраст — проведена стресс-эхокардиография: преходящая ишемия нижней стенки. Усилена терапия, рекомендовано плановое обследование.",
      "done": "Стресс-эхокардиография, суточное мониторирование ЭКГ",
      "dx": [["Нестабильная стенокардия", "I20.0", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Суточное мониторирование ЭКГ", "HOLTER", "DIAGNOSTIC", "Эпизоды депрессии ST до 1,5 мм при ЧСС 110"],
               [3, "Стресс-эхокардиография", "STRESS-ECHO", "IMAGING", "Преходящая ишемия нижней стенки"]],
      "labs": [[0, "Кардиомаркеры", "Тропонин I", 0.02, "нг/мл", 0, 0.04, null],
               [0, "Биохимия", "Креатинин", 101, "мкмоль/л", 62, 106, null]],
      "meds": [["Изосорбида мононитрат", 40, "мг", "ONCE_DAILY", "ORAL", "Утром", 0, 180, "COMPLETED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 162, 96, "мм рт. ст.", true], [5, "BLOOD_PRESSURE", 132, 82, "мм рт. ст.", false]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 2480, "at": "23:10", "los": 4, "status": "DISCHARGED",
      "reason": "Головная боль, одышка в покое, АД 220/120 мм рт. ст.",
      "dx_main": "Гипертонический криз, осложнённый острой левожелудочковой недостаточностью",
      "summary": "Криз купирован внутривенными нитратами и фуросемидом. Признаки отёка лёгких регрессировали за сутки. Скорректирована антигипертензивная терапия.",
      "done": "Рентгенография органов грудной клетки, ЭКГ",
      "dx": [["Гипертонический криз, осложнённый острой левожелудочковой недостаточностью", "I11.0", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Рентгенография органов грудной клетки", "XR-CHEST", "IMAGING", "Интерстициальный отёк, расширение тени сердца"]],
      "labs": [[0, "Биохимия", "Креатинин", 108, "мкмоль/л", 62, 106, null], [0, "Биохимия", "Калий", 4.1, "ммоль/л", 3.5, 5.1, null]],
      "vitals": [[0, "BLOOD_PRESSURE", 220, 120, "мм рт. ст.", true], [0, "SPO2", 88, null, "%", true],
                 [1, "BLOOD_PRESSURE", 150, 90, "мм рт. ст.", true], [3, "BLOOD_PRESSURE", 134, 82, "мм рт. ст.", false]]
    },
    {
      "org": "endo", "doc": "saidova", "days_ago": 2150, "los": 9, "status": "DISCHARGED",
      "reason": "Жажда, полиурия, похудание на 5 кг за 2 месяца",
      "dx_main": "Декомпенсация сахарного диабета 2 типа",
      "summary": "Глюкоза при поступлении 17,8 ммоль/л, HbA1c 10,4%. Временно назначен инсулин гларгин, к выписке гликемия 6–9 ммоль/л. Проведено обучение самоконтролю.",
      "done": "Подбор сахароснижающей терапии, школа диабета",
      "dx": [["Сахарный диабет 2 типа с гипергликемией", "E11.65", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза натощак", 17.8, "ммоль/л", 3.9, 6.1, null],
               [0, "Биохимия", "HbA1c", 10.4, "%", 4.0, 6.0, null],
               [0, "Биохимия", "Креатинин", 104, "мкмоль/л", 62, 106, null]],
      "meds": [["Инсулин гларгин", 14, "ЕД", "ONCE_DAILY", "SUBCUTANEOUS", "На ночь, временно", 1, 90, "COMPLETED"]],
      "plan": {
        "title": "Контроль гликемии после декомпенсации", "days": 60, "nurse": "nurse17",
        "summary": "Самоконтроль гликемии, титрация инсулина", "instructions": "Дневник глюкозы, звонок через неделю, осмотр через месяц",
        "call": {"state": "done", "ack_h": 1, "done_h": 5, "outcome": "CONTACTED", "note": "Глюкоза утром 7–8 ммоль/л"},
        "visits": [[7, "CALL", "Контрольный звонок", "COMPLETED", "Гипогликемий нет"],
                   [30, "CLINIC", "Осмотр эндокринолога", "COMPLETED", "Инсулин отменён, HbA1c 7,8%"]],
        "home": [[2, "GLUCOSE", 9.1, null, "ммоль/л", true, "PATIENT", null], [10, "GLUCOSE", 7.4, null, "ммоль/л", false, "PATIENT", null]],
        "complete": {"after_days": 60, "note": "Гликемия в целевом диапазоне на пероральной терапии"}
      }
    },
    {
      "org": "kardio", "doc": "alimov", "days_ago": 1900, "los": 11, "status": "DISCHARGED",
      "reason": "Нарастающая одышка, отёки голеней, ортопноэ",
      "dx_main": "Хроническая сердечная недостаточность с низкой ФВ, впервые выявленная декомпенсация",
      "summary": "ФВ ЛЖ снизилась до 32%. Проведена диуретическая терапия (−6 кг). Коронарография с премедикацией: рестеноза стента нет, стеноз ОА 70% — стентирование ОА. Начата терапия ХСН: бисопролол, эналаприл, спиронолактон. Эналаприл через 5 недель заменён на сакубитрил/валсартан из-за кашля.",
      "done": "ЭхоКГ, коронарография с премедикацией, стентирование ОА",
      "dx": [["Острая декомпенсация хронической сердечной недостаточности", "I50.0", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Эхокардиография", "ECHO", "IMAGING", "ФВ ЛЖ 32%, дилатация ЛЖ, митральная регургитация II ст."],
               [4, "Коронарография с премедикацией (преднизолон, хлоропирамин)", "CAG", "DIAGNOSTIC", "Реакции на контраст не было. Рестеноза стента ПНА нет, стеноз ОА 70%"],
               [4, "Стентирование ОА", "PCI-LCX", "SURGERY", "Без осложнений"]],
      "labs": [[0, "Кардиомаркеры", "NT-proBNP", 4820, "пг/мл", 0, 125, null],
               [0, "Биохимия", "Креатинин", 112, "мкмоль/л", 62, 106, null],
               [0, "Биохимия", "Калий", 4.4, "ммоль/л", 3.5, 5.1, null],
               [10, "Кардиомаркеры", "NT-proBNP", 1960, "пг/мл", 0, 125, null]],
      "meds": [["Фуросемид", 40, "мг", "TWICE_DAILY", "IV", "Диуретическая терапия", 0, 7, "COMPLETED"]],
      "vitals": [[0, "WEIGHT", 88, null, "кг", true], [0, "SPO2", 91, null, "%", true], [10, "WEIGHT", 82, null, "кг", false]],
      "plan": {
        "title": "Наблюдение при сердечной недостаточности", "days": 90, "nurse": "nurse17",
        "summary": "Ежедневное взвешивание, титрация терапии ХСН", "instructions": "Вес каждое утро; прибавка > 2 кг за 3 дня — сообщить",
        "call": {"state": "done", "ack_h": 1, "done_h": 4, "outcome": "VISITED", "note": "Вес 82 кг, отёков нет"},
        "visits": [[3, "HOME", "Патронаж на дому", "COMPLETED", "Отёков нет, АД 116/72"],
                   [14, "CLINIC", "Осмотр кардиолога", "COMPLETED", "Кашель на эналаприле — направлен к кардиологу"],
                   [35, "CLINIC", "Смена ИАПФ на сакубитрил/валсартан", "COMPLETED", "Кашель прошёл"],
                   [60, "CALL", "Контрольный звонок", "COMPLETED", "Вес стабилен"]],
        "home": [[1, "WEIGHT", 82.1, null, "кг", false, "PATIENT", null], [10, "WEIGHT", 81.8, null, "кг", false, "PATIENT", null],
                 [30, "WEIGHT", 81.5, null, "кг", false, "PATIENT", null]],
        "complete": {"after_days": 90, "note": "Компенсирован, NYHA II"}
      }
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 1500, "at": "14:20", "los": 8, "status": "DISCHARGED",
      "reason": "Лихорадка до 38,9 °C, кашель с мокротой, одышка",
      "dx_main": "Внебольничная пневмония нижней доли правого лёгкого",
      "summary": "Пневмония средней тяжести. Антибиотикотерапия цефтриаксоном и азитромицином, положительная динамика. Декомпенсации ХСН не было.",
      "done": "Рентгенография ОГК, антибиотикотерапия",
      "dx": [["Внебольничная пневмония нижней доли правого лёгкого", "J18.1", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Рентгенография органов грудной клетки", "XR-CHEST", "IMAGING", "Инфильтрация нижней доли справа"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 14.6, "10^9/л", 4, 10, null], [0, "Биохимия", "СРБ", 96, "мг/л", 0, 5, null],
               [6, "Биохимия", "СРБ", 12, "мг/л", 0, 5, null]],
      "meds": [["Цефтриаксон", 2, "г", "ONCE_DAILY", "IV", "7 дней", 0, 7, "COMPLETED"],
               ["Азитромицин", 500, "мг", "ONCE_DAILY", "ORAL", "3 дня", 0, 3, "COMPLETED"]],
      "vitals": [[0, "TEMPERATURE", 38.9, null, "°C", true], [0, "SPO2", 92, null, "%", true], [5, "TEMPERATURE", 36.8, null, "°C", false]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 1100, "los": 10, "status": "TRANSFERRED",
      "reason": "Одышка при минимальной нагрузке, прибавка веса 5 кг за неделю",
      "dx_main": "Декомпенсация ХСН, впервые выявленная хроническая болезнь почек",
      "summary": "Декомпенсация на фоне погрешностей в диете. Креатинин 142 мкмоль/л, СКФ 43 — диагностирована ХБП С3б. Добавлен дапаглифлозин, торасемид вместо фуросемида. Переведён на кардиореабилитацию.",
      "done": "ЭхоКГ, УЗИ почек, диуретическая терапия",
      "dx": [["Острая декомпенсация хронической сердечной недостаточности", "I50.0", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Эхокардиография", "ECHO", "IMAGING", "ФВ ЛЖ 30%"], [2, "УЗИ почек", "US-KIDNEY", "IMAGING", "Диффузные изменения паренхимы"]],
      "labs": [[0, "Кардиомаркеры", "NT-proBNP", 5310, "пг/мл", 0, 125, null], [0, "Биохимия", "Креатинин", 142, "мкмоль/л", 62, 106, null],
               [0, "Биохимия", "СКФ (CKD-EPI)", 43, "мл/мин/1,73м²", 60, 120, null], [0, "Биохимия", "Калий", 5.0, "ммоль/л", 3.5, 5.1, null]],
      "meds": [["Фуросемид", 40, "мг", "TWICE_DAILY", "IV", null, 0, 6, "COMPLETED"]],
      "vitals": [[0, "WEIGHT", 87.5, null, "кг", true], [9, "WEIGHT", 81.9, null, "кг", false]]
    },
    {
      "org": "shifo", "doc": "nazirova", "days_ago": 1090, "at": "13:00", "los": 21, "status": "DISCHARGED",
      "reason": "Перевод для кардиореабилитации после декомпенсации ХСН",
      "dx_main": "Кардиологическая реабилитация при ХСН",
      "summary": "Курс дозированных физических нагрузок, дыхательная гимнастика, обучение контролю веса и соли. Тест 6-минутной ходьбы: 240 → 330 м.",
      "done": "Кардиореабилитация, тест 6-минутной ходьбы",
      "dx": [["Реабилитация после декомпенсации ХСН", "Z50.0", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Тест 6-минутной ходьбы", "6MWT", "DIAGNOSTIC", "240 м"], [20, "Тест 6-минутной ходьбы", "6MWT", "DIAGNOSTIC", "330 м"]],
      "plan": {
        "title": "Наблюдение после кардиореабилитации", "days": 60, "nurse": "nurse17",
        "summary": "Контроль веса, АД, функции почек", "instructions": "Креатинин и калий через 2 недели",
        "call": {"state": "done", "ack_h": 3, "done_h": 9, "outcome": "CONTACTED", "note": "Самочувствие хорошее"},
        "visits": [[4, "HOME", "Патронаж на дому", "COMPLETED", "Вес 81,6 кг"], [14, "CLINIC", "Контроль креатинина и калия", "COMPLETED", "Креатинин 132, калий 4,8"]],
        "complete": {"after_days": 60, "note": "Стабилен"}
      }
    },
    {
      "org": "kardio", "doc": "alimov", "days_ago": 420, "at": "08:15", "los": 6, "status": "DISCHARGED",
      "reason": "Сердцебиение, перебои, слабость в течение суток",
      "dx_main": "Пароксизм фибрилляции предсердий",
      "summary": "Пароксизм ФП с ЧСС до 140. Ритм восстановлен медикаментозно. CHA₂DS₂-VASc 5 баллов — назначен апиксабан, ацетилсалициловая кислота отменена.",
      "done": "ЭКГ, ЭхоКГ, медикаментозная кардиоверсия",
      "dx": [["Пароксизм фибрилляции предсердий", "I48.0", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Медикаментозная кардиоверсия", "CARDIOVERSION", "THERAPEUTIC", "Синусовый ритм восстановлен через 6 часов"]],
      "labs": [[0, "Биохимия", "ТТГ", 2.1, "мЕд/л", 0.4, 4.0, null], [0, "Биохимия", "Креатинин", 128, "мкмоль/л", 62, 106, null],
               [0, "Коагулограмма", "МНО", 1.1, "", 0.8, 1.2, null]],
      "vitals": [[0, "HEART_RATE", 142, null, "уд/мин", true], [1, "HEART_RATE", 70, null, "уд/мин", false]],
      "plan": {
        "title": "Наблюдение после пароксизма ФП", "days": 30, "nurse": "nurse17",
        "summary": "Приверженность антикоагулянту, контроль ритма", "instructions": "ЭКГ через 2 недели",
        "call": {"state": "done", "ack_h": 2, "done_h": 6, "outcome": "CONTACTED", "note": "Апиксабан получает, кровотечений нет"},
        "visits": [[14, "CLINIC", "ЭКГ-контроль", "COMPLETED", "Синусовый ритм"]],
        "complete": {"after_days": 30, "note": "Синусовый ритм, антикоагулянт принимает"}
      }
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 18, "at": "02:50", "los": 9, "status": "DISCHARGED",
      "reason": "Одышка в покое, ортопноэ, отёки до середины бёдер, прибавка веса 7 кг",
      "dx_main": "Острая декомпенсация ХСН с низкой ФВ, NYHA IV",
      "summary": "Тяжёлая декомпенсация ХСН, двусторонний гидроторакс. Плевральная пункция справа (900 мл). Внутривенные диуретики, вес снижен на 6,3 кг. ФВ ЛЖ 28%. Креатинин 158 → 138 мкмоль/л, калий 5,4 ммоль/л на фоне спиронолактона и сакубитрила/валсартана — требуется контроль. Выписан с NT-proBNP 3100. Высокий риск повторной госпитализации: ежедневное взвешивание обязательно.",
      "done": "ЭхоКГ, плевральная пункция справа, внутривенная диуретическая терапия",
      "dx": [["Острая декомпенсация хронической сердечной недостаточности", "I50.0", "PRIMARY", "RESOLVED"],
             ["Двусторонний гидроторакс", "J91", "COMPLICATION", "RESOLVED"]],
      "proc": [[0, "Рентгенография органов грудной клетки", "XR-CHEST", "IMAGING", "Двусторонний гидроторакс, больше справа"],
               [1, "Эхокардиография", "ECHO", "IMAGING", "ФВ ЛЖ 28%, СДЛА 52 мм рт. ст."],
               [1, "Плевральная пункция справа", "THORACENTESIS", "THERAPEUTIC", "Эвакуировано 900 мл транссудата"]],
      "labs": [[0, "Кардиомаркеры", "NT-proBNP", 6800, "пг/мл", 0, 125, null],
               [0, "Биохимия", "Креатинин", 158, "мкмоль/л", 62, 106, null],
               [0, "Биохимия", "Калий", 5.1, "ммоль/л", 3.5, 5.1, null],
               [0, "Биохимия", "Натрий", 132, "ммоль/л", 136, 145, null],
               [0, "Общий анализ крови", "Гемоглобин", 118, "г/л", 130, 170, null],
               [8, "Кардиомаркеры", "NT-proBNP", 3100, "пг/мл", 0, 125, null],
               [8, "Биохимия", "Креатинин", 138, "мкмоль/л", 62, 106, null],
               [8, "Биохимия", "СКФ (CKD-EPI)", 42, "мл/мин/1,73м²", 60, 120, null],
               [8, "Биохимия", "Калий", 5.4, "ммоль/л", 3.5, 5.1, null],
               [8, "Биохимия", "HbA1c", 8.2, "%", 4.0, 6.0, null]],
      "meds": [["Фуросемид", 80, "мг", "TWICE_DAILY", "IV", "Внутривенно болюсно", 0, 6, "COMPLETED"]],
      "vitals": [[0, "WEIGHT", 86.7, null, "кг", true], [0, "SPO2", 86, null, "%", true], [0, "BLOOD_PRESSURE", 104, 68, "мм рт. ст.", false],
                 [0, "HEART_RATE", 104, null, "уд/мин", true], [3, "SPO2", 93, null, "%", false],
                 [8, "WEIGHT", 80.4, null, "кг", false], [8, "BLOOD_PRESSURE", 112, 70, "мм рт. ст.", false]],
      "plan": {
        "title": "Наблюдение после декомпенсации ХСН", "days": 30, "nurse": "nurse17",
        "summary": "Высокий риск повторной декомпенсации. Ежедневный вес, калий и креатинин через неделю.",
        "instructions": "Вес каждое утро натощак. Прибавка > 2 кг за 3 дня или одышка в покое — срочный осмотр. Калий и креатинин на 7-е сутки.",
        "call": {"state": "done", "ack_h": 1, "done_h": 6, "outcome": "VISITED", "note": "Одышка при ходьбе по квартире, отёки стоп. Вес 80,6 кг"},
        "visits": [[2, "HOME", "Патронаж на дому", "COMPLETED", "Вес 80,9 кг, пастозность голеней, АД 110/70"],
                   [7, "CLINIC", "Контроль калия и креатинина", "MISSED", "Не явился: сильная одышка, не может спуститься с 4 этажа"],
                   [14, "CLINIC", "Осмотр кардиолога", "PLANNED", null],
                   [21, "CALL", "Контрольный звонок", "PLANNED", null],
                   [28, "CLINIC", "Итоговый осмотр", "PLANNED", null]],
        "home": [[0.8, "WEIGHT", 80.6, null, "кг", false, "PATIENT", null],
                 [2, "WEIGHT", 80.9, null, "кг", false, "NURSE", "Патронаж"],
                 [2, "BLOOD_PRESSURE", 110, 70, "мм рт. ст.", false, "NURSE", null],
                 [3, "WEIGHT", 81.3, null, "кг", false, "PATIENT", null],
                 [4, "WEIGHT", 81.9, null, "кг", false, "PATIENT", null],
                 [5, "WEIGHT", 82.6, null, "кг", true, "PATIENT", "Прибавка 2 кг за 3 дня"],
                 [6, "WEIGHT", 83.2, null, "кг", true, "PATIENT", null],
                 [6, "HEART_RATE", 98, null, "уд/мин", true, "PATIENT", null],
                 [7, "SHORTNESS_OF_BREATH", null, null, null, true, "PATIENT", "Одышка при разговоре, спит полусидя"],
                 [8, "WEIGHT", 83.9, null, "кг", true, "PATIENT", null],
                 [8, "SWELLING", null, null, null, true, "PATIENT", "Отёки до колен"],
                 [8.5, "BLOOD_PRESSURE", 102, 64, "мм рт. ст.", true, "PATIENT", null]],
        "meds": [["Торасемид", 20, "мг", "ONCE_DAILY", "ORAL", "Доза увеличена при выписке", 0, null, "ACTIVE"]]
      }
    }
  ]
}
$p$::jsonb);


-- 4.2 Мирзаева Дилноза — СД2 с осложнениями, ожирение, АГ; аллергия на
-- сульфаниламиды (важно для препаратов сульфонилмочевины). 6 обращений.
select pg_temp.seed_patient($p$
{
  "pinfl": "42207686280043", "last": "Мирзаева", "first": "Дилноза", "born": "1968-07-22", "sex": "FEMALE",
  "phone": "+998937041528", "district": "г. Наманган", "address": "г. Наманган, махалля Гулбог, ул. Бобура, 23",
  "clinic": "p17", "twin": "STABLE", "risk": "MEDIUM", "height": 158,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "NONE", "activity": "SEDENTARY",
    "family": ["сахарный диабет 2 типа у отца", "сахарный диабет 2 типа у сестры", "гипертоническая болезнь у матери"],
    "genetics": {"TCF7L2 rs7903146": "risk"},
    "notes": "Работает швеёй. Диету соблюдает непостоянно."
  },
  "chronic": [
    ["Сахарный диабет 2 типа с диабетической полинейропатией", "E11.4", "COMORBIDITY", "ACTIVE", 2600, null, "endo", "На базальном инсулине с 2025 г."],
    ["Диабетическая непролиферативная ретинопатия", "E11.3", "COMPLICATION", "ACTIVE", 700, null, "endo", null],
    ["Ожирение II степени", "E66.0", "COMORBIDITY", "ACTIVE", 2600, null, "p17", "ИМТ 38"],
    ["Гипертоническая болезнь II стадии", "I10", "COMORBIDITY", "ACTIVE", 3000, null, "p17", null],
    ["Дислипидемия", "E78.5", "COMORBIDITY", "ACTIVE", 1500, null, "p17", null]
  ],
  "allergies": [
    ["Ко-тримоксазол (сульфаниламиды)", "Токсидермия, лихорадка до 39 °C", "SEVERE", 1798, "multi", "Избегать сульфаниламидов"],
    ["Пыльца амброзии", "Сезонный ринит, конъюнктивит", "MILD", 3500, "p17", null]
  ],
  "meds": [
    ["Метформин", 1000, "мг", "TWICE_DAILY", "ORAL", "Во время еды", 2590, "ACTIVE", null, "endo"],
    ["Инсулин гларгин", 22, "ЕД", "ONCE_DAILY", "SUBCUTANEOUS", "В 22:00, доза снижена после гипогликемии", 425, "ACTIVE", null, "endo"],
    ["Лозартан", 50, "мг", "ONCE_DAILY", "ORAL", "Утром", 2990, "ACTIVE", null, "p17"],
    ["Аторвастатин", 20, "мг", "ONCE_DAILY", "ORAL", "Вечером", 1490, "ACTIVE", null, "p17"],
    ["Гликлазид", 60, "мг", "ONCE_DAILY", "ORAL", "Отменён после реакции на сульфаниламиды", 2500, "STOPPED", 1795, "endo"]
  ],
  "labs": [
    [2000, "Биохимия", "HbA1c", 7.4, "%", 4.0, 6.0, null, "p17"],
    [1500, "Биохимия", "HbA1c", 7.9, "%", 4.0, 6.0, null, "p17"],
    [1000, "Биохимия", "HbA1c", 8.6, "%", 4.0, 6.0, null, "p17"],
    [700, "Биохимия", "HbA1c", 9.4, "%", 4.0, 6.0, null, "p17"],
    [250, "Биохимия", "HbA1c", 8.8, "%", 4.0, 6.0, null, "p17"],
    [120, "Биохимия", "HbA1c", 8.1, "%", 4.0, 6.0, null, "p17"],
    [30, "Биохимия", "HbA1c", 7.8, "%", 4.0, 6.0, null, "p17"],
    [40, "Липидный профиль", "Общий холестерин", 5.8, "ммоль/л", 3.0, 5.2, null, "p17"],
    [40, "Липидный профиль", "ЛПВП", 1.05, "ммоль/л", 1.2, 2.2, null, "p17"],
    [40, "Липидный профиль", "ЛПНП", 3.6, "ммоль/л", 0, 1.8, null, "p17"],
    [40, "Липидный профиль", "Триглицериды", 2.6, "ммоль/л", 0, 1.7, null, "p17"],
    [40, "Биохимия", "Креатинин", 84, "мкмоль/л", 44, 80, null, "p17"],
    [40, "Биохимия", "СКФ (CKD-EPI)", 68, "мл/мин/1,73м²", 60, 120, null, "p17"],
    [40, "Общий анализ мочи", "Альбумин в моче", 48, "мг/л", 0, 30, null, "p17"],
    [40, "Биохимия", "АЛТ", 38, "Ед/л", 0, 33, null, "p17"]
  ],
  "obs": [
    [40, "BLOOD_PRESSURE", 142, 88, "мм рт. ст.", true, "p17"],
    [40, "WEIGHT", 95.8, null, "кг", false, "p17"]
  ],
  "episodes": [
    {
      "org": "endo", "doc": "saidova", "days_ago": 2600, "los": 10, "status": "DISCHARGED",
      "reason": "Жажда, сухость во рту, зуд кожи, глюкоза 16,2 ммоль/л при профосмотре",
      "dx_main": "Сахарный диабет 2 типа, впервые выявленный",
      "summary": "Впервые выявленный СД2, HbA1c 11,3%. Назначены метформин и гликлазид, проведено обучение в школе диабета. Выявлена начальная полинейропатия.",
      "done": "Школа диабета, осмотр невролога и окулиста",
      "dx": [["Сахарный диабет 2 типа с гипергликемией", "E11.65", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза натощак", 16.2, "ммоль/л", 3.9, 6.1, null], [0, "Биохимия", "HbA1c", 11.3, "%", 4.0, 6.0, null]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 2200, "at": "21:30", "los": 3, "status": "DISCHARGED",
      "reason": "Сильная головная боль, мелькание мушек, АД 200/110",
      "dx_main": "Гипертонический криз неосложнённый",
      "summary": "Криз купирован. Лозартан 50 мг продолжен, добавлены рекомендации по ограничению соли.",
      "dx": [["Гипертонический криз неосложнённый", "I10", "PRIMARY", "RESOLVED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 200, 110, "мм рт. ст.", true], [2, "BLOOD_PRESSURE", 138, 86, "мм рт. ст.", false]]
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 1800, "at": "16:45", "los": 7, "status": "DISCHARGED",
      "reason": "Боль в пояснице справа, лихорадка 39,2 °C, озноб",
      "dx_main": "Острый правосторонний пиелонефрит",
      "summary": "На 2-е сутки приёма ко-тримоксазола развилась токсидермия с лихорадкой — препарат отменён, назначен цефтриаксон. Сульфаниламиды внесены в аллергоанамнез. Гликлазид (производное сульфонилмочевины) отменён из осторожности.",
      "done": "УЗИ почек, посев мочи, антибиотикотерапия",
      "dx": [["Острый пиелонефрит", "N10", "PRIMARY", "RESOLVED"], ["Токсидермия на ко-тримоксазол", "L27.0", "COMPLICATION", "RESOLVED"]],
      "proc": [[0, "УЗИ почек", "US-KIDNEY", "IMAGING", "Расширение ЧЛС справа, конкрементов нет"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 15.2, "10^9/л", 4, 10, null], [0, "Биохимия", "СРБ", 118, "мг/л", 0, 5, null],
               [0, "Биохимия", "Глюкоза натощак", 13.4, "ммоль/л", 3.9, 6.1, null]],
      "meds": [["Ко-тримоксазол", 960, "мг", "TWICE_DAILY", "ORAL", "Отменён на 2-е сутки — токсидермия", 0, 2, "STOPPED"],
               ["Цефтриаксон", 2, "г", "ONCE_DAILY", "IV", null, 2, 7, "COMPLETED"]],
      "vitals": [[0, "TEMPERATURE", 39.2, null, "°C", true], [2, "TEMPERATURE", 39.0, null, "°C", true], [6, "TEMPERATURE", 36.7, null, "°C", false]]
    },
    {
      "org": "central", "doc": "doc", "days_ago": 1250, "los": 12, "status": "DISCHARGED",
      "reason": "Покраснение, отёк и боль I пальца правой стопы, лихорадка",
      "dx_main": "Синдром диабетической стопы, флегмона I пальца правой стопы",
      "summary": "Вскрытие и дренирование флегмоны, некрэктомия. Рана заживает вторичным натяжением. Гликемия на инсулине короткого действия во время госпитализации.",
      "done": "Вскрытие и дренирование флегмоны, некрэктомия, перевязки",
      "dx": [["Сахарный диабет 2 типа с синдромом диабетической стопы", "E11.5", "PRIMARY", "RESOLVED"],
             ["Флегмона I пальца правой стопы", "L03.0", "SECONDARY", "RESOLVED"]],
      "proc": [[0, "Вскрытие и дренирование флегмоны I пальца", "I&D", "SURGERY", "Гнойное отделяемое, посев: S. aureus"],
               [0, "Рентгенография правой стопы", "XR-FOOT", "IMAGING", "Признаков остеомиелита нет"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 13.1, "10^9/л", 4, 10, null], [0, "Биохимия", "Глюкоза натощак", 14.6, "ммоль/л", 3.9, 6.1, null]],
      "meds": [["Цефазолин", 1, "г", "THREE_TIMES_DAILY", "IV", null, 0, 10, "COMPLETED"]],
      "plan": {
        "title": "Перевязки после хирургического лечения стопы", "days": 45, "nurse": "nurse17",
        "summary": "Уход за раной, контроль гликемии", "instructions": "Перевязки через день, разгрузка стопы",
        "call": {"state": "done", "ack_h": 2, "done_h": 8, "outcome": "VISITED", "note": "Рана чистая"},
        "visits": [[2, "HOME", "Перевязка на дому", "COMPLETED", "Рана чистая, грануляции"],
                   [14, "CLINIC", "Осмотр хирурга", "COMPLETED", "Рана 1×1 см, эпителизация"],
                   [40, "CLINIC", "Итоговый осмотр", "COMPLETED", "Рана зажила"]],
        "complete": {"after_days": 45, "note": "Рана зажила, ортопедическая обувь"}
      }
    },
    {
      "org": "endo", "doc": "saidova", "days_ago": 430, "los": 8, "status": "DISCHARGED",
      "reason": "HbA1c 10,2% несмотря на метформин, похудание, жажда",
      "dx_main": "Декомпенсация сахарного диабета 2 типа, старт инсулинотерапии",
      "summary": "Начата базальная инсулинотерапия гларгином 26 ЕД. Обучение технике инъекций и самоконтролю. Диабетическая ретинопатия по заключению окулиста.",
      "done": "Старт базальной инсулинотерапии, осмотр окулиста",
      "dx": [["Сахарный диабет 2 типа с гипергликемией", "E11.65", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "HbA1c", 10.2, "%", 4.0, 6.0, null], [0, "Биохимия", "Креатинин", 79, "мкмоль/л", 44, 80, null]],
      "plan": {
        "title": "Титрация базального инсулина", "days": 60, "nurse": "nurse17",
        "summary": "Титрация дозы по утренней гликемии", "instructions": "Глюкоза натощак ежедневно, звонок раз в неделю",
        "call": {"state": "done", "ack_h": 1, "done_h": 3, "outcome": "CONTACTED", "note": "Глюкоза натощак 9–10"},
        "visits": [[7, "CALL", "Титрация дозы", "COMPLETED", "Доза +2 ЕД"], [21, "CALL", "Титрация дозы", "COMPLETED", "Глюкоза 6,5–7,5"],
                   [45, "CLINIC", "Осмотр эндокринолога", "COMPLETED", "Цель достигнута"]],
        "home": [[3, "GLUCOSE", 9.8, null, "ммоль/л", true, "PATIENT", null], [20, "GLUCOSE", 7.1, null, "ммоль/л", false, "PATIENT", null]],
        "complete": {"after_days": 60, "note": "Гликемия натощак в цели"}
      }
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 75, "at": "07:20", "los": 3, "status": "DISCHARGED",
      "reason": "Доставлена СМП: спутанность сознания, потливость, глюкоза 2,1 ммоль/л",
      "dx_main": "Тяжёлая гипогликемия на фоне инсулинотерапии",
      "summary": "Гипогликемия после пропуска ужина при прежней дозе гларгина 26 ЕД. Купирована 40% глюкозой. Доза гларгина снижена до 22 ЕД, повторное обучение.",
      "done": "Купирование гипогликемии, коррекция инсулинотерапии",
      "dx": [["Сахарный диабет 2 типа с гипогликемией", "E11.64", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза", 2.1, "ммоль/л", 3.9, 6.1, "CRITICAL"], [1, "Биохимия", "Глюкоза натощак", 6.8, "ммоль/л", 3.9, 6.1, null]],
      "vitals": [[0, "GLUCOSE", 2.1, null, "ммоль/л", true], [0, "HEART_RATE", 108, null, "уд/мин", true], [2, "GLUCOSE", 6.4, null, "ммоль/л", false]],
      "plan": {
        "title": "Наблюдение после гипогликемии", "days": 30, "nurse": "nurse17",
        "summary": "Профилактика гипогликемий", "instructions": "Глюкоза 4 раза в день первую неделю",
        "call": {"state": "done", "ack_h": 2, "done_h": 5, "outcome": "CONTACTED", "note": "Гипогликемий нет"},
        "visits": [[3, "HOME", "Патронаж", "COMPLETED", "Глюкометр исправен, дневник ведёт"], [21, "CLINIC", "Осмотр эндокринолога", "COMPLETED", "Эпизодов гипогликемии не было"]],
        "home": [[1, "GLUCOSE", 6.2, null, "ммоль/л", false, "PATIENT", null], [5, "GLUCOSE", 7.4, null, "ммоль/л", false, "PATIENT", null]],
        "complete": {"after_days": 30, "note": "Гипогликемий не было, доза подобрана"}
      }
    }
  ]
}
$p$::jsonb);


-- 4.3 Каримов Шерзод — бронхиальная астма, анафилаксия на пенициллин,
-- аспириновая астма. Сейчас в стационаре с тяжёлой пневмонией.
select pg_temp.seed_patient($p$
{
  "pinfl": "30511795620336", "last": "Каримов", "first": "Шерзод", "born": "1979-11-05", "sex": "MALE",
  "phone": "+998917356204", "district": "г. Наманган", "address": "г. Наманган, ул. Амира Темура, 88, кв. 7",
  "clinic": "p3", "twin": "HOSPITALIZED", "risk": "HIGH", "height": 176,
  "profile": {
    "smoking": "CURRENT", "pack_years": 18, "alcohol": "OCCASIONAL", "activity": "LIGHT",
    "family": ["бронхиальная астма у матери"], "genetics": {},
    "notes": "Водитель такси. От отказа от курения отказывается."
  },
  "chronic": [
    ["Бронхиальная астма, смешанная форма, среднетяжёлое течение", "J45.8", "COMORBIDITY", "ACTIVE", 6000, null, "multi", "Аспириновая триада"],
    ["Аллергический ринит, круглогодичный", "J30.4", "COMORBIDITY", "ACTIVE", 6000, null, "p3", null],
    ["Полипозный риносинусит", "J33.8", "COMORBIDITY", "ACTIVE", 4000, null, "p3", null]
  ],
  "allergies": [
    ["Пенициллин", "Анафилактический шок в 2009 г.", "SEVERE", 6000, "multi", "Все бета-лактамы пенициллинового ряда противопоказаны"],
    ["Ацетилсалициловая кислота и НПВС", "Бронхоспазм через 30 минут после приёма", "SEVERE", 4000, "p3", "Аспириновая астма"]
  ],
  "meds": [
    ["Будесонид/формотерол", 320, "мкг", "TWICE_DAILY", "INHALATION", "160/4,5 мкг по 2 вдоха", 1500, "ACTIVE", null, "p3"],
    ["Сальбутамол", 100, "мкг", "AS_NEEDED", "INHALATION", "1–2 вдоха при приступе", 6000, "ACTIVE", null, "p3"],
    ["Монтелукаст", 10, "мг", "ONCE_DAILY", "ORAL", "Вечером", 1500, "ACTIVE", null, "p3"]
  ],
  "labs": [
    [200, "Липидный профиль", "Общий холестерин", 5.4, "ммоль/л", 3.0, 5.2, null, "p3"],
    [200, "Липидный профиль", "ЛПВП", 1.1, "ммоль/л", 1.0, 2.2, null, "p3"],
    [200, "Биохимия", "Креатинин", 88, "мкмоль/л", 62, 106, null, "p3"],
    [200, "Общий анализ крови", "Эозинофилы", 6.8, "%", 0, 5, null, "p3"],
    [200, "Иммунология", "IgE общий", 420, "МЕ/мл", 0, 100, null, "p3"]
  ],
  "obs": [
    [200, "BLOOD_PRESSURE", 128, 82, "мм рт. ст.", false, "p3"],
    [200, "WEIGHT", 86, null, "кг", false, "p3"]
  ],
  "episodes": [
    {
      "org": "multi", "doc": "isakov", "days_ago": 3600, "at": "03:15", "los": 7, "status": "DISCHARGED",
      "reason": "Приступ удушья, не купируемый сальбутамолом более 6 часов",
      "dx_main": "Астматический статус",
      "summary": "Астматический статус I стадии. Системные глюкокортикостероиды, небулайзерная терапия. Подобрана базисная терапия ИГКС.",
      "dx": [["Астматический статус", "J46", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Газы крови", "pO2", 58, "мм рт. ст.", 80, 100, null]],
      "vitals": [[0, "SPO2", 86, null, "%", true], [0, "RESPIRATORY_RATE", 30, null, "в мин", true], [5, "SPO2", 96, null, "%", false]]
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 2240, "los": 14, "status": "DISCHARGED",
      "reason": "Лихорадка 7 дней, одышка, ПЦР SARS-CoV-2 положительная",
      "dx_main": "COVID-19, двусторонняя вирусная пневмония",
      "summary": "КТ: поражение 40% (КТ-2). Кислородотерапия, дексаметазон, профилактические дозы эноксапарина. Выписан с SpO2 96%.",
      "done": "КТ органов грудной клетки, кислородотерапия",
      "dx": [["COVID-19, вирус идентифицирован", "U07.1", "PRIMARY", "RESOLVED"], ["Двусторонняя вирусная пневмония", "J12.8", "SECONDARY", "RESOLVED"]],
      "proc": [[0, "КТ органов грудной клетки", "CT-CHEST", "IMAGING", "Двусторонние изменения по типу матового стекла, 40%"]],
      "labs": [[0, "Биохимия", "СРБ", 64, "мг/л", 0, 5, null], [0, "Коагулограмма", "D-димер", 1.4, "мкг/мл", 0, 0.5, null]],
      "meds": [["Дексаметазон", 6, "мг", "ONCE_DAILY", "IV", null, 0, 10, "COMPLETED"],
               ["Эноксапарин", 40, "мг", "ONCE_DAILY", "SUBCUTANEOUS", null, 0, 14, "COMPLETED"]],
      "vitals": [[0, "SPO2", 88, null, "%", true], [0, "TEMPERATURE", 38.6, null, "°C", true], [13, "SPO2", 96, null, "%", false]],
      "plan": {
        "title": "Наблюдение после COVID-19 пневмонии", "days": 30, "nurse": "karimovaz",
        "summary": "Контроль сатурации и одышки", "instructions": "Пульсоксиметрия дважды в день",
        "call": {"state": "done", "ack_h": 3, "done_h": 10, "outcome": "CONTACTED", "note": "SpO2 95–97%"},
        "visits": [[7, "CLINIC", "Осмотр терапевта", "COMPLETED", "Хрипов нет"], [28, "CLINIC", "Контрольная рентгенография", "COMPLETED", "Остаточные изменения минимальны"]],
        "complete": {"after_days": 30, "note": "Выздоровление"}
      }
    },
    {
      "org": "central", "doc": "doc", "days_ago": 1020, "at": "19:40", "los": 4, "status": "DISCHARGED",
      "reason": "Боль в правой подвздошной области 12 часов, тошнота",
      "dx_main": "Острый флегмонозный аппендицит",
      "summary": "Лапароскопическая аппендэктомия. С учётом анафилаксии на пенициллин антибиотикопрофилактика ципрофлоксацином и метронидазолом. Послеоперационный период без осложнений.",
      "done": "Лапароскопическая аппендэктомия",
      "dx": [["Острый флегмонозный аппендицит", "K35.8", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Лапароскопическая аппендэктомия", "LAP-APP", "SURGERY", "Флегмонозный отросток, без перитонита"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 13.9, "10^9/л", 4, 10, null]],
      "meds": [["Ципрофлоксацин", 400, "мг", "TWICE_DAILY", "IV", "Вместо бета-лактамов — анафилаксия на пенициллин", 0, 3, "COMPLETED"],
               ["Метронидазол", 500, "мг", "THREE_TIMES_DAILY", "IV", null, 0, 3, "COMPLETED"]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 3, "at": "22:15", "los": null, "status": "ACTIVE",
      "reason": "Лихорадка 39,4 °C, кашель с гнойной мокротой, одышка, усиление приступов удушья",
      "dx_main": "Внебольничная пневмония нижней доли левого лёгкого, тяжёлое течение; обострение бронхиальной астмы",
      "dx": [["Внебольничная пневмония нижней доли левого лёгкого, тяжёлое течение", "J18.1", "PRIMARY", "ACTIVE"],
             ["Обострение бронхиальной астмы", "J45.8", "COMPLICATION", "ACTIVE"],
             ["Дыхательная недостаточность I степени", "J96.0", "COMPLICATION", "ACTIVE"]],
      "proc": [[0, "Рентгенография органов грудной клетки", "XR-CHEST", "IMAGING", "Инфильтрация нижней доли слева, плеврального выпота нет"],
               [1, "Посев мокроты", "SPUTUM-CX", "DIAGNOSTIC", "Streptococcus pneumoniae, чувствителен к левофлоксацину"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 16.8, "10^9/л", 4, 10, null],
               [0, "Биохимия", "СРБ", 148, "мг/л", 0, 5, null],
               [0, "Биохимия", "Прокальцитонин", 1.8, "нг/мл", 0, 0.5, null],
               [0, "Биохимия", "Креатинин", 94, "мкмоль/л", 62, 106, null],
               [2, "Общий анализ крови", "Лейкоциты", 11.2, "10^9/л", 4, 10, null],
               [2, "Биохимия", "СРБ", 72, "мг/л", 0, 5, null]],
      "meds": [["Левофлоксацин", 750, "мг", "ONCE_DAILY", "IV", "Бета-лактамы противопоказаны: анафилаксия на пенициллин", 0, null, "ACTIVE"],
               ["Преднизолон", 30, "мг", "ONCE_DAILY", "ORAL", "5 дней", 0, null, "ACTIVE"],
               ["Эноксапарин", 40, "мг", "ONCE_DAILY", "SUBCUTANEOUS", "Профилактика ВТЭ", 0, null, "ACTIVE"],
               ["Ипратропия бромид/фенотерол", 2, "мл", "FOUR_TIMES_DAILY", "INHALATION", "Через небулайзер", 0, null, "ACTIVE"]],
      "vitals": [[0, "TEMPERATURE", 39.4, null, "°C", true], [0, "SPO2", 89, null, "%", true], [0, "RESPIRATORY_RATE", 28, null, "в мин", true],
                 [0, "HEART_RATE", 118, null, "уд/мин", true], [0, "BLOOD_PRESSURE", 124, 76, "мм рт. ст.", false],
                 [1, "TEMPERATURE", 38.4, null, "°C", true], [1, "SPO2", 91, null, "%", true],
                 [2, "TEMPERATURE", 37.6, null, "°C", false], [2, "SPO2", 94, null, "%", false], [2, "HEART_RATE", 92, null, "уд/мин", false]]
    }
  ]
}
$p$::jsonb);


-- 4.4 Юлдашева Гульнора — гипотиреоз, гестационный диабет в анамнезе,
-- аллергия на латекс. Последнее обращение завершено (холецистэктомия).
select pg_temp.seed_patient($p$
{
  "pinfl": "41902856280512", "last": "Юлдашева", "first": "Гульнора", "born": "1985-02-19", "sex": "FEMALE",
  "phone": "+998946108372", "district": "Чустский район", "address": "Чустский район, г. Чуст, ул. Мустакиллик, 41",
  "clinic": "p5", "twin": "STABLE", "risk": "LOW", "height": 162,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "NONE", "activity": "MODERATE",
    "family": ["сахарный диабет 2 типа у матери", "гипотиреоз у сестры"], "genetics": {},
    "notes": "Учитель. Двое детей."
  },
  "chronic": [
    ["Аутоиммунный тиреоидит, гипотиреоз", "E06.3", "COMORBIDITY", "ACTIVE", 2900, null, "p5", "Компенсирован на левотироксине"],
    ["Желчнокаменная болезнь", "K80.2", "SECONDARY", "RESOLVED", 400, 22, "p5", "Холецистэктомия"]
  ],
  "allergies": [
    ["Латекс", "Контактный дерматит от перчаток", "MILD", 2029, "central", "Использовать безлатексные перчатки"]
  ],
  "meds": [
    ["Левотироксин натрия", 75, "мкг", "ONCE_DAILY", "ORAL", "Натощак за 30 минут до еды", 2890, "ACTIVE", null, "p5"]
  ],
  "labs": [
    [2900, "Гормоны", "ТТГ", 9.8, "мЕд/л", 0.4, 4.0, null, "p5"],
    [1000, "Гормоны", "ТТГ", 2.4, "мЕд/л", 0.4, 4.0, null, "p5"],
    [180, "Гормоны", "ТТГ", 3.1, "мЕд/л", 0.4, 4.0, null, "p5"],
    [180, "Липидный профиль", "Общий холестерин", 4.6, "ммоль/л", 3.0, 5.2, null, "p5"],
    [180, "Липидный профиль", "ЛПВП", 1.5, "ммоль/л", 1.2, 2.2, null, "p5"],
    [180, "Биохимия", "Креатинин", 68, "мкмоль/л", 44, 80, null, "p5"],
    [180, "Биохимия", "Глюкоза натощак", 5.3, "ммоль/л", 3.9, 6.1, null, "p5"],
    [180, "Биохимия", "HbA1c", 5.6, "%", 4.0, 6.0, null, "p5"]
  ],
  "obs": [
    [180, "BLOOD_PRESSURE", 116, 74, "мм рт. ст.", false, "p5"],
    [180, "WEIGHT", 64, null, "кг", false, "p5"]
  ],
  "episodes": [
    {
      "org": "central", "doc": "olimova", "days_ago": 2030, "at": "04:30", "los": 4, "status": "DISCHARGED",
      "reason": "Беременность 39 недель, начало родовой деятельности; гестационный сахарный диабет на диете",
      "dx_main": "Роды в срок, гестационный сахарный диабет",
      "summary": "Самопроизвольные роды, мальчик 3650 г. Контактный дерматит на латексные перчатки — отмечено в карте. Гликемия после родов нормализовалась, рекомендован ОГТТ через 6–12 недель.",
      "done": "Самопроизвольные роды",
      "dx": [["Сахарный диабет, возникший во время беременности", "O24.4", "PRIMARY", "RESOLVED"], ["Роды одноплодные, самопроизвольные", "O80", "SECONDARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза натощак", 6.4, "ммоль/л", 3.9, 5.1, null], [2, "Биохимия", "Глюкоза натощак", 4.9, "ммоль/л", 3.9, 6.1, null]]
    },
    {
      "org": "multi", "doc": "hakimov", "days_ago": 980, "at": "01:20", "los": 3, "status": "DISCHARGED",
      "reason": "Острая боль в пояснице справа с иррадиацией в пах, рвота",
      "dx_main": "Почечная колика справа, мочекаменная болезнь",
      "summary": "Конкремент нижней трети правого мочеточника 5 мм. Спазмолитики, камень отошёл самостоятельно на 2-е сутки.",
      "dx": [["Почечная колика", "N20.0", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "УЗИ почек и мочевыводящих путей", "US-KIDNEY", "IMAGING", "Конкремент 5 мм в н/3 правого мочеточника, пиелоэктазия"]],
      "labs": [[0, "Общий анализ мочи", "Эритроциты в моче", 25, "в п/зр", 0, 2, null]]
    },
    {
      "org": "medior", "doc": "rashidov", "days_ago": 26, "at": "08:00", "los": 4, "status": "DISCHARGED",
      "reason": "Плановая госпитализация: рецидивирующие приступы желчной колики",
      "dx_main": "Хронический калькулёзный холецистит",
      "summary": "Лапароскопическая холецистэктомия (безлатексный протокол). Послеоперационный период без осложнений. Швы снять на 10-е сутки.",
      "done": "Лапароскопическая холецистэктомия",
      "dx": [["Хронический калькулёзный холецистит", "K80.1", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Лапароскопическая холецистэктомия", "LAP-CHOLE", "SURGERY", "Без осложнений, дренаж удалён на 2-е сутки"]],
      "labs": [[0, "Биохимия", "Билирубин общий", 14, "мкмоль/л", 3.4, 20.5, null], [0, "Биохимия", "АЛТ", 22, "Ед/л", 0, 33, null]],
      "plan": {
        "title": "Послеоперационное наблюдение", "days": 14, "nurse": "ergasheva",
        "summary": "Контроль ран", "instructions": "Осмотр ран на 3-и сутки, снятие швов на 10-е",
        "call": {"state": "done", "ack_h": 2, "done_h": 5, "outcome": "CONTACTED", "note": "Боли минимальные, температура нормальная"},
        "visits": [[3, "HOME", "Осмотр послеоперационных ран", "COMPLETED", "Раны чистые, сухие"],
                   [10, "CLINIC", "Снятие швов", "COMPLETED", "Швы сняты, заживление первичным натяжением"]],
        "home": [[1, "TEMPERATURE", 37.1, null, "°C", false, "PATIENT", null], [2, "PAIN", 3, null, null, false, "PATIENT", null]],
        "complete": {"after_days": 14, "note": "Раны зажили первичным натяжением, жалоб нет"}
      }
    }
  ]
}
$p$::jsonb);


-- 4.5 Эргашев Бахром — АГ, ИБС, курение; ЖКК на клопидогреле.
-- Сейчас после инсульта и реабилитации: активный вызов просрочен.
select pg_temp.seed_patient($p$
{
  "pinfl": "33009625620245", "last": "Эргашев", "first": "Бахром", "born": "1962-09-30", "sex": "MALE",
  "phone": "+998977293116", "district": "г. Наманган", "address": "г. Наманган, махалля Янгиобод, ул. Истиклол, 7",
  "clinic": "p17", "twin": "POST_DISCHARGE_MONITORING", "risk": "HIGH", "height": 174,
  "profile": {
    "smoking": "CURRENT", "pack_years": 35, "alcohol": "REGULAR", "activity": "SEDENTARY",
    "family": ["инсульт у отца в 64 года", "гипертоническая болезнь у матери"],
    "genetics": {"MTHFR C677T": "risk"},
    "notes": "Пенсионер. Живёт с сыном, передвигается с тростью после инсульта."
  },
  "chronic": [
    ["Гипертоническая болезнь III стадии", "I10", "COMORBIDITY", "ACTIVE", 5000, null, "p17", null],
    ["ИБС: стабильная стенокардия напряжения ФК II", "I20.8", "COMORBIDITY", "ACTIVE", 1600, null, "rkc", null],
    ["Гиперлипидемия", "E78.0", "COMORBIDITY", "ACTIVE", 1600, null, "p17", null],
    ["Язвенная болезнь желудка", "K25.7", "COMORBIDITY", "ACTIVE", 1150, null, "multi", "Кровотечение в 2023 г."],
    ["Атеросклероз сонных артерий, стеноз левой ВСА 55%", "I65.2", "COMORBIDITY", "ACTIVE", 32, null, "central", null]
  ],
  "allergies": [
    ["Клопидогрел", "Желудочно-кишечное кровотечение из язвы желудка на фоне приёма", "SEVERE", 1150, "multi", "Непереносимость, повторно не назначать"]
  ],
  "meds": [
    ["Амлодипин", 10, "мг", "ONCE_DAILY", "ORAL", null, 2100, "ACTIVE", null, "p17"],
    ["Периндоприл", 8, "мг", "ONCE_DAILY", "ORAL", null, 2100, "ACTIVE", null, "p17"],
    ["Розувастатин", 20, "мг", "ONCE_DAILY", "ORAL", "Вечером", 1590, "ACTIVE", null, "rkc"],
    ["Пантопразол", 40, "мг", "ONCE_DAILY", "ORAL", "Утром натощак, постоянно", 1140, "ACTIVE", null, "multi"],
    ["Клопидогрел", 75, "мг", "ONCE_DAILY", "ORAL", "Отменён: желудочно-кишечное кровотечение", 1595, "STOPPED", 1150, "rkc"]
  ],
  "labs": [
    [150, "Липидный профиль", "Общий холестерин", 6.6, "ммоль/л", 3.0, 5.2, null, "p17"],
    [150, "Липидный профиль", "ЛПВП", 0.88, "ммоль/л", 1.0, 2.2, null, "p17"],
    [150, "Липидный профиль", "ЛПНП", 4.4, "ммоль/л", 0, 1.8, null, "p17"],
    [150, "Липидный профиль", "Триглицериды", 2.9, "ммоль/л", 0, 1.7, null, "p17"],
    [150, "Биохимия", "Глюкоза натощак", 5.9, "ммоль/л", 3.9, 6.1, null, "p17"],
    [150, "Биохимия", "HbA1c", 5.9, "%", 4.0, 6.0, null, "p17"]
  ],
  "obs": [
    [150, "BLOOD_PRESSURE", 168, 102, "мм рт. ст.", true, "p17"],
    [150, "WEIGHT", 91, null, "кг", false, "p17"]
  ],
  "episodes": [
    {
      "org": "central", "doc": "olimova", "days_ago": 2150, "at": "20:05", "los": 4, "status": "DISCHARGED",
      "reason": "Головная боль, носовое кровотечение, АД 210/120 мм рт. ст.",
      "dx_main": "Гипертонический криз",
      "summary": "Криз купирован. Назначены амлодипин и периндоприл. Настоятельно рекомендован отказ от курения и алкоголя.",
      "dx": [["Гипертонический криз неосложнённый", "I10", "PRIMARY", "RESOLVED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 210, 120, "мм рт. ст.", true], [3, "BLOOD_PRESSURE", 146, 90, "мм рт. ст.", true]]
    },
    {
      "org": "rkc", "doc": "kurbanov", "days_ago": 1600, "los": 5, "status": "DISCHARGED",
      "reason": "Плановая госпитализация: давящие боли за грудиной при подъёме на 2 этаж",
      "dx_main": "ИБС: стабильная стенокардия напряжения ФК II",
      "summary": "Коронарография: стеноз ПКА 60%, гемодинамически незначимый по FFR (0,86). Показана оптимальная медикаментозная терапия. Назначены розувастатин и клопидогрел.",
      "done": "Коронарография с оценкой FFR",
      "dx": [["Стабильная стенокардия напряжения ФК II", "I20.8", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Коронарография с измерением FFR", "CAG-FFR", "DIAGNOSTIC", "Стеноз ПКА 60%, FFR 0,86 — стентирование не показано"]],
      "labs": [[0, "Липидный профиль", "ЛПНП", 4.9, "ммоль/л", 0, 1.8, null], [0, "Кардиомаркеры", "Тропонин I", 0.01, "нг/мл", 0, 0.04, null]]
    },
    {
      "org": "multi", "doc": "hakimov", "days_ago": 1150, "at": "06:30", "los": 9, "status": "DISCHARGED",
      "reason": "Рвота «кофейной гущей», мелена, слабость, головокружение",
      "dx_main": "Кровотечение из язвы желудка",
      "summary": "ФГДС: язва угла желудка 1,2 см с тромбированным сосудом (Forrest IIa) — эндоскопический гемостаз. Hb 78 г/л, перелито 2 дозы эритроцитарной массы. Кровотечение связано с приёмом клопидогрела — препарат отменён, внесён в непереносимость. Назначен пантопразол постоянно.",
      "done": "ФГДС с эндоскопическим гемостазом, гемотрансфузия",
      "dx": [["Острая язва желудка с кровотечением", "K25.0", "PRIMARY", "RESOLVED"], ["Постгеморрагическая анемия", "D62", "COMPLICATION", "RESOLVED"]],
      "proc": [[0, "ФГДС с эндоскопическим гемостазом", "EGD-HEMOSTASIS", "THERAPEUTIC", "Язва угла желудка 1,2 см, Forrest IIa, гемостаз достигнут"],
               [0, "Трансфузия эритроцитарной массы", "TRANSFUSION", "THERAPEUTIC", "2 дозы, без реакций"]],
      "labs": [[0, "Общий анализ крови", "Гемоглобин", 78, "г/л", 130, 170, "CRITICAL"], [3, "Общий анализ крови", "Гемоглобин", 98, "г/л", 130, 170, null],
               [8, "Общий анализ крови", "Гемоглобин", 112, "г/л", 130, 170, null]],
      "meds": [["Пантопразол", 80, "мг", "TWICE_DAILY", "IV", null, 0, 4, "COMPLETED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 92, 54, "мм рт. ст.", true], [0, "HEART_RATE", 118, null, "уд/мин", true], [8, "BLOOD_PRESSURE", 136, 84, "мм рт. ст.", false]],
      "plan": {
        "title": "Наблюдение после желудочного кровотечения", "days": 30, "nurse": "nurse17",
        "summary": "Контроль гемоглобина, приверженность ИПП", "instructions": "Hb через 2 недели, контрольная ФГДС через 6 недель",
        "call": {"state": "done", "ack_h": 2, "done_h": 12, "outcome": "CONTACTED", "note": "Стул нормальный, слабость уменьшилась"},
        "visits": [[14, "CLINIC", "Контроль гемоглобина", "COMPLETED", "Hb 124 г/л"]],
        "complete": {"after_days": 30, "note": "Анемия корригирована"}
      }
    },
    {
      "org": "central", "doc": "turdiev", "days_ago": 32, "at": "09:50", "los": 14, "dis_at": "12:00", "status": "TRANSFERRED",
      "reason": "Внезапная слабость в правых конечностях и нарушение речи, начало за 2 часа до поступления",
      "dx_main": "Ишемический инсульт в бассейне левой средней мозговой артерии",
      "summary": "Поступил в терапевтическое окно, NIHSS 12. Системный тромболизис алтеплазой — частичный регресс, NIHSS 6 к выписке. Атеротромботический подтип: стеноз левой ВСА 55%. Клопидогрел противопоказан (ЖКК в анамнезе) — назначена ацетилсалициловая кислота на фоне пантопразола. Сохраняются умеренный правосторонний гемипарез и моторная афазия. Переведён на раннюю реабилитацию.",
      "done": "КТ и МРТ головного мозга, системный тромболизис, дуплексное сканирование БЦА",
      "dx": [["Ишемический инсульт в бассейне левой СМА, атеротромботический подтип", "I63.3", "PRIMARY", "ACTIVE"],
             ["Правосторонний гемипарез", "G81.9", "COMPLICATION", "ACTIVE"],
             ["Моторная афазия", "R47.0", "COMPLICATION", "ACTIVE"]],
      "proc": [[0, "КТ головного мозга", "CT-HEAD", "IMAGING", "Ранние признаки ишемии в бассейне левой СМА, геморрагии нет"],
               [0, "Системный тромболизис алтеплазой", "IV-TPA", "THERAPEUTIC", "NIHSS 12 → 8 через 24 часа"],
               [2, "МРТ головного мозга", "MRI-HEAD", "IMAGING", "Инфаркт в лобно-височной области слева, 3,5 см"],
               [3, "Дуплексное сканирование брахиоцефальных артерий", "US-CAROTID", "IMAGING", "Стеноз левой ВСА 55%, бляшка гетерогенная"]],
      "labs": [[0, "Коагулограмма", "МНО", 1.0, "", 0.8, 1.2, null], [0, "Биохимия", "Глюкоза", 6.8, "ммоль/л", 3.9, 6.1, null],
               [1, "Липидный профиль", "Общий холестерин", 6.3, "ммоль/л", 3.0, 5.2, null], [1, "Липидный профиль", "ЛПНП", 4.1, "ммоль/л", 0, 1.4, null],
               [1, "Липидный профиль", "ЛПВП", 0.9, "ммоль/л", 1.0, 2.2, null], [1, "Биохимия", "Креатинин", 96, "мкмоль/л", 62, 106, null]],
      "meds": [["Алтеплаза", 81, "мг", "OTHER", "IV", "0,9 мг/кг, однократно", 0, 0, "COMPLETED"],
               ["Ацетилсалициловая кислота", 100, "мг", "ONCE_DAILY", "ORAL", "Через 24 ч после тромболизиса. Клопидогрел противопоказан", 1, null, "ACTIVE"],
               ["Розувастатин", 40, "мг", "ONCE_DAILY", "ORAL", "Доза увеличена", 1, null, "ACTIVE"]],
      "vitals": [[0, "BLOOD_PRESSURE", 178, 98, "мм рт. ст.", true], [1, "BLOOD_PRESSURE", 162, 94, "мм рт. ст.", true], [13, "BLOOD_PRESSURE", 148, 88, "мм рт. ст.", true]]
    },
    {
      "org": "shifo", "doc": "nazirova", "days_ago": 18, "at": "13:30", "los": 15, "status": "DISCHARGED",
      "reason": "Перевод для ранней реабилитации после ишемического инсульта",
      "dx_main": "Реабилитация после ишемического инсульта",
      "summary": "Кинезиотерапия, занятия с логопедом, эрготерапия. Ходит с тростью на 150 м, речь улучшилась (отдельные фразы). Шкала Рэнкин 3. АД на терапии 140–155/85–92 — требуется коррекция. Курит — повторно проведена беседа.",
      "done": "Кинезиотерапия, логопедические занятия, эрготерапия",
      "dx": [["Последствия ишемического инсульта: правосторонний гемипарез, моторная афазия", "I69.3", "PRIMARY", "ACTIVE"]],
      "proc": [[1, "Оценка по шкале Рэнкин", "MRS", "DIAGNOSTIC", "4 балла"], [14, "Оценка по шкале Рэнкин", "MRS", "DIAGNOSTIC", "3 балла"]],
      "vitals": [[1, "BLOOD_PRESSURE", 152, 92, "мм рт. ст.", true], [14, "BLOOD_PRESSURE", 146, 88, "мм рт. ст.", true]],
      "plan": {
        "title": "Наблюдение после инсульта", "days": 60, "nurse": "nurse17",
        "summary": "Вторичная профилактика инсульта, контроль АД, реабилитация на дому",
        "instructions": "АД дважды в день, цель < 130/80. Патронаж на 1-е сутки, невролог через неделю.",
        "call": {"state": "pending"},
        "visits": [[1, "HOME", "Первичный патронаж после инсульта", "MISSED", "Дверь не открыли, телефон пациента не отвечает"],
                   [7, "CLINIC", "Осмотр невролога", "PLANNED", null],
                   [14, "HOME", "Патронаж: АД, речь, двигательный режим", "PLANNED", null],
                   [30, "CLINIC", "Осмотр невролога и кардиолога", "PLANNED", null]],
        "home": [[1, "BLOOD_PRESSURE", 158, 96, "мм рт. ст.", true, "PATIENT", "Измерил сын"],
                 [2, "BLOOD_PRESSURE", 164, 98, "мм рт. ст.", true, "PATIENT", "Головная боль"]]
      }
    }
  ]
}
$p$::jsonb);


-- 4.6 Абдурахмонова Муниса — сахарный диабет 1 типа, лабильное течение,
-- повторные кетоацидозы; аллергия на цефтриаксон.
select pg_temp.seed_patient($p$
{
  "pinfl": "40805946280118", "last": "Абдурахмонова", "first": "Муниса", "born": "1994-05-08", "sex": "FEMALE",
  "phone": "+998996452017", "district": "г. Наманган", "address": "г. Наманган, ул. Машраба, 55, кв. 19",
  "clinic": "p3", "twin": "STABLE", "risk": "MEDIUM", "height": 160,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "NONE", "activity": "ACTIVE",
    "family": ["сахарный диабет 1 типа у двоюродного брата"],
    "genetics": {"HLA-DR3/DR4": "risk"},
    "notes": "Студентка магистратуры. Пропускает инъекции во время сессий."
  },
  "chronic": [
    ["Сахарный диабет 1 типа", "E10.9", "COMORBIDITY", "ACTIVE", 7400, null, "endo", "С 12 лет, лабильное течение"],
    ["Диабетическая нефропатия, стадия микроальбуминурии", "E10.2", "COMPLICATION", "ACTIVE", 600, null, "endo", null]
  ],
  "allergies": [
    ["Цефтриаксон", "Генерализованная крапивница", "MODERATE", 2298, "multi", null]
  ],
  "meds": [
    ["Инсулин деглудек", 18, "ЕД", "ONCE_DAILY", "SUBCUTANEOUS", "В одно и то же время", 1490, "ACTIVE", null, "endo"],
    ["Инсулин аспарт", null, "ЕД", "THREE_TIMES_DAILY", "SUBCUTANEOUS", "4–8 ЕД перед едой по углеводам (1 ЕД на 12 г)", 1490, "ACTIVE", null, "endo"]
  ],
  "labs": [
    [2300, "Биохимия", "HbA1c", 10.8, "%", 4.0, 6.0, null, "p3"],
    [1500, "Биохимия", "HbA1c", 9.2, "%", 4.0, 6.0, null, "p3"],
    [800, "Биохимия", "HbA1c", 8.7, "%", 4.0, 6.0, null, "p3"],
    [300, "Биохимия", "HbA1c", 9.9, "%", 4.0, 6.0, null, "p3"],
    [10, "Биохимия", "HbA1c", 8.9, "%", 4.0, 6.0, null, "p3"],
    [10, "Липидный профиль", "Общий холестерин", 4.4, "ммоль/л", 3.0, 5.2, null, "p3"],
    [10, "Липидный профиль", "ЛПВП", 1.6, "ммоль/л", 1.2, 2.2, null, "p3"],
    [10, "Биохимия", "Креатинин", 70, "мкмоль/л", 44, 80, null, "p3"],
    [10, "Общий анализ мочи", "Альбумин в моче", 42, "мг/л", 0, 30, null, "p3"]
  ],
  "obs": [
    [10, "BLOOD_PRESSURE", 112, 70, "мм рт. ст.", false, "p3"],
    [10, "WEIGHT", 55, null, "кг", false, "p3"]
  ],
  "episodes": [
    {
      "org": "multi", "doc": "isakov", "days_ago": 2300, "at": "02:10", "los": 6, "status": "DISCHARGED",
      "reason": "Рвота, боль в животе, дыхание Куссмауля на фоне ОРВИ и пропуска инсулина",
      "dx_main": "Диабетический кетоацидоз",
      "summary": "ДКА средней тяжести, провоцирующий фактор — ОРВИ с пропуском инсулина. Инфузионная терапия, внутривенный инсулин. На цефтриаксон (по поводу бронхита) — генерализованная крапивница, препарат заменён.",
      "dx": [["Сахарный диабет 1 типа с кетоацидозом", "E10.1", "PRIMARY", "RESOLVED"], ["Крапивница на цефтриаксон", "L50.0", "COMPLICATION", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза", 26.4, "ммоль/л", 3.9, 6.1, "CRITICAL"], [0, "Газы крови", "pH", 7.14, "", 7.35, 7.45, "CRITICAL"],
               [0, "Биохимия", "Калий", 5.6, "ммоль/л", 3.5, 5.1, null]],
      "meds": [["Цефтриаксон", 1, "г", "ONCE_DAILY", "IV", "Отменён — крапивница", 1, 2, "STOPPED"]]
    },
    {
      "org": "endo", "doc": "saidova", "days_ago": 1500, "los": 5, "status": "DISCHARGED",
      "reason": "Плановая госпитализация: частые гипо- и гипергликемии",
      "dx_main": "Сахарный диабет 1 типа, лабильное течение, декомпенсация",
      "summary": "Переведена на аналоги инсулина (деглудек + аспарт), обучение подсчёту углеводов.",
      "dx": [["Сахарный диабет 1 типа с гипергликемией", "E10.65", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "HbA1c", 9.2, "%", 4.0, 6.0, null]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 800, "at": "06:50", "los": 3, "status": "DISCHARGED",
      "reason": "Найдена соседкой без сознания, глюкоза 1,8 ммоль/л",
      "dx_main": "Тяжёлая гипогликемия с потерей сознания",
      "summary": "Гипогликемическая кома после интенсивной тренировки без коррекции дозы. Сознание восстановлено после 40% глюкозы. Обучение по физическим нагрузкам, выдан глюкагон.",
      "dx": [["Сахарный диабет 1 типа с гипогликемической комой", "E10.0", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза", 1.8, "ммоль/л", 3.9, 6.1, "CRITICAL"]]
    },
    {
      "org": "endo", "doc": "saidova", "days_ago": 50, "at": "23:40", "los": 5, "status": "DISCHARGED",
      "reason": "Жажда, рвота, слабость; пропуск инсулина во время экзаменов",
      "dx_main": "Диабетический кетоацидоз средней тяжести",
      "summary": "pH 7,18, глюкоза 24,6 ммоль/л, бета-гидроксибутират 4,8 ммоль/л. Купирован за 18 часов. Повторное обучение, психологическая консультация. Цефалоспорины не назначались (аллергия на цефтриаксон).",
      "done": "Инфузионная терапия, внутривенная инсулинотерапия, обучение",
      "dx": [["Сахарный диабет 1 типа с кетоацидозом", "E10.1", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Глюкоза", 24.6, "ммоль/л", 3.9, 6.1, "CRITICAL"], [0, "Газы крови", "pH", 7.18, "", 7.35, 7.45, "CRITICAL"],
               [0, "Биохимия", "Бета-гидроксибутират", 4.8, "ммоль/л", 0, 0.6, "CRITICAL"], [0, "Биохимия", "Калий", 5.3, "ммоль/л", 3.5, 5.1, null],
               [2, "Биохимия", "Калий", 3.8, "ммоль/л", 3.5, 5.1, null]],
      "vitals": [[0, "GLUCOSE", 24.6, null, "ммоль/л", true], [0, "HEART_RATE", 116, null, "уд/мин", true], [4, "GLUCOSE", 7.9, null, "ммоль/л", false]],
      "plan": {
        "title": "Наблюдение после кетоацидоза", "days": 30, "nurse": "karimovaz",
        "summary": "Приверженность инсулинотерапии", "instructions": "Дневник гликемии, звонок каждую неделю",
        "call": {"state": "done", "ack_h": 1, "done_h": 4, "outcome": "CONTACTED", "note": "Инсулин вводит, глюкоза 7–11"},
        "visits": [[7, "CALL", "Контроль дневника гликемии", "COMPLETED", "Пропусков нет"],
                   [21, "CLINIC", "Осмотр эндокринолога", "COMPLETED", "Школа диабета пройдена повторно"]],
        "home": [[2, "GLUCOSE", 11.2, null, "ммоль/л", true, "PATIENT", null], [9, "GLUCOSE", 8.4, null, "ммоль/л", false, "PATIENT", null],
                 [20, "GLUCOSE", 7.1, null, "ммоль/л", false, "PATIENT", null]],
        "complete": {"after_days": 30, "note": "Гликемия 6–11 ммоль/л, обучение пройдено"}
      }
    }
  ]
}
$p$::jsonb);


-- 4.7 Хасанов Равшан — язвенная болезнь, алкогольный панкреатит;
-- агранулоцитоз на метамизол. Низкая приверженность: не дозвонились.
select pg_temp.seed_patient($p$
{
  "pinfl": "31212715620409", "last": "Хасанов", "first": "Равшан", "born": "1971-12-12", "sex": "MALE",
  "phone": "+998906637451", "district": "Чустский район", "address": "Чустский район, кишлак Гова, ул. Навбахор, 14",
  "clinic": "p5", "twin": "STABLE", "risk": "MEDIUM", "height": 175,
  "profile": {
    "smoking": "CURRENT", "pack_years": 20, "alcohol": "HEAVY", "activity": "SEDENTARY",
    "family": ["цирроз печени у отца"], "genetics": {},
    "notes": "Строитель, работает сезонно в Казахстане. Консультации нарколога избегает."
  },
  "chronic": [
    ["Язвенная болезнь двенадцатиперстной кишки", "K26.7", "COMORBIDITY", "ACTIVE", 3000, null, "multi", "Перфорация в 2021 г."],
    ["Хронический панкреатит алкогольной этиологии", "K86.0", "COMORBIDITY", "ACTIVE", 700, null, "multi", null],
    ["Жировой гепатоз", "K76.0", "COMORBIDITY", "ACTIVE", 700, null, "multi", null],
    ["Гипертоническая болезнь II стадии", "I10", "COMORBIDITY", "ACTIVE", 1500, null, "p5", null]
  ],
  "allergies": [
    ["Метамизол натрия", "Агранулоцитоз в 2014 г.", "SEVERE", 4400, "multi", "Противопоказан пожизненно"]
  ],
  "meds": [
    ["Омепразол", 20, "мг", "ONCE_DAILY", "ORAL", "Утром натощак", 1840, "ACTIVE", null, "multi"],
    ["Панкреатин", 25000, "ЕД", "THREE_TIMES_DAILY", "ORAL", "Во время еды", 690, "ACTIVE", null, "multi"],
    ["Лизиноприл", 10, "мг", "ONCE_DAILY", "ORAL", null, 1490, "ACTIVE", null, "p5"]
  ],
  "labs": [
    [60, "Биохимия", "АЛТ", 68, "Ед/л", 0, 41, null, "p5"],
    [60, "Биохимия", "АСТ", 74, "Ед/л", 0, 40, null, "p5"],
    [60, "Биохимия", "ГГТ", 212, "Ед/л", 0, 55, null, "p5"],
    [60, "Биохимия", "Липаза", 58, "Ед/л", 0, 60, null, "p5"],
    [60, "Липидный профиль", "Общий холестерин", 5.2, "ммоль/л", 3.0, 5.2, null, "p5"],
    [60, "Липидный профиль", "ЛПВП", 1.3, "ммоль/л", 1.0, 2.2, null, "p5"],
    [60, "Биохимия", "Креатинин", 90, "мкмоль/л", 62, 106, null, "p5"],
    [60, "Общий анализ крови", "Гемоглобин", 128, "г/л", 130, 170, null, "p5"],
    [60, "Общий анализ крови", "Нейтрофилы", 3.1, "10^9/л", 1.8, 7.7, null, "p5"]
  ],
  "obs": [
    [60, "BLOOD_PRESSURE", 146, 92, "мм рт. ст.", true, "p5"],
    [60, "WEIGHT", 78, null, "кг", false, "p5"]
  ],
  "episodes": [
    {
      "org": "multi", "doc": "isakov", "days_ago": 4400, "los": 12, "status": "DISCHARGED",
      "reason": "Лихорадка 40 °C, боль в горле, язвы во рту после самостоятельного приёма анальгина",
      "dx_main": "Агранулоцитоз, индуцированный метамизолом",
      "summary": "Нейтрофилы 0,2×10⁹/л. Изоляция, антибиотики широкого спектра, Г-КСФ. Восстановление нейтрофилов на 9-е сутки. Метамизол противопоказан пожизненно.",
      "dx": [["Лекарственный агранулоцитоз", "D70", "PRIMARY", "RESOLVED"], ["Некротическая ангина", "J03.8", "COMPLICATION", "RESOLVED"]],
      "labs": [[0, "Общий анализ крови", "Нейтрофилы", 0.2, "10^9/л", 1.8, 7.7, "CRITICAL"], [10, "Общий анализ крови", "Нейтрофилы", 2.4, "10^9/л", 1.8, 7.7, null]]
    },
    {
      "org": "multi", "doc": "hakimov", "days_ago": 1850, "at": "01:05", "los": 8, "status": "DISCHARGED",
      "reason": "Внезапная «кинжальная» боль в эпигастрии, доскообразный живот",
      "dx_main": "Прободная язва двенадцатиперстной кишки",
      "summary": "Экстренная лапаротомия, ушивание перфоративного отверстия. Эрадикация H. pylori. Послеоперационный период без осложнений. Обезболивание без метамизола (агранулоцитоз в анамнезе).",
      "done": "Лапаротомия, ушивание прободной язвы",
      "dx": [["Прободная язва двенадцатиперстной кишки", "K26.5", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Лапаротомия, ушивание прободной язвы ДПК", "LAP-ULCER", "SURGERY", "Перфорация 4 мм, местный перитонит"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 17.4, "10^9/л", 4, 10, null]],
      "meds": [["Трамадол", 50, "мг", "AS_NEEDED", "IM", "Метамизол противопоказан", 0, 4, "COMPLETED"]]
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 700, "los": 10, "status": "DISCHARGED",
      "reason": "Опоясывающая боль в животе после употребления алкоголя, многократная рвота",
      "dx_main": "Острый алкогольный панкреатит",
      "summary": "Отёчная форма панкреатита, липаза 1840 Ед/л. Консервативная терапия. Рекомендован полный отказ от алкоголя.",
      "done": "КТ брюшной полости, консервативная терапия",
      "dx": [["Острый алкогольный панкреатит", "K85.2", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "КТ брюшной полости с контрастом", "CT-ABD", "IMAGING", "Отёк поджелудочной железы, некроза нет"]],
      "labs": [[0, "Биохимия", "Липаза", 1840, "Ед/л", 0, 60, "CRITICAL"], [0, "Биохимия", "АЛТ", 96, "Ед/л", 0, 41, null],
               [7, "Биохимия", "Липаза", 88, "Ед/л", 0, 60, null]],
      "plan": {
        "title": "Наблюдение после острого панкреатита", "days": 30, "nurse": "ergasheva",
        "summary": "Отказ от алкоголя, диета", "instructions": "Осмотр через 2 недели, липаза",
        "call": {"state": "done", "ack_h": 4, "done_h": 20, "outcome": "CONTACTED", "note": "Связались с женой"},
        "visits": [[14, "CLINIC", "Осмотр терапевта", "COMPLETED", "Боли нет, липаза в норме"]],
        "complete": {"after_days": 30, "note": "Амилаза в норме. От консультации нарколога отказался"}
      }
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 40, "at": "18:25", "los": 6, "status": "DISCHARGED",
      "reason": "Боль в эпигастрии с иррадиацией в спину, тошнота, стеаторея",
      "dx_main": "Обострение хронического панкреатита",
      "summary": "Обострение после употребления алкоголя. Инфузионная терапия, ферменты. АЛТ, ГГТ повышены. Обезболивание без метамизола. Выписан с рекомендацией отказа от алкоголя — пациент мотивацию не демонстрирует.",
      "dx": [["Обострение хронического панкреатита", "K86.0", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Липаза", 312, "Ед/л", 0, 60, null], [0, "Биохимия", "ГГТ", 286, "Ед/л", 0, 55, null], [5, "Биохимия", "Липаза", 74, "Ед/л", 0, 60, null]],
      "plan": {
        "title": "Наблюдение после обострения панкреатита", "days": 21, "nurse": "ergasheva",
        "summary": "Контроль боли и приверженности", "instructions": "Патронаж на 5-е сутки, осмотр через 2 недели",
        "call": {"state": "done", "ack_h": 6, "done_h": 30, "outcome": "UNREACHABLE", "note": "Три звонка без ответа, по адресу не застали"},
        "visits": [[5, "HOME", "Патронаж на дому", "MISSED", "Не застали дома, со слов соседей — уехал на работу"],
                   [14, "CLINIC", "Осмотр терапевта", "COMPLETED", "Явился сам, боли уменьшились. Алкоголь продолжает"]],
        "complete": {"after_days": 21, "note": "Состояние стабильное, приверженность низкая"}
      }
    }
  ]
}
$p$::jsonb);


-- 4.8 Назарова Малика — 77 лет, постоянная ФП на варфарине, ХСН,
-- остеопороз; амиодароновый гипотиреоз; генетика чувствительности к варфарину.
select pg_temp.seed_patient($p$
{
  "pinfl": "40304496280071", "last": "Назарова", "first": "Малика", "born": "1949-04-03", "sex": "FEMALE",
  "phone": "+998942197604", "district": "г. Наманган", "address": "г. Наманган, ул. Лермонтова, 16, кв. 3",
  "clinic": "p17", "twin": "POST_DISCHARGE_MONITORING", "risk": "HIGH", "height": 155,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "NONE", "activity": "SEDENTARY",
    "family": ["инсульт у матери"],
    "genetics": {"CYP2C9*3": "risk", "VKORC1 -1639G>A": "risk"},
    "notes": "Живёт с дочерью. Ходит с ходунками после эндопротезирования."
  },
  "chronic": [
    ["Постоянная форма фибрилляции предсердий", "I48.2", "COMORBIDITY", "ACTIVE", 2500, null, "kardio", "CHA₂DS₂-VASc 6, HAS-BLED 3"],
    ["Хроническая сердечная недостаточность с сохранённой фракцией выброса", "I50.3", "COMORBIDITY", "ACTIVE", 1500, null, "central", "ФВ 56%"],
    ["Гипертоническая болезнь III стадии", "I10", "COMORBIDITY", "ACTIVE", 6000, null, "p17", null],
    ["Гипотиреоз, индуцированный амиодароном", "E03.2", "COMORBIDITY", "ACTIVE", 1800, null, "endo", null],
    ["Постменопаузальный остеопороз с патологическим переломом", "M80.0", "COMORBIDITY", "ACTIVE", 400, null, "central", null],
    ["Хроническая болезнь почек С3а", "N18.3", "COMORBIDITY", "ACTIVE", 900, null, "p17", null]
  ],
  "allergies": [
    ["Амиодарон", "Гипотиреоз, индуцированный амиодароном", "MODERATE", 1800, "endo", "Не назначать повторно"],
    ["Нимесулид", "Токсический гепатит", "MODERATE", 1200, "p17", null]
  ],
  "meds": [
    ["Варфарин", 5, "мг", "ONCE_DAILY", "ORAL", "Под контролем МНО, цель 2,0–3,0. Высокая чувствительность (CYP2C9, VKORC1)", 2490, "ACTIVE", null, "kardio"],
    ["Бисопролол", 2.5, "мг", "ONCE_DAILY", "ORAL", "Контроль ЧСС", 2490, "ACTIVE", null, "kardio"],
    ["Торасемид", 5, "мг", "ONCE_DAILY", "ORAL", "Утром", 1490, "ACTIVE", null, "central"],
    ["Лизиноприл", 5, "мг", "ONCE_DAILY", "ORAL", null, 3000, "ACTIVE", null, "p17"],
    ["Левотироксин натрия", 50, "мкг", "ONCE_DAILY", "ORAL", "Натощак", 1790, "ACTIVE", null, "endo"],
    ["Алендроновая кислота", 70, "мг", "WEEKLY", "ORAL", "Натощак, стоя, запить стаканом воды", 380, "ACTIVE", null, "central"],
    ["Кальция карбонат + колекальциферол", 500, "мг", "TWICE_DAILY", "ORAL", "500 мг + 400 МЕ", 380, "ACTIVE", null, "central"],
    ["Амиодарон", 200, "мг", "ONCE_DAILY", "ORAL", "Отменён: гипотиреоз", 2490, "STOPPED", 1800, "kardio"]
  ],
  "labs": [
    [90, "Коагулограмма", "МНО", 2.4, "", 2.0, 3.0, null, "p17"],
    [60, "Коагулограмма", "МНО", 2.8, "", 2.0, 3.0, null, "p17"],
    [30, "Коагулограмма", "МНО", 3.4, "", 2.0, 3.0, null, "p17"],
    [5, "Коагулограмма", "МНО", 3.1, "", 2.0, 3.0, null, "p17"],
    [2, "Коагулограмма", "МНО", 2.6, "", 2.0, 3.0, null, "p17"],
    [60, "Биохимия", "Креатинин", 112, "мкмоль/л", 44, 80, null, "p17"],
    [60, "Биохимия", "СКФ (CKD-EPI)", 44, "мл/мин/1,73м²", 60, 120, null, "p17"],
    [60, "Гормоны", "ТТГ", 4.8, "мЕд/л", 0.4, 4.0, null, "p17"],
    [60, "Липидный профиль", "Общий холестерин", 5.0, "ммоль/л", 3.0, 5.2, null, "p17"],
    [60, "Липидный профиль", "ЛПВП", 1.2, "ммоль/л", 1.2, 2.2, null, "p17"]
  ],
  "obs": [
    [60, "BLOOD_PRESSURE", 138, 82, "мм рт. ст.", false, "p17"],
    [60, "WEIGHT", 61, null, "кг", false, "p17"]
  ],
  "episodes": [
    {
      "org": "kardio", "doc": "alimov", "days_ago": 2500, "los": 7, "status": "DISCHARGED",
      "reason": "Сердцебиение, одышка, ЧСС 150 в минуту",
      "dx_main": "Впервые выявленная фибрилляция предсердий, тахисистолия",
      "summary": "Кардиоверсия не выполнялась (давность неизвестна). Контроль ЧСС амиодароном и бисопрололом, назначен варфарин. МНО нестабильно — выраженная чувствительность к варфарину, подобрана доза 5 мг.",
      "dx": [["Фибрилляция предсердий, тахисистолическая форма", "I48.1", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Гормоны", "ТТГ", 1.8, "мЕд/л", 0.4, 4.0, null], [5, "Коагулограмма", "МНО", 3.9, "", 2.0, 3.0, null]],
      "vitals": [[0, "HEART_RATE", 150, null, "уд/мин", true], [6, "HEART_RATE", 82, null, "уд/мин", false]]
    },
    {
      "org": "endo", "doc": "saidova", "days_ago": 1800, "los": 6, "status": "DISCHARGED",
      "reason": "Слабость, отёчность лица, зябкость, прибавка веса",
      "dx_main": "Гипотиреоз, индуцированный амиодароном",
      "summary": "ТТГ 18,6 мЕд/л. Амиодарон отменён и внесён в непереносимость. Начат левотироксин 25 → 50 мкг.",
      "dx": [["Гипотиреоз, вызванный лекарственными средствами", "E03.2", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Гормоны", "ТТГ", 18.6, "мЕд/л", 0.4, 4.0, null], [0, "Гормоны", "Т4 свободный", 7.2, "пмоль/л", 9, 22, null]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 1500, "at": "05:30", "los": 10, "status": "DISCHARGED",
      "reason": "Одышка при минимальной нагрузке, отёки голеней",
      "dx_main": "Декомпенсация ХСН с сохранённой ФВ",
      "summary": "ХСН с сохранённой ФВ (56%). Диуретическая терапия, назначен торасемид. МНО в цели.",
      "dx": [["Острая декомпенсация ХСН с сохранённой ФВ", "I50.3", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Эхокардиография", "ECHO", "IMAGING", "ФВ 56%, дилатация обоих предсердий, диастолическая дисфункция"]],
      "labs": [[0, "Кардиомаркеры", "NT-proBNP", 2140, "пг/мл", 0, 125, null], [0, "Коагулограмма", "МНО", 2.6, "", 2.0, 3.0, null]],
      "plan": {
        "title": "Наблюдение при ХСН и антикоагулянтной терапии", "days": 60, "nurse": "nurse17",
        "summary": "Вес, МНО", "instructions": "МНО раз в 2 недели, вес ежедневно",
        "call": {"state": "done", "ack_h": 2, "done_h": 6, "outcome": "VISITED", "note": "Отёков нет"},
        "visits": [[3, "HOME", "Патронаж", "COMPLETED", "Вес 60 кг"], [14, "CLINIC", "Контроль МНО", "COMPLETED", "МНО 2,5"], [42, "CLINIC", "Контроль МНО", "COMPLETED", "МНО 2,7"]],
        "complete": {"after_days": 60, "note": "Компенсирована"}
      }
    },
    {
      "org": "central", "doc": "doc", "days_ago": 400, "at": "17:10", "los": 12, "status": "TRANSFERRED",
      "reason": "Падение дома, боль в левом тазобедренном суставе, не может встать",
      "dx_main": "Закрытый перелом шейки левой бедренной кости",
      "summary": "Субкапитальный перелом шейки бедра на фоне остеопороза. Варфарин отменён, переход на эноксапарин, операция при МНО 1,3. Тотальное эндопротезирование левого ТБС. Варфарин возобновлён. Переведена на реабилитацию.",
      "done": "Тотальное эндопротезирование левого тазобедренного сустава",
      "dx": [["Перелом шейки бедра", "S72.0", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Рентгенография таза", "XR-PELVIS", "IMAGING", "Субкапитальный перелом шейки левого бедра, Garden IV"],
               [3, "Тотальное эндопротезирование левого тазобедренного сустава", "THA", "SURGERY", "Без осложнений, кровопотеря 450 мл"]],
      "labs": [[0, "Коагулограмма", "МНО", 2.7, "", 2.0, 3.0, null], [3, "Коагулограмма", "МНО", 1.3, "", 0.8, 1.2, null],
               [4, "Общий анализ крови", "Гемоглобин", 96, "г/л", 120, 150, null]],
      "meds": [["Эноксапарин", 40, "мг", "TWICE_DAILY", "SUBCUTANEOUS", "Мост на время отмены варфарина", 0, 9, "COMPLETED"]]
    },
    {
      "org": "shifo", "doc": "nazirova", "days_ago": 388, "at": "12:30", "los": 20, "status": "DISCHARGED",
      "reason": "Перевод на реабилитацию после эндопротезирования",
      "dx_main": "Реабилитация после эндопротезирования тазобедренного сустава",
      "summary": "Вертикализация, ходьба с ходунками до 100 м. Начата терапия остеопороза: алендронат, кальций с витамином D.",
      "dx": [["Наличие эндопротеза тазобедренного сустава, реабилитация", "Z96.6", "PRIMARY", "RESOLVED"]],
      "plan": {
        "title": "Наблюдение после эндопротезирования", "days": 45, "nurse": "nurse17",
        "summary": "Профилактика падений, МНО", "instructions": "Патронаж еженедельно",
        "call": {"state": "done", "ack_h": 2, "done_h": 7, "outcome": "VISITED", "note": "Ходит с ходунками"},
        "visits": [[7, "HOME", "Патронаж", "COMPLETED", "Дома установлены поручни"], [21, "CLINIC", "Контроль МНО", "COMPLETED", "МНО 2,4"]],
        "complete": {"after_days": 45, "note": "Самостоятельно передвигается с ходунками"}
      }
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 9, "at": "21:45", "los": 2, "status": "DISCHARGED",
      "reason": "Обильное носовое кровотечение более часа, гематомы на руках",
      "dx_main": "Носовое кровотечение на фоне передозировки варфарина (МНО 5,8)",
      "summary": "МНО 5,8 — избыточная гипокоагуляция при генетически повышенной чувствительности к варфарину (CYP2C9*3, VKORC1). Передняя тампонада носа, фитоменадион 5 мг. МНО 2,9 к выписке. Доза варфарина снижена до 3,75 мг. Избегать НПВС и взаимодействующих препаратов. Контроль МНО через 3 и 7 дней.",
      "done": "Передняя тампонада носа, введение витамина K",
      "dx": [["Геморрагическое расстройство, обусловленное антикоагулянтами", "D68.3", "PRIMARY", "RESOLVED"], ["Носовое кровотечение", "R04.0", "SECONDARY", "RESOLVED"]],
      "proc": [[0, "Передняя тампонада носа", "NASAL-PACK", "THERAPEUTIC", "Кровотечение остановлено"]],
      "labs": [[0, "Коагулограмма", "МНО", 5.8, "", 2.0, 3.0, "CRITICAL"], [0, "Общий анализ крови", "Гемоглобин", 98, "г/л", 120, 150, null],
               [1, "Коагулограмма", "МНО", 2.9, "", 2.0, 3.0, null], [1, "Биохимия", "Креатинин", 118, "мкмоль/л", 44, 80, null]],
      "meds": [["Фитоменадион (витамин K1)", 5, "мг", "OTHER", "ORAL", "Однократно", 0, 0, "COMPLETED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 164, 90, "мм рт. ст.", true], [0, "HEART_RATE", 96, null, "уд/мин", false], [1, "BLOOD_PRESSURE", 138, 80, "мм рт. ст.", false]],
      "plan": {
        "title": "Контроль антикоагулянтной терапии после кровотечения", "days": 30, "nurse": "nurse17",
        "summary": "Безопасный подбор дозы варфарина", "instructions": "МНО на 2-е и 5-е сутки, затем еженедельно. Цель 2,0–3,0.",
        "call": {"state": "done", "ack_h": 2, "done_h": 5, "outcome": "VISITED", "note": "Кровотечения нет, гематомы бледнеют"},
        "visits": [[2, "HOME", "Контроль МНО на дому", "COMPLETED", "МНО 3,1, кровотечений нет"],
                   [5, "CLINIC", "Контроль МНО", "COMPLETED", "МНО 2,6 — доза 3,75 мг сохранена"],
                   [12, "CLINIC", "Контроль МНО", "PLANNED", null],
                   [26, "CALL", "Итоговый звонок", "PLANNED", null]],
        "home": [[1, "BLOOD_PRESSURE", 136, 80, "мм рт. ст.", false, "PATIENT", null], [2, "HEART_RATE", 88, null, "уд/мин", false, "NURSE", "Ритм неправильный"],
                 [4, "BLOOD_PRESSURE", 132, 78, "мм рт. ст.", false, "PATIENT", null]],
        "meds": [["Варфарин", 3.75, "мг", "ONCE_DAILY", "ORAL", "Доза снижена после кровотечения", 0, null, "ACTIVE"]]
      }
    }
  ]
}
$p$::jsonb);


-- 4.9 Рахимов Жахонгир — 25 лет, практически здоров. Контрольный пациент
-- с острыми эпизодами без хронических болезней.
select pg_temp.seed_patient($p$
{
  "pinfl": "51708016280254", "last": "Рахимов", "first": "Жахонгир", "born": "2001-08-17", "sex": "MALE",
  "phone": "+998915580943", "district": "г. Наманган", "address": "г. Наманган, ул. Уйчи, 72",
  "clinic": "p3", "twin": "STABLE", "risk": "LOW", "height": 181,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "OCCASIONAL", "activity": "ACTIVE",
    "family": [], "genetics": {},
    "notes": "Программист, занимается футболом."
  },
  "chronic": [
    ["Сколиоз грудного отдела I степени", "M41.2", "SECONDARY", "ACTIVE", 3500, null, "p3", null]
  ],
  "allergies": [],
  "meds": [],
  "labs": [
    [90, "Липидный профиль", "Общий холестерин", 4.2, "ммоль/л", 3.0, 5.2, null, "p3"],
    [90, "Липидный профиль", "ЛПВП", 1.4, "ммоль/л", 1.0, 2.2, null, "p3"],
    [90, "Биохимия", "Креатинин", 82, "мкмоль/л", 62, 106, null, "p3"],
    [90, "Общий анализ крови", "Гемоглобин", 152, "г/л", 130, 170, null, "p3"]
  ],
  "obs": [
    [90, "BLOOD_PRESSURE", 118, 72, "мм рт. ст.", false, "p3"],
    [90, "WEIGHT", 74, null, "кг", false, "p3"]
  ],
  "episodes": [
    {
      "org": "central", "doc": "doc", "days_ago": 2600, "at": "15:30", "los": 4, "status": "DISCHARGED",
      "reason": "Боль в правой подвздошной области, тошнота, температура 37,8 °C",
      "dx_main": "Острый флегмонозный аппендицит",
      "summary": "Лапароскопическая аппендэктомия, течение без осложнений.",
      "done": "Лапароскопическая аппендэктомия",
      "dx": [["Острый аппендицит", "K35.8", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Лапароскопическая аппендэктомия", "LAP-APP", "SURGERY", "Без осложнений"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 12.8, "10^9/л", 4, 10, null]]
    },
    {
      "org": "medior", "doc": "rashidov", "days_ago": 1350, "at": "19:00", "los": 2, "status": "DISCHARGED",
      "reason": "Падение на вытянутую руку на тренировке, деформация и боль в правом запястье",
      "dx_main": "Закрытый перелом дистального метаэпифиза правой лучевой кости",
      "summary": "Закрытая репозиция под местной анестезией, гипсовая иммобилизация 6 недель. Сращение на контрольной рентгенограмме.",
      "done": "Закрытая репозиция, гипсовая иммобилизация",
      "dx": [["Перелом нижнего конца лучевой кости", "S52.5", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Закрытая репозиция перелома лучевой кости", "CLOSED-REDUCTION", "THERAPEUTIC", "Стояние отломков удовлетворительное"]]
    },
    {
      "org": "multi", "doc": "hakimov", "days_ago": 210, "at": "12:40", "los": 5, "status": "DISCHARGED",
      "reason": "Боль в горле справа, невозможность открыть рот, температура 39 °C",
      "dx_main": "Паратонзиллярный абсцесс справа",
      "summary": "Вскрытие абсцесса, антибиотикотерапия амоксициллином/клавуланатом. Выздоровление.",
      "done": "Вскрытие паратонзиллярного абсцесса",
      "dx": [["Паратонзиллярный абсцесс", "J36", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "Вскрытие паратонзиллярного абсцесса", "I&D", "SURGERY", "Получено 5 мл гноя"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 15.4, "10^9/л", 4, 10, null], [0, "Биохимия", "СРБ", 84, "мг/л", 0, 5, null]],
      "meds": [["Амоксициллин/клавуланат", 1000, "мг", "TWICE_DAILY", "ORAL", "10 дней", 0, 10, "COMPLETED"]],
      "plan": {
        "title": "Наблюдение после вскрытия абсцесса", "days": 10, "nurse": "karimovaz",
        "summary": "Завершение курса антибиотика", "instructions": "Осмотр ЛОР на 7-е сутки",
        "call": {"state": "done", "ack_h": 2, "done_h": 6, "outcome": "CONTACTED", "note": "Температура нормальная"},
        "visits": [[7, "CLINIC", "Осмотр ЛОР-врача", "COMPLETED", "Выздоровление"]],
        "complete": {"after_days": 10, "note": "Выздоровление"}
      }
    }
  ]
}
$p$::jsonb);


-- 4.10 Сафарова Зарина — СД2 с нефропатией, ХБП С4, гиперкалиемия;
-- ОПП на ибупрофен. Сейчас на наблюдении, визит пропущен.
select pg_temp.seed_patient($p$
{
  "pinfl": "42501586280390", "last": "Сафарова", "first": "Зарина", "born": "1958-01-25", "sex": "FEMALE",
  "phone": "+998938826130", "district": "Чустский район", "address": "Чустский район, кишлак Каравул, ул. Гулистон, 5",
  "clinic": "p5", "twin": "POST_DISCHARGE_MONITORING", "risk": "CRITICAL", "height": 158,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "NONE", "activity": "SEDENTARY",
    "family": ["сахарный диабет 2 типа у отца и брата", "хроническая болезнь почек у брата (на диализе)"],
    "genetics": {"APOL1": "neutral"},
    "notes": "Живёт в 35 км от поликлиники, до райцентра добирается с сыном."
  },
  "chronic": [
    ["Сахарный диабет 2 типа с диабетической нефропатией", "E11.2", "COMORBIDITY", "ACTIVE", 5000, null, "endo", null],
    ["Хроническая болезнь почек С4", "N18.4", "COMORBIDITY", "ACTIVE", 500, null, "multi", "СКФ 15–20, подготовка к диализу"],
    ["Гипертоническая болезнь III стадии", "I10", "COMORBIDITY", "ACTIVE", 5500, null, "p5", null],
    ["Анемия при хронической болезни почек", "D63.8", "COMORBIDITY", "ACTIVE", 500, null, "multi", null],
    ["Вторичный гиперпаратиреоз почечного происхождения", "N25.8", "COMORBIDITY", "ACTIVE", 300, null, "multi", null]
  ],
  "allergies": [
    ["Ибупрофен", "Острое повреждение почек в 2023 г.", "SEVERE", 1000, "multi", "НПВС противопоказаны"]
  ],
  "meds": [
    ["Инсулин гларгин", 16, "ЕД", "ONCE_DAILY", "SUBCUTANEOUS", "На ночь", 1400, "ACTIVE", null, "endo"],
    ["Инсулин лизпро", null, "ЕД", "THREE_TIMES_DAILY", "SUBCUTANEOUS", "4–6 ЕД перед едой", 1400, "ACTIVE", null, "endo"],
    ["Амлодипин", 10, "мг", "ONCE_DAILY", "ORAL", null, 3000, "ACTIVE", null, "p5"],
    ["Фуросемид", 40, "мг", "ONCE_DAILY", "ORAL", "Утром", 500, "ACTIVE", null, "multi"],
    ["Эпоэтин бета", 2000, "МЕ", "OTHER", "SUBCUTANEOUS", "2 раза в неделю", 480, "ACTIVE", null, "multi"],
    ["Кальция карбонат", 1000, "мг", "THREE_TIMES_DAILY", "ORAL", "Во время еды (фосфат-биндер)", 300, "ACTIVE", null, "multi"],
    ["Натрия полистиролсульфонат", 15, "г", "ONCE_DAILY", "ORAL", "Связывание калия", 14, "ACTIVE", null, "central"],
    ["Метформин", 850, "мг", "TWICE_DAILY", "ORAL", "Отменён: СКФ < 30", 4900, "STOPPED", 500, "endo"],
    ["Лозартан", 100, "мг", "ONCE_DAILY", "ORAL", "Отменён: гиперкалиемия", 3000, "STOPPED", 20, "p5"]
  ],
  "labs": [
    [1500, "Биохимия", "Креатинин", 112, "мкмоль/л", 44, 80, null, "p5"],
    [700, "Биохимия", "Креатинин", 158, "мкмоль/л", 44, 80, null, "p5"],
    [500, "Биохимия", "Креатинин", 204, "мкмоль/л", 44, 80, null, "multi"],
    [200, "Биохимия", "Креатинин", 231, "мкмоль/л", 44, 80, null, "p5"],
    [7, "Биохимия", "Креатинин", 248, "мкмоль/л", 44, 80, null, "p5"],
    [7, "Биохимия", "СКФ (CKD-EPI)", 17, "мл/мин/1,73м²", 60, 120, null, "p5"],
    [7, "Биохимия", "Калий", 5.6, "ммоль/л", 3.5, 5.1, null, "p5"],
    [60, "Биохимия", "HbA1c", 7.2, "%", 4.0, 6.0, null, "p5"],
    [7, "Общий анализ крови", "Гемоглобин", 94, "г/л", 120, 150, null, "p5"],
    [60, "Липидный профиль", "Общий холестерин", 5.6, "ммоль/л", 3.0, 5.2, null, "p5"],
    [60, "Липидный профиль", "ЛПВП", 0.98, "ммоль/л", 1.2, 2.2, null, "p5"],
    [60, "Гормоны", "Паратгормон", 212, "пг/мл", 15, 65, null, "multi"]
  ],
  "obs": [
    [60, "BLOOD_PRESSURE", 152, 88, "мм рт. ст.", true, "p5"],
    [60, "WEIGHT", 72, null, "кг", false, "p5"]
  ],
  "episodes": [
    {
      "org": "endo", "doc": "saidova", "days_ago": 3200, "los": 9, "status": "DISCHARGED",
      "reason": "Гликемия до 18 ммоль/л на метформине, похудание",
      "dx_main": "Декомпенсация сахарного диабета 2 типа",
      "summary": "Выявлена микроальбуминурия. К метформину добавлен базальный инсулин.",
      "dx": [["Сахарный диабет 2 типа с гипергликемией", "E11.65", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "HbA1c", 9.8, "%", 4.0, 6.0, null], [0, "Биохимия", "Креатинин", 88, "мкмоль/л", 44, 80, null]]
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 1900, "los": 7, "status": "DISCHARGED",
      "reason": "Лихорадка, дизурия, боль в пояснице",
      "dx_main": "Острый пиелонефрит",
      "summary": "Пиелонефрит на фоне СД. Антибиотикотерапия с коррекцией дозы по СКФ.",
      "dx": [["Острый пиелонефрит", "N10", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 14.1, "10^9/л", 4, 10, null], [0, "Биохимия", "Креатинин", 124, "мкмоль/л", 44, 80, null]]
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 1000, "at": "09:15", "los": 11, "status": "DISCHARGED",
      "reason": "Резкое уменьшение мочи, отёки после 10 дней приёма ибупрофена от болей в коленях",
      "dx_main": "Острое повреждение почек на фоне приёма НПВС",
      "summary": "ОПП 2 стадии: креатинин 386 мкмоль/л. НПВС отменены и внесены в непереносимость, лозартан временно отменён. Функция почек восстановилась частично: креатинин 186.",
      "done": "Инфузионная терапия, отмена нефротоксичных препаратов",
      "dx": [["Острая почечная недостаточность", "N17.9", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "Креатинин", 386, "мкмоль/л", 44, 80, "CRITICAL"], [0, "Биохимия", "Калий", 5.9, "ммоль/л", 3.5, 5.1, null],
               [10, "Биохимия", "Креатинин", 186, "мкмоль/л", 44, 80, null]],
      "plan": {
        "title": "Наблюдение после острого повреждения почек", "days": 30, "nurse": "ergasheva",
        "summary": "Креатинин, калий, диурез", "instructions": "Анализы через 1 и 3 недели",
        "call": {"state": "done", "ack_h": 3, "done_h": 18, "outcome": "CONTACTED", "note": "Диурез достаточный"},
        "visits": [[7, "CLINIC", "Креатинин и калий", "COMPLETED", "Креатинин 178, калий 4,9"], [21, "CLINIC", "Креатинин и калий", "COMPLETED", "Креатинин 170"]],
        "complete": {"after_days": 30, "note": "Функция почек стабилизировалась на уровне ХБП С3б"}
      }
    },
    {
      "org": "multi", "doc": "hakimov", "days_ago": 320, "los": 5, "status": "DISCHARGED",
      "reason": "Плановая госпитализация: подготовка к программному гемодиализу",
      "dx_main": "ХБП С4, формирование сосудистого доступа",
      "summary": "Сформирована артериовенозная фистула левого предплечья. Шум над фистулой хороший. Левая рука — не измерять АД, не пунктировать вены.",
      "done": "Формирование артериовенозной фистулы левого предплечья",
      "dx": [["Хроническая болезнь почек С4, подготовка к заместительной почечной терапии", "N18.4", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Формирование артериовенозной фистулы левого предплечья", "AVF", "SURGERY", "Фистула функционирует"]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 20, "at": "11:20", "los": 6, "status": "DISCHARGED",
      "reason": "Выраженная слабость, перебои в работе сердца; калий 6,8 ммоль/л",
      "dx_main": "Гиперкалиемия на фоне ХБП С4",
      "summary": "Калий 6,8 ммоль/л с изменениями на ЭКГ (высокие остроконечные T). Кальция глюконат, инсулин с глюкозой, связывающие калий препараты. Лозартан отменён. Калий при выписке 5,2. Нефролог: начало гемодиализа при СКФ < 15 или рецидиве гиперкалиемии. Контроль калия через 7 дней обязателен.",
      "done": "ЭКГ-мониторинг, коррекция гиперкалиемии, консультация нефролога",
      "dx": [["Гиперкалиемия", "E87.5", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "ЭКГ", "ECG", "DIAGNOSTIC", "Высокие остроконечные зубцы T, PQ 0,22 с"],
               [2, "Консультация нефролога", "NEPHRO", "DIAGNOSTIC", "Начало гемодиализа при СКФ < 15 мл/мин или повторной гиперкалиемии"]],
      "labs": [[0, "Биохимия", "Калий", 6.8, "ммоль/л", 3.5, 5.1, "CRITICAL"], [0, "Биохимия", "Креатинин", 262, "мкмоль/л", 44, 80, null],
               [0, "Биохимия", "СКФ (CKD-EPI)", 16, "мл/мин/1,73м²", 60, 120, null], [0, "Общий анализ крови", "Гемоглобин", 92, "г/л", 120, 150, null],
               [1, "Биохимия", "Калий", 5.7, "ммоль/л", 3.5, 5.1, null], [5, "Биохимия", "Калий", 5.2, "ммоль/л", 3.5, 5.1, null]],
      "meds": [["Кальция глюконат 10%", 10, "мл", "OTHER", "IV", "Однократно, стабилизация миокарда", 0, 0, "COMPLETED"],
               ["Инсулин растворимый + глюкоза 40%", 10, "ЕД", "OTHER", "IV", "Однократно", 0, 0, "COMPLETED"]],
      "vitals": [[0, "HEART_RATE", 52, null, "уд/мин", true], [0, "BLOOD_PRESSURE", 168, 92, "мм рт. ст.", true], [5, "BLOOD_PRESSURE", 148, 86, "мм рт. ст.", true]],
      "plan": {
        "title": "Наблюдение при ХБП С4 после гиперкалиемии", "days": 30, "nurse": "ergasheva",
        "summary": "Риск повторной гиперкалиемии и начала диализа", "instructions": "Калий и креатинин на 7-е и 14-е сутки. Диета с ограничением калия.",
        "call": {"state": "done", "ack_h": 3, "done_h": 20, "outcome": "CONTACTED", "note": "Самочувствие удовлетворительное, диету знает"},
        "visits": [[3, "HOME", "Патронаж на дому", "COMPLETED", "АД 148/86, отёков нет, лекарства есть"],
                   [7, "CLINIC", "Контроль калия и креатинина", "MISSED", "Не явилась: нет транспорта из кишлака. Анализ взят при выезде медсестры"],
                   [14, "CLINIC", "Контроль калия и креатинина", "PLANNED", null],
                   [21, "CLINIC", "Осмотр нефролога", "PLANNED", null]],
        "home": [[3, "BLOOD_PRESSURE", 148, 86, "мм рт. ст.", true, "NURSE", "Патронаж"],
                 [6, "BLOOD_PRESSURE", 156, 90, "мм рт. ст.", true, "PATIENT", null],
                 [9, "WEAKNESS", null, null, null, true, "PATIENT", "Слабость, тяжесть в ногах"],
                 [11, "BLOOD_PRESSURE", 158, 92, "мм рт. ст.", true, "PATIENT", null]]
      }
    }
  ]
}
$p$::jsonb);


-- 4.11 Абдуллаев Отабек — 38 лет, семейная гиперхолестеринемия, курит.
-- Выписан 10 часов назад после ИМ со стентированием: активный вызов в работе.
select pg_temp.seed_patient($p$
{
  "pinfl": "32106885620157", "last": "Абдуллаев", "first": "Отабек", "born": "1988-06-21", "sex": "MALE",
  "phone": "+998977410285", "district": "г. Наманган", "address": "г. Наманган, ул. Истиклол, 9, кв. 48",
  "clinic": "p17", "twin": "POST_DISCHARGE_MONITORING", "risk": "HIGH", "height": 178,
  "profile": {
    "smoking": "CURRENT", "pack_years": 14, "alcohol": "OCCASIONAL", "activity": "LIGHT",
    "family": ["инфаркт миокарда у отца в 45 лет", "семейная гиперхолестеринемия у отца"],
    "genetics": {"LDLR c.1646G>A": "risk", "9p21 rs1333049": "risk"},
    "notes": "Предприниматель, частые командировки. Статины принимал нерегулярно."
  },
  "chronic": [
    ["Семейная гиперхолестеринемия, гетерозиготная форма", "E78.0", "COMORBIDITY", "ACTIVE", 1400, null, "kardio", "Мутация LDLR подтверждена"],
    ["Гипертоническая болезнь I стадии", "I10", "COMORBIDITY", "ACTIVE", 500, null, "p17", null]
  ],
  "allergies": [
    ["Арахис", "Отёк губ и языка", "MODERATE", 5000, "p17", "Пищевая аллергия"]
  ],
  "meds": [
    ["Розувастатин", 40, "мг", "ONCE_DAILY", "ORAL", "Вечером, не пропускать", 1390, "ACTIVE", null, "kardio"],
    ["Эзетимиб", 10, "мг", "ONCE_DAILY", "ORAL", null, 400, "ACTIVE", null, "kardio"]
  ],
  "labs": [
    [1400, "Липидный профиль", "Общий холестерин", 9.8, "ммоль/л", 3.0, 5.2, null, "kardio"],
    [1400, "Липидный профиль", "ЛПНП", 7.6, "ммоль/л", 0, 3.0, null, "kardio"],
    [400, "Липидный профиль", "Общий холестерин", 7.2, "ммоль/л", 3.0, 5.2, null, "p17"],
    [400, "Липидный профиль", "ЛПНП", 5.1, "ммоль/л", 0, 1.8, null, "p17"],
    [400, "Липидный профиль", "ЛПВП", 0.95, "ммоль/л", 1.0, 2.2, null, "p17"],
    [400, "Биохимия", "Креатинин", 88, "мкмоль/л", 62, 106, null, "p17"]
  ],
  "obs": [
    [400, "BLOOD_PRESSURE", 138, 88, "мм рт. ст.", false, "p17"],
    [400, "WEIGHT", 88, null, "кг", false, "p17"]
  ],
  "episodes": [
    {
      "org": "kardio", "doc": "alimov", "days_ago": 1400, "los": 3, "status": "DISCHARGED",
      "reason": "Колющие боли в груди при стрессе, ксантомы ахилловых сухожилий",
      "dx_main": "Кардиалгия; впервые выявленная семейная гиперхолестеринемия",
      "summary": "Ишемия не подтверждена (стресс-тест отрицательный). ЛПНП 7,6 ммоль/л, ксантомы сухожилий, отец — ИМ в 45 лет: критерии DLCN 9 баллов, семейная гиперхолестеринемия. Назначен розувастатин 40 мг.",
      "done": "Стресс-тест, генетическое исследование",
      "dx": [["Семейная гиперхолестеринемия", "E78.0", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Нагрузочный тредмил-тест", "TREADMILL", "DIAGNOSTIC", "Отрицательный, толерантность высокая"],
               [2, "Генетическое исследование LDLR", "GENE-LDLR", "DIAGNOSTIC", "Патогенный вариант c.1646G>A"]],
      "labs": [[0, "Липидный профиль", "ЛПНП", 7.6, "ммоль/л", 0, 3.0, null]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 500, "at": "22:30", "los": 2, "status": "DISCHARGED",
      "reason": "Головная боль, АД 186/108 после бессонной ночи",
      "dx_main": "Гипертонический криз неосложнённый",
      "summary": "Криз купирован. Диагностирована АГ I стадии, рекомендованы изменение образа жизни и отказ от курения.",
      "dx": [["Гипертонический криз неосложнённый", "I10", "PRIMARY", "RESOLVED"]],
      "vitals": [[0, "BLOOD_PRESSURE", 186, 108, "мм рт. ст.", true], [1, "BLOOD_PRESSURE", 134, 84, "мм рт. ст.", false]]
    },
    {
      "org": "rkc", "doc": "kurbanov", "days_ago": 5, "at": "04:20", "los": 5, "dis_hours_ago": 10, "status": "DISCHARGED",
      "reason": "Жгучая загрудинная боль 50 минут, иррадиация в челюсть; подъём ST в II, III, aVF",
      "dx_main": "Острый инфаркт миокарда нижней стенки с подъёмом ST",
      "summary": "Первичное ЧКВ через 90 минут от поступления: окклюзия ПКА, стентирование (1 стент с лекарственным покрытием). ФВ ЛЖ 50%, гипокинез нижней стенки. Двойная антитромбоцитарная терапия (аспирин + тикагрелор) 12 месяцев — не прерывать. ЛПНП 4,8 ммоль/л на фоне нерегулярного приёма статина. Категорически — отказ от курения.",
      "done": "Коронарография, стентирование ПКА, ЭхоКГ",
      "dx": [["Острый инфаркт миокарда нижней стенки с подъёмом ST", "I21.1", "PRIMARY", "ACTIVE"]],
      "proc": [[0, "Коронарография", "CAG", "DIAGNOSTIC", "Окклюзия среднего сегмента ПКА, стеноз ПНА 40%"],
               [0, "Стентирование ПКА", "PCI-RCA", "SURGERY", "1 стент с лекарственным покрытием, TIMI III"],
               [2, "Эхокардиография", "ECHO", "IMAGING", "ФВ ЛЖ 50%, гипокинез нижней стенки"]],
      "labs": [[0, "Кардиомаркеры", "Тропонин I", 24.6, "нг/мл", 0, 0.04, "CRITICAL"],
               [0, "Липидный профиль", "Общий холестерин", 6.9, "ммоль/л", 3.0, 5.2, null],
               [0, "Липидный профиль", "ЛПНП", 4.8, "ммоль/л", 0, 1.4, null],
               [0, "Липидный профиль", "ЛПВП", 0.9, "ммоль/л", 1.0, 2.2, null],
               [0, "Биохимия", "Креатинин", 91, "мкмоль/л", 62, 106, null],
               [0, "Биохимия", "HbA1c", 5.7, "%", 4.0, 6.0, null]],
      "vitals": [[0, "BLOOD_PRESSURE", 148, 92, "мм рт. ст.", true], [0, "HEART_RATE", 58, null, "уд/мин", false], [3, "BLOOD_PRESSURE", 126, 78, "мм рт. ст.", false]],
      "plan": {
        "title": "Наблюдение после инфаркта миокарда", "days": 90, "nurse": "nurse17",
        "summary": "ДАТТ 12 месяцев, липиды, отказ от курения, кардиореабилитация",
        "instructions": "Патронаж на 3-и сутки. Не прерывать тикагрелор. ЛПНП через 6 недель, цель < 1,4.",
        "call": {"state": "ack", "ack_h": 3},
        "visits": [[3, "HOME", "Патронаж после инфаркта", "PLANNED", null],
                   [10, "CLINIC", "Осмотр кардиолога", "PLANNED", null],
                   [42, "CLINIC", "Контроль липидов", "PLANNED", null],
                   [90, "CLINIC", "Итоговый осмотр", "PLANNED", null]],
        "home": [[0.3, "BLOOD_PRESSURE", 124, 78, "мм рт. ст.", false, "PATIENT", null]],
        "meds": [["Ацетилсалициловая кислота", 100, "мг", "ONCE_DAILY", "ORAL", "12 месяцев в составе ДАТТ, затем постоянно", 0, null, "ACTIVE"],
                 ["Тикагрелор", 90, "мг", "TWICE_DAILY", "ORAL", "12 месяцев, не прерывать без кардиолога", 0, null, "ACTIVE"],
                 ["Бисопролол", 2.5, "мг", "ONCE_DAILY", "ORAL", null, 0, null, "ACTIVE"],
                 ["Рамиприл", 5, "мг", "ONCE_DAILY", "ORAL", null, 0, null, "ACTIVE"]]
      }
    }
  ]
}
$p$::jsonb);


-- 4.12 Исмоилова Барно — ревматоидный артрит на метотрексате,
-- остеопороз; гепатит на сульфасалазин.
select pg_temp.seed_patient($p$
{
  "pinfl": "41410666280467", "last": "Исмоилова", "first": "Барно", "born": "1966-10-14", "sex": "FEMALE",
  "phone": "+998916274038", "district": "Чустский район", "address": "Чустский район, г. Чуст, ул. Гулбахор, 27",
  "clinic": "p5", "twin": "STABLE", "risk": "MEDIUM", "height": 160,
  "profile": {
    "smoking": "NEVER", "pack_years": null, "alcohol": "NONE", "activity": "LIGHT",
    "family": ["ревматоидный артрит у тёти по матери"],
    "genetics": {"HLA-DRB1 shared epitope": "risk"},
    "notes": "Ковровщица, из-за артрита работу оставила."
  },
  "chronic": [
    ["Ревматоидный артрит серопозитивный, умеренная активность", "M05.8", "COMORBIDITY", "ACTIVE", 3300, null, "multi", "DAS28 3,6"],
    ["Остеопороз без патологического перелома", "M81.0", "COMORBIDITY", "ACTIVE", 1200, null, "p5", "На фоне глюкокортикоидов"],
    ["Гипертоническая болезнь II стадии", "I10", "COMORBIDITY", "ACTIVE", 1500, null, "p5", null]
  ],
  "allergies": [
    ["Сульфасалазин", "Лекарственный гепатит (АЛТ 380 Ед/л)", "MODERATE", 3000, "multi", null]
  ],
  "meds": [
    ["Метотрексат", 15, "мг", "WEEKLY", "ORAL", "По понедельникам. Контроль АЛТ и крови раз в 3 месяца", 2990, "ACTIVE", null, "multi"],
    ["Фолиевая кислота", 5, "мг", "WEEKLY", "ORAL", "Во вторник, через 24 ч после метотрексата", 2990, "ACTIVE", null, "multi"],
    ["Преднизолон", 5, "мг", "ONCE_DAILY", "ORAL", "Утром", 3290, "ACTIVE", null, "multi"],
    ["Лозартан", 50, "мг", "ONCE_DAILY", "ORAL", null, 1490, "ACTIVE", null, "p5"],
    ["Кальция карбонат + колекальциферол", 500, "мг", "TWICE_DAILY", "ORAL", null, 1190, "ACTIVE", null, "p5"],
    ["Сульфасалазин", 1000, "мг", "TWICE_DAILY", "ORAL", "Отменён: лекарственный гепатит", 3290, "STOPPED", 3000, "multi"]
  ],
  "labs": [
    [3300, "Иммунология", "Ревматоидный фактор", 86, "МЕ/мл", 0, 14, null, "multi"],
    [3300, "Иммунология", "АЦЦП", 240, "Ед/мл", 0, 17, null, "multi"],
    [90, "Биохимия", "СРБ", 14, "мг/л", 0, 5, null, "p5"],
    [90, "Общий анализ крови", "СОЭ", 32, "мм/ч", 2, 20, null, "p5"],
    [90, "Общий анализ крови", "Лейкоциты", 4.2, "10^9/л", 4, 10, null, "p5"],
    [90, "Биохимия", "АЛТ", 34, "Ед/л", 0, 33, null, "p5"],
    [90, "Биохимия", "Креатинин", 74, "мкмоль/л", 44, 80, null, "p5"],
    [90, "Липидный профиль", "Общий холестерин", 5.4, "ммоль/л", 3.0, 5.2, null, "p5"],
    [90, "Липидный профиль", "ЛПВП", 1.4, "ммоль/л", 1.2, 2.2, null, "p5"]
  ],
  "obs": [
    [90, "BLOOD_PRESSURE", 136, 84, "мм рт. ст.", false, "p5"],
    [90, "WEIGHT", 68, null, "кг", false, "p5"]
  ],
  "episodes": [
    {
      "org": "multi", "doc": "isakov", "days_ago": 3300, "los": 14, "status": "DISCHARGED",
      "reason": "Боль и отёк мелких суставов кистей, утренняя скованность более 2 часов",
      "dx_main": "Ревматоидный артрит серопозитивный, впервые выявленный, высокая активность",
      "summary": "РФ 86, АЦЦП 240, эрозии на рентгенограммах кистей. Начат сульфасалазин и преднизолон.",
      "dx": [["Ревматоидный артрит серопозитивный", "M05.8", "PRIMARY", "RESOLVED"]],
      "proc": [[2, "Рентгенография кистей", "XR-HANDS", "IMAGING", "Околосуставной остеопороз, единичные эрозии"]],
      "labs": [[0, "Биохимия", "СРБ", 46, "мг/л", 0, 5, null], [0, "Общий анализ крови", "СОЭ", 58, "мм/ч", 2, 20, null]],
      "meds": [["Метилпреднизолон", 250, "мг", "ONCE_DAILY", "IV", "Пульс-терапия 3 дня", 0, 3, "COMPLETED"]]
    },
    {
      "org": "multi", "doc": "isakov", "days_ago": 3000, "los": 9, "status": "DISCHARGED",
      "reason": "Желтуха, слабость, АЛТ 380 Ед/л на фоне сульфасалазина",
      "dx_main": "Лекарственный гепатит на сульфасалазин",
      "summary": "Сульфасалазин отменён и внесён в аллергоанамнез. АЛТ снизилась до 64 к выписке. Рекомендован переход на метотрексат после нормализации печёночных проб.",
      "dx": [["Токсическое поражение печени", "K71.6", "PRIMARY", "RESOLVED"]],
      "labs": [[0, "Биохимия", "АЛТ", 380, "Ед/л", 0, 33, "CRITICAL"], [0, "Биохимия", "Билирубин общий", 48, "мкмоль/л", 3.4, 20.5, null],
               [8, "Биохимия", "АЛТ", 64, "Ед/л", 0, 33, null]]
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 900, "at": "13:10", "los": 12, "status": "DISCHARGED",
      "reason": "Лихорадка, кашель, одышка на фоне приёма метотрексата и преднизолона",
      "dx_main": "Внебольничная пневмония у пациентки на иммуносупрессивной терапии",
      "summary": "Двусторонняя пневмония. Метотрексат приостановлен на время инфекции, возобновлён через 2 недели после выздоровления. Рекомендована вакцинация против пневмококка.",
      "dx": [["Внебольничная пневмония", "J18.9", "PRIMARY", "RESOLVED"]],
      "proc": [[0, "КТ органов грудной клетки", "CT-CHEST", "IMAGING", "Двусторонние инфильтраты в нижних долях"]],
      "labs": [[0, "Общий анализ крови", "Лейкоциты", 12.9, "10^9/л", 4, 10, null], [0, "Биохимия", "СРБ", 132, "мг/л", 0, 5, null]],
      "meds": [["Левофлоксацин", 500, "мг", "ONCE_DAILY", "IV", null, 0, 10, "COMPLETED"]],
      "plan": {
        "title": "Наблюдение после пневмонии на иммуносупрессии", "days": 30, "nurse": "ergasheva",
        "summary": "Возобновление метотрексата после выздоровления", "instructions": "Осмотр через 2 недели, решение о возобновлении метотрексата",
        "call": {"state": "done", "ack_h": 2, "done_h": 9, "outcome": "VISITED", "note": "Температура нормальная"},
        "visits": [[14, "CLINIC", "Осмотр терапевта и ревматолога", "COMPLETED", "Метотрексат возобновлён"]],
        "complete": {"after_days": 30, "note": "Выздоровление, базисная терапия возобновлена"}
      }
    },
    {
      "org": "central", "doc": "olimova", "days_ago": 150, "los": 7, "status": "DISCHARGED",
      "reason": "Отёк и боль обоих коленных суставов, не может ходить",
      "dx_main": "Обострение ревматоидного артрита, синовит коленных суставов",
      "summary": "Пункция коленных суставов с введением бетаметазона. Активность снижена до умеренной. Метотрексат 15 мг продолжен.",
      "dx": [["Обострение ревматоидного артрита, синовит коленных суставов", "M05.8", "PRIMARY", "RESOLVED"]],
      "proc": [[1, "Пункция коленных суставов, внутрисуставное введение бетаметазона", "ARTHROCENTESIS", "THERAPEUTIC", "Эвакуировано 40 и 35 мл синовиальной жидкости"]],
      "labs": [[0, "Биохимия", "СРБ", 38, "мг/л", 0, 5, null], [0, "Биохимия", "АЛТ", 29, "Ед/л", 0, 33, null]]
    }
  ]
}
$p$::jsonb);


-- 5. Старые синтетические пациенты — к реалистичному виду -----------------------

do $$
declare
  r        record;
  v_i      int := 0;
  v_addr   text[] := array[
    'г. Наманган, ул. Бобура, 45, кв. 12', 'г. Наманган, махалля Навбахор, ул. Чорсу, 8',
    'Уйчинский район, кишлак Жийда, ул. Янги хаёт, 19', 'Касансайский район, г. Касансай, ул. Мустакиллик, 3',
    'Туракурганский район, кишлак Ахсикент, ул. Олмазор, 11', 'г. Наманган, ул. Дустлик, 64, кв. 5',
    'Папский район, г. Пап, ул. Навои, 27', 'г. Наманган, махалля Сардоба, ул. Бахор, 2',
    'Янгикурганский район, кишлак Нанай, ул. Истиклол, 15', 'г. Наманган, ул. Ахмада Дониша, 30, кв. 41',
    'Чортакский район, г. Чортак, ул. Шифокорлар, 6', 'г. Наманган, ул. Гулистон, 91'];
  v_prefix text[] := array['90', '91', '93', '94', '97', '99'];
begin
  for r in
    select id, national_id, birth_date, gender
      from public.patients
     where national_id like 'SYNTHETIC-DEMO-%'
     order by national_id
  loop
    v_i := v_i + 1;
    update public.patients
       set national_id = (case when gender = 'FEMALE' then '4' else '3' end)
                         || to_char(coalesce(birth_date, date '1970-01-01'), 'DDMMYY')
                         || '562' || lpad((100 + v_i * 37)::text, 3, '0')
                         || ((v_i * 7) % 10)::text,
           phone = '+998' || v_prefix[1 + v_i % 6]
                   || lpad(((abs(hashtext(r.id::text)::bigint) % 9000000) + 1000000)::text, 7, '0'),
           region = 'Наманганская область',
           district = case when v_addr[1 + (v_i - 1) % 12] like 'г. Наманган%' then 'г. Наманган'
                           else split_part(v_addr[1 + (v_i - 1) % 12], ',', 1) end,
           address = v_addr[1 + (v_i - 1) % 12]
     where id = r.id;
  end loop;

  update public.patients set first_name = 'Акмал', last_name = 'Каримов'
   where first_name = 'Akmal' and last_name = 'Karimov';
end;
$$;

update public.hospitalizations set
  admission_reason  = case admission_reason
                        when 'Synthetic demo: acute abdominal pain' then 'Острая боль в правой подвздошной области'
                        else replace(admission_reason, 'Синтетический демо: ', '') end,
  primary_diagnosis = case primary_diagnosis
                        when 'Synthetic demo: acute appendicitis' then 'Острый аппендицит с местным перитонитом'
                        else replace(primary_diagnosis, 'Синтетический демо: ', '') end,
  procedure_summary = case procedure_summary
                        when 'Synthetic demo: laparoscopic appendectomy' then 'Лапароскопическая аппендэктомия'
                        else replace(procedure_summary, 'Синтетический демо: ', '') end,
  discharge_summary = case discharge_summary
                        when 'Synthetic demo: stable, wound care and follow-up required'
                          then 'Состояние удовлетворительное, требуется уход за раной и наблюдение'
                        when 'Синтетический демо: выписан на амбулаторное наблюдение'
                          then 'Выписан на амбулаторное наблюдение в поликлинику по месту жительства'
                        else replace(discharge_summary, 'Синтетический демо: ', '') end
 where (coalesce(admission_reason, '') || coalesce(primary_diagnosis, '') || coalesce(procedure_summary, '')
        || coalesce(discharge_summary, '')) ~ '(Synthetic demo|Синтетический демо)';

update public.care_plans set summary = 'Наблюдение после выписки'
 where summary in ('Синтетический демо-план', 'Синтетический демо-план наблюдения');
update public.care_assignments set notes = 'Закреплена поликлиникой по месту жительства'
 where notes like 'Синтетическ%';
update public.care_plan_visits set notes = replace(notes, 'Синтетические демо-данные: ', '')
 where notes like 'Синтетические демо-данные: %';
update public.active_calls set notes = replace(notes, 'Синтетические демо-данные: ', '')
 where notes like 'Синтетические демо-данные: %';
update public.devices set notes = 'Браслет подключён пациентом при выписке'
 where notes ilike '%synthetic%' or notes like 'Синтетическ%';

-- те же тексты уже попали в историю двойника
update public.twin_events set
  title = replace(replace(title, 'Синтетический демо: ', ''), 'Synthetic demo: ', ''),
  description = case description
                  when 'Synthetic demo: acute abdominal pain' then 'Острая боль в правой подвздошной области'
                  when 'Synthetic demo: stable, wound care and follow-up required'
                    then 'Состояние удовлетворительное, требуется уход за раной и наблюдение'
                  when 'Синтетический демо-план' then 'Наблюдение после выписки'
                  when 'Синтетическое демо-назначение' then 'Закреплена поликлиникой по месту жительства'
                  else replace(replace(description, 'Синтетические демо-данные: ', ''), 'Синтетический демо: ', '') end
 where title ~ '(Синтетическ|Synthetic)' or description ~ '(Синтетическ|Synthetic)';

alter table public.twin_events enable trigger twin_events_no_update;

drop table if exists _org;
drop table if exists _staff;


-- Итог --------------------------------------------------------------------------
select p.last_name || ' ' || p.first_name as пациент,
       p.national_id                     as пинфл,
       o.name                            as поликлиника,
       (select count(*) from public.hospitalizations h where h.patient_id = p.id) as обращений,
       t.current_status                  as статус,
       t.risk_level                      as риск
  from public.patients p
  left join public.organizations o on o.id = p.primary_clinic_id
  left join public.digital_twins t on t.patient_id = p.id
 order by p.patient_number;
