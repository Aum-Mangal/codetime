import { describe, it, expect, beforeEach } from 'vitest';
import { TimeTravelDebugger } from '../src/debugger/debugger.js';
import { EVENT_KINDS } from '../src/debugger/trace.js';
import { VM } from '../src/vm/vm.js';
import type { ExecutionSnapshot } from '../src/debugger/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const examplesDir = path.resolve(__dirname, '../../../examples');
const readExample = (name: string): string => fs.readFileSync(path.join(examplesDir, name), 'utf-8');

/** Every step's snapshot; only for small programs. */
function allSnapshots(dbg: TimeTravelDebugger): ExecutionSnapshot[] {
  return Array.from({ length: dbg.totalSteps }, (_, i) => dbg.snapshotAt(i));
}

function localsOf(snap: ExecutionSnapshot): Record<string, string> {
  const top = snap.frames[snap.frames.length - 1]!;
  return Object.fromEntries(top.locals.map(v => [v.name, v.displayValue]));
}

function globalOf(snap: ExecutionSnapshot, name: string): string | undefined {
  return snap.globals.find(g => g.name === name)?.displayValue;
}

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Recording', () => {
  it('records at least one step for any valid program', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1');
    expect(dbg.totalSteps).toBeGreaterThan(0);
    expect(dbg.getTimeline().length).toBe(dbg.totalSteps);
  });

  it('every step has a valid source location', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let a = 1
let b = 2
let c = a + b
`);
    for (const snap of allSnapshots(dbg)) {
      expect(snap.sourceLine).toBeGreaterThan(0);
      expect(snap.sourceColumn).toBeGreaterThan(0);
    }
  });

  it('output accumulates correctly through execution', () => {
    const dbg = TimeTravelDebugger.fromSource(`
print("a")
print("b")
print("c")
`);
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output).toEqual(['a', 'b', 'c']);
    const firstPrint = dbg.getTimeline().findIndex(e => e.type === 'print');
    expect(dbg.snapshotAt(firstPrint).output).toEqual(['a']);
  });

  it('captures a "print" event type in the timeline', () => {
    const dbg = TimeTravelDebugger.fromSource('print("hello")');
    const printEvents = dbg.getTimeline().filter(e => e.type === 'print');
    expect(printEvents.length).toBeGreaterThan(0);
    expect(printEvents[0]!.description).toContain('hello');
  });

  it('getEvents returns a window with correct step indices', () => {
    const dbg = TimeTravelDebugger.fromSource(readExample('fibonacci.ct'));
    const all = dbg.getTimeline();
    const window = dbg.getEvents(10, 19);
    expect(window.map(e => e.stepIndex)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(window).toEqual(all.slice(10, 20));
  });

  it('a compile error is thrown before recording', () => {
    expect(() => TimeTravelDebugger.fromSource('let = 1')).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Checkpoint and replay', () => {
  const programs = ['fibonacci.ct', 'closures.ct', 'buggy.ct', 'arrays.ct', 'hello.ct']
    .filter(f => fs.existsSync(path.join(examplesDir, f)));

  it.each(programs)('%s: state at every step is the same for any checkpoint interval', (file) => {
    const src = readExample(file);
    const dense = TimeTravelDebugger.fromSource(src, { checkpointInterval: 3 });
    const sparse = TimeTravelDebugger.fromSource(src, { checkpointInterval: 1_000_000 });
    expect(dense.totalSteps).toBe(sparse.totalSteps);

    // Every step in order, then a shuffled sample so restores, forward replays
    // and cache hits all happen.
    const steps = Array.from({ length: dense.totalSteps }, (_, i) => i);
    for (const step of steps) {
      expect(dense.snapshotAt(step)).toEqual(sparse.snapshotAt(step));
    }
    const shuffled = steps.map((_, i) => steps[(i * 7919) % steps.length]!);
    for (const step of shuffled.slice(0, 200)) {
      expect(dense.snapshotAt(step)).toEqual(sparse.snapshotAt(step));
    }
  });

  it('final output matches the CLI virtual machine', () => {
    for (const file of programs) {
      const src = readExample(file);
      const res = new VM(src).interpret(src);
      const dbg = TimeTravelDebugger.fromSource(src, { checkpointInterval: 5 });
      dbg.gotoEnd();
      expect(dbg.getCurrentSnapshot().output).toEqual(res.output);
    }
  });

  it('aliasing survives a checkpoint: two names for one array stay linked', () => {
    const src = `
let a = [1]
let b = a
let i = 0
while i < 20 { i += 1 }
b.push(2)
print(a)
`;
    const dbg = TimeTravelDebugger.fromSource(src, { checkpointInterval: 4 });
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output).toEqual(['[1, 2]']);
    expect(globalOf(dbg.getCurrentSnapshot(), 'a')).toBe('[1, 2]');
  });

  it('a closure restored from a checkpoint still shares its captured variable', () => {
    const src = `
fn counter() {
  let n = 0
  fn inc() {
    n += 1
    return n
  }
  return inc
}
let c = counter()
let out = []
let i = 0
while i < 10 {
  out.push(c())
  i += 1
}
print(out)
`;
    const dbg = TimeTravelDebugger.fromSource(src, { checkpointInterval: 2 });
    for (let step = 0; step < dbg.totalSteps; step += 13) dbg.gotoStep(step);
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output).toEqual(['[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]']);
  });

  it('thins checkpoints when there are too many and doubles the interval', () => {
    const src = 'let i = 0\nwhile i < 2000 { i += 1 }\nprint(i)';
    const dbg = TimeTravelDebugger.fromSource(src, { checkpointInterval: 10, maxCheckpoints: 8 });
    const stats = dbg.getStats();
    expect(stats.checkpoints).toBeLessThanOrEqual(8);
    expect(stats.checkpointInterval).toBeGreaterThan(10);
    const reference = TimeTravelDebugger.fromSource(src, { checkpointInterval: 1_000_000 });
    for (const step of [0, 1, 999, 5000, dbg.totalSteps - 1]) {
      expect(dbg.snapshotAt(step)).toEqual(reference.snapshotAt(step));
    }
  });

  it('stores a compact trace instead of a full snapshot per step', () => {
    const src = 'let a = []\nlet i = 0\nwhile i < 5000 {\n  a.push(i)\n  i += 1\n}\nprint(len(a))';
    const dbg = TimeTravelDebugger.fromSource(src);
    const stats = dbg.getStats();
    expect(stats.traceBytes).toBe(stats.totalSteps * 20);
    expect(stats.checkpoints).toBeLessThanOrEqual(200);
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output).toEqual(['5000']);
    expect(dbg.snapshotAt(Math.floor(dbg.totalSteps / 2)).globals.find(g => g.name === 'i')).toBeDefined();
  });

  it('marks the recording truncated instead of silently stopping', () => {
    const dbg = TimeTravelDebugger.fromSource('let i = 0\nwhile true { i += 1 }', { maxSteps: 500 });
    expect(dbg.totalSteps).toBe(500);
    expect(dbg.isTruncated).toBe(true);
    expect(dbg.getCurrentState().isTruncated).toBe(true);
    expect(dbg.getStats().truncatedReason).toContain('500');
    expect(dbg.hasRecordingError).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Instruction navigation', () => {
  let dbg: TimeTravelDebugger;

  beforeEach(() => {
    dbg = TimeTravelDebugger.fromSource(`
let x = 10
let y = 20
let z = x + y
`);
  });

  it('starts at step 0, isAtStart=true', () => {
    const s = dbg.getCurrentState();
    expect(s.currentStep).toBe(0);
    expect(s.isAtStart).toBe(true);
    expect(s.isAtEnd).toBe(false);
  });

  it('gotoEnd() places cursor at last step, isAtEnd=true', () => {
    const s = dbg.gotoEnd();
    expect(s.isAtEnd).toBe(true);
    expect(s.currentStep).toBe(dbg.totalSteps - 1);
  });

  it('stepForward / stepBackward move by one and clamp at the ends', () => {
    expect(dbg.stepForward().currentStep).toBe(1);
    dbg.gotoStep(5);
    expect(dbg.stepBackward().currentStep).toBe(4);
    dbg.restart();
    expect(dbg.stepBackward().currentStep).toBe(0);
    dbg.gotoEnd();
    expect(dbg.stepForward().currentStep).toBe(dbg.totalSteps - 1);
  });

  it('gotoStep clamps to valid range', () => {
    dbg.gotoStep(-99);
    expect(dbg.currentStep).toBe(0);
    dbg.gotoStep(999999);
    expect(dbg.currentStep).toBe(dbg.totalSteps - 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Variable state', () => {
  it('globals appear only once defined', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let x = 10
let y = 20
let z = x + y
`);
    const timeline = dbg.getTimeline();
    const assignX = timeline.findIndex(e => e.varName === 'x' && e.type === 'assign');
    const assignY = timeline.findIndex(e => e.varName === 'y' && e.type === 'assign');
    const assignZ = timeline.findIndex(e => e.varName === 'z' && e.type === 'assign');

    let snap = dbg.gotoStep(assignX).snapshot;
    expect(globalOf(snap, 'x')).toBe('10');
    expect(globalOf(snap, 'y')).toBeUndefined();

    snap = dbg.gotoStep(assignY).snapshot;
    expect(globalOf(snap, 'y')).toBe('20');
    expect(globalOf(snap, 'z')).toBeUndefined();

    snap = dbg.gotoStep(assignZ).snapshot;
    expect(globalOf(snap, 'z')).toBe('30');
  });

  it('earlier values are visible after stepping backward', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let counter = 0
counter = 1
counter = 2
counter = 3
`);
    const steps = dbg.getTimeline()
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.varName === 'counter' && e.type === 'assign');
    expect(steps.length).toBe(4);
    for (const { e, i } of [...steps].reverse()) {
      expect(globalOf(dbg.gotoStep(i).snapshot, 'counter')).toBe(e.varValue);
    }
  });

  it('marks the variable written by the current step as changed', () => {
    const dbg = TimeTravelDebugger.fromSource('let n = 0\nn = 1');
    const step = dbg.getTimeline().findIndex(e => e.varName === 'n' && e.varValue === '1');
    const n = dbg.gotoStep(step).snapshot.globals.find(v => v.name === 'n');
    expect(n?.changed).toBe(true);
    const other = dbg.gotoStep(step + 1).snapshot.globals.find(v => v.name === 'n');
    expect(other?.changed).toBe(false);
  });

  it('names locals correctly when sibling blocks reuse a stack slot', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn f() {
  if true {
    let first = 1
    print(first)
  }
  if true {
    let second = 2
    print(second)
  }
}
f()
`);
    const prints = dbg.getTimeline().filter(e => e.type === 'print').map(e => e.stepIndex);
    expect(localsOf(dbg.snapshotAt(prints[0]!))).toEqual({ first: '1' });
    expect(localsOf(dbg.snapshotAt(prints[1]!))).toEqual({ second: '2' });
  });

  it('shows a block local only while it is in scope', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn g(a) {
  let total = a
  for item in [1, 2] {
    let doubled = item * 2
    total += doubled
  }
  return total
}
print(g(5))
`);
    const timeline = dbg.getTimeline();
    const inLoop = timeline.findIndex(e => e.varName === 'total' && e.varValue === '7');
    expect(localsOf(dbg.snapshotAt(inLoop))).toEqual({ a: '5', total: '7', item: '1', doubled: '2' });
    const ret = timeline.findIndex(e => e.type === 'return' && e.fnName === 'g');
    expect(localsOf(dbg.snapshotAt(ret - 1))).toEqual({ a: '5', total: '11' });
  });

  it('shows variables captured by a closure', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn makeCounter(start) {
  let count = start
  fn inc() {
    count += 1
    return count
  }
  return inc
}
let c = makeCounter(5)
c()
`);
    const write = dbg.getTimeline().findIndex(e => e.varName === 'count' && e.varValue === '6');
    const top = dbg.snapshotAt(write).frames.at(-1)!;
    expect(top.fnName).toBe('inc');
    expect(top.locals).toContainEqual(expect.objectContaining({ name: 'count', displayValue: '6', captured: true, changed: true }));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Call stack', () => {
  it('tracks call frames on call and return', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn add(a, b) {
  let temp = a + b
  return temp
}
let res = add(3, 4)
`);
    const insideAdd = allSnapshots(dbg).findIndex(s => s.frames.at(-1)?.fnName === 'add');
    expect(insideAdd).toBeGreaterThan(-1);
    const frames = dbg.gotoStep(insideAdd).snapshot.frames;
    expect(frames.map(f => f.fnName)).toEqual(['main', 'add']);
    expect(localsOf(dbg.getCurrentSnapshot())).toMatchObject({ a: '3', b: '4' });
  });

  it('call stack shrinks after the function returns', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn double(x) { return x * 2 }
let r = double(5)
`);
    const returnStep = dbg.getTimeline().findIndex(e => e.type === 'return' && e.fnName === 'double');
    const snap = dbg.gotoStep(returnStep).snapshot;
    expect(snap.event.fnName).toBe('double');
    expect(snap.frames.length).toBe(1);
  });

  it('recursion builds up the call stack', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn fact(n) {
  if n <= 1 { return 1 }
  return n * fact(n - 1)
}
let r = fact(4)
`);
    const maxDepth = Math.max(...allSnapshots(dbg).map(s => s.frames.length));
    expect(maxDepth).toBe(5); // main + fact(4..1)
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Line stepping (forward and reverse)', () => {
  const src = `fn square(n) {
  let r = n * n
  return r
}
let a = square(3)
let b = square(4)
print(a + b)`;

  const lineOf = (dbg: TimeTravelDebugger) => dbg.getCurrentSnapshot().sourceLine;

  it('stepOver moves line by line in the same function', () => {
    const dbg = TimeTravelDebugger.fromSource(src);
    const lines = [lineOf(dbg)];
    while (!dbg.getCurrentState().isAtEnd) lines.push(lineOf(dbg.stepOver() && dbg));
    expect(lines.slice(0, 4)).toEqual([1, 5, 6, 7]);
  });

  it('stepInto enters a call and stepOut returns to the caller', () => {
    const dbg = TimeTravelDebugger.fromSource(src);
    dbg.stepOver(); // line 5: let a = square(3)
    dbg.stepInto();
    expect(lineOf(dbg)).toBe(2);
    expect(dbg.getCallStack().at(-1)!.fnName).toBe('square');
    dbg.stepOut();
    expect(dbg.getCallStack().length).toBe(1);
    expect(lineOf(dbg)).toBe(5);
  });

  it('reverseStepOver walks lines backward, skipping calls', () => {
    const dbg = TimeTravelDebugger.fromSource(src);
    dbg.gotoEnd();
    dbg.reverseStepOver();
    expect(lineOf(dbg)).toBe(7);
    dbg.reverseStepOver();
    expect(lineOf(dbg)).toBe(6);
    dbg.reverseStepOver();
    expect(lineOf(dbg)).toBe(5);
    expect(dbg.getCallStack().length).toBe(1);
  });

  it('reverseStepInto enters the callee backward, like gdb reverse-step', () => {
    const dbg = TimeTravelDebugger.fromSource(src);
    dbg.stepOver();
    dbg.stepOver(); // line 6, after square(3) returned
    const lines: number[] = [];
    for (let i = 0; i < 3; i++) lines.push(lineOf(dbg.reverseStepInto() && dbg));
    expect(lines).toEqual([3, 2, 5]);
    expect(dbg.getCallStack().length).toBe(1);
  });

  it('reverseStepOut goes back to the line that made the call', () => {
    const dbg = TimeTravelDebugger.fromSource(src);
    dbg.stepOver();
    dbg.stepOver();
    dbg.stepInto(); // inside square(4)
    expect(lineOf(dbg)).toBe(2);
    dbg.reverseStepOut();
    expect(lineOf(dbg)).toBe(6);
    expect(dbg.getCallStack().length).toBe(1);
  });

  it('stepOver treats each loop iteration of a one-line loop as a new line', () => {
    const dbg = TimeTravelDebugger.fromSource('let i = 0\nwhile i < 3 { i += 1 }\nprint(i)');
    dbg.stepOver();
    const visits: string[] = [];
    while (!dbg.getCurrentState().isAtEnd && lineOf(dbg) === 2) {
      visits.push(globalOf(dbg.getCurrentSnapshot(), 'i')!);
      dbg.stepOver();
    }
    expect(visits.length).toBeGreaterThanOrEqual(4);
    expect(lineOf(dbg)).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Breakpoints', () => {
  const loopSrc = `let total = 0
let i = 0
while i < 6 {
  total += i
  i += 1
}
print(total)`;

  it('setBreakpoint / removeBreakpoint / toggle / clear', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1');
    dbg.setBreakpoint(1);
    dbg.setBreakpoint(5);
    expect(dbg.getBreakpoints().length).toBe(2);
    dbg.removeBreakpoint(1);
    expect(dbg.getBreakpoints()).toEqual([{ line: 5, enabled: true }]);
    dbg.toggleBreakpoint(3);
    dbg.toggleBreakpoint(5);
    expect(dbg.getBreakpoints().map(b => b.line)).toEqual([3]);
    dbg.clearBreakpoints();
    expect(dbg.getBreakpoints().length).toBe(0);
  });

  it('continue stops at each hit, then at the end', () => {
    const dbg = TimeTravelDebugger.fromSource(loopSrc);
    dbg.setBreakpoint(4);
    const seen: string[] = [];
    for (;;) {
      const state = dbg.continueToBreakpoint();
      if (state.isAtEnd) break;
      expect(state.snapshot.sourceLine).toBe(4);
      seen.push(globalOf(state.snapshot, 'i')!);
    }
    expect(seen).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('reverseContinue runs backward to the previous hit', () => {
    const dbg = TimeTravelDebugger.fromSource(loopSrc);
    dbg.setBreakpoint(4);
    dbg.gotoEnd();
    expect(globalOf(dbg.reverseContinue().snapshot, 'i')).toBe('5');
    expect(globalOf(dbg.reverseContinue().snapshot, 'i')).toBe('4');
  });

  it('a conditional breakpoint only stops where the condition is true', () => {
    const dbg = TimeTravelDebugger.fromSource(loopSrc);
    dbg.setBreakpoint(4, 'i == 3 or total > 100');
    const state = dbg.continueToBreakpoint();
    expect(state.snapshot.sourceLine).toBe(4);
    expect(globalOf(state.snapshot, 'i')).toBe('3');
    expect(dbg.continueToBreakpoint().isAtEnd).toBe(true);
    expect(dbg.getBreakpoints()[0]!.condition).toBe('i == 3 or total > 100');
  });

  it('conditions can read locals, and their side effects do not leak', () => {
    const dbg = TimeTravelDebugger.fromSource(`fn f(items) {
  let n = len(items)
  return n
}
let data = [1, 2, 3]
print(f(data))
print(len(data))`);
    dbg.setBreakpoint(3, 'items.pop() == 3 and n == 3');
    expect(dbg.continueToBreakpoint().snapshot.sourceLine).toBe(3);
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output).toEqual(['3', '3']);
  });

  it('rejects a condition that does not parse', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1');
    expect(() => dbg.setBreakpoint(1, 'x ==')).toThrow(/breakpoint condition/);
  });

  it('getBreakpointHits lists the steps where Continue would stop', () => {
    const dbg = TimeTravelDebugger.fromSource(loopSrc);
    expect(dbg.getBreakpointHits()).toEqual([]);
    dbg.setBreakpoint(4, 'i % 2 == 1');
    const hits = dbg.getBreakpointHits();
    const stops: number[] = [];
    for (let state = dbg.restart(); !(state = dbg.continueToBreakpoint()).isAtEnd;) stops.push(state.currentStep);
    expect(hits).toEqual(stops);
    expect(hits.length).toBe(3);
    expect(dbg.getBreakpointHits(2)).toEqual(hits.slice(0, 2));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Run overview', () => {
  const CALL_SRC = `fn f(a) {
  return a + 1
}
let x = f(1)
print(x)`;

  it('summarizes every step when there are more buckets than steps', () => {
    const dbg = TimeTravelDebugger.fromSource(CALL_SRC);
    const overview = dbg.getOverview(10_000);
    expect(overview.totalSteps).toBe(dbg.totalSteps);
    expect(overview.kinds.length).toBe(dbg.totalSteps);
    const events = dbg.getTimeline();
    expect(Array.from(overview.kinds, k => EVENT_KINDS[k])).toEqual(events.map(e => e.type));
    // Instructions on line 2 run inside f(); everything else at the top level.
    events.forEach((e, i) => expect(overview.depths[i]).toBe(e.loc.line === 2 ? 2 : 1));
  });

  it('keeps the most notable kind and the deepest call in each bucket', () => {
    const dbg = TimeTravelDebugger.fromSource(CALL_SRC);
    const { kinds, depths } = dbg.getOverview(1);
    expect(EVENT_KINDS[kinds[0]!]).toBe('call');
    expect(depths[0]).toBe(2);
    expect(dbg.getOverview(0).kinds.length).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Watchpoints (when did this variable change?)', () => {
  it("lineOf reads a step's line without replaying", () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1\nlet y = 2\nx = 5');
    const lastX = dbg.findChange('x', 'backward', dbg.totalSteps);
    expect(dbg.lineOf(lastX)).toBe(3);
    expect(dbg.lineOf(0)).toBe(1);
    expect(dbg.lineOf(-1)).toBe(0);
    expect(dbg.lineOf(dbg.totalSteps)).toBe(0);
  });

  it('finds the previous and next write to a variable', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1\nlet y = 2\nx = 5\ny = 3\nx = 9');
    const end = dbg.totalSteps - 1;
    const last = dbg.findChange('x', 'backward', end);
    expect(globalOf(dbg.snapshotAt(last), 'x')).toBe('9');
    const before = dbg.findChange('x', 'backward', last);
    expect(globalOf(dbg.snapshotAt(before), 'x')).toBe('5');
    expect(dbg.findChange('x', 'forward', before)).toBe(last);
    expect(dbg.findChange('x', 'forward', last)).toBe(-1);
    expect(dbg.findChange('nope', 'backward')).toBe(-1);
  });

  it('counts writes through an array element or method as changes', () => {
    const dbg = TimeTravelDebugger.fromSource(`let arr = [0, 0]
let other = 1
arr[1] = 7
other = 2
arr.push(3)
print(arr)`);
    const end = dbg.totalSteps - 1;
    const push = dbg.findChange('arr', 'backward', end);
    expect(dbg.snapshotAt(push).sourceLine).toBe(5);
    const index = dbg.findChange('arr', 'backward', push);
    expect(dbg.snapshotAt(index).sourceLine).toBe(3);
    expect(globalOf(dbg.snapshotAt(index), 'arr')).toBe('[0, 7]');
  });

  it('finds the off-by-one in buggy.ct: the last write to hi before returning -1', () => {
    const dbg = TimeTravelDebugger.fromSource(readExample('buggy.ct'));
    const timeline = dbg.getTimeline();
    const wrong = timeline.findIndex(e => e.type === 'return' && e.fnName === 'binarySearch' && e.description.endsWith('-1'));
    expect(wrong).toBeGreaterThan(-1);
    const write = dbg.findChange('hi', 'backward', wrong);
    expect(write).toBeGreaterThan(-1);
    expect(dbg.snapshotAt(write).frames.at(-1)!.fnName).toBe('binarySearch');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Loops, lines and errors', () => {
  it('records one loop event per while iteration', () => {
    const dbg = TimeTravelDebugger.fromSource('let i = 0\nwhile i < 3 {\n  i += 1\n}');
    expect(dbg.getTimeline().filter(e => e.type === 'loop').length).toBe(3);
  });

  it('records one loop event per for-in element', () => {
    const dbg = TimeTravelDebugger.fromSource('let arr = [10, 20, 30]\nfor x in arr {\n  let _ = x\n}');
    expect(dbg.getTimeline().filter(e => e.type === 'loop').length).toBe(3);
  });

  it('getStepsForLine and getLineHits report how often a line ran', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 0\nwhile x < 3 {\n  x += 1\n}');
    expect(dbg.getStepsForLine(3).length).toBeGreaterThanOrEqual(3);
    expect(dbg.getLineHits().get(3)).toBe(3);
    expect(dbg.getLineHits().get(1)).toBe(1);
  });

  it('records a runtime error as the last step', () => {
    const dbg = TimeTravelDebugger.fromSource('let arr = [1, 2, 3]\nlet x = arr[999]');
    expect(dbg.hasRecordingError).toBe(true);
    expect(dbg.recordingErrorMessage).toContain('out of bounds');
    expect(dbg.runtimeError?.loc.line).toBe(2);
    const last = dbg.gotoEnd().snapshot;
    expect(last.event.type).toBe('error');
    expect(last.sourceLine).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Example programs', () => {
  it('debugs hello.ct', () => {
    const dbg = TimeTravelDebugger.fromSource(readExample('hello.ct'));
    expect(dbg.gotoEnd().snapshot.output.length).toBeGreaterThan(0);
  });

  it('fibonacci.ct has call events', () => {
    const dbg = TimeTravelDebugger.fromSource(readExample('fibonacci.ct'));
    expect(dbg.getTimeline().some(e => e.type === 'call')).toBe(true);
  });

  it('closures.ct has closure creation events', () => {
    const dbg = TimeTravelDebugger.fromSource(readExample('closures.ct'));
    expect(dbg.getTimeline().some(e => e.description.includes('closure'))).toBe(true);
  });

  it('buggy.ct calls binarySearch and supports a full reverse round trip', () => {
    const dbg = TimeTravelDebugger.fromSource(readExample('buggy.ct'));
    expect(dbg.getTimeline().some(e => e.type === 'call' && e.fnName === 'binarySearch')).toBe(true);
    const endStep = dbg.gotoEnd().currentStep;
    expect(dbg.restart().currentStep).toBe(0);
    expect(dbg.gotoStep(endStep).currentStep).toBe(endStep);
  });
});
