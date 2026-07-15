import { Locator, Page } from "@playwright/test"
import { AccountPage } from "./account-page"
import { camelCase } from "lodash"

export class ProfilePage extends AccountPage {
  profileWrapper: Locator
  accountNameEditor: Locator
  accountEmailEditor: Locator
  accountPhoneEditor: Locator
  accountPasswordEditor: Locator
  accountBillingAddressEditor: Locator

  nameEditButton: Locator
  phoneEditButton: Locator
  billingAddressEditButton: Locator

  nameSaveButton: Locator
  phoneSaveButton: Locator
  billingAddressSaveButton: Locator

  savedName: Locator
  savedEmail: Locator
  savedPhone: Locator
  savedBillingAddress: Locator

  // Email (A3): read-only display + a link out to support, no inline
  // edit/save form -- Medusa's store customer.update doesn't touch login
  // credentials, so an inline "editor" here could never actually change how
  // the customer signs in. See emailContactLink below, sourced from
  // account-email-editor's own contents.
  emailContactLink: Locator

  nameSuccessMessage: Locator
  phoneSuccessMessage: Locator
  billingAddressSuccessMessage: Locator

  nameErrorMessage: Locator
  phoneErrorMessage: Locator
  billingAddressErrorMessage: Locator

  firstNameInput: Locator
  lastNameInput: Locator

  phoneInput: Locator

  // Password is no longer an inline edit/save form (D4 — replaced by a single
  // "send reset email" action). See sendResetEmailButton / passwordSentMessage
  // below, sourced from account-password-editor's own testids.
  sendResetEmailButton: Locator
  passwordSentMessage: Locator

  billingAddress1Input: Locator
  billingAddress2Input: Locator
  billingCityInput: Locator
  billingCompanyInput: Locator
  billingFirstNameInput: Locator
  billingLastNameInput: Locator
  billingPostcalCodeInput: Locator
  billingProvinceInput: Locator
  billingCountryCodeSelect: Locator

  constructor(page: Page) {
    super(page)
    this.profileWrapper = page.getByTestId("profile-page-wrapper")
    this.accountNameEditor = this.container.getByTestId("account-name-editor")
    this.accountEmailEditor = this.container.getByTestId("account-email-editor")
    this.accountPhoneEditor = this.container.getByTestId("account-phone-editor")
    this.accountPasswordEditor = this.container.getByTestId(
      "account-password-editor"
    )
    this.accountBillingAddressEditor = this.container.getByTestId(
      "account-billing-address-editor"
    )

    this.nameEditButton = this.accountNameEditor.getByTestId("edit-button")
    this.phoneEditButton = this.accountPhoneEditor.getByTestId("edit-button")
    this.billingAddressEditButton =
      this.accountBillingAddressEditor.getByTestId("edit-button")

    this.nameSaveButton = this.accountNameEditor.getByTestId("save-button")
    this.phoneSaveButton = this.accountPhoneEditor.getByTestId("save-button")
    this.billingAddressSaveButton =
      this.accountBillingAddressEditor.getByTestId("save-button")

    this.savedName = this.accountNameEditor.getByTestId("current-info")
    this.savedEmail = this.accountEmailEditor.getByTestId("current-info")
    this.savedPhone = this.accountPhoneEditor.getByTestId("current-info")
    this.savedBillingAddress =
      this.accountBillingAddressEditor.getByTestId("current-info")
    this.emailContactLink = this.accountEmailEditor.getByRole("link", {
      name: /contact us/i,
    })
    this.nameSuccessMessage =
      this.accountNameEditor.getByTestId("success-message")
    this.phoneSuccessMessage =
      this.accountPhoneEditor.getByTestId("success-message")
    this.billingAddressSuccessMessage =
      this.accountBillingAddressEditor.getByTestId("success-message")
    this.nameErrorMessage = this.accountNameEditor.getByTestId("error-message")
    this.phoneErrorMessage =
      this.accountPhoneEditor.getByTestId("error-message")
    this.billingAddressErrorMessage =
      this.accountBillingAddressEditor.getByTestId("error-message")

    // Password editor (D4): a single "send reset email" button, no inline
    // edit/save form. `send-reset-email-button` is the only testid the
    // component renders; the confirmation copy has no dedicated testid, so we
    // match on its text within the editor's own wrapper.
    this.sendResetEmailButton = this.accountPasswordEditor.getByTestId(
      "send-reset-email-button"
    )
    this.passwordSentMessage = this.accountPasswordEditor.getByText(
      /we've emailed/i
    )

    this.firstNameInput = page.getByTestId("first-name-input")
    this.lastNameInput = page.getByTestId("last-name-input")
    this.phoneInput = page.getByTestId("phone-input")

    this.billingAddress1Input = page.getByTestId("billing-address-1-input")
    this.billingAddress2Input = page.getByTestId("billing-address-2-input")
    this.billingCityInput = page.getByTestId("billing-city-input")
    this.billingCompanyInput = page.getByTestId("billing-company-input")
    this.billingFirstNameInput = page.getByTestId("billing-first-name-input")
    this.billingLastNameInput = page.getByTestId("billing-last-name-input")
    this.billingPostcalCodeInput = page.getByTestId(
      "billing-postcal-code-input"
    )
    this.billingProvinceInput = page.getByTestId("billing-province-input")
    this.billingCountryCodeSelect = page.getByTestId(
      "billing-country-code-select"
    )
  }

  async getEditorInputs(editor: Locator) {
    const editButton = editor.getByTestId("edit-button")
    if ((await editButton.getAttribute("active")) !== "true") {
      await editButton.click()
    }
    // get all the inputs
    const inputs = editor.locator(
      '[data-testid]:not([data-testid="edit-button"])'
    )
    const o = {
      editButton,
    } as { [k: string]: Locator }
    for (const input of await inputs.all()) {
      const testId = (await input.getAttribute("data-testid")) as string
      const key = camelCase(testId)
      o[key] = input
    }
    return o
  }

  async goto() {
    super.goto()
    await this.profileLink.click()
    await this.profileWrapper.waitFor({ state: "visible" })
  }
}
