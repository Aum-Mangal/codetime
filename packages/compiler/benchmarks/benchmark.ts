/**
 * Benchmarks of the toolchain on realistic programs, measured with tinybench
 * (warm-up, then repeated runs; mean, p99 and relative margin of error).
 *
 * For each workload: compile time, plain VM run time (no debugger), recording
 * time with the time-travel debugger, the size of its event log, and the
 * latency of jumping to a random step of the recording.
 *
 * Run with: npm run bench            (prints a Markdown report)
 *           npm run bench -- --out benchmark-results.md
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import { Bench, type Task } from 'tinybench';
import { compile, VM, TimeTravelDebugger } from '../src/index';

interface Workload {
  name: string;
  source: string;
}

const WORKLOADS: Workload[] = [
  {
    name: 'fib(20), recursive',
    source: `fn fib(n) {
  if n <= 1 { return n }
  return fib(n - 1) + fib(n - 2)
}
print(fib(20))`,
  },
  {
    name: 'insertion sort, 200 items',
    source: `let items = []
let seed = 7
let i = 0
while i < 200 {
  seed = (seed * 1103515245 + 12345) % 2147483648
  items.push(seed % 1000)
  i += 1
}
let j = 1
while j < len(items) {
  let key = items[j]
  let k = j - 1
  while k >= 0 and items[k] > key {
    items[k + 1] = items[k]
    k -= 1
  }
  items[k + 1] = key
  j += 1
}
print(items[0], items[199])`,
  },
  {
    name: 'closures + arrays, 10k iterations',
    source: `fn counter() {
  let n = 0
  return fn(step) {
    n += step
    return n
  }
}
let tick = counter()
let evens = []
for i in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] {
  let r = 0
  while r < 1000 {
    if tick(1) % 2 == 0 { evens.push(r) }
    r += 1
  }
}
print(len(evens))`,
  },
];

const SEEKS = 300;

const fmtMs = (ms: number) => (ms >= 100 ? `${ms.toFixed(0)} ms` : ms >= 1 ? `${ms.toFixed(1)} ms` : `${(ms * 1000).toFixed(0)} µs`);
const fmtInt = (n: number) => n.toLocaleString('en-US');

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function summary(task: Task | undefined): string {
  const latency = task?.result?.latency;
  if (!latency) return 'n/a';
  return `${fmtMs(latency.mean)} ± ${latency.rme.toFixed(1)}%`;
}

/** Random jumps across the whole recording: restore a checkpoint, then replay the gap. */
function seekLatency(dbg: TimeTravelDebugger): { p50: number; p99: number } {
  let seed = 42;
  const random = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const times: number[] = [];
  for (let k = 0; k < SEEKS; k++) {
    const target = Math.floor(random() * dbg.totalSteps);
    const t0 = performance.now();
    dbg.gotoStep(target);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { p50: percentile(times, 50), p99: percentile(times, 99) };
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf('--out');
  const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  const lines: string[] = [];
  const log = (line = '') => {
    lines.push(line);
    console.log(line);
  };

  log('## CodeTime benchmarks');
  log();
  log(`Node ${process.version} on ${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model.trim() ?? 'unknown CPU'}.`);
  log('Times are tinybench means ± relative margin of error; seek latency is over 300 random jumps.');
  log();
  log('| Workload | VM steps | Compile | VM run | Record (debugger) | Event log | Checkpoints | Seek p50 / p99 |');
  log('|---|---:|---:|---:|---:|---:|---:|---:|');

  for (const { name, source } of WORKLOADS) {
    const compiled = compile(source);
    if (!compiled.chunk) throw new Error(`${name} does not compile: ${compiled.diagnostics[0]?.message}`);
    const reference = TimeTravelDebugger.fromSource(source);
    if (reference.runtimeError || reference.isTruncated) throw new Error(`${name} must run to completion`);

    const bench = new Bench({ time: 1_500, warmupIterations: 5 });
    bench
      .add('compile', () => {
        compile(source);
      })
      .add('run', () => {
        const vm = new VM(source);
        vm.interpret(source);
      })
      .add('record', () => {
        TimeTravelDebugger.fromSource(source);
      });
    await bench.run();
    const task = (id: string) => bench.tasks.find((t) => t.name === id);

    const stats = reference.getStats();
    const seek = seekLatency(reference);
    log(
      `| ${name} | ${fmtInt(stats.totalSteps)} | ${summary(task('compile'))} | ${summary(task('run'))} | ${summary(task('record'))} | ` +
      `${(stats.traceBytes / 1024).toFixed(0)} KB | ${stats.checkpoints} | ${fmtMs(seek.p50)} / ${fmtMs(seek.p99)} |`,
    );
  }

  log();
  log('Record (debugger) runs the same VM one instruction at a time, writing the 20-byte event log entry for each step and a full state checkpoint every 1,000 steps.');

  if (outFile) fs.writeFileSync(outFile, lines.join('\n') + '\n');
}

void main();
