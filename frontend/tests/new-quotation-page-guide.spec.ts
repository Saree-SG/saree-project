import { expect, test } from "@playwright/test"

test("New quotation page opens its contextual guide", async ({ page }) => {
  await page.goto("/quotations/new")

  await page.getByTestId("new-quotation-page-guide-trigger").click()

  const guide = page.getByTestId("new-quotation-page-guide")
  await expect(guide).toBeVisible()
  await expect(
    guide.getByRole("heading", { name: "Tạo hồ sơ báo giá" }),
  ).toBeVisible()
  await expect(guide.getByText("Hai bước nhập liệu")).toBeVisible()
})
