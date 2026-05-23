type ImgPlaceholderProps = {
  label: string
  dark?: boolean
  radius?: number
  className?: string
  style?: React.CSSProperties
}

const ImgPlaceholder = ({
  label,
  dark = false,
  radius = 0,
  className,
  style,
}: ImgPlaceholderProps) => (
  <div
    className={
      "img-placeholder" +
      (dark ? " dark" : "") +
      (className ? ` ${className}` : "")
    }
    style={{ borderRadius: radius, ...style }}
  >
    <span
      style={{
        position: "relative",
        zIndex: 1,
        padding: "4px 10px",
        background: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)",
        borderRadius: 2,
      }}
    >
      {label}
    </span>
  </div>
)

export default ImgPlaceholder
