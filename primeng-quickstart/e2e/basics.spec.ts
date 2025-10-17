// file: e2e/basics.spec.ts
import { APIRequestContext, expect, Page, test } from '@playwright/test';

const API_BASE = process.env['API_BASE'] ?? 'http://localhost:4713';
const UI_TIMEOUT = 5_000;

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
async function dsl(request: APIRequestContext, body: unknown) {
  // NOTE: Engine is no longer required in the DSL body. The API reads it from settings.
  const res = await request.post(`${API_BASE}/api/tool-server/sql/query`, { data: body });
  const txt = await res.text();
  expect(res.ok(), txt).toBeTruthy();
}

async function putEngine(request: APIRequestContext, engine: 'sqlite' | 'excel') {
  const res = await request.put(`${API_BASE}/api/web-viewer/settings/engine`, {
    data: { engine },
  });
  const txt = await res.text();
  expect(res.ok(), txt).toBeTruthy();
  const body = JSON.parse(txt);
  expect(body?.engine?.toLowerCase()).toBe(engine);
}

async function waitForListsIdle(page: Page) {
  // listsLoading() shows/hides .global-loading
  const spinner = page.locator('.global-loading');
  // If the spinner never appeared, the 'detached' wait might time out; guard with catch.
  await spinner.waitFor({ state: 'detached', timeout: UI_TIMEOUT }).catch(() => {});
  await expect(spinner).toBeHidden({ timeout: UI_TIMEOUT });
}

async function goHome(page: Page, baseURL?: string) {
  await page.goto(baseURL ?? '/');
  // Appears when lists finished rendering
  await page.getByRole('navigation').getByText('Tabellen').waitFor({ timeout: UI_TIMEOUT });
  await waitForListsIdle(page);
}

async function selectEngine(page: Page, engine: 'SQLite' | 'Excel') {
  // Wait until the mat-select is enabled (aria-disabled="false")
  const combo = page.locator('#engine mat-select[aria-disabled="false"]');
  await expect(combo).toBeVisible({ timeout: UI_TIMEOUT });

  // Open the dropdown and select the desired engine
  await combo.click();
  await page.getByRole('option', { name: engine, exact: true }).click();

  // The change triggers PUT /settings/engine + a reload of the lists; wait for it to settle
  await waitForListsIdle(page);

  // Ensure the selection is reflected in the trigger
  await expect(page.locator('#engine mat-select')).toContainText(engine, { timeout: UI_TIMEOUT });
}

/** Reloads the page, waits for lists to settle, and re-applies the desired engine. */
async function reloadAndEnsureEngine(page: Page, engine: 'SQLite' | 'Excel') {
  await page.reload();
  await page.getByRole('navigation').getByText('Tabellen').waitFor({ timeout: UI_TIMEOUT });
  await waitForListsIdle(page);
  await selectEngine(page, engine);
}

test.describe.configure({ mode: 'serial' });

