import { notFound } from "next/navigation"
import CartDropdown from "../cart-dropdown"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"

const fetchCart = async () => {
  // WB-092 C3a: retrieveCart now rethrows on a genuine backend outage
  // instead of swallowing to null, so the /cart and /checkout PAGES can
  // surface an honest error boundary when the customer is specifically
  // looking at their cart. CartButton is different: it's the header icon,
  // rendered on every (main) page via <Nav>, not wrapped in an error
  // boundary (only a loading Suspense fallback). Letting the same throw
  // reach here would crash every page's render over an outage in a
  // low-stakes UI element nobody asked about -- so degrade gracefully
  // instead and let the dedicated cart page be the one that's honest.
  let cart
  try {
    cart = await retrieveCart()
  } catch (e) {
    console.error("CartButton: retrieveCart failed, degrading to no-cart icon:", e)
    return null
  }

  if (!cart) {
    return null
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart.items, cart.region_id!)
    cart.items = enrichedItems
  }

  return cart
}

export default async function CartButton() {
  const cart = await fetchCart()

  return <CartDropdown cart={cart} />
}
