alter table public.patients
  add column if not exists created_by uuid references public.profiles (id) on delete set null
    default auth.uid();

comment on column public.patients.created_by is 'Медработник, зарегистрировавший пациента.';

create index if not exists patients_created_by_idx on public.patients (created_by);


create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.user_id = (select auth.uid())
       and m.is_active
       and m.role = 'SUPER_ADMIN'
  );
$$;

comment on function private.is_super_admin() is 'Проверяет наличие у текущего пользователя активной роли SUPER_ADMIN.';


create or replace function private.current_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
    from public.organization_memberships m
   where m.user_id = (select auth.uid())
     and m.is_active;
$$;


create or replace function private.patient_access_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
    from public.organization_memberships m
   where m.user_id = (select auth.uid())
     and m.is_active
     and m.role in ('ORGANIZATION_ADMIN', 'HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR');
$$;

comment on function private.patient_access_org_ids() is 'Организации, всех пациентов которых может видеть текущий пользователь.';


create or replace function private.has_org_role(
  p_organization_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.user_id = (select auth.uid())
       and m.is_active
       and m.organization_id = p_organization_id
       and m.role = any(p_roles)
  );
$$;


create or replace function private.is_clinician()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.user_id = (select auth.uid())
       and m.is_active
       and m.role in ('HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'NURSE')
  );
$$;


create or replace function private.shares_organization(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.user_id = p_user_id
       and m.is_active
       and m.organization_id = any(private.current_org_ids())
  );
$$;


create or replace function private.can_access_patient(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_patient_id is not null
    and (
      private.is_super_admin()

      or exists (
        select 1
          from public.hospitalizations h
         where h.patient_id = p_patient_id
           and h.organization_id = any(private.patient_access_org_ids())
      )

      or exists (
        select 1
          from public.care_plans cp
         where cp.patient_id = p_patient_id
           and (
             cp.source_organization_id    = any(private.patient_access_org_ids())
             or cp.receiving_organization_id = any(private.patient_access_org_ids())
           )
      )

      or exists (
        select 1
          from public.patients p
         where p.id = p_patient_id
           and p.primary_clinic_id = any(private.patient_access_org_ids())
      )

      or exists (
        select 1
          from public.care_assignments ca
         where ca.patient_id = p_patient_id
           and ca.assigned_user_id = (select auth.uid())
      )

      or exists (
        select 1
          from public.patients p
         where p.id = p_patient_id
           and p.created_by = (select auth.uid())
      )
    );
$$;

comment on function private.can_access_patient(uuid) is 'Единая проверка доступа к данным пациента.';


grant usage on schema private to authenticated;

grant execute on function
  private.is_super_admin(),
  private.current_org_ids(),
  private.patient_access_org_ids(),
  private.has_org_role(uuid, public.membership_role[]),
  private.is_clinician(),
  private.shares_organization(uuid),
  private.can_access_patient(uuid)
to authenticated;


revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

grant insert, update on table
  public.patients,
  public.hospitalizations,
  public.care_plans,
  public.care_assignments,
  public.diagnoses,
  public.observations,
  public.lab_results,
  public.medications,
  public.procedures,
  public.allergies,
  public.devices
to authenticated;

grant update on table public.profiles to authenticated;


drop policy if exists "Staff can read colleagues" on public.profiles;
create policy "Staff can read colleagues"
  on public.profiles for select to authenticated
  using ((select private.shares_organization(id)));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


drop policy if exists "Authenticated users can read organizations" on public.organizations;
create policy "Authenticated users can read organizations"
  on public.organizations for select to authenticated
  using (true);

drop policy if exists "Members can read memberships of their organizations" on public.organization_memberships;
create policy "Members can read memberships of their organizations"
  on public.organization_memberships for select to authenticated


  using ((select private.current_org_ids()) @> array[organization_id]);


drop policy if exists "Read accessible patients" on public.patients;
create policy "Read accessible patients"
  on public.patients for select to authenticated
  using ((select private.can_access_patient(id)));

drop policy if exists "Clinicians and admins can register patients" on public.patients;
create policy "Clinicians and admins can register patients"
  on public.patients for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and cardinality((select private.patient_access_org_ids())) > 0
  );

drop policy if exists "Update accessible patients" on public.patients;
create policy "Update accessible patients"
  on public.patients for update to authenticated
  using ((select private.can_access_patient(id)))
  with check ((select private.can_access_patient(id)));

drop policy if exists "Read twins of accessible patients" on public.digital_twins;
create policy "Read twins of accessible patients"
  on public.digital_twins for select to authenticated
  using ((select private.can_access_patient(patient_id)));


drop policy if exists "Read accessible hospitalizations" on public.hospitalizations;
create policy "Read accessible hospitalizations"
  on public.hospitalizations for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Hospital staff can admit" on public.hospitalizations;
