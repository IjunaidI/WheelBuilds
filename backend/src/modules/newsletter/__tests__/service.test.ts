import NewsletterService from "../service"

/**
 * Fake `knex_.raw` for subscribe()'s atomic 3-CTE upsert (WB-075 DOC2).
 * Mirrors the real SQL's phases against an in-memory `rows` array:
 *   1. yield first (setTimeout 0) — the window a concurrent statement's
 *      row lock / commit would occupy in real Postgres. Two Promise.all'd
 *      subscribe() calls each run synchronously up to this point, so the
 *      yield genuinely interleaves them — a faithful proxy for concurrent
 *      transactions without a real database.
 *   2. resolve whether an ACTIVE (non-deleted) row for this email already
 *      exists.
 *   3. if not, resolve the most-recently-touched SOFT-DELETED row for this
 *      email (`target_deleted`) and reactivate it if found — mirrors the
 *      real CTE's NOT EXISTS guard against an active duplicate.
 *   4. otherwise, re-check for an active row (covers both "already active"
 *      and "lost the race to a concurrent insert between step 2 and now")
 *      and either no-op or insert — mirrors the real
 *      `ON CONFLICT ("email") WHERE deleted_at IS NULL DO NOTHING` arbiter.
 * binds mirror the real SQL's positional order:
 *   [email, country_code, source, id, email, country_code, source]
 */
function installSubscribeKnexStub(svc: any, rows: any[]) {
  const tick = () => new Promise((r) => setTimeout(r, 0))
  svc.knex_ = {
    raw: async (_sql: string, binds: any[] = []) => {
      const [email, country_code, source, id] = binds
      await tick()
      if (!rows.find((r) => r.email === email && !r.deleted_at)) {
        const deleted = rows
          .filter((r) => r.email === email && r.deleted_at)
          .sort((a, b) => b.updated_at - a.updated_at)[0]
        if (deleted) {
          deleted.deleted_at = null
          deleted.country_code = country_code
          deleted.source = source
          deleted.updated_at = Date.now()
          return { rows: [{ created: true }] }
        }
      }
      if (rows.find((r) => r.email === email && !r.deleted_at)) {
        return { rows: [{ created: false }] }
      }
      rows.push({ id, email, country_code, source, deleted_at: null, updated_at: Date.now() })
      return { rows: [{ created: true }] }
    },
  }
}

function makeService() {
  const rows: any[] = []
  const svc = new (NewsletterService as any)({})
  installSubscribeKnexStub(svc, rows)
  return { svc, rows }
}

describe("NewsletterService.subscribe", () => {
  it("creates a new subscription", async () => {
    const { svc, rows } = makeService()
    const r = await svc.subscribe("a@b.co", { source: "home" })
    expect(r.created).toBe(true)
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ email: "a@b.co", source: "home", country_code: null })
  })

  it("is idempotent on email (no duplicate row)", async () => {
    const { svc, rows } = makeService()
    await svc.subscribe("a@b.co")
    const again = await svc.subscribe("a@b.co")
    expect(again.created).toBe(false)
    expect(rows.length).toBe(1)
  })

  // WB-075 DOC2: the old implementation was list-then-create with no
  // atomicity — two concurrent POSTs for the same email both passed the
  // "does it exist?" check, then the loser's create() hit the partial
  // unique index as an UNCAUGHT 23505 -> 500, breaking the documented
  // "always 201" contract. subscribe() must now be a single atomic
  // statement that absorbs the race instead of throwing, and must leave
  // exactly one active row behind (idempotent under concurrency, not just
  // sequentially).
  it("two concurrent subscribe() calls for the same new email both resolve without throwing, leaving exactly one active row", async () => {
    const { svc, rows } = makeService()
    await expect(
      Promise.all([svc.subscribe("race@b.co"), svc.subscribe("race@b.co")])
    ).resolves.toBeDefined()
    const active = rows.filter((r) => r.email === "race@b.co" && !r.deleted_at)
    expect(active).toHaveLength(1)
  })

  // A resubscribe after a soft-delete must RE-ACTIVATE the existing row
  // rather than silently no-op (dead end) or insert a second row for the
  // same email — the partial unique index only covers active rows, so a
  // naive ON CONFLICT alone would insert a duplicate instead of undoing
  // the unsubscribe.
  it("resubscribing after a soft-delete re-activates the existing row instead of dead-ending", async () => {
    const { svc, rows } = makeService()
    rows.push({
      id: "nlsub_old",
      email: "gone@b.co",
      country_code: null,
      source: "home",
      deleted_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-01").getTime(),
    })
    const r = await svc.subscribe("gone@b.co", { source: "footer" })
    expect(r.created).toBe(true)
    expect(rows).toHaveLength(1) // reactivated the SAME row, not a second one
    expect(rows[0].id).toBe("nlsub_old")
    expect(rows[0].deleted_at).toBeNull()
    expect(rows[0].source).toBe("footer")
  })

  it("issues a single atomic SQL statement per call (no separate list/create round trip)", async () => {
    const { svc } = makeService()
    const calls: { sql: string; binds: any[] }[] = []
    const raw = svc.knex_.raw.bind(svc.knex_)
    svc.knex_.raw = async (sql: string, binds: any[]) => {
      calls.push({ sql, binds })
      return raw(sql, binds)
    }
    svc.listNewsletterSubscriptions = async () => { throw new Error("must not be called by subscribe()") }
    svc.createNewsletterSubscriptions = async () => { throw new Error("must not be called by subscribe()") }
    await svc.subscribe("solo@b.co")
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toMatch(/on conflict \("email"\) where deleted_at is null do nothing/i)
    expect(calls[0].sql).toMatch(/target_deleted/i)
    expect(calls[0].binds).toEqual(["solo@b.co", null, null, expect.any(String), "solo@b.co", null, null])
  })
})
