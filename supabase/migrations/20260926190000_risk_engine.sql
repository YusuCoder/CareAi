-- движок риска.
--
-- уровень риска раньше ставил только сид. теперь его считают детерминированные
-- правила из таблицы risk_rules: пороги, тренды последних измерений и ответы
-- пациента. каждая причина ссылается на запись, из которой она взята, — тот же
-- принцип «каждое утверждение цитирует запись», что и у функций ИИ.
--
-- ИИ здесь не участвует: он только пересказывает найденные причины медсестре.

alter table public.digital_twins
  add column if not exists risk_reasons      jsonb not null default '[]'::jsonb,
  add column if not exists risk_evaluated_at timestamptz;

comment on column public.digital_twins.risk_reasons is
  'Причины текущего уровня риска: [{code, level, label, detail, source_table, source_id, recorded_at}].';
comment on column public.digital_twins.risk_evaluated_at is
  'Когда движок риска последний раз пересчитал уровень. NULL — уровень поставлен вручную или сидом.';


-- правила --------------------------------------------------------------------

create table public.risk_rules (
  code             text primary key check (code ~ '^[A-Z0-9_]+$'),
  kind             text not null check (kind in
                     ('THRESHOLD', 'TREND', 'ANSWER', 'LAB_FLAG', 'OVERDUE_CALL', 'COMBINATION')),
  observation_type public.observation_type,
  value_field      text not null default 'PRIMARY' check (value_field in ('PRIMARY', 'SECONDARY')),
  direction        text check (direction in ('ABOVE', 'BELOW')),
  medium_value     numeric,
  high_value       numeric,
  trend_delta      numeric check (trend_delta is null or trend_delta > 0),
  trend_points     smallint not null default 3 check (trend_points between 2 and 10),
  match_text       text,
  level            public.risk_level check (level is null or level in ('LOW', 'MEDIUM', 'HIGH')),
  window_hours     integer not null default 48 check (window_hours > 0),
  label            text not null check (btrim(label) <> ''),
  unit             text,
  normal_text      text,
  enabled          boolean not null default true,
  updated_at       timestamptz not null default now(),

  constraint risk_rules_threshold_shape check (
    kind <> 'THRESHOLD'
    or (observation_type is not null and direction is not null
        and (medium_value is not null or high_value is not null))),
  constraint risk_rules_trend_shape check (
    kind <> 'TREND'
    or (observation_type is not null and direction is not null
        and trend_delta is not null and level is not null)),
  constraint risk_rules_answer_shape check (
    kind <> 'ANSWER' or (observation_type is not null and match_text is not null and level is not null)),
  constraint risk_rules_lab_shape check (
    kind <> 'LAB_FLAG' or (match_text is not null and level is not null)),
  constraint risk_rules_call_shape check (kind <> 'OVERDUE_CALL' or level is not null),
  -- COMBINATION: medium_value = сколько причин уровня MEDIUM поднимают риск до level
  constraint risk_rules_combination_shape check (
    kind <> 'COMBINATION' or (medium_value is not null and level is not null))
);

comment on table public.risk_rules is
  'Настраиваемые правила движка риска. Демо-пороги; менять может только SUPER_ADMIN.';
comment on column public.risk_rules.direction is
  'THRESHOLD: ABOVE — значение ≥ порога, BELOW — значение ≤ порога. TREND: ABOVE — рост, BELOW — снижение.';

create trigger risk_rules_set_updated_at
  before update on public.risk_rules
  for each row execute function public.set_updated_at();

insert into public.risk_rules
  (code, kind, observation_type, value_field, direction, medium_value, high_value,
   trend_delta, trend_points, match_text, level, window_hours, label, unit, normal_text)
