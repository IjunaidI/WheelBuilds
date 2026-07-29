import { forwardRef, useImperativeHandle, useRef } from "react"

import NativeSelect, {
  NativeSelectProps,
} from "@modules/common/components/native-select"

import { US_STATES } from "@lib/util/us-states"

/**
 * US state picker (WB-118 Q-07).
 *
 * Mirrors the sibling `CountrySelect` exactly so it inherits the same
 * `NativeSelect` chrome as the country field beside it in the address grid.
 *
 * Only rendered for US addresses — the caller falls back to a free-text
 * `Input` for every other country, because a non-US address must not be
 * constrained to US states.
 */
const StateSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ placeholder = "State", defaultValue, ...props }, ref) => {
    const innerRef = useRef<HTMLSelectElement>(null)

    useImperativeHandle<HTMLSelectElement | null, HTMLSelectElement | null>(
      ref,
      () => innerRef.current
    )

    return (
      <NativeSelect
        ref={innerRef}
        placeholder={placeholder}
        defaultValue={defaultValue}
        {...props}
      >
        {US_STATES.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </NativeSelect>
    )
  }
)

StateSelect.displayName = "StateSelect"

export default StateSelect
