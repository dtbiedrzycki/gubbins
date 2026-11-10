import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 375, height: 812 } });

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('the owner moves a gift to the bottom, keeps focus there, and guests see the new order', async ({ page, context }) => {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Housewarming');
  await expect(page.getByRole('region', { name: 'Guest key' }).locator('[aria-live]')).not.toBeEmpty();
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();

  const [manage] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  await manage.getByLabel('Owner token').fill(ownerToken!);
  await manage.getByRole('button', { name: 'Manage list' }).click();
  for (const title of ['Kettle', 'Skillet', 'Cookbook']) {
    await manage.getByLabel('Title').fill(title);
    await manage.getByRole('button', { name: 'Add item' }).click();
    await expect(manage.getByRole('status')).toHaveText(`Added "${title}".`);
  }

  await manage.getByRole('button', { name: 'Move Cookbook to the bottom' }).click();

  // Bottom is disabled once Cookbook is last, so focus stays in its block on Up.
  await expect(manage.getByRole('button', { name: 'Move Cookbook up' })).toBeFocused();
  await expect(manage.locator('#move-announcement')).toHaveText('Cookbook moved to position 3 of 3.');
  await expectNoSeriousAxeViolations(manage);

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();
  await expect(guest.getByRole('heading', { level: 2, name: /^(Kettle|Skillet|Cookbook)$/ })).toHaveText(['Skillet', 'Kettle', 'Cookbook']);
});
