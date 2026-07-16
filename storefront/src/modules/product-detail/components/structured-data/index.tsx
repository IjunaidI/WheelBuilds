import { breadcrumbJsonLd, productJsonLd, toJsonLdScript, Crumb, ProductLike } from "./json-ld"

type ProductStructuredDataProps = {
  /**
   * Built by each PDP template from its own `ProductDetail` (wheel) /
   * `TireProductDetail` (tire) via `pickDefaultLeaf`/`pickDefaultTireLeaf`
   * (`data/pick-default-leaf.ts`) — see json-ld.ts's `RenderedLeaf` doc.
   */
  product: ProductLike
  /** Absolute canonical URL for this exact PDP (reuse `canonicalUrl(\`/products/${handle}\`)`, same as the Task 3 `alternates.canonical`). */
  url: string
  /** Home-first crumb list; each PDP template synthesizes "Home" itself (neither breadcrumb component has one). */
  breadcrumbs: Crumb[]
}

/**
 * Renders the PDP's `Product` + `BreadcrumbList` JSON-LD as two
 * `<script type="application/ld+json">` tags in the template body. This is
 * NOT metadata — it must not be added to `generateMetadata` (that already
 * carries Task 2's openGraph/twitter and Task 3's canonical; this renders
 * separately, in the page markup).
 */
const ProductStructuredData = ({
  product,
  url,
  breadcrumbs,
}: ProductStructuredDataProps) => {
  const productLd = productJsonLd(product, url)
  const breadcrumbLd = breadcrumbJsonLd(breadcrumbs)
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbLd) }}
      />
    </>
  )
}

export default ProductStructuredData
