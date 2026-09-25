import { NavLink } from 'react-router-dom'

import { useAuth } from '../../contexts/AuthContext'
import { fullName } from '../../lib/format'
import { roleLabel, t } from '../../lib/i18n'
import { navigationFor, type NavItem } from '../../lib/navigation'
import { useIncomingCount } from '../../lib/queries'
import { IconChevron, IconClose, IconCollapse, IconExpand, IconSignOut } from './icons'

interface Props {
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

const Tooltip: React.FC<{ children: string }> = ({ children }) => (
  <span className="rail-tip pointer-events-none absolute left-[calc(100%+0.875rem)] z-50 hidden whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg lg:block">
    {children}
  </span>
)

const Avatar: React.FC<{ name: string; url: string | null; size: number }> = ({ name, url, size }) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return url ? (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-white/15 font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || '—'}
    </span>
  )
}

export const Sidebar: React.FC<Props> = ({ open, onClose, collapsed, onToggleCollapsed }) => {
  const { profile, memberships, activeMembership, setActiveMembership, signOut } = useAuth()
  const items = navigationFor(
    activeMembership?.role ?? null,
    activeMembership?.organization.type ?? null,
  )
  const incoming = useIncomingCount(items.some((item) => item.badge === 'incoming'))

  const showLabels = !collapsed
  const [home, ...work] = items
  const name = fullName(profile)

  const renderItem = (item: NavItem) => {
    const { to, label, Icon, badge, end } = item
    return (
      <li key={to}>
        <NavLink
          to={to}
          end={end}
          onClick={onClose}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) =>
            [
              'rail-item group relative flex h-11 items-center rounded-lg outline-none transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-white/60',
              showLabels ? 'gap-3 pl-2 pr-1.5' : 'w-11 justify-center',
              isActive ? 'text-white' : 'text-white/55 hover:text-white',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white"
                />
              )}
              <Icon />
              {showLabels && (
                <>
                  <span
                    className={`mr-auto truncate text-[0.875rem] ${isActive ? 'font-medium' : ''}`}
                  >
                    {label}
                  </span>
                  {badge === 'incoming' && incoming > 0 && (
                    <span
                      className="tabular rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold text-[color:var(--color-rail-deep)]"
                      style={{ backgroundColor: 'var(--color-spine-alert)' }}
                    >
                      {incoming}
                    </span>
                  )}
                  <IconChevron />
                </>
              )}

              {collapsed && badge === 'incoming' && incoming > 0 && (
                <span
                  className="tabular absolute -right-1.5 -top-1 flex size-[1.0625rem] items-center justify-center rounded-full text-[0.625rem] font-semibold text-[color:var(--color-rail-deep)]"
                  style={{ backgroundColor: 'var(--color-spine-alert)' }}
                >
                  {incoming}
                </span>
              )}

              {collapsed && <Tooltip>{label}</Tooltip>}
            </>
          )}
        </NavLink>
      </li>
    )
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={[
          'rail fixed inset-y-0 left-0 z-40 flex flex-col px-3 py-5',
          'transition-[transform,width] duration-250 lg:translate-x-0',
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-[15.5rem]',
          'w-[15.5rem]',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className={`flex items-center ${showLabels ? 'gap-2.5 px-1' : 'justify-center'}`}>
          <img
            src="/logo.png"
            width={32}
            height={32}
            alt={t.brand}
            className="shrink-0 rounded-lg bg-white/95 p-1"
          />
          {showLabels && (
            <p className="mr-auto truncate text-[0.9375rem] font-semibold tracking-tight text-white">
              {t.brand}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.nav.close}
            className="rounded-md p-1.5 text-white/70 hover:text-white lg:hidden"
          >
            <IconClose />
          </button>
        </div>

        <div className="my-4 h-px bg-[color:var(--color-rail-line)]" />

        <nav className="flex-1 overflow-y-auto overflow-x-visible" aria-label={t.nav.menu}>
          <ul className="space-y-0.5">{renderItem(home)}</ul>
          <div className="my-2.5 h-px bg-[color:var(--color-rail-line)]" />
          <ul className="space-y-0.5">{work.map(renderItem)}</ul>
        </nav>

        <div className="mt-3 border-t border-[color:var(--color-rail-line)] pt-3">
          {showLabels && memberships.length > 1 && (
            <select
              value={activeMembership?.id ?? ''}
              onChange={(event) => setActiveMembership(event.target.value)}
              className="mb-2 w-full rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-[0.8125rem] text-white"
            >
              {memberships.map((membership) => (
                <option key={membership.id} value={membership.id} className="text-ink">
                  {membership.organization.name} — {roleLabel[membership.role]}
                </option>
              ))}
            </select>
          )}

          <div className={showLabels ? 'flex items-center gap-2.5' : 'flex flex-col items-center gap-1'}>
            <span className="rail-item relative shrink-0">
              <Avatar name={name} url={profile?.avatar_url ?? null} size={showLabels ? 36 : 34} />
              {collapsed && <Tooltip>{name}</Tooltip>}
            </span>

            {showLabels && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-medium text-white">{name}</p>
                <p className="truncate text-[0.75rem] text-white/60">
                  {activeMembership?.job_title ||
                    (activeMembership ? roleLabel[activeMembership.role] : t.common.dash)}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => void signOut()}
              aria-label={t.common.signOut}
              title={showLabels ? t.common.signOut : undefined}
              className={[
                'rail-item relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                'text-white/55 outline-none transition-colors duration-150 hover:text-white',
                'focus-visible:ring-2 focus-visible:ring-white/60',
              ].join(' ')}
            >
              <IconSignOut />
              {collapsed && <Tooltip>{t.common.signOut}</Tooltip>}
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.nav.expand : t.nav.collapse}
            className={[
              'mt-1.5 hidden h-9 items-center rounded-lg text-white/40 outline-none transition-colors',
              'hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/60 lg:flex',
              showLabels ? 'w-full gap-3 pl-2' : 'w-11 justify-center',
            ].join(' ')}
          >
            {collapsed ? <IconExpand /> : <IconCollapse />}
            {showLabels && <span className="text-[0.8125rem]">{t.nav.collapse}</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
