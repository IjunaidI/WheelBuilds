import { describe, it, expect } from "vitest"
import { isNavLinkActive } from "../nav-active"

describe("isNavLinkActive", () => {
  it("highlights Tires on /tires (and its subpaths), never Wheels", () => {
    expect(isNavLinkActive("/us/tires", "/tires")).toBe(true)
    expect(isNavLinkActive("/us/tires", "/store")).toBe(false)
    expect(isNavLinkActive("/us/tires/anything", "/tires")).toBe(true)
  })
  it("highlights Wheels on /store, not Tires", () => {
    expect(isNavLinkActive("/us/store", "/store")).toBe(true)
    expect(isNavLinkActive("/us/store", "/tires")).toBe(false)
  })
  it("strips any 2-letter country prefix", () => {
    expect(isNavLinkActive("/gb/collections", "/collections")).toBe(true)
    expect(isNavLinkActive("/de/categories", "/categories")).toBe(true)
  })
  it("does not prefix-false-match (/store vs /storefront)", () => {
    expect(isNavLinkActive("/us/storefront", "/store")).toBe(false)
  })
  it("never matches placeholder # links", () => {
    expect(isNavLinkActive("/us/store", "#")).toBe(false)
  })
  it("highlights nothing on home or a product page (ambiguous wheel/tire)", () => {
    expect(isNavLinkActive("/us", "/store")).toBe(false)
    expect(isNavLinkActive("/us/products/some-wheel", "/store")).toBe(false)
    expect(isNavLinkActive("/us/products/some-tire", "/tires")).toBe(false)
  })
})
