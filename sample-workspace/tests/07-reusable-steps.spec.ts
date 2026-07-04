import { test, expect } from '@playwright/test';
import { loginAs } from '../steps/auth.steps';

test('reusable step files are indexed', async ({ page }) => {
  await loginAs(page, 'admin-user');

  await test.step('Then the reusable login helper should complete', async () => {
    await expect(page.locator('[data-testid="session"]')).toContainText('admin-user');
  });
});
