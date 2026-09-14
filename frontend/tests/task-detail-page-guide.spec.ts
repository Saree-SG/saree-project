import { expect, test } from "@playwright/test"

test("Task detail guide exposes the reporting workflow", async ({ page }) => {
  await page.goto("/tasks")

  const taskCards = page.locator('a[href^="/tasks/"]')
  test.skip(
    (await taskCards.count()) === 0,
    "The authenticated test user needs one seeded task.",
  )
  await taskCards.first().click()

  const trigger = page.getByTestId("task-detail-guide-trigger")
  await expect(trigger).toBeVisible()
  await trigger.click()

  const guide = page.getByTestId("task-detail-guide")
  await expect(guide).toBeVisible()
  await expect(guide.getByText("Cách cập nhật tiến độ")).toBeVisible()
  await expect(guide.getByText("Dành cho quản lý")).toBeVisible()
})
