/**
 * Measures the checkpoint + replay debugger on programs that grow an array:
 * recording time, heap retained by the recording, and seek latency, then a
 * comparison with the previous design (a full state copy for every step).
 *
 * Run with: npm run bench:replay   (needs --expose-gc for heap numbers)
 */
import { TimeTravelDebugger } from '../src/index';

const gc = (globalThis as { gc?: () => void }).gc;

function program(pushes: number): string {
  return `let items = []
let i = 0
while i < ${pushes} {
  items.push(i * 2)
  i += 1
}
print(len(items))`;
}

function heapUsed(): number {
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function measure(pushes: number): void {
  const src = program(pushes);
  const before = heapUsed();
  const start = performance.now();
  const dbg = TimeTravelDebugger.fromSource(src);
  const recordMs = performance.now() - start;
  const retainedMb = (heapUsed() - before) / 1024 / 1024;

  // Random jumps (worst case: restore a checkpoint and replay up to one interval).
  let seed = 42;
  const random = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const seeks: number[] = [];
  for (let k = 0; k < 200; k++) {
    const target = Math.floor(random() * dbg.totalSteps);
    const t0 = performance.now();
    dbg.gotoStep(target);
    seeks.push(performance.now() - t0);
  }
  seeks.sort((a, b) => a - b);

  // Single steps backward: the common interactive case.
  dbg.gotoStep(Math.floor(dbg.totalSteps / 2));
  const backs: number[] = [];
  for (let k = 0; k < 200; k++) {
    const t0 = performance.now();
    dbg.stepBackward();
    backs.push(performance.now() - t0);
  }
  backs.sort((a, b) => a - b);

  const stats = dbg.getStats();
  const row = [
    String(pushes).padStart(6),
    stats.totalSteps.toLocaleString('en-US').padStart(10),
    `${recordMs.toFixed(0)} ms`.padStart(9),
    gc ? `${retainedMb.toFixed(1)} MB`.padStart(9) : '   (n/a)',
    String(stats.checkpoints).padStart(5),
    String(stats.checkpointInterval).padStart(8),
    `${percentile(seeks, 50).toFixed(2)} / ${percentile(seeks, 99).toFixed(2)} ms`.padStart(18),
    `${percentile(backs, 50).toFixed(2)} / ${percentile(backs, 99).toFixed(2)} ms`.padStart(18),
  ];
  console.log(`| ${row.join(' | ')} |`);
}

console.log('\nCheckpoint + replay debugger: `items.push` loop\n');
console.log('| pushes |      steps |    record |  retained | ckpts | interval |  seek p50 / p99   | step-back p50/p99 |');
console.log('|-------:|-----------:|----------:|----------:|------:|---------:|------------------:|------------------:|');
for (const n of [500, 2_000, 5_000, 20_000]) measure(n);

/** Record `src` with `options`; returns the time taken and the heap the recording keeps alive. */
function recordWith(src: string, options: Parameters<TimeTravelDebugger['record']>[0]): { ms: number; mb: number; dbg: TimeTravelDebugger } {
  const before = heapUsed();
  const start = performance.now();
  const dbg = new TimeTravelDebugger(src);
  dbg.record(options);
  const ms = performance.now() - start;
  return { ms, mb: (heapUsed() - before) / 1024 / 1024, dbg };
}

// The design this replaced kept a full copy of the VM state for every step.
// Simulated here with the same engine and a checkpoint after every step.
console.log('\nPrevious design (full state copy per step) vs checkpoint + replay, same programs\n');
console.log('| pushes |    steps | per-step copies: record | retained | checkpoint + replay: record | retained |');
console.log('|-------:|---------:|------------------------:|---------:|----------------------------:|---------:|');
for (const n of [500, 2_000]) {
  const src = program(n);
  const perStep = recordWith(src, { checkpointInterval: 1, maxCheckpoints: Number.MAX_SAFE_INTEGER });
  const steps = perStep.dbg.totalSteps;
  perStep.dbg = undefined as unknown as TimeTravelDebugger; // release before the next measurement
  const replay = recordWith(src, {});
  const mb = (x: number) => (gc ? `${x.toFixed(1)} MB` : '(n/a)');
  console.log(`| ${String(n).padStart(6)} | ${steps.toLocaleString('en-US').padStart(8)} | ${`${perStep.ms.toFixed(0)} ms`.padStart(23)} | ${mb(perStep.mb).padStart(8)} | ${`${replay.ms.toFixed(0)} ms`.padStart(27)} | ${mb(replay.mb).padStart(8)} |`);
}
if (!gc) console.log('\nHeap numbers need: node --expose-gc (npm run bench:replay sets it).');
console.log('');
