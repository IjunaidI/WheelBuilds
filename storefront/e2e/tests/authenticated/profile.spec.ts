import { test, expect } from "../../index"

test.describe("Account profile tests", () => {
  test("Profile completed update flow", async ({
    accountOverviewPage: overviewPage,
    accountProfilePage: profilePage,
  }) => {
    await overviewPage.goto()
    await expect(overviewPage.profileCompletion).toHaveText("50%")

    await test.step("navigate to the profile page", async () => {
      await profilePage.profileLink.click()
      await expect(profilePage.profileWrapper).toBeVisible()
    })

    await test.step("update the saved profile phone number", async () => {
      await expect(profilePage.savedPhone).toHaveText("")
      await profilePage.phoneEditButton.click()
      await profilePage.phoneInput.fill("8888888888")
      await profilePage.phoneSaveButton.click()
      await expect(profilePage.phoneSuccessMessage).toBeVisible()
      await expect(profilePage.savedPhone).toHaveText("8888888888")
    })

    await test.step("verify the profile completion state and go back to the profile page", async () => {
      await profilePage.overviewLink.click()
      await expect(overviewPage.profileCompletion).toHaveText("75%")

      await profilePage.profileLink.click()
      await expect(profilePage.profileWrapper).toBeVisible()
    })

    await test.step("enter in the billing address", async () => {
      await expect(profilePage.savedBillingAddress).toContainText(
        "No billing address"
      )
      await profilePage.billingAddressEditButton.click()
      await profilePage.billingFirstNameInput.fill("First")
      await profilePage.billingLastNameInput.fill("Last")
      await profilePage.billingAddress1Input.fill("123 Fake Street")
      await profilePage.billingPostcalCodeInput.fill("11111")
      await profilePage.billingCityInput.fill("Springdale")
      await profilePage.billingProvinceInput.fill("IL")
      await profilePage.billingCountryCodeSelect.selectOption({
        label: "United States",
      })
      await profilePage.billingAddressSaveButton.click()
      await expect(profilePage.billingAddressSuccessMessage).toBeVisible()
    })

    await test.step("profile completion state", async () => {
      await profilePage.overviewLink.click()
      await expect(overviewPage.profileCompletion).toHaveText("100%")

      await profilePage.goto()
      await expect(profilePage.savedBillingAddress).toContainText("First Last")
      await expect(profilePage.savedBillingAddress).toContainText(
        "123 Fake Street"
      )
      await expect(profilePage.savedBillingAddress).toContainText(
        "11111, Springdale"
      )
      await expect(profilePage.savedBillingAddress).toContainText(
        "United States"
      )
    })
  })

  test("Profile changes persist across page refreshes and logouts", async ({
    page,
    loginPage,
    accountOverviewPage: overviewPage,
    accountProfilePage: profilePage,
  }) => {
    await overviewPage.goto()
    await expect(overviewPage.profileCompletion).toHaveText("50%")

    await test.step("navigate to the profile page", async () => {
      await profilePage.profileLink.click()
      await expect(profilePage.profileWrapper).toBeVisible()
    })

    await test.step("update the first and last name", async () => {
      await profilePage.nameEditButton.click()
      await profilePage.firstNameInput.fill("FirstNew")
      await profilePage.lastNameInput.fill("LastNew")
      await profilePage.nameSaveButton.click()
      await profilePage.nameSuccessMessage.waitFor({ state: "visible" })
    })

    await test.step("update the saved profile phone number", async () => {
      await expect(profilePage.savedPhone).toHaveText("")
      await profilePage.phoneEditButton.click()
      await profilePage.phoneInput.fill("8888888888")
      await profilePage.phoneSaveButton.click()
      await expect(profilePage.phoneSuccessMessage).toBeVisible()
      await expect(profilePage.savedPhone).toHaveText("8888888888")
    })

    await test.step("enter in the billing address", async () => {
      await expect(profilePage.savedBillingAddress).toContainText(
        "No billing address"
      )
      await profilePage.billingAddressEditButton.click()
      await profilePage.billingFirstNameInput.fill("First")
      await profilePage.billingLastNameInput.fill("Last")
      await profilePage.billingAddress1Input.fill("123 Fake Street")
      await profilePage.billingPostcalCodeInput.fill("11111")
      await profilePage.billingCityInput.fill("Springdale")
      await profilePage.billingProvinceInput.fill("IL")
      await profilePage.billingCountryCodeSelect.selectOption({
        label: "United States",
      })
      await profilePage.billingAddressSaveButton.click()
      await expect(profilePage.billingAddressSuccessMessage).toBeVisible()
    })

    await test.step("Refresh page and verify information saved is still there", async () => {
      await page.reload()
      await expect(profilePage.savedName).toContainText("FirstNew")
      await expect(profilePage.savedName).toContainText("LastNew")
      await expect(profilePage.savedPhone).toContainText("8888888888")

      await expect(profilePage.savedBillingAddress).toContainText("First Last")
      await expect(profilePage.savedBillingAddress).toContainText(
        "123 Fake Street"
      )
      await expect(profilePage.savedBillingAddress).toContainText(
        "11111, Springdale"
      )
      await expect(profilePage.savedBillingAddress).toContainText(
        "United States"
      )
    })

    await test.step("Log out and log back in", async () => {
      await profilePage.logoutLink.click()
      await expect(loginPage.container).toBeVisible()
      await loginPage.emailInput.fill("test@example.com")
      await loginPage.passwordInput.fill("password")
      await loginPage.signInButton.click()
      await overviewPage.overviewWrapper.waitFor({ state: "visible" })
      await overviewPage.profileLink.click()
      await profilePage.profileWrapper.waitFor({ state: "visible" })
    })

    await test.step("Verify the saved profile information is correct", async () => {
      await expect(profilePage.savedName).toContainText("FirstNew")
      await expect(profilePage.savedName).toContainText("LastNew")
      await expect(profilePage.savedPhone).toContainText("8888888888")

      await expect(profilePage.savedBillingAddress).toContainText("First Last")
      await expect(profilePage.savedBillingAddress).toContainText(
        "123 Fake Street"
      )
      await expect(profilePage.savedBillingAddress).toContainText(
        "11111, Springdale"
      )
      await expect(profilePage.savedBillingAddress).toContainText(
        "United States"
      )
    })
  })

  test("Sends a password reset email instead of changing the password inline", async ({
    accountProfilePage: profilePage,
    accountOverviewPage: overviewPage,
  }) => {
    // D4 replaced the inline old/new/confirm password form with a single
    // "send reset email" action (account is passwordless from the UI's
    // perspective — the actual reset happens via the emailed link). There is
    // no live-email assertion here; the Server Action always resolves to the
    // same "SENT" sentinel regardless of outcome (no account enumeration —
    // see forgotPassword in lib/data/customer.ts), so this only needs to
    // confirm the button click flips the editor into its sent state.
    await test.step("Navigate to the account Profile page", async () => {
      await overviewPage.goto()
      await profilePage.profileLink.click()
      await expect(profilePage.profileWrapper).toBeVisible()
    })

    await test.step("Send the reset email", async () => {
      await expect(profilePage.sendResetEmailButton).toBeVisible()
      await profilePage.sendResetEmailButton.click()
      await expect(profilePage.passwordSentMessage).toBeVisible()
    })
  })

  test("Email is shown read-only with a link to contact support (A3)", async ({
    accountProfilePage: profilePage,
    accountOverviewPage: accountPage,
  }) => {
    // A3 -- the email "editor" used to call nothing and always report
    // success (`updateCustomer` was commented out), so a customer who
    // "changed" their email here would find it silently unchanged and their
    // login untouched. There is no real email-change flow yet (that's an
    // auth-identity project, not a profile-field edit), so the field is
    // read-only with a path to support instead of a fake form.
    await test.step("Navigate to the account Profile page", async () => {
      await accountPage.goto()
      await accountPage.welcomeMessage.waitFor({ state: "visible" })
      await accountPage.profileLink.click()
      await profilePage.profileWrapper.waitFor({ state: "visible" })
    })

    await test.step("Email is displayed but not editable", async () => {
      await expect(profilePage.savedEmail).toHaveText("test@example.com")
      await expect(
        profilePage.accountEmailEditor.getByTestId("edit-button")
      ).toHaveCount(0)
      await expect(profilePage.emailContactLink).toBeVisible()
      await expect(profilePage.emailContactLink).toHaveAttribute(
        "href",
        /\/contact$/
      )
    })
  })
})
