Set-StrictMode -Version Latest

function Read-QtkdEnvFile {
    param([Parameter(Mandatory)][string]$Path, [switch]$Optional)
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Optional) { return $values }
        throw "Missing local environment file. Create it from the matching .env.example."
    }
    $lineNumber = 0
    foreach ($raw in [IO.File]::ReadAllLines($Path)) {
        $lineNumber++
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        if ($line -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            throw "Invalid environment assignment at line $lineNumber. Values are never evaluated as PowerShell."
        }
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.StartsWith('"') -or $value.StartsWith("'")) {
            if ($value.Length -lt 2 -or $value[$value.Length - 1] -ne $value[0]) { throw "Unclosed environment quote at line $lineNumber." }
            $value = $value.Substring(1, $value.Length - 2)
        } else {
            $value = ($value -split '\s+#', 2)[0].TrimEnd()
        }
        $values[$name] = $value
    }
    return $values
}

function ConvertFrom-QtkdDatabaseUrl {
    param([Parameter(Mandatory)][string]$DatabaseUrl)
    $uri = $null
    if (-not [Uri]::TryCreate($DatabaseUrl, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -notin @('postgres', 'postgresql') -or
        $uri.Host -notmatch '^(?:db\.[a-z0-9]+\.supabase\.co|[a-z0-9.-]+\.pooler\.supabase\.com)$' -or
        ($uri.Port -ne -1 -and $uri.Port -ne 5432) -or $DatabaseUrl -match 'REPLACE|PROJECT_REF') {
        throw 'DIRECT_URL must be a Supabase Direct or Session pooler PostgreSQL URI on port 5432.'
    }
    $parameters = @{}
    foreach ($part in $uri.Query.TrimStart('?').Split('&', [StringSplitOptions]::RemoveEmptyEntries)) {
        $pair = $part.Split('=', 2)
        if ($pair.Length -eq 2) { $parameters[[Uri]::UnescapeDataString($pair[0])] = [Uri]::UnescapeDataString($pair[1]) }
    }
    if ($parameters['schema'] -ne 'qtkd' -or $parameters['sslmode'] -notin @('require', 'verify-ca', 'verify-full')) {
        throw 'DIRECT_URL must include schema=qtkd and sslmode=require (or verify-ca/verify-full).'
    }
    $credentials = $uri.UserInfo.Split(':', 2)
    if ($credentials.Length -ne 2 -or -not $credentials[0] -or -not $credentials[1]) { throw 'DIRECT_URL is missing database credentials.' }
    $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    if (-not $database) { throw 'DIRECT_URL is missing a database name.' }
    $username = [Uri]::UnescapeDataString($credentials[0])
    $password = [Uri]::UnescapeDataString($credentials[1])
    $ssl = @{ 'require' = 'Require'; 'verify-ca' = 'VerifyCA'; 'verify-full' = 'VerifyFull' }[$parameters['sslmode']]
    # Npgsql quoted values escape double quotes by doubling them; never build a shell command from credentials.
    $quote = { param([string]$value) '"' + $value.Replace('"', '""') + '"' }
    return 'Host=' + (& $quote $uri.Host) + ';Port=5432;Database=' + (& $quote $database) +
        ';Username=' + (& $quote $username) + ';Password=' + (& $quote $password) +
        ';SSL Mode=' + $ssl + ';Search Path=qtkd;Include Error Detail=false'
}

function Get-QtkdLocalSettings {
    param([Parameter(Mandatory)][string]$ApiEnvFile, [Parameter(Mandatory)][string]$DatabaseEnvFile)
    $api = Read-QtkdEnvFile -Path $ApiEnvFile
    $jwt = [Environment]::GetEnvironmentVariable('Jwt__SigningKey', 'Process')
    if ([string]::IsNullOrWhiteSpace($jwt)) { $jwt = $api['Jwt__SigningKey'] }
    if ([string]::IsNullOrWhiteSpace($jwt) -or [Text.Encoding]::UTF8.GetByteCount($jwt) -lt 32) { throw 'Fill Jwt__SigningKey with a private random value of at least 32 bytes.' }
    $connection = [Environment]::GetEnvironmentVariable('ConnectionStrings__Identity', 'Process')
    $source = 'process environment'
    if ([string]::IsNullOrWhiteSpace($connection)) { $connection = $api['ConnectionStrings__Identity']; $source = 'backend/.env override' }
    if ([string]::IsNullOrWhiteSpace($connection)) {
        $database = Read-QtkdEnvFile -Path $DatabaseEnvFile -Optional
        $url = [Environment]::GetEnvironmentVariable('DIRECT_URL', 'Process')
        $source = 'process DIRECT_URL'
        if ([string]::IsNullOrWhiteSpace($url)) { $url = $database['DIRECT_URL']; $source = 'DB/.env DIRECT_URL' }
        if ([string]::IsNullOrWhiteSpace($url)) { throw 'Paste the Supabase connection URI into DIRECT_URL in DB/.env first.' }
        $connection = ConvertFrom-QtkdDatabaseUrl -DatabaseUrl $url
    }
    return @{ Jwt = $jwt; Connection = $connection; Source = $source }
}

Export-ModuleMember -Function Read-QtkdEnvFile, ConvertFrom-QtkdDatabaseUrl, Get-QtkdLocalSettings
