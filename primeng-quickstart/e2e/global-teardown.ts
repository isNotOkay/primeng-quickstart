import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

export default async function globalTeardown() {
  try {
    if (process.platform !== 'win32') {
      console.log('[e2e] Skipping Windows-specific cleanup on non-Windows platforms.');
      return;
    }

    const prefix = process.env['E2E_PREFIX'] ?? 'E2E';
    // <-- This is the **only** place to change if your MockData moves
    const DATA_DIR =
      process.env['E2E_DATA_DIR'] ??
      'C:\\Users\\kayod\\RiderProjects\\OpenWebUiSqlToolServerApi\\OpenWebUiSqlToolServerApi.Test\\MockData';

    // Pass OPEN_WEB_UI_DATA_DIRECTORY to the scripts
    const env = { ...process.env, OPEN_WEB_UI_DATA_DIRECTORY: DATA_DIR };

    // --- SQLite cleanup (batch) -----------------------------------
    try {
      const sqliteBat = path.resolve(__dirname, 'cleanup-e2e.sqlite.bat');
      // pass EMPTY first arg so 2nd arg becomes the prefix; script will use env-var for DB
      console.log(`[e2e] SQLite cleanup: ${sqliteBat} (DATA_DIR=${DATA_DIR}) prefix=${prefix}`);
      await execFileAsync('cmd.exe', ['/c', sqliteBat, '', prefix], {
        windowsHide: true,
        env,
      });
      console.log('[e2e] SQLite cleanup finished.');
    } catch (err) {
      console.warn('[e2e] SQLite cleanup failed (continuing):', err);
    }

    // --- Excel cleanup (PowerShell) -------------------------------
    try {
      const excelPs1 = path.resolve(__dirname, 'cleanup-e2e.excel.ps1');
      // do NOT pass -WorkbookPath; script will resolve using OPEN_WEB_UI_DATA_DIRECTORY
      console.log(`[e2e] Excel cleanup (PS): ${excelPs1} (DATA_DIR=${DATA_DIR}) prefix=${prefix}`);
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', excelPs1, '-Prefix', prefix],
        { windowsHide: true, env }
      );
      console.log('[e2e] Excel cleanup finished.');
    } catch (err) {
      console.warn('[e2e] Excel cleanup failed (continuing):', err);
    }
  } catch (err) {
    console.warn('[e2e] Global teardown error (continuing):', err);
  }
}
