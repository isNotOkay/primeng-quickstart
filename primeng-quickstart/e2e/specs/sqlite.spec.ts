// e2e/sqlite.spec.ts
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
  readSelectLabel,
  selectEngine,
  expectHeaderVisible,
  waitForListItemVisible,
  waitForListItemHidden,
} from '../test.util';

test.describe.configure({ mode: 'serial' });

// ───────────────────────────────────────────────────────────────
// Tool Server API — SQLite only (no UI)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server API — SQLite (no UI)', () => {
  test('sqlite: GET /tables and POST /columns return data', async ({ request }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_API_SQLITE_1';
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

    const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, { data: { tableName } });
    expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
    const columns = await colsRes.json();
    expect(Array.isArray(columns)).toBeTruthy();
    expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));

    await dropObject(request, tableName);
  });

  test('download endpoint (SQLite) returns 200 OK', async ({ request }) => {
    await putEngine(request, 'sqlite');

    // Touch the DB to ensure file exists
    const tableName = 'E2E_DL_SQL';
    await createTable(request, tableName, [{ name: 'Id', type: 'INTEGER' }]);

    const res = await request.get(`${API_BASE}/api/web-viewer/download?engine=Sqlite`);
    const bodyPreview = await res.text();
    expect(res.ok(), bodyPreview).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────
// Settings / Engine dropdown persistence (UI-centric)
// ───────────────────────────────────────────────────────────────
test.describe('Settings — engine dropdown persistence', () => {
  test('engine dropdown reflects persisted setting on load and after change', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    await goHome(page, baseURL);
    await expect(page.locator('p-select[inputid="dataSource"]')).toBeVisible({ timeout: UI_TIMEOUT });

    const initialLabel = await readSelectLabel(page);
    expect(initialLabel).toContain('SQLite');

    await selectEngine(page, 'Excel');
    expect(await readSelectLabel(page)).toContain('Excel');

    await page.reload();
    await waitForListsReady(page);
    expect(await readSelectLabel(page)).toContain('Excel');

    const res = await request.get(`${API_BASE}/api/web-viewer/settings/engine`);
    const body = await res.json();
    expect((body?.engine ?? '').toLowerCase()).toBe('excel');
  });
});

// ───────────────────────────────────────────────────────────────
// Tool Server ↔ Angular UI — basics (SQLite)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server ↔ Angular UI — basics (SQLite)', () => {
  test('creates a new table via API and UI lists it', async ({ page, request, baseURL }) => {
    const tableName = 'E2E_Play_Table_API_UI';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'SomeDate', type: 'TEXT' },
    ]);

    const navItem = await waitForListItemVisible(page, tableName);
    await navItem.click();
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'SomeDate');
  });

  test('creates a VIEW joining Album + Artist and UI lists it', async ({ page, request, baseURL }) => {
    const viewName = 'E2E_Play_View_Join';

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
        joins: [{ table: 'Artist', on: 'Album.ArtistId = Artist.ArtistId' }],
        orderBy: ['ArtistName ASC', 'AlbumTitle ASC'],
        limit: 5,
      },
    });

    const viewItem = await waitForListItemVisible(page, viewName);
    await viewItem.click();
    await expectHeaderVisible(page, 'AlbumTitle');
    await expectHeaderVisible(page, 'ArtistName');
    await expect(page.locator('p-table table tbody tr').first()).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('adds a column to a fresh E2E table and UI shows the new column', async ({ page, request, baseURL }) => {
    const tableName = 'E2E_Play_Table_Alter';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await createTable(request, tableName, [{ name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true }]);

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await dsl(request, {
      operation: 'Alter',
      target: { name: tableName },
      alter: { actions: [{ addColumn: { name: 'AddedCol', type: 'TEXT' } }] },
    });
    await expectHeaderVisible(page, 'AddedCol');
  });

  test('creates a VIEW using functions (OD_*) and then drops it (UI updates)', async ({ page, request, baseURL }) => {
    const viewName = 'E2E_Play_FuncView_1';

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

    const viewItem = await waitForListItemVisible(page, viewName);
    await viewItem.click();
    await expectHeaderVisible(page, 'LastName_Stripped');
    await expectHeaderVisible(page, 'BirthDate');
    await expectHeaderVisible(page, 'BirthHoliday');

    await dsl(request, { operation: 'Drop', target: { name: viewName }, drop: {} });
    await waitForListItemHidden(page, viewName);
  });

  test('renames a column via DSL and UI reflects the new header', async ({ page, request, baseURL }) => {
    const tableName = 'E2E_Play_Rename';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'OldCol', type: 'TEXT' },
    ]);

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'OldCol');

    await dsl(request, {
      operation: 'Alter',
      target: { name: tableName },
      alter: { actions: [{ renameColumn: { from: 'OldCol', to: 'NewCol' } }] },
    });

    await expectHeaderVisible(page, 'NewCol');

    const oldHeaderRole = page.getByRole('columnheader', { name: 'OldCol' });
    if ((await oldHeaderRole.count()) > 0) {
      await expect(oldHeaderRole).toHaveCount(0, { timeout: UI_TIMEOUT });
    }
  });

  test('creates a VIEW using OD_Wochentag and UI shows German weekday', async ({ page, request, baseURL }) => {
    const viewName = 'E2E_Play_Wochentag';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: { name: viewName },
      select: {
        from: 'Album',
        columns: [{ expr: "OD_Wochentag('2024-12-25')", as: 'Weekday' }],
        limit: 1,
      },
    });

    await waitForListItemVisible(page, viewName).then((i) => i.click());
    await expectHeaderVisible(page, 'Weekday');

    const firstCell = page.locator('p-table table tbody tr >> td').first();
    await expect(firstCell).toHaveText('Mittwoch', { timeout: UI_TIMEOUT });

    await dsl(request, { operation: 'Drop', target: { name: viewName }, drop: {} });
    await waitForListItemHidden(page, viewName);
  });

  test('selecting a table issues a single /tables/<name> request (no duplicates)', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_NoDupReq';
    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    const pathPrefix = `/api/web-viewer/tables/${encodeURIComponent(tableName)}`;
    let started = 0;
    let finished = 0;
    let failed = 0;

    const onReq = (req: any) => { if (req.url().includes(pathPrefix)) started++; };
    const onFinished = (req: any) => { if (req.url().includes(pathPrefix)) finished++; };
    const onFailed = (req: any) => { if (req.url().includes(pathPrefix)) failed++; };

    page.on('request', onReq);
    page.on('requestfinished', onFinished);
    page.on('requestfailed', onFailed);

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');
    await page.waitForTimeout(300);

    expect(started).toBe(1);
    expect(finished).toBe(1);
    expect(failed).toBe(0);

    page.off('request', onReq);
    page.off('requestfinished', onFinished);
    page.off('requestfailed', onFailed);

    await dropObject(request, tableName);
  });
});

