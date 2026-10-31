import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ viewport: { width: 375, height: 812 } });

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('the owner edits their list and deletes an untouched item', async ({ page, context }) => {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  const suggestedKey = page.getByRole('region', { name: 'Guest key' }).locator('[aria-live]');
  await expect(suggestedKey).not.toBeEmpty();
  const firstKey = (await suggestedKey.textContent())!;
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(suggestedKey).not.toHaveText(firstKey);
  const chosenKey = (await suggestedKey.textContent())!;
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByTestId('guest-key')).toHaveText(chosenKey);
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();

  const [manage] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  const enterOwnerToken = async () => {
    await manage.getByLabel('Owner token').fill(ownerToken!);
    await manage.getByRole('button', { name: 'Manage list' }).click();
  };
  await enterOwnerToken();
  await manage.getByLabel('Title').fill('Stroller');
  await manage.getByLabel('Price (USD)').fill('150');
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Stroller".');

  await manage.getByRole('button', { name: 'Edit', exact: true }).click();
  await manage.getByLabel('List title').fill('Welcome Baby');
  await manage.getByRole('button', { name: 'Save' }).click();
  await expect(manage.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  await manage.getByRole('button', { name: 'Edit Stroller' }).click();
  const editing = manage.getByRole('listitem').filter({ has: manage.getByRole('heading', { name: 'Edit item' }) });
  await editing.getByLabel('Price (USD)').fill('120');
  await editing.getByRole('button', { name: 'Save' }).click();
  await expect(manage.getByText('$120.00 · quantity 1')).toBeVisible();

  await manage.getByLabel('Title').fill('Bib');
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Bib".');

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Guest key').fill(chosenKey);
  await guest.getByRole('button', { name: 'View list' }).click();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('Welcome Baby');
  const stroller = guest.getByRole('listitem').filter({ has: guest.getByRole('heading', { name: 'Stroller' }) });
  await expect(stroller.getByText('$120.00')).toBeVisible();
  await stroller.getByRole('button', { name: 'Hold this item' }).click();
  await guest.getByLabel('Gifter name(s)').fill('Amara');
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();
  await expect(guest.getByText('Stroller is held.')).toBeVisible();

  await manage.reload();
  await enterOwnerToken();
  const deleteStroller = manage.getByRole('button', { name: 'Delete Stroller' });
  await expect(deleteStroller).toBeDisabled();
  await expect(deleteStroller).toHaveAccessibleDescription('Guests have already picked this one, so it can’t be deleted.');
  await manage.getByRole('button', { name: 'Delete Bib' }).click();
  await manage.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(manage.getByRole('button', { name: 'Delete Bib' })).toHaveCount(0);
  await expect(manage.getByRole('heading', { name: 'Items' })).toBeFocused();
  await expect(deleteStroller).toBeVisible();
  await expectNoSeriousAxeViolations(manage);
});

test('a refused delete moves focus to the server's reason', async ({ page, context }) => {
  await page.goto('/wishlists/new');
  await page.getByLabel('List title').fill('Baby Shower');
  await expect(page.getByRole('region', { name: 'Guest key' }).locator('[aria-live]')).not.toBeEmpty();
  await page.getByLabel('Create secret').fill('e2e-create-secret');
  await page.getByRole('button', { name: 'Create list' }).click();
  const ownerToken = (await page.getByTestId('owner-token').textContent())?.trim();
  const [manage] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Manage your list' }).click()]);
  await manage.getByLabel('Owner token').fill(ownerToken!);
  await manage.getByRole('button', { name: 'Manage list' }).click();
  await manage.getByLabel('Title').fill('Bib');
  await manage.getByRole('button', { name: 'Add item' }).click();
  await expect(manage.getByRole('status')).toHaveText('Added "Bib".');
  // Stands in for a guest holding the item between the page loading and the owner confirming.
  await manage.route('**/api/lists/*/items/*', (route) => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 409, json: { message: 'Guests have already picked this one.', code: 'item_has_guest_history' } })
    : route.continue());
  await manage.getByRole('button', { name: 'Delete Bib' }).click();
  await manage.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(manage.getByRole('alert').filter({ hasText: 'Guests have already picked' })).toBeFocused();
});
