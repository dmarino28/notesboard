import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

export default async function globalSetup(_config: FullConfig) {
  const email = process.env.NOTESBOARD_EMAIL;
  const password = process.env.NOTESBOARD_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing credentials. Set NOTESBOARD_EMAIL and NOTESBOARD_PASSWORD environment variables before running tests.'
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to login with ?next=/notes so we land there after auth
  await page.goto('http://localhost:3000/login?next=/notes');

  // Fill email and password (the form defaults to "password" mode)
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);

  // Submit — the button text is "Sign in"
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait until we land on a post-login page (not /login)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  // Confirm we can reach /notes
  await page.goto('http://localhost:3000/notes');
  await page.waitForURL(/\/notes/, { timeout: 10_000 });

  // Persist the authenticated browser storage (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });

  await browser.close();
}
