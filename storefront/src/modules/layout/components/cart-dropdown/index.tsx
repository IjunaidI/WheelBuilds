"use client"

import { Button as MedusaButton } from "@medusajs/ui"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import Icon from "@modules/common/components/icon"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"

/**
 * Cart preview. The trigger is a Link (clicking goes to /cart), so we don't use
 * PopoverTrigger — instead we use a controlled Popover that opens on hover and
 * on cart-item count changes, and PopoverAnchor positions the panel under the
 * link without hijacking its click.
 */
const CartDropdown = ({
  cart: cartState,
}: {
  cart?: HttpTypes.StoreCart | null
}) => {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<NodeJS.Timeout | null>(null)

  const totalItems =
    cartState?.items?.reduce((acc, item) => acc + item.quantity, 0) || 0
  const subtotal = cartState?.subtotal ?? 0
  const itemRef = useRef<number>(totalItems)

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const openTimed = () => {
    clearCloseTimer()
    setOpen(true)
    closeTimer.current = setTimeout(() => setOpen(false), 5000)
  }

  const openOnHover = () => {
    clearCloseTimer()
    setOpen(true)
  }

  const closeOnLeave = () => {
    clearCloseTimer()
    setOpen(false)
  }

  useEffect(() => () => clearCloseTimer(), [])

  const pathname = usePathname()

  // Auto-open when items added to the cart (unless we're already on /cart)
  useEffect(() => {
    if (itemRef.current !== totalItems && !pathname.includes("/cart")) {
      openTimed()
    }
    itemRef.current = totalItems
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className="h-full"
        onMouseEnter={openOnHover}
        onMouseLeave={closeOnLeave}
      >
        <PopoverAnchor asChild>
          <LocalizedClientLink
            className="relative inline-flex items-center text-ui-fg-base"
            href="/cart"
            data-testid="nav-cart-link"
            aria-label={`Cart (${totalItems})`}
          >
            <Icon name="bag" size={16} />
            {totalItems > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -10,
                  background: "var(--orange, #FF6A00)",
                  color: "white",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: 8,
                  minWidth: 14,
                  height: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  lineHeight: 1,
                }}
              >
                {totalItems}
              </span>
            )}
          </LocalizedClientLink>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          sideOffset={1}
          className="hidden small:block w-[420px] p-0 text-ui-fg-base"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={openOnHover}
          onMouseLeave={closeOnLeave}
          data-testid="nav-cart-dropdown"
        >
          <div className="p-4 flex items-center justify-center">
            <h3 className="text-large-semi">Cart</h3>
          </div>
          {cartState && cartState.items?.length ? (
            <>
              <div className="overflow-y-scroll max-h-[402px] px-4 grid grid-cols-1 gap-y-8 no-scrollbar p-px">
                {cartState.items
                  .sort((a, b) =>
                    (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                  )
                  .map((item) => (
                    <div
                      className="grid grid-cols-[122px_1fr] gap-x-4"
                      key={item.id}
                      data-testid="cart-item"
                    >
                      <LocalizedClientLink
                        href={`/products/${item.variant?.product?.handle}`}
                        className="w-24"
                      >
                        <Thumbnail
                          thumbnail={item.variant?.product?.thumbnail}
                          images={item.variant?.product?.images}
                          size="square"
                        />
                      </LocalizedClientLink>
                      <div className="flex flex-col justify-between flex-1">
                        <div className="flex flex-col flex-1">
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col overflow-ellipsis whitespace-nowrap mr-4 w-[180px]">
                              <h3 className="text-base-regular overflow-hidden text-ellipsis">
                                <LocalizedClientLink
                                  href={`/products/${item.variant?.product?.handle}`}
                                  data-testid="product-link"
                                >
                                  {item.title}
                                </LocalizedClientLink>
                              </h3>
                              <LineItemOptions
                                variant={item.variant}
                                data-testid="cart-item-variant"
                                data-value={item.variant}
                              />
                              <span
                                data-testid="cart-item-quantity"
                                data-value={item.quantity}
                              >
                                Quantity: {item.quantity}
                              </span>
                            </div>
                            <div className="flex justify-end">
                              <LineItemPrice item={item} style="tight" />
                            </div>
                          </div>
                        </div>
                        <DeleteButton
                          id={item.id}
                          className="mt-1"
                          data-testid="cart-item-remove-button"
                        >
                          Remove
                        </DeleteButton>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="p-4 flex flex-col gap-y-4 text-small-regular">
                <div className="flex items-center justify-between">
                  <span className="text-ui-fg-base font-semibold">
                    Subtotal{" "}
                    <span className="font-normal">(excl. taxes)</span>
                  </span>
                  <span
                    className="text-large-semi"
                    data-testid="cart-subtotal"
                    data-value={subtotal}
                  >
                    {convertToLocale({
                      amount: subtotal,
                      currency_code: cartState.currency_code,
                    })}
                  </span>
                </div>
                <LocalizedClientLink href="/cart" passHref>
                  <MedusaButton
                    className="w-full"
                    size="large"
                    data-testid="go-to-cart-button"
                  >
                    Go to cart
                  </MedusaButton>
                </LocalizedClientLink>
              </div>
            </>
          ) : (
            <div>
              <div className="flex py-16 flex-col gap-y-4 items-center justify-center">
                <div className="bg-gray-900 text-small-regular flex items-center justify-center w-6 h-6 rounded-full text-white">
                  <span>0</span>
                </div>
                <span>Your shopping bag is empty.</span>
                <div>
                  <LocalizedClientLink href="/store">
                    <>
                      <span className="sr-only">Go to all products page</span>
                      <MedusaButton onClick={() => setOpen(false)}>
                        Explore products
                      </MedusaButton>
                    </>
                  </LocalizedClientLink>
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </div>
    </Popover>
  )
}

export default CartDropdown
