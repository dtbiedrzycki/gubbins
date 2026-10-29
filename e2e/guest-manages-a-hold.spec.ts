import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The owner makes a one-item list; a second tab in the same context stands in for the guest, keyed in. */
async function guestOnNewList(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('First item').fill('Stroller');
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  await expectNoSeriousAxeViolations(page);

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();
  await expect(guest.getByRole('heading', { name: 'Your holds' })).toBeVisible();
  return guest;
}

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('a guest holds the item, extends the hold once, and marks it purchased', async ({ page, context }) => {
  const guest = await guestOnNewList(page, context);
  const yourHolds = guest.getByRole('region', { name: 'Your holds' });

  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await expect(guest.getByRole('dialog').getByText('Other guests will see it\u2019s taken while you buy it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await guest.getByLabel('Your name').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();

  await expect(guest.getByText('Stroller is held.')).toBeVisible();
  await expect(yourHolds.getByText(/^Held until .*\.$/)).toBeVisible();

  await yourHolds.getByRole('button', { name: 'Extend hold' }).click();
  await expect(yourHolds.getByRole('status')).toHaveText(/^Hold extended until /);
  await expect(yourHolds.getByRole('button', { name: 'Extend hold' })).toHaveCount(0);

  // The extension is the server's, not the page's: it survives a reload.
  await guest.reload();
  await expect(yourHolds.getByText(/\(extended\)\.$/)).toBeVisible();
  await expect(yourHolds.getByRole('button', { name: 'Extend hold' })).toHaveCount(0);
  await expectNoSeriousAxeViolations(guest);

  await yourHolds.getByRole('button', { name: 'Mark as purchased' }).click();
  await expect(yourHolds.getByRole('status')).toHaveText('Stroller is marked as purchased. Thank you!');
  await expect(yourHolds.getByText('Marked as purchased.', { exact: true })).toBeVisible();
  await expect(guest.getByText('Stroller has been purchased.')).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Hold this item' })).toHaveCount(0);
});

test('a guest releases a hold after confirming, and the item can be held again', async ({ page, context }) => {
  const guest = await guestOnNewList(page, context);
  const yourHolds = guest.getByRole('region', { name: 'Your holds' });
  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await guest.getByLabel('Your name').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();

  await yourHolds.getByRole('button', { name: 'Release hold' }).click();
  await expect(yourHolds.getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await yourHolds.getByRole('button', { name: 'Yes, release it' }).click();

  await expect(yourHolds.getByRole('status')).toHaveText('Your hold on Stroller is released.');
  await expect(yourHolds.getByText('Holds you place appear here.')).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Hold this item' })).toBeVisible();
});
