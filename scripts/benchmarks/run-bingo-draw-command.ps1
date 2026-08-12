param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$Sizes = "5000,10000,25000,50000"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Push-Location $repositoryRoot
try {
  $env:BINGO_BENCHMARK_DATABASE_URL = $DatabaseUrl
  $env:BINGO_BENCHMARK_SIZES = $Sizes
  pnpm --filter @asodef/api exec node --expose-gc -r ts-node/register src/modules/bingo/application/draws/draw-next-ball.benchmark.ts
}
finally {
  Remove-Item Env:BINGO_BENCHMARK_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:BINGO_BENCHMARK_SIZES -ErrorAction SilentlyContinue
  Pop-Location
}
