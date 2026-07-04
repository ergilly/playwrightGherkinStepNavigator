import { test } from '@playwright/test';

test('scenario description links to a Playwright test description', async () => {
  await test.step('Given the scenario description fixture is ready', async () => {});
});

test.describe('scenario description links to a Playwright describe description', () => {
  test('inner describe fixture body', async () => {
    await test.step('Given the describe description fixture is ready', async () => {});
  });
});
