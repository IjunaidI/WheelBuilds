/**
 * Builds the home page SEO description, with honest brand count.
 * When brandCount is falsy (0 or Meilisearch down), omits the numeral.
 */
export function homeMetaDescription(brandCount?: number): string {
  const brandPart = brandCount
    ? `Authorized dealer for ${brandCount} premium aftermarket wheel brands.`
    : "Authorized dealer for premium aftermarket wheel brands."

  return `${brandPart} Tell us what you drive — we'll show you only the wheels confirmed to fit.`
}
