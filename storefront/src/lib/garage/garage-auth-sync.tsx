"use client"
import { useEffect } from "react"
import { garage } from "./index"
export default function GarageAuthSync({ customerId }: { customerId: string | null }) {
  useEffect(() => { void (garage as any).syncAuth?.() }, [customerId])
  return null
}
