/**
 * Record-and-replay time-travel debugger.
 *
 * Recording runs the program once on the real VM and keeps two things:
 *   1. a compact event log with one entry per executed instruction
 *      (trace.ts: line, call depth, event kind, variable written, ...), and
 *   2. a full copy of the VM state every `checkpointInterval` steps.
 *
 * To show step n, the debugger restores the nearest checkpoint before n into
 * a scratch VM and re-executes the remaining steps. The VM is deterministic
 * (no clock, randomness or input), so the replayed state is exactly the state
 * the program had. Seeking costs at most one interval of re-execution, and
 * stepping forward from the current position costs one instruction.
 *
 * Memory is O(T * 20 bytes + C * S) for T steps, C checkpoints and state size
 * S, instead of O(T * S) for a snapshot per step. C is capped: when there are
 * too many checkpoints, every other one is dropped and the interval doubles.
 *
 * Line stepping, reverse stepping, breakpoints and watchpoints are answered
 * from the event log alone; only the step finally displayed is replayed.
 */
import { compile } from '../pipeline.js';
import type { Chunk } from '../codegen/chunk.js';
import { BytecodeCompiler } from '../codegen/compiler.js';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import type { SourceLocation } from '../lexer/token.js';
import { VM, type RuntimeError } from '../vm/vm.js';
import { isTruthy } from '../vm/value.js';
import { CodeTimeError } from '../diagnostics/errors.js';
import { captureState, restoreState, StateCopier, type VMSnapshot } from './snapshot.js';
import { EVENT_KINDS, EventKind, TraceLog } from './trace.js';
import { StepTracer } from './tracer.js';
import { displayValue, frameViews, globalViews, visibleVariables } from './inspect.js';
import type {
  Breakpoint,
  DebuggerEvent,
  DebuggerState,
  ExecutionSnapshot,
  FrameSnapshot,
  RecordingStats,
  VariableSnapshot,
} from './types.js';

export const DEFAULT_MAX_STEPS = 1_000_000;
export const DEFAULT_CHECKPOINT_INTERVAL = 1_000;
export const DEFAULT_MAX_CHECKPOINTS = 200;

/** Breakpoint conditions get a small budget so `while true {}` cannot hang the debugger. */
const CONDITION_MAX_INSTRUCTIONS = 100_000;
const CONDITION_RESULT = '__condition__';

export interface RecordingOptions {
  /** Stop recording after this many steps; the recording is then marked truncated. */
  maxSteps?: number;
  /** Steps between checkpoints. Smaller seeks faster but uses more memory. */
  checkpointInterval?: number;
  /** Upper bound on stored checkpoints; beyond it they are thinned out. */
  maxCheckpoints?: number;
}

export type NavigationCommand =
  | 'stepForward'
  | 'stepBackward'
  | 'stepInto'
  | 'stepOver'
  | 'stepOut'
  | 'reverseStepInto'
  | 'reverseStepOver'
  | 'reverseStepOut'
  | 'continue'
  | 'reverseContinue'
  | 'restart'
  | 'gotoEnd';

interface Checkpoint {
  /** The state is the one after this step ran; -1 is the state before the first step. */
  step: number;
  state: VMSnapshot;
}

interface Recording {
  chunk: Chunk;
  trace: TraceLog;
  checkpoints: Checkpoint[];
  checkpointInterval: number;
  /** Every line the program printed; step n shows the first trace.outputLength[n]. */
  output: string[];
  error: RuntimeError | null;
  truncatedReason: string | null;
  recordMs: number;
}

interface BreakpointEntry extends Breakpoint {
  conditionChunk?: Chunk;
}

/** A VM positioned somewhere in a recording, moved by restoring checkpoints and replaying. */
class Replayer {
  public readonly vm: VM;
  private readonly tracer = new StepTracer();
  /** The step whose resulting state the VM holds. */
  private position = Number.NEGATIVE_INFINITY;
  /** The step described by tracer.step, or -1. */
  private describedStep = -1;

  constructor(source: string, private readonly recording: Recording) {
    this.vm = new VM(source, { maxInstructions: 0 });
  }

  /** Put the VM in the state after `step`; with `describe`, also describe that step. */
  public seek(step: number, describe: boolean): void {
    if (step === this.position && (!describe || this.describedStep === step)) return;

    const runForward = this.position < step && step - this.position <= this.recording.checkpointInterval;
    if (!runForward) {
      // Always restore strictly before `step`, so the step itself is replayed
      // and can be described.
      const checkpoint = this.checkpointBefore(step);
      restoreState(this.vm, checkpoint.state);
      this.position = checkpoint.step;
    }
    while (this.position < step) {
      this.tracer.trace(this.vm, describe && this.position + 1 === step);
      this.position++;
    }
    this.describedStep = describe ? step : -1;
  }

