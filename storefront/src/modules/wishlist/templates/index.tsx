"use client"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel from "@modules/common/components/wheel"
import { Button } from "@/components/ui/button"
import { formatCentsUsd } from "@lib/util/money"
import { removeFromWishlist, useWishlist } from "@lib/wishlist"

/**
 * The saved-items page (WB-125).
 *
 * Client-rendered because the wishlist lives in the browser — there is no
 * server-side list to fetch for a guest, which is the whole point.
 *
 * Prices and images are the snapshot taken at save time and are labelled as
 * such: the PDP remains authoritative for price and stock, and quietly showing
 * a stale price as if it were live would repeat the class of dishonesty this
 * work exists to remove.
 */
const WishlistTemplate = () => {
  const items = useWishlist()

  return (
    <div className="px-5 xsmall:px-8 small:px-20 py-14 small:py-20">
      <Label bar style={{ marginBottom: 14, display: "block" }}>
        SAVED
      </Label>
      <Display as="h1" size={44}>
        Your wishlist
      </Display>

      {items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-[var(--radius)] border border-dashed border-[var(--hairline)] py-24 text-center">
          <div style={{ opacity: 0.4 }}>
            <Wheel size={120} finish="black" />
          </div>
          <Label tone="muted">NOTHING SAVED YET</Label>
          <p className="max-w-[420px] text-[14px] text-[var(--graphite)]">
            Tap the heart on any wheel or tire to keep it here — no account
            needed.
          </p>
          <LocalizedClientLink href="/store">
            <Button className="mt-2">Browse wheels</Button>
          </LocalizedClientLink>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[13px] text-[var(--graphite)]">
            {items.length} saved {items.length === 1 ? "item" : "items"}. Saved
            in this browser — clearing site data or switching device will lose
            them.
          </p>
          <ul className="mt-8 grid list-none grid-cols-1 gap-4 p-0 small:grid-cols-2 medium:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.handle}
                className="flex items-center gap-4 rounded-[var(--radius)] border border-[var(--hairline)] bg-white p-4"
              >
                <LocalizedClientLink
                  href={`/products/${item.handle}`}
                  className="flex flex-1 items-center gap-4 no-underline"
                >
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt={item.name}
                      className="h-16 w-16 shrink-0 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Wheel size={64} finish="black" />
                  )}
                  <span className="min-w-0 flex-1">
                    <Label
                      tone="muted"
                      style={{ fontSize: 9, display: "block", marginBottom: 2 }}
                    >
                      {item.brand}
                    </Label>
                    <span className="block font-[var(--display)] text-[15px] uppercase leading-[1.1] text-[var(--ink)]">
                      {item.name}
                    </span>
                    <span className="mt-1 block font-[var(--mono)] text-[11px] text-[var(--ink-soft)]">
                      {formatCentsUsd(item.priceCents)} when saved
                    </span>
                  </span>
                </LocalizedClientLink>
                <button
                  type="button"
                  onClick={() => removeFromWishlist(item.handle)}
                  aria-label={`Remove ${item.name} from wishlist`}
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-soft)] underline underline-offset-2 hover:text-[var(--orange-deep)]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default WishlistTemplate
