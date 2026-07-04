import { Page, test } from '@playwright/test';

export async function loginAs(page: Page, role: string): Promise<void> {
  await test.step('When the user logs in as {role}', async () => {
    await page.locator('[data-testid="role"]').fill(role);
    await page.locator('[data-testid="submit"]').click();
  });
}
