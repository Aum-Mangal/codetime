/**
 * Property-based tests (fast-check).
 *
 * 1. Differential: random well-formed programs produce the same output and
 *    the same runtime error on the VM (CLI path) and through the replay
 *    debugger (IDE path).
 * 2. Replay exactness: the state at any step is identical whether the
 *    debugger restores from a nearby checkpoint or replays from the start.
 * 3. Robustness: arbitrary or mangled source never makes the toolchain throw
 *    a raw JavaScript exception; problems are always CodeTimeErrors.
 *
 * On failure fast-check prints the seed and a shrunk counterexample program.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { VM, TimeTravelDebugger, compile, CodeTimeError } from '../src/index.js';

// ── Program generator ─────────────────────────────────────────────────────────

/**
 * Every program starts with this prelude, so generated statements can use
 * globals, an array, a function with a default parameter and a closure.
 */
const PRELUDE = `let v0 = 0
let v1 = 1
let v2 = 2
let arr = [1, 2, 3]
fn add(a, b = 10) {
  return a + b
}
fn counter(start) {
  let n = start
  return fn() {
    n += 1
    return n
  }
}
let tick = counter(0)
`;
const EPILOGUE = '\nprint(v0, v1, v2, arr)';
const GLOBALS = ['v0', 'v1', 'v2'];

/**
 * Numeric expression over the variables in scope (all numeric). Depth bounds
 * the tree size. Division and modulo use non-zero literal divisors so most
 * programs run to the end; `faulty` supplies the rare ill-typed cases.
 */
function num(depth: number, vars: readonly string[]): fc.Arbitrary<string> {
  const leaf = fc.oneof(
    { weight: 3, arbitrary: fc.integer({ min: -3, max: 9 }).map(String) },
    { weight: 4, arbitrary: fc.constantFrom(...vars) },
    { weight: 1, arbitrary: fc.constantFrom('len(arr)', 'tick()') },
  );
  if (depth <= 0) return leaf;
  const sub = num(depth - 1, vars);
  return fc.oneof(
    { weight: 4, arbitrary: leaf },
    { weight: 4, arbitrary: fc.tuple(sub, fc.constantFrom('+', '-', '*'), sub).map(([a, op, b]) => `(${a} ${op} ${b})`) },
    { weight: 1, arbitrary: fc.tuple(sub, fc.constantFrom('/', '%'), fc.integer({ min: 1, max: 5 })).map(([a, op, b]) => `int(${a} ${op} ${b})`) },
    { weight: 1, arbitrary: fc.tuple(sub, sub).map(([a, b]) => `add(${a}, ${b})`) },
    { weight: 1, arbitrary: sub.map(a => `add(${a})`) },
    { weight: 1, arbitrary: sub.map(a => `-(${a})`) },
  );
}

/** Boolean expression, used as a condition. */
function bool(depth: number, vars: readonly string[]): fc.Arbitrary<string> {
  const compare = fc.tuple(num(1, vars), fc.constantFrom('<', '>', '<=', '>=', '==', '!='), num(1, vars))
    .map(([a, op, b]) => `${a} ${op} ${b}`);
  if (depth <= 0) return compare;
  const sub = bool(depth - 1, vars);
  return fc.oneof(
    { weight: 3, arbitrary: compare },
    { weight: 1, arbitrary: fc.tuple(sub, fc.constantFrom('and', 'or'), sub).map(([a, op, b]) => `(${a}) ${op} (${b})`) },
    { weight: 1, arbitrary: sub.map(a => `not (${a})`) },
  );
}

/** Expressions that fail at runtime, so error paths are compared too. */
const faulty = fc.constantFrom('"s" > 1', 'null + 1', 'arr[99]', 'v0 / 0', 'true - 1', 'len(5)');

const indent = (code: string): string => code.split('\n').map(l => `  ${l}`).join('\n');

/** A statement; nested blocks get fresh, depth-specific local names. */
function stmt(depth: number, vars: readonly string[]): fc.Arbitrary<string> {
  const n = num(2, vars);
  const target = fc.constantFrom(...GLOBALS);
  const simple = fc.oneof(
    { weight: 4, arbitrary: fc.tuple(target, n).map(([v, x]) => `${v} = ${x}`) },
    { weight: 2, arbitrary: fc.tuple(target, n).map(([v, x]) => `${v} += ${x}`) },
    { weight: 2, arbitrary: n.map(x => `print("v=" + str(${x}))`) },
    { weight: 2, arbitrary: n.map(x => `arr.push(${x})`) },
    { weight: 1, arbitrary: fc.tuple(n, n).map(([i, x]) => `arr[(${i}) * (${i}) % len(arr)] = ${x}`) },
    { weight: 1, arbitrary: fc.constant('if len(arr) > 1 {\n  arr.pop()\n}') },
    { weight: 1, arbitrary: fc.constant('print(arr)') },
  );
  if (depth <= 0) return simple;

  const body = (scope: readonly string[]) =>
    fc.array(stmt(depth - 1, scope), { minLength: 1, maxLength: 3 }).map(lines => indent(lines.join('\n')));
  const loopVar = `it${depth}`;
  const local = `t${depth}`;

  return fc.oneof(
    { weight: 4, arbitrary: simple },
    {
      weight: 1,
      arbitrary: fc.tuple(bool(1, vars), body(vars), body(vars))
        .map(([c, a, b]) => `if ${c} {\n${a}\n} else {\n${b}\n}`),
    },
    {
      weight: 1,
      arbitrary: fc.tuple(fc.array(n, { minLength: 0, maxLength: 4 }), body([...vars, loopVar]))
        .map(([items, b]) => `for ${loopVar} in [${items.join(', ')}] {\n${b}\n}`),
    },
    {
      // A counted while loop with a block-local counter.
      weight: 1,
      arbitrary: fc.tuple(fc.integer({ min: 0, max: 5 }), body([...vars, local]))
        .map(([count, b]) => `if true {\n  let ${local} = 0\n  while ${local} < ${count} {\n    ${local} += 1\n${indent(b)}\n  }\n}`),
    },
  );
}

