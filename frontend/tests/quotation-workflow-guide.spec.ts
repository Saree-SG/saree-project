import { expect, test } from "@playwright/test"

test("Quotation detail exposes the step-by-step workflow guide", async ({
  page,
}) => {
  await page.goto("/quotations")

  const quotationLinks = page.locator(
    'a[href^="/quotations/"]:not([href="/quotations/new"]):not([href="/quotations/reports"])',
  )
  test.skip(
    (await quotationLinks.count()) === 0,
    "The authenticated test user needs one seeded quotation.",
  )
  await quotationLinks.first().click()

  await page.getByTestId("quotation-workflow-guide-trigger").click()

  const guide = page.getByTestId("quotation-workflow-guide")
  await expect(guide).toBeVisible()
  await expect(
    guide.getByRole("heading", { name: "Quy trình báo giá từng bước" }),
  ).toBeVisible()
  await expect(guide.getByText("Checklist theo giai đoạn")).toBeVisible()
  await expect(guide.getByText("Kết thúc hồ sơ")).toBeVisible()
})
