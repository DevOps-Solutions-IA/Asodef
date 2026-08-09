$ErrorActionPreference = "Stop"

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $repositoryRoot
try {
  pnpm --filter @asodef/api build
  node --expose-gc scripts/benchmarks/bingo-domain-engine.cjs
}
finally {
  Pop-Location
}
