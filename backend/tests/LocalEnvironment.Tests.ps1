$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '../scripts/LocalEnvironment.psm1') -Force
function Assert-LocalEnv([bool]$Condition, [string]$Case) { if (-not $Condition) { throw "FAILED: $Case" } }
function Assert-LocalEnvThrows([scriptblock]$Action, [string]$Case) {
    $thrown = $false
    try { & $Action | Out-Null } catch { $thrown = $true }
    Assert-LocalEnv $thrown $Case
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('qtkd-env-tests-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$apiFile = Join-Path $root 'api.env'
$dbFile = Join-Path $root 'db.env'
$marker = Join-Path $root 'must-not-exist'
$names = @('Jwt__SigningKey', 'ConnectionStrings__Identity', 'DIRECT_URL')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process'); [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
try {
    $literal = '$(New-Item -ItemType File -Path ' + $marker + ')'
    [IO.File]::WriteAllLines($apiFile, @('# comment', 'Jwt__SigningKey="TEST_ONLY_KEY_WITH_MORE_THAN_32_BYTES_2026"', 'ConnectionStrings__Identity=', ('LITERAL=' + $literal), 'SPACED="value with spaces"'))
    $read = Read-QtkdEnvFile -Path $apiFile
    Assert-LocalEnv ($read['LITERAL'] -eq $literal -and -not (Test-Path -LiteralPath $marker)) 'environment input is literal, not evaluated'
    Assert-LocalEnv ($read['SPACED'] -eq 'value with spaces') 'quoted dotenv value'

    $password = 'Synthetic@;"$():password'
    $encoded = [Uri]::EscapeDataString($password)
    $url = 'postgresql://postgres:' + $encoded + '@db.abcdefghijkl.supabase.co:5432/postgres?schema=qtkd&sslmode=require'
    $connection = ConvertFrom-QtkdDatabaseUrl -DatabaseUrl $url
    $parsed = [System.Data.Common.DbConnectionStringBuilder]::new()
    $parsed.set_ConnectionString($connection)
    Assert-LocalEnv ($parsed['Password'] -eq $password -and $parsed['Port'] -eq '5432' -and $parsed['Search Path'] -eq 'qtkd') 'percent decoding and connection string quoting'
    $session = $url.Replace('postgres:', 'postgres.abcdefghijkl:').Replace('db.abcdefghijkl.supabase.co', 'aws-0-ap-southeast-1.pooler.supabase.com')
    $parsed.set_ConnectionString((ConvertFrom-QtkdDatabaseUrl -DatabaseUrl $session))
    Assert-LocalEnv ($parsed['Username'] -eq 'postgres.abcdefghijkl') 'session pooler username preserved'
    foreach ($bad in @($url.Replace(':5432', ':6543'), $url.Replace('sslmode=require', 'sslmode=disable'), $url.Replace('schema=qtkd', 'schema=public'), $url.Replace('db.abcdefghijkl.supabase.co', 'localhost'))) {
        Assert-LocalEnvThrows { ConvertFrom-QtkdDatabaseUrl -DatabaseUrl $bad } 'reject unsafe/unsupported database target'
    }
    [IO.File]::WriteAllText($dbFile, ('DIRECT_URL="' + $url + '"'))
    $settings = Get-QtkdLocalSettings -ApiEnvFile $apiFile -DatabaseEnvFile $dbFile
    Assert-LocalEnv ($settings.Source -eq 'DB/.env DIRECT_URL' -and $settings.Connection -eq $connection) 'single URI source and JWT fallback'
    [Environment]::SetEnvironmentVariable('ConnectionStrings__Identity', 'Host=synthetic.invalid;Database=test', 'Process')
    $overridden = Get-QtkdLocalSettings -ApiEnvFile $apiFile -DatabaseEnvFile $dbFile
    Assert-LocalEnv ($overridden.Source -eq 'process environment') 'explicit process environment precedence'
    [Environment]::SetEnvironmentVariable('ConnectionStrings__Identity', $null, 'Process')
    [IO.File]::WriteAllText($dbFile, 'DIRECT_URL=')
    Assert-LocalEnvThrows { Get-QtkdLocalSettings -ApiEnvFile $apiFile -DatabaseEnvFile $dbFile } 'missing database URI fails before launch'
    'PASS: local environment parsing, literal values, URI quoting, pooler handling, validation and precedence. No network connection or real secret output.'
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $before[$name], 'Process') }
    foreach ($file in @($apiFile, $dbFile, $marker)) { if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force } }
    [IO.Directory]::Delete($root)
}
