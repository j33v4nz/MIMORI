import { test, expect } from '@playwright/test';

test.describe('Login form', () => {
  test('starts with empty credentials and ordinary authentication actions', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/MIMORI/);
    await expect(page.locator('#login-email')).toHaveValue('');
    await expect(page.locator('#login-password')).toHaveValue('');
    await expect(page.getByRole('button', { name: /Continue with GitHub/i })).toBeVisible();
    await expect(page.getByText(/Fill dev credentials/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /1-Click Operative Demo Access/i })).toHaveCount(0);
  });

  test('toggles password visibility', async ({ page }) => {
    await page.goto('/login');
    const password = page.locator('#login-password');
    await password.fill('example-password');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('switches between signup and login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Create Account' }).click();
    await expect(page.locator('#signup-name')).toBeVisible();
    await expect(page.locator('#signup-email')).toBeVisible();
    await expect(page.locator('#signup-password')).toBeVisible();
    await page.getByRole('button', { name: 'Already have an account? Sign In' }).click();
    await expect(page.locator('#login-email')).toBeVisible();
  });

  test('preserves entered email after failed authentication', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('nonexistent-smoke@example.invalid');
    await page.locator('#login-password').fill('wrongpassword');
    await page.getByRole('button', { name: /Sign In to Dashboard/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Invalid login credentials/i })).toBeVisible();
    await expect(page.locator('#login-email')).toHaveValue('nonexistent-smoke@example.invalid');
  });
});
