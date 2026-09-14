import { expect, test } from "@playwright/test"

test("Quotations page opens its contextual guide", async ({ page }) => {
  await page.goto("/quotations")

  await page.getByTestId("quotations-page-guide-trigger").click()

  const guide = page.getByTestId("quotations-page-guide")
  await expect(guide).toBeVisible()
  await expect(
    guide.getByRole("heading", { name: "Hồ sơ báo giá" }),
  ).toBeVisible()
  await expect(guide.getByText("Nhìn nhanh danh sách")).toBeVisible()
  await expect(guide.getByText("Luồng báo giá")).toBeVisible()
})
