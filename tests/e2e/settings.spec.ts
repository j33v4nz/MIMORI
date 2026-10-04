import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test('loads the settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveTitle(/MIMORI/);
    await expect(page.getByText('LLM JUDGE CONFIGURATION')).toBeVisible();
  });

  test('displays provider selection cards', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('LOCAL LLM')).toBeVisible();
    await expect(page.getByText('CLOUD API')).toBeVisible();
  });

  test('local LLM is selected by default', async ({ page }) => {
    await page.goto('/settings');
    const localCard = page.getByRole('radio', { name: /local llm/i });
    await expect(localCard).toHaveAttribute('aria-checked', 'true');
  });

  test('shows local server settings when local is selected', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Local Server Settings')).toBeVisible();
    await expect(page.getByLabel('Base URL')).toBeVisible();
    await expect(page.getByLabel('Model Name')).toBeVisible();
  });

  test('switches to cloud settings when cloud card is clicked', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /cloud api/i }).click();
    await expect(page.getByText('Cloud Provider Settings')).toBeVisible();
    await expect(page.getByLabel('Provider', { exact: true })).toBeVisible();
  });

  test('API key field has show/hide toggle', async ({ page }) => {
    await page.goto('/settings');
    const apiKeyInput = page.getByLabel('API Key', { exact: true });
    await expect(apiKeyInput).toHaveAttribute('type', 'password');
    // Click show button
    await page.getByRole('button', { name: /show api key/i }).click();
    await expect(apiKeyInput).toHaveAttribute('type', 'text');
    // Click hide button
    await page.getByRole('button', { name: /hide api key/i }).click();
    await expect(apiKeyInput).toHaveAttribute('type', 'password');
  });

  test('form submits on Enter key', async ({ page }) => {
    // Verify the browser submits without changing a shared local database.
    await page.route('**/api/settings/judge', route => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    await page.goto('/settings');
    // Fill in model name
    const modelInput = page.getByLabel('Model Name');
    await modelInput.fill('custom-model');
    const saved = page.waitForRequest(request => request.url().endsWith('/api/settings/judge') && request.method() === 'PUT');
    await modelInput.press('Enter');
    expect((await saved).postDataJSON()).toMatchObject({ model: 'custom-model' });
    await expect(page.getByRole('status')).toContainText('Configuration saved successfully.');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('model name field is required', async ({ page }) => {
    await page.goto('/settings');
    const modelInput = page.getByLabel('Model Name');
    await modelInput.fill('');
    await expect(modelInput).toHaveAttribute('required', '');
  });
});
