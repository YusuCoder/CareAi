import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { tint } from '../../lib/visits'
import { buildEpisodes, type Episode } from '../../lib/episodes'
import { dateShort } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { TwinData } from '../../lib/twin'

type Kind = 'allergy' | 'chronic' | 'acute' | 'complication'

interface Item {
  id: string
  kind: Kind
  date: string | null
  name: string
  code: string | null
  detail: string | null
  active: boolean
  resolved: string | null
  organizationId: string | null
  episode: Episode | null
}

const KIND_COLOR: Record<Kind, string> = {
  allergy: 'var(--color-risk-critical)',
  chronic: 'var(--color-primary)',
  acute: 'var(--color-phase-hospital)',
  complication: 'var(--color-risk-high)',
}

const DAY = 86_400_000

/**
 * Где запись впервые появилась: у диагноза стационара это его госпитализация,
 * у остальных — обращение, в окно которого попадает дата (от поступления до
 * закрытия наблюдения). Та же логика окон, что и во вкладке «История».
 */
function findEpisode(episodes: Episode[], hospitalizationId: string | null, date: string | null): Episode | null {
  if (hospitalizationId) return episodes.find((episode) => episode.id === hospitalizationId) ?? null
  if (!date) return null
  const at = new Date(date).getTime()
  return episodes.find((episode) => {
    const from = new Date(episode.start).setHours(0, 0, 0, 0)
    const to = episode.end ? new Date(episode.end).getTime() + DAY : Date.now() + DAY
    return at >= from && at <= to
  }) ?? null
}

const Source: React.FC<{ item: Item; number: (e: Episode) => number; organizations: Record<string, string> }> = ({
  item, number, organizations,
}) => {
  const c = t.chronology
  if (item.episode) {
    return (
      <Link to={`?tab=history&episode=${item.episode.id}`} className="font-medium text-primary hover:underline">
        {c.episode} {number(item.episode)} · {organizations[item.episode.hospitalization.organization_id] ?? ''} →
      </Link>
    )
  }
  return (
    <span className="text-ink-muted">
      {c.outpatient}{item.organizationId && organizations[item.organizationId] ? ` · ${organizations[item.organizationId]}` : ''}
    </span>
  )
}

