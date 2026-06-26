import NewsletterService from "../service"

function makeService() {
  const rows: any[] = []
  const svc = new (NewsletterService as any)({})
  svc.listNewsletterSubscriptions = async (f: any) => rows.filter((r) => r.email === f.email)
  svc.createNewsletterSubscriptions = async (data: any) => { const row = { id: `id_${rows.length}`, ...data }; rows.push(row); return row }
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
})
