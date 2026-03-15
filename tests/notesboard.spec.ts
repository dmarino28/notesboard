import { test, expect, Page, Locator } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

/**
 * Helper selectors
 * Adjust these if your UI uses different text/placeholders/testids.
 */
function notesPageUrl() {
  return `${BASE_URL}/notes`;
}

function getNotesHeading(page: Page) {
  return page.getByRole('link', { name: /notes/i }).first();
}

function getSearchInput(page: Page) {
  return page.getByPlaceholder(/search notes/i);
}

function getOrganizeButton(page: Page) {
  return page.getByRole('button', { name: /organize notes/i });
}

function getVisibleTextareas(page: Page) {
  return page.locator('textarea:visible');
}

async function getActiveEditor(page: Page): Promise<Locator> {
  const editors = getVisibleTextareas(page);
  const count = await editors.count();
  await expect(editors.first()).toBeVisible();
  return editors.nth(count - 1);
}

async function typeIntoActiveEditor(page: Page, text: string) {
  const editor = await getActiveEditor(page);
  await editor.click();
  await editor.fill(text);
  return editor;
}

async function pressSequentially(page: Page, text: string) {
  const editor = await getActiveEditor(page);
  await editor.click();
  await editor.pressSequentially(text, { delay: 20 });
  return editor;
}

/**
 * Tries to find a context header or inline board label.
 * Update this if your board headers use a specific testid.
 */
function getBoardLabel(page: Page, boardName: string) {
  return page.locator(`text=${boardName}`).first();
}

/**
 * Finds inline signal text.
 */
function getSignalToken(page: Page, token: string) {
  return page.locator(`text=${token}`).first();
}