  /** The event for the step the VM was last moved to with `describe`. */
  public event(): DebuggerEvent {
    const s = this.tracer.step;
    const event: DebuggerEvent = {
      type: EVENT_KINDS[s.kind]!,
      description: s.description,
      loc: s.loc,
      stepIndex: this.describedStep,
    };
    if (s.varName !== undefined) event.varName = s.varName;
    if (s.varValue !== undefined) event.varValue = s.varValue;
    if (s.fnName !== undefined) event.fnName = s.fnName;
    return event;
  }

  public instructionPointer(): number {
    return this.tracer.step.ip;
  }

  /** Describe steps `from..to` (inclusive) by replaying them once. */
  public describeRange(from: number, to: number): DebuggerEvent[] {
    this.seek(from, true);
    const events = [this.event()];
    while (this.position < to) {
      this.tracer.trace(this.vm, true);
      this.position++;
      this.describedStep = this.position;
      events.push(this.event());
    }
    return events;
  }

  private checkpointBefore(step: number): Checkpoint {
    const checkpoints = this.recording.checkpoints;
    let lo = 0;
    let hi = checkpoints.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (checkpoints[mid]!.step < step) lo = mid;
      else hi = mid - 1;
    }
    return checkpoints[lo]!;
  }
}

export class TimeTravelDebugger {
  public currentStep = 0;
  public readonly source: string;

  private recording: Recording | null = null;
  private cursor: Replayer | null = null;
  /** Second replayer for queries (timeline windows, conditions) so the cursor stays put. */
  private scratch: Replayer | null = null;
  private readonly breakpoints = new Map<number, BreakpointEntry>();

  constructor(source: string) {
    this.source = source;
  }

  public static fromSource(source: string, options: RecordingOptions | number = {}): TimeTravelDebugger {
    const dbg = new TimeTravelDebugger(source);
    dbg.record(options);
    return dbg;
  }

  // ── Recording ───────────────────────────────────────────────────────────────

  /** Compile and record the program. Throws the first diagnostic if it does not compile. */
  public record(options: RecordingOptions | number = {}): void {
    const opts: RecordingOptions = typeof options === 'number' ? { maxSteps: options } : options;
    const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxCheckpoints = Math.max(2, opts.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS);
    let interval = Math.max(1, opts.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL);

    const compiled = compile(this.source);
    if (!compiled.chunk) throw compiled.diagnostics[0]!;

    const started = Date.now();
    const vm = new VM(this.source, { maxInstructions: 0 });
    vm.load(compiled.chunk);

    const trace = new TraceLog();
    let checkpoints: Checkpoint[] = [{ step: -1, state: captureState(vm) }];
    const tracer = new StepTracer();
    const step = tracer.step;

    // Per call depth: the line of the frame's previous step (-1 right after
    // the frame is entered) and whether that step jumped back in a loop.
    const lastLine: number[] = [];
    const loopedBack: boolean[] = [];
    let previousDepth = 0;
    let truncatedReason: string | null = null;

    while (vm.status === 'running') {
      if (trace.length >= maxSteps) {
        truncatedReason = `Recording stopped after ${maxSteps.toLocaleString('en-US')} steps; the program had not finished.`;
        break;
      }
      tracer.trace(vm, false);

      const depth = step.depth;
      const line = step.loc.line;
      if (depth > previousDepth) {
        lastLine[depth] = -1;
        loopedBack[depth] = false;
      }
      const lineStart = (lastLine[depth] !== line || loopedBack[depth] === true) && step.kind !== EventKind.Loop;
      lastLine[depth] = line;
      loopedBack[depth] = step.kind === EventKind.Loop;
      previousDepth = depth;

      trace.push(line, step.loc.column, depth, step.kind, step.target, vm.output.length, lineStart);

      if (vm.status === 'running' && trace.length % interval === 0) {
        checkpoints.push({ step: trace.length - 1, state: captureState(vm) });
        if (checkpoints.length > maxCheckpoints) {
          interval *= 2;
          checkpoints = checkpoints.filter(c => c.step === -1 || (c.step + 1) % interval === 0);
        }
      }
    }

