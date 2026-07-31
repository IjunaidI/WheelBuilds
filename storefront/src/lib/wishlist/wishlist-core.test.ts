// WB-125 — before this, "Save to wishlist" only fired a toast reading "Find it
// in your account later." There was no wishlist page, route, backend module or
// account tab anywhere in either app, so that message was false for EVERY
// shopper, and it additionally sent guests to a login wall for a page that did
// not exist.
import { describe, expect, it } from "vitest"

import {
  MAX_WISHLIST,
  addItem,
  hasItem,
  removeItem,
  sanitize,
  toggleItem,
  type WishlistItem,
} from "./wishlist-core"

const item = (handle: string, over: Partial<WishlistItem> = {}): WishlistItem => ({
  handle,
  name: handle,
  brand: "Brand",
  priceCents: 10000,
  thumbnail: null,
  kind: "wheel",
  savedAt: "2026-07-30T00:00:00.000Z",
  ...over,
})

describe("addItem", () => {
  it("puts the newest first", () => {
    const list = addItem(addItem([], item("a")), item("b"))
    expect(list.map((i) => i.handle)).toEqual(["b", "a"])
  })

  it("re-saving moves to front and refreshes rather than duplicating", () => {
    const list = addItem(addItem(addItem([], item("a")), item("b")), item("a", { name: "new" }))
    expect(list.map((i) => i.handle)).toEqual(["a", "b"])
    expect(list[0].name).toBe("new")
  })

  it("caps the list so a runaway click cannot blow the storage quota", () => {
    let list: WishlistItem[] = []
    for (let i = 0; i < MAX_WISHLIST + 25; i++) list = addItem(list, item(`h${i}`))
    expect(list).toHaveLength(MAX_WISHLIST)
    // The cap drops the OLDEST, never the just-saved item.
    expect(list[0].handle).toBe(`h${MAX_WISHLIST + 24}`)
  })
})

describe("removeItem / hasItem", () => {
  it("removes only the named handle", () => {
    const list = addItem(addItem([], item("a")), item("b"))
    expect(removeItem(list, "a").map((i) => i.handle)).toEqual(["b"])
  })

  it("removing an absent handle is a no-op", () => {
    const list = addItem([], item("a"))
    expect(removeItem(list, "nope")).toHaveLength(1)
  })

  it("hasItem reports membership", () => {
    const list = addItem([], item("a"))
    expect(hasItem(list, "a")).toBe(true)
    expect(hasItem(list, "b")).toBe(false)
  })
})

describe("toggleItem", () => {
  it("saves when absent and reports saved:true", () => {
    const r = toggleItem([], item("a"))
    expect(r.saved).toBe(true)
    expect(r.list.map((i) => i.handle)).toEqual(["a"])
  })

  it("removes when present and reports saved:false", () => {
    const r = toggleItem(addItem([], item("a")), item("a"))
    expect(r.saved).toBe(false)
    expect(r.list).toHaveLength(0)
  })
})

describe("sanitize", () => {
  it("keeps well-formed entries", () => {
    expect(sanitize([item("a")])).toHaveLength(1)
  })

  it("drops junk rather than throwing on hand-edited storage", () => {
    expect(sanitize([item("a"), null, 3, "x", {}, { handle: "" }])).toHaveLength(1)
  })

  it("returns [] for a non-array", () => {
    for (const v of [null, undefined, {}, "[]", 7]) expect(sanitize(v)).toEqual([])
  })
})
