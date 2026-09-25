import { t } from '../lib/i18n'

interface Props {
  /** Rendered size of the mark in pixels. */
  size?: number
  /** Show the wordmark beside the mark. */
  wordmark?: boolean
  className?: string
}

/**
 * The TwinCare mark: two halves of a cross handing over to each other, each
 * ending in a node. Source of the brand palette in index.css.
 */
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
