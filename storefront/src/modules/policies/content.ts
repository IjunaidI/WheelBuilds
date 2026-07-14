import type { PolicyContent } from "./templates/policy-page"

/**
 * Copy for the static policy pages (WB-081).
 *
 * ⚠ DRAFT COPY — the returns/terms/privacy wording is a conservative,
 * wheel-industry-standard draft written so these pages EXIST (Stripe live
 * mode + ad networks expect them). It states nothing known to be false, but
 * the merchant must review and own it before launch — go-live runbook §7.
 * The shipping thresholds ARE real (WB-071: free ≥ $199, else $10).
 */

export const SHIPPING_POLICY: PolicyContent = {
  eyebrow: "SUPPORT",
  title: "Shipping",
  updated: "July 2026",
  intro:
    "Every order ships insured from our US warehouse network with tracking emailed the moment a label is created.",
  sections: [
    {
      heading: "Rates",
      bullets: [
        "Orders of $199 or more ship FREE (standard ground).",
        "Orders under $199 ship at a flat $10 (standard ground).",
        "Express shipping is available at checkout where supported.",
      ],
    },
    {
      heading: "Processing time",
      paragraphs: [
        "In-stock wheels and tires typically leave the warehouse within 1–2 business days. Orders placed on weekends or holidays begin processing the next business day.",
      ],
    },
    {
      heading: "Tracking",
      paragraphs: [
        "You'll receive a shipping-confirmation email with tracking numbers as soon as your order ships. Wheels usually ship as one box per wheel, so a set of four may arrive as four tracked packages — occasionally on different days.",
      ],
    },
    {
      heading: "Damaged in transit?",
      paragraphs: [
        "Inspect every box on arrival. If anything looks damaged, note it with the carrier if possible and contact us within 48 hours with photos — we'll make it right.",
      ],
    },
  ],
}

export const RETURNS_POLICY: PolicyContent = {
  eyebrow: "SUPPORT",
  title: "Returns & Exchanges",
  updated: "July 2026",
  intro:
    "We want your build to be right. If something isn't, here's how returns work.",
  sections: [
    {
      heading: "The basics",
      bullets: [
        "Returns are accepted within 30 days of delivery.",
        "Wheels and tires must be UNMOUNTED, UNUSED, and in their original packaging — once a tire has been mounted on a wheel, or a wheel on a vehicle, it can no longer be returned as new.",
        "Contact us before shipping anything back so we can issue a return authorization and the correct return address.",
      ],
    },
    {
      heading: "Refunds",
      paragraphs: [
        "Once the return is received and inspected, refunds are issued to the original payment method. Outbound shipping costs are non-refundable, and return shipping is the customer's responsibility unless the return is due to our error (wrong item shipped, verified fitment error on our side, or transit damage reported within 48 hours).",
      ],
    },
    {
      id: "fitment",
      heading: "Fitment-related returns",
      paragraphs: [
        "Our fitment checker matches bolt pattern, hub bore, and size ranges against wheel-size.com data — but final fitment depends on your exact vehicle and modifications. Items marked as aggressive fitment are sold with the expectation that you have verified clearance. When in doubt, contact us BEFORE ordering and we'll check your setup.",
      ],
    },
    {
      heading: "Exchanges",
      paragraphs: [
        "The fastest exchange is a return for refund plus a new order for the correct item — that way the replacement ships without waiting on the inbound inspection.",
      ],
    },
  ],
}

export const PRIVACY_POLICY: PolicyContent = {
  eyebrow: "LEGAL",
  title: "Privacy Policy",
  updated: "July 2026",
  intro:
    "This policy describes what we collect, why, and who processes it on our behalf.",
  sections: [
    {
      heading: "What we collect",
      bullets: [
        "Account and order details you provide: name, email, shipping address, and order history.",
        "Payment details are processed by Stripe — card numbers never touch our servers.",
        "Your selected vehicle (year/make/model) is stored in YOUR browser's local storage to power fitment filtering; it is not uploaded to an account.",
        "Newsletter signups store the email address you submit, used only for our own updates.",
      ],
    },
    {
      heading: "Who processes it",
      paragraphs: [
        "We use a small set of service providers to run the store: Stripe (payments), Resend (transactional email), Meilisearch (catalog search), Railway (hosting), and wheel-size.com (vehicle fitment data lookups — your vehicle's year/make/model is sent to resolve specs; no personal details accompany it).",
      ],
    },
    {
      heading: "What we don't do",
      bullets: [
        "We do not sell or rent personal information.",
        "We do not use third-party advertising trackers on this site.",
      ],
    },
    {
      heading: "Your choices",
      paragraphs: [
        "You can request a copy or deletion of your account data, or unsubscribe from marketing email, by contacting us — see the Contact page. Clearing your browser storage removes the locally cached vehicle.",
      ],
    },
  ],
}

export const TERMS_OF_SERVICE: PolicyContent = {
  eyebrow: "LEGAL",
  title: "Terms of Service",
  updated: "July 2026",
  intro:
    "By placing an order or using this site you agree to the terms below.",
  sections: [
    {
      heading: "Orders & pricing",
      paragraphs: [
        "All prices are in US dollars. We make every effort to keep pricing and stock accurate, but an order is accepted only when it ships; if a listing error or stock issue prevents fulfillment we will contact you and refund in full.",
      ],
    },
    {
      heading: "Fitment",
      paragraphs: [
        "Fitment indications on this site are computed from manufacturer and wheel-size.com data as a guide. Final responsibility for verifying fitment — especially for items marked as aggressive fitment — rests with the purchaser and their installer. Professional installation is strongly recommended.",
      ],
    },
    {
      heading: "Returns",
      paragraphs: [
        "Returns are governed by the Returns & Exchanges policy published on this site at the time of purchase.",
      ],
    },
    {
      heading: "Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law, our liability for any claim arising from an order is limited to the amount paid for the products in that order. Nothing in these terms limits rights you hold under applicable consumer-protection law.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "Questions about these terms? Reach us via the Contact page and we'll help.",
      ],
    },
  ],
}
