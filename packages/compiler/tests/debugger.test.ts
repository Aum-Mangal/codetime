import { describe, it, expect, beforeEach } from 'vitest';
import { TimeTravelDebugger } from '../src/debugger/debugger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const examplesDir = path.resolve(__dirname, '../../../examples');

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — History Recording', () => {
  it('records a non-empty history for any valid program', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1');
    expect(dbg.totalSteps).toBeGreaterThan(0);
    expect(dbg.history.length).toBe(dbg.totalSteps);
  });

  it('every snapshot has a valid source location', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let a = 1
let b = 2
let c = a + b
`);
    for (const snap of dbg.history) {
      expect(snap.sourceLine).toBeGreaterThan(0);
      expect(snap.sourceColumn).toBeGreaterThan(0);
    }
  });

  it('timeline length equals totalSteps', () => {
    const dbg = TimeTravelDebugger.fromSource('print("hi")');
    expect(dbg.getTimeline().length).toBe(dbg.totalSteps);
  });

  it('output accumulates correctly through execution', () => {
    const dbg = TimeTravelDebugger.fromSource(`
print("a")
print("b")
print("c")
`);
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output).toEqual(['a', 'b', 'c']);
  });

  it('captures a "print" event type in the timeline', () => {
    const dbg = TimeTravelDebugger.fromSource('print("hello")');
    const printEvents = dbg.getTimeline().filter(e => e.type === 'print');
    expect(printEvents.length).toBeGreaterThan(0);
    expect(printEvents[0]!.description).toContain('hello');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Navigation (stepForward / stepBackward / gotoStep)', () => {
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

  it('stepForward advances by 1', () => {
    dbg.restart();
    const s = dbg.stepForward();
    expect(s.currentStep).toBe(1);
  });

  it('stepBackward decrements by 1', () => {
    dbg.gotoStep(5);
    const s = dbg.stepBackward();
    expect(s.currentStep).toBe(4);
  });

  it('stepBackward does not go below 0', () => {
    dbg.restart();
    dbg.stepBackward();
    expect(dbg.currentStep).toBe(0);
  });

  it('stepForward does not exceed last step', () => {
    dbg.gotoEnd();
    dbg.stepForward();
    expect(dbg.currentStep).toBe(dbg.totalSteps - 1);
  });

  it('gotoStep clamps to valid range', () => {
    dbg.gotoStep(-99);
    expect(dbg.currentStep).toBe(0);
    dbg.gotoStep(999999);
    expect(dbg.currentStep).toBe(dbg.totalSteps - 1);
  });

  it('restart() resets to step 0', () => {
    dbg.gotoEnd();
    dbg.restart();
    expect(dbg.currentStep).toBe(0);
    expect(dbg.getCurrentState().isAtStart).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Variable State Restoration', () => {
  it('globals are undefined before their assignment step', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let x = 10
let y = 20
let z = x + y
`);
    // Find the step where x is first defined
    const assignX = dbg.getTimeline().findIndex(e => e.varName === 'x' && e.type === 'assign');
    expect(assignX).toBeGreaterThan(-1);

    // Find y and z
    const assignY = dbg.getTimeline().findIndex(e => e.varName === 'y' && e.type === 'assign');
    const assignZ = dbg.getTimeline().findIndex(e => e.varName === 'z' && e.type === 'assign');

    // At the step x was assigned, only x exists
    dbg.gotoStep(assignX);
    let g = dbg.getCurrentSnapshot().globals;
    expect(g.find(v => v.name === 'x')?.displayValue).toBe('10');
    expect(g.find(v => v.name === 'y')).toBeUndefined();

    // At the step y was assigned, x & y exist, z does not
    dbg.gotoStep(assignY);
    g = dbg.getCurrentSnapshot().globals;
    expect(g.find(v => v.name === 'x')?.displayValue).toBe('10');
    expect(g.find(v => v.name === 'y')?.displayValue).toBe('20');
    expect(g.find(v => v.name === 'z')).toBeUndefined();

    // At the step z was assigned, all three exist
    dbg.gotoStep(assignZ);
    g = dbg.getCurrentSnapshot().globals;
    expect(g.find(v => v.name === 'z')?.displayValue).toBe('30');
  });

  it('variable values can be observed at earlier steps after stepping backward', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let counter = 0
counter = 1
counter = 2
counter = 3
`);
    // Find all counter assignment steps
    const steps = dbg.getTimeline()
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.varName === 'counter' && e.type === 'assign');

    expect(steps.length).toBeGreaterThanOrEqual(4);

    // At each step, counter holds the corresponding value
    for (const { e, i } of steps) {
      dbg.gotoStep(i);
      const g = dbg.getCurrentSnapshot().globals;
      const v = g.find(x => x.name === 'counter');
      expect(v?.displayValue).toBe(e.varValue);
    }
  });

  it('changed flag is set on a variable when its value changes', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let n = 0
n = 1
`);
    const mutateStep = dbg.getTimeline().findIndex(e => e.varName === 'n' && e.varValue === '1');
    expect(mutateStep).toBeGreaterThan(-1);

    dbg.gotoStep(mutateStep);
    const g = dbg.getCurrentSnapshot().globals;
    const nVar = g.find(v => v.name === 'n');
    expect(nVar?.changed).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Call Stack Frames', () => {
  it('tracks call frames correctly on function call and return', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn add(a, b) {
  let temp = a + b
  return temp
}
let res = add(3, 4)
`);
    // Find a step inside add()
    const insideAdd = dbg.history.findIndex(s => s.frames.length >= 2 && s.frames[s.frames.length - 1]?.fnName === 'add');
    expect(insideAdd).toBeGreaterThan(-1);

    dbg.gotoStep(insideAdd);
    const frames = dbg.getCallStack();
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[frames.length - 1]?.fnName).toBe('add');

    // Parameters a and b should be visible
    const topLocals = frames[frames.length - 1]!.locals;
    expect(topLocals.find(l => l.name === 'a')?.displayValue).toBe('3');
    expect(topLocals.find(l => l.name === 'b')?.displayValue).toBe('4');
  });

  it('call stack shrinks after function returns', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn double(x) { return x * 2 }
let r = double(5)
`);
    // Find the return event
    const returnStep = dbg.history.findIndex(s => s.event.type === 'return' && s.event.fnName === 'double');
    expect(returnStep).toBeGreaterThan(-1);

    dbg.gotoStep(returnStep);
    // The snapshot is captured AFTER OP_RETURN executes, so we're already back in 'main'
    const snap = dbg.getCurrentSnapshot();
    // The return event's fnName tells us which function returned
    expect(snap.event.fnName).toBe('double');

    // The frame stack should now have returned to just main
    expect(snap.frames.length).toBe(1);
  });

  it('recursive call builds up the call stack', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn fact(n) {
  if n <= 1 { return 1 }
  return n * fact(n - 1)
}
let r = fact(4)
`);
    // Find deepest call stack
    const maxDepth = Math.max(...dbg.history.map(s => s.frames.length));
    expect(maxDepth).toBeGreaterThanOrEqual(5); // main + fact(4) + fact(3) + fact(2) + fact(1)
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Closures and Upvalues', () => {
  it('captures closure upvalue state at each step', () => {
    const dbg = TimeTravelDebugger.fromSource(`
fn makeCounter(start) {
  let count = start
  fn inc() {
    count += 1
    return count
  }
  return inc
}
let c = makeCounter(0)
let r1 = c()
let r2 = c()
`);
    // r1 should be 1, r2 should be 2
    const r1Step = dbg.getTimeline().findIndex(e => e.varName === 'r1' && e.type === 'assign');
    const r2Step = dbg.getTimeline().findIndex(e => e.varName === 'r2' && e.type === 'assign');

    expect(r1Step).toBeGreaterThan(-1);
    expect(r2Step).toBeGreaterThan(r1Step);

    dbg.gotoStep(r1Step);
    expect(dbg.getCurrentSnapshot().globals.find(g => g.name === 'r1')?.displayValue).toBe('1');

    dbg.gotoStep(r2Step);
    expect(dbg.getCurrentSnapshot().globals.find(g => g.name === 'r2')?.displayValue).toBe('2');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Breakpoints API', () => {
  it('setBreakpoint / removeBreakpoint / getBreakpoints', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1');
    dbg.setBreakpoint(1);
    dbg.setBreakpoint(5);
    expect(dbg.getBreakpoints().length).toBe(2);

    dbg.removeBreakpoint(1);
    expect(dbg.getBreakpoints().length).toBe(1);
    expect(dbg.getBreakpoints()[0]!.line).toBe(5);

    dbg.clearBreakpoints();
    expect(dbg.getBreakpoints().length).toBe(0);
  });

  it('toggleBreakpoint adds and removes', () => {
    const dbg = TimeTravelDebugger.fromSource('let x = 1');
    dbg.toggleBreakpoint(3);
    expect(dbg.getBreakpoints().length).toBe(1);
    dbg.toggleBreakpoint(3);
    expect(dbg.getBreakpoints().length).toBe(0);
  });

  it('continueToBreakpoint stops at the breakpointed line', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let a = 1
let b = 2
let c = 3
`);
    dbg.restart();

    // Find line number for "let b = 2" (line 3 with blank first line)
    const bStep = dbg.getTimeline().findIndex(e => e.varName === 'b' && e.type === 'assign');
    const bLine = dbg.history[bStep]!.sourceLine;

    dbg.setBreakpoint(bLine);
    dbg.continueToBreakpoint();

    // Should have stopped at or after the b assignment
    expect(dbg.getCurrentSnapshot().sourceLine).toBe(bLine);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — stepOver()', () => {
  it('stepOver skips low-level steps to reach the next significant event', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let x = 10
let y = 20
`);
    dbg.restart();

    const start = dbg.currentStep;
    dbg.stepOver();

    // Should have advanced to next assign/call/return/print
    const snap = dbg.getCurrentSnapshot();
    const interestingTypes = ['assign', 'call', 'return', 'print', 'halt', 'error'];
    expect(interestingTypes).toContain(snap.event.type);
    expect(dbg.currentStep).toBeGreaterThan(start);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Loop Iteration Tracking', () => {
  it('captures loop event for each iteration of a while loop', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let i = 0
while i < 3 {
  i += 1
}
`);
    const loopEvents = dbg.getTimeline().filter(e => e.type === 'loop');
    // 3 iterations = 3 loop-back events
    expect(loopEvents.length).toBe(3);
  });

  it('for-in loop tracks loop events for each element', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let arr = [10, 20, 30]
for x in arr {
  let _ = x
}
`);
    const loopEvents = dbg.getTimeline().filter(e => e.type === 'loop');
    expect(loopEvents.length).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — getStepsForLine()', () => {
  it('returns all step indices that executed on a given line', () => {
    const src = `let x = 0
while x < 3 {
  x += 1
}`;
    const dbg = TimeTravelDebugger.fromSource(src);

    // Line 3 is "x += 1" — should execute 3 times
    const line3Steps = dbg.getStepsForLine(3);
    expect(line3Steps.length).toBeGreaterThanOrEqual(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Runtime Error Handling', () => {
  it('captures a runtime error as an error snapshot and marks hasRecordingError', () => {
    const dbg = TimeTravelDebugger.fromSource(`
let arr = [1, 2, 3]
let x = arr[999]
`);
    expect(dbg.hasRecordingError).toBe(true);
    expect(dbg.recordingErrorMessage).toContain('out of bounds');

    // Last snapshot should be an error event
    const lastSnap = dbg.history[dbg.history.length - 1];
    expect(lastSnap?.event.type).toBe('error');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TimeTravelDebugger — Integration: Example Programs', () => {
  it('debugs hello.ct', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'hello.ct'), 'utf-8');
    const dbg = TimeTravelDebugger.fromSource(src);
    dbg.gotoEnd();
    expect(dbg.getCurrentSnapshot().output.length).toBeGreaterThan(0);
  });

  it('debugs fibonacci.ct — timeline has call events', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'fibonacci.ct'), 'utf-8');
    const dbg = TimeTravelDebugger.fromSource(src);
    const callEvents = dbg.getTimeline().filter(e => e.type === 'call');
    expect(callEvents.length).toBeGreaterThan(0);
  });

  it('debugs closures.ct — closure creation events in timeline', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'closures.ct'), 'utf-8');
    const dbg = TimeTravelDebugger.fromSource(src);
    const closureEvents = dbg.getTimeline().filter(e => e.description.includes('closure'));
    expect(closureEvents.length).toBeGreaterThan(0);
  });

  it('debugs buggy.ct — timeline contains call events for binarySearch', () => {
    const src = fs.readFileSync(path.join(examplesDir, 'buggy.ct'), 'utf-8');
    const dbg = TimeTravelDebugger.fromSource(src);
    const callEvents = dbg.getTimeline().filter(e => e.type === 'call' && e.fnName === 'binarySearch');
    expect(callEvents.length).toBeGreaterThan(0);

    // Full reverse-navigation round trip
    dbg.gotoEnd();
    const endStep = dbg.currentStep;
    dbg.restart();
    expect(dbg.currentStep).toBe(0);
    dbg.gotoStep(endStep);
    expect(dbg.currentStep).toBe(endStep);
  });
});
