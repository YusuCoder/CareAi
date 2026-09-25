const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'shrink-0',
}

export const VitalIcon: React.FC<{ kind: string; color: string }> = ({ kind, color }) => {
  const props = { ...base, stroke: color }
  switch (kind) {
    case 'TEMPERATURE':
      return <svg {...props}><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z" /><path d="M12 9v5.5" /></svg>
    case 'HEART_RATE':
      return <svg {...props}><path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" /></svg>
    case 'BLOOD_PRESSURE':
      return <svg {...props}><path d="M6 3v5a4 4 0 0 0 8 0V3" /><path d="M10 15.5V13" /><circle cx="18" cy="17" r="3" /><path d="M10 17.5a5 5 0 0 0 5 0" /></svg>
    case 'SPO2':
      return <svg {...props}><path d="M12 4v16" /><path d="M12 8c-1.5-2-6-2.5-6 2 0 5 3.5 8 6 8" /><path d="M12 8c1.5-2 6-2.5 6 2 0 5-3.5 8-6 8" /></svg>
    case 'PAIN':
      return <svg {...props}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill={color} /></svg>
    case 'RESPIRATORY_RATE':
      return <svg {...props}><path d="M12 3v7m0-3-3 3m3-3 3 3" /><path d="M9 7C6 7 3 12 3 17c0 3 4 3 6 1V7Zm6 0c3 0 6 5 6 10 0 3-4 3-6 1V7Z" /></svg>
    case 'WEIGHT':
      return <svg {...props}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9 11a3 3 0 0 1 6 0" /><path d="M12 11V8.5" /></svg>
    case 'RESTING_HEART_RATE':
    case 'HRV':
      return <svg {...props}><path d="M3 12h3.5l2-5 3 10 2.5-5H21" /></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="8" /></svg>
  }
}
