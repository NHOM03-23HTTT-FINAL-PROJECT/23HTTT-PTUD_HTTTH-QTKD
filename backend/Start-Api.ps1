[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [switch]$NoBuild,
    [string]$ApiEnvFile,
    [string]$DatabaseEnvFile
)
$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Resolve-Path './backend').Path }
if (-not $ApiEnvFile) { $ApiEnvFile = Join-Path $scriptDir '.env' }
if (-not $DatabaseEnvFile) { $DatabaseEnvFile = Join-Path $scriptDir '../DB/.env' }
Import-Module (Join-Path $scriptDir 'scripts/LocalEnvironment.psm1') -Force
$settings = Get-QtkdLocalSettings -ApiEnvFile $ApiEnvFile -DatabaseEnvFile $DatabaseEnvFile
if ($ValidateOnly) {
    # Intentionally do not return the settings dictionary, URI, key, or connection string.
    [pscustomobject]@{ ConfigurationValid = $true; DatabaseSource = $settings.Source; ApiUrl = 'https://localhost:7156'; NetworkConnectionChecked = $false }
    return
}
$names = @('Jwt__SigningKey', 'ConnectionStrings__Identity')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    [Environment]::SetEnvironmentVariable('Jwt__SigningKey', $settings.Jwt, 'Process')
    [Environment]::SetEnvironmentVariable('ConnectionStrings__Identity', $settings.Connection, 'Process')
    Push-Location -LiteralPath $scriptDir
    try {
        $arguments = @('run', '--project', 'src/QTKD.Api', '--launch-profile', 'https')
        if ($NoBuild) { $arguments += '--no-build' }
        & dotnet @arguments
        if ($LASTEXITCODE -ne 0) { throw "API process exited with code $LASTEXITCODE. Check restore/build output above." }
    } finally { Pop-Location }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $before[$name], 'Process') }
}
