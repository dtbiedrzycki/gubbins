import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 375, height: 812 } });

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('the owner adds a single item and a group gift, and a guest sees both', async ({ page, context }) => {
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

  await page.getByLabel('Title').fill('Crib');
  await page.getByLabel('Quantity').fill('2');
  await page.getByLabel('Price (USD)').fill('199.99');
  await page.getByLabel('Store link').fill('https://shop.example/crib');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('status')).toHaveText('Added "Crib".');

  await page.getByLabel('Group gift').check();
  await page.getByLabel('Title').fill('Stand mixer');
  await page.getByLabel('Price (USD)').fill('450');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('status')).toHaveText('Added "Stand mixer".');
  await expectNoSeriousAxeViolations(page);

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Enter the guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();

  const crib = guest.getByRole('listitem').filter({ has: guest.getByRole('heading', { name: 'Crib' }) });
  await expect(crib.getByText('2 left')).toBeVisible();
  await expect(crib.getByText('$199.99')).toBeVisible();
  await expect(crib.getByRole('link', { name: 'View in store' })).toBeVisible();
  const mixer = guest.getByRole('listitem').filter({ has: guest.getByRole('heading', { name: 'Stand mixer' }) });
  await expect(mixer.getByText('$450.00')).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Stroller' })).toBeVisible();
});
