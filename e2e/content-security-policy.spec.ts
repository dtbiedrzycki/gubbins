import { test, expect, type Page } from '@playwright/test';

// Every response carries the policy, so the create page stands in for every page.
// The browser fires `securitypolicyviolation` for each load the policy refuses;
// the listener is installed before any page script runs, so it sees them all.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const blocked: string[] = [];
    (window as unknown as { blocked: string[] }).blocked = blocked;
    document.addEventListener('securitypolicyviolation', (event) => blocked.push(`${event.effectiveDirective} ${event.blockedURI}`));
  });
  await page.goto('/wishlists/new');
  await expect(page.getByLabel('List title')).toBeVisible();
});

const blocked = (page: Page) => page.evaluate(() => (window as unknown as { blocked: string[] }).blocked);

test('loads the app itself without a policy violation', async ({ page }) => {
  expect(await blocked(page)).toEqual([]);
});

test('refuses an image from another site', async ({ page }) => {
  // A remote image would leak the guest's IP address to its host.
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = 'https://images.example/tracker.png';
    document.body.append(image);
  });
  await expect.poll(() => blocked(page)).toEqual(['img-src https://images.example/tracker.png']);
});

test('refuses a script from another site', async ({ page }) => {
  // A proxy such as a Cloudflare tunnel must not be able to inject its own script.
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = 'https://scripts.example/beacon.js';
    document.body.append(script);
  });
  await expect.poll(() => blocked(page)).toEqual(['script-src-elem https://scripts.example/beacon.js']);
});