values
  -- пороги: смотрим последнее измерение за окно
  ('SPO2_LOW',       'THRESHOLD', 'SPO2',             'PRIMARY',   'BELOW', 93,   90,   null, 3, null, null, 48, 'Сатурация',            '%',          'норма ≥ 94%'),
  ('TEMP_HIGH',      'THRESHOLD', 'TEMPERATURE',      'PRIMARY',   'ABOVE', 37.5, 39.0, null, 3, null, null, 48, 'Температура',          '°C',         'норма < 37,5 °C'),
  ('HR_HIGH',        'THRESHOLD', 'HEART_RATE',       'PRIMARY',   'ABOVE', 100,  120,  null, 3, null, null, 48, 'Пульс',                'уд/мин',     'норма 50–100'),
  ('HR_LOW',         'THRESHOLD', 'HEART_RATE',       'PRIMARY',   'BELOW', 50,   40,   null, 3, null, null, 48, 'Пульс',                'уд/мин',     'норма 50–100'),
  ('BP_SYS_HIGH',    'THRESHOLD', 'BLOOD_PRESSURE',   'PRIMARY',   'ABOVE', 160,  180,  null, 3, null, null, 48, 'Систолическое давление','мм рт. ст.', 'норма < 140'),
  ('BP_SYS_LOW',     'THRESHOLD', 'BLOOD_PRESSURE',   'PRIMARY',   'BELOW', 100,  90,   null, 3, null, null, 48, 'Систолическое давление','мм рт. ст.', 'норма ≥ 100'),
  ('BP_DIA_HIGH',    'THRESHOLD', 'BLOOD_PRESSURE',   'SECONDARY', 'ABOVE', 100,  110,  null, 3, null, null, 48, 'Диастолическое давление','мм рт. ст.','норма < 90'),
  ('RR_HIGH',        'THRESHOLD', 'RESPIRATORY_RATE', 'PRIMARY',   'ABOVE', 22,   25,   null, 3, null, null, 48, 'Частота дыхания',      'в мин',      'норма 12–20'),
  ('GLUCOSE_HIGH',   'THRESHOLD', 'GLUCOSE',          'PRIMARY',   'ABOVE', 13.9, 20,   null, 3, null, null, 48, 'Глюкоза',              'ммоль/л',    'норма 3,9–10'),
  ('GLUCOSE_LOW',    'THRESHOLD', 'GLUCOSE',          'PRIMARY',   'BELOW', 3.9,  3.0,  null, 3, null, null, 48, 'Глюкоза',              'ммоль/л',    'норма 3,9–10'),

  -- тренды: монотонное изменение последних N измерений за окно
  ('SPO2_FALLING',   'TREND',     'SPO2',             'PRIMARY',   'BELOW', null, null, 3,    3, null, 'MEDIUM', 168, 'Сатурация снижается',  '%',      null),
  ('TEMP_RISING',    'TREND',     'TEMPERATURE',      'PRIMARY',   'ABOVE', null, null, 0.8,  3, null, 'MEDIUM', 168, 'Температура растёт',   '°C',     null),
  ('HR_RISING',      'TREND',     'HEART_RATE',       'PRIMARY',   'ABOVE', null, null, 15,   3, null, 'MEDIUM', 168, 'Пульс учащается',      'уд/мин', null),

  -- ответы пациента: последнее сообщение за окно
  ('DYSPNEA_WORSE',  'ANSWER',    'SHORTNESS_OF_BREATH',  'PRIMARY', null, null, null, null, 3, 'WORSE', 'MEDIUM', 48, 'Одышка усилилась (со слов пациента)', null, null),
  ('FEELING_WORSE',  'ANSWER',    'WELLBEING_TREND',      'PRIMARY', null, null, null, null, 3, 'WORSE', 'MEDIUM', 48, 'Самочувствие хуже, чем вчера (со слов пациента)', null, null),
  ('NEW_SYMPTOMS',   'ANSWER',    'NEW_SYMPTOMS',         'PRIMARY', null, null, null, null, 3, 'YES',   'MEDIUM', 48, 'Новые или усилившиеся симптомы (со слов пациента)', null, null),
  ('MEDS_MISSED',    'ANSWER',    'MEDICATION_ADHERENCE', 'PRIMARY', null, null, null, null, 3, 'NO',    'MEDIUM', 48, 'Назначенные препараты приняты не все (со слов пациента)', null, null),

  -- прочие записи двойника
  ('LAB_CRITICAL',   'LAB_FLAG',  null, 'PRIMARY', null, null, null, null, 3, 'CRITICAL', 'HIGH',   168, 'Критический лабораторный результат', null, null),
  ('CALL_OVERDUE',   'OVERDUE_CALL', null, 'PRIMARY', null, null, null, null, 3, null,    'MEDIUM', 48,  'Активный вызов просрочен', null, null),

  -- несколько одновременных отклонений среднего уровня дают высокий
  ('MULTIPLE_FACTORS','COMBINATION', null, 'PRIMARY', null, 3, null, null, 3, null, 'HIGH', 48, 'Несколько отклонений одновременно', null, null);


