type Finish = "black" | "bronze" | "silver"

const FINISH_PALETTE: Record<Finish, { spoke: string; lug: string }> = {
  black: { spoke: "#2a2a2c", lug: "#0a0a0b" },
  bronze: { spoke: "#8a5a30", lug: "#3a2510" },
  silver: { spoke: "#c8c8cc", lug: "#3a3a3d" },
}

type WheelProps = {
  size?: number
  finish?: Finish
  className?: string
  style?: React.CSSProperties
}

const Wheel = ({
  size = 320,
  finish = "black",
  className,
  style,
}: WheelProps) => {
  const cls =
    "wheel" +
    (finish === "bronze" ? " bronze" : finish === "silver" ? " silver" : "") +
    (className ? ` ${className}` : "")
  const { spoke, lug } = FINISH_PALETTE[finish]

  return (
    <div
      style={{ position: "relative", width: size, height: size, ...style }}
      aria-hidden
    >
      <div className={cls} style={{ width: size, height: size }} />
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {Array.from({ length: 6 }).map((_, i) => {
          const a1 = ((i * 60 - 4) * Math.PI) / 180
          const a2 = ((i * 60 + 4) * Math.PI) / 180
          const r1 = 16
          const r2 = 44
          const cx = 50
          const cy = 50
          const p = `
            M ${cx + Math.cos(a1) * r1} ${cy + Math.sin(a1) * r1}
            L ${cx + Math.cos(a1) * r2} ${cy + Math.sin(a1) * r2}
            L ${cx + Math.cos(a2) * r2} ${cy + Math.sin(a2) * r2}
            L ${cx + Math.cos(a2) * r1} ${cy + Math.sin(a2) * r1}
            Z
          `
          return (
            <path
              key={i}
              d={p}
              fill={spoke}
              stroke={lug}
              strokeWidth="0.4"
            />
          )
        })}
        {Array.from({ length: 6 }).map((_, i) => {
          const a = ((i * 60 + 30) * Math.PI) / 180
          const r = 8
          return (
            <circle
              key={`l${i}`}
              cx={50 + Math.cos(a) * r}
              cy={50 + Math.sin(a) * r}
              r="1.2"
              fill={lug}
            />
          )
        })}
        <circle cx="50" cy="50" r="3" fill={lug} />
      </svg>
    </div>
  )
}

export default Wheel
export type { Finish }