    this.recording = {
      chunk: compiled.chunk,
      trace,
      checkpoints,
      checkpointInterval: interval,
      output: vm.output,
      error: vm.error,
      truncatedReason,
      recordMs: Date.now() - started,
    };
    this.cursor = new Replayer(this.source, this.recording);
    this.scratch = new Replayer(this.source, this.recording);
    this.currentStep = 0;
  }

  public get totalSteps(): number {
    return this.recording?.trace.length ?? 0;
  }

  public get hasRecordingError(): boolean {
    return this.recording?.error != null;
  }

  public get recordingErrorMessage(): string {
    return this.recording?.error?.message ?? '';
  }

  /** The runtime error that ended the recorded run, if any. */
  public get runtimeError(): RuntimeError | null {
    return this.recording?.error ?? null;
  }

  public get isTruncated(): boolean {
    return this.recording?.truncatedReason != null;
  }

  public getStats(): RecordingStats {
    const rec = this.requireRecording();
    return {
      totalSteps: rec.trace.length,
      checkpoints: rec.checkpoints.length,
      checkpointInterval: rec.checkpointInterval,
      traceBytes: rec.trace.byteLength,
      truncated: rec.truncatedReason !== null,
      ...(rec.truncatedReason !== null ? { truncatedReason: rec.truncatedReason } : {}),
      recordMs: rec.recordMs,
    };
  }

  // ── Instruction-level navigation ───────────────────────────────────────────

  public stepForward(): DebuggerState {
    return this.gotoStep(this.currentStep + 1);
  }

  public stepBackward(): DebuggerState {
    return this.gotoStep(this.currentStep - 1);
  }

  public gotoStep(stepIndex: number): DebuggerState {
    this.currentStep = Math.max(0, Math.min(stepIndex, this.totalSteps - 1));
    return this.getCurrentState();
  }

  public restart(): DebuggerState {
    return this.gotoStep(0);
  }

  public gotoEnd(): DebuggerState {
    return this.gotoStep(this.totalSteps - 1);
  }

  // ── Line-level navigation (forward and reverse) ────────────────────────────

  /** Next line start, entering calls. */
  public stepInto(): DebuggerState {
    return this.gotoStep(this.nextLineStart(() => true));
  }

  /** Next line start in this function or a caller; calls made from this line run to completion. */
  public stepOver(): DebuggerState {
    const depth = this.trace.depth[this.currentStep]!;
    return this.gotoStep(this.nextLineStart(i => this.trace.depth[i]! <= depth));
  }

  /** Run until the current function returns. */
  public stepOut(): DebuggerState {
    const { depth } = this.trace;
    const d = depth[this.currentStep]!;
    for (let i = this.currentStep + 1; i < this.totalSteps; i++) {
      if (depth[i]! < d) return this.gotoStep(i);
    }
    return this.gotoEnd();
  }

  /** Previous line start, entering calls (lands on the last line a callee ran). */
  public reverseStepInto(): DebuggerState {
    return this.gotoStep(this.previousLineStart(this.currentStep, () => true));
  }

  /** Previous line start in this function or a caller, skipping over calls. */
  public reverseStepOver(): DebuggerState {
    const depth = this.trace.depth[this.currentStep]!;
    return this.gotoStep(this.previousLineStart(this.currentStep, i => this.trace.depth[i]! <= depth));
  }

  /** Back to the start of the line that called the current function. */
  public reverseStepOut(): DebuggerState {
    const { depth } = this.trace;
    const d = depth[this.currentStep]!;
    for (let i = this.currentStep - 1; i >= 0; i--) {
      if (depth[i]! < d) {
        const callerDepth = depth[i]!;
        return this.gotoStep(this.previousLineStart(i + 1, j => this.trace.depth[j]! <= callerDepth));
      }
    }
    return this.restart();
  }

  /** Run forward to the next breakpoint whose condition holds (or the end). */
  public continueToBreakpoint(): DebuggerState {
    return this.gotoStep(this.nextLineStart(i => this.breakpointHit(i)));
  }

  /** Run backward to the previous breakpoint whose condition holds (or the start). */
  public reverseContinue(): DebuggerState {
    return this.gotoStep(this.previousLineStart(this.currentStep, i => this.breakpointHit(i)));
  }

