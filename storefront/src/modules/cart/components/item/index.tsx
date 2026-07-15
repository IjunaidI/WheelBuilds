"use client"

import { Table, Text, clx } from "@medusajs/ui"

import { updateLineItem } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import CartItemSelect from "@modules/cart/components/cart-item-select"
import ErrorMessage from "@modules/checkout/components/error-message"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LineItemUnitPrice from "@modules/common/components/line-item-unit-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Spinner from "@modules/common/icons/spinner"
import Thumbnail from "@modules/products/components/thumbnail"
import { useState } from "react"
import { variantThumbnail } from "@lib/util/variant-thumbnail"
import { hasSufficientStock, maxSelectableQty } from "./max-qty"

type ItemProps = {
  item: HttpTypes.StoreCartLineItem
  type?: "full" | "preview"
}

const Item = ({ item, type = "full" }: ItemProps) => {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { handle } = item.variant?.product ?? {}

  const changeQuantity = async (quantity: number) => {
    setError(null)
    setUpdating(true)

    // WB-092 C9: updateLineItem now RETURNS { error } instead of throwing
    // (Next.js redacts thrown Server Action messages in production), so read
    // the result directly rather than `.catch`ing a redacted error.
    const res = await updateLineItem({
      lineId: item.id,
      quantity,
    })

    setUpdating(false)

    if (res?.error) {
      setError(res.error)
    }
  }

  // WB-092 C7: prefer the per-finish image over the product-representative
  // thumbnail, so a Bronze buyer's cart line doesn't show a Black wheel.
  const thumbnail = variantThumbnail(item.variant)

  const maxQuantity = maxSelectableQty(item.variant as any, item.quantity)

  // WB-092 C2: display-only OOS/insufficient badge — mirrors the same
  // manage_inventory/allow_backorder rules as maxQuantity above via
  // hasSufficientStock, but does NOT feed back into maxQuantity. The WB-034
  // qty-selector cap (which floors at the current quantity so a stock drop
  // can never make an already-in-cart quantity unselectable) is unchanged;
  // this only surfaces that the line is now over live availability.
  const insufficientStock = !hasSufficientStock(item.variant as any, item.quantity)
  const availableQty = Math.max(
    0,
    (item.variant as any)?.inventory_quantity ?? 0
  )

  return (
    <Table.Row className="w-full" data-testid="product-row">
      <Table.Cell className="!pl-0 p-4 w-24">
        {handle ? (
          <LocalizedClientLink
            href={`/products/${handle}`}
            className={clx("flex", {
              "w-16": type === "preview",
              "small:w-24 w-12": type === "full",
            })}
          >
            <Thumbnail
              thumbnail={thumbnail}
              images={item.variant?.product?.images}
              size="square"
            />
          </LocalizedClientLink>
        ) : (
          <div
            className={clx("flex", {
              "w-16": type === "preview",
              "small:w-24 w-12": type === "full",
            })}
          >
            <Thumbnail
              thumbnail={thumbnail}
              images={item.variant?.product?.images}
              size="square"
            />
          </div>
        )}
      </Table.Cell>

      <Table.Cell className="text-left">
        <Text
          className="txt-medium-plus text-ui-fg-base"
          data-testid="product-title"
        >
          {item.product_title}
        </Text>
        <LineItemOptions variant={item.variant} data-testid="product-variant" />
        {insufficientStock && (
          <Text
            className="text-rose-500 text-small-regular mt-1"
            data-testid="product-insufficient-stock-badge"
          >
            {availableQty > 0 ? `Only ${availableQty} left in stock` : "Out of stock"}
          </Text>
        )}
      </Table.Cell>

      {type === "full" && (
        <Table.Cell>
          <div className="flex gap-2 items-center w-28">
            <DeleteButton id={item.id} data-testid="product-delete-button" />
            <CartItemSelect
              value={item.quantity}
              onChange={(value) => changeQuantity(parseInt(value.target.value))}
              className="w-14 h-10 p-4"
              data-testid="product-select-button"
            >
              {Array.from(
                {
                  length: maxQuantity,
                },
                (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1}
                  </option>
                )
              )}
            </CartItemSelect>
            {updating && <Spinner />}
          </div>
          <ErrorMessage error={error} data-testid="product-error-message" />
        </Table.Cell>
      )}

      {type === "full" && (
        <Table.Cell className="hidden small:table-cell">
          <LineItemUnitPrice item={item} style="tight" />
        </Table.Cell>
      )}

      <Table.Cell className="!pr-0">
        <span
          className={clx("!pr-0", {
            "flex flex-col items-end h-full justify-center": type === "preview",
          })}
        >
          {type === "preview" && (
            <span className="flex gap-x-1 ">
              <Text className="text-ui-fg-muted">{item.quantity}x </Text>
              <LineItemUnitPrice item={item} style="tight" />
            </span>
          )}
          <LineItemPrice item={item} style="tight" />
        </span>
      </Table.Cell>
    </Table.Row>
  )
}

export default Item
