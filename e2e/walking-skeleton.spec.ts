import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('owner creates a list, guest enters the key, and holds the item', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('First item').fill('Stroller');
  await page.getByRole('button', { name: 'Create list' }).click();

  const guestLinkHref = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  expect(guestLinkHref).toBeTruthy();
  expect(guestKey).toBeTruthy();

  const createPageScan = await new AxeBuilder({ page }).analyze();
  const createPageSerious = createPageScan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(createPageSerious).toEqual([]);

  // A separate browser tab in the same context stands in for the guest,
  // who is a different person on a different device in reality.
  const guestPage = await context.newPage();
  await guestPage.goto(guestLinkHref!);
  await guestPage.getByLabel('Enter the guest key').fill(guestKey!);
  await guestPage.getByRole('button', { name: 'View list' }).click();

  // exact: true — once the item is held, "Your holds" repeats the title in
  // its card, and a substring match would be ambiguous under strict mode.
  await expect(guestPage.getByText('Stroller', { exact: true })).toBeVisible();
  await guestPage.getByRole('button', { name: 'Hold this item' }).click();
  await guestPage.getByRole('button', { name: 'Yes, hold it' }).click();
  await expect(guestPage.getByText('Stroller is held.')).toBeVisible();

  const guestPageScan = await new AxeBuilder({ page: guestPage }).analyze();
  const guestPageSerious = guestPageScan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(guestPageSerious).toEqual([]);
});
