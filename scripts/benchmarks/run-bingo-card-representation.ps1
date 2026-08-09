param(
  [Parameter(Mandatory = $true)]
  [string]$Container,
  [string]$Database = 'asodef_bingo_card_benchmark',
  [string]$User = 'asodef_ci',
  [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$sqlFile = Join-Path $PSScriptRoot 'bingo-card-representation.sql'
$outputDir = Join-Path $repoRoot 'tmp\bingo-card-benchmark'

if (-not (Test-Path $sqlFile)) {
  throw "Benchmark SQL not found: $sqlFile"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

docker inspect $Container | Out-Null
$existing = docker exec $Container psql -U $User -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($existing -eq '1') {
  throw "Dedicated benchmark database already exists: $Database. Choose another name or remove it explicitly."
}

docker exec $Container createdb -U $User $Database
try {
  $started = Get-Date
  Get-Content -Raw $sqlFile | docker exec -i $Container psql -X -v ON_ERROR_STOP=1 -U $User -d $Database
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL benchmark failed with exit code $LASTEXITCODE"
  }

  foreach ($name in 'metrics', 'storage', 'plans') {
    docker cp "${Container}:/bingo-card-benchmark-$name.csv" (Join-Path $outputDir "$name.csv")
  }

  $concurrencyOutput = Join-Path $outputDir 'concurrency.txt'
  "Four clients, two worker threads, ten seconds per representation, 50,000 cards.`n" |
    Set-Content -Encoding utf8 $concurrencyOutput
  foreach ($representation in 'normalized', 'array-gin', 'bitset-masks', 'compact-bytea') {
    $workload = Join-Path $PSScriptRoot "concurrency-$representation.sql"
    docker cp $workload "${Container}:/tmp/bingo-$representation.sql"
    "`n## $representation" | Add-Content -Encoding utf8 $concurrencyOutput
    docker exec $Container pgbench -n -c 4 -j 2 -T 10 -U $User -f "/tmp/bingo-$representation.sql" $Database 2>&1 |
      Tee-Object -FilePath $concurrencyOutput -Append
    if ($LASTEXITCODE -ne 0) {
      throw "pgbench concurrency workload failed for $representation"
    }
  }

  $metadata = [ordered]@{
    startedAt = $started.ToUniversalTime().ToString('o')
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    container = $Container
    database = $Database
    host = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture
    cpu = Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors
    memoryBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    docker = docker version --format '{{.Server.Version}}'
  }
  $metadata | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $outputDir 'environment.json')
  Write-Output "Benchmark artifacts: $outputDir"
}
finally {
  if (-not $KeepDatabase) {
    docker exec $Container dropdb -U $User $Database
  }
}
