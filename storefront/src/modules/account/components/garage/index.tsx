"use client"

import { Plus } from "@medusajs/icons"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"

const GarageManager = () => {
  const { vehicles, active, setActive, remove } = useGarage()

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 mt-4">
        <button
          className="border border-ui-border-base rounded-rounded p-5 min-h-[140px] h-full w-full flex flex-col justify-between"
          onClick={openSearch}
          data-testid="add-vehicle-button"
        >
          <span className="text-base-semi">Add a vehicle</span>
          <Plus />
        </button>

        {vehicles.map((v) => {
          const isActive = v.id === active?.id
          return (
            <div
              key={v.id}
              className="border border-ui-border-base rounded-rounded p-5 min-h-[140px] h-full w-full flex flex-col justify-between"
              data-testid="vehicle-card"
            >
              <div className="flex flex-col gap-y-1">
                <span className="text-base-semi">
                  {v.year} {v.make} {v.model}
                </span>
                {v.trim && (
                  <span className="text-base-regular text-ui-fg-subtle">{v.trim}</span>
                )}
                {isActive && (
                  <span className="text-small-regular text-ui-fg-interactive">Active</span>
                )}
              </div>
              <div className="flex items-center gap-x-4 mt-4">
                {!isActive && (
                  <button
                    className="text-small-regular text-ui-fg-subtle hover:text-ui-fg-base"
                    onClick={() => setActive(v.id)}
                    data-testid="set-active-button"
                  >
                    Set as active
                  </button>
                )}
                <button
                  className="text-small-regular text-rose-500 hover:text-rose-700"
                  onClick={() => remove(v.id)}
                  data-testid="remove-vehicle-button"
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {vehicles.length === 0 && (
        <p className="text-base-regular text-ui-fg-subtle mt-4">
          No vehicles saved yet — add one to see only the wheels that fit.
        </p>
      )}
    </div>
  )
}

export default GarageManager
