import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { Sidebar } from './Sidebar'
import { IconMenu } from './icons'
import { t } from '../../lib/i18n'

const COLLAPSED_KEY = 'caretwin.railCollapsed'

function useRailCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // Если хранилище недоступно, состояние панели остаётся только в памяти.
    }
  }, [collapsed])

  return [collapsed, () => setCollapsed((value) => !value)]
}

interface Props {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export const DashboardLayout: React.FC<Props> = ({ title, subtitle, actions, children }) => {
  const [menuOpen, setMenuOpen] = useState<boolean>(false)
  const [collapsed, toggleCollapsed] = useRailCollapsed()

  return (
    <div
      className={`min-h-screen bg-surface transition-[padding] duration-250 ${
        collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-[15.5rem]'
      }`}
    >
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <header className="flex flex-wrap items-start gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t.nav.menu}
            className="-ml-1 rounded-md p-2 text-ink-muted hover:bg-surface-sunken lg:hidden"
          >
            <IconMenu />
          </button>

          <div className="mr-auto min-w-0">
            {title && <h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          </div>

          {actions}
        </header>

        <div className={title || subtitle ? 'mt-5' : 'mt-3'}>{children}</div>
      </div>
    </div>
  )
}
