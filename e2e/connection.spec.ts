import { test, expect } from '@playwright/test';

// Basic smoke test – replace URL when dev server is available
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080';

test.describe('Smoke Tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Terminal/i);
  });
});