alter table public.risk_rules enable row level security;
revoke all on table public.risk_rules from anon;
revoke insert, delete, truncate on table public.risk_rules from authenticated;
grant select, update on table public.risk_rules to authenticated;

create policy "Authenticated users can read risk rules"
  on public.risk_rules for select to authenticated
  using (true);

create policy "Super admins can tune risk rules"
  on public.risk_rules for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));


-- оценка ----------------------------------------------------------------------

create or replace function private.risk_rank(p_level public.risk_level)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_level when 'CRITICAL' then 3 when 'HIGH' then 2 when 'MEDIUM' then 1 else 0 end;
$$;

create or replace function private.risk_num(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(trim_scale(p_value)::text, '.', ',');
$$;


create or replace function public.evaluate_risk(p_patient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r        record;
  o        record;
  v        numeric;
  lvl      public.risk_level;
  top      int := 0;
  mediums  int := 0;
  reasons  jsonb := '[]'::jsonb;
  vals     numeric[];
  ids      uuid[];
  times    timestamptz[];
  n        int;
  i        int;
  monotone boolean;
begin
  -- пользователь видит только своих пациентов; сервисный вызов (auth.uid() is null)
  -- идёт из триггеров и edge-функций
  if (select auth.uid()) is not null and not private.can_access_patient(p_patient_id) then
    raise exception 'No access to patient %', p_patient_id using errcode = '42501';
  end if;

  for r in
    select * from public.risk_rules
     where enabled and kind <> 'COMBINATION'
     order by kind, code
  loop
    lvl := null;

    if r.kind = 'THRESHOLD' then
      select ob.id, ob.recorded_at,
             case r.value_field when 'SECONDARY' then ob.value_secondary else ob.value_numeric end as val
        into o
        from public.observations ob
       where ob.patient_id = p_patient_id
         and ob.type = r.observation_type
         and ob.recorded_at > now() - make_interval(hours => r.window_hours)
         and ob.recorded_at <= now() + interval '5 minutes'
       order by ob.recorded_at desc
       limit 1;

      if not found or o.val is null then continue; end if;
      v := o.val;

      if r.direction = 'ABOVE' then
        if r.high_value is not null and v >= r.high_value then lvl := 'HIGH';
        elsif r.medium_value is not null and v >= r.medium_value then lvl := 'MEDIUM';
        end if;
      else
        if r.high_value is not null and v <= r.high_value then lvl := 'HIGH';
        elsif r.medium_value is not null and v <= r.medium_value then lvl := 'MEDIUM';
        end if;
      end if;

      if lvl is null then continue; end if;

      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', lvl, 'label', r.label,
        'detail', r.label || ' ' || private.risk_num(v) || coalesce(' ' || r.unit, '')
                  || coalesce(' (' || r.normal_text || ')', ''),
        'value', v, 'source_table', 'observations', 'source_id', o.id,
        'recorded_at', o.recorded_at);

    elsif r.kind = 'TREND' then
      select array_agg(s.val order by s.recorded_at),
             array_agg(s.id order by s.recorded_at),
             array_agg(s.recorded_at order by s.recorded_at)
        into vals, ids, times
        from (
          select ob.id, ob.recorded_at,
                 case r.value_field when 'SECONDARY' then ob.value_secondary else ob.value_numeric end as val
            from public.observations ob
           where ob.patient_id = p_patient_id
             and ob.type = r.observation_type
             and ob.recorded_at > now() - make_interval(hours => r.window_hours)
             and ob.recorded_at <= now() + interval '5 minutes'
             and (case r.value_field when 'SECONDARY' then ob.value_secondary else ob.value_numeric end) is not null
           order by ob.recorded_at desc
           limit r.trend_points
        ) s;

      n := coalesce(array_length(vals, 1), 0);
      if n < r.trend_points then continue; end if;

      -- без шагов в обратную сторону, а суммарное изменение не меньше порога
      monotone := true;
      for i in 2..n loop
        if (r.direction = 'ABOVE' and vals[i] < vals[i - 1])
           or (r.direction = 'BELOW' and vals[i] > vals[i - 1]) then
          monotone := false;
        end if;
      end loop;

      if not monotone then continue; end if;
      if r.direction = 'ABOVE' and vals[n] - vals[1] < r.trend_delta then continue; end if;
      if r.direction = 'BELOW' and vals[1] - vals[n] < r.trend_delta then continue; end if;

      lvl := r.level;
      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', lvl, 'label', r.label,
        'detail', r.label || ': ' ||
                  (select string_agg(private.risk_num(x), ' → ') from unnest(vals) x)
                  || coalesce(' ' || r.unit, ''),
        'values', to_jsonb(vals), 'source_table', 'observations', 'source_id', ids[n],
        'source_ids', to_jsonb(ids), 'recorded_at', times[n]);

    elsif r.kind = 'ANSWER' then
      select ob.id, ob.recorded_at, ob.value_text, ob.note
        into o
        from public.observations ob
       where ob.patient_id = p_patient_id
         and ob.type = r.observation_type
         and ob.recorded_at > now() - make_interval(hours => r.window_hours)
       order by ob.recorded_at desc
       limit 1;

      if not found or o.value_text is distinct from r.match_text then continue; end if;

      lvl := r.level;
      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', lvl, 'label', r.label,
        'detail', r.label || coalesce(': «' || left(o.note, 160) || '»', ''),
        'source_table', 'observations', 'source_id', o.id, 'recorded_at', o.recorded_at);

    elsif r.kind = 'LAB_FLAG' then
      select l.id, coalesce(l.resulted_at, l.collected_at) as at, l.analyte,
             coalesce(private.risk_num(l.value_numeric), l.value_text) as shown, l.unit
        into o
        from public.lab_results l
       where l.patient_id = p_patient_id
         and l.flag::text = r.match_text
         and coalesce(l.resulted_at, l.collected_at) > now() - make_interval(hours => r.window_hours)
       order by coalesce(l.resulted_at, l.collected_at) desc
       limit 1;

      if not found then continue; end if;

      lvl := r.level;
      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', lvl, 'label', r.label,
        'detail', r.label || ': ' || o.analyte || ' ' || o.shown || coalesce(' ' || o.unit, ''),
        'source_table', 'lab_results', 'source_id', o.id, 'recorded_at', o.at);

    elsif r.kind = 'OVERDUE_CALL' then
      select c.id, c.due_at
        into o
        from public.active_calls c
       where c.patient_id = p_patient_id
         and c.status in ('PENDING', 'ACKNOWLEDGED')
         and now() > c.due_at
       order by c.due_at
       limit 1;

      if not found then continue; end if;

      lvl := r.level;
      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', lvl, 'label', r.label,
        'detail', r.label || ' (срок ' || to_char(o.due_at at time zone 'Asia/Tashkent', 'DD.MM HH24:MI') || ')',
        'source_table', 'active_calls', 'source_id', o.id, 'recorded_at', o.due_at);
    end if;

    if lvl is not null then
      top := greatest(top, private.risk_rank(lvl));
      if lvl = 'MEDIUM' then mediums := mediums + 1; end if;
    end if;
  end loop;

  -- совокупность: несколько средних отклонений сразу
  for r in
    select * from public.risk_rules where enabled and kind = 'COMBINATION'
  loop
    if mediums >= r.medium_value and top < private.risk_rank(r.level) then
      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', r.level, 'label', r.label,
        'detail', r.label || ' (' || mediums || ')',
        'source_table', null, 'source_id', null, 'recorded_at', now());
      top := private.risk_rank(r.level);
    end if;
  end loop;

  -- сначала самые тяжёлые причины
  select coalesce(jsonb_agg(x.r order by private.risk_rank((x.r ->> 'level')::public.risk_level) desc,
                                        x.r ->> 'recorded_at' desc), '[]'::jsonb)
    into reasons
    from jsonb_array_elements(reasons) as x(r);

  return jsonb_build_object(
    'level', case top when 2 then 'HIGH' when 1 then 'MEDIUM' else 'LOW' end,
    'reasons', reasons,
    'evaluated_at', now());
