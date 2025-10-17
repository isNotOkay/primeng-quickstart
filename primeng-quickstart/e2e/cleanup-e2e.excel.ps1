param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,
  [string]$Prefix = 'E2E'
)

$ErrorActionPreference = 'Stop'

# Resolve and validate
$wbPath = [IO.Path]::GetFullPath($WorkbookPath)
if (-not (Test-Path -LiteralPath $wbPath)) {
  throw "Workbook not found: $wbPath"
}

Write-Host "[INFO] Workbook : '$wbPath'"
Write-Host "[INFO] Prefix   : '$Prefix'  (sheets like '$Prefix*')"

# Start Excel (own instance), run hidden & without prompts
$excel = $null
$wb = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  $wb = $excel.Workbooks.Open($wbPath)  # open read/write

  # Collect sheets to delete (iterate backwards to avoid index shifting)
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
  Write-Error "[ERROR] $($_.Exception.Message)"
  exit 5
}
finally {
  if ($wb)    { try { $wb.Close($true) } catch {} }
  if ($excel) { try { $excel.Quit()    } catch {} }
  if ($excel) { try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {} }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
