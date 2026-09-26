-- правила самоконтроля для конкретного пациента.
--
-- при выписке врач пишет требования к наблюдению обычным текстом, CareTwin AI
-- раскладывает их на правила (edge-функция check-in-rules), врач проверяет и
-- выписывает. правила сохраняются здесь и управляют ботом: когда писать, сколько
-- ждать ответа, какие вопросы задавать и какие личные пороги риска применять.
-- нет строки — действует общий check_in_settings, как раньше.

create table public.check_in_schedules (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients (id) on delete cascade,
  care_plan_id          uuid,
  times                 time[] not null default array['10:00'::time],
  every_n_days          smallint not null default 1 check (every_n_days between 1 and 7),
  start_date            date not null default current_date,
  end_date              date,
  response_window_hours smallint not null default 6 check (response_window_hours between 1 and 24),
  questions             text[] not null default array[
                          'TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
                          'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS'],
  thresholds            jsonb not null default '{}'::jsonb,
  requirements          text,
  source                text not null default 'DOCTOR' check (source in ('AI', 'DOCTOR', 'DEFAULT')),
  ai_rationale          text,
  ai_model              text,
  active                boolean not null default true,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint check_in_schedules_times_count check (cardinality(times) between 1 and 4),
  constraint check_in_schedules_dates check (end_date is null or end_date >= start_date),
  constraint check_in_schedules_questions check (
    cardinality(questions) between 1 and 8
    and questions <@ array['TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
                           'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS']),
  constraint check_in_schedules_thresholds_object check (jsonb_typeof(thresholds) = 'object'),
  constraint check_in_schedules_plan_fkey
    foreign key (care_plan_id, patient_id) references public.care_plans (id, patient_id) on delete cascade
);

comment on table public.check_in_schedules is
  'Правила самоконтроля пациента в Telegram: время, частота, срок, вопросы и личные пороги. Задаются при выписке.';
comment on column public.check_in_schedules.times is 'Местное время опросов (часовой пояс из check_in_settings).';
comment on column public.check_in_schedules.thresholds is
  'Личные пороги поверх risk_rules: {"SPO2_LOW": {"medium": 93, "high": 91, "quote": "…"}}. Только из текста врача.';
comment on column public.check_in_schedules.requirements is 'Исходные требования врача, из которых получены правила.';
comment on column public.check_in_schedules.source is
  'AI — предложено CareTwin AI и принято врачом без правок; DOCTOR — врач правил; DEFAULT — значения по умолчанию.';

-- у пациента одно действующее правило
create unique index check_in_schedules_one_active
  on public.check_in_schedules (patient_id) where active;
create index check_in_schedules_plan_idx on public.check_in_schedules (care_plan_id);

create trigger check_in_schedules_set_updated_at
  before update on public.check_in_schedules
  for each row execute function public.set_updated_at();

alter table public.check_in_schedules enable row level security;
revoke all on table public.check_in_schedules from anon;
revoke delete, truncate on table public.check_in_schedules from authenticated;
grant select, insert, update on table public.check_in_schedules to authenticated;

create policy "Read accessible check-in schedules"
  on public.check_in_schedules for select to authenticated
  using ((select private.can_access_patient(patient_id)));

-- задаёт врач, который выписывает, или врач поликлиники, принявшей пациента
create policy "Doctors set check-in schedules"
  on public.check_in_schedules for insert to authenticated
  with check (
    (select private.can_access_patient(patient_id))
    and exists (
      select 1 from public.organization_memberships m
       where m.user_id = (select auth.uid()) and m.is_active
         and m.role in ('HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR'))
  );

create policy "Doctors update check-in schedules"
  on public.check_in_schedules for update to authenticated
  using (
    (select private.can_access_patient(patient_id))
    and exists (
      select 1 from public.organization_memberships m
       where m.user_id = (select auth.uid()) and m.is_active
         and m.role in ('HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR'))
  )
  with check ((select private.can_access_patient(patient_id)));


-- вопросы конкретного опроса фиксируются при его создании
alter table public.patient_check_ins
  add column if not exists steps text[];

comment on column public.patient_check_ins.steps is 'Порядок вопросов этого опроса. NULL — все вопросы по умолчанию.';


-- действующее правило пациента на сегодня
create or replace function private.active_schedule(p_patient_id uuid)
returns public.check_in_schedules
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
    from public.check_in_schedules s
   where s.patient_id = p_patient_id and s.active
   limit 1;
$$;

create or replace function private.default_steps()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
               'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS'];
$$;


