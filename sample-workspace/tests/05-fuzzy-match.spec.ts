import { test, expect } from '@playwright/test';

test('fuzzy labels tolerate small text differences', async ({ page }) => {
  await test.step('Given the fuzzy customer profile is open', async () => {
    await page.goto('/customers/fuzzy');
  });

  await test.step('Then the welcome message should greet user', async () => {
    await expect(page.locator('[data-testid="welcome"]')).toContainText('Welcome');
  });
});
