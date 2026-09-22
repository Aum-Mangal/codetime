import { Lexer, Parser, SemanticAnalyzer, BytecodeCompiler, VM, TimeTravelDebugger } from '../src/index.js';

interface BenchmarkResult {
  name: string;
  operations: number;
  timeMs: number;
  opsPerSec: number;
}

function runBench(name: string, ops: number, fn: () => void): BenchmarkResult {
  // Warmup
  for (let i = 0; i < Math.min(10, ops); i++) fn();

  const start = performance.now();
  for (let i = 0; i < ops; i++) {
    fn();
  }
  const end = performance.now();
  const timeMs = end - start;
  const opsPerSec = Math.round((ops / timeMs) * 1000);

  return { name, operations: ops, timeMs: Math.round(timeMs * 100) / 100, opsPerSec };
}

function main() {
  console.log('===========================================================');
  console.log('        CodeTime Programming Language — Benchmarks         ');
  console.log('===========================================================');
  console.log(`Node Version : ${process.version}`);
  console.log(`Date         : ${new Date().toISOString()}`);
  console.log('-----------------------------------------------------------\n');

  const largeSource = `
fn fibonacci(n) {
    if n <= 1 { return n }
    return fibonacci(n - 1) + fibonacci(n - 2)
}

fn bubbleSort(arr) {
    let n = len(arr)
    let i = 0
    while i < n {
        let j = 0
        while j < n - i - 1 {
            if arr[j] > arr[j + 1] {
                let temp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = temp
            }
            j += 1
        }
        i += 1
    }
    return arr
}

let numbers = [64, 34, 25, 12, 22, 11, 90, 88, 76, 45]
let sorted = bubbleSort(numbers)
let fib10 = fibonacci(10)
print("Fib:", fib10, "Sorted:", sorted)
`;

  const results: BenchmarkResult[] = [];

  // 1. Lexer Benchmark
  results.push(
    runBench('Lexer Tokenization', 2000, () => {
      new Lexer(largeSource).tokenize();
    })
  );

  // 2. Parser Benchmark
  const tokens = new Lexer(largeSource).tokenize();
  results.push(
    runBench('Parser AST Generation', 2000, () => {
      new Parser(tokens, largeSource).parse();
    })
  );

  // 3. Semantic Analysis Benchmark
  const ast = new Parser(tokens, largeSource).parse();
  results.push(
    runBench('Semantic Analysis', 2000, () => {
      new SemanticAnalyzer(largeSource).analyze(ast);
    })
  );

  // 4. Bytecode Compiler Benchmark
  results.push(
    runBench('Bytecode Compilation', 2000, () => {
      new BytecodeCompiler('script', 'main').compile(ast);
    })
  );

  // 5. VM Execution Benchmark
  const chunk = new BytecodeCompiler('script', 'main').compile(ast);
  results.push(
    runBench('VM Execution (Full Program)', 1000, () => {
      new VM().run(chunk);
    })
  );

  // 6. Time-Travel Debugger Snapshot Recording Benchmark
  results.push(
    runBench('Time-Travel Debugger Recording', 500, () => {
      TimeTravelDebugger.fromSource(largeSource);
    })
  );

  // Print Formatted Results
  console.log('| Stage / Component               | Runs   | Total (ms) | Speed (ops/sec) |');
  console.log('|---------------------------------|--------|------------|-----------------|');
  for (const r of results) {
    const namePadded = r.name.padEnd(31, ' ');
    const runsPadded = String(r.operations).padStart(6, ' ');
    const timePadded = String(r.timeMs.toFixed(1)).padStart(10, ' ');
    const opsPadded = r.opsPerSec.toLocaleString().padStart(15, ' ');
    console.log(`| ${namePadded} | ${runsPadded} | ${timePadded} | ${opsPadded} |`);
  }
  console.log('-----------------------------------------------------------\n');

  // Summary Metrics
  const sampleDbg = TimeTravelDebugger.fromSource(largeSource);
  const dbgResult = results.find(r => r.name.includes('Debugger'))!;
  console.log(`Recorded Snapshots per Run : ${sampleDbg.totalSteps} steps`);
  console.log(`Snapshot Recording Speed  : ${Math.round((sampleDbg.totalSteps * 500 / dbgResult.timeMs) * 1000).toLocaleString()} steps/sec`);
  console.log('===========================================================\n');
}

main();