  public navigate(command: NavigationCommand): DebuggerState {
    switch (command) {
      case 'stepForward': return this.stepForward();
      case 'stepBackward': return this.stepBackward();
      case 'stepInto': return this.stepInto();
      case 'stepOver': return this.stepOver();
      case 'stepOut': return this.stepOut();
      case 'reverseStepInto': return this.reverseStepInto();
      case 'reverseStepOver': return this.reverseStepOver();
      case 'reverseStepOut': return this.reverseStepOut();
      case 'continue': return this.continueToBreakpoint();
      case 'reverseContinue': return this.reverseContinue();
      case 'restart': return this.restart();
      case 'gotoEnd': return this.gotoEnd();
    }
  }

  private nextLineStart(accept: (step: number) => boolean): number {
    const { lineStart } = this.trace;
    for (let i = this.currentStep + 1; i < this.totalSteps; i++) {
      if (lineStart[i] === 1 && accept(i)) return i;
    }
    return this.totalSteps - 1;
  }

  /** Latest line start before `before` that `accept`s, or 0. */
  private previousLineStart(before: number, accept: (step: number) => boolean): number {
    const { lineStart } = this.trace;
    for (let i = before - 1; i >= 0; i--) {
      if (lineStart[i] === 1 && accept(i)) return i;
    }
    return 0;
  }

  // ── Watchpoints ─────────────────────────────────────────────────────────────

  /**
   * The closest step before (`backward`) or after (`forward`) `from` that wrote
   * the variable `name`, including writes through it such as `arr[0] = 1` or
   * `arr.push(x)`. Returns -1 when there is none. Variables are matched by
   * name, so same-named locals in different functions all count.
   */
  public findChange(name: string, direction: 'backward' | 'forward', from = this.currentStep): number {
    const id = this.trace.nameId(name);
    if (id < 0) return -1;
    const { target } = this.trace;
    if (direction === 'backward') {
      for (let i = Math.min(from, this.totalSteps) - 1; i >= 0; i--) if (target[i] === id) return i;
    } else {
      for (let i = Math.max(from, -1) + 1; i < this.totalSteps; i++) if (target[i] === id) return i;
    }
    return -1;
  }

  // ── Breakpoints ─────────────────────────────────────────────────────────────

  /**
   * Set (or replace) a breakpoint. A condition is compiled immediately, so a
   * syntax error in it is thrown here rather than when the breakpoint is hit.
   */
  public setBreakpoint(line: number, condition?: string): void {
    const entry: BreakpointEntry = { line, enabled: true };
    const trimmed = condition?.trim();
    if (trimmed) {
      entry.condition = trimmed;
      entry.conditionChunk = compileCondition(trimmed);
    }
    this.breakpoints.set(line, entry);
  }

  public removeBreakpoint(line: number): void {
    this.breakpoints.delete(line);
  }

  public toggleBreakpoint(line: number): void {
    if (this.breakpoints.has(line)) this.removeBreakpoint(line);
    else this.setBreakpoint(line);
  }

