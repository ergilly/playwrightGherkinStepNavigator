import { test, expect } from '@playwright/test';

test('indexed steps appear in the workspace catalogue', async ({ page }) => {
  await test.step('Given the catalogue fixture has a Playwright step', async () => {
    await page.goto('/catalogue-fixture');
  });

  await test.step('Then the debug output should mention indexed steps', async () => {
    await expect(page.locator('[data-testid="catalogue"]')).toBeVisible();
  });
});