create policy "Hospital staff can admit"
  on public.hospitalizations for insert to authenticated
  with check ((select private.has_org_role(organization_id,
    array['HOSPITAL_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[])));


drop policy if exists "Hospital staff can update their admissions" on public.hospitalizations;
create policy "Hospital staff can update their admissions"
  on public.hospitalizations for update to authenticated
  using ((select private.has_org_role(organization_id,
    array['HOSPITAL_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[])))
  with check ((select private.has_org_role(organization_id,
    array['HOSPITAL_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[])));

drop policy if exists "Read accessible care plans" on public.care_plans;
create policy "Read accessible care plans"
  on public.care_plans for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Source organization can create care plans" on public.care_plans;
create policy "Source organization can create care plans"
  on public.care_plans for insert to authenticated
  with check ((select private.has_org_role(source_organization_id,
    array['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[])));


drop policy if exists "Source or receiving organization can update care plans" on public.care_plans;
create policy "Source or receiving organization can update care plans"
  on public.care_plans for update to authenticated
  using (
    (select private.has_org_role(source_organization_id,
      array['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
    or (select private.has_org_role(receiving_organization_id,
      array['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  )
  with check (
    (select private.has_org_role(source_organization_id,
      array['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
    or (select private.has_org_role(receiving_organization_id,
      array['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  );


drop policy if exists "Read accessible care assignments" on public.care_assignments;
create policy "Read accessible care assignments"
  on public.care_assignments for select to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.can_access_patient(patient_id))
  );

drop policy if exists "Organization admins can assign" on public.care_assignments;
create policy "Organization admins can assign"
  on public.care_assignments for insert to authenticated
  with check (
    (select private.has_org_role(organization_id,
      array['ORGANIZATION_ADMIN']::public.membership_role[]))
    or (select private.is_super_admin())
  );


drop policy if exists "Assignee or organization admin can update assignments" on public.care_assignments;
create policy "Assignee or organization admin can update assignments"
  on public.care_assignments for update to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['ORGANIZATION_ADMIN']::public.membership_role[]))
  )
  with check (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['ORGANIZATION_ADMIN']::public.membership_role[]))
  );


drop policy if exists "Read accessible diagnoses" on public.diagnoses;
create policy "Read accessible diagnoses"
  on public.diagnoses for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can record diagnoses" on public.diagnoses;
create policy "Clinicians can record diagnoses"
  on public.diagnoses for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
    and recorded_by = (select auth.uid())
  );

drop policy if exists "Authors can correct their diagnoses" on public.diagnoses;
create policy "Authors can correct their diagnoses"
  on public.diagnoses for update to authenticated
  using (recorded_by = (select auth.uid())
         and (select private.can_access_patient(patient_id)))
  with check (recorded_by = (select auth.uid()));


drop policy if exists "Read accessible observations" on public.observations;
create policy "Read accessible observations"
  on public.observations for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can record observations" on public.observations;
create policy "Clinicians can record observations"
  on public.observations for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
    and recorded_by = (select auth.uid())
  );

drop policy if exists "Authors can correct their observations" on public.observations;
create policy "Authors can correct their observations"
  on public.observations for update to authenticated
  using (recorded_by = (select auth.uid())
         and (select private.can_access_patient(patient_id)))
  with check (recorded_by = (select auth.uid()));


drop policy if exists "Read accessible lab results" on public.lab_results;
create policy "Read accessible lab results"
  on public.lab_results for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can record lab results" on public.lab_results;
create policy "Clinicians can record lab results"
  on public.lab_results for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
    and recorded_by = (select auth.uid())
  );

drop policy if exists "Authors can correct their lab results" on public.lab_results;
create policy "Authors can correct their lab results"
  on public.lab_results for update to authenticated
  using (recorded_by = (select auth.uid())
         and (select private.can_access_patient(patient_id)))
  with check (recorded_by = (select auth.uid()));


drop policy if exists "Read accessible medications" on public.medications;
create policy "Read accessible medications"
  on public.medications for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Doctors can prescribe" on public.medications;
create policy "Doctors can prescribe"
  on public.medications for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and prescribed_by = (select auth.uid())
    and exists (
      select 1 from public.organization_memberships m
       where m.user_id = (select auth.uid())
         and m.is_active
         and m.role in ('HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR')
    )
  );

drop policy if exists "Prescribers can update their prescriptions" on public.medications;
create policy "Prescribers can update their prescriptions"
  on public.medications for update to authenticated
  using (prescribed_by = (select auth.uid())
         and (select private.can_access_patient(patient_id)))
  with check (prescribed_by = (select auth.uid()));


drop policy if exists "Read accessible procedures" on public.procedures;
create policy "Read accessible procedures"
  on public.procedures for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can record procedures" on public.procedures;
create policy "Clinicians can record procedures"
  on public.procedures for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
    and performed_by = (select auth.uid())
  );

drop policy if exists "Authors can correct their procedures" on public.procedures;
create policy "Authors can correct their procedures"
  on public.procedures for update to authenticated
  using (performed_by = (select auth.uid())
         and (select private.can_access_patient(patient_id)))
  with check (performed_by = (select auth.uid()));


drop policy if exists "Read accessible allergies" on public.allergies;
create policy "Read accessible allergies"
  on public.allergies for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can record allergies" on public.allergies;
create policy "Clinicians can record allergies"
  on public.allergies for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
    and recorded_by = (select auth.uid())
  );

drop policy if exists "Authors can correct their allergies" on public.allergies;
create policy "Authors can correct their allergies"
  on public.allergies for update to authenticated
  using (recorded_by = (select auth.uid())
         and (select private.can_access_patient(patient_id)))
  with check (recorded_by = (select auth.uid()));


drop policy if exists "Read accessible timeline" on public.twin_events;
create policy "Read accessible timeline"
  on public.twin_events for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Read accessible devices" on public.devices;
create policy "Read accessible devices"
  on public.devices for select to authenticated
  using ((select private.can_access_patient(patient_id)));

drop policy if exists "Clinicians can link devices" on public.devices;
create policy "Clinicians can link devices"
  on public.devices for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and (select private.is_clinician())
  );

drop policy if exists "Clinicians can update devices" on public.devices;
create policy "Clinicians can update devices"
  on public.devices for update to authenticated
  using ((select private.can_access_patient(patient_id))
         and (select private.is_clinician()))
  with check ((select private.can_access_patient(patient_id)));


drop policy if exists "Read accessible sync history" on public.device_sync_log;
create policy "Read accessible sync history"
  on public.device_sync_log for select to authenticated
  using ((select private.can_access_patient(patient_id)));
