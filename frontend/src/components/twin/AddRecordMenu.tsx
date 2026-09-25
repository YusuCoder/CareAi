import { useEffect, useRef, useState } from 'react'

import { IconCaret, IconPlus } from './icons'
import { t } from '../../lib/i18n'

export const AddRecordMenu: React.FC = () => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover"
      >
        <IconPlus />
        {t.twin.addRecord}
        <IconCaret />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
          {Object.values(t.twin.addKinds).map((kind) => (
            <span
              key={kind}
              className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-ink-muted/70"
            >
              {kind}
              <span className="text-[0.6875rem]">{t.twin.soon}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