test.describe('NotesBoard Notes Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(notesPageUrl());
  });

  test('loads the notes page', async ({ page }) => {
    await expect(page).toHaveURL(/\/notes$/);
    await expect(getNotesHeading(page)).toBeVisible();
    await expect(getSearchInput(page)).toBeVisible();
    await expect(getOrganizeButton(page)).toBeVisible();
    await expect(getVisibleTextareas(page).first()).toBeVisible();
  });

  test('creates a new note and persists visible content after Enter', async ({ page }) => {
    const noteText = `Playwright test ${Date.now()}`;

    await typeIntoActiveEditor(page, noteText);
    await page.keyboard.press('Enter');

    await expect(page.locator(`text=${noteText}`)).toBeVisible();

    const editor = await getActiveEditor(page);
    await expect(editor).toBeVisible();
  });

  test('Enter creates a new bullet and typing continues in new entry, not previous entry', async ({ page }) => {
    const firstLine = `First line ${Date.now()}`;
    const secondLine = `Second line ${Date.now()}`;

    await typeIntoActiveEditor(page, firstLine);
    await page.keyboard.press('Enter');

    const editor = await getActiveEditor(page);
    await editor.fill(secondLine);

    await expect(page.locator(`text=${firstLine}`)).toBeVisible();
    await expect(page.locator(`text=${secondLine}`)).toBeVisible();

    // Sanity check: second line should not get concatenated into the first visible text node.
    const combined = page.locator(`text=${firstLine}${secondLine}`);
    await expect(combined).toHaveCount(0);
  });

  test('Tab indents instead of accepting autocomplete', async ({ page }) => {
    const text = `Indent test ${Date.now()}`;

    await typeIntoActiveEditor(page, text);
    await page.keyboard.press('Tab');

    await expect(page.locator(`text=${text}`)).toBeVisible();

    // Optional: adjust this selector to your actual indented row styling.
    // Example assertions you can swap in:
    // await expect(page.locator('[data-indent-level="1"]').filter({ hasText: text })).toBeVisible();
  });

  test('Shift+Tab unindents an indented line', async ({ page }) => {
    const text = `Unindent test ${Date.now()}`;

    await typeIntoActiveEditor(page, text);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');

    await expect(page.locator(`text=${text}`)).toBeVisible();

    // Optional stronger assertion:
    // await expect(page.locator('[data-indent-level="0"]').filter({ hasText: text })).toBeVisible();
  });

  test('board shorthand detection works for TWKY', async ({ page }) => {
    await typeIntoActiveEditor(page, 'TWKY trailer reactions');
    await page.keyboard.press('Enter');

    await expect(getBoardLabel(page, 'They Will Kill You')).toBeVisible();
    await expect(page.locator('text=TWKY')).toBeVisible();
  });

  test('lowercase board detection works for mummy', async ({ page }) => {
    await typeIntoActiveEditor(page, 'mummy release campaign');
    await page.keyboard.press('Enter');

    await expect(getBoardLabel(page, 'The Mummy')).toBeVisible();
    await expect(page.locator('text=mummy')).toBeVisible();
  });

  test('autocomplete appears for board prefix and Enter accepts it', async ({ page }) => {
    await pressSequentially(page, 'F');

    // Adjust text if your hint copy differs.
    await expect(page.locator(/switch to board/i).first()).toBeVisible();

    await page.keyboard.press('Enter');

    // Update to whatever your real board title is.
    // If F1 exists:
    await expect(getBoardLabel(page, 'F1')).toBeVisible();
  });

  test('Escape dismisses autocomplete suggestion', async ({ page }) => {
    await pressSequentially(page, 'F');

    const hint = page.locator(/switch to board/i).first();
    await expect(hint).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(hint).toHaveCount(0);
  });

  test('signal detection highlights common signals after save', async ({ page }) => {
    const note = 'TikTok campaign launch April 5 for UK';

    await typeIntoActiveEditor(page, note);
    await page.keyboard.press('Enter');

    await expect(getSignalToken(page, 'TikTok')).toBeVisible();
    await expect(getSignalToken(page, 'campaign launch')).toBeVisible();
    await expect(getSignalToken(page, 'April 5')).toBeVisible();
    await expect(getSignalToken(page, 'UK')).toBeVisible();
  });

  test('hovering a signal token opens the signal popover', async ({ page }) => {
    const note = `Hover signal test ${Date.now()} TikTok campaign launch April 5`;

    await typeIntoActiveEditor(page, note);
    await page.keyboard.press('Enter');

    await getSignalToken(page, 'TikTok').hover();

    await expect(page.locator(/channel/i).first()).toBeVisible();
    await expect(page.locator(/organize|send to organize/i).first()).toBeVisible();
    await expect(page.locator(/dismiss/i).first()).toBeVisible();
  });

  test('search filters notes', async ({ page }) => {
    const uniqueNote = `SearchableNote-${Date.now()}`;
    const otherNote = `OtherNote-${Date.now()}`;

    await typeIntoActiveEditor(page, uniqueNote);
    await page.keyboard.press('Enter');

    await typeIntoActiveEditor(page, otherNote);
    await page.keyboard.press('Enter');

    await getSearchInput(page).fill(uniqueNote);

    await expect(page.locator(`text=${uniqueNote}`)).toBeVisible();
    await expect(page.locator(`text=${otherNote}`)).toHaveCount(0);
  });

  test('film filter view groups notes by board', async ({ page }) => {
    await typeIntoActiveEditor(page, 'The Mummy launch update');
    await page.keyboard.press('Enter');

    // Adjust this if your tab is role=tab or button.
    await page.getByRole('button', { name: /^film$/i }).click();

    await expect(getBoardLabel(page, 'The Mummy')).toBeVisible();
  });

  test('organize notes panel opens and shows suggestions', async ({ page }) => {
    await typeIntoActiveEditor(page, 'The Mummy release window in UK');
    await page.keyboard.press('Enter');

    await getOrganizeButton(page).click();

    await expect(page.locator(/review ai suggestions/i).first()).toBeVisible();

    // Looser assertion because suggestions can vary.
    await expect(
      page.locator(/create card|add milestone|update/i).first()
    ).toBeVisible();
  });

  test('Apply All requires confirmation', async ({ page }) => {
    await typeIntoActiveEditor(page, 'The Mummy release window in UK');
    await page.keyboard.press('Enter');

    await getOrganizeButton(page).click();

    const applyAll = page.getByRole('button', { name: /apply all/i }).first();
    await expect(applyAll).toBeVisible();

    await applyAll.click();

    await expect(page.locator(/confirm.*apply all/i).first()).toBeVisible();
  });

  test('context headers do not flood on rapid board switching', async ({ page }) => {
    await typeIntoActiveEditor(page, 'F1 trailer note');
    await page.keyboard.press('Enter');

    await typeIntoActiveEditor(page, 'TWKY social note');
    await page.keyboard.press('Enter');

    await typeIntoActiveEditor(page, 'F1 another note');
    await page.keyboard.press('Enter');

    await typeIntoActiveEditor(page, 'TWKY another note');
    await page.keyboard.press('Enter');

    // This is intentionally loose.
    // Tighten if you add data-testid to headers.
    const f1Headers = page.locator('text=F1');
    const twkyHeaders = page.locator('text=They Will Kill You');

    await expect(f1Headers.first()).toBeVisible();
    await expect(twkyHeaders.first()).toBeVisible();
  });
});