// ───────────────────────────────────────────────────────────────
// API-only: tables & columns (no UI interaction)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server API — tables & columns (no UI)', () => {
  test.describe.configure({ mode: 'serial' });

  test('sqlite: GET /tables and POST /columns return data', async ({ request }) => {
    await putEngine(request, 'sqlite');

    // Create a dedicated test table to be deterministic
    const tableName = `E2E_API_SQLITE_${Date.now()}`;
    await dsl(request, {
      operation: 'Create',
      target: { name: tableName },
      create: {
        kind: 'Table',
        schema: [
          { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
          { name: 'Name', type: 'TEXT' },
        ],
      },
    });

    const tablesRes = await request.get(`${API_BASE}/api/tool-server/sql/tables`);
    expect(tablesRes.ok(), await tablesRes.text()).toBeTruthy();
    const tables = await tablesRes.json();
    expect(Array.isArray(tables)).toBeTruthy();
    expect(tables).toContain(tableName);

    const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, {
      data: { tableName },
    });
    expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
    const columns = await colsRes.json();
    expect(Array.isArray(columns)).toBeTruthy();
    expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));

    // cleanup
    await dsl(request, { operation: 'Drop', target: { name: tableName }, drop: {} });
  });

  test('engine dropdown reflects persisted setting on load and after change', async ({ page, request, baseURL }) => {
    // Persist engine via API first (server returns { engine: "Sqlite" | "Excel" })
    await putEngine(request, 'sqlite');

    // Initial load should show the persisted engine without user interaction
    await goHome(page, baseURL);
    await expect(page.locator('#engine mat-select')).toContainText('SQLite', { timeout: UI_TIMEOUT });

    // Change to Excel via the UI (this triggers PUT + list reload)
    await selectEngine(page, 'Excel');
    await expect(page.locator('#engine mat-select')).toContainText('Excel', { timeout: UI_TIMEOUT });

    // Now do a plain reload (no re-select helper) and the select should still show Excel
    await page.reload();
    await page.getByRole('navigation').getByText('Tabellen').waitFor({ timeout: UI_TIMEOUT });
    await waitForListsIdle(page);
    await expect(page.locator('#engine mat-select')).toContainText('Excel', { timeout: UI_TIMEOUT });

    // Sanity: backend really persisted it
    const res = await request.get(`${API_BASE}/api/web-viewer/settings/engine`);
    const body = await res.json();
    expect((body?.engine ?? '').toLowerCase()).toBe('excel');
  });

  test('excel: GET /tables and POST /columns return data', async ({ request }) => {
    await putEngine(request, 'excel');

    // Create a dedicated sheet
    const sheetName = `E2E_API_XL_${Date.now()}`;
    await dsl(request, {
      operation: 'Create',
      target: { name: sheetName },
      create: {
        kind: 'Table',
        schema: [
          { name: 'Id', type: 'INTEGER' },
          { name: 'Name', type: 'TEXT' },
        ],
      },
    });

    const tablesRes = await request.get(`${API_BASE}/api/tool-server/sql/tables`);
    expect(tablesRes.ok(), await tablesRes.text()).toBeTruthy();
    const tables = await tablesRes.json();
    expect(Array.isArray(tables)).toBeTruthy();
    expect(tables).toContain(sheetName);

    const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, {
      data: { tableName: sheetName },
    });
    expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
    const columns = await colsRes.json();
    expect(Array.isArray(columns)).toBeTruthy();
    expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));

    // cleanup
    await dsl(request, { operation: 'Drop', target: { name: sheetName }, drop: {} });
  });
});

