import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The owner creates a list and adds one item on the manage page; a second tab in the same context stands in for the guest, keyed in on the bare list path. */
async function guestOnNewList(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = guestLink!.split('#key=')[1];
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();
  await expectNoSeriousAxeViolations(page);

  const [manage] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  await manage.getByLabel('Owner token').fill(ownerToken!);
  await manage.getByRole('button', { name: 'Manage list' }).click();
  await manage.getByLabel('Title').fill('Stroller');
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Stroller".');

  const guest = await context.newPage();
  await guest.goto(guestLink!.split('#')[0]);
  await guest.getByLabel('Guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Baby Shower' })).toBeVisible();
  return guest;
}

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('a guest holds the item, extends the hold once, and marks it purchased', async ({ page, context }) => {
  const guest = await guestOnNewList(page, context);
  const yourContributions = guest.getByRole('dialog', { name: 'Your contributions' });

  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await expect(guest.getByRole('dialog').getByText('Other guests will see it\u2019s taken while you buy it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await guest.getByLabel('Gifter name(s)').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();

  await expect(guest.getByText('Stroller is held.')).toBeVisible();
  await guest.getByRole('button', { name: 'Your contributions · 1' }).click();
  await expect(yourContributions.getByText(/^Held until .*\.$/)).toBeVisible();

  await yourContributions.getByRole('button', { name: 'Extend hold' }).click();
  await expect(yourContributions.getByRole('status')).toHaveText(/^Hold extended until /);
  await expect(yourContributions.getByRole('button', { name: 'Extend hold' })).toHaveCount(0);

  // The extension is the server's, not the page's: it survives a reload.
  await guest.reload();
  await guest.getByRole('button', { name: 'Your contributions · 1' }).click();
  await expect(yourContributions.getByText(/\(extended\)\.$/)).toBeVisible();
  await expect(yourContributions.getByRole('button', { name: 'Extend hold' })).toHaveCount(0);
  await expectNoSeriousAxeViolations(guest);

  await yourContributions.getByRole('button', { name: 'Mark as purchased' }).click();
  const sheet = guest.getByRole('dialog', { name: /as purchased\?$/ });
  await sheet.getByLabel('Message to the owner (optional)').fill('Congratulations!');
  await expectNoSeriousAxeViolations(guest);
  await sheet.getByRole('button', { name: 'Mark as purchased' }).click();
  await expect(yourContributions.getByRole('status')).toHaveText('Stroller is marked as purchased. Thank you!');
  await expect(yourContributions.getByText('Marked as purchased.', { exact: true })).toBeVisible();
  await yourContributions.getByRole('button', { name: 'Close' }).click();
  await expect(guest.getByText('Stroller has been purchased.')).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Hold this item' })).toHaveCount(0);
});

test('a guest releases a hold after confirming, and the item can be held again', async ({ page, context }) => {
  const guest = await guestOnNewList(page, context);
  const yourContributions = guest.getByRole('dialog', { name: 'Your contributions' });
  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await guest.getByLabel('Gifter name(s)').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();

  await guest.getByRole('button', { name: 'Your contributions · 1' }).click();
  await yourContributions.getByRole('button', { name: 'Release hold' }).click();
  await expect(yourContributions.getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await yourContributions.getByRole('button', { name: 'Yes, release it' }).click();

  // The last entry is gone, so the sheet closes and the page says what happened.
  await expect(yourContributions).toBeHidden();
  await expect(guest.getByRole('status').filter({ hasText: 'Your hold on Stroller is released.' })).toBeVisible();
  await expect(guest.getByRole('heading', { level: 1, name: 'Baby Shower' })).toBeFocused();
  await expect(guest.getByRole('button', { name: 'Hold this item' })).toBeVisible();
});
