type IconName =
  | "search"
  | "user"
  | "heart"
  | "bag"
  | "garage"
  | "arrow-right"
  | "check"
  | "shipping"
  | "shield"
  | "badge"
  | "return"
  | "x"
  | "chevron-down"
  | "filter"
  | "grid"
  | "sort"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "facebook"

type IconProps = {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
}

const Icon = ({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 1.5,
  className,
  style,
}: IconProps) => {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
    "aria-hidden": true,
  }
  switch (name) {
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case "user":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      )
    case "heart":
      return (
        <svg {...props}>
          <path d="M12 21s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 6 14.5 5 16.5 5c3.5 0 6 3.5 4.5 7-2 4.5-9 9-9 9z" />
        </svg>
      )
    case "bag":
      return (
        <svg {...props}>
          <path d="M6 8h12l-1 12H7L6 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      )
    case "garage":
      return (
        <svg {...props}>
          <path d="M3 11l9-6 9 6" />
          <path d="M5 11v9h14v-9" />
          <path d="M8 14h8M8 17h8" />
        </svg>
      )
    case "arrow-right":
      return (
        <svg {...props}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )
    case "check":
      return (
        <svg {...props}>
          <path d="M5 12l5 5L20 7" />
        </svg>
      )
    case "shipping":
      return (
        <svg {...props}>
          <rect x="2" y="7" width="13" height="10" />
          <path d="M15 10h4l3 3v4h-7" />
          <circle cx="6.5" cy="18.5" r="1.5" />
          <circle cx="17.5" cy="18.5" r="1.5" />
        </svg>
      )
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
        </svg>
      )
    case "badge":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      )
    case "return":
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      )
    case "x":
      return (
        <svg {...props}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )
    case "chevron-down":
      return (
        <svg {...props}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )
    case "filter":
      return (
        <svg {...props}>
          <path d="M3 6h18M6 12h12M10 18h4" />
        </svg>
      )
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      )
    case "sort":
      return (
        <svg {...props}>
          <path d="M7 4v16M3 16l4 4 4-4M17 4l4 4M17 4v16M13 8l4-4" />
        </svg>
      )
    case "instagram":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill={color} />
        </svg>
      )
    case "youtube":
      return (
        <svg {...props}>
          <rect x="2.5" y="5" width="19" height="14" rx="3" />
          <path d="M10 9.5l5 2.5-5 2.5z" fill={color} stroke="none" />
        </svg>
      )
    case "tiktok":
      return (
        <svg {...props}>
          <path d="M15 4v9.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M15 4c.5 2 2 3.5 4 4" />
        </svg>
      )
    case "facebook":
      return (
        <svg {...props}>
          <path d="M14 8h2.5V5H14a3 3 0 0 0-3 3v2H9v3h2v8h3v-8h2.5l.5-3H14V8z" />
        </svg>
      )
    default:
      return null
  }
}

export default Icon
export type { IconName }
