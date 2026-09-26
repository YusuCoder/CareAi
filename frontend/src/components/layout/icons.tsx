const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IconOverview = () => (
  <svg {...base}><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>
)
export const IconPatients = () => (
  <svg {...base}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.6" /><path d="M17.5 20a5.2 5.2 0 0 0-2-4.1" /></svg>
)
export const IconAdmissions = () => (
  <svg {...base}><path d="M3 20V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v14" /><path d="M14 11h6a1 1 0 0 1 1 1v8" /><path d="M2 20h20" /><path d="M8 8v4M6 10h4" /></svg>
)
export const IconCarePlans = () => (
  <svg {...base}><path d="M9 4h6v2.5H9z" /><path d="M15 5h2.5A1.5 1.5 0 0 1 19 6.5v13A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H9" /><path d="M8.5 12.5l2 2 4.5-4.5" /></svg>
)
export const IconPostDischarge = () => (
  <svg {...base}><path d="M3 12h4l2-5 3 10 2.5-5H21" /></svg>
)
export const IconIncoming = () => (
  <svg {...base}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v5.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5V13z" /></svg>
)
export const IconAssignments = () => (
  <svg {...base}><circle cx="10" cy="8" r="3.2" /><path d="M4 20a6 6 0 0 1 12 0" /><path d="M16.5 12.5l1.8 1.8 3.2-3.4" /></svg>
)
export const IconAttention = () => (
  <svg {...base}><path d="M12 4.5 21 19H3z" /><path d="M12 10v4" /><path d="M12 16.8v.2" /></svg>
)
export const IconStaff = () => (
  <svg {...base}><circle cx="8" cy="9" r="2.8" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M2.5 19a5.5 5.5 0 0 1 11 0" /><path d="M14 19a4.6 4.6 0 0 1 7.5-3.3" /></svg>
)
export const IconActiveCalls = () => (
  <svg {...base}><path d="M3.5 5.8a1.8 1.8 0 0 1 1.8-1.8h2.1a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.5 1.1l-1.5.8a11 11 0 0 0 5.2 5.2l.8-1.5a1 1 0 0 1 1.1-.5l1.4.3" /><circle cx="17.5" cy="16.5" r="4" /><path d="M17.5 14.6v2l1.3.8" /></svg>
)
export const IconMenu = () => (
  <svg {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
)
export const IconClose = () => (
  <svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconChevron = () => (
  <svg {...base} width={16} height={16} className="shrink-0 opacity-45"><path d="M9.5 6l6 6-6 6" /></svg>
)
export const IconExpand = () => (
  <svg {...base} width={20} height={20}><path d="M9 6l6 6-6 6" /></svg>
)
export const IconCollapse = () => (
  <svg {...base} width={20} height={20}><path d="M15 6l-6 6 6 6" /></svg>
)
export const IconSignOut = () => (
  <svg {...base}><path d="M15 12H4.5" /><path d="M8 8.5 4.5 12 8 15.5" /><path d="M10 5.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 19v-.5" /></svg>
)
