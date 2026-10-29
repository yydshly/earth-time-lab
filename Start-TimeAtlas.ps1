param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskDir = $PSScriptRoot
$taskUrl = 'http://127.0.0.1:4318'
$taskRunning = $false
try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/health" -TimeoutSec 2; $taskRunning = $taskHealth.app -eq 'earth-time-lab' } catch {}
if (-not $taskRunning) {
  $taskNode = (Get-Command node -ErrorAction Stop).Source
  $taskServer = Join-Path $taskDir 'server.mjs'
  $taskProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskServer + '"') -WorkingDirectory $taskDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskDir 'server.log') -RedirectStandardError (Join-Path $taskDir 'server-error.log') -PassThru
  [System.IO.File]::WriteAllText((Join-Path $taskDir 'server.pid'), [string]$taskProcess.Id)
  for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    Start-Sleep -Milliseconds 200
    try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/health" -TimeoutSec 1; if ($taskHealth.app -eq 'earth-time-lab') { $taskRunning = $true; break } } catch {}
  }
}
if (-not $taskRunning) { throw 'Unable to start Time Atlas. See server-error.log in this folder.' }
if (-not $NoBrowser) { Start-Process $taskUrl }
