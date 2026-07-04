import { test, expect } from '@playwright/test';
import { loginAs } from '../steps/auth.steps';

test('placeholder labels match concrete feature values', async ({ page }) => {
  await loginAs(page, 'standard-user');

  await test.step('When the user opens workspace {workspaceName}', async () => {
    await page.goto('/workspaces/north-region');
  });

  await test.step('Then workspace {workspaceName} should be active', async () => {
    await expect(page.locator('[data-testid="active-workspace"]')).toContainText('north-region');
  });
});