end;
$$;

comment on function public.evaluate_risk(uuid) is
  'Детерминированная оценка риска по risk_rules. Ничего не меняет; возвращает {level, reasons, evaluated_at}.';


-- тревоги ---------------------------------------------------------------------

create type public.alert_kind as enum ('RISK', 'MISSED_CHECK_IN');
create type public.alert_status as enum ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

create table public.alerts (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  organization_id  uuid references public.organizations (id) on delete set null,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  kind             public.alert_kind not null,
  level            public.risk_level not null,
  status           public.alert_status not null default 'OPEN',
  title            text not null check (btrim(title) <> ''),
  reasons          jsonb not null default '[]'::jsonb,
  ai_summary       text,
  ai_model         text,
  ai_generated_at  timestamptz,
  ai_error         text,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolution_note  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint alerts_resolved_has_timestamp check (status <> 'RESOLVED' or resolved_at is not null)
);

comment on table public.alerts is
  'Тревоги для медсестры: риск MEDIUM/HIGH от движка риска или пропущенный самоконтроль. Закрывает человек.';
comment on column public.alerts.ai_summary is
  'Пояснение CareTwin AI к найденным правилами причинам. Не диагноз и не назначение.';

create index alerts_assignee_status_idx on public.alerts (assigned_user_id, status, created_at desc);
create index alerts_org_status_idx on public.alerts (organization_id, status, created_at desc);
create index alerts_patient_idx on public.alerts (patient_id, created_at desc);
create index alerts_open_idx on public.alerts (created_at desc) where status <> 'RESOLVED';

