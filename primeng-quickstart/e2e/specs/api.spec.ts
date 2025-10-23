// e2e/api.spec.ts
import { expect, test } from '@playwright/test';
import {API_BASE, createTable, dropObject, dsl, putEngine} from '../test.util';

test.describe.configure({ mode: 'serial' });

// ───────────────────────────────────────────────────────────────
// Tool Server API — no UI
// ───────────────────────────────────────────────────────────────
test.describe('Tool Server API — no UI', () => {
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

  test('download endpoint (SQLite) returns 200 OK', async ({ request }) => {
    await putEngine(request, 'sqlite');

    // (Optional) ensure file exists by touching the DB
    const tableName = 'E2E_DL_SQL';
    await createTable(request, tableName, [{ name: 'Id', type: 'INTEGER' }]);

    const res = await request.get(`${API_BASE}/api/web-viewer/download?engine=Sqlite`);
    const bodyPreview = await res.text(); // for easier debugging on failure
    expect(res.ok(), bodyPreview).toBeTruthy();
  });

  test('download endpoint (Excel) returns 200 OK', async ({ request }) => {
    await putEngine(request, 'excel');

    // Ensure workbook exists by creating a sheet
    const sheetName = 'E2E_DL_XL';
    await createTable(request, sheetName, [{ name: 'Id', type: 'INTEGER' }]);

    const res = await request.get(`${API_BASE}/api/web-viewer/download?engine=Excel`);
    const bodyPreview = await res.text(); // for easier debugging on failure
    expect(res.ok(), bodyPreview).toBeTruthy();
  });
});
