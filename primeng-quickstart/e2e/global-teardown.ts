import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

export default async function globalTeardown() {
  // SQLite stays as-is (bat) — or convert similarly to PS if you want
  try {
    if (process.platform !== 'win32') {
      console.log('[e2e] Skipping Windows-specific cleanup on non-Windows platforms.');
      return;
    }

    const prefix = process.env['E2E_PREFIX'] ?? 'E2E';

    // --- SQLite cleanup (unchanged) ------------------------------------------
    try {
      const sqliteBat = path.resolve(__dirname, 'cleanup-e2e.sqlite.bat');
      const sqliteDb =
        process.env['E2E_DB_PATH'] ??
        'C:\\Users\\kayod\\RiderProjects\\OpenWebUiSqlToolServerApi\\OpenWebUiSqlToolServerApi\\MockData\\database.db';

      console.log(`[e2e] SQLite cleanup: ${sqliteBat} "${sqliteDb}" "${prefix}"`);
      await execFileAsync('cmd.exe', ['/c', sqliteBat, sqliteDb, prefix], {
        windowsHide: true,
        env: process.env,
      });
      console.log('[e2e] SQLite cleanup finished.');
    } catch (err) {
      console.warn('[e2e] SQLite cleanup failed (continuing):', err);
    }

    // --- Excel cleanup via PowerShell ----------------------------------------
    try {
      const excelPs1 = path.resolve(__dirname, 'cleanup-e2e.excel.ps1');
      const excelXlsx =
        process.env['E2E_EXCEL_PATH'] ??
        'C:\\Users\\kayod\\RiderProjects\\OpenWebUiSqlToolServerApi\\OpenWebUiSqlToolServerApi\\MockData\\workbook.xlsx';

      console.log(`[e2e] Excel cleanup (PS): ${excelPs1} "${excelXlsx}" "${prefix}"`);
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', excelPs1, '-WorkbookPath', excelXlsx, '-Prefix', prefix],
        { windowsHide: true, env: process.env },
      );
      console.log('[e2e] Excel cleanup finished.');
    } catch (err) {
      console.warn('[e2e] Excel cleanup failed (continuing):', err);
    }
  } catch (err) {
    console.warn('[e2e] Global teardown error (continuing):', err);
  }
}
