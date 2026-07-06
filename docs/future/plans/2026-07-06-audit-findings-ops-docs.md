# Audit findings — ops, config, security, and documentation drift

> **Raw finding log** from the 2026-07-06 done-specs audit (workflow run wf_7e98d308-058; 27 reviewers over all 24 done plan/spec units + 6 business-logic domains; 116 raw -> 76 unique findings). Findings against operational surfaces (routes, config, scripts, email) and the governing documentation (CLAUDE.md / README / STATUS / BACKLOG drift).
>
> **These are logged findings, not yet plans.** Statuses: CONFIRMED = survived a 3-lens adversarial panel (refute / business-impact / concrete-repro); PENDING = single-reviewer claim awaiting verification. Convert to detailed specs/plans (superpowers:writing-plans) before implementation. Umbrella: [2026-07-06-audit-remediation-theme.md](2026-07-06-audit-remediation-theme.md).

**5 findings** — high: 0, medium: 0, low: 5

---

## 1. [LOW] WB-001's resolveSelectedVariant seam is dead code kept green by its own test; production resolves via resolveLeafVariant

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** doc-drift | **Where:** `storefront/src/modules/product-detail/data/resolve-variant.ts:9` | **Found by:** spec:pdp-add-to-cart
- **Evidence:** Grep for resolveSelectedVariant across storefront/src matches only resolve-variant.ts:9 and its test — the hero now imports resolveLeafVariant from group-sizes.ts (hero/index.tsx:5, used at lines 162-165). The done spec/plan (docs/done/specs/2026-06-17-pdp-add-to-cart-design.md §3, plan Task 1) still present resolve-variant.ts as THE unit-tested variant-resolution seam.
- **Impact:** The vitest coverage the spec's acceptance criterion 5 points at now exercises a function no user path calls; readers following the done docs will modify/test the wrong resolver. Delete the file+test or redirect docs to resolveLeafVariant.

## 2. [LOW] Newsletter subscribe is a non-atomic list-then-create — concurrent duplicate POSTs 500 against the unique index

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** code-bug | **Where:** `backend/src/modules/newsletter/service.ts:14` | **Found by:** spec:home-merchandising
- **Evidence:** subscribe() does listNewsletterSubscriptions({ email }) then createNewsletterSubscriptions(...) with no atomicity and no catch; the migration creates IDX_newsletter_subscription_email_unique (partial on deleted_at IS NULL, Migration20260626120000.ts:8). Two concurrent POSTs for the same new email both see an empty list, both insert, and the loser's unique violation propagates uncaught through the route (route.ts:17 has no try/catch) — a 500 instead of the designed 'always 201, don't leak membership' contract.
- **Impact:** The racing subscriber sees the 'Couldn't subscribe — try again' error toast even though they ARE subscribed, and the route's always-201 contract is violated. Low likelihood (button disables during submit) but a concrete failure of the stated contract.

## 3. [LOW] .env.template promises a MEILISEARCH_MASTER_KEY fallback that no code implements

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** doc-drift | **Where:** `backend/.env.template:29` | **Found by:** spec:deploy-config-hardening
- **Evidence:** backend/.env.template:29-30 says MEILISEARCH_MASTER_KEY is 'Required if MEILISEARCH_ADMIN_KEY is not set' and that the admin key 'will be fetched using master key'. Repo-wide grep finds no other reference to MEILISEARCH_MASTER_KEY; backend/medusa-config.js:235 registers the Meilisearch plugin only when MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY are both set (constants.ts:108-109 read only those two vars). No fetch-via-master-key path exists.
- **Impact:** A deployer following the template and setting only HOST + MASTER_KEY gets Meilisearch silently unregistered — storefront discovery/search returns empty (the adapter swallows Meili failures). The only clue is the WB-010 startup DISABLED line, which contradicts the template. Correct the template comment.

## 4. [LOW] module-status report does not exactly mirror medusa-config conditions: it trims env values, config uses raw truthiness

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** spec-gap | **Where:** `backend/src/lib/module-status.ts:13` | **Found by:** spec:deploy-config-hardening
- **Evidence:** module-status.ts:13 `has()` requires env[k].trim() !== '', but the real registration conditions use plain truthiness on untrimmed constants — medusa-config.js:117 (MinIO), :219 (WHEEL_SIZE_API_KEY), :235 (Meilisearch), where constants.ts exports raw process.env values. A whitespace-only value (stray-space paste in Railway) registers the module while the WB-010 startup line prints DISABLED for it.
- **Impact:** Breaks the design's 'mirrors the exact conditions in medusa-config.js' criterion. In the whitespace edge case the diagnostic log actively misleads: ops sees DISABLED and hunts a missing var while the module loaded with a garbage value. Use the same trim semantics on both sides.

## 5. [LOW] Done fitment-aware-PDP spec/plan no longer describe shipped semantics (hasFit windows rule, full-set fallback, FitView.defaults)

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** doc-drift | **Where:** `docs/done/specs/2026-07-01-fitment-aware-pdp-design.md:78` | **Found by:** spec:fitment-aware-pdp
- **Evidence:** Spec: 'hasFit: false when the vehicle has no windows... Callers then show everything' and a FitView.defaults object. Current fit-view.ts (post d03cc18/c595ec4): a no-window vehicle STILL filters by bolt pattern + bore ('bolt pattern is the floor', hasFit true), hasFit:false now renders a red 'doesn't fit — shown for reference only' state (hero/index.tsx:190-198) rather than the spec's silent full set, and no defaults object exists. Tests were updated (fit-view.test.ts:37-49) but neither doc in docs/done was.
- **Impact:** The docs/done pair is the stated reference for this feature; anyone auditing or extending fit mode from them will implement/expect the retired fall-back-to-everything semantics, which the later commits deliberately reversed as a safety fix.

