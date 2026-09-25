import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AddRecordMenu } from './AddRecordMenu'
import { t } from '../../lib/i18n'

const IconBack = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)
const IconSearch = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
  </svg>
)
const IconMore = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" />
  </svg>
)

export const TwinTopBar: React.FC<{ name: string }> = ({ name }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted transition-colors hover:text-ink"
      >
        <IconBack />
        {t.twin.back}
      </Link>
      <span aria-hidden className="text-ink-muted/50">/</span>
      <span className="truncate text-[0.8125rem] font-medium">{name}</span>

      <form
        className="relative ml-auto"
        onSubmit={(event) => {
          event.preventDefault()
          navigate(`/patients?q=${encodeURIComponent(query.trim())}`)
        }}
      >
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
          <IconSearch />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.twin.search}
          className="w-52 rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-[0.8125rem] outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted/70 focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_16%,transparent)] sm:w-64"
        />
      </form>

      <button
        type="button"
        aria-label="…"
        className="rounded-lg border border-border p-2 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        <IconMore />
      </button>

      <AddRecordMenu />
    </div>
  )
}
