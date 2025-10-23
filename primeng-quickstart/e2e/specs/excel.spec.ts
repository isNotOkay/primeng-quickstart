// e2e/excel.spec.ts
import { expect, test } from '@playwright/test';
import {
  API_BASE,
  UI_TIMEOUT,
  dsl,
  createTable,
  dropObject,
  putEngine,
  confirmPrimeDelete,
  clickToolbarDelete,
  waitForListsReady,
  goHome,
  openSelectOverlay,
  selectEngine,
  expectHeaderVisible,
  waitForListItemVisible,
  waitForListItemHidden,
  expectGroupHeaderVisible,
  expectGroupHeaderHidden,
} from '../test.util';

test.describe.configure({ mode: 'serial' });

// ───────────────────────────────────────────────────────────────
// Tool Server API — Excel only (no UI)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server API — Excel (no UI)', () => {
  test('excel: GET /tables and POST /columns return data', async ({ request }) => {
    await putEngine(request, 'excel');

    const sheetName = 'E2E_API_XL_1';
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

    const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, { data: { tableName: sheetName } });
    expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
    const columns = await colsRes.json();
    expect(Array.isArray(columns)).toBeTruthy();
    expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));

    await dropObject(request, sheetName);
  });

  test('download endpoint (Excel) returns 200 OK', async ({ request }) => {
    await putEngine(request, 'excel');

    const sheetName = 'E2E_DL_XL';
    await createTable(request, sheetName, [{ name: 'Id', type: 'INTEGER' }]);

    const res = await request.get(`${API_BASE}/api/web-viewer/download?engine=Excel`);
    const bodyPreview = await res.text();
    expect(res.ok(), bodyPreview).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────
// Tool Server ↔ Angular UI — Excel
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server ↔ Angular UI — Excel', () => {
  test('creates a new sheet via API and UI lists it (Excel)', async ({ page, request, baseURL }) => {
    const sheetName = 'E2E_XL_Sheet_1';

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await createTable(request, sheetName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    const navItem = await waitForListItemVisible(page, sheetName);
    await navItem.click();
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');
  });

  test('adds a column on an Excel sheet and UI shows the new column', async ({ page, request, baseURL }) => {
    const sheetName = 'E2E_XL_AddCol';

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await createTable(request, sheetName, [{ name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true }]);

    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await dsl(request, {
      operation: 'Alter',
      target: { name: sheetName },
      alter: { actions: [{ addColumn: { name: 'AddedCol', type: 'TEXT' } }] },
    });
    await expectHeaderVisible(page, 'AddedCol');
  });

  test('renames a column on an Excel sheet and UI reflects it', async ({ page, request, baseURL }) => {
    const sheetName = 'E2E_XL_Rename';

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await createTable(request, sheetName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'OldCol', type: 'TEXT' },
    ]);

    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'OldCol');

    // Optional: navigate away to avoid backend file locks
    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Alter',
      target: { name: sheetName },
      alter: { actions: [{ renameColumn: { from: 'OldCol', to: 'NewCol' } }] },
    });

    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'NewCol');

    const oldHeaderRole = page.getByRole('columnheader', { name: 'OldCol' });
    if ((await oldHeaderRole.count()) > 0) {
      await expect(oldHeaderRole).toHaveCount(0, { timeout: UI_TIMEOUT });
    }
  });

  test('drops an Excel sheet and UI removes it', async ({ page, request, baseURL }) => {
    const sheetName = 'E2E_XL_Drop';

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await createTable(request, sheetName, [{ name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true }]);

    await waitForListItemVisible(page, sheetName);
    await dsl(request, { operation: 'Drop', target: { name: sheetName }, drop: {} });
    await waitForListItemHidden(page, sheetName);
  });

  // Note: function-based VIEW creation exists on SQLite side, kept here for parity with previous suite
  test('creates a VIEW using functions (OD_*) and then drops it (UI updates)', async ({ page, request, baseURL }) => {
    const viewName = 'E2E_Play_FuncView_2';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite'); // functions exist on SQLite side

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

    const viewItem = await waitForListItemVisible(page, viewName);
    await viewItem.click();
    await expectHeaderVisible(page, 'LastName_Stripped');
    await expectHeaderVisible(page, 'BirthDate');
    await expectHeaderVisible(page, 'BirthHoliday');

    await dsl(request, { operation: 'Drop', target: { name: viewName }, drop: {} });
    await waitForListItemHidden(page, viewName);
  });
});

