import { Page, test, expect } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async openInLoginMode(): Promise<void> {
    await test.step('Given the user is on the login page in login mode', async () => {
      await this.page.goto('/login?mode=login&username=demo@example.com');
    });
  }

  async viewLoginForm(): Promise<void> {
    await test.step('When the user views the login form', async () => {
      await expect(this.page.locator('[data-testid="login-form"]')).toBeVisible();
    });
  }
}
