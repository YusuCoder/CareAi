import { t } from '../lib/i18n'

interface Props {
  size?: number
  wordmark?: boolean
  className?: string
}

export const Logo: React.FC<Props> = ({ size = 32, wordmark = false, className = '' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt={wordmark ? '' : t.brand}
      aria-hidden={wordmark || undefined}
      className="shrink-0"
      style={{ width: size, height: size }}
    />
    {wordmark && (
      <span className="text-[1.0625rem] font-semibold tracking-tight text-ink">{t.brand}</span>
    )}
  </span>
)