// ───────────────────────────────────────────────────────────────
// Left listbox groups — Excel-specific visibility & engine switching
// ───────────────────────────────────────────────────────────────
test.describe('Left listbox groups — "Sichten" hidden for Excel', () => {
  test('initial load with persisted Excel hides "Sichten"', async ({ page, request, baseURL }) => {
    await putEngine(request, 'excel');
    await goHome(page, baseURL);

    await expectGroupHeaderHidden(page, 'SICHTEN');
    await expectGroupHeaderVisible(page, 'TABELLEN');
  });

  test('switching engines toggles "Sichten" visibility', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');
    await goHome(page, baseURL);

    await expectGroupHeaderVisible(page, 'SICHTEN');

    await selectEngine(page, 'Excel');
    await expectGroupHeaderHidden(page, 'SICHTEN');
    await expectGroupHeaderVisible(page, 'TABELLEN');

    await selectEngine(page, 'SQLite');
    await expectGroupHeaderVisible(page, 'SICHTEN');
  });

  test.describe('Engine switch clears selection and prevents stale table requests', () => {
    test('no request for previously selected table after switching engine', async ({ page, request, baseURL }) => {
      await putEngine(request, 'excel');
      const sheetName = 'E2E_XL_Stale';
      await createTable(request, sheetName, [{ name: 'Id', type: 'INTEGER' }]);

      await goHome(page, baseURL);
      await selectEngine(page, 'Excel');

      await waitForListItemVisible(page, sheetName).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');

      let sawStaleRequest = false;
      const stalePath = `/api/web-viewer/tables/${encodeURIComponent(sheetName)}`;
      page.on('request', (req) => {
        if (req.url().includes(stalePath)) {
          sawStaleRequest = true;
        }
      });

      await selectEngine(page, 'SQLite');

      await page.waitForTimeout(500);
      expect(sawStaleRequest).toBeFalsy();

      await putEngine(request, 'excel');
      await dropObject(request, sheetName);
    });
  });
});

// ───────────────────────────────────────────────────────────────
// Excel: Delete via UI and engine-switch UI integrity
// ───────────────────────────────────────────────────────────────
test.describe('Excel — deletion & engine-switch UI', () => {
  test('deletes a sheet via UI (Excel): confirm dialog, list updates, neutral message shown', async ({ page, request, baseURL }) => {
    await putEngine(request, 'excel');

    const sheetName = 'XL_DEL_1';
    await createTable(request, sheetName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');

    await clickToolbarDelete(page);
    await confirmPrimeDelete(page);

    await waitForListItemHidden(page, sheetName);
    await expect(page.getByText('Keine Tabelle ausgewählt.')).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('engine switch keeps UI visible and shows list overlay (not blank screen)', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');
    const tableName = 'E2E_EngineSwitch_UI';
    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);

    await selectEngine(page, 'SQLite');
    await waitForListItemVisible(page, tableName);

    await page.route('**/api/web-viewer/tables*', async (route) => {
      await page.waitForTimeout(400);
      await route.continue();
    });
    await page.route('**/api/web-viewer/views*', async (route) => {
      await page.waitForTimeout(400);
      await route.continue();
    });

    const selectRoot = page.locator('p-select[inputid="dataSource"]');
    await openSelectOverlay(selectRoot);

    const panel = page.locator('.p-select-panel, .p-dropdown-panel, .p-overlay, .p-select-items');
    await expect(panel.first()).toBeVisible({ timeout: UI_TIMEOUT });

    const opt = page.getByRole('option', { name: 'Excel', exact: true });
    if ((await opt.count()) > 0) {
      await opt.first().click({ timeout: UI_TIMEOUT });
    } else {
      await panel.getByText('Excel', { exact: true }).first().click({ timeout: UI_TIMEOUT });
    }

    await expect(page.locator('p-toolbar').first()).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.locator('.left-listbox')).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.locator('app-loading-indicator').first()).toBeVisible({ timeout: UI_TIMEOUT });

    await waitForListsReady(page);
    await expectGroupHeaderVisible(page, 'TABELLEN');
    await expectGroupHeaderHidden(page, 'SICHTEN');

    await page.unroute('**/api/web-viewer/tables*');
    await page.unroute('**/api/web-viewer/views*');

    await putEngine(request, 'sqlite');
    await dropObject(request, tableName);
  });
});
