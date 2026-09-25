interface Props {
  values: number[]
  color: string
  width?: number
  height?: number
}

export const Sparkline: React.FC<Props> = ({ values, color, width = 92, height = 30 }) => {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 3

  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (values.length - 1)
    const y = height - pad - ((value - min) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${pad},${height} ${line} ${width - pad},${height}`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden className="shrink-0 overflow-visible">
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={1.6} fill={color} opacity={index === points.length - 1 ? 1 : 0.55} />
      ))}
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} />
    </svg>
  )
}
