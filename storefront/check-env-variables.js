const c = require("ansi-colors")

const requiredEnvs = [
  {
    key: "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
    // TODO: we need a good doc to point this to
    description:
      "Learn how to create a publishable key: https://docs.medusajs.com/v2/resources/storefront-development/publishable-api-keys",
  },
  {
    key: "NEXT_PUBLIC_BASE_URL",
    // WB-095 X3: unset here silently poisons metadataBase, canonical URLs,
    // robots.ts's sitemap: line, and every URL in sitemap.ts with the
    // https://localhost:8000 fallback -- a prod deploy would publish
    // loopback canonicals to Google.
    description:
      "Your storefront's public URL, e.g. https://your-store.com. Feeds metadataBase, canonical URLs, robots.txt, and sitemap.xml.",
  },
  {
    key: "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
    description:
      "Your Medusa backend's public URL, e.g. https://your-backend.up.railway.app.",
  },
  {
    key: "NEXT_PUBLIC_SEARCH_ENDPOINT",
    // WB-095 X3: unset here points Discovery at loopback; the adapter
    // swallows the failure and ships a silently empty catalog (sitemap
    // included).
    description:
      "Your Meilisearch host, e.g. https://your-search.up.railway.app. Discovery and sitemap.xml both read from here.",
  },
  {
    key: "NEXT_PUBLIC_SEARCH_API_KEY",
    description: "The Meilisearch search-only API key for the above host.",
  },
]

function checkEnvVariables() {
  const missingEnvs = requiredEnvs.filter(function (env) {
    return !process.env[env.key]
  })

  if (missingEnvs.length > 0) {
    console.error(
      c.red.bold("\n🚫 Error: Missing required environment variables\n")
    )

    missingEnvs.forEach(function (env) {
      console.error(c.yellow(`  ${c.bold(env.key)}`))
      if (env.description) {
        console.error(c.dim(`    ${env.description}\n`))
      }
    })

    console.error(
      c.yellow(
        "\nPlease set these variables in your .env file or environment before starting the application.\n"
      )
    )

    process.exit(1)
  }
}

module.exports = checkEnvVariables
