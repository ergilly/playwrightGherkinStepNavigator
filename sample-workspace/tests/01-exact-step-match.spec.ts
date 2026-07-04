import { test, expect } from '@playwright/test';

test('exact step labels navigate to matching Playwright steps', async ({ page }) => {
  await test.step('Given the exact customer record is loaded', async () => {
    await page.goto('/customers/123');
  });

  await test.step('When the exact customer record is saved', async () => {
    await page.locator('[data-testid="save"]').click();
  });

  await test.step('Then the exact save confirmation is shown', async () => {
    await expect(page.locator('[data-testid="saved"]')).toBeVisible();
  });
});