// ───────────────────────────────────────────────────────────────
// Sorting (SQLite) + single-request assertions
// ───────────────────────────────────────────────────────────────
test.describe('Sorting — server-side (SQLite)', () => {
  test('sorting sends sortBy/sortDir when clicking headers', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_Sort';
    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');

    const pathBase = `/api/web-viewer/tables/${encodeURIComponent(tableName)}`;

    async function clickHeaderAndExpect(dir: 'asc' | 'desc') {
      const wait = page.waitForResponse(
        (res) => res.url().includes(pathBase) && res.url().includes('sortBy=Name') && res.url().includes(`sortDir=${dir}`),
        { timeout: UI_TIMEOUT }
      );

      let header = page.getByRole('columnheader', { name: 'Name', exact: true });
      if ((await header.count()) === 0) {
        header = page.locator('p-table thead th').filter({ hasText: 'Name' });
      }
      await header.click();

      const resp = await wait;
      expect(resp.ok()).toBeTruthy();
    }

    await clickHeaderAndExpect('asc');
    await clickHeaderAndExpect('desc');

    await dropObject(request, tableName);
  });

  test('sorting issues a single request per click (no duplicates)', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_SortSingle';
    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');

    const pathBase = `/api/web-viewer/tables/${encodeURIComponent(tableName)}`;

    async function expectSingleSortRequest(dir: 'asc' | 'desc') {
      let started = 0;
      let finished = 0;
      let failed = 0;

      const match = (url: string) => url.includes(pathBase) && url.includes('sortBy=Name') && url.includes(`sortDir=${dir}`);

      const onReq = (req: any) => { if (match(req.url())) started++; };
      const onFinished = (req: any) => { if (match(req.url())) finished++; };
      const onFailed = (req: any) => { if (match(req.url())) failed++; };

      page.on('request', onReq);
      page.on('requestfinished', onFinished);
      page.on('requestfailed', onFailed);

      let header = page.getByRole('columnheader', { name: 'Name', exact: true });
      if ((await header.count()) === 0) {
        header = page.locator('p-table thead th').filter({ hasText: 'Name' });
      }

      const wait = page.waitForResponse((res) => match(res.url()), { timeout: UI_TIMEOUT });
      await header.click();
      const resp = await wait;
      expect(resp.ok()).toBeTruthy();

      await page.waitForTimeout(300);
      expect(started).toBe(1);
      expect(finished).toBe(1);
      expect(failed).toBe(0);

      page.off('request', onReq);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
    }

    await expectSingleSortRequest('asc');
    await expectSingleSortRequest('desc');

    await dropObject(request, tableName);
  });
});

