# Information needed from the client — Wheel Builds

> **Raised:** 2026-07-29, from the QA tester's pass over the live site
> (`storefront-production-0088.up.railway.app`).
>
> These are the items that **cannot be answered by engineering**. Each one is a
> business, legal, or commercial decision. Everything else from the QA report is
> already being fixed and does not need input.
>
> **How to use this:** answer inline, or reply with the numbered item and the value.
> Anything left blank simply stays as it is today — the "If we don't get this"
> column says exactly what that means.

---

## 🔴 Priority 1 — live now, affecting real customers

### 1. US sales tax — which states, and at what rate?

**What's happening today.** Every US order is charged a flat **10%**, regardless of
where it ships. We verified this on a live cart: an order to Chicago and an order to
Los Angeles are taxed identically. The tax rule currently configured is literally named:

> **"Defaul Tax rate For Testing"** — rate 10%, code `12223`

That looks like a placeholder entered during setup that was never replaced. It is
being charged to real customers right now.

**What we need.** The list of states where the business has tax nexus (i.e. is
registered to collect sales tax), and the rate for each:

| State | Rate % |
|---|---|
| e.g. `IL` | e.g. `10.25` |
| | |
| | |

**Please also confirm:** should the existing flat 10% rule be **deleted** once the
per-state rates are in? If it stays, it will keep applying as a catch-all to every
state not on your list.

> **Note:** which states have nexus is a determination for your accountant, not
> something we can infer. Under-collecting creates a liability you absorb later;
> over-collecting means refunds.

**If we don't get this:** every US customer keeps paying 10%, correct or not, under a
rule labelled "For Testing".

**Alternative, if you'd rather not maintain a list:** we can integrate a tax service
(Stripe Tax or TaxJar) that calculates the exact rate per address automatically,
including county and city components. That's a paid third-party service and a bigger
piece of work — say the word if you'd prefer it.

---

### 2. Shipping prices — Standard vs Express

**What's happening today.** Both options are offered at the **same price**:

```
Express Shipping    Ship in 24 hours.    $10.00
Standard Shipping   Ship in 2-3 days.    $10.00
```

A customer paying for "Express" is paying nothing extra for it.

**What we need.**

| Method | Price | Delivery time |
|---|---|---|
| Standard | $ | business days |
| Express | $ | business days |

**If we don't get this:** the two methods stay identically priced, which reads as a
paid upgrade that isn't one.

---

### 3. Free shipping threshold — confirm $199

**What's happening today.** The site advertises **"Free shipping on orders $199+"** on
the home page, product pages and at checkout — but the rule was never switched on in
production. We confirmed it live: a **$333** cart was still charged $10 shipping.

The rule is written and ready; it just needs to be applied. Before we do:

- **Confirm the threshold is $199** (or give the correct figure): ________
- **Does free shipping apply to both methods**, or Standard only? ________

**If we don't get this:** we'll apply $199 to both methods as currently advertised,
since the site is already promising it.

---

## 🟠 Priority 2 — blocking work already scheduled

### 4. Support contact details

**What's happening today.** The Contact page has **no form, no email address, and no
phone number** — nothing at all. Six places on the site send customers there:

- the returns policy, which says *"contact us BEFORE ordering"*
- out-of-stock products, whose button says *"special order — contact us to order"*
- the checkout page, the account pages, order confirmations, and the footer

So every special-order enquiry currently has no way to reach you.

**What we need.**

| Field | Value |
|---|---|
| Support email address | |
| Support phone number | |
| Business hours (optional, shown next to the phone) | |

**If we don't get this:** we'll still build the contact form, and messages will be
saved so nothing is lost — but we won't display an email or phone number, because
showing a fake one is worse than showing none.

---

### 5. Fitment-check promise

**What's happening today.** Tyre product pages say:

> *"Submit your vehicle for a fitment check — we usually confirm within 24 hours."*

That link currently goes to the empty Contact page, so nobody receives these.

**What we need.**

