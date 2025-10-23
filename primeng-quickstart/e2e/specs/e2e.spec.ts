// e2e/engines.spec.ts
import {expect, test} from '@playwright/test';
import {
  API_BASE,
  clickToolbarDelete,
  confirmPrimeDelete,
  createTable,
  dsl,
  expectGroupHeaderHidden,
  expectGroupHeaderVisible,
  expectHeaderVisible,
  goHome,
  putEngine,
  selectEngine,
  UI_TIMEOUT,
  waitForListItemHidden,
  waitForListItemVisible,
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
    // API-only smoke: /tables & /columns
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: GET /tables and POST /columns return data`, async ({request}) => {
      await putEngine(request, cfg.key);

      const objName = `E2E_API_${cfg.label}_1`;
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
    test(`${cfg.label}: download endpoint returns 200 OK`, async ({request}) => {
      await putEngine(request, cfg.key);
      const objName = `E2E_DL_${cfg.label}`;
      await createTable(request, objName, [{name: 'Id', type: 'INTEGER'}]);

      const engineParam = cfg.label === 'SQLite' ? 'Sqlite' : 'Excel';
      const res = await request.get(`${API_BASE}/api/web-viewer/download?engine=${engineParam}`);
      const bodyPreview = await res.text(); // easier debugging on failure
      expect(res.ok(), bodyPreview).toBeTruthy();
    });

    // ───────────────────────────────────────────────────────────────
    // UI — create table/sheet and show in list
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: create a new table/sheet via API and UI lists it`, async ({page, request, baseURL}) => {
      await putEngine(request, cfg.key);
      const name = `E2E_UI_Create_${cfg.label}`;

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
      let started = 0, finished = 0, failed = 0;

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

      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');

      await page.waitForTimeout(300);
      expect(started).toBe(1);
      expect(finished).toBe(1);
      expect(failed).toBe(0);

      page.off('request', onReq);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
    });

    // ───────────────────────────────────────────────────────────────
    // UI — sorting (server-side)
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: sorting sends sortBy/sortDir and issues one request per click`, async ({
                                                                                                 page,
                                                                                                 request,
                                                                                                 baseURL
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
        let started = 0, finished = 0, failed = 0;
        const match = (url: string) => url.includes(pathBase) && url.includes('sortBy=Name') && url.includes(`sortDir=${dir}`);

        const onReq = (req: any) => {
          if (match(req.url())) started++;
        };
        const onFinished = (req: any) => {
          if (match(req.url())) finished++;
        };
        const onFailed = (req: any) => {
          if (match(req.url())) failed++;
        };

        page.on('request', onReq);
        page.on('requestfinished', onFinished);
        page.on('requestfailed', onFailed);

        let header = page.getByRole('columnheader', {name: 'Name', exact: true});
        if ((await header.count()) === 0) {
          header = page.locator('p-table thead th').filter({hasText: 'Name'});
        }

        const waitResp = page.waitForResponse((res) => match(res.url()), {timeout: UI_TIMEOUT});
        await header.click();
        const resp = await waitResp;
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
    });

    // ───────────────────────────────────────────────────────────────
    // UI — column widths persistence, incl. newly added column
    // ───────────────────────────────────────────────────────────────
    test(`${cfg.label}: column widths persist; new column gets cached after first resize`, async ({
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

      const headerLocator = async (col: string) => {
        let th = page
          .locator('.p-table-scrollable-header .p-table-scrollable-header-table thead th')
          .filter({hasText: col})
          .first();
        if ((await th.count()) > 0) return th;

        const byRole = page.getByRole('columnheader', {name: col, exact: true});
        if ((await byRole.count()) > 0) return byRole.first();

        return page.locator('p-table thead th').filter({hasText: col}).first();
      };

      const getHeaderWidth = async (col: string) => {
        const th = await headerLocator(col);
        await expect(th).toBeVisible({timeout: UI_TIMEOUT});
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
      await expect.poll(async () => await getHeaderWidth('Name'), {timeout: UI_TIMEOUT}).toBeGreaterThan(wNameBefore + 30);
      const wNameAfter = await getHeaderWidth('Name');

      await waitForListItemVisible(page, t2).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');

      await waitForListItemVisible(page, t1).then((i) => i.click());
      await expectHeaderVisible(page, 'Name');

      await expect
        .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), {timeout: UI_TIMEOUT})
        .toBeLessThanOrEqual(6);

      const newCol = 'AddedCol';
      await dsl(request, {
        operation: 'Alter',
        target: {name: t1},
        alter: {actions: [{addColumn: {name: newCol, type: 'TEXT'}}]},
      });

      await expectHeaderVisible(page, newCol);

      await expect
        .poll(async () => Math.abs((await getHeaderWidth('Name')) - wNameAfter), {timeout: UI_TIMEOUT})
        .toBeLessThanOrEqual(6);

      const wNewDefault = await getHeaderWidth(newCol);
      expect(wNewDefault).toBeGreaterThan(20);

      await dragResizer(newCol, 120);
      await expect.poll(async () => await getHeaderWidth(newCol), {timeout: UI_TIMEOUT}).toBeGreaterThan(wNewDefault + 40);
      const wNewAfter = await getHeaderWidth(newCol);

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

// Add this inside registerCommonTestsForEngine(cfg)
    test(`${cfg.label}: pagination + sorting on preloaded 100-row table (E2E_SortPaginated)`, async ({
                                                                                                       page,
                                                                                                       request,
                                                                                                       baseURL
                                                                                                     }) => {
      await putEngine(request, cfg.key);

      const name = 'E2E_SortPaginated'; // preloaded table/sheet with 100 rows
      const pathBase = `/api/web-viewer/tables/${encodeURIComponent(name)}`;

      // Helper: wait for a table fetch matching optional query predicate
      const waitForTableReq = (predicate?: (url: string) => boolean) =>
        page.waitForResponse((res) => {
          const url = res.url();
          if (!url.includes(pathBase)) return false;
          return predicate ? predicate(url) : true;
        }, {timeout: UI_TIMEOUT});

      // Helper: robust paginator selectors (PrimeNG)
      const paginator = {
        next: page.locator('.p-paginator .p-paginator-next'),
        first: page.locator('.p-paginator .p-paginator-first'),
        last: page.locator('.p-paginator .p-paginator-last'),
      };

      await goHome(page, baseURL);
      await selectEngine(page, cfg.label);

      // Open the preloaded 100-row table
      await waitForListItemVisible(page, name).then((i) => i.click());
      await expectHeaderVisible(page, 'Id');
      await expectHeaderVisible(page, 'Name');
      await expectHeaderVisible(page, 'CreatedAt');

      // Sort by Id ASC to make pagination deterministic
      const idHeader = (await page.getByRole('columnheader', {name: 'Id', exact: true}).count()) > 0
        ? page.getByRole('columnheader', {name: 'Id', exact: true})
        : page.locator('p-table thead th').filter({hasText: 'Id'});

      const waitAsc = waitForTableReq((u) => u.includes('sortBy=Id') && u.includes('sortDir=asc'));
      await idHeader.click();
      const respAsc = await waitAsc;
      expect(respAsc.ok()).toBeTruthy();

      // Determine page size from current page
      const rows = page.locator('p-table table tbody tr');
      await expect(rows.first()).toBeVisible({timeout: UI_TIMEOUT});
      const pageSize = await rows.count();
      expect(pageSize).toBeGreaterThan(0);

      // Read first row's Id on page 1
      const firstCell = rows.first().locator('td').first();
      const readFirstId = async () => parseInt((await firstCell.innerText()).replace(/\D+/g, ''), 10);
      const idPage1 = await readFirstId();
      expect(idPage1).toBe(1); // with Id ASC, first page should start at 1

      // Go to NEXT page and verify the first Id increases by pageSize
      await expect(paginator.next).toBeVisible({timeout: UI_TIMEOUT});
      const waitNext = waitForTableReq((u) =>
        u.includes('page=') || u.includes('pageIndex=') || u.includes('skip=') || u.includes('offset=')
      );
      await paginator.next.click();
      const respNext = await waitNext;
      expect(respNext.ok()).toBeTruthy();

      await expect.poll(readFirstId, {timeout: UI_TIMEOUT}).toBe(idPage1 + pageSize);

      // Jump to LAST page and ensure 100 is present in the first column
      await expect(paginator.last).toBeVisible({timeout: UI_TIMEOUT});
      const waitLast = waitForTableReq((u) =>
        u.includes('page=') || u.includes('pageIndex=') || u.includes('skip=') || u.includes('offset=')
      );
      await paginator.last.click();
      const respLast = await waitLast;
      expect(respLast.ok()).toBeTruthy();

      const firstColCells = page.locator('p-table table tbody tr td:first-child');
      const firstColTexts = (await firstColCells.allInnerTexts()).map((t) => t.trim());
      const firstColIds = firstColTexts.map((t) => parseInt(t.replace(/\D+/g, ''), 10)).filter((n) => !Number.isNaN(n));
      expect(firstColIds.some((n) => n === 100)).toBeTruthy();

      // Now toggle DESC and go to FIRST page → the very first row should be 100
      const waitDesc = waitForTableReq((u) => u.includes('sortBy=Id') && u.includes('sortDir=desc'));
      await idHeader.click();
      const respDesc = await waitDesc;
      expect(respDesc.ok()).toBeTruthy();

      // Ensure we're on the first page after sorting DESC
      await expect(paginator.first).toBeVisible({timeout: UI_TIMEOUT});
      const waitFirst = waitForTableReq((u) =>
        u.includes('page=') || u.includes('pageIndex=') || u.includes('skip=') || u.includes('offset=')
      );
      await paginator.first.click();
      const respFirst = await waitFirst;
      expect(respFirst.ok()).toBeTruthy();

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
}

// ───────────────────────────────────────────────────────────────
// Register engines in the desired order: SQLite first, then Excel
// ───────────────────────────────────────────────────────────────
const ENGINES: EngineCfg[] = [
  {key: 'sqlite', label: 'SQLite', supportsViews: true, neutralDeleteMessage: 'Keine Tabelle oder Sicht ausgewählt.'},
  {key: 'excel', label: 'Excel', supportsViews: false, neutralDeleteMessage: 'Keine Tabelle ausgewählt.'},
];

for (const cfg of ENGINES) {
  registerCommonTestsForEngine(cfg);
}
