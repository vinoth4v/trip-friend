import { expect, test } from "@playwright/test"

test("an unauthenticated visitor is sent to the login page", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()

  // The gate has to actually withhold the page, not merely change the URL.
  await expect(page.getByText("Your next adventure")).toHaveCount(0)
})

test("a trip page is withheld too, not just the home page", async ({ page }) => {
  // Closed-by-default is the template's claim; this checks it still holds for
  // a route added after the fact, with a plausible-looking id.
  await page.goto("/trips/00000000-0000-4000-8000-000000000000")

  await expect(page).toHaveURL(/\/login/)
})

test("the share route is reachable without a session, and empty without a token", async ({
  page,
}) => {
  // `/s/` is the one deliberate hole in the gate, so it gets its own test:
  // the failure that matters is not "share links are broken" but "the
  // exemption is wider than intended". An unknown token must 404 rather than
  // redirect to login (which would mean the exemption never applied) or show
  // anything at all (which would mean it protects nothing).
  const response = await page.goto("/s/not-a-real-token")

  expect(page.url()).not.toContain("/login")
  expect(response?.status()).toBe(404)
})

test("the PDF download is behind the same gate as the trip it belongs to", async ({ page }) => {
  // A file route is the easiest kind to leave open by accident: nothing about
  // it renders, so nobody notices it answering. This is the check that the
  // proxy's matcher still covers a route added after it was written.
  await page.goto("/trips/00000000-0000-4000-8000-000000000000/itinerary.pdf")

  await expect(page).toHaveURL(/\/login/)
})

test("the shared PDF is public, and 404s without a real token", async ({ page }) => {
  // The share exemption is a prefix, so it covers this route too — deliberately,
  // because the people you are travelling with are the ones who want a printed
  // copy. What it must not do is hand one out for a token that is not a token.
  const response = await page.goto("/s/not-a-real-token/itinerary.pdf")

  expect(page.url()).not.toContain("/login")
  expect(response?.status()).toBe(404)
})

test("the login page is styled by the token stylesheet", async ({ page }) => {
  await page.goto("/login")

  // Proves the generated CSS was built and served — a missing dist/tokens.css
  // leaves this custom property undefined.
  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
  )

  expect(background).not.toBe("")
})
