import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 375, height: 812 } });

test('the owner shows who bought a gift, reads their message, and hides it again', async ({ page, context }) => {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();

  const [manage] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  const enterOwnerToken = async () => {
    await manage.getByLabel('Owner token').fill(ownerToken!);
    await manage.getByRole('button', { name: 'Manage list' }).click();
  };
  await enterOwnerToken();
  await manage.getByLabel('Title').fill('Linen apron');
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Linen apron".');

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByRole('button', { name: 'I’m buying this' }).click();
  await guest.getByLabel('Gifter name(s)').fill('Maya');
  await guest.getByLabel('Message to the owner (optional)').fill('Happy 30th!');
  await guest.getByRole('button', { name: 'Yes, I’m buying it' }).click();
  await expect(guest.getByText('Linen apron is marked as purchased. Thank you!')).toBeVisible();

  await manage.reload();
  await enterOwnerToken();
  await expect(manage.getByText('1 of 1 bought')).toBeVisible();
  await expect(manage.getByText('Maya')).toHaveCount(0);

  await manage.getByRole('button', { name: 'Show who gave what' }).click();
  // The button the owner pressed keeps the keyboard focus while it turns into Hide.
  await expect(manage.getByRole('button', { name: 'Hide' })).toBeFocused();
  const apron = manage.getByRole('region', { name: 'Contributions for Linen apron' });
  await expect(apron.getByText('Maya')).toBeVisible();
  await expect(apron.getByText('Happy 30th!')).toBeVisible();
  // ADR-0026: CI blocks on serious and critical axe violations only.
  const scan = await new AxeBuilder({ page: manage }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

  await manage.getByRole('button', { name: 'Hide' }).click();
  await expect(manage.getByText('Maya')).toHaveCount(0);
});
