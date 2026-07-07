import { ulid } from "ulid"
import { ContainerRegistrationKeys, MedusaService } from "@medusajs/framework/utils"
import NewsletterSubscription from "./models/newsletter-subscription"

class NewsletterService extends MedusaService({ NewsletterSubscription }) {
  protected knex_: any

  constructor(container: any) {
    super(...arguments as any)
    this.knex_ = container?.[ContainerRegistrationKeys.PG_CONNECTION]
  }

  /**
   * Atomic, idempotent subscribe keyed on the (already-normalized) email
   * (WB-075 DOC2). Callers normalize via normalizeEmail before calling.
   *
   * The previous implementation was a non-atomic list-then-create: two
   * concurrent POSTs for the same email could both pass the "does it
   * exist?" check, then the loser's create() would hit the partial unique
   * index `IDX_newsletter_subscription_email_unique` (`("email") WHERE
   * deleted_at IS NULL` — Migration20260626120000) as an UNCAUGHT 23505,
   * breaking the documented "always 201" contract with a 500.
   *
   * Because that index is PARTIAL (scoped to active rows only), a plain
   * `INSERT ... ON CONFLICT ("email") WHERE deleted_at IS NULL` can never
   * arbiter-match a SOFT-DELETED row — Postgres only considers rows the
   * index actually covers. So a resubscribe after a soft-delete needs its
   * own explicit reactivation step, or it silently inserts a second row for
   * the same email instead of undoing the unsubscribe. This does both in
   * ONE atomic statement (mirrors WheelSizeService.upsertFitmentRow /
   * incrementAndCheckQuota and CustomerVehicleService.activate's ON
   * CONFLICT / CTE idiom):
   *
   *   1. `target_deleted` — the most-recently-touched soft-deleted row for
   *      this email, but only if no ACTIVE row for the same email already
   *      exists (defends the one-active-row-per-email invariant even if
   *      stale/duplicate soft-deleted history rows exist).
   *   2. `reactivated` — if found, flips it back to active (deleted_at =
   *      null) and refreshes country_code/source/updated_at, as if this
   *      were a fresh subscribe.
   *   3. `inserted` — otherwise, INSERT a new row, guarded by
   *      `ON CONFLICT ("email") WHERE deleted_at IS NULL DO NOTHING` — the
   *      real partial-unique-index arbiter, so a concurrent duplicate
   *      active-email insert is silently absorbed instead of thrown.
   *
   * All three CTEs run against the SAME snapshot within one statement, so
   * there is no read-then-write window between "does an active/deleted row
   * exist?" and "write the row" for a concurrent request to land in.
   *
   * Returns `created: true` when this call brought a new ACTIVE row into
   * existence (fresh insert or reactivation), `false` when the email was
   * already actively subscribed (a true no-op).
   */
  async subscribe(
    email: string,
    meta?: { country_code?: string | null; source?: string | null }
  ): Promise<{ created: boolean }> {
    const id = `nlsub_${ulid()}`
    const country_code = meta?.country_code ?? null
    const source = meta?.source ?? null
    const result = await this.knex_.raw(
      `with target_deleted as (
         select "id" from "newsletter_subscription" nd
         where nd."email" = ?
           and nd."deleted_at" is not null
           and not exists (
             select 1 from "newsletter_subscription" na
             where na."email" = nd."email" and na."deleted_at" is null
           )
         order by nd."updated_at" desc
         limit 1
       ),
       reactivated as (
         update "newsletter_subscription" ns
         set "deleted_at" = null, "country_code" = ?, "source" = ?, "updated_at" = now()
         from target_deleted td
         where ns."id" = td."id"
         returning ns."id"
       ),
       inserted as (
         insert into "newsletter_subscription"
           ("id", "email", "country_code", "source", "created_at", "updated_at", "deleted_at")
         select ?, ?, ?, ?, now(), now(), null
         where not exists (select 1 from target_deleted)
         on conflict ("email") where deleted_at is null do nothing
         returning "id"
       )
       select
         (exists(select 1 from reactivated) or exists(select 1 from inserted)) as created`,
      [email, country_code, source, id, email, country_code, source]
    )
    return { created: !!result?.rows?.[0]?.created }
  }
}

export default NewsletterService
