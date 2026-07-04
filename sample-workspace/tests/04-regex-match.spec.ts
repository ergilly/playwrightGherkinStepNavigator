import { test, expect } from '@playwright/test';

test('regex labels match dynamic values', async ({ page }) => {
  await test.step('Given the dashboard is open', async () => {
    await page.goto('/dashboard');
  });

  await test.step('regex:^Then the dashboard should show \\d+ widgets$', async () => {
    await expect(page.locator('[data-testid="dashboard-widget"]')).toHaveCount(3);
  });
});
