import { test, expect } from '@playwright/test';

test.describe('API Keys Management', () => {
  test('loads the API keys page', async ({ page }) => {
    await page.goto('/keys');
    await expect(page).toHaveTitle(/MIMORI/);
    await expect(page.getByText('Provision API Access Key')).toBeVisible();
    await expect(page.getByText('Active Access Keys')).toBeVisible();
  });

  test('shows empty state when no keys exist', async ({ page }) => {
    await page.goto('/keys');
    const emptyMessage = page.getByText('No API keys configured yet. Create one on the left.');
    // Either empty state or table with keys
    const hasKeys = await page.locator('table').count() > 0;
    if (!hasKeys) {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('has correct form labels', async ({ page }) => {
    await page.goto('/keys');
    await expect(page.getByText('Key Label / Description (required)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate API Key/i })).toBeVisible();
  });

  test('generate button is disabled when input is empty', async ({ page }) => {
    await page.goto('/keys');
    const button = page.getByRole('button', { name: /Generate API Key/i });
    await expect(button).toBeDisabled();
  });

  test('generate button enables when name is typed', async ({ page }) => {
    await page.goto('/keys');
    const input = page.locator('input[type="text"]').first();
    await input.fill('test-key');
    const button = page.getByRole('button', { name: /Generate API Key/i });
    await expect(button).toBeEnabled();
  });
});
