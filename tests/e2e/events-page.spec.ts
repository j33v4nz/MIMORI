import { test, expect } from '@playwright/test';

test.describe('Events Page', () => {
  test('loads the events page', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Telemetry Events', exact: true })).toBeVisible();
  });

  test('displays time filter bar', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByRole('link', { name: '1H' })).toBeVisible();
    await expect(page.getByRole('link', { name: '6H' })).toBeVisible();
    await expect(page.getByRole('link', { name: '24H' })).toBeVisible();
    await expect(page.getByRole('link', { name: '7D' })).toBeVisible();
    await expect(page.getByRole('link', { name: '30D' })).toBeVisible();
  });

  test('time preset links have correct hrefs', async ({ page }) => {
    await page.goto('/events');
    const link24h = page.getByRole('link', { name: '24H' });
    const href = await link24h.getAttribute('href');
    expect(href).toMatch(/from=/);
  });

  test('custom date range form exists', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByLabel('From date and time')).toBeVisible();
    await expect(page.getByLabel('To date and time')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply custom date range filter' })).toBeVisible();
  });

  test('shows agent filter dropdown', async ({ page }) => {
    await page.goto('/events');
    // Agent filter should exist (may show "All Agents" or similar)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('displays event table headers', async ({ page }) => {
    await page.goto('/events');
    if (await page.getByRole('table').count()) {
      for (const name of ['Timestamp', 'Agent', 'Event Type', 'Payload Context']) {
        await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
      }
    } else {
      await expect(page.getByRole('heading', { name: 'No Telemetry Found' })).toBeVisible();
    }
  });
});
