/**
 * Measures the checkpoint + replay debugger on programs that grow an array:
 * recording time, heap retained by the recording, and seek latency.
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
if (!gc) console.log('\nHeap numbers need: node --expose-gc (npm run bench:replay sets it).');
console.log('');