// ───────────────────────────────────────────────────────────────
// SQLite suite
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server ↔ Angular UI — basics (SQLite)', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates a new table via API and UI lists it', async ({ page, request, baseURL }) => {
    const tableName = `E2E_Playwright_Table_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: { name: tableName },
      create: {
        kind: 'Table',
        schema: [
          { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
          { name: 'SomeDate', type: 'TEXT' },
        ],
      },
    });

    // Force a UI refresh and ensure we're still on SQLite after reload.
    await reloadAndEnsureEngine(page, 'SQLite');

    await expect(page.getByRole('navigation').getByText(tableName, { exact: true })).toBeVisible({
      timeout: UI_TIMEOUT,
    });

    await page.getByRole('navigation').getByText(tableName, { exact: true }).click();
    await expect(page.locator('table .mat-mdc-header-row')).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'Id' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'SomeDate' })).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('creates a VIEW joining Album + Artist and UI lists it under "Sichten"', async ({ page, request, baseURL }) => {
    const viewName = `E2E_Playwright_View_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: { name: viewName },
      select: {
        from: 'Album',
        columns: [
          { expr: 'Album.Title', as: 'AlbumTitle' },
          { expr: 'Artist.Name', as: 'ArtistName' },
        ],
        // INNER joins only → no "type" field
        joins: [{ table: 'Artist', on: 'Album.ArtistId = Artist.ArtistId' }],
        orderBy: ['ArtistName ASC', 'AlbumTitle ASC'],
        limit: 5,
      },
    });

    const viewItem = page.getByRole('navigation').getByText(viewName, { exact: true });
    await expect(viewItem).toBeVisible({ timeout: UI_TIMEOUT });

    await viewItem.click();
    await expect(page.getByRole('columnheader', { name: 'AlbumTitle' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'ArtistName' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.locator('table tr.mat-mdc-row').first()).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('adds a column to a fresh E2E table and UI shows the new column', async ({ page, request, baseURL }) => {
    const tableName = `E2E_Playwright_Table_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: { name: tableName },
      create: { kind: 'Table', schema: [{ name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true }] },
    });

    await dsl(request, {
      operation: 'Alter',
      target: { name: tableName },
      alter: { actions: [{ addColumn: { name: 'AddedCol', type: 'TEXT' } }] },
    });

    await expect(page.getByRole('navigation').getByText(tableName, { exact: true })).toBeVisible({
      timeout: UI_TIMEOUT,
    });

    await page.getByRole('navigation').getByText(tableName, { exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Id' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'AddedCol' })).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('creates a VIEW using functions (OD_*) and then drops it (UI updates)', async ({ page, request, baseURL }) => {
    const viewName = `E2E_Playwright_FuncView_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: { name: viewName },
      select: {
        from: 'Employee',
        columns: [
          { expr: 'OD_Stripe(LastName)', as: 'LastName_Stripped' },
          { expr: 'BirthDate', as: 'BirthDate' },
          { expr: 'OD_Feiertag(BirthDate)', as: 'BirthHoliday' },
        ],
        limit: 3,
      },
    });

    const viewItem = page.getByRole('navigation').getByText(viewName, { exact: true });
    await expect(viewItem).toBeVisible({ timeout: UI_TIMEOUT });

    await viewItem.click();
    await expect(page.getByRole('columnheader', { name: 'LastName_Stripped' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'BirthDate' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'BirthHoliday' })).toBeVisible({ timeout: UI_TIMEOUT });

    await dsl(request, { operation: 'Drop', target: { name: viewName }, drop: {} });
    await expect(viewItem).toBeHidden({ timeout: UI_TIMEOUT });
  });

  test('renames a column via DSL and UI reflects the new header', async ({ page, request, baseURL }) => {
    const tableName = `E2E_Playwright_Rename_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: { name: tableName },
      create: {
        kind: 'Table',
        schema: [
          { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
          { name: 'OldCol', type: 'TEXT' },
        ],
      },
    });

    const navItem = page.getByRole('navigation').getByText(tableName, { exact: true });
    await expect(navItem).toBeVisible({ timeout: UI_TIMEOUT });

    await navItem.click();
    await expect(page.getByRole('columnheader', { name: 'Id' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'OldCol' })).toBeVisible({ timeout: UI_TIMEOUT });

    await dsl(request, {
      operation: 'Alter',
      target: { name: tableName },
      alter: { actions: [{ renameColumn: { from: 'OldCol', to: 'NewCol' } }] },
    });

    await navItem.click();
    await expect(page.getByRole('columnheader', { name: 'NewCol' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'OldCol' })).toHaveCount(0, { timeout: UI_TIMEOUT });
  });

  test('creates a VIEW using OD_Wochentag and UI shows German weekday', async ({ page, request, baseURL }) => {
    const viewName = `E2E_Playwright_Wochentag_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    // Make a tiny view that projects a constant function result.
    // FROM must be present, so we select from an existing table and LIMIT 1.
    await dsl(request, {
      operation: 'Select',
      target: { name: viewName },
      select: {
        from: 'Album',
        columns: [
          { expr: "OD_Wochentag('2024-12-25')", as: 'Weekday' }, // 25 Dec 2024 = Mittwoch
        ],
        limit: 1,
      },
    });

    const viewItem = page.getByRole('navigation').getByText(viewName, { exact: true });
    await expect(viewItem).toBeVisible({ timeout: UI_TIMEOUT });

    await viewItem.click();
    await expect(page.getByRole('columnheader', { name: 'Weekday' })).toBeVisible({ timeout: UI_TIMEOUT });

    // First data row should contain "Mittwoch"
    const firstCell = page.locator('table tr.mat-mdc-row >> td').first();
    await expect(firstCell).toHaveText('Mittwoch', { timeout: UI_TIMEOUT });

    // Cleanup
    await dsl(request, { operation: 'Drop', target: { name: viewName }, drop: {} });
    await expect(viewItem).toBeHidden({ timeout: UI_TIMEOUT });
  });
});