/** Programs; about one in seven also contains one statement that fails at runtime. */
const programArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(stmt(2, GLOBALS), { minLength: 1, maxLength: 10 }),
    fc.oneof(
      { weight: 6, arbitrary: fc.constant(null) },
      { weight: 1, arbitrary: faulty.map(x => `print(${x})`) },
    ),
    fc.nat(),
  )
  .map(([lines, bad, at]) => {
    if (bad !== null) lines.splice(at % (lines.length + 1), 0, bad);
    return PRELUDE + lines.join('\n') + EPILOGUE;
  });

// ── Properties ────────────────────────────────────────────────────────────────

/**
 * A failing property is shrunk to a minimal counterexample. Some bugs make
 * every replay slower (e.g. a checkpoint that is mutated in place), so cap the
 * total time and report an interrupted run as a failure instead of hanging.
 */
const LIMITS = { interruptAfterTimeLimit: 60_000, markInterruptAsFailure: true } as const;

describe('Fuzz — generated programs', () => {
  it('the generator only produces programs that compile', () => {
    fc.assert(
      fc.property(programArb, src => {
        const result = compile(src);
        expect(result.diagnostics.map(d => d.message)).toEqual([]);
      }),
      { ...LIMITS, numRuns: 200 },
    );
  });

  it('VM and replay debugger agree on output and runtime errors', () => {
    fc.assert(
      fc.property(programArb, src => {
        const vm = new VM(src).interpret(src);
        const dbg = TimeTravelDebugger.fromSource(src, { checkpointInterval: 7 });
        expect(dbg.isTruncated).toBe(false);
        expect(dbg.gotoEnd().snapshot.output).toEqual(vm.output);
        expect(dbg.recordingErrorMessage).toBe(vm.error?.message ?? '');
        if (vm.error) expect(vm.error).toBeInstanceOf(CodeTimeError);
      }),
      { ...LIMITS, numRuns: 300 },
    );
  });

  it('replaying from a checkpoint gives the same state as replaying from the start', () => {
    fc.assert(
      fc.property(programArb, fc.array(fc.nat(), { minLength: 1, maxLength: 5 }), (src, picks) => {
        const dense = TimeTravelDebugger.fromSource(src, { checkpointInterval: 5 });
        const none = TimeTravelDebugger.fromSource(src, { checkpointInterval: 1_000_000 });
        for (const pick of picks) {
          const step = pick % dense.totalSteps;
          expect(dense.snapshotAt(step)).toEqual(none.snapshotAt(step));
        }
      }),
      { ...LIMITS, numRuns: 150 },
    );
  });

  it('reverse and forward line stepping always stay inside the recording', () => {
    const commands = ['stepInto', 'stepOver', 'stepOut', 'reverseStepInto', 'reverseStepOver', 'reverseStepOut', 'stepBackward'] as const;
    fc.assert(
      fc.property(programArb, fc.array(fc.constantFrom(...commands), { maxLength: 30 }), (src, moves) => {
        const dbg = TimeTravelDebugger.fromSource(src);
        for (const move of moves) {
          const state = dbg.navigate(move);
          expect(state.currentStep).toBeGreaterThanOrEqual(0);
          expect(state.currentStep).toBeLessThan(dbg.totalSteps);
          // Only the final step (after main returns) has no frames.
          if (!state.isAtEnd) expect(state.snapshot.frames.length).toBeGreaterThan(0);
        }
      }),
      { ...LIMITS, numRuns: 100 },
    );
  });
});

describe('Fuzz — malformed input', () => {
  /** Run source through every stage; only CodeTimeErrors may come out. */
  function checkNoRawExceptions(src: string): void {
    const result = compile(src);
    for (const d of result.diagnostics) expect(d).toBeInstanceOf(CodeTimeError);
    if (!result.chunk) return;
    const vm = new VM(src, { maxInstructions: 20_000 });
    const res = vm.run(result.chunk);
    if (res.error) expect(res.error).toBeInstanceOf(CodeTimeError);
  }

  it('random text never crashes the compiler or VM', () => {
    const codeChars = fc.constantFrom(
      ...'abcxyz019 \n\t(){}[],.:;+-*/%<>=!"\'\\'.split(''),
      'let ', 'fn ', 'if ', 'else ', 'while ', 'for ', ' in ', 'return ', 'struct ', 'and ', 'or ', 'not ', 'break', 'continue',
    );
    fc.assert(
      fc.property(fc.array(codeChars, { maxLength: 80 }).map(parts => parts.join('')), checkNoRawExceptions),
      { ...LIMITS, numRuns: 500 },
    );
  });

  it('valid programs with a random slice deleted never crash the compiler or VM', () => {
    fc.assert(
      fc.property(programArb, fc.nat(), fc.integer({ min: 1, max: 12 }), (src, at, len) => {
        const start = at % src.length;
        checkNoRawExceptions(src.slice(0, start) + src.slice(start + len));
      }),
      { ...LIMITS, numRuns: 300 },
    );
  });
});
