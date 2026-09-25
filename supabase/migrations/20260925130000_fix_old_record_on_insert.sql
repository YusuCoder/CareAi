create or replace function public.care_plans_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hospitalization_status public.hospitalization_status;
  v_approver_changed       boolean;
begin
  if tg_op = 'UPDATE' then
    v_approver_changed := new.approved_by is distinct from old.approved_by;
  else
    v_approver_changed := true;
  end if;

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

  if new.approved_by is not null and v_approver_changed then
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

comment on function public.care_plans_before_write() is 'Подставляет поликлинику пациента, запрещает активацию до выписки и требует утверждения врачом.';


create or replace function public.care_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_care_plan_status public.care_plan_status;
  v_assignee_changed boolean;
  v_assigner_changed boolean;
begin
  if tg_op = 'UPDATE' then
    v_assignee_changed := new.assigned_user_id is distinct from old.assigned_user_id
                       or new.organization_id  is distinct from old.organization_id;
    v_assigner_changed := new.assigned_by is distinct from old.assigned_by;
  else
    v_assignee_changed := true;
    v_assigner_changed := true;
  end if;

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

  if v_assignee_changed then
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

  if new.assigned_by is not null and v_assigner_changed then
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

comment on function public.care_assignments_before_write() is 'Проверяет активность плана, допустимость исполнителя и полномочия назначающего.';


revoke execute on function
  public.care_plans_before_write(),
  public.care_assignments_before_write()
from public, anon, authenticated;