// ───────────────────────────────────────────────────────────────
// Column widths persistence (SQLite)
// ───────────────────────────────────────────────────────────────
test.describe('Column widths — persistence (SQLite)', () => {
  test('persist widths; new column cached after first resize', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const t1 = 'E2E_Width_NewCol_A';
    const t2 = 'E2E_Width_NewCol_B';

    for (const name of [t1, t2]) {
      await createTable(request, name, [{ name: 'Id', type: 'INTEGER' }, { name: 'Name', type: 'TEXT' }]);
    }

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await waitForListItemVisible(page, t1).then((i) => i.click());
    await expectHeaderVisible(page, 'Name');

    const headerLocator = async (col: string) => {
      let th = page
        .locator('.p-table-scrollable-header .p-table-scrollable-header-table thead th')
        .filter({ hasText: col })
        .first();
      if ((await th.count()) > 0) return th;

      const byRole = page.getByRole('columnheader', { name: col, exact: true });
      if ((await byRole.count()) > 0) return byRole.first();

      return page.locator('p-table thead th').filter({ hasText: col }).first();
    };

    const getHeaderWidth = async (col: string) => {
      const th = await headerLocator(col);
      await expect(th).toBeVisible({ timeout: UI_TIMEOUT });
      return th.evaluate((el) => Math.round((el as HTMLElement).getBoundingClientRect().width));
    };

    const dragResizer = async (col: string, deltaX: number) => {
      const th = await headerLocator(col);
      const resizer = th.locator('.p-column-resizer, [data-pc-section="columnresizer"]');
      const use = (await resizer.count()) > 0 ? resizer.first() : th;
      const box = await use.boundingBox();
      if (!box) throw new Error('Could not determine resizer bounding box');
      const startX = box.x + (use === th ? box.width - 2 : box.width / 2);
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, startY);
      await page.mouse.up();
    };

    const wNameBefore = await getHeaderWidth('Name');
    await dragResizer('Name', 100);

    await expect.poll(async () => await getHeaderWidth('Name'), { timeout: UI_TIMEOUT }).toBeGreaterThan(wNameBefore + 30);

    const wNameAfter = await getHeaderWidth('Name');

    await waitForListItemVisible(page, t2).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await waitForListItemVisible(page, t1).then((i) => i.click());
    await expectHeaderVisible(page, 'Name');

    await expect
      .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), { timeout: UI_TIMEOUT })
      .toBeLessThanOrEqual(6);

    const newCol = 'AddedCol';
    await dsl(request, {
      operation: 'Alter',
      target: { name: t1 },
      alter: { actions: [{ addColumn: { name: newCol, type: 'TEXT' } }] },
    });

    await expectHeaderVisible(page, newCol);

    await expect
      .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), { timeout: UI_TIMEOUT })
      .toBeLessThanOrEqual(6);

    const wNewDefault = await getHeaderWidth(newCol);
    expect(wNewDefault).toBeGreaterThan(20);

    await dragResizer(newCol, 120);
    await expect.poll(async () => await getHeaderWidth(newCol), { timeout: UI_TIMEOUT }).toBeGreaterThan(wNewDefault + 40);
    const wNewAfter = await getHeaderWidth(newCol);

    await waitForListItemVisible(page, t2).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await waitForListItemVisible(page, t1).then((i) => i.click());
    await expectHeaderVisible(page, newCol);

    await expect
      .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), { timeout: UI_TIMEOUT })
      .toBeLessThanOrEqual(6);

    await expect
      .poll(async () => Math.abs((await getHeaderWidth(newCol)) - wNewAfter), { timeout: UI_TIMEOUT })
      .toBeLessThanOrEqual(6);

    for (const name of [t1, t2]) {
      await dropObject(request, name);
    }
  });
});

