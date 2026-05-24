import React from "react"
import Icon from "@modules/common/components/icon"

type SectionShellProps = {
  num: number
  title: string
  /** "open" by default; "done" turns the badge orange and shows a check. */
  status?: "open" | "done"
  children: React.ReactNode
}

/**
 * Numbered-badge card wrapper used to wrap each checkout step (Addresses,
 * Shipping, Payment, Review) in the WB-styled chrome. The inner Medusa-UI
 * components keep their own heading/edit affordances — this just provides the
 * outer numbered shell consistent with the design bundle.
 */
const SectionShell = ({ num, title, status = "open", children }: SectionShellProps) => (
  <section
    className="rounded-lg bg-white overflow-hidden"
    style={{ border: "1px solid var(--hairline)" }}
  >
    <header
      className="flex items-center gap-3.5 px-5 py-4"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full text-white font-[var(--mono)] text-[11px] font-bold"
        style={{
          width: 26,
          height: 26,
          background: status === "done" ? "var(--orange)" : "var(--ink)",
        }}
      >
        {status === "done" ? (
          <Icon name="check" size={13} color="white" strokeWidth={3} />
        ) : (
          num
        )}
      </span>
      <h3
        className="font-[var(--display)] text-[20px] text-[var(--ink)] uppercase m-0"
        style={{ fontWeight: 900, letterSpacing: "-0.005em" }}
      >
        {title}
      </h3>
    </header>
    <div className="p-5">{children}</div>
  </section>
)

export default SectionShell
