import { expect, test } from "@playwright/test"

test("Contracts page opens its contextual guide", async ({ page }) => {
  await page.goto("/contracts")

  await page.getByTestId("contracts-page-guide-trigger").click()

  const guide = page.getByTestId("contracts-page-guide")
  await expect(guide).toBeVisible()
  await expect(guide.getByRole("heading", { name: "Hợp đồng" })).toBeVisible()
  await expect(guide.getByText("Luồng sau khi thắng báo giá")).toBeVisible()
})
