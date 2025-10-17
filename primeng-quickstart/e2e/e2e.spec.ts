// e2e/e2e.spec.ts
import {APIRequestContext, expect, Locator, Page, test} from '@playwright/test';

const API_BASE = process.env['API_BASE'] ?? 'http://localhost:4713';
const UI_TIMEOUT = 5_000;

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
async function dsl(request: APIRequestContext, body: unknown) {
  const res = await request.post(`${API_BASE}/api/tool-server/sql/query`, {data: body});
  const txt = await res.text();
  expect(res.ok(), txt).toBeTruthy();
}

async function putEngine(request: APIRequestContext, engine: 'sqlite' | 'excel') {
  const res = await request.put(`${API_BASE}/api/web-viewer/settings/engine`, {data: {engine}});
  const txt = await res.text();
  expect(res.ok(), txt).toBeTruthy();
  const body = JSON.parse(txt);
  expect((body?.engine ?? '').toLowerCase()).toBe(engine);
}

/** Wait until PrimeNG listbox shows at least one group and one item/placeholder */
async function waitForListsReady(page: Page) {
  const listbox = page.locator('.left-listbox');
  await expect(listbox).toBeVisible({timeout: UI_TIMEOUT});

  // At least one group header (PrimeNG uses li.p-listbox-option-group)
  await expect(listbox.locator('li.p-listbox-option-group').first()).toBeVisible({timeout: UI_TIMEOUT});

  // At least one option (or placeholder)
  const anyItem = listbox.locator('li.p-listbox-option').first();
  await expect(anyItem).toBeVisible({timeout: UI_TIMEOUT});
}

/** Navigate home and wait until the left listbox is ready */
async function goHome(page: Page, baseURL?: string) {
  await page.goto(baseURL ?? '/');
  await waitForListsReady(page);
}

/** Try multiple ways to open the PrimeNG Select overlay */
async function openSelectOverlay(selectRoot: Locator) {
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
async function readSelectLabel(page: Page): Promise<string> {
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
async function selectEngine(page: Page, engine: 'SQLite' | 'Excel') {
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
async function expectHeaderVisible(page: Page, name: string) {
  const byRole = page.getByRole('columnheader', {name, exact: true});
  if ((await byRole.count()) > 0) {
    await expect(byRole).toBeVisible({timeout: UI_TIMEOUT});
  } else {
    await expect(page.locator(`p-table thead th:has-text("${name}")`)).toBeVisible({timeout: UI_TIMEOUT});
  }
}

/** Wait until a specific list item appears (SignalR-driven for both engines) */
async function waitForListItemVisible(page: Page, text: string): Promise<Locator> {
  const item = page.locator('.left-listbox').getByText(text, {exact: true});
  await expect(item).toBeVisible({timeout: UI_TIMEOUT});
  return item;
}

/** Wait until a specific list item disappears (SignalR-driven for both engines) */
async function waitForListItemHidden(page: Page, text: string): Promise<void> {
  const item = page.locator('.left-listbox').getByText(text, {exact: true});
  await expect(item).toBeHidden({timeout: UI_TIMEOUT});
}

test.describe.configure({mode: 'serial'});

// ───────────────────────────────────────────────────────────────
// API-only: tables & columns (no UI interaction)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server API — tables & columns (no UI)', () => {
  test.describe.configure({mode: 'serial'});

  test('sqlite: GET /tables and POST /columns return data', async ({request}) => {
    await putEngine(request, 'sqlite');

    const tableName = `E2E_API_SQLITE_${Date.now()}`;
    await dsl(request, {
      operation: 'Create',
      target: {name: tableName},
      create: {
        kind: 'Table',
        schema: [
          {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
          {name: 'Name', type: 'TEXT'},
        ],
      },
    });

    const tablesRes = await request.get(`${API_BASE}/api/tool-server/sql/tables`);
    expect(tablesRes.ok(), await tablesRes.text()).toBeTruthy();
    const tables = await tablesRes.json();
    expect(Array.isArray(tables)).toBeTruthy();
    expect(tables).toContain(tableName);

    const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, {data: {tableName}});
    expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
    const columns = await colsRes.json();
    expect(Array.isArray(columns)).toBeTruthy();
    expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));

    await dsl(request, {operation: 'Drop', target: {name: tableName}, drop: {}});
  });

  test('engine dropdown reflects persisted setting on load and after change', async ({page, request, baseURL}) => {
    await putEngine(request, 'sqlite');

    await goHome(page, baseURL);
    await expect(page.locator('p-select[inputid="dataSource"]')).toBeVisible({timeout: UI_TIMEOUT});

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

  test('excel: GET /tables and POST /columns return data', async ({request}) => {
    await putEngine(request, 'excel');

    const sheetName = `E2E_API_XL_${Date.now()}`;
    await dsl(request, {
      operation: 'Create',
      target: {name: sheetName},
      create: {
        kind: 'Table',
        schema: [
          {name: 'Id', type: 'INTEGER'},
          {name: 'Name', type: 'TEXT'},
        ],
      },
    });

    const tablesRes = await request.get(`${API_BASE}/api/tool-server/sql/tables`);
    expect(tablesRes.ok(), await tablesRes.text()).toBeTruthy();
    const tables = await tablesRes.json();
    expect(Array.isArray(tables)).toBeTruthy();
    expect(tables).toContain(sheetName);

    const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, {data: {tableName: sheetName}});
    expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
    const columns = await colsRes.json();
    expect(Array.isArray(columns)).toBeTruthy();
    expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));

    await dsl(request, {operation: 'Drop', target: {name: sheetName}, drop: {}});
  });
});