create trigger alerts_set_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();


create or replace function public.alerts_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ACKNOWLEDGED' and old.status = 'OPEN' then
    new.acknowledged_at := coalesce(new.acknowledged_at, now());
    new.acknowledged_by := coalesce(new.acknowledged_by, (select auth.uid()));
  end if;
  if new.status = 'RESOLVED' and old.status is distinct from 'RESOLVED' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, (select auth.uid()));
    if new.acknowledged_at is null then
      new.acknowledged_at := new.resolved_at;
      new.acknowledged_by := new.resolved_by;
    end if;
  end if;
  if new.status <> old.status and old.status = 'RESOLVED' then
    raise exception 'Resolved alert % cannot be reopened', old.id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger alerts_stamp
  before update on public.alerts
  for each row execute function public.alerts_stamp();


create or replace function public.alerts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'ALERT_CREATED', 'HOME', new.title, new.created_at,
      (select string_agg(x ->> 'detail', '; ') from jsonb_array_elements(new.reasons) x),
      case when new.level in ('HIGH', 'CRITICAL') then 'CRITICAL'::public.twin_event_severity
           else 'WARNING'::public.twin_event_severity end,
      'alerts', new.id, null, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'level', new.level::text,
                         'assigned_user_id', new.assigned_user_id));
  elsif new.status = 'RESOLVED' and old.status is distinct from 'RESOLVED' then
    perform public.log_twin_event(
      new.patient_id, 'ALERT_RESOLVED', 'HOME', 'Тревога закрыта: ' || new.title,
      coalesce(new.resolved_at, now()), new.resolution_note, 'INFO',
      'alerts', new.id, new.resolved_by, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'level', new.level::text));
  end if;
  return null;
