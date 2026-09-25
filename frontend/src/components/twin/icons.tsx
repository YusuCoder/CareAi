const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'shrink-0',
}

export const IconId = () => (
  <svg {...base}><rect x="2.5" y="5" width="19" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16.2a3.4 3.4 0 0 1 6 0" /><path d="M14 10h4M14 14h4" /></svg>
)
export const IconPhone = () => (
  <svg {...base}><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z" /></svg>
)
export const IconTelegram = () => (
  <svg {...base}><path d="M21 4.5 2.8 11.3l5.3 1.7L19 6.2l-8.4 8.4.4 5 2.6-3.6 4.4 3.2z" /></svg>
)
export const IconPin = () => (
  <svg {...base}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
)
export const IconAlert = () => (
  <svg {...base} width={18} height={18}><circle cx="12" cy="12" r="9.2" /><path d="M12 7.5v5.5" /><path d="M12 16.2v.2" /></svg>
)
export const IconPlus = () => (
  <svg {...base} width={16} height={16}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconCaret = () => (
  <svg {...base} width={14} height={14}><path d="M6 9.5l6 6 6-6" /></svg>
)