// ───────────────────────────────────────────────────────────────
// Excel suite
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server ↔ Angular UI — Excel', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates a new sheet via API and UI lists it (Excel)', async ({ page, request, baseURL }) => {
    const sheetName = `E2E_XL_Sheet_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: { name: sheetName },
      create: {
        kind: 'Table',
        schema: [
          { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
          { name: 'Name', type: 'TEXT' },
        ],
      },
    });

    // Excel backend may not push SignalR events; force a UI refresh to reload lists
    await reloadAndEnsureEngine(page, 'Excel');

    const navItem = page.getByRole('navigation').getByText(sheetName, { exact: true });
    await expect(navItem).toBeVisible({ timeout: UI_TIMEOUT });

    await navItem.click();
    await expect(page.getByRole('columnheader', { name: 'Id' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('adds a column on an Excel sheet and UI shows the new column', async ({ page, request, baseURL }) => {
    const sheetName = `E2E_XL_AddCol_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: { name: sheetName },
      create: { kind: 'Table', schema: [{ name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true }] },
    });

    await dsl(request, {
      operation: 'Alter',
      target: { name: sheetName },
      alter: { actions: [{ addColumn: { name: 'AddedCol', type: 'TEXT' } }] },
    });

    const navItem = page.getByRole('navigation').getByText(sheetName, { exact: true });
    await expect(navItem).toBeVisible({ timeout: UI_TIMEOUT });

    await navItem.click();
    await expect(page.getByRole('columnheader', { name: 'Id' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'AddedCol' })).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('renames a column on an Excel sheet and UI reflects it', async ({ page, request, baseURL }) => {
    const sheetName = `E2E_XL_Rename_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: { name: sheetName },
      create: {
        kind: 'Table',
        schema: [
          { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
          { name: 'OldCol', type: 'TEXT' },
        ],
      },
    });

    const navItem = page.getByRole('navigation').getByText(sheetName, { exact: true });
    await expect(navItem).toBeVisible({ timeout: UI_TIMEOUT });

    // Open once to confirm OldCol, then navigate away to avoid locking during mutation.
    await navItem.click();
    await expect(page.getByRole('columnheader', { name: 'OldCol' })).toBeVisible({ timeout: UI_TIMEOUT });

    // Navigate away to release any read locks before mutating the workbook.
    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Alter',
      target: { name: sheetName },
      alter: { actions: [{ renameColumn: { from: 'OldCol', to: 'NewCol' } }] },
    });

    // Reload lists so the UI picks up the rename
    await reloadAndEnsureEngine(page, 'Excel');

    await page.getByRole('navigation').getByText(sheetName, { exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'NewCol' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'OldCol' })).toHaveCount(0, { timeout: UI_TIMEOUT });
  });

  test('drops an Excel sheet and UI removes it', async ({ page, request, baseURL }) => {
    const sheetName = `E2E_XL_Drop_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: { name: sheetName },
      create: { kind: 'Table', schema: [{ name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true }] },
    });

    const navItem = page.getByRole('navigation').getByText(sheetName, { exact: true });
    await expect(navItem).toBeVisible({ timeout: UI_TIMEOUT });

    await dsl(request, { operation: 'Drop', target: { name: sheetName }, drop: {} });

    // Force a refresh so the nav re-reads the list after drop
    await reloadAndEnsureEngine(page, 'Excel');

    await expect(navItem).toBeHidden({ timeout: UI_TIMEOUT });
  });

  test('creates a VIEW using functions (OD_*) and then drops it (UI updates)', async ({ page, request, baseURL }) => {
    const viewName = `E2E_Playwright_FuncView_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: { name: viewName },
      select: {
        from: 'Employee',
        columns: [
          { expr: 'OD_Stripe(LastName)', as: 'LastName_Stripped' },
          { expr: 'BirthDate', as: 'BirthDate' },
          { expr: 'OD_Feiertag(BirthDate)', as: 'BirthHoliday' },
        ],
        limit: 3,
      },
    });

    const viewItem = page.getByRole('navigation').getByText(viewName, { exact: true });
    await expect(viewItem).toBeVisible({ timeout: UI_TIMEOUT });

    await viewItem.click();
    await expect(page.getByRole('columnheader', { name: 'LastName_Stripped' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'BirthDate' })).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.getByRole('columnheader', { name: 'BirthHoliday' })).toBeVisible({ timeout: UI_TIMEOUT });

    await dsl(request, { operation: 'Drop', target: { name: viewName }, drop: {} });
    await expect(viewItem).toBeHidden({ timeout: UI_TIMEOUT });
  });
});
