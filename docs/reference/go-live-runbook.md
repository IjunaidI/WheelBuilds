# Go-live runbook — Wheel Builds

> Ops checklist for taking the store from "code-complete on `main`" to "really selling".
> Written 2026-07-11 (WB-080; spec: [launch-readiness-fixes-design §4–§5](../done/specs/2026-07-10-launch-readiness-fixes-design.md)).
> Everything here is a HUMAN/ops step — the code side ships with G10. Do the steps in order;
> each has a verify. Prod DB host: check `DATABASE_URL` in the Railway backend service
> (the `--confirm-host` guards echo it back to you).

## 0. Deploy the current main

1. `git push` from the repo root (Railway auto-deploys both services on push to `main`).
   As of 2026-07-11 `main` carries WB-077/078/079/080/081/082 **unpushed** — the live site
   has none of it until this push.
2. Backend: if `medusa-config.js` or env changed and behavior looks stale, clear the
   `.medusa/server` build cache (redeploy with cleared build cache / `rm -rf .medusa/server`).
3. Verify: backend deploy logs show the module-status report with the expected modules ENABLED;
   storefront serves and login works (the auth-headers hotfix must be live).

## 1. Email (WB-078 activation)

1. Railway backend env: set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a verified sender on your
   Resend domain), optionally `EMAIL_REPLY_TO` (support inbox), and `STOREFRONT_URL`
   (e.g. `https://<storefront-domain>`) — password-reset links are built from it.
2. Railway storefront env: `NEXT_PUBLIC_SUPPORT_EMAIL` = the same support inbox, so the
   `/contact` page shows a mailto (rebuild required; page degrades gracefully without it).
4. Verify: place a test order → confirmation email; fulfill + ship it in admin → shipping
   email; "Forgot password?" → reset email → new password logs in; reply-to is your inbox.

## 2. Stripe live mode + capture (WB-080 D2)

Money is **captured automatically at authorization** now (`capture: true` in
`medusa-config.js`) — no manual capture step exists anymore.

1. Stripe dashboard (live mode): create a webhook endpoint pointed at
   `https://<backend-domain>/hooks/payment/stripe_stripe`; note its signing secret.
2. Railway backend env: `STRIPE_API_KEY` → `sk_live_…`, `STRIPE_WEBHOOK_SECRET` → the live
   webhook secret. Redeploy (watch the stale-config trap, step 0.2).
3. Railway storefront env: `NEXT_PUBLIC_STRIPE_KEY` → `pk_live_…`. **Storefront rebuild
   required** (`NEXT_PUBLIC_*` is baked at build time).
4. Run the two guarded prod scripts from the backend service shell (or locally with prod
   `DATABASE_URL` — deliberate, double-checked):
   - `npx medusa exec ./src/scripts/strip-manual-payment.ts -- --confirm-host=<host>`
     (removes `pp_system_default` — until this runs, unpaid orders are placeable)
   - `npx medusa exec ./src/scripts/update-shipping-prices.ts -- --confirm-host=<host>`
     (free shipping ≥ $199, else $10)
5. Verify: a real card is **charged** (Stripe shows "Succeeded", not "Uncaptured") on a small
   live order; checkout shows no "Manual" method; cart at $150 → $10 shipping, $250 → free.
   Refund the test order from Stripe/admin.

## 3. US sales tax (WB-080 D3)

1. Create the US tax region:
   `npx medusa exec ./src/scripts/create-us-tax-region.ts -- --confirm-host=<host>`
   (idempotent; fresh DBs get it from the seed now).
2. Admin → Settings → Tax Regions → United States → add a **province region + rate for each
   nexus state** (merchant decision: at minimum the state you ship from; consult an
   accountant for economic-nexus thresholds).
3. Verify: a cart shipping to a nexus state computes tax at checkout; a no-nexus state stays 0.

## 4. Search + catalog freshness

1. After any backend deploy that changed Meili settings/transformer: restart the backend
   (settings apply on boot), then trigger a full re-sync — admin `POST /admin/meilisearch/sync`
   — so tire `fit_specs` (WB-068) and any transformer changes are indexed. Until the re-sync,
   the `/tires` fit filter treats empty `fit_specs` as PASS (over-claims).
2. The first post-deploy FULL vendor sync re-applies the whole catalog once (WB-070 hash
   format change). Idempotent; let the 12h cron take it or trigger off-peak from the admin
   Vendor Sync console.
3. WB-077 re-keyed the fitment cache (`v2`): cached vehicle windows re-warm on next lookup
   automatically. Optional cleanliness: `TRUNCATE wheel_size_fitment;` (orphan v1 rows expire
   naturally otherwise).

## 5. Vendor-sync ops (WB-081 activation)

1. Railway backend env: the WheelPros `*_SFTP_*` credential set per enabled vendor;
   `OPS_ALERT_EMAIL` (where failure alerts + the 24h watchdog email go — requires §1 email
   env to be set).
2. **Confirm UNSET in prod:** `VENDOR_SYNC_DEV_MAX_ROWS` (silently truncates the feed to N
   rows — guts the catalog) and `VENDOR_ALLOW_SAMPLE_FEED`.
3. Verify: break the SFTP password on a dev copy → run fails → alert email arrives; restore it.

## 6. Security / env hygiene

1. Rotate `JWT_SECRET` and `COOKIE_SECRET` to long random values if they are still
   `supersecret` (template default). Note: rotating logs every customer out.
2. CORS trio (`STORE_CORS`, `AUTH_CORS`, `ADMIN_CORS`) must include the real storefront /
   admin origins — the backend refuses to boot in prod without them (WB-039).
3. Verify: login + checkout work cross-origin from the live storefront domain.

## 7. Catalog cleanup

1. Delete the 4 seeded demo apparel products (T-shirt/sweatshirt/sweatpants/shorts) in admin
   → Products (the vendor-sync purge route skips non-vendor products by design).
2. After the purge, remove the three demo S3 image hosts from `storefront/next.config.js`
   `remotePatterns` (code change — small follow-up PR).
3. Verify: `/store` shows only wheel products; `/tires` only tires.

## 8. Observability (WB-082 activation — optional but recommended)

1. Storefront env: `NEXT_PUBLIC_ANALYTICS_DOMAIN` = your Plausible site domain to turn on
   analytics (ships inert without it). Rebuild required.
2. Error tracking (Sentry) is NOT wired (deliberate — see the spec §6 deviation note);
   revisit when a vendor account exists.
3. Verify: `https://<storefront>/robots.txt` and `/sitemap.xml` serve; a forced error page
   shows the styled boundary, not the Next default.

## 9. Policy copy review (WB-081)

The static pages at `/contact`, `/returns`, `/shipping`, `/privacy`, `/terms` ship with
conservative DRAFT copy (`storefront/src/modules/policies/content.ts`). The shipping
thresholds are real (free ≥ $199 / else $10 — WB-071); the returns window, terms, and
privacy processor list are drafts the merchant must read, adjust, and own before launch —
they are customer-facing promises.

## Quick-reference: what breaks if you skip a step

| Skipped | Consequence |
|---|---|
| §1 email env | No order/shipping/password-reset emails at all |
| §2.2 live webhook | Payments authorize but Medusa never learns — orders stuck |
| §2.4 strip-manual-payment | Customers can place UNPAID orders |
| §3 tax region | Every US order charges $0 tax (liability is still yours) |
| §4.1 Meili re-sync | Tire fit filter over-claims; stale facets |
| §5.2 dev-max-rows unset | Next sync silently truncates the catalog to 1,000 rows |
| §6.1 secret rotation | Session/JWT forgery risk with a public template value |
