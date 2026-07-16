// Garage/blueprint share-image scene (DESIGN.md §2 tokens — no invented hexes):
// --ink ground, --graphite grid, --orange dot + rule, --surface wordmark text.
const INK = "#0F0F10"
const GRAPHITE = "#3A3A3D"
const ORANGE = "#FF6A00"
const SURFACE = "#FFFFFF"

export const WORDMARK = "WHEEL/BUILDS"

export function WordmarkScene({ fontLoaded }: { fontLoaded: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: INK,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          backgroundImage: `linear-gradient(${GRAPHITE} 1px, transparent 1px), linear-gradient(90deg, ${GRAPHITE} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "0 90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 26,
              height: 26,
              borderRadius: "50%",
              backgroundColor: ORANGE,
              marginRight: 22,
            }}
          />
          <div
            style={{
              display: "flex",
              // Conditional spread, never `fontFamily: fontLoaded ? "Antonio" : undefined` —
              // satori treats a present-but-undefined fontFamily as a crash
              // (`.split()` on undefined), not a fallback. See get-antonio-font.ts.
              ...(fontLoaded ? { fontFamily: "Antonio" } : {}),
              fontWeight: 700,
              fontSize: 124,
              lineHeight: 1,
              letterSpacing: "-3px",
              color: SURFACE,
            }}
          >
            {WORDMARK}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            width: 200,
            height: 10,
            backgroundColor: ORANGE,
            marginTop: 40,
            marginLeft: 48,
          }}
        />
      </div>
    </div>
  )
}
