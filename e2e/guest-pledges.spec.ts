import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 375, height: 812 } });

test('a guest covers the rest of a group gift with Venmo, and the card shows it pledged', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('First item').fill('Stroller');
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByLabel('Venmo username').fill('my-venmo');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();

  await page.getByRole('link', { name: 'Manage your list' }).click();
  await page.getByLabel('Owner token').fill(ownerToken!);
  await page.getByRole('button', { name: 'Manage list' }).click();
  await page.getByLabel('Group gift').check();
  await page.getByLabel('Title').fill('Stand mixer');
  await page.getByLabel('Price (USD)').fill('450');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('status')).toHaveText('Added "Stand mixer".');

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Enter the guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();

  const mixer = guest.getByRole('listitem').filter({ has: guest.getByRole('heading', { name: 'Stand mixer' }) });
  await mixer.getByRole('button', { name: 'Chip in' }).click();
  await guest.getByLabel('Cover the rest ($450.00)').check();
  await guest.getByRole('button', { name: 'Continue' }).click();
  await expect(guest.getByRole('link', { name: 'Pay $450.00 with Venmo' })).toHaveAttribute('href', /^venmo:\/\/paycharge/);
  await guest.getByLabel('Your name').fill('Amara');
  await guest.getByRole('button', { name: "I've sent it" }).click();

  await expect(mixer.getByText('$450.00 of $450.00 pledged · 100%')).toBeVisible();
  // ADR-0026: CI blocks on serious and critical axe violations only.
  const scan = await new AxeBuilder({ page: guest }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