  public getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values(), ({ line, enabled, condition }) =>
      (condition === undefined ? { line, enabled } : { line, enabled, condition }));
  }

  public clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  private breakpointHit(step: number): boolean {
    const bp = this.breakpoints.get(this.trace.line[step]!);
    if (!bp || !bp.enabled) return false;
    if (!bp.conditionChunk) return true;
    return this.conditionHolds(bp.conditionChunk, step);
  }

  /**
   * Evaluate a breakpoint condition against the program state at `step`. It
   * runs on its own VM with copies of the visible variables, so a condition
   * with side effects (`arr.pop() > 0`) cannot change the recording. A
   * condition that fails at runtime counts as true, so the problem is visible.
   */
  private conditionHolds(conditionChunk: Chunk, step: number): boolean {
    const scratch = this.requireScratch();
    scratch.seek(step, false);
    const copier = new StateCopier(scratch.vm.stack);
    const evaluator = new VM(undefined, { maxInstructions: CONDITION_MAX_INSTRUCTIONS });
    evaluator.load(conditionChunk);
    for (const [name, value] of visibleVariables(scratch.vm)) {
      evaluator.globals.set(name, copier.value(value));
    }
    if (evaluator.execute(Infinity) !== 'halted') return true;
    return isTruthy(evaluator.globals.get(CONDITION_RESULT) ?? null);
  }

  // ── Inspection ──────────────────────────────────────────────────────────────

  public getCurrentState(): DebuggerState {
    const total = this.totalSteps;
    return {
      currentStep: this.currentStep,
      totalSteps: total,
      isAtStart: this.currentStep === 0,
      isAtEnd: this.currentStep >= Math.max(0, total - 1),
      hasError: this.hasRecordingError,
      isTruncated: this.isTruncated,
      snapshot: this.getCurrentSnapshot(),
    };
  }

  public getCurrentSnapshot(): ExecutionSnapshot {
    if (!this.cursor || this.totalSteps === 0) return emptySnapshot();
    return this.buildSnapshot(this.cursor, this.currentStep);
  }

  /** The full program state at any step, without moving the current position. */
  public snapshotAt(step: number): ExecutionSnapshot {
    if (this.totalSteps === 0) return emptySnapshot();
    const clamped = Math.max(0, Math.min(step, this.totalSteps - 1));
    return this.buildSnapshot(this.requireScratch(), clamped);
  }

  /** Events for steps `from..to` (inclusive, clamped to the recording). */
  public getEvents(from: number, to: number): DebuggerEvent[] {
    const first = Math.max(0, from);
    const last = Math.min(to, this.totalSteps - 1);
    if (last < first) return [];
    return this.requireScratch().describeRange(first, last);
  }

  /** Every event of the recording. Replays the whole program; prefer getEvents for large runs. */
  public getTimeline(): DebuggerEvent[] {
    return this.getEvents(0, this.totalSteps - 1);
  }

  public getVariables(): { locals: VariableSnapshot[]; globals: VariableSnapshot[] } {
    const snap = this.getCurrentSnapshot();
    return {
      locals: snap.frames[snap.frames.length - 1]?.locals ?? [],
      globals: snap.globals,
    };
  }

  public getCallStack(): FrameSnapshot[] {
    return this.getCurrentSnapshot().frames;
  }

  public getSourceLocation(): SourceLocation {
    return this.getCurrentSnapshot().loc;
  }

  /** Every step that executed an instruction on `line`. */
  public getStepsForLine(line: number): number[] {
    const steps: number[] = [];
    const lines = this.trace.line;
    for (let i = 0; i < this.totalSteps; i++) if (lines[i] === line) steps.push(i);
    return steps;
  }

  /** How many times each line started executing, for a coverage/heat-map view. */
  public getLineHits(): Map<number, number> {
    const hits = new Map<number, number>();
    const { line, lineStart } = this.trace;
    for (let i = 0; i < this.totalSteps; i++) {
      if (lineStart[i] === 1) hits.set(line[i]!, (hits.get(line[i]!) ?? 0) + 1);
    }
    return hits;
  }

  private buildSnapshot(replayer: Replayer, step: number): ExecutionSnapshot {
    const rec = this.requireRecording();
    replayer.seek(step, true);
    const vm = replayer.vm;
    const event = replayer.event();
    const changed = rec.trace.targetName(step);
    return {
      stepIndex: step,
      totalSteps: rec.trace.length,
      ip: replayer.instructionPointer(),
      loc: event.loc,
      sourceLine: event.loc.line,
      sourceColumn: event.loc.column,
      stackDisplay: vm.stack.map(v => (v === undefined ? '(missing argument)' : displayValue(v))),
      frames: frameViews(vm, changed),
      globals: globalViews(vm, changed),
      output: rec.output.slice(0, rec.trace.outputLength[step]),
      event,
    };
  }

  private get trace(): TraceLog {
    return this.requireRecording().trace;
  }

  private requireRecording(): Recording {
    if (!this.recording) throw new Error('Nothing recorded yet: call record() first.');
    return this.recording;
  }

  private requireScratch(): Replayer {
    this.requireRecording();
    return this.scratch!;
  }
}

/** Compile a breakpoint condition into a script that stores its value in a global. */
function compileCondition(condition: string): Chunk {
  const source = `let ${CONDITION_RESULT} = (${condition})`;
  const tokens = new Lexer(source).tokenize();
  const { program, errors } = new Parser(tokens, source).parseProgram();
  if (errors.length > 0) {
    throw new CodeTimeError(`Invalid breakpoint condition '${condition}': ${errors[0]!.message}`, { line: 1, column: 1, offset: 0 });
  }
  // The semantic analyzer is skipped on purpose: the condition refers to the
  // paused program's variables, which are supplied as globals when it runs.
  return new BytecodeCompiler('script', 'main').compile(program);
}

function emptySnapshot(): ExecutionSnapshot {
  const loc: SourceLocation = { line: 1, column: 1, offset: 0 };
  return {
    stepIndex: 0,
    totalSteps: 0,
    ip: 0,
    loc,
    sourceLine: 1,
    sourceColumn: 1,
    stackDisplay: [],
    frames: [],
    globals: [],
    output: [],
    event: { type: 'step', description: 'Initial state', loc, stepIndex: 0 },
  };
}