end;
$$;

create trigger alerts_log_twin_event
  after insert or update on public.alerts
  for each row execute function public.alerts_after_write();


-- кому адресовать тревогу: открытое назначение, иначе поликлиника пациента
create or replace function private.alert_recipient(p_patient_id uuid, out user_id uuid, out organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ca.assigned_user_id, ca.organization_id
    from public.care_assignments ca
   where ca.patient_id = p_patient_id
     and ca.status in ('ACTIVE', 'ACCEPTED', 'PENDING')
   order by (ca.status = 'ACTIVE') desc, ca.assigned_at desc
   limit 1;
$$;


-- пересчёт: обновляет двойника и при MEDIUM/HIGH заводит тревогу
create or replace function public.refresh_risk(p_patient_id uuid, p_trigger text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eval      jsonb;
  v_level     public.risk_level;
  v_previous  public.risk_level;
  v_status    public.twin_status;
  v_open      record;
  v_user      uuid;
  v_org       uuid;
  v_alert_id  uuid;
begin
  v_eval  := public.evaluate_risk(p_patient_id);
  v_level := (v_eval ->> 'level')::public.risk_level;

  select dt.risk_level, dt.current_status into v_previous, v_status
    from public.digital_twins dt
   where dt.patient_id = p_patient_id
   for update;

  if not found then
    return v_eval || jsonb_build_object('alert_id', null);
  end if;

  update public.digital_twins
     set risk_level        = v_level,
         risk_reasons      = v_eval -> 'reasons',
         risk_evaluated_at = now()
   where patient_id = p_patient_id;

  -- в стационаре пациента ведут врачи отделения; тревоги — для наблюдения дома
  if v_level in ('MEDIUM', 'HIGH') and v_status is distinct from 'HOSPITALIZED' then
    select a.id, a.level into v_open
      from public.alerts a
     where a.patient_id = p_patient_id
       and a.kind = 'RISK'
       and a.status <> 'RESOLVED'
     order by a.created_at desc
     limit 1;

    -- новая тревога — только если открытой нет или уровень вырос
    if v_open.id is null or private.risk_rank(v_level) > private.risk_rank(v_open.level) then
      select r.user_id, r.organization_id into v_user, v_org
        from private.alert_recipient(p_patient_id) r;

      if v_org is null then
        select p.primary_clinic_id into v_org from public.patients p where p.id = p_patient_id;
      end if;

      insert into public.alerts (patient_id, organization_id, assigned_user_id, kind, level, title, reasons)
      values (p_patient_id, v_org, v_user, 'RISK', v_level,
              case v_level when 'HIGH' then 'Высокий риск' else 'Средний риск' end
                || coalesce(': ' || (v_eval -> 'reasons' -> 0 ->> 'detail'), ''),
              v_eval -> 'reasons')
      returning id into v_alert_id;

      if v_open.id is not null then
        update public.alerts
           set status = 'RESOLVED', resolved_at = now(),
               resolution_note = 'Заменена тревогой более высокого уровня'
         where id = v_open.id;
      end if;
    end if;
  end if;

  return v_eval || jsonb_build_object('previous', v_previous, 'alert_id', v_alert_id,
                                      'trigger', p_trigger);
end;
$$;

comment on function public.refresh_risk(uuid, text) is
  'Пересчитывает риск, сохраняет причины в digital_twins и при MEDIUM/HIGH создаёт тревогу. Только для сервера.';


-- причины видны и в хронологии при смене уровня
create or replace function public.digital_twins_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.risk_level is distinct from old.risk_level then
    perform public.log_twin_event(
      new.patient_id,
      'RISK_LEVEL_CHANGED',
      case when new.current_status = 'HOSPITALIZED'
           then 'HOSPITAL'::public.care_phase
           else 'HOME'::public.care_phase end,
      'Risk level: ' || coalesce(old.risk_level::text, 'not assessed')
        || ' → ' || coalesce(new.risk_level::text, 'not assessed'),
      now(),
      (select string_agg(x ->> 'detail', '; ')
         from jsonb_array_elements(coalesce(new.risk_reasons, '[]'::jsonb)) x),
      case new.risk_level
        when 'CRITICAL' then 'CRITICAL'::public.twin_event_severity
        when 'HIGH'     then 'WARNING'::public.twin_event_severity
        else 'INFO'::public.twin_event_severity
      end,
      'digital_twins', new.id, null::uuid, null::uuid,
      jsonb_build_object('from', old.risk_level::text, 'to', new.risk_level::text,
                         'reasons', coalesce(new.risk_reasons, '[]'::jsonb),
                         'engine', new.risk_evaluated_at is not null)
    );
  end if;
  return null;
end;
$$;


-- новые данные пересчитывают риск. на уровне оператора, чтобы пакетная
-- вставка давала одну оценку на пациента. самоконтроль пишет ответы по одному
-- и откладывает пересчёт до завершения опроса (caretwin.defer_risk).
create or replace function public.clinical_data_refresh_risk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('caretwin.defer_risk', true), '') = 'on' then
    return null;
  end if;

  perform public.refresh_risk(s.patient_id, tg_table_name)
     from (select distinct patient_id from new_rows) s;
  return null;
end;
$$;

create trigger observations_refresh_risk
  after insert on public.observations
  referencing new table as new_rows
  for each statement execute function public.clinical_data_refresh_risk();

create trigger lab_results_refresh_risk
  after insert on public.lab_results
  referencing new table as new_rows
  for each statement execute function public.clinical_data_refresh_risk();


revoke execute on function
  private.risk_rank(public.risk_level),
  private.risk_num(numeric),
  private.alert_recipient(uuid),
  public.refresh_risk(uuid, text),
  public.alerts_stamp(),
  public.alerts_after_write(),
  public.digital_twins_after_update(),
  public.clinical_data_refresh_risk()
from public, anon, authenticated;

revoke execute on function public.evaluate_risk(uuid) from public, anon;
grant execute on function public.evaluate_risk(uuid) to authenticated;


-- RLS тревог -------------------------------------------------------------------

alter table public.alerts enable row level security;
revoke all on table public.alerts from anon;
revoke insert, delete, truncate, update on table public.alerts from authenticated;
grant select on table public.alerts to authenticated;
-- медсестра только подтверждает и закрывает; отметки ставит триггер
grant update (status, resolution_note) on table public.alerts to authenticated;

create policy "Read accessible alerts"
  on public.alerts for select to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.can_access_patient(patient_id))
  );

create policy "Assignee or receiving organization works alerts"
  on public.alerts for update to authenticated
  using (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  )
  with check (
    assigned_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id,
      array['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN']::public.membership_role[]))
  );


-- Realtime: панель медсестры получает тревоги и события без перезагрузки.
-- postgres_changes проверяет RLS для каждого подписчика.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['alerts', 'twin_events', 'digital_twins'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
