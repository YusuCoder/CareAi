export interface Series {
  label: string
  color: string
  points: { at: number; value: number }[]
}

interface Props {
  series: Series[]
  height?: number
  callout?: string
}

const PAD = { top: 16, right: 46, bottom: 20, left: 30 }

export const TrendChart: React.FC<Props> = ({ series, height = 210, callout }) => {
  const all = series.flatMap((one) => one.points)
  if (all.length < 2) return null

  const width = 640
  const minAt = Math.min(...all.map((point) => point.at))
  const maxAt = Math.max(...all.map((point) => point.at))
  const spanAt = maxAt - minAt || 1
  const maxValue = Math.max(...all.map((point) => point.value))
  const top = Math.ceil(maxValue / 10) * 10 || 10

  const x = (at: number) => PAD.left + ((at - minAt) / spanAt) * (width - PAD.left - PAD.right)
  const y = (value: number) =>
    height - PAD.bottom - (value / top) * (height - PAD.top - PAD.bottom)

  const ticks = [0, top / 3, (top / 3) * 2, top].map((value) => Math.round(value))
  const lead = series[0]
  const last = lead?.points[lead.points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      preserveAspectRatio="none"
      role="img"
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)}
            stroke="var(--color-border)" strokeWidth={1}
          />
          <text
            x={PAD.left - 8} y={y(tick) + 3} textAnchor="end"
            fontSize={10} fill="var(--color-ink-muted)"
          >
            {tick}
          </text>
        </g>
      ))}

      {series.map((one) => (
        <g key={one.label}>
          <polyline
            points={one.points.map((point) => `${x(point.at)},${y(point.value)}`).join(' ')}
            fill="none" stroke={one.color} strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round"
          />
          {one.points.map((point) => (
            <circle key={point.at} cx={x(point.at)} cy={y(point.value)} r={2.4} fill={one.color} />
          ))}
        </g>
      ))}

      {last && callout && (
        <g>
          <rect
            x={x(last.at) + 6} y={y(last.value) - 11}
            width={callout.length * 6.4 + 12} height={20} rx={5}
            fill={lead.color}
          />
          <text
            x={x(last.at) + 12} y={y(last.value) + 3}
            fontSize={11} fontWeight={600} fill="#fff"
          >
            {callout}
          </text>
        </g>
      )}
    </svg>
  )
}
