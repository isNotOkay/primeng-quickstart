// e2e/engines.spec.ts
import {expect, type Locator, test} from '@playwright/test';
import {
  API_BASE,
  clickToolbarDelete,
  confirmPrimeDelete,
  createRequestTracker,
  createTable,
  dsl,
  expectGroupHeaderHidden,
  expectGroupHeaderVisible,
  expectHeaderVisible,
  getHeaderLocator,
  getPaginatorControls,
  goHome,
  isPaginatorDisabled,
  parseNumericCellValue,
  putEngine,
  selectEngine,
  UI_TIMEOUT,
  waitForListItemHidden,
  waitForListItemVisible,
  waitForTableData,
} from '../test.util';

test.describe.configure({mode: 'serial'}); // run everything in this file sequentially

type EngineKey = 'sqlite' | 'excel';
type EngineLabel = 'SQLite' | 'Excel';

interface EngineCfg {
  key: EngineKey;               // for putEngine
  label: EngineLabel;           // for UI select
  supportsViews: boolean;
  neutralDeleteMessage: string; // right-panel text after UI delete
}

/** Register the full suite of tests that should run for a given engine. */
function registerCommonTestsForEngine(cfg: EngineCfg) {
  test.describe(`${cfg.label} suite`, () => {
    test.describe.configure({mode: 'serial'});

    // ───────────────────────────────────────────────────────────────
    // API-only smoke: /tables & /columns   (retry-safe table name)
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: GET /tables and POST /columns return data`, async ({request}, testInfo) => {
      await putEngine(request, cfg.key);

      // Make name unique so retries don't collide with an existing table
      const suffix = `${Date.now()}-${testInfo.retry}-${testInfo.repeatEachIndex}`;
      const objName = `E2E_API_${cfg.label}_${suffix}`;

      await dsl(request, {
        operation: 'Create',
        target: {name: objName},
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
      expect(tables).toContain(objName);

      const colsRes = await request.post(`${API_BASE}/api/tool-server/sql/columns`, {data: {tableName: objName}});
      expect(colsRes.ok(), await colsRes.text()).toBeTruthy();
      const columns = await colsRes.json();
      expect(Array.isArray(columns)).toBeTruthy();
      expect(columns).toEqual(expect.arrayContaining(['Id', 'Name']));
    });

    // ───────────────────────────────────────────────────────────────
    // API-only smoke: download endpoint
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: download endpoint returns 200 OK`, async ({request}, testInfo) => {
      await putEngine(request, cfg.key);

      // Unique name so retries won't collide with an existing table
      const suffix = `${Date.now()}-${testInfo.retry}-${testInfo.repeatEachIndex}`;
      const objName = `E2E_DL_${cfg.label}_${suffix}`;
      await createTable(request, objName, [{name: 'Id', type: 'INTEGER'}]);

      const engineParam = cfg.label === 'SQLite' ? 'Sqlite' : 'Excel';
      const res = await request.get(`${API_BASE}/api/web-viewer/download?engine=${engineParam}`);
      const bodyPreview = await res.text(); // easier debugging on failure
      expect(res.ok(), bodyPreview).toBeTruthy();
    });


    // ───────────────────────────────────────────────────────────────
    // UI — create table/sheet and show in list
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: create a new table/sheet via API and UI lists it`, async ({
                                                                                    page,
                                                                                    request,
                                                                                    baseURL
                                                                                  }, testInfo) => {
      await putEngine(request, cfg.key);

      // Excel sheet names must be <= 31 chars and avoid certain symbols.
      const MAX_NAME = 31;
      const base = `E2E_UI_Create_${cfg.label}`; // descriptive prefix
      const unique = `${Date.now().toString(36)}${testInfo.retry}${testInfo.repeatEachIndex}`; // compact, retry-safe
      let name = `${base}_${unique}`;

      // Trim base if needed so total length never exceeds 31
      if (name.length > MAX_NAME) {
        const availForBase = MAX_NAME - (unique.length + 1); // +1 for underscore
        // Keep at least 1 char of the base
        const safeBase = base.slice(0, Math.max(1, availForBase));
        name = `${safeBase}_${unique}`;
      }

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      await createTable(request, name, [
        {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
        {name: 'Name', type: 'TEXT'},
      ]);

      const navItem = await waitForListItemVisible(page, name);
      await navItem.click();
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');
    });


    // ───────────────────────────────────────────────────────────────
    // UI — add column
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: add a column and UI shows it`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);
      const name = `E2E_UI_AddCol_${cfg.label}`;

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      await createTable(request, name, [{name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true}]);

      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');

      await dsl(request, {
        operation: 'Alter',
        target: {name},
        alter: {actions: [{addColumn: {name: 'AddedCol', type: 'TEXT'}}]},
      });
      await expectHeaderVisible(page, 'AddedCol');
    });

    // ───────────────────────────────────────────────────────────────
    // UI — rename column
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: rename a column and UI reflects it`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);
      const name = `E2E_UI_Rename_${cfg.label}`;

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      await createTable(request, name, [
        {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
        {name: 'OldCol', type: 'TEXT'},
      ]);

      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'OldCol');

      await dsl(request, {
        operation: 'Alter',
        target: {name},
        alter: {actions: [{renameColumn: {from: 'OldCol', to: 'NewCol'}}]},
      });

      await expectHeaderVisible(page, 'NewCol');

      const oldHeaderRole = page.getByRole('columnheader', {name: 'OldCol'});
      if ((await oldHeaderRole.count()) > 0) {
        await expect(oldHeaderRole).toHaveCount(0, {timeout: UI_TIMEOUT});
      }
    });

    // ───────────────────────────────────────────────────────────────
    // UI — selecting a table issues a single request (no duplicates)
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: selecting a table issues a single /tables/<name> request`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);

      const name = `E2E_NoDupReq_${cfg.label}`;
      await createTable(request, name, [
        {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
        {name: 'Name', type: 'TEXT'},
      ]);

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      const pathPrefix = `/api/web-viewer/tables/${encodeURIComponent(name)}`;
      const tracker = createRequestTracker(page, (url) => url.includes(pathPrefix));
      tracker.start();

      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');

      await page.waitForTimeout(2000);
      expect(tracker.started).toBe(1);
      expect(tracker.finished).toBe(1);
      expect(tracker.failed).toBe(0);

      tracker.stop();
    });

    // ───────────────────────────────────────────────────────────────
    // UI — sorting (server-side)
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: sorting sends sortBy/sortDir and issues one request per click`, async ({
                                                                                                 page, request, baseURL
                                                                                               }) => {
      await putEngine(request, cfg.key);

      const name = `E2E_Sort_${cfg.label}`;
      await createTable(request, name, [
        {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
        {name: 'Name', type: 'TEXT'},
      ]);

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');

      const pathBase = `/api/web-viewer/tables/${encodeURIComponent(name)}`;

      async function expectSingleSortRequest(dir: 'asc' | 'desc') {
        const match = (url: string) => url.includes(pathBase) && url.includes('sortBy=Name') && url.includes(`sortDir=${dir}`);
        const tracker = createRequestTracker(page, match);
        tracker.start();

        const header = await getHeaderLocator(page, 'Name');
        const waitResp = page.waitForResponse((res) => match(res.url()), {timeout: UI_TIMEOUT});
        await header.click();
        const resp = await waitResp;
        expect(resp.ok()).toBeTruthy();

        await page.waitForTimeout(300);
        expect(tracker.started).toBe(1);
        expect(tracker.finished).toBe(1);
        expect(tracker.failed).toBe(0);

        tracker.stop();
      }

      await expectSingleSortRequest('asc');
      await expectSingleSortRequest('desc');
    });

    // ───────────────────────────────────────────────────────────────
    // UI — column widths persistence, incl. newly added column
    // ───────────────────────────────────────────────────────────────
    test.skip(`${cfg.label}: column widths persist; new column gets cached after first resize`, async ({
                                                                                                         page,
                                                                                                         request,
                                                                                                         baseURL
                                                                                                       }) => {
      await putEngine(request, cfg.key);

      const t1 = `E2E_Width_${cfg.label}_A`;
      const t2 = `E2E_Width_${cfg.label}_B`;
      for (const n of [t1, t2]) {
        await createTable(request, n, [{name: 'Id', type: 'INTEGER'}, {name: 'Name', type: 'TEXT'}]);
      }

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      await waitForListItemVisible(page, t1).then((i) => i.click());
      await expectHeaderVisible(page, 'Name');

      // ---- Helpers (scoped to this test) ----
      const getHeaderWidth = async (col: string) => {
        const th = await getHeaderLocator(page, col);
        await expect(th).toBeVisible({timeout: UI_TIMEOUT});
        return th.evaluate((el) => Math.round((el as HTMLElement).getBoundingClientRect().width));
      };

      const resizeAndAssertGain = async (col: string, deltaX: number, minGain: number) => {
        const th = await getHeaderLocator(page, col);
        const before = await getHeaderWidth(col);

        // Try handle first; fall back to dragging from header edge.
        const handle = th.locator('.p-column-resizer, [data-pc-section="columnresizer"]').first();
        const use = (await handle.count()) > 0 ? handle : th;

        const box = await use.boundingBox();
        if (!box) throw new Error('Could not determine resizer bounding box');

        const startX = box.x + (use === th ? Math.max(box.width - 2, 1) : box.width / 2);
        const startY = box.y + box.height / 2;

        // Engage then drag
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + Math.sign(deltaX) * 8, startY);
        await page.mouse.move(startX + deltaX, startY, {steps: 12});
        await page.mouse.up();

        // If gain too small, retry from the header right edge with extra distance
        let after = await getHeaderWidth(col);
        if (after < before + minGain) {
          const thBox = await th.boundingBox();
          if (!thBox) throw new Error('Could not determine header bounding box');
          const sx = thBox.x + thBox.width - 1;
          const sy = thBox.y + thBox.height / 2;
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(sx + deltaX + 60, sy, {steps: 12});
          await page.mouse.up();
          await expect
            .poll(async () => await getHeaderWidth(col), {timeout: UI_TIMEOUT})
            .toBeGreaterThan(before + minGain);
        }
      };
      // ---------------------------------------

      // Resize "Name" and cache width
      const wNameBefore = await getHeaderWidth('Name');
      await resizeAndAssertGain('Name', 100, 30);
      const wNameAfter = await getHeaderWidth('Name');

      // Switch away and back -> width persists
      await waitForListItemVisible(page, t2).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await waitForListItemVisible(page, t1).then((i) => i.click());
      await expectHeaderVisible(page, 'Name');
      await expect
        .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), {timeout: UI_TIMEOUT})
        .toBeLessThanOrEqual(6);

      // Add a new column, then resize it and cache width
      const newCol = 'AddedCol';
      await dsl(request, {
        operation: 'Alter',
        target: {name: t1},
        alter: {actions: [{addColumn: {name: newCol, type: 'TEXT'}}]},
      });
      await expectHeaderVisible(page, newCol);

      // "Name" width still the same
      await expect
        .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), {timeout: UI_TIMEOUT})
        .toBeLessThanOrEqual(6);

      const wNewDefault = await getHeaderWidth(newCol);
      expect(wNewDefault).toBeGreaterThan(20);

      await resizeAndAssertGain(newCol, 120, 40);
      const wNewAfter = await getHeaderWidth(newCol);

      // Navigate away and back -> both cached widths persist
      await waitForListItemVisible(page, t2).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await waitForListItemVisible(page, t1).then((i) => i.click());
      await expectHeaderVisible(page, newCol);

      await expect
        .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), {timeout: UI_TIMEOUT})
        .toBeLessThanOrEqual(6);
      await expect
        .poll(async () => Math.abs((await getHeaderWidth(newCol)) - wNewAfter), {timeout: UI_TIMEOUT})
        .toBeLessThanOrEqual(6);
    });

    // ───────────────────────────────────────────────────────────────
    // UI — clearable search
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: clearable search (X) appears, clears input, keeps focus`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);
      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      const input = page.locator('#list-filter-input');
      await expect(input).toBeVisible({timeout: UI_TIMEOUT});

      const clearBtn = page.getByRole('button', {name: 'Suche löschen'});
      await expect(clearBtn).toHaveCount(0);

      await input.fill('NO_MATCH');
      await expect(clearBtn).toBeVisible({timeout: UI_TIMEOUT});

      await clearBtn.click();
      await expect(input).toHaveValue('');
      await expect(clearBtn).toHaveCount(0);
      await expect(input).toBeFocused();
    });

    // ───────────────────────────────────────────────────────────────
    // UI — selection cannot be cleared by clicking selected item
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: cannot unselect by clicking the selected item`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);

      const name = `E2E_NoUnselect_${cfg.label}`;
      await createTable(request, name, [
        {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
        {name: 'Name', type: 'TEXT'},
      ]);

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      const item = await waitForListItemVisible(page, name);
      await item.click();
      await expectHeaderVisible(page, 'Id');

      // try to unselect
      await item.click();
      await expectHeaderVisible(page, 'Id');

      const li = page.locator('.left-listbox li.p-listbox-option').filter({hasText: name}).first();
      await expect(li).toHaveClass(/p-listbox-option-selected/);

      await li.focus();
      await page.keyboard.press('Enter');
      await expectHeaderVisible(page, 'Id');
      await expect(li).toHaveClass(/p-listbox-option-selected/);
    });

    // ───────────────────────────────────────────────────────────────
    // UI — delete via toolbar + neutral right-panel message
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: delete via UI → confirm, list updates, neutral message`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);

      const name = `E2E_Delete_UI_${cfg.label}`;
      await createTable(request, name, [
        {name: 'Id', type: 'INTEGER', primaryKey: true, notNull: true},
        {name: 'Name', type: 'TEXT'},
      ]);

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');

      await clickToolbarDelete(page);
      await confirmPrimeDelete(page);

      await waitForListItemHidden(page, name);
      await expect(page.getByText(cfg.neutralDeleteMessage)).toBeVisible({timeout: UI_TIMEOUT});
    });

    // ───────────────────────────────────────────────────────────────
    // UI — pagination + sorting on preloaded 100-row table
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: pagination + sorting on preloaded 100-row table (UI_SortPaginated)`, async ({
                                                                                                      page,
                                                                                                      request,
                                                                                                      baseURL
                                                                                                    }) => {
      await putEngine(request, cfg.key);

      const name = 'UI_SortPaginated'; // preloaded table/sheet with 100 rows
      const pathBase = `/api/web-viewer/tables/${encodeURIComponent(name)}`;

      const waitForTableReq = (predicate?: (url: string) => boolean) =>
        page.waitForResponse((res) => {
          const url = res.url();
          if (!url.includes(pathBase)) return false;
          return predicate ? predicate(url) : true;
        }, {timeout: UI_TIMEOUT});

      const paginator = getPaginatorControls(page);
      const waitForPageChange = () =>
        waitForTableReq(u => u.includes('page=') || u.includes('pageIndex=') || u.includes('skip=') || u.includes('offset='));

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      // Open the preloaded 100-row table
      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');
      await expectHeaderVisible(page, 'CreatedAt');

      // Sort by Id ASC to make pagination deterministic
      const idHeader =
        (await page.getByRole('columnheader', {name: 'Id', exact: true}).count()) > 0
          ? page.getByRole('columnheader', {name: 'Id', exact: true})
          : page.locator('p-table thead th').filter({hasText: 'Id'});

      const waitAsc = waitForTableReq((u) => u.includes('sortBy=Id') && u.includes('sortDir=asc'));
      await idHeader.click();
      const respAsc = await waitAsc;
      expect(respAsc.ok()).toBeTruthy();

      // Determine page size and first id
      const rows = page.locator('p-table table tbody tr');
      await expect(rows.first()).toBeVisible({timeout: UI_TIMEOUT});
      const pageSize = await rows.count();
      expect(pageSize).toBeGreaterThan(0);

      const firstCell = rows.first().locator('td').first();
      const readFirstId = async () => parseInt((await firstCell.innerText()).replace(/\D+/g, ''), 10);
      const idPage1 = await readFirstId();

      // Go to NEXT page (if possible) and verify increment
      if (!(await isPaginatorDisabled(paginator.next))) {
        const waitNext = waitForPageChange();
        await paginator.next.click();
        const respNext = await waitNext;
        expect(respNext.ok()).toBeTruthy();
        await expect.poll(readFirstId, {timeout: UI_TIMEOUT}).toBe(idPage1 + pageSize);
      }

      // Jump to LAST page (only if enabled)
      if (!(await isPaginatorDisabled(paginator.last))) {
        const waitLast = waitForPageChange();
        await paginator.last.click();
        const respLast = await waitLast;
        expect(respLast.ok()).toBeTruthy();
      }
      const firstColIds = (await page.locator('p-table table tbody tr td:first-child').allInnerTexts())
        .map((t) => parseInt(t.replace(/\D+/g, ''), 10))
        .filter((n) => !Number.isNaN(n));
      expect(firstColIds.some((n) => n === 100)).toBeTruthy();

      // Toggle DESC and go to FIRST page (only if enabled)
      const waitDesc = waitForTableReq((u) => u.includes('sortBy=Id') && u.includes('sortDir=desc'));
      await idHeader.click();
      const respDesc = await waitDesc;
      expect(respDesc.ok()).toBeTruthy();

      if (!(await isPaginatorDisabled(paginator.first))) {
        const waitFirst = waitForPageChange();
        await paginator.first.click();
        const respFirst = await waitFirst;
        expect(respFirst.ok()).toBeTruthy();
      }

      await expect.poll(readFirstId, {timeout: UI_TIMEOUT}).toBe(100);
    });

    // ───────────────────────────────────────────────────────────────
    // View-related tests — only for SQLite
    // ───────────────────────────────────────────────────────────────
    if (cfg.supportsViews) {
      test(`${cfg.label}: create VIEW joining Album + Artist`, async ({page, request, baseURL}) => {
        await putEngine(request, cfg.key);
        const viewName = 'E2E_View_Join';

        await goHome(page, baseURL);
        await selectEngine(page, cfg.label);

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

        await dsl(request, {operation: 'Drop', target: {name: viewName}, drop: {}});
        await waitForListItemHidden(page, viewName);
      });

      test(`${cfg.label}: create VIEW using OD_* functions and drop it`, async ({page, request, baseURL}) => {
        await putEngine(request, cfg.key);
        const viewName = 'E2E_View_Funcs';

        await goHome(page, baseURL);
        await selectEngine(page, cfg.label);

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

      test(`${cfg.label}: OD_Wochentag shows German weekday`, async ({page, request, baseURL}) => {
        await putEngine(request, cfg.key);
        const viewName = 'E2E_View_Wochentag';

        await goHome(page, baseURL);
        await selectEngine(page, cfg.label);

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

      test(`${cfg.label}: "Sichten" group is visible`, async ({page, request, baseURL}) => {
        await putEngine(request, cfg.key);
        await goHome(page, baseURL);
        await selectEngine(page, cfg.label);

        await expectGroupHeaderVisible(page, 'SICHTEN');
        await expectGroupHeaderVisible(page, 'TABELLEN');
      });
    } else {
      test(`${cfg.label}: "Sichten" group is hidden`, async ({page, request, baseURL}) => {
        await putEngine(request, cfg.key);
        await goHome(page, baseURL);
        await selectEngine(page, cfg.label);

        await expectGroupHeaderHidden(page, 'SICHTEN');
        await expectGroupHeaderVisible(page, 'TABELLEN');
      });
    }
  });

  // NEW: Aggregates — SUM without GROUP BY (single-row materialized result)
  test(`${cfg.label}: aggregate SUM without GROUP BY (single row)`, async ({page, request, baseURL}) => {
    await putEngine(request, cfg.key);
    const viewName = 'E2E_View_SumNoGroup';

    await goHome(page, baseURL);
    await selectEngine(page, cfg.label);

    // Materialize: SUM over Chinook Invoice totals (no GROUP BY)
    await dsl(request, {
      operation: 'Select',
      target: {name: viewName},
      select: {
        from: 'Invoice',
        columns: [{expr: 'SUM(Total)', as: 'GrandTotal'}],
      },
    });

    // Open and assert
    const item = await waitForListItemVisible(page, viewName);
    await item.click();
    await expectHeaderVisible(page, 'GrandTotal');

    await waitForTableData(page);

    // first cell of a real data row
    const table = page.locator('p-table');
    const cell = table.locator('tbody tr:not(.p-datatable-emptymessage) td').first();
    await expect(cell).toBeVisible({timeout: UI_TIMEOUT});
    await expect(cell).toHaveText(/\d/, {timeout: UI_TIMEOUT}); // there is at least one digit

    // --- parse robustly (handles , or . as decimal and thousands separators) ---
    const raw = (await cell.textContent())?.trim() ?? '';
    const v = parseNumericCellValue(raw);

    console.log('raw:', JSON.stringify(raw), 'parsed:', v);

    expect(Number.isFinite(v)).toBeTruthy();
    expect(v).toBeGreaterThan(0);

    // Cleanup
    await dsl(request, {operation: 'Drop', target: {name: viewName}, drop: {}});
    await waitForListItemHidden(page, viewName);
  });

// NEW: Aggregates — SUM with GROUP BY + ORDER BY + LIMIT (Chinook Track×Album)
  test(`${cfg.label}: aggregate COUNT per Artist (albums) with GROUP BY + ORDER/LIMIT`, async ({
                                                                                                 page,
                                                                                                 request,
                                                                                                 baseURL
                                                                                               }) => {
    await putEngine(request, cfg.key);
    const viewName = 'E2E_View_ArtistAlbumCounts';

    await goHome(page, baseURL);
    await selectEngine(page, cfg.label);

    // Materialize: count albums per artist, order by count desc, take top 10
    await dsl(request, {
      operation: 'Select',
      target: {name: viewName},
      select: {
        from: 'Album',
        columns: [
          {expr: 'Artist.Name', as: 'ArtistName'},
          {expr: 'COUNT(Album.AlbumId)', as: 'AlbumCount'},
        ],
        joins: [{table: 'Artist', on: 'Album.ArtistId = Artist.ArtistId'}],
        groupBy: ['ArtistName'],
        orderBy: ['AlbumCount DESC', 'ArtistName ASC'],
        limit: 10,
      },
    });

    // Open and basic header checks
    const item = await waitForListItemVisible(page, viewName);
    await item.click();
    await expectHeaderVisible(page, 'ArtistName');
    await expectHeaderVisible(page, 'AlbumCount');

    const table = page.locator('p-table'); // PrimeNG table root

    // Wait until the table actually has data (not the "Keine Daten vorhanden." row)
    await waitForTableData(page);

    const rows = table.locator('tbody tr:not(.p-datatable-emptymessage)');
    await expect(rows.first()).toBeVisible({timeout: UI_TIMEOUT});

    // Ensure the AlbumCount column (2nd) has digits
    const secondCol = rows.locator('td:nth-child(2)');
    await expect(secondCol.first()).toHaveText(/\d+/, {timeout: UI_TIMEOUT});

    // Parse counts (robust to thousands separators)
    const counts: number[] = await secondCol.evaluateAll((cells) =>
      cells
        .map((el) => (el.textContent || '').trim())
        .map((raw) => {
          // Parse numeric value (inline to work in browser context)
          let s = raw.replace(/[^0-9+\-.,]/g, '');
          const i = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
          if (i !== -1) s = s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1).replace(/[.,]/g, '');
          const n = Number(s);
          return Number.isFinite(n) ? n : null;
        })
        .filter((n): n is number => n !== null)
    );

    expect(counts.length).toBeGreaterThan(0);
    expect(counts.length).toBeLessThanOrEqual(10);

    // Verify sorted DESC (non-increasing)
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }

    // Cleanup
    await dsl(request, {operation: 'Drop', target: {name: viewName}, drop: {}});
    await waitForListItemHidden(page, viewName);
  });


}

// ───────────────────────────────────────────────────────────────
// Register engines in the desired order: SQLite first, then Excel
// ───────────────────────────────────────────────────────────────
const ENGINES: EngineCfg[] = [
  { key: 'sqlite', label: 'SQLite', supportsViews: true, neutralDeleteMessage: 'Keine Tabelle oder Sicht ausgewählt.' },
  { key: 'excel', label: 'Excel', supportsViews: false, neutralDeleteMessage: 'Keine Tabelle ausgewählt.' },
];

for (const cfg of ENGINES) {
  registerCommonTestsForEngine(cfg);
}
