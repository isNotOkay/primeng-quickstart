import {APIRequestContext, expect, Locator, Page} from '@playwright/test';

export const API_BASE = process.env['API_BASE'] ?? 'http://localhost:4713';
export const UI_TIMEOUT = 10_000;

// Helpers extracted from e2e.spec.ts
export async function dsl(request: APIRequestContext, body: unknown) {
  const res = await request.post(`${API_BASE}/api/tool-server/sql/query`, {data: body});
  const txt = await res.text();
  expect(res.ok(), txt).toBeTruthy();
}

export async function putEngine(request: APIRequestContext, engine: 'sqlite' | 'excel') {
  const res = await request.put(`${API_BASE}/api/web-viewer/settings/engine`, {data: {engine}});
  const txt = await res.text();
  expect(res.ok(), txt).toBeTruthy();
  const body = JSON.parse(txt);
  expect((body?.engine ?? '').toLowerCase()).toBe(engine);
}

/** Clicks the confirm 'Löschen' button in the PrimeNG ConfirmDialog */
export async function confirmPrimeDelete(page: Page) {
  // Find the visible PrimeNG dialog by its container rather than ARIA name
  const dlg = page.locator('.p-dialog:visible').filter({
    has: page.getByRole('button', {name: 'Abbrechen'}),
  }).last();

  await expect(dlg).toBeVisible({timeout: UI_TIMEOUT});
  await dlg.getByRole('button', {name: 'Löschen', exact: true}).click();
}

export async function clickToolbarDelete(page: Page) {
  await page
    .locator('.right-panel app-loading-indicator')
    .waitFor({ state: 'detached', timeout: UI_TIMEOUT })
    .catch(() => {});

  // Wait until the button exists and is clickable
  const deleteBtn = page.locator('#toolbar-delete');
  await deleteBtn.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await expect(deleteBtn).toBeEnabled({ timeout: UI_TIMEOUT });

  await deleteBtn.click();
}

/** Wait until PrimeNG listbox shows at least one group and one item/placeholder */
export async function waitForListsReady(page: Page) {
  const listbox = page.locator('.left-listbox');
  await expect(listbox).toBeVisible({timeout: UI_TIMEOUT});

  // At least one group header (PrimeNG uses li.p-listbox-option-group)
  await expect(listbox.locator('li.p-listbox-option-group').first()).toBeVisible({timeout: UI_TIMEOUT});

  // At least one option (or placeholder)
  const anyItem = listbox.locator('li.p-listbox-option').first();
  await expect(anyItem).toBeVisible({timeout: UI_TIMEOUT});
}

/** Navigate home and wait until the left listbox is ready */
export async function goHome(page: Page, baseURL?: string) {
  await page.goto(baseURL ?? '/');
  await waitForListsReady(page);
}

/** Try multiple ways to open the PrimeNG Select overlay */
export async function openSelectOverlay(selectRoot: Locator) {
  const candidates: Locator[] = [
    selectRoot.getByRole('combobox'),
    selectRoot.locator('.p-select-trigger'),
    selectRoot.locator('.p-select-label'),
    selectRoot.locator('.p-select'),
  ];

  for (const cand of candidates) {
    if ((await cand.count()) > 0) {
      try {
        await cand.first().click({timeout: 1500});
        return;
      } catch {
        // try next
      }
    }
  }

  // Keyboard fallback
  if ((await selectRoot.getByRole('combobox').count()) > 0) {
    const combo = selectRoot.getByRole('combobox').first();
    await combo.focus();
    try {
      await combo.press('Enter', {timeout: 1000});
      return;
    } catch {
    }
    try {
      await combo.press('Space', {timeout: 1000});
      return;
    } catch {
    }
  }

  // Last resort: click near the top-left of the component
  await selectRoot.click({position: {x: 5, y: 5}, timeout: 1500});
}

/** Read the visible label text of the Select */
export async function readSelectLabel(page: Page): Promise<string> {
  const selectors = [
    'p-select[inputid="dataSource"] .p-select-label',
    'p-select[inputid="dataSource"] [data-pc-section="label"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel);
    if ((await loc.count()) > 0) {
      const text = await loc.first().innerText();
      if (text && text.trim().length) return text.trim();
    }
  }
  return '';
}

/** Picks engine via PrimeNG <p-select inputId="dataSource"> */
export async function selectEngine(page: Page, engine: 'SQLite' | 'Excel') {
  const selectRoot = page.locator('p-select[inputid="dataSource"]');
  await expect(selectRoot).toBeVisible({timeout: UI_TIMEOUT});

  await openSelectOverlay(selectRoot);

  const panel = page.locator('.p-select-panel, .p-dropdown-panel, .p-overlay, .p-select-items');
  await expect(panel.first()).toBeVisible({timeout: UI_TIMEOUT});

  const optionByRole = page.getByRole('option', {name: engine, exact: true});
  if ((await optionByRole.count()) > 0) {
    await optionByRole.first().click({timeout: UI_TIMEOUT});
  } else {
    await panel.getByText(engine, {exact: true}).first().click({timeout: UI_TIMEOUT});
  }

  await expect
    .poll(async () => await readSelectLabel(page), {
      message: 'engine select label to update',
      timeout: UI_TIMEOUT,
    })
    .toContain(engine);

  await waitForListsReady(page);
}


// Works whether PrimeNG adds ARIA roles or not
export async function expectHeaderVisible(page: Page, name: string) {
  const byRole = page.getByRole('columnheader', {name, exact: true});
  if ((await byRole.count()) > 0) {
    await expect(byRole).toBeVisible({timeout: UI_TIMEOUT});
  } else {
    await expect(page.locator(`p-table thead th:has-text("${name}")`)).toBeVisible({timeout: UI_TIMEOUT});
  }
}

/** Wait until a specific list item appears (SignalR-driven for both engines) */
export async function waitForListItemVisible(page: Page, text: string): Promise<Locator> {
  const item = page.locator('.left-listbox').getByText(text, {exact: true});
  await expect(item).toBeVisible({timeout: UI_TIMEOUT});
  return item;
}

/** Wait until a specific list item disappears (SignalR-driven for both engines) */
export async function waitForListItemHidden(page: Page, text: string): Promise<void> {
  const item = page.locator('.left-listbox').getByText(text, {exact: true});
  await expect(item).toBeHidden({timeout: UI_TIMEOUT});
}

/** Helpers for group headers in the left listbox */
export function groupHeader(page: Page, name: string) {
  return page.locator('.left-listbox li.p-listbox-option-group').filter({hasText: name});
}

export async function expectGroupHeaderVisible(page: Page, name: string) {
  const g = groupHeader(page, name);
  await expect(g).toHaveCount(1, {timeout: UI_TIMEOUT});
  await expect(g.first()).toBeVisible({timeout: UI_TIMEOUT});
}

export async function expectGroupHeaderHidden(page: Page, name: string) {
  const g = groupHeader(page, name);
  await expect(g).toHaveCount(0, {timeout: UI_TIMEOUT});
}

