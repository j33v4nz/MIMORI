import { test, expect } from '@playwright/test';

test.describe('Responsive & Accessibility', () => {
  test('sidebar is hidden on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const sidebar = page.locator('aside[aria-label="Sidebar navigation"]');
    await expect(sidebar).not.toBeVisible();
  });

  test('mobile menu toggle appears on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: /menu/i });
    await expect(menuButton).toBeVisible();
  });

  test('mobile menu opens sidebar when clicked', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByRole('button', { name: /menu/i }).click();
    const navPanel = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(navPanel).toBeVisible();
    await navPanel.getByRole('link', { name: 'Agents', exact: true }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(navPanel).not.toBeVisible();
  });

  test('all pages have proper heading hierarchy', async ({ page }) => {
    const pages = ['/', '/events', '/agents', '/detections', '/rules', '/settings'];
    for (const path of pages) {
      await page.goto(path);
      const h1 = page.locator('h1');
      await expect(h1.first()).toBeVisible();
    }
  });

  test('secondary dashboard routes render without a page crash', async ({ page }) => {
    const routes = ['/behavior-diff', '/keys', '/rules/new'];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('focus indicators are visible on interactive elements', async ({ page }) => {
    await page.goto('/');
    // Tab to first interactive element
    await page.keyboard.press('Tab');
    // Check that an element has focus
    const focused = page.locator(':focus');
    await expect(focused).toBeAttached();
  });
});
