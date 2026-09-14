import { expect, test } from "@playwright/test"

test("Tasks page opens its contextual guide", async ({ page }) => {
  await page.goto("/tasks")

  await page.getByTestId("tasks-page-guide-trigger").click()

  const guide = page.getByTestId("tasks-page-guide")
  await expect(guide).toBeVisible()
  await expect(
    guide.getByRole("heading", { name: "Công việc của tôi" }),
  ).toBeVisible()
  await expect(guide.getByText("Nhìn nhanh màn hình")).toBeVisible()
  await expect(guide.getByText("Cách sử dụng")).toBeVisible()
})
