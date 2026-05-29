type LogoProps = {
  size?: number
}

const Logo = ({ size = 18 }: LogoProps) => (
  <span className="brand-mark" style={{ fontSize: size }}>
    <span className="dot" />
    WHEEL/BUILDS
  </span>
)

export default Logo
