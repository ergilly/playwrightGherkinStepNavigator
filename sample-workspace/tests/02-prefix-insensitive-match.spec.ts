import { test, expect } from '@playwright/test';

test('BDD keywords are ignored during step matching', async ({ page }) => {
  await test.step('When the cross-prefix customer starts checkout', async () => {
    await page.goto('/checkout');
  });

  await test.step('Then the cross-prefix customer confirms checkout', async () => {
    await page.locator('[data-testid="confirm"]').click();
  });

  await test.step('Given the cross-prefix checkout receipt is displayed', async () => {
    await expect(page.locator('[data-testid="receipt"]')).toBeVisible();
  });
});