-- кому пора писать: по личным правилам, иначе по общему расписанию.
-- в результат добавлен порядок вопросов, поэтому функцию пересоздаём
drop function if exists public.claim_due_check_ins();
create function public.claim_due_check_ins()
returns table (check_in_id uuid, patient_id uuid, telegram_id bigint, first_name text, steps text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  g       public.check_in_settings;
  v_local timestamp;
  v_today date;
begin
  select * into g from public.check_in_settings limit 1;
  v_local := now() at time zone g.timezone;
  v_today := v_local::date;

  return query
  with plans as (
    select p.id, p.telegram_id, p.first_name,
           coalesce(s.times, array[make_time(g.send_hour, 0, 0)]) as times,
           coalesce(s.every_n_days, 1) as every_n,
           coalesce(s.start_date, v_today) as start_on,
           s.end_date as end_on,
           coalesce(s.response_window_hours, g.response_window_hours) as window_h,
           coalesce(s.questions, private.default_steps()) as questions
      from public.patients p
      join public.digital_twins dt on dt.patient_id = p.id
      left join public.check_in_schedules s on s.patient_id = p.id and s.active
     where p.telegram_id is not null
       and p.is_active
       and dt.current_status = 'POST_DISCHARGE_MONITORING'
  ),
  slots as (
    -- последний наступивший сегодня слот и следующий за ним
    select pl.*,
           (select max(t) from unnest(pl.times) t where t <= v_local::time) as slot,
           (select min(t) from unnest(pl.times) t where t > v_local::time) as next_slot
      from plans pl
     where v_today >= pl.start_on
       and (pl.end_on is null or v_today <= pl.end_on)
       and (v_today - pl.start_on) % pl.every_n = 0
  ),
  due as (
    select s.*
      from slots s
     where s.slot is not null
       and not exists (
         select 1 from public.patient_check_ins c
          where c.patient_id = s.id
            and (c.status = 'IN_PROGRESS'
                 or c.started_at >= ((v_today + s.slot) at time zone g.timezone)))
  ),
  created as (
    insert into public.patient_check_ins (patient_id, trigger, current_step, due_at, steps)
    select d.id, 'SCHEDULED', d.questions[1],
           -- ответ ждём не дольше, чем до следующего слота
           least(now() + make_interval(hours => d.window_h),
                 coalesce((v_today + d.next_slot) at time zone g.timezone, 'infinity'::timestamptz)),
           d.questions
      from due d
    on conflict do nothing
    returning id, patient_check_ins.patient_id, patient_check_ins.steps
  )
  select c.id, c.patient_id, d.telegram_id, d.first_name, c.steps
    from created c join due d on d.id = c.patient_id;
end;
$$;


create or replace function public.start_check_in(p_telegram_id bigint, p_trigger text default 'PATIENT')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient  uuid;
  v_first    text;
  v_row      public.patient_check_ins;
  v_window   smallint;
  v_steps    text[];
  v_created  boolean := false;
begin
  select p.id, p.first_name into v_patient, v_first
    from public.patients p
   where p.telegram_id = p_telegram_id and p.is_active;

  if v_patient is null then return jsonb_build_object('status', 'NOT_LINKED'); end if;

  select * into v_row from public.patient_check_ins c
   where c.patient_id = v_patient and c.status = 'IN_PROGRESS';

  if not found then
    select coalesce(s.response_window_hours, g.response_window_hours),
           coalesce(s.questions, private.default_steps())
      into v_window, v_steps
      from public.check_in_settings g
      left join public.check_in_schedules s on s.patient_id = v_patient and s.active;

    insert into public.patient_check_ins (patient_id, trigger, current_step, due_at, steps)
    values (v_patient, p_trigger, v_steps[1], now() + make_interval(hours => coalesce(v_window, 6)), v_steps)
    returning * into v_row;
    v_created := true;
  end if;

  return jsonb_build_object('status', 'OK', 'created', v_created, 'check_in_id', v_row.id,
                            'current_step', v_row.current_step, 'first_name', v_first,
                            'patient_id', v_patient,
                            'steps', to_jsonb(coalesce(v_row.steps, private.default_steps())));
end;
$$;


create or replace function public.telegram_session(p_telegram_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'patient_id', p.id,
           'first_name', p.first_name,
           'check_in', (
             select jsonb_build_object('id', c.id, 'current_step', c.current_step,
                                       'answers', c.answers, 'due_at', c.due_at,
                                       'steps', to_jsonb(coalesce(c.steps, private.default_steps())))
               from public.patient_check_ins c
              where c.patient_id = p.id and c.status = 'IN_PROGRESS'))
    from public.patients p
   where p.telegram_id = p_telegram_id
     and p.is_active;
$$;


-- следующий вопрос определяет база по вопросам этого опроса;
-- p_next_step оставлен для совместимости и не используется
create or replace function public.save_check_in_answer(
  p_telegram_id bigint,
  p_step        text,
  p_answer      jsonb,
  p_next_step   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.patient_check_ins;
  v_steps  text[];
  v_next   text;
  v_plan   uuid;
  v_type   public.observation_type;
  v_num    numeric;
  v_sec    numeric;
  v_bool   boolean;
  v_text   text;
  v_note   text;
  v_unit   text;
  v_choice text := p_answer ->> 'choice';
  v_skip   boolean := coalesce((p_answer ->> 'skipped')::boolean, false);
begin
  select ci.* into c
    from public.patient_check_ins ci
    join public.patients p on p.id = ci.patient_id
   where p.telegram_id = p_telegram_id and ci.status = 'IN_PROGRESS'
   for update of ci;

  if not found then return jsonb_build_object('status', 'NO_CHECK_IN'); end if;

  v_steps := coalesce(c.steps, private.default_steps());

  -- старые кнопки из предыдущих сообщений игнорируем
  if c.current_step is distinct from p_step
     and not (c.current_step = 'SYMPTOMS_TEXT' and p_step = 'SYMPTOMS') then
    return jsonb_build_object('status', 'STALE_STEP', 'current_step', c.current_step,
                              'steps', to_jsonb(v_steps));
  end if;

  if v_skip and p_step not in ('TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE') then
    raise exception 'Step % cannot be skipped', p_step using errcode = '22023';
  end if;

  if not v_skip then
    case p_step
      when 'TEMPERATURE' then
        v_type := 'TEMPERATURE'; v_num := (p_answer ->> 'value')::numeric; v_unit := '°C';
        if v_num is null or v_num not between 34 and 43 then raise exception 'Temperature out of range' using errcode = '22003'; end if;
      when 'SPO2' then
        v_type := 'SPO2'; v_num := (p_answer ->> 'value')::numeric; v_unit := '%';
        if v_num is null or v_num not between 50 and 100 then raise exception 'SpO2 out of range' using errcode = '22003'; end if;
      when 'HEART_RATE' then
        v_type := 'HEART_RATE'; v_num := (p_answer ->> 'value')::numeric; v_unit := 'уд/мин';
        if v_num is null or v_num not between 30 and 220 then raise exception 'Heart rate out of range' using errcode = '22003'; end if;
      when 'BLOOD_PRESSURE' then
        v_type := 'BLOOD_PRESSURE'; v_unit := 'мм рт. ст.';
        v_num := (p_answer ->> 'systolic')::numeric; v_sec := (p_answer ->> 'diastolic')::numeric;
        if v_num is null or v_sec is null or v_num not between 60 and 260
           or v_sec not between 30 and 160 or v_num <= v_sec then
          raise exception 'Blood pressure out of range' using errcode = '22003';
        end if;
      when 'WELLBEING' then
        v_type := 'WELLBEING_TREND'; v_text := v_choice;
        if coalesce(v_text, '') not in ('BETTER', 'SAME', 'WORSE') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_num := case v_text when 'BETTER' then 1 when 'SAME' then 0 else -1 end;
      when 'DYSPNEA' then
        v_type := 'SHORTNESS_OF_BREATH'; v_text := v_choice;
        if coalesce(v_text, '') not in ('NONE', 'SAME', 'WORSE') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_bool := v_text <> 'NONE';
      when 'SYMPTOMS' then
        v_type := 'NEW_SYMPTOMS'; v_text := v_choice;
        if coalesce(v_text, '') not in ('YES', 'NO') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_bool := v_text = 'YES';
        v_note := nullif(left(btrim(p_answer ->> 'text'), 500), '');
      when 'MEDICATIONS' then
        v_type := 'MEDICATION_ADHERENCE'; v_text := v_choice;
        if coalesce(v_text, '') not in ('YES', 'NO') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_bool := v_text = 'YES';
      else
        raise exception 'Unknown step %', p_step using errcode = '22023';
    end case;

    select cp.id into v_plan
      from public.care_plans cp
     where cp.patient_id = c.patient_id and cp.status = 'ACTIVE'
     order by cp.created_at desc
     limit 1;

    -- пересчёт риска — при завершении опроса, а не после каждого ответа
    perform set_config('caretwin.defer_risk', 'on', true);

    insert into public.observations (
      patient_id, care_plan_id, type, value_numeric, value_secondary, value_boolean,
      value_text, unit, is_abnormal, note, source, recorded_at, check_in_id)
    values (
      c.patient_id, v_plan, v_type, v_num, v_sec, v_bool, v_text, v_unit,
      private.observation_flagged(v_type, v_num, v_sec, v_text),
      v_note, 'PATIENT', now(), c.id);

    perform set_config('caretwin.defer_risk', '', true);
  end if;

  v_next := v_steps[array_position(v_steps, p_step) + 1];

  update public.patient_check_ins
     set answers      = answers || jsonb_build_object(p_step, p_answer),
         current_step = v_next
   where id = c.id;

  return jsonb_build_object('status', 'OK', 'current_step', v_next, 'steps', to_jsonb(v_steps));
end;
$$;


-- личные пороги врача поверх общих правил
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
  v_personal jsonb;
  v_medium   numeric;
  v_high     numeric;
  v_override jsonb;
begin
  if (select auth.uid()) is not null and not private.can_access_patient(p_patient_id) then
    raise exception 'No access to patient %', p_patient_id using errcode = '42501';
  end if;

  select coalesce(s.thresholds, '{}'::jsonb) into v_personal
    from public.check_in_schedules s
   where s.patient_id = p_patient_id and s.active;
  v_personal := coalesce(v_personal, '{}'::jsonb);

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

      v_override := v_personal -> r.code;
      v_medium := coalesce((v_override ->> 'medium')::numeric, r.medium_value);
      v_high   := coalesce((v_override ->> 'high')::numeric, r.high_value);

      if r.direction = 'ABOVE' then
        if v_high is not null and v >= v_high then lvl := 'HIGH';
        elsif v_medium is not null and v >= v_medium then lvl := 'MEDIUM';
        end if;
      else
        if v_high is not null and v <= v_high then lvl := 'HIGH';
        elsif v_medium is not null and v <= v_medium then lvl := 'MEDIUM';
        end if;
      end if;

      if lvl is null then continue; end if;

      reasons := reasons || jsonb_build_object(
        'code', r.code, 'level', lvl, 'label', r.label,
        'detail', r.label || ' ' || private.risk_num(v) || coalesce(' ' || r.unit, '')
                  || case when v_override is not null
                          then ' (порог врача: ' || case r.direction when 'ABOVE' then '≥ ' else '≤ ' end
                               || private.risk_num(case lvl when 'HIGH' then v_high else v_medium end) || ')'
                          else coalesce(' (' || r.normal_text || ')', '') end,
        'value', v, 'personal', v_override is not null,
        'source_table', 'observations', 'source_id', o.id,
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


-- выписка сохраняет правила самоконтроля вместе с планом наблюдения
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
  v_monitoring  jsonb := p_payload -> 'plan' -> 'monitoring';
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

  update public.hospitalizations
     set status            = 'DISCHARGED',
         discharged_at     = v_discharged,
         primary_diagnosis = coalesce(nullif(btrim(p_payload ->> 'primary_diagnosis'), ''), primary_diagnosis),
         procedure_summary = nullif(btrim(p_payload ->> 'procedure_summary'), ''),
         discharge_summary = nullif(btrim(p_payload ->> 'discharge_summary'), '')
   where id = v_hosp_id;

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

    -- 8. правила самоконтроля в Telegram. прежние правила пациента больше не действуют
    if v_monitoring is not null and jsonb_typeof(v_monitoring) = 'object' then
      update public.check_in_schedules set active = false
       where patient_id = v_patient and active;

      insert into public.check_in_schedules (
        patient_id, care_plan_id, times, every_n_days, start_date, end_date,
        response_window_hours, questions, thresholds, requirements, source,
        ai_rationale, ai_model, created_by)
      values (
        v_patient, v_plan_id,
        coalesce((select array_agg(distinct t::time)
                    from jsonb_array_elements_text(v_monitoring -> 'times') t),
                 array['10:00'::time]),
        coalesce((v_monitoring ->> 'every_n_days')::smallint, 1),
        v_start,
        coalesce(nullif(v_monitoring ->> 'end_date', '')::date, nullif(v_plan ->> 'end_date', '')::date),
        coalesce((v_monitoring ->> 'response_window_hours')::smallint, 6),
        coalesce((select array_agg(q) from jsonb_array_elements_text(v_monitoring -> 'questions') q),
                 array['TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
                       'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS']),
        coalesce(v_monitoring -> 'thresholds', '{}'::jsonb),
        nullif(btrim(coalesce(v_plan ->> 'instructions', '')), ''),
        coalesce(v_monitoring ->> 'source', 'DOCTOR'),
        nullif(btrim(coalesce(v_monitoring ->> 'rationale', '')), ''),
        nullif(v_monitoring ->> 'model', ''),
        v_actor);
    end if;

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
  'Оформляет выписку целиком одной транзакцией: эпикриз, диагнозы, процедуры, назначения, показатели, анализы, план наблюдения с графиком осмотров и правила самоконтроля.';

grant execute on function public.discharge_patient(jsonb) to authenticated;


revoke execute on function
  private.active_schedule(uuid),
  private.default_steps(),
  public.claim_due_check_ins(),
  public.start_check_in(bigint, text),
  public.telegram_session(bigint),
  public.save_check_in_answer(bigint, text, jsonb, text)
from public, anon, authenticated;
