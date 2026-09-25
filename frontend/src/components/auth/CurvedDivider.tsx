interface Props {
  pulse: number
  animated: boolean
}

export const CARE_CURVE =
  'M0.94,0 C1.00,0.16 1.00,0.30 0.955,0.44 C0.905,0.60 0.885,0.72 0.925,0.88 C0.945,0.95 0.95,0.98 0.94,1'

export const CurvedDivider: React.FC<Props> = ({ pulse, animated }) => (
  <svg
    className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full lg:block"
    viewBox="0 0 1 1"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id="careCurveGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="50%" stopColor="#d9ccff" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
    </defs>

    <path
      d={CARE_CURVE}
      fill="none"
      stroke="#ffffff"
      strokeOpacity="0.18"
      strokeWidth="1"
      vectorEffect="non-scaling-stroke"
    />

    {animated && (
      <path
        className="curve-glow"
        d={CARE_CURVE}
        pathLength={1}
        fill="none"
        stroke="url(#careCurveGlow)"
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    )}

    {animated && pulse > 0 && (
      <path
        key={pulse}
        className="curve-pulse"
        d={CARE_CURVE}
        pathLength={1}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.85"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    )}
  </svg>
)
