"use strict";

const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const domainRoot = path.join(
  repositoryRoot,
  "apps",
  "api",
  "dist",
  "modules",
  "bingo",
  "domain",
);
const { BingoCardGenerator } = require(path.join(domainRoot, "cards"));
const {
  ALL_POSITIONS_MASK,
  FOUR_CORNERS_MASK,
  HORIZONTAL_LINE_MASKS,
  VERTICAL_LINE_MASKS,
  evaluatePatternBatch,
  positionMask,
} = require(path.join(domainRoot, "patterns"));

const DATASET_SIZES = [5_000, 10_000, 25_000, 50_000];
const WARMUPS = 2;
const SAMPLES = 20;
const DRAW_SEQUENCE = Array.from({ length: 75 }, (_, index) => ({
  ball: index + 1,
  sequence: index + 1,
}));
const PATTERNS = [
  definition("LINE", 1, ...HORIZONTAL_LINE_MASKS),
  definition("TWO_LINES", 2, ...HORIZONTAL_LINE_MASKS, ...VERTICAL_LINE_MASKS),
  definition("FOUR_CORNERS", 1, FOUR_CORNERS_MASK),
  definition("FULL_CARD", 1, ALL_POSITIONS_MASK),
  definition(
    "CUSTOM",
    1,
    positionMask(0, 6, 12, 18, 24),
    positionMask(4, 8, 12, 16, 20),
  ),
];

function definition(kind, requiredMatchCount, ...masks) {
  return {
    id: `benchmark-${kind}`,
    kind,
    requiredMatchCount,
    configurationFrozen: true,
    masks: masks.map((positionMaskValue, index) => ({
      id: `mask-${index + 1}`,
      sequence: index + 1,
      positionMask: positionMaskValue,
    })),
  };
}

class SeededRandomSource {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }

  nextInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0)
      throw new RangeError();
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / maxExclusive) * maxExclusive;
    let value;
    do value = this.nextUint32();
    while (value >= limit);
    return value % maxExclusive;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function benchmarkPattern(cards, pattern) {
  for (let warmup = 0; warmup < WARMUPS; warmup += 1) {
    evaluatePatternBatch(cards, DRAW_SEQUENCE, pattern);
  }

  const elapsedSamples = [];
  const cpuSamples = [];
  let peakHeap = 0;
  let peakRss = 0;
  let candidateChecksum = 0;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    if (global.gc) global.gc();
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    const candidates = evaluatePatternBatch(cards, DRAW_SEQUENCE, pattern);
    const elapsed = performance.now() - started;
    const cpu = process.cpuUsage(cpuBefore);
    const memory = process.memoryUsage();
    elapsedSamples.push(elapsed);
    cpuSamples.push((cpu.user + cpu.system) / 1_000);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
    peakRss = Math.max(peakRss, memory.rss);
    candidateChecksum += candidates.length;
  }

  return {
    candidateChecksum,
    elapsedMs: {
      p50: round(percentile(elapsedSamples, 50)),
      p95: round(percentile(elapsedSamples, 95)),
      p99: round(percentile(elapsedSamples, 99)),
    },
    cpuMs: {
      p50: round(percentile(cpuSamples, 50)),
      p95: round(percentile(cpuSamples, 95)),
      p99: round(percentile(cpuSamples, 99)),
    },
    throughputCardsPerSecond: round(
      cards.length / (percentile(elapsedSamples, 50) / 1_000),
      0,
    ),
    peakHeapMiB: round(peakHeap / 1024 / 1024),
    peakRssMiB: round(peakRss / 1024 / 1024),
  };
}

function generateDataset(size) {
  if (global.gc) global.gc();
  const before = process.memoryUsage();
  const started = performance.now();
  const generated = new BingoCardGenerator(
    new SeededRandomSource(0xb1907500 ^ size),
  ).generateUnique(size);
  const elapsed = performance.now() - started;
  const after = process.memoryUsage();
  return {
    cards: generated.map((card, index) => ({
      card,
      cardId: `card-${String(index).padStart(5, "0")}`,
    })),
    generation: {
      elapsedMs: round(elapsed),
      throughputCardsPerSecond: round(size / (elapsed / 1_000), 0),
      heapDeltaMiB: round((after.heapUsed - before.heapUsed) / 1024 / 1024),
      rssDeltaMiB: round((after.rss - before.rss) / 1024 / 1024),
    },
  };
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function main() {
  const report = {
    methodology: {
      draws: 75,
      samples: SAMPLES,
      warmups: WARMUPS,
      forcedGcBeforeSample: Boolean(global.gc),
      unit: "one pattern evaluation over the complete dataset",
    },
    environment: {
      commit: gitHead(),
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      operatingSystem: `${os.type()} ${os.release()}`,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      logicalCpus: os.cpus().length,
      totalMemoryGiB: round(os.totalmem() / 1024 / 1024 / 1024),
    },
    datasets: [],
  };

  for (const size of DATASET_SIZES) {
    const { cards, generation } = generateDataset(size);
    const patterns = {};
    for (const pattern of PATTERNS) {
      patterns[pattern.kind] = benchmarkPattern(cards, pattern);
    }
    report.datasets.push({ size, generation, patterns });
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
