import { test } from '@playwright/test';

test('ignored by extension fixture settings', async () => {
  await test.step('Then this excluded step should not appear in the catalogue', async () => {});
});