// ───────────────────────────────────────────────────────────────
// SQLite suite (SignalR-driven)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server ↔ Angular UI — basics (SQLite)', () => {
  test.describe.configure({mode: 'serial'});

  test('creates a new table via API and UI lists it', async ({page, request, baseURL}) => {
    const tableName = `E2E_Playwright_Table_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: {name: tableName},
      create: {
        kind: 'Table',
        schema: [
          {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
          {name: 'SomeDate', type: 'TEXT'},
        ],
      },
    });

    const navItem = await waitForListItemVisible(page, tableName);
    await navItem.click(); // ok even if auto-selected
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'SomeDate');
  });

  test('creates a VIEW joining Album + Artist and UI lists it', async ({page, request, baseURL}) => {
    const viewName = `E2E_Playwright_View_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: {name: viewName},
      select: {
        from: 'Album',
        columns: [
          {expr: 'Album.Title', as: 'AlbumTitle'},
          {expr: 'Artist.Name', as: 'ArtistName'},
        ],
        joins: [{table: 'Artist', on: 'Album.ArtistId = Artist.ArtistId'}],
        orderBy: ['ArtistName ASC', 'AlbumTitle ASC'],
        limit: 5,
      },
    });

    const viewItem = await waitForListItemVisible(page, viewName);
    await viewItem.click();
    await expectHeaderVisible(page, 'AlbumTitle');
    await expectHeaderVisible(page, 'ArtistName');
    await expect(page.locator('p-table table tbody tr').first()).toBeVisible({timeout: UI_TIMEOUT});
  });

  test('adds a column to a fresh E2E table and UI shows the new column', async ({page, request, baseURL}) => {
    const tableName = `E2E_Playwright_Table_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: {name: tableName},
      create: {kind: 'Table', schema: [{name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true}]},
    });

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await dsl(request, {
      operation: 'Alter',
      target: {name: tableName},
      alter: {actions: [{addColumn: {name: 'AddedCol', type: 'TEXT'}}]},
    });

    await expectHeaderVisible(page, 'AddedCol');
  });

  test('creates a VIEW using functions (OD_*) and then drops it (UI updates)', async ({page, request, baseURL}) => {
    const viewName = `E2E_Playwright_FuncView_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: {name: viewName},
      select: {
        from: 'Employee',
        columns: [
          {expr: 'OD_Stripe(LastName)', as: 'LastName_Stripped'},
          {expr: 'BirthDate', as: 'BirthDate'},
          {expr: 'OD_Feiertag(BirthDate)', as: 'BirthHoliday'},
        ],
        limit: 3,
      },
    });

    const viewItem = await waitForListItemVisible(page, viewName);
    await viewItem.click();
    await expectHeaderVisible(page, 'LastName_Stripped');
    await expectHeaderVisible(page, 'BirthDate');
    await expectHeaderVisible(page, 'BirthHoliday');

    await dsl(request, {operation: 'Drop', target: {name: viewName}, drop: {}});
    await waitForListItemHidden(page, viewName);
  });

  test('renames a column via DSL and UI reflects the new header', async ({page, request, baseURL}) => {
    const tableName = `E2E_Playwright_Rename_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Create',
      target: {name: tableName},
      create: {
        kind: 'Table',
        schema: [
          {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
          {name: 'OldCol', type: 'TEXT'},
        ],
      },
    });

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'OldCol');

    await dsl(request, {
      operation: 'Alter',
      target: {name: tableName},
      alter: {actions: [{renameColumn: {from: 'OldCol', to: 'NewCol'}}]},
    });

    await expectHeaderVisible(page, 'NewCol');

    const oldHeaderRole = page.getByRole('columnheader', {name: 'OldCol'});
    if ((await oldHeaderRole.count()) > 0) {
      await expect(oldHeaderRole).toHaveCount(0, {timeout: UI_TIMEOUT});
    }
  });

  test('creates a VIEW using OD_Wochentag and UI shows German weekday', async ({page, request, baseURL}) => {
    const viewName = `E2E_Playwright_Wochentag_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await dsl(request, {
      operation: 'Select',
      target: {name: viewName},
      select: {
        from: 'Album',
        columns: [{expr: "OD_Wochentag('2024-12-25')", as: 'Weekday'}],
        limit: 1,
      },
    });

    await waitForListItemVisible(page, viewName).then((i) => i.click());
    await expectHeaderVisible(page, 'Weekday');

    const firstCell = page.locator('p-table table tbody tr >> td').first();
    await expect(firstCell).toHaveText('Mittwoch', {timeout: UI_TIMEOUT});

    await dsl(request, {operation: 'Drop', target: {name: viewName}, drop: {}});
    await waitForListItemHidden(page, viewName);
  });
});

