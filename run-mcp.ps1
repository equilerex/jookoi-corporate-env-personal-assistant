<#
.SYNOPSIS
    Starts the jookoi-md-mcp HTTP server inside WSL Ubuntu.
.PARAMETER Background
    Runs the WSL server in the background (hidden window).
#>
param(
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$normPath = "$scriptDir/jookoi-md-mcp" -replace '\\', '/'
$wslPath = (wsl.exe -d Ubuntu wslpath -u "$normPath").Trim()

if ($Background) {
    Write-Host "Starting jookoi-md-mcp in background (WSL Ubuntu at $wslPath)..."
    Start-Process wsl.exe -ArgumentList "-d", "Ubuntu", "bash", "-c", "cd '$wslPath' && ./run.sh" -WindowStyle Hidden
    Write-Host "Server process started."
} else {
    Write-Host "Starting jookoi-md-mcp (WSL Ubuntu at $wslPath)..."
    & wsl.exe -d Ubuntu bash -c "cd '$wslPath' && ./run.sh"
}
