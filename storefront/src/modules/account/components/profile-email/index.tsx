import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

// Changing a customer's login email is an auth-identity change, not a
// profile-field edit -- Medusa's store customer.update doesn't touch the
// identity/credential record, so a form here could never actually change
// how the customer logs in. Rather than fake a working editor (the previous
// version called nothing and always reported success), this renders the
// email read-only and points the customer at support. Revisit if/when a real
// email-change flow (re-verification, identity update) is built.
const ProfileEmail: React.FC<MyInformationProps> = ({ customer }) => {
  return (
    <div className="text-small-regular" data-testid="account-email-editor">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="uppercase text-ui-fg-base">Email</span>
          <div className="flex items-center flex-1 basis-0 justify-end gap-x-4">
            <span className="font-semibold" data-testid="current-info">
              {customer.email}
            </span>
          </div>
        </div>
      </div>
      <p className="text-ui-fg-subtle text-small-regular mt-2">
        This is the email you use to sign in and can&apos;t be changed here.{" "}
        <LocalizedClientLink href="/contact" className="underline">
          Contact us
        </LocalizedClientLink>{" "}
        if you need it updated.
      </p>
    </div>
  )
}

export default ProfileEmail
