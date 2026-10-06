import { test, expect } from '@playwright/test';

test.describe('MIMORI Dashboard', () => {
  test('loads the overview page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MIMORI/);
  });

  test('displays navigation links', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
    await expect(nav.getByText('Overview')).toBeVisible();
    await expect(nav.getByText('Events')).toBeVisible();
    await expect(nav.getByText('Agents')).toBeVisible();
    await expect(nav.getByText('Detections')).toBeVisible();
    await expect(nav.getByText('Rules')).toBeVisible();
  });

  test('navigates to events page', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("Events")');
    await expect(page).toHaveURL(/\/events/);
    await expect(page.getByRole('heading', { name: 'Telemetry Events', exact: true })).toBeVisible();
  });

  test('navigates to agents page', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("Agents")');
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByRole('heading', { name: 'Observed Agents', exact: true })).toBeVisible();
  });

  test('navigates to detections page', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("Detections")');
    await expect(page).toHaveURL(/\/detections/);
    await expect(page.getByRole('heading', { name: 'Security Detections', exact: true })).toBeVisible();
  });

  test('navigates to rules page', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("Rules")');
    await expect(page).toHaveURL(/\/rules/);
    await expect(page.getByRole('heading', { name: 'Detection Rules', exact: true })).toBeVisible();
  });

  test('navigates to behavior diff page', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("Behavior Diff")');
    await expect(page).toHaveURL(/\/behavior-diff/);
    await expect(page.getByRole('heading', { name: 'Behavior Diff', exact: true })).toBeVisible();
  });

  test('navigates to API keys page', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("API Keys")');
    await expect(page).toHaveURL(/\/keys/);
  });
});
