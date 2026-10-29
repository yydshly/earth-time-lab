$ErrorActionPreference = 'Stop'
$taskPidFile = Join-Path $PSScriptRoot 'server.pid'
if (-not (Test-Path -LiteralPath $taskPidFile)) { exit 0 }
$taskPid = 0
if (-not [int]::TryParse([System.IO.File]::ReadAllText($taskPidFile).Trim(), [ref]$taskPid)) { throw 'Invalid Time Atlas process identifier.' }
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskPid" -ErrorAction SilentlyContinue
if ($null -eq $taskProcess) { exit 0 }
$taskServer = Join-Path $PSScriptRoot 'server.mjs'
if ($taskProcess.Name -ne 'node.exe' -or -not $taskProcess.CommandLine.Contains('"' + $taskServer + '"')) { throw 'Process does not match this Time Atlas app. Nothing was stopped.' }
Stop-Process -Id $taskPid