// ───────────────────────────────────────────────────────────────
// Misc SQLite UI behaviors
// ───────────────────────────────────────────────────────────────
test.describe('Misc UI (SQLite)', () => {
  test('clearable search: X button appears, clears input, and keeps focus', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');
    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    const input = page.locator('#list-filter-input');
    await expect(input).toBeVisible({ timeout: UI_TIMEOUT });

    const clearBtn = page.getByRole('button', { name: 'Suche löschen' });
    await expect(clearBtn).toHaveCount(0);

    await input.fill('NO_MATCH');
    await expect(clearBtn).toBeVisible({ timeout: UI_TIMEOUT });

    await clearBtn.click();
    await expect(input).toHaveValue('');
    await expect(clearBtn).toHaveCount(0);
    await expect(input).toBeFocused();
  });

  test('left listbox: selection cannot be cleared by clicking the selected item again', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_NoUnselect';
    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    const item = await waitForListItemVisible(page, tableName);
    await item.click();
    await expectHeaderVisible(page, 'Id');

    await item.click(); // attempt to unselect

    await expectHeaderVisible(page, 'Id');

    const li = page.locator('.left-listbox li.p-listbox-option').filter({ hasText: tableName }).first();
    await expect(li).toHaveClass(/p-listbox-option-selected/);

    await li.focus();
    await page.keyboard.press('Enter');
    await expectHeaderVisible(page, 'Id');
    await expect(li).toHaveClass(/p-listbox-option-selected/);

    await dropObject(request, tableName);
  });

  test('SignalR toast de-dupe: exactly one toast for create and one for update', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_Toast_CreateUpdate';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

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

    await waitForListItemVisible(page, tableName);

    const createdToast = page.locator('.p-toast .p-toast-message').filter({ hasText: `"${tableName}" wurde erstellt.` });

    await expect(createdToast.first()).toBeVisible({ timeout: UI_TIMEOUT });
    await page.waitForTimeout(400);
    await expect(createdToast).toHaveCount(1);

    await dsl(request, {
      operation: 'Alter',
      target: { name: tableName },
      alter: { actions: [{ addColumn: { name: 'AddedCol', type: 'TEXT' } }] },
    });

    const updatedToast = page.locator('.p-toast .p-toast-message').filter({ hasText: `"${tableName}" wurde aktualisiert.` });

    await expect(updatedToast.first()).toBeVisible({ timeout: UI_TIMEOUT });
    await page.waitForTimeout(400);
    await expect(updatedToast).toHaveCount(1);

    await dropObject(request, tableName);
  });

  test('SignalR toast de-dupe: exactly one toast for delete', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_Toast_Delete';

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: { name: tableName },
      create: { kind: 'Table', schema: [{ name: 'Id', type: 'INTEGER' }] },
    });

    await waitForListItemVisible(page, tableName);

    await dsl(request, { operation: 'Drop', target: { name: tableName }, drop: {} });
    await waitForListItemHidden(page, tableName);

    const deletedToast = page.locator('.p-toast .p-toast-message').filter({ hasText: `"${tableName}" wurde gelöscht.` });

    await expect(deletedToast.first()).toBeVisible({ timeout: UI_TIMEOUT });
    await page.waitForTimeout(400);
    await expect(deletedToast).toHaveCount(1);
  });

  test('deletes a table via UI (SQLite): confirm dialog, list updates, neutral message shown', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = 'E2E_SQL_DeleteTable_UI';
    await createTable(request, tableName, [
      { name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true },
      { name: 'Name', type: 'TEXT' },
    ]);

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');

    await clickToolbarDelete(page);
    await confirmPrimeDelete(page);

    await waitForListItemHidden(page, tableName);
    await expect(page.getByText('Keine Tabelle oder Sicht ausgewählt.')).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('deletes a view via UI (SQLite): confirm dialog, list updates, neutral message shown', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const viewName = 'E2E_SQL_DeleteView_UI';
    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: { name: viewName },
      select: {
        from: 'Album',
        columns: [{ expr: 'AlbumId', as: 'AlbumId' }],
        limit: 1,
      },
    });

    await waitForListItemVisible(page, viewName).then((i) => i.click());
    await expectHeaderVisible(page, 'AlbumId');

    await clickToolbarDelete(page);
    await confirmPrimeDelete(page);

    await waitForListItemHidden(page, viewName);
    await expect(page.getByText('Keine Tabelle oder Sicht ausgewählt.')).toBeVisible({ timeout: UI_TIMEOUT });
  });
});
