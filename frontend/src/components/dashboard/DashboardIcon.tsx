import type { ReactNode } from 'react'

export type DashboardIconName = 'patients' | 'hospital' | 'home' | 'pulse' | 'arrow' | 'spark' | 'check' | 'search'

const paths: Record<DashboardIconName, ReactNode> = {
  patients: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
  hospital: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6m-3-3v6m-3 10v-6h6v6" /></>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></>,
  pulse: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  arrow: <><path d="M4 12h15m-5-5 5 5-5 5" /></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
}

export const DashboardIcon: React.FC<{ name: DashboardIconName }> = ({ name }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name]}
  </svg>
)
