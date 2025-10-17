param(
  [string]$WorkbookPath,
  [string]$Prefix = 'E2E'
)

$ErrorActionPreference = 'Stop'

# Resolve workbook path in this order:
#  1) explicit param
#  2) env:OPEN_WEB_UI_DATA_DIRECTORY\workbook.xlsx
#  3) C:\sql_tool_server_data\workbook.xlsx
if ([string]::IsNullOrWhiteSpace($WorkbookPath)) {
  $dataDir = $env:OPEN_WEB_UI_DATA_DIRECTORY
  if ([string]::IsNullOrWhiteSpace($dataDir)) { $dataDir = 'C:\sql_tool_server_data' }
  $WorkbookPath = Join-Path $dataDir 'workbook.xlsx'
}

$wbPath = [IO.Path]::GetFullPath($WorkbookPath)
if (-not (Test-Path -LiteralPath $wbPath)) {
  # Fallback if an explicit-but-wrong path was provided
  $dataDir = $env:OPEN_WEB_UI_DATA_DIRECTORY
  if ([string]::IsNullOrWhiteSpace($dataDir)) { $dataDir = 'C:\sql_tool_server_data' }
  $fallback = Join-Path $dataDir 'workbook.xlsx'
  if ($fallback -ne $wbPath -and (Test-Path -LiteralPath $fallback)) {
    $wbPath = $fallback
  } else {
    Write-Host "[INFO] Workbook not found (orig: $WorkbookPath, fallback: $fallback). Nothing to clean."
    exit 0
  }
}

Write-Host "[INFO] Workbook : '$wbPath'"
Write-Host "[INFO] Prefix   : '$Prefix'  (sheets like '$Prefix*')"

$excel = $null
$wb    = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  $wb = $excel.Workbooks.Open($wbPath)  # open read/write

  # Gather sheets to delete (iterate backwards)
  $toDelete = @()
  for ($i = $wb.Worksheets.Count; $i -ge 1; $i--) {
    $ws = $wb.Worksheets.Item($i)
    if ($ws.Name -like "$Prefix*") { $toDelete += $ws }
  }

  if ($toDelete.Count -eq 0) {
    Write-Host "[INFO] Nothing to drop."
  } else {
    Write-Host "[INFO] Found $($toDelete.Count) sheet(s) to drop:"
    $toDelete | ForEach-Object { Write-Host "  - $($_.Name)" }
    foreach ($ws in $toDelete) { $ws.Delete() }
    $wb.Save()
    Write-Host "[OK] Cleanup complete."
  }
}
catch {
  Write-Warning "[WARN] Excel cleanup error: $($_.Exception.Message). Continuing."
  exit 0
}
finally {
  if ($wb)    { try { $wb.Close($true) } catch {} }
  if ($excel) { try { $excel.Quit()    } catch {} }
  if ($excel) { try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {} }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
