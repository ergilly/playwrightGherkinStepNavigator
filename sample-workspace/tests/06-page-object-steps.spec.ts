import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

test('page object test.step calls are indexed', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.openInLoginMode();
  await loginPage.viewLoginForm();

  await test.step('Then the form should show pre-filled credentials', async () => {
    await expect(page.locator('[data-testid="username"]')).toHaveValue('demo@example.com');
  });
});
