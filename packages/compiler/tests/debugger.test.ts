import { describe, it, expect } from 'vitest';
import { TimeTravelDebugger } from '../src/debugger/debugger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Time-Travel Debugger — Execution State Tracking', () => {
  it('records execution history for a simple program', () => {
    const src = `
let x = 10
let y = 20
let result = x + y
print("result:", result)
`;
    const dbg = TimeTravelDebugger.fromSource(src);
    expect(dbg.totalSteps).toBeGreaterThan(0);
    expect(dbg.getTimeline().length).toBe(dbg.totalSteps);

    // Initial step (step 0)
    dbg.restart();
    const state0 = dbg.getCurrentState();
    expect(state0.currentStep).toBe(0);
    expect(state0.isAtStart).toBe(true);

    // Jump to end
    dbg.gotoEnd();
    const stateEnd = dbg.getCurrentState();
    expect(stateEnd.isAtEnd).toBe(true);
    expect(stateEnd.snapshot.output).toEqual(['result: 30']);
  });

  it('allows stepping forward and backward, restoring exact variable values', () => {
    const src = `
let x = 10
let y = 20
let z = x + y
`;
    const dbg = TimeTravelDebugger.fromSource(src);

    // Find the step where x is assigned 10
    const assignXStep = dbg.getTimeline().findIndex(e => e.varName === 'x' && e.varValue === '10');
    expect(assignXStep).toBeGreaterThan(-1);

    // Find the step where y is assigned 20
    const assignYStep = dbg.getTimeline().findIndex(e => e.varName === 'y' && e.varValue === '20');
    expect(assignYStep).toBeGreaterThan(assignXStep);

    // Find the step where z is assigned 30
    const assignZStep = dbg.getTimeline().findIndex(e => e.varName === 'z' && e.varValue === '30');
    expect(assignZStep).toBeGreaterThan(assignYStep);

    // Move to step where z = 30
    dbg.gotoStep(assignZStep);
    let vars = dbg.getVariables();
    const findGlobal = (name: string) => vars.globals.find(g => g.name === name);

    expect(findGlobal('x')?.displayValue).toBe('10');
    expect(findGlobal('y')?.displayValue).toBe('20');
    expect(findGlobal('z')?.displayValue).toBe('30');

    // Step BACKWARD to before z was calculated
    dbg.gotoStep(assignYStep);
    vars = dbg.getVariables();
    expect(findGlobal('x')?.displayValue).toBe('10');
    expect(findGlobal('y')?.displayValue).toBe('20');
    expect(findGlobal('z')).toBeUndefined();

    // Step BACKWARD to before y was calculated
    dbg.gotoStep(assignXStep);
    vars = dbg.getVariables();
    expect(findGlobal('x')?.displayValue).toBe('10');
    expect(findGlobal('y')).toBeUndefined();
    expect(findGlobal('z')).toBeUndefined();
  });

  it('tracks call stack frames during function calls and returns', () => {
    const src = `
fn add(a, b) {
  let temp = a + b
  return temp
}

let res = add(10, 20)
`;
    const dbg = TimeTravelDebugger.fromSource(src);

    // Find a step inside add()
    const insideAddStep = dbg.history.findIndex(s => s.frames.some(f => f.fnName === 'add'));
    expect(insideAddStep).toBeGreaterThan(-1);

    dbg.gotoStep(insideAddStep);
    const frames = dbg.getCallStack();
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[frames.length - 1]?.fnName).toBe('add');

    // Inspect local parameters in add()
    const locals = frames[frames.length - 1]!.locals;
    const aVar = locals.find(l => l.name === 'a');
    const bVar = locals.find(l => l.name === 'b');
    expect(aVar?.displayValue).toBe('10');
    expect(bVar?.displayValue).toBe('20');

    // Step backward to main before call
    dbg.gotoStep(0);
    expect(dbg.getCallStack().length).toBe(1); // main
  });

  it('tracks source locations for line highlighting', () => {
    const src = `
let a = 1
let b = 2
let c = 3
`;
    const dbg = TimeTravelDebugger.fromSource(src);
    for (const snap of dbg.getHistory()) {
      expect(snap.sourceLine).toBeGreaterThan(0);
      expect(snap.sourceColumn).toBeGreaterThan(0);
    }
  });

  it('demonstrates debugging on the intentionally buggy program (buggy.ct)', () => {
    const examplesDir = path.resolve(__dirname, '../../../examples');
    const src = fs.readFileSync(path.join(examplesDir, 'buggy.ct'), 'utf-8');
    const dbg = TimeTravelDebugger.fromSource(src);

    expect(dbg.totalSteps).toBeGreaterThan(0);

    // Verify timeline has events
    const timeline = dbg.getTimeline();
    expect(timeline.some(e => e.type === 'call' && e.fnName === 'binarySearch')).toBe(true);

    // Step to end
    dbg.gotoEnd();
    const finalOutput = dbg.getCurrentSnapshot().output;
    expect(finalOutput.length).toBeGreaterThan(0);

    // Step backward through history
    dbg.stepBackward();
    expect(dbg.currentStep).toBe(dbg.totalSteps - 2);

    // Direct jump to step 0
    dbg.restart();
    expect(dbg.currentStep).toBe(0);
  });
});
