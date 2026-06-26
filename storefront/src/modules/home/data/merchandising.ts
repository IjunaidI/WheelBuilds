import type { IconName } from "@modules/common/components/icon"

/**
 * Editable home merchandising copy. Change strings here — not in the section
 * components. The brand-count-dependent values (trust-strip "Authorized dealer"
 * subtitle, hero "Authorized dealer" point) stay computed in their components
 * because they read the live facet count.
 */
export const TRUST_STRIP_ITEMS: { icon: IconName; h: string; s: string }[] = [
  { icon: "shipping", h: "Free shipping $199+", s: "Lower 48, ground" },
  { icon: "shield", h: "Fitment guarantee", s: "Or your money back" },
  { icon: "badge", h: "Authorized dealer", s: "Premium brands" },
  { icon: "return", h: "30-day returns", s: "Unmounted wheels" },
]

export const HERO_COPY = {
  eyebrow: "FITMENT FIRST · STEP 01 OF 02",
  headlineTop: "What do",
  headlineBottom: "you drive?",
  subcopy:
    "Tell us once. We'll show you only the wheels confirmed to fit, ship them in 2–3 days, and back every fitment with our money-back guarantee.",
  trustPoints: [
    { l: "Fitment guaranteed", s: "Or your money back" },
    { l: "Free returns", s: "30 days, unmounted" },
    { l: "Free ship $199+", s: "2–3 day delivery" },
  ],
}
