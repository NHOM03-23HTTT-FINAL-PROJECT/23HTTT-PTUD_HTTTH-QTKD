[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [switch]$NoBuild,
    [string]$ApiEnvFile = (Join-Path $PSScriptRoot '.env'),
    [string]$DatabaseEnvFile = (Join-Path $PSScriptRoot '../DB/.env')
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'scripts/LocalEnvironment.psm1') -Force
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
    Push-Location -LiteralPath $PSScriptRoot
    try {
        $arguments = @('run', '--project', 'src/QTKD.Api', '--launch-profile', 'https')
        if ($NoBuild) { $arguments += '--no-build' }
        & dotnet @arguments
        if ($LASTEXITCODE -ne 0) { throw "API process exited with code $LASTEXITCODE. Check restore/build output above." }
    } finally { Pop-Location }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $before[$name], 'Process') }
}