// ───────────────────────────────────────────────────────────────
// Excel suite (now SignalR-driven as well)
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server ↔ Angular UI — Excel', () => {
  test.describe.configure({mode: 'serial'});

  test('creates a new sheet via API and UI lists it (Excel)', async ({page, request, baseURL}) => {
    const sheetName = `E2E_XL_Sheet_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: {name: sheetName},
      create: {
        kind: 'Table',
        schema: [
          {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
          {name: 'Name', type: 'TEXT'},
        ],
      },
    });

    const navItem = await waitForListItemVisible(page, sheetName);
    await navItem.click();
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');
  });

  test('adds a column on an Excel sheet and UI shows the new column', async ({page, request, baseURL}) => {
    const sheetName = `E2E_XL_AddCol_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: {name: sheetName},
      create: {kind: 'Table', schema: [{name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true}]},
    });

    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await dsl(request, {
      operation: 'Alter',
      target: {name: sheetName},
      alter: {actions: [{addColumn: {name: 'AddedCol', type: 'TEXT'}}]},
    });

    await expectHeaderVisible(page, 'AddedCol');
  });

  test('renames a column on an Excel sheet and UI reflects it', async ({page, request, baseURL}) => {
    const sheetName = `E2E_XL_Rename_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: {name: sheetName},
      create: {
        kind: 'Table',
        schema: [
          {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
          {name: 'OldCol', type: 'TEXT'},
        ],
      },
    });

    // Open it once to load
    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'OldCol');

    // Optional: navigate away to avoid any file locks depending on backend impl
    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Alter',
      target: {name: sheetName},
      alter: {actions: [{renameColumn: {from: 'OldCol', to: 'NewCol'}}]},
    });

    await waitForListItemVisible(page, sheetName).then((i) => i.click());
    await expectHeaderVisible(page, 'NewCol');

    const oldHeaderRole = page.getByRole('columnheader', {name: 'OldCol'});
    if ((await oldHeaderRole.count()) > 0) {
      await expect(oldHeaderRole).toHaveCount(0, {timeout: UI_TIMEOUT});
    }
  });

  test('drops an Excel sheet and UI removes it', async ({page, request, baseURL}) => {
    const sheetName = `E2E_XL_Drop_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'Excel');

    await dsl(request, {
      operation: 'Create',
      target: {name: sheetName},
      create: {kind: 'Table', schema: [{name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true}]},
    });

    await waitForListItemVisible(page, sheetName);

    await dsl(request, {operation: 'Drop', target: {name: sheetName}, drop: {}});

    await waitForListItemHidden(page, sheetName);
  });

  // This one still uses SQLite (functions) but benefits from SignalR waits
  test('creates a VIEW using functions (OD_*) and then drops it (UI updates)', async ({page, request, baseURL}) => {
    const viewName = `E2E_Playwright_FuncView_${Date.now()}`;

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite'); // functions exist on SQLite side

    await dsl(request, {
      operation: 'Select',
      target: {name: viewName},
      select: {
        from: 'Employee',
        columns: [
          {expr: 'OD_Stripe(LastName)', as: 'LastName_Stripped'},
          {expr: 'BirthDate', as: 'BirthDate'},
          {expr: 'OD_Feiertag(BirthDate)', as: 'BirthHoliday'},
        ],
        limit: 3,
      },
    });

    const viewItem = await waitForListItemVisible(page, viewName);
    await viewItem.click();
    await expectHeaderVisible(page, 'LastName_Stripped');
    await expectHeaderVisible(page, 'BirthDate');
    await expectHeaderVisible(page, 'BirthHoliday');

    await dsl(request, {operation: 'Drop', target: {name: viewName}, drop: {}});
    await waitForListItemHidden(page, viewName);
  });
});
