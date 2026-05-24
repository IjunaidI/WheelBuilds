/**
 * Top-down cross-section diagram of a wheel barrel + mounting pad. The orange
 * tick shows where the mounting pad sits relative to the centerline (`CL`) for
 * the given ET. Used inside the AdvancedFitmentPanel so power users can see
 * what "+30mm" actually looks like.
 */
const OffsetDiagram = ({ value }: { value: number }) => {
  // Centerline = 100, barrel runs x=30..170 (140 wide). Pad shifts toward the
  // street side as the offset grows.
  const padX = 50 + (value / 60) * 30
  const padPx = 30 + (padX / 100) * 140
  return (
    <svg
      viewBox="0 0 200 100"
      width="100%"
      height={60}
      role="img"
      aria-label={`Cross-section showing mounting pad at +${value}mm offset`}
    >
      <line
        x1="100"
        y1="10"
        x2="100"
        y2="90"
        stroke="rgba(15,15,16,0.2)"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <text
        x="100"
        y="8"
        textAnchor="middle"
        fontSize="7"
        fontFamily="var(--mono)"
        fill="#8A8A8E"
      >
        CL
      </text>

      <rect x="30" y="35" width="140" height="30" fill="none" stroke="#0F0F10" strokeWidth="1.5" />
      <rect x="30" y="40" width="140" height="20" fill="rgba(15,15,16,0.04)" />

      <line x1={padPx} y1="32" x2={padPx} y2="68" stroke="#FF6A00" strokeWidth="2.5" />
      <circle cx={padPx} cy="50" r="3" fill="#FF6A00" />

      <text x="32" y="80" fontSize="7" fontFamily="var(--mono)" fill="#8A8A8E">
        INBOARD
      </text>
      <text x="168" y="80" fontSize="7" fontFamily="var(--mono)" fill="#8A8A8E" textAnchor="end">
        STREET SIDE
      </text>

      <line x1="100" y1="22" x2={padPx} y2="22" stroke="#FF6A00" strokeWidth="1" />
      <polygon
        points={`${padPx},22 ${padPx - 3},20 ${padPx - 3},24`}
        fill="#FF6A00"
      />
      <text
        x={(100 + padPx) / 2}
        y="18"
        textAnchor="middle"
        fontSize="8"
        fontFamily="var(--mono)"
        fontWeight="600"
        fill="#FF6A00"
      >
        {value >= 0 ? "+" : ""}
        {value}MM
      </text>
    </svg>
  )
}

export default OffsetDiagram
