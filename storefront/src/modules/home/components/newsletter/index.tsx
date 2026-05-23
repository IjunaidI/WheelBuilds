"use client"

const Newsletter = () => (
  <section
    style={{
      background: "var(--soft)",
      padding: "96px 80px",
      borderTop: "1px solid var(--hairline)",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        alignItems: "center",
        gap: 64,
      }}
    >
      <div>
        <div className="label" style={{ marginBottom: 14 }}>
          NEWSLETTER · WEEKLY
        </div>
        <div
          className="display"
          style={{ fontSize: 56, color: "var(--ink)" }}
        >
          Get the
          <br />
          drops first.
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--graphite)",
            marginTop: 16,
            maxWidth: 380,
          }}
        >
          Restock alerts, new fitments, and the occasional unannounced sale.
          No spam, unsub anytime.
        </div>
      </div>
      <form
        onSubmit={(e) => e.preventDefault()}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", gap: 8, height: 56 }}>
          <input
            type="email"
            required
            placeholder="you@domain.com"
            aria-label="Email address"
            className="field input"
            style={{ flex: 1, height: 56, fontSize: 15 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ height: 56, padding: "0 28px" }}
          >
            Subscribe
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 12,
            fontFamily: "var(--mono)",
            letterSpacing: "0.04em",
          }}
        >
          BY SUBSCRIBING YOU AGREE TO OUR PRIVACY POLICY.
        </div>
      </form>
    </div>
  </section>
)

export default Newsletter
