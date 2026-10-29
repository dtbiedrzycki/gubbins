import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 375, height: 812 } });

test('a guest covers the rest of a group gift with Venmo, and the card shows it pledged', async ({ page, context }) => {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByLabel('Venmo username').fill('my-venmo');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();

  const [manage] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  await manage.getByLabel('Owner token').fill(ownerToken!);
  await manage.getByRole('button', { name: 'Manage list' }).click();
  await manage.getByLabel('Group gift').check();
  await manage.getByLabel('Title').fill('Stand mixer');
  await manage.getByLabel('Price (USD)').fill('450');
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Stand mixer".');

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();

  const mixer = guest.getByRole('listitem').filter({ has: guest.getByRole('heading', { name: 'Stand mixer' }) });
  await mixer.getByRole('button', { name: 'Chip in' }).click();
  await guest.getByLabel('Cover the rest ($450.00)').check();
  await guest.getByRole('button', { name: 'Continue' }).click();
  await expect(guest.getByRole('link', { name: 'Pay $450.00 with Venmo' })).toHaveAttribute('href', /^https:\/\/venmo\.com\/my-venmo\?txn=pay&amount=450\.00/);
  await guest.getByLabel('Gifter name(s)').fill('Amara');
  await guest.getByRole('button', { name: "I've sent it" }).click();

  await expect(mixer.getByText('$450.00 of $450.00 pledged · 100%')).toBeVisible();
  // ADR-0026: CI blocks on serious and critical axe violations only.
  const scan = await new AxeBuilder({ page: guest }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
