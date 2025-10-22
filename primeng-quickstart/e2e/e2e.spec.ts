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

/** Helpers for group headers in the left listbox */
function groupHeader(page: Page, name: string) {
  return page.locator('.left-listbox li.p-listbox-option-group').filter({hasText: name});
}

async function expectGroupHeaderVisible(page: Page, name: string) {
  const g = groupHeader(page, name);
  await expect(g).toHaveCount(1, {timeout: UI_TIMEOUT});
  await expect(g.first()).toBeVisible({timeout: UI_TIMEOUT});
}

async function expectGroupHeaderHidden(page: Page, name: string) {
  const g = groupHeader(page, name);
  await expect(g).toHaveCount(0, {timeout: UI_TIMEOUT});
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
// Tool Server ↔ Angular UI — basics (SQLite)
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

  // ───────────────────────────────────────────────────────────────
  // NEW: Selecting a table triggers exactly one data request
  // ───────────────────────────────────────────────────────────────
  test('selecting a table issues a single /tables/<name> request (no duplicates)', async ({page, request, baseURL}) => {
    await putEngine(request, 'sqlite');

    const tableName = `E2E_NoDupReq_${Date.now()}`;
    // Create a tiny table so there is something to select (no rows needed)
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

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    // Counters for network activity for the selected table
    const pathPrefix = `/api/web-viewer/tables/${encodeURIComponent(tableName)}`;
    let started = 0;
    let finished = 0;
    let failed = 0;

    const onReq = (req: any) => {
      if (req.url().includes(pathPrefix)) started++;
    };
    const onFinished = (req: any) => {
      if (req.url().includes(pathPrefix)) finished++;
    };
    const onFailed = (req: any) => {
      if (req.url().includes(pathPrefix)) failed++;
    };

    page.on('request', onReq);
    page.on('requestfinished', onFinished);
    page.on('requestfailed', onFailed);

    // Select the table → should trigger exactly ONE lazy load
    await waitForListItemVisible(page, tableName).then((i) => i.click());

    // Wait until table headers are visible (row presence not required)
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');

    // Give a short buffer to catch any trailing duplicate emissions
    await page.waitForTimeout(300);

    // Assert: exactly one request, finished successfully, none failed
    expect(started).toBe(1);
    expect(finished).toBe(1);
    expect(failed).toBe(0);

    // Cleanup listeners and the table
    page.off('request', onReq);
    page.off('requestfinished', onFinished);
    page.off('requestfailed', onFailed);

    await dsl(request, {operation: 'Drop', target: {name: tableName}, drop: {}});
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
        alter: {actions: [{renameColumn: {from: 'OldCol', to: 'NewCol'}}]}
      },
    );

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

// ───────────────────────────────────────────────────────────────
// Visibility of "Sichten" group (regression tests)
// ───────────────────────────────────────────────────────────────
test.describe('Left listbox groups — "Sichten" hidden for Excel', () => {
  test.describe.configure({mode: 'serial'});

  test('initial load with persisted Excel hides "Sichten"', async ({page, request, baseURL}) => {
    await putEngine(request, 'excel');       // Persist Excel BEFORE visiting the app
    await goHome(page, baseURL);             // Initial load

    // Ensure "Sichten" group header does not exist
    await expectGroupHeaderHidden(page, 'SICHTEN');
    // And "Tabellen" is still there
    await expectGroupHeaderVisible(page, 'TABELLEN');
  });

  test('switching engines toggles "Sichten" visibility', async ({page, request, baseURL}) => {
    await putEngine(request, 'sqlite');      // Start from SQLite
    await goHome(page, baseURL);

    // On SQLite we expect the group to exist
    await expectGroupHeaderVisible(page, 'SICHTEN');

    // Switch to Excel -> "Sichten" should disappear
    await selectEngine(page, 'Excel');
    await expectGroupHeaderHidden(page, 'SICHTEN');
    await expectGroupHeaderVisible(page, 'TABELLEN');

    // Switch back to SQLite -> "Sichten" should re-appear
    await selectEngine(page, 'SQLite');
    await expectGroupHeaderVisible(page, 'SICHTEN');
  });

  test.describe('Engine switch clears selection and prevents stale table requests', () => {
    test('no request for previously selected table after switching engine', async ({page, request, baseURL}) => {
      // Ensure Excel is the current engine and create a sheet
      await putEngine(request, 'excel');
      const sheetName = `E2E_XL_Stale_${Date.now()}`;
      await dsl(request, {
        operation: 'Create',
        target: {name: sheetName},
        create: {kind: 'Table', schema: [{name: 'Id', type: 'INTEGER'}]},
      });

      await goHome(page, baseURL);
      await selectEngine(page, 'Excel');

      // Select the sheet so it's definitely "active"
      await waitForListItemVisible(page, sheetName).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');

      // Watch for any stale request referencing the Excel sheet after switching
      let sawStaleRequest = false;
      const stalePath = `/api/web-viewer/tables/${encodeURIComponent(sheetName)}`;
      page.on('request', (req) => {
        if (req.url().includes(stalePath)) {
          sawStaleRequest = true;
        }
      });

      // Switch to SQLite
      await selectEngine(page, 'SQLite');

      // Give the UI a brief moment where lazy loaders might fire; then assert none hit the stale endpoint
      await page.waitForTimeout(500);
      expect(sawStaleRequest).toBeFalsy();

      // Cleanup the created sheet
      await putEngine(request, 'excel');
      await dsl(request, {operation: 'Drop', target: {name: sheetName}, drop: {}});
    });
  });

  test('disabled placeholder keeps neutral bg even if "selected" class is present', async ({ page, request, baseURL }) => {
    // Use SQLite so both groups exist and filtering yields placeholders for each
    await putEngine(request, 'sqlite');
    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    // Type a nonsense filter that matches nothing to show "Keine Ergebnisse gefunden." placeholders
    const search = page.getByPlaceholder('Suchen…');
    await search.fill(`NO_MATCH_${Date.now()}`);

    // Grab the first placeholder option (disabled)
    const placeholder = page
      .locator('.left-listbox')
      .locator('li.p-listbox-option.p-disabled', { hasText: 'Keine Ergebnisse gefunden.' })
      .first();

    await expect(placeholder).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(placeholder).toHaveClass(/p-disabled/);

    // Forcefully add "selected" class to simulate accidental selection
    await placeholder.evaluate((el) => (el as HTMLElement).classList.add('p-listbox-option-selected'));

    // Read computed background and its alpha; disabled placeholder should remain near-transparent
    const { bg, alpha } = await placeholder.evaluate((el) => {
      const c = getComputedStyle(el as HTMLElement).backgroundColor || '';
      const transparent = { bg: c || 'transparent', alpha: 0 };
      if (!c || c === 'transparent') return transparent;

      const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
      if (!m) return { bg: c, alpha: 1 };
      return { bg: c, alpha: m[4] ? parseFloat(m[4]) : 1 };
    });

    // Allow a tiny theme overlay but ensure it is NOT a solid "selected" background
    expect(alpha).toBeLessThanOrEqual(0.12); // ~<=12% opacity is considered neutral

    // Cleanup the filter
    await search.fill('');
  });

  test('sorting sends sortBy/sortDir when clicking headers (server-side sorting)', async ({page, request, baseURL}) => {
    await putEngine(request, 'sqlite');

    const tableName = `E2E_Sort_${Date.now()}`;
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

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    await waitForListItemVisible(page, tableName).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');
    await expectHeaderVisible(page, 'Name');

    const pathBase = `/api/web-viewer/tables/${encodeURIComponent(tableName)}`;

    // Click "Name" header and expect a request with the given sortDir
    async function clickHeaderAndExpect(dir: 'asc' | 'desc') {
      const wait = page.waitForResponse(
        (res) =>
          res.url().includes(pathBase) &&
          res.url().includes('sortBy=Name') &&
          res.url().includes(`sortDir=${dir}`),
        {timeout: UI_TIMEOUT}
      );

      let header = page.getByRole('columnheader', {name: 'Name', exact: true});
      if ((await header.count()) === 0) {
        header = page.locator('p-table thead th').filter({hasText: 'Name'});
      }
      await header.click();

      const resp = await wait;
      expect(resp.ok()).toBeTruthy();
    }

    // First click -> asc, second click -> desc
    await clickHeaderAndExpect('asc');
    await clickHeaderAndExpect('desc');

    await dsl(request, {operation: 'Drop', target: {name: tableName}, drop: {}});
  });

  test('column widths persist; new column gets cached after first resize', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const t1 = `E2E_Width_NewCol_A_${Date.now()}`;
    const t2 = `E2E_Width_NewCol_B_${Date.now()}`;

    // Create two small tables
    for (const name of [t1, t2]) {
      await dsl(request, {
        operation: 'Create',
        target: { name },
        create: { kind: 'Table', schema: [{ name: 'Id', type: 'INTEGER' }, { name: 'Name', type: 'TEXT' }] },
      });
    }

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    // Open table 1
    await waitForListItemVisible(page, t1).then((i) => i.click());
    await expectHeaderVisible(page, 'Name');

    // Helpers
    const headerLocator = async (col: string) => {
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

    // Resize "Name" once and verify it sticks after switching away/back
    const wNameBefore = await getHeaderWidth('Name');
    await dragResizer('Name', 100);
    await page.waitForTimeout(50);
    const wNameAfter = await getHeaderWidth('Name');
    expect(wNameAfter).toBeGreaterThan(wNameBefore + 30);

    await waitForListItemVisible(page, t2).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await waitForListItemVisible(page, t1).then((i) => i.click());
    await expectHeaderVisible(page, 'Name');

    const wNameBack = await getHeaderWidth('Name');
    expect(Math.abs(wNameBack - wNameAfter)).toBeLessThanOrEqual(6);

    // ── Extra step: add a new column, ensure old widths stay, then cache new column after first resize ──
    const newCol = 'AddedCol';
    await dsl(request, {
      operation: 'Alter',
      target: { name: t1 },
      alter: { actions: [{ addColumn: { name: newCol, type: 'TEXT' } }] },
    });

    await expectHeaderVisible(page, newCol);

    // Old column ("Name") should retain width
    const wNamePostAdd = await getHeaderWidth('Name');
    expect(Math.abs(wNamePostAdd - wNameAfter)).toBeLessThanOrEqual(6);

    // New column starts with some auto width (>0)
    const wNewDefault = await getHeaderWidth(newCol);
    expect(wNewDefault).toBeGreaterThan(20);

    // Resize new column and ensure width increases and is cached
    await dragResizer(newCol, 120);
    await page.waitForTimeout(50);
    const wNewAfter = await getHeaderWidth(newCol);
    expect(wNewAfter).toBeGreaterThan(wNewDefault + 40);

    // Switch away and back → both "Name" and the *new* column should keep widths
    await waitForListItemVisible(page, t2).then((i) => i.click());
    await expectHeaderVisible(page, 'Id');

    await waitForListItemVisible(page, t1).then((i) => i.click());
    await expectHeaderVisible(page, newCol);

    const wNameFinal = await getHeaderWidth('Name');
    const wNewFinal = await getHeaderWidth(newCol);

    expect(Math.abs(wNameFinal - wNameAfter)).toBeLessThanOrEqual(6);
    expect(Math.abs(wNewFinal - wNewAfter)).toBeLessThanOrEqual(6);

    // Cleanup
    for (const name of [t1, t2]) {
      await dsl(request, { operation: 'Drop', target: { name }, drop: {} });
    }
  });

  test('clearable search: X button appears, clears input, and keeps focus', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');
    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    const input = page.locator('#list-filter-input');
    await expect(input).toBeVisible({ timeout: UI_TIMEOUT });

    // Clear button should not be in the DOM when empty
    const clearBtn = page.getByRole('button', { name: 'Suche löschen' });
    await expect(clearBtn).toHaveCount(0);

    // Type something -> clear button appears
    await input.fill(`NO_MATCH_${Date.now()}`);
    await expect(clearBtn).toBeVisible({ timeout: UI_TIMEOUT });

    // Click clear -> input empty, button disappears, focus stays on input
    await clearBtn.click();
    await expect(input).toHaveValue('');
    await expect(clearBtn).toHaveCount(0);
    await expect(input).toBeFocused();
  });

  test('left listbox: selection cannot be cleared by clicking the selected item again', async ({ page, request, baseURL }) => {
    await putEngine(request, 'sqlite');

    const tableName = `E2E_NoUnselect_${Date.now()}`;
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

    await goHome(page, baseURL);
    await selectEngine(page, 'SQLite');

    // Select it once → table headers should appear
    const item = await waitForListItemVisible(page, tableName);
    await item.click();
    await expectHeaderVisible(page, 'Id');

    // Try to unselect by clicking the same item again
    await item.click();

    // Still selected: headers remain visible
    await expectHeaderVisible(page, 'Id');

    // And the list option should still carry the "selected" class
    const li = page
      .locator('.left-listbox li.p-listbox-option')
      .filter({ hasText: tableName })
      .first();
    await expect(li).toHaveClass(/p-listbox-option-selected/);

    // Optional: attempt unselect via keyboard and assert it also sticks
    await li.focus();
    await page.keyboard.press('Enter');
    await expectHeaderVisible(page, 'Id');
    await expect(li).toHaveClass(/p-listbox-option-selected/);

    // Cleanup
    await dsl(request, { operation: 'Drop', target: { name: tableName }, drop: {} });
  });

});
