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
  await manage.getByLabel('Quantity').fill('5');
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
  await expect(guest.getByRole('heading', { level: 1, name: 'Baby Shower' })).toBeVisible();
  return guest;
}

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('a guest holds 2 of 5, buys 1, and another guest sees "Wanted: 4 more"', async ({ page, context, browser, baseURL }) => {
  const list = await listOfFiveOnesies(page);
  const guest = await guestKeyedIn(context, list);
  const yourContributions = guest.getByRole('dialog', { name: 'Your contributions' });

  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await guest.getByRole('button', { name: 'One more' }).click();
  await guest.getByLabel('Gifter name(s)').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold 2' }).click();
  await expect(guest.getByText('Wanted: 3 more')).toBeVisible();
  await guest.getByRole('button', { name: 'Your contributions · 1' }).click();
  await expect(yourContributions.getByText('× 2')).toBeVisible();

  // Escape closes only the purchase sheet opened from inside this one.
  await yourContributions.getByRole('button', { name: 'Mark as purchased' }).click();
  const sheet = guest.getByRole('dialog', { name: 'How many did you buy?' });
  await expect(sheet).toBeVisible();
  await guest.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(yourContributions).toBeVisible();

  await yourContributions.getByRole('button', { name: 'Mark as purchased' }).click();
  await sheet.getByRole('button', { name: 'One fewer' }).click();
  await expect(sheet.getByText('The other 1 will be released, so another guest can hold it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await sheet.getByRole('button', { name: 'Mark 1 as purchased' }).click();

  await expect(sheet).toBeHidden();
  await expect(yourContributions.getByRole('status')).toHaveText('Baby onesies: 1 marked as purchased. Thank you!');
  await expect(yourContributions.getByText('Marked as purchased.', { exact: true })).toBeVisible();
  await expect(yourContributions.getByText('× 2')).toHaveCount(0);

  // A tap on the backdrop closes the sheet; the button then never covers the last gift.
  await guest.mouse.click(5, 5);
  await expect(yourContributions).toBeHidden();
  // A phone-sized window, so the list is taller than the screen.
  await guest.setViewportSize({ width: 375, height: 400 });
  await guest.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const button = await guest.getByRole('button', { name: /^Your contributions · / }).boundingBox();
  const lastGift = await guest.getByRole('listitem').filter({ has: guest.getByRole('heading', { level: 2, name: 'Baby onesies' }) }).boundingBox();
  expect(lastGift!.y + lastGift!.height).toBeLessThanOrEqual(button!.y);

  // Nor does it cover a control that keyboard focus scrolls into view; a very short window puts that control below the fold.
  await guest.setViewportSize({ width: 375, height: 150 });
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.getByRole('button', { name: 'Hold this item' }).focus();
  const focused = await guest.getByRole('button', { name: 'Hold this item' }).boundingBox();
  const buttonNow = await guest.getByRole('button', { name: /^Your contributions · / }).boundingBox();
  expect(focused!.y + focused!.height).toBeLessThanOrEqual(buttonNow!.y);

  const otherContext = await browser.newContext({ baseURL });
  try {
    const other = await guestKeyedIn(otherContext, list);
    await expect(other.getByText('Wanted: 4 more')).toBeVisible();
  } finally {
    await otherContext.close();
  }
});