export const ChronologyTab: React.FC<{ data: TwinData }> = ({ data }) => {
  const c = t.chronology
  const { episodes } = useMemo(() => buildEpisodes(data), [data])
  const number = (episode: Episode) => episodes.length - episodes.indexOf(episode)

  const items = useMemo<Item[]>(() => {
    const allergies: Item[] = data.allergies.map((a) => ({
      id: a.id,
      kind: 'allergy',
      date: a.noted_at,
      name: a.substance,
      code: null,
      detail: [a.reaction, t.assistant.severity[a.severity], a.note].filter(Boolean).join(' · '),
      active: a.status === 'ACTIVE',
      resolved: null,
      organizationId: a.organization_id,
      episode: findEpisode(episodes, null, a.noted_at),
    }))

    const diagnoses: Item[] = data.diagnoses
      .filter((d) => d.status !== 'RULED_OUT')
      .map((d) => ({
        id: d.id,
        kind: d.type === 'COMPLICATION'
          ? 'complication'
          : d.type === 'COMORBIDITY' || (!d.hospitalization_id && d.status === 'ACTIVE')
            ? 'chronic'
            : 'acute',
        date: d.diagnosed_at,
        name: d.name,
        code: d.code,
        detail: d.notes,
        active: d.status === 'ACTIVE',
        resolved: d.resolved_at,
        organizationId: d.organization_id,
        episode: findEpisode(episodes, d.hospitalization_id, d.diagnosed_at),
      }))

    return [...allergies, ...diagnoses].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [data.allergies, data.diagnoses, episodes])

  const activeAllergies = items.filter((item) => item.kind === 'allergy' && item.active)
  const activeChronic = items.filter((item) => item.kind === 'chronic' && item.active)

  const years = useMemo(() => {
    const buckets: { year: string; items: Item[] }[] = []
    for (const item of items) {
      const year = item.date ? String(new Date(item.date).getFullYear()) : c.noDate
      const last = buckets[buckets.length - 1]
      if (last && last.year === year) last.items.push(item)
      else buckets.push({ year, items: [item] })
    }
    return buckets
  }, [items, c.noDate])

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
        {c.empty}
      </p>
    )
  }

  return (
    <section aria-label={c.title} className="space-y-5">
      <div>
        <h3 className="text-[1.0625rem] font-semibold">{c.title}</h3>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{c.subtitle}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div
          className="rounded-xl border px-4 py-3"
          style={{
            borderColor: activeAllergies.length ? tint(KIND_COLOR.allergy, 45) : 'var(--color-border)',
            backgroundColor: activeAllergies.length ? tint(KIND_COLOR.allergy, 5) : undefined,
          }}
        >
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR.allergy }}>
            ⚠ {c.allergies} · {activeAllergies.length}
          </p>
          {activeAllergies.length === 0 && <p className="mt-1 text-[0.8125rem] text-ink-muted">{c.noAllergies}</p>}
          <ul className="mt-1.5 space-y-2">
            {activeAllergies.map((item) => (
              <li key={item.id} className="text-[0.8125rem]">
                <p className="font-semibold">{item.name}</p>
                {item.detail && <p className="text-ink-muted">{item.detail}</p>}
                <p className="mt-0.5 text-[0.75rem]">
                  <span className="tabular text-ink-muted">{item.date ? dateShort(item.date) : ''} · </span>
                  <Source item={item} number={number} organizations={data.organizationNames} />
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border px-4 py-3">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR.chronic }}>
            {c.chronic} · {activeChronic.length}
          </p>
          {activeChronic.length === 0 && <p className="mt-1 text-[0.8125rem] text-ink-muted">{c.noChronic}</p>}
          <ul className="mt-1.5 space-y-2">
            {activeChronic.map((item) => (
              <li key={item.id} className="text-[0.8125rem]">
                <p className="font-semibold">
                  {item.name}
                  {item.code && <span className="font-normal text-ink-muted"> ({item.code})</span>}
                </p>
                <p className="mt-0.5 text-[0.75rem]">
                  <span className="tabular text-ink-muted">{c.since} {item.date ? dateShort(item.date) : '—'} · </span>
                  <Source item={item} number={number} organizations={data.organizationNames} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-5">
        {years.map((bucket) => (
          <div key={bucket.year}>
            <h4 className="tabular text-sm font-semibold text-ink-muted">{bucket.year}</h4>
            <ul className="mt-2 border-l border-border pl-4">
              {bucket.items.map((item) => (
                <li key={item.id} className="relative pb-4 pl-[1.3125rem] last:pb-0">
                  <span
                    aria-hidden
                    className="absolute -left-[0.3125rem] top-[0.4375rem] size-2.5 rounded-full ring-4 ring-[color:var(--color-surface)]"
                    style={{ backgroundColor: KIND_COLOR[item.kind] }}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="tabular text-[0.75rem] text-ink-muted">{item.date ? dateShort(item.date) : '—'}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[0.6875rem] font-medium"
                      style={{ color: KIND_COLOR[item.kind], backgroundColor: tint(KIND_COLOR[item.kind], 10) }}
                    >
                      {c.kinds[item.kind]}
                    </span>
                    <span className={`text-sm font-medium ${item.active ? '' : 'text-ink-muted'}`}>{item.name}</span>
                    {item.code && <span className="text-[0.75rem] text-ink-muted">{item.code}</span>}
                    <span className="text-[0.6875rem] text-ink-muted">
                      · {item.active ? c.active : item.resolved ? `${c.resolved} ${dateShort(item.resolved)}` : c.inactive}
                    </span>
                  </div>
                  {item.detail && <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{item.detail}</p>}
                  <p className="mt-0.5 text-[0.75rem]">
                    <Source item={item} number={number} organizations={data.organizationNames} />
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
