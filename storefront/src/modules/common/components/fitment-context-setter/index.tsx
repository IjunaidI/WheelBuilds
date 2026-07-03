"use client"

import { useEffect } from "react"
import { setFitmentContext } from "@lib/stores/fitment-context"

/**
 * Marks the current surface as "wheels" or "tires" for the find-by-vehicle
 * drawer's destination default, then resets to "wheels" on unmount. Mounted by
 * tire surfaces (/tires template, tire PDP template). Renders nothing.
 */
const FitmentContextSetter = ({ target }: { target: "wheels" | "tires" }) => {
  useEffect(() => {
    setFitmentContext(target)
    return () => setFitmentContext("wheels")
  }, [target])
  return null
}

export default FitmentContextSetter
