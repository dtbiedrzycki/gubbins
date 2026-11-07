import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The owner creates a list and adds 5 baby onesies on the manage page. */
async function listOfFiveOnesies(page: Page): Promise<{ guestLink: string; guestKey: string }> {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();

  const [manage] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  await manage.getByLabel('Owner token').fill(ownerToken!);
  await manage.getByRole('button', { name: 'Manage list' }).click();
  await manage.getByLabel('Title').fill('Baby onesies');
  for (let i = 1; i < 5; i++) await manage.getByRole('button', { name: 'One more' }).click();
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Baby onesies".');
  return { guestLink: guestLink!, guestKey: guestKey! };
}

/** A guest keyed in on a new tab; each browser context has its own guest session. */
async function guestKeyedIn(context: BrowserContext, { guestLink, guestKey }: { guestLink: string; guestKey: string }): Promise<Page> {
  const guest = await context.newPage();
  await guest.goto(guestLink);
  await guest.getByLabel('Guest key').fill(guestKey);
  await guest.getByRole('button', { name: 'View list' }).click();
  await expect(guest.getByRole('heading', { name: 'Your holds' })).toBeVisible();
  return guest;
}

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('a guest holds 2 of 5, buys 1, and another guest sees 4 left', async ({ page, context, browser, baseURL }) => {
  const list = await listOfFiveOnesies(page);
  const guest = await guestKeyedIn(context, list);
  const yourHolds = guest.getByRole('region', { name: 'Your holds' });

  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await guest.getByRole('button', { name: 'One more' }).click();
  await guest.getByLabel('Gifter name(s)').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold 2' }).click();
  await expect(guest.getByText('3 left')).toBeVisible();
  await expect(yourHolds.getByText('× 2')).toBeVisible();

  await yourHolds.getByRole('button', { name: 'Mark as purchased' }).click();
  const sheet = guest.getByRole('dialog', { name: 'How many did you buy?' });
  await sheet.getByRole('button', { name: 'One fewer' }).click();
  await expect(sheet.getByText('The other 1 will be released, so another guest can hold it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await sheet.getByRole('button', { name: 'Mark 1 as purchased' }).click();

  await expect(sheet).toBeHidden();
  await expect(yourHolds.getByRole('status')).toHaveText('Baby onesies: 1 marked as purchased. Thank you!');
  await expect(yourHolds.getByText('Marked as purchased.', { exact: true })).toBeVisible();
  await expect(yourHolds.getByText('× 2')).toHaveCount(0);

  const otherContext = await browser.newContext({ baseURL });
  try {
    const other = await guestKeyedIn(otherContext, list);
    await expect(other.getByText('4 left')).toBeVisible();
  } finally {
    await otherContext.close();
  }
});
