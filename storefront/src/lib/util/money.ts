import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
}: ConvertToLocaleParams) => {
  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString()
}

/**
 * Format an INTEGER-CENTS amount as an exact USD string, e.g. 36999 -> "$369.99".
 * Never rounds to whole dollars (WB-071 F-I: displayed price must equal the
 * charged price). Wraps convertToLocale so the currency formatting stays central.
 */
export const formatCentsUsd = (cents: number): string =>
  convertToLocale({
    amount: (cents ?? 0) / 100,
    currency_code: "usd",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
