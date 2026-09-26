-- звонок нужен не каждому выписанному, а тому, кому врач назначил наблюдение.
--
-- раньше активный вызов создавался на любую выписку. клинически это неверно:
-- после несложной операции без хронических болезней патронаж не нужен. решение
-- принимает лечащий врач, и выражается оно в плане наблюдения: есть план —
-- есть вызов, нет плана — нет вызова.
--
-- отсюда и перенос: care_plans_before_write запрещает делать план ACTIVE, пока
-- госпитализация ещё ACTIVE, то есть на момент выписки плана заведомо нет.
-- значит вызов должен ставить триггер на care_plans, а не на hospitalizations.

drop trigger if exists hospitalizations_dispatch_active_call on public.hospitalizations;
drop function if exists public.hospitalizations_dispatch_active_call();


create or replace function public.care_plans_dispatch_active_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_became_active boolean;
  v_discharged_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    v_became_active := new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE';
  else
    v_became_active := new.status = 'ACTIVE';
  end if;

  if not v_became_active or new.hospitalization_id is null then
    return null;
  end if;

  select h.discharged_at into v_discharged_at
    from public.hospitalizations h
   where h.id = new.hospitalization_id;

  if v_discharged_at is null then
    return null;
  end if;

  -- created_at берём с момента выписки, а не с момента записи плана: часы идут
  -- от выписки, и только так due_at остаётся позже created_at на старых данных.
  insert into public.active_calls (
    patient_id, hospitalization_id, organization_id, care_plan_id, created_at, due_at
  )
  values (
    new.patient_id, new.hospitalization_id, new.receiving_organization_id, new.id,
    v_discharged_at, v_discharged_at + interval '24 hours'
  )
  on conflict do nothing;

  return null;
end;
$$;

comment on function public.care_plans_dispatch_active_call() is
  'Ставит активный вызов, когда план наблюдения вступает в силу. Без плана вызова не будет.';

drop trigger if exists care_plans_dispatch_active_call on public.care_plans;
create trigger care_plans_dispatch_active_call
  after insert or update on public.care_plans
  for each row execute function public.care_plans_dispatch_active_call();


-- события госпитализации по-русски, диагноз в заголовке
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
      'Поступление: ' || coalesce(v_org_name, 'стационар')
        || coalesce(' — ' || new.primary_diagnosis, ''),
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

  if new.status in ('DISCHARGED', 'TRANSFERRED') and v_status_changed then
    perform public.log_twin_event(
      new.patient_id, 'PATIENT_DISCHARGED', 'HOSPITAL',
      case when new.status = 'TRANSFERRED'
           then 'Перевод из: ' || coalesce(v_org_name, 'стационар')
           else 'Выписка: ' || coalesce(v_org_name, 'стационар') end
        || coalesce(' — ' || new.primary_diagnosis, ''),
      new.discharged_at, coalesce(new.discharge_summary, new.procedure_summary), 'INFO',
      'hospitalizations', new.id, new.attending_doctor_id, new.organization_id,
      jsonb_build_object('status', new.status::text,
                         'primary_diagnosis', new.primary_diagnosis,
                         'admitted_at', new.admitted_at,
                         'days', case when new.discharged_at is null then null
                                 else greatest(1, (new.discharged_at::date - new.admitted_at::date)) end)
    );

    update public.digital_twins
       set current_status = 'POST_DISCHARGE_MONITORING'
     where patient_id = new.patient_id
       and current_status in ('NEW', 'HOSPITALIZED');
  end if;

  return null;
end;
$$;


-- события плана наблюдения по-русски; закрытие плана тоже попадает в историю
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
      'План наблюдения: ' || new.title,
      new.created_at, new.summary, 'INFO',
      'care_plans', new.id, new.created_by, new.source_organization_id,
      jsonb_build_object('status', new.status::text,
                         'receiving_organization_id', new.receiving_organization_id)
    );
  end if;

  if v_became_active then
    perform public.log_twin_event(
      new.patient_id, 'CARE_PLAN_APPROVED', 'HOME',
      'План наблюдения вступил в силу: ' || new.title,
      coalesce(new.approved_at, now()), new.instructions, 'INFO',
      'care_plans', new.id, new.approved_by, new.receiving_organization_id,
      jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date)
    );

    update public.digital_twins
       set current_status = 'POST_DISCHARGE_MONITORING'
     where patient_id = new.patient_id
       and current_status <> 'HOSPITALIZED';
  end if;

  if v_became_completed then
    perform public.log_twin_event(
      new.patient_id, 'CARE_PLAN_COMPLETED', 'HOME',
      'Наблюдение завершено: ' || new.title,
      now(), new.summary, 'INFO',
      'care_plans', new.id, new.approved_by, new.receiving_organization_id,
      jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date));

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


-- ответственного назначает врач или администратор принимающей поликлиники,
-- а не только администратор: в небольшой поликлинике врач берёт пациента сам.
drop policy if exists "Organization admins can assign" on public.care_assignments;
drop policy if exists "Receiving organization can assign" on public.care_assignments;
create policy "Receiving organization can assign"
  on public.care_assignments for insert to authenticated
  with check (
    (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'HOSPITAL_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
    or (select private.is_super_admin())
  );

drop policy if exists "Assignee or organization admin can update assignments" on public.care_assignments;
drop policy if exists "Assignee or organization can update assignments" on public.care_assignments;
create policy "Assignee or organization can update assignments"
  on public.care_assignments for update to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  )
  with check (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  );


-- вызовы, созданные прежним триггером, ссылки на план не имеют: проставляем её
-- по той же госпитализации, иначе на старых данных связь потеряется
update public.active_calls ac
   set care_plan_id = cp.id
  from public.care_plans cp
 where ac.care_plan_id is null
   and cp.hospitalization_id = ac.hospitalization_id
   and cp.patient_id = ac.patient_id
   and cp.receiving_organization_id = ac.organization_id;
