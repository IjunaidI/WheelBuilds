/**
 * Static Year/Make/Model lists used by the manual lookup flow.
 *
 * This is intentionally a small curated set — the real fitment-aware dataset
 * (year × make × model × submodel × drive) lands when Phase 2.1
 * (wheel-size.com integration) ships. At that point this file is replaced by a
 * server-fetched dataset and the YMM pane swaps to async dropdowns.
 */

export const YEARS: number[] = Array.from({ length: 11 }, (_, i) => 2025 - i)

export const MAKES: string[] = [
  "Ford",
  "Chevrolet",
  "Ram",
  "Toyota",
  "BMW",
  "Honda",
  "Jeep",
  "Tesla",
  "Dodge",
  "GMC",
  "Subaru",
  "Lexus",
]

export const MODELS_BY_MAKE: Record<string, string[]> = {
  Ford: ["F-150", "F-250", "Bronco", "Mustang", "Maverick"],
  Chevrolet: ["Silverado 1500", "Silverado 2500", "Tahoe", "Camaro", "Colorado"],
  Ram: ["1500", "2500", "3500", "ProMaster"],
  Toyota: ["Tacoma", "Tundra", "4Runner", "Land Cruiser", "GR Corolla"],
  BMW: ["M3", "M4", "M5", "X5 M", "3 Series"],
  Honda: ["Civic Type R", "Ridgeline", "Pilot", "Passport"],
  Jeep: ["Wrangler", "Gladiator", "Grand Cherokee", "Wagoneer"],
  Tesla: ["Model S", "Model 3", "Model X", "Model Y", "Cybertruck"],
  Dodge: ["Challenger", "Charger", "Durango"],
  GMC: ["Sierra 1500", "Sierra 2500", "Yukon", "Canyon"],
  Subaru: ["WRX", "STI", "Outback", "Forester"],
  Lexus: ["IS", "RC F", "LX", "GX"],
}

export const TRIMS_BY_MODEL: Record<string, string[]> = {
  "F-150": ["XL", "XLT", "Lariat", "King Ranch", "Raptor"],
  "F-250": ["XL", "XLT", "Lariat", "Tremor"],
  Bronco: ["Base", "Big Bend", "Badlands", "Raptor"],
  Mustang: ["EcoBoost", "GT", "Dark Horse"],
  Maverick: ["XL", "XLT", "Lariat", "Tremor"],
  "Silverado 1500": ["WT", "LT", "RST", "Trail Boss", "ZR2"],
  "Silverado 2500": ["WT", "LT", "LTZ", "ZR2"],
  Tahoe: ["LS", "LT", "RST", "Z71"],
  Camaro: ["1LT", "2SS", "ZL1"],
  Colorado: ["WT", "LT", "Z71", "ZR2"],
  "1500": ["Tradesman", "Big Horn", "Laramie", "Rebel", "TRX"],
  "2500": ["Tradesman", "Big Horn", "Power Wagon", "Laramie"],
  "3500": ["Tradesman", "Laramie", "Limited"],
  ProMaster: ["1500", "2500", "3500"],
  Tacoma: ["SR", "TRD Sport", "TRD Off-Road", "TRD Pro"],
  Tundra: ["SR", "Limited", "Platinum", "TRD Pro"],
  "4Runner": ["SR5", "TRD Off-Road", "TRD Pro"],
  "Land Cruiser": ["1958", "Land Cruiser"],
  "GR Corolla": ["Core", "Premium", "Circuit"],
  M3: ["Base", "Competition", "CS"],
  M4: ["Base", "Competition", "CSL"],
  M5: ["Base", "Competition"],
  "X5 M": ["Base", "Competition"],
  "3 Series": ["330i", "M340i"],
  "Civic Type R": ["Base"],
  Ridgeline: ["Sport", "RTL", "Black Edition", "TrailSport"],
  Pilot: ["LX", "EX-L", "TrailSport", "Elite"],
  Passport: ["EX-L", "TrailSport", "Black Edition"],
  Wrangler: ["Sport", "Sahara", "Rubicon", "392"],
  Gladiator: ["Sport", "Willys", "Rubicon", "Mojave"],
  "Grand Cherokee": ["Laredo", "Limited", "Trailhawk", "Summit"],
  Wagoneer: ["Series I", "Series II", "Series III"],
  "Model S": ["Long Range", "Plaid"],
  "Model 3": ["RWD", "Long Range", "Performance"],
  "Model X": ["Long Range", "Plaid"],
  "Model Y": ["RWD", "Long Range", "Performance"],
  Cybertruck: ["RWD", "AWD", "Cyberbeast"],
  Challenger: ["SXT", "R/T", "Scat Pack", "SRT Hellcat"],
  Charger: ["SXT", "R/T", "Scat Pack", "SRT Hellcat"],
  Durango: ["SXT", "R/T", "Citadel", "SRT Hellcat"],
  "Sierra 1500": ["Pro", "Elevation", "AT4", "Denali"],
  "Sierra 2500": ["Pro", "SLT", "AT4", "Denali"],
  Yukon: ["SLE", "SLT", "AT4", "Denali"],
  Canyon: ["Elevation", "AT4", "Denali"],
  WRX: ["Base", "Premium", "Limited", "TR"],
  STI: ["Base", "Limited", "Type RA"],
  Outback: ["Premium", "Onyx", "Wilderness"],
  Forester: ["Base", "Premium", "Sport", "Wilderness"],
  IS: ["IS 350 F Sport", "IS 500"],
  "RC F": ["Base", "Track Edition"],
  LX: ["LX 600", "F Sport"],
  GX: ["Premium", "Overtrail", "Luxury"],
}
