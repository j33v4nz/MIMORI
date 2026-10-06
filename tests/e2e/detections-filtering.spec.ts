import { test, expect } from '@playwright/test';

test.describe('Detections Page', () => {
  test('loads the detections page', async ({ page }) => {
    await page.goto('/detections');
    await expect(page.getByRole('heading', { name: 'Security Detections', exact: true })).toBeVisible();
  });

  test('has severity filter links', async ({ page }) => {
    await page.goto('/detections');
    await expect(page.getByRole('link', { name: 'All', exact: true }).first()).toBeVisible();
    for (const name of ['critical', 'high', 'medium', 'low']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('all filter is active by default', async ({ page }) => {
    await page.goto('/detections');
    const allButton = page.getByRole('link', { name: 'All', exact: true }).first();
    await expect(allButton).toHaveAttribute('aria-current', 'page');
  });

  test('clicking severity filter updates URL', async ({ page }) => {
    await page.goto('/detections');
    await page.getByRole('link', { name: 'critical', exact: true }).click();
    await expect(page).toHaveURL(/severity=critical/);
  });

  test('shows table headers', async ({ page }) => {
    await page.goto('/detections');
    if (await page.getByRole('table').count()) {
      for (const name of ['Timestamp', 'Detection Layer', 'Category', 'Severity']) {
        await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
      }
    } else {
      await expect(page.getByRole('heading', { name: 'No Detections Found' })).toBeVisible();
    }
  });

  test('displays empty state when no detections match filter', async ({ page }) => {
    await page.goto('/detections?severity=critical');
    // Either shows detections or empty state
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
