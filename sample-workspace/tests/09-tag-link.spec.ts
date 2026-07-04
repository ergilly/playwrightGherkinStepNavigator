import { test } from '@playwright/test';

test(
  'single feature tag links to a Playwright annotation tag',
  { tag: '@tag-link-single' },
  async () => {
    await test.step('Given the single tag fixture is ready', async () => {});
  }
);

test(
  'multiple feature tags link to Playwright annotation tag arrays',
  { tag: ['@tag-link-array', '@tag-link-smoke'] },
  async () => {
    await test.step('Given the tag array fixture is ready', async () => {});
  }
);
