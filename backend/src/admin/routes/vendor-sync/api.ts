// backend/src/admin/routes/vendor-sync/api.ts
//
// Thin fetch helpers over the existing /admin/vendor-sync/* routes. Same-origin
// in the admin, so the session cookie authenticates (credentials: "include").

const BASE = "/admin/vendor-sync"

export const VENDOR_CODES = ["wheelpros-wheels", "wheelpros-tires"] as const

export type VendorRun = {
  id: string
  vendor_code: string
  source_filename: string
  status: string
  row_count: number
  new_count: number
  changed_count: number
  discontinued_count: number
  hash_match_count: number
  skipped_no_image_count: number
  apply_attempt_count: number
  error_message: string | null
  failed_part_numbers: string[] | null
  failed_group_keys: string[] | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.message || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function listRuns(params: { vendor?: string; status?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params.vendor) q.set("vendor", params.vendor)
  if (params.status) q.set("status", params.status)
  q.set("limit", String(params.limit ?? 25))
  return jsonFetch<{ runs: VendorRun[] }>(`${BASE}/runs?${q.toString()}`)
}

export const getRun = (id: string) => jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}`)

export const triggerRun = (vendor_code: string, dry_run: boolean) =>
  jsonFetch<{ run_id: string }>(`${BASE}/runs`, {
    method: "POST",
    body: JSON.stringify({ vendor_code, dry_run }),
  })

export const approveRun = (id: string) =>
  jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}/approve`, { method: "POST" })

export const cancelRun = (id: string) =>
  jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}/cancel`, { method: "POST" })

export const replayRun = (id: string) =>
  jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}/replay`, { method: "POST" })

export const replaySku = (vendor_code: string, partNumber: string) =>
  jsonFetch<{ message: string }>(
    `${BASE}/skus/${encodeURIComponent(partNumber)}/replay`,
    { method: "POST", body: JSON.stringify({ vendor_code }) }
  )