- Is **24 hours** the response time you want to promise? ________
- Where should these enquiries go — the same support email as above, or a different
  address? ________

**If we don't get this:** they'll go to the support email from item 4, and we'll soften
the wording to remove the specific time promise.

---

### 6. Order confirmation emails — sending domain

**What's happening today.** The tester never received an order confirmation. This is
**not a code problem** — the email system is built and working. The blocker is that the
site is still on a temporary `railway.app` address, and email providers won't let you
send from a domain you don't own.

**What we need.** The real domain name for the site (e.g. `wheelbuilds.com`), and
access to its DNS settings so the email provider can be verified.

**If we don't get this:** no transactional emails can be sent — no order confirmations,
no password resets. Everything is ready to switch on the day the domain is available.

---

## 🟡 Priority 3 — improves quality, not blocking

### 7. Search — what should have been found?

The tester wrote *"search bar needs to be improved"* but didn't say what failed.
Without an example we'd be guessing, and we risk breaking searches that currently work.

**What we need.** Two or three real examples:

| I searched for… | I expected to see… | I actually got… |
|---|---|---|
| | | |
| | | |

---

### 8. "Style" categories — are these the right definitions?

The site groups wheels into styles (Street, Truck & Dually, Luxury, UTV, Off-Road,
Drag). The supplier feed has no style data, so these are **approximations we invented**
from wheel size and brand:

| Style | Currently defined as |
|---|---|
| Street | 18" / 19" / 20" wheels |
| Truck & Dually | 22" / 24" / 26" wheels |
| Drag | 15" / 17" wheels |
| Luxury | any silver / polished finish |
| Off-Road | one brand (Black Rhino Hard Alloys) |
| UTV | one brand (Black Rhino Hard Alloys - UTV) |

**What we need.** Are these sensible for how you actually sell? If you'd rather define
styles properly (e.g. a real list of which models belong in which style), tell us and
we'll build that instead.

**If we don't get this:** they stay as-is. The counts will be accurate — we're fixing a
separate bug where the numbers didn't match — but the groupings remain our best guess.

---

### 9. "Center bore 999 mm" wording

45 products show a centre bore of **999 mm**, which is obviously not real. It's the
supplier's code for *"machined to order"* — genuinely what a forged wheel is.

We plan to display it as **"Custom / bore-to-order"**.

**Is that the wording you'd use with customers?** ________

**If we don't get this:** we'll use "Custom / bore-to-order".

---

## Summary — the short version

| # | What we need | Priority | Blocks |
|---|---|---|---|
| 1 | Nexus states + tax rates; delete the 10% test rule? | 🔴 | Correct tax on every order |
| 2 | Standard vs Express prices + delivery times | 🔴 | Meaningful shipping choice |
| 3 | Confirm $199 free-shipping threshold | 🔴 | Honouring what the site advertises |
| 4 | Support email + phone | 🟠 | Customers being able to reach you |
| 5 | Fitment-check destination + response time | 🟠 | Capturing fitment enquiries |
| 6 | Real domain + DNS access | 🟠 | All customer emails |
| 7 | Example failed searches | 🟡 | Search improvements |
| 8 | Confirm style definitions | 🟡 | Category accuracy |
| 9 | Confirm "Custom / bore-to-order" wording | 🟡 | Product spec wording |

---

## For the record — what we are NOT asking about

These came out of the same QA pass and are already fixed or in progress. No input
needed:

- Cart showing **$0.00** for line totals — **fixed**
- Checkout totals not adding up (overstated by the shipping amount) — **fixed**
- "Chicago" being accepted in the State field — **fixed**
- Missing postal code on the card form — in progress
- Filters that looked empty (bolt pattern, tyre size, speed and load ratings) — in
  progress; the data was always there, the sections were just collapsed
- Style counts not matching their listings (e.g. Street claimed 1,550, showed 1,076) —
  in progress
- Out-of-stock products in the search panel's "Trending" tiles — in progress
- Uppercase web addresses returning "page not found" — in progress
