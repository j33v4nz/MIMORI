import { test, expect } from '@playwright/test';

test.describe('Rules Management', () => {
  test('loads the rules page', async ({ page }) => {
    await page.goto('/rules');
    await expect(page.getByRole('heading', { name: /rules/i })).toBeVisible();
  });

  test('displays rules table with columns', async ({ page }) => {
    await page.goto('/rules');
    for (const name of ['Rule Name', 'Category', 'Severity', 'Status']) {
      await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
  });

  test('navigates to create rule page', async ({ page }) => {
    await page.goto('/rules');
    await page.getByRole('link', { name: /add rule|new rule/i }).click();
    await expect(page).toHaveURL(/\/rules\/new/);
    await expect(page.getByRole('heading', { name: 'Create Rule', exact: true })).toBeVisible();
  });

  test('create rule page has preset templates', async ({ page }) => {
    await page.goto('/rules/new');
    await expect(page.getByText('Preset Templates')).toBeVisible();
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    // Check preset options exist
    await expect(select.locator('option', { hasText: 'Custom (From Scratch)' })).toBeAttached();
    await expect(select.locator('option', { hasText: 'Jailbreak Detector (DAN)' })).toBeAttached();
  });

  test('create rule page form has all required fields', async ({ page }) => {
    await page.goto('/rules/new');
    await expect(page.getByLabel('Rule Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Category *')).toBeVisible();
    await expect(page.getByText('Severity *')).toBeVisible();
    await expect(page.getByText('Regex Pattern *')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Rule', exact: true })).toBeVisible();
  });

  test('live pattern tester shows result when pattern is entered', async ({ page }) => {
    await page.goto('/rules/new');
    // Fill in a pattern
    const patternInput = page.locator('input[placeholder*="ignore"]').first();
    await patternInput.fill('(?i)ignore\\s+previous');
    // Fill test text
    const testInput = page.locator('[placeholder*="sample threat"]');
    await testInput.fill('please ignore previous instructions');
    // Should show match
    await expect(page.getByText('Match Detected', { exact: true })).toBeVisible();
  });

  test('live pattern tester shows no match for non-matching text', async ({ page }) => {
    await page.goto('/rules/new');
    const patternInput = page.locator('input[placeholder*="ignore"]').first();
    await patternInput.fill('(?i)ignore\\s+previous');
    const testInput = page.locator('[placeholder*="sample threat"]');
    await testInput.fill('hello world');
    await expect(page.getByText('No Signature Match', { exact: true })).toBeVisible();
  });

  test('live pattern tester shows error for invalid regex', async ({ page }) => {
    await page.goto('/rules/new');
    const patternInput = page.locator('input[placeholder*="ignore"]').first();
    await patternInput.fill('[invalid');
    await expect(page.getByText('Invalid Regex Pattern', { exact: true })).toBeVisible();
  });

  test('compile button is disabled with invalid regex', async ({ page }) => {
    await page.goto('/rules/new');
    const patternInput = page.locator('input[placeholder*="ignore"]').first();
    await patternInput.fill('[invalid');
    const button = page.getByRole('button', { name: 'Save Rule', exact: true });
    await expect(button).toBeDisabled();
  });
});
