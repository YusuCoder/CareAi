-- оформление выписки одним вызовом.
--
-- выписка состоит из семи записей в разных таблицах: сама госпитализация,
-- диагнозы, процедуры, назначения, показатели, анализы, план наблюдения с
-- графиком осмотров. с клиента это семь отдельных запросов, и сбой на пятом
-- оставил бы пациента выписанным без плана. поэтому одна функция и одна
-- транзакция.
--
-- security invoker: политики RLS продолжают действовать, функция не даёт
-- врачу ничего сверх того, что он и так может записать руками.

-- график осмотров заводит тот, кто выписывает, а он сотрудник стационара,
-- а не принимающей поликлиники: разрешаем по организации-источнику плана
drop policy if exists "Receiving organization can plan visits" on public.care_plan_visits;
create policy "Receiving organization can plan visits"
  on public.care_plan_visits for insert to authenticated
  with check (
    (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[]))
    or exists (
      select 1
        from public.care_plans cp
       where cp.id = care_plan_id
         and (select private.has_org_role(cp.source_organization_id,
               array['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
    )
    or (select private.is_super_admin())
  );


create or replace function public.discharge_patient(p_payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_actor       uuid := auth.uid();
  v_hosp_id     uuid := (p_payload ->> 'hospitalization_id')::uuid;
  v_discharged  timestamptz := coalesce((p_payload ->> 'discharged_at')::timestamptz, now());
  v_patient     uuid;
  v_org         uuid;
  v_status      public.hospitalization_status;
  v_plan        jsonb := p_payload -> 'plan';
  v_plan_id     uuid;
  v_call_id     uuid;
  v_receiving   uuid;
  v_start       date;
  item          jsonb;
  v_low         numeric;
  v_high        numeric;
  v_value       numeric;
begin
  if v_actor is null then
    raise exception 'Требуется вход в систему' using errcode = '28000';
  end if;

  select h.patient_id, h.organization_id, h.status
    into v_patient, v_org, v_status
    from public.hospitalizations h
   where h.id = v_hosp_id;

  if v_patient is null then
    raise exception 'Госпитализация % не найдена', v_hosp_id using errcode = 'P0002';
  end if;

  if v_status <> 'ACTIVE' then
    raise exception 'Госпитализация уже закрыта (статус %)', v_status using errcode = '23514';
  end if;

  -- 1. сама выписка. идёт первой: план наблюдения нельзя активировать,
  -- пока госпитализация числится открытой
  update public.hospitalizations
     set status            = 'DISCHARGED',
         discharged_at     = v_discharged,
         primary_diagnosis = coalesce(nullif(btrim(p_payload ->> 'primary_diagnosis'), ''), primary_diagnosis),
         procedure_summary = nullif(btrim(p_payload ->> 'procedure_summary'), ''),
         discharge_summary = nullif(btrim(p_payload ->> 'discharge_summary'), '')
   where id = v_hosp_id;

  -- 2. диагнозы
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'diagnoses', '[]'::jsonb))
  loop
    insert into public.diagnoses (
      patient_id, hospitalization_id, name, code, type, status, diagnosed_at,
      notes, source, recorded_by, organization_id
    )
    values (
      v_patient, v_hosp_id,
      btrim(item ->> 'name'),
      nullif(btrim(coalesce(item ->> 'code', '')), ''),
      coalesce(item ->> 'type', 'SECONDARY')::public.diagnosis_type,
      'ACTIVE',
      v_discharged::date,
      nullif(btrim(coalesce(item ->> 'notes', '')), ''),
      'HOSPITAL', v_actor, v_org
    );
  end loop;

  -- 3. процедуры
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'procedures', '[]'::jsonb))
  loop
    insert into public.procedures (
      patient_id, hospitalization_id, name, category, performed_at, performed_by,
      organization_id, outcome, notes, source
    )
    values (
      v_patient, v_hosp_id,
      btrim(item ->> 'name'),
      coalesce(item ->> 'category', 'OTHER')::public.procedure_category,
      coalesce((item ->> 'performed_at')::timestamptz, v_discharged),
      v_actor, v_org,
      nullif(btrim(coalesce(item ->> 'outcome', '')), ''),
      nullif(btrim(coalesce(item ->> 'notes', '')), ''),
      'HOSPITAL'
    );
  end loop;

  -- 4. назначения на выписку
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'medications', '[]'::jsonb))
  loop
    insert into public.medications (
      patient_id, hospitalization_id, name, dose, dose_unit, frequency, route,
      instructions, start_date, end_date, status, prescribed_by, organization_id, source
    )
    values (
      v_patient, v_hosp_id,
      btrim(item ->> 'name'),
      nullif(item ->> 'dose', '')::numeric,
      nullif(btrim(coalesce(item ->> 'dose_unit', '')), ''),
      nullif(item ->> 'frequency', '')::public.medication_frequency,
      nullif(item ->> 'route', '')::public.medication_route,
      nullif(btrim(coalesce(item ->> 'instructions', '')), ''),
      coalesce((item ->> 'start_date')::date, v_discharged::date),
      nullif(item ->> 'end_date', '')::date,
      'ACTIVE', v_actor, v_org, 'HOSPITAL'
    );
  end loop;

  -- 5. показатели на момент выписки
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'observations', '[]'::jsonb))
  loop
    insert into public.observations (
      patient_id, hospitalization_id, type, value_numeric, value_secondary,
      unit, is_abnormal, note, source, recorded_at, recorded_by, organization_id
    )
    values (
      v_patient, v_hosp_id,
      (item ->> 'type')::public.observation_type,
      nullif(item ->> 'value_numeric', '')::numeric,
      nullif(item ->> 'value_secondary', '')::numeric,
      nullif(btrim(coalesce(item ->> 'unit', '')), ''),
      coalesce((item ->> 'is_abnormal')::boolean, false),
      nullif(btrim(coalesce(item ->> 'note', '')), ''),
      'HOSPITAL', v_discharged, v_actor, v_org
    );
  end loop;

  -- 6. анализы. флаг считаем здесь, чтобы он не зависел от того, проставил ли
  -- его человек в форме
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'labs', '[]'::jsonb))
  loop
    v_value := nullif(item ->> 'value_numeric', '')::numeric;
    v_low   := nullif(item ->> 'reference_low', '')::numeric;
    v_high  := nullif(item ->> 'reference_high', '')::numeric;

    insert into public.lab_results (
      patient_id, hospitalization_id, panel, analyte, value_numeric, unit,
      reference_low, reference_high, flag, collected_at, resulted_at,
      source, recorded_by, organization_id
    )
    values (
      v_patient, v_hosp_id,
      nullif(btrim(coalesce(item ->> 'panel', '')), ''),
      btrim(item ->> 'analyte'),
      v_value,
      nullif(btrim(coalesce(item ->> 'unit', '')), ''),
      v_low, v_high,
      case
        when v_value is null then null
        when v_low is not null and v_value < v_low then 'LOW'
        when v_high is not null and v_value > v_high then 'HIGH'
        when v_low is null and v_high is null then null
        else 'NORMAL'
      end::public.lab_flag,
      v_discharged, v_discharged,
      'HOSPITAL', v_actor, v_org
    );
  end loop;

  -- 7. план наблюдения. его наличие и решает, будет ли активный вызов
  if v_plan is not null and v_plan <> 'null'::jsonb then
    v_receiving := nullif(v_plan ->> 'receiving_organization_id', '')::uuid;
    v_start := coalesce((v_plan ->> 'start_date')::date, v_discharged::date);

    insert into public.care_plans (
      patient_id, hospitalization_id, source_organization_id, receiving_organization_id,
      created_by, approved_by, approved_at, title, summary, instructions,
      start_date, end_date, status
    )
    values (
      v_patient, v_hosp_id, v_org, v_receiving,
      v_actor, v_actor, now(),
      btrim(v_plan ->> 'title'),
      nullif(btrim(coalesce(v_plan ->> 'summary', '')), ''),
      nullif(btrim(coalesce(v_plan ->> 'instructions', '')), ''),
      v_start,
      nullif(v_plan ->> 'end_date', '')::date,
      'ACTIVE'
    )
    returning id, receiving_organization_id into v_plan_id, v_receiving;

    for item in select * from jsonb_array_elements(coalesce(v_plan -> 'visits', '[]'::jsonb))
    loop
      insert into public.care_plan_visits (
        care_plan_id, patient_id, organization_id, scheduled_for, kind, title,
        status, created_by
      )
      values (
        v_plan_id, v_patient, v_receiving,
        coalesce((item ->> 'scheduled_for')::date, v_start + coalesce((item ->> 'day_offset')::int, 0)),
        coalesce(item ->> 'kind', 'CLINIC')::public.visit_kind,
        nullif(btrim(coalesce(item ->> 'title', '')), ''),
        'PLANNED', v_actor
      );
    end loop;

    select id into v_call_id
      from public.active_calls
     where care_plan_id = v_plan_id
     limit 1;
  end if;

  return jsonb_build_object(
    'hospitalization_id', v_hosp_id,
    'patient_id', v_patient,
    'care_plan_id', v_plan_id,
    'active_call_id', v_call_id
  );
end;
$$;

comment on function public.discharge_patient(jsonb) is
  'Оформляет выписку целиком одной транзакцией: эпикриз, диагнозы, процедуры, назначения, показатели, анализы и план наблюдения с графиком осмотров.';

grant execute on function public.discharge_patient(jsonb) to authenticated;
