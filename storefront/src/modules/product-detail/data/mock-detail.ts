/**
 * Mock product detail.
 *
 * Replaced by a Medusa product fetch when wiring real data — see
 * `get-product.ts` for the integration seam. One fully-populated product
 * stands in for every handle the user clicks.
 */

import { ProductDetail } from "./types"

export const MOCK_PRODUCT_DETAIL: ProductDetail = {
  // Base DiscoveryProduct fields
  id: "mock-feature",
  handle: "blackline-bl-7",
  brand: "BLACKLINE FORGED",
  name: "BL-7 MONOBLOCK",
  priceCents: 124900,
  originalPriceCents: 139900,
  finish: "black",
  diameter: 20,
  width: 9,
  boltPattern: "5×114.3",
  categories: ["luxury", "street"],
  isNew: true,
  fitsActiveVehicle: false,

  // PDP-only fields
  description:
    "A one-piece forged monoblock cut from 6061-T6 aerospace billet. The BL-7's split-spoke profile drops 4.8 lbs against the cast equivalent without compromising load rating. Hand-finished in Long Beach. Built to outlast the car under it.",
  spotlight:
    "The BL-7 is Blackline's flagship monoblock — a single ingot of aerospace-grade aluminum machined into a structural wheel with no welds, no compromises. We test every batch on a 24-hour cornering rig before it ships.",
  specs: {
    construction: "Forged 6061-T6",
    weightLb: 21.4,
    loadRatingLb: 1800,
    centerBoreMm: 73.1,
    hubBoreMm: 66.6,
    countryOfOrigin: "United States",
    warranty: "Lifetime structural",
    finishOptions: 3,
  },
  finishOptions: ["black", "bronze", "silver"],
  sizeOptions: [
    { diameter: 19, width: 8.5, offsetMm: 35, weightLb: 19.8, availability: "in_stock" },
    { diameter: 19, width: 9.5, offsetMm: 30, weightLb: 20.6, availability: "in_stock" },
    { diameter: 20, width: 9, offsetMm: 35, weightLb: 21.4, availability: "in_stock" },
    { diameter: 20, width: 10, offsetMm: 25, weightLb: 22.0, availability: "low_stock" },
    { diameter: 21, width: 9, offsetMm: 38, weightLb: 22.6, availability: "in_stock" },
    { diameter: 21, width: 10.5, offsetMm: 28, weightLb: 23.4, availability: "out_of_stock" },
    { diameter: 22, width: 9, offsetMm: 38, weightLb: 23.8, availability: "in_stock" },
    { diameter: 22, width: 10.5, offsetMm: 30, weightLb: 24.6, availability: "in_stock" },
  ],
  boltPatternOptions: ["5×114.3", "5×120", "5×130"],
  fitment: [
    { year: "2018–2024", make: "BMW", model: "M3", trim: "Competition", boltPattern: "5×112" },
    { year: "2017–2023", make: "BMW", model: "M5", boltPattern: "5×112" },
    { year: "2015–2024", make: "Ford", model: "Mustang", trim: "GT350 / GT500", boltPattern: "5×114.3" },
    { year: "2014–2024", make: "Chevrolet", model: "Corvette", trim: "Z06 / ZR1", boltPattern: "5×120.65" },
    { year: "2020–2024", make: "Tesla", model: "Model 3", trim: "Performance", boltPattern: "5×114.3", notes: "Requires hub-centric ring" },
    { year: "2019–2024", make: "Porsche", model: "911", trim: "Carrera S", boltPattern: "5×130" },
    { year: "2016–2023", make: "Audi", model: "RS5", boltPattern: "5×112" },
    { year: "2015–2024", make: "Mercedes", model: "C63 AMG", boltPattern: "5×112" },
  ],
  relatedHandles: [
    "vanguard-v8-mesh",
    "meridian-gt",
    "ronin-r1-monoblock",
    "atlas-at-9",
  ],
}
