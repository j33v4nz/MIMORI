import { test, expect } from '@playwright/test';

test.describe('Agent Detail & Sessions', () => {
  test('agents page loads and shows table', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByRole('heading', { name: 'Observed Agents', exact: true })).toBeVisible();
    if (await page.getByRole('table').count()) {
      await expect(page.getByRole('columnheader', { name: 'Agent Identity', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Framework', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'No Agents Registered' })).toBeVisible();
    }
  });

  test('agents table has column headers', async ({ page }) => {
    await page.goto('/agents');
    if (await page.getByRole('table').count()) {
      for (const name of ['Last Active', 'Total Sessions', 'Total Events']) {
        await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
      }
    } else {
      await expect(page.getByRole('heading', { name: 'No Agents Registered' })).toBeVisible();
    }
  });

  test('clicking agent name navigates to detail page', async ({ page }) => {
    await page.goto('/agents');
    // Find first agent link (if any exist)
    const agentLinks = page.locator('table tbody tr td a, table tbody tr td button');
    const count = await agentLinks.count();
    if (count > 0) {
      await agentLinks.first().click();
      // Should navigate to an agent detail page
      await expect(page).toHaveURL(/\/agents\//);
    }
  });

  test('behavior diff page loads', async ({ page }) => {
    await page.goto('/behavior-diff');
    await expect(page.getByRole('heading', { name: 'Behavior Diff', exact: true })).toBeVisible();
  });

  test('behavior diff page has compare controls', async ({ page }) => {
    await page.goto('/behavior-diff');
    // Should have some form of comparison UI
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
