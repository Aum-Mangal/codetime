import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { BytecodeCompiler } from '../codegen/compiler.js';
import { OpCode } from '../codegen/chunk.js';
import {
  Value,
  ClosureValue,
  FunctionValue,
  NativeFunctionValue,
  Upvalue,
  ArrayValue,
  ObjectValue,
  isTruthy,
  valuesEqual,
  valueToString,
  valueType,
} from '../vm/value.js';
import { RuntimeError, CallFrame } from '../vm/vm.js';
import { SourceLocation } from '../lexer/token.js';
import {
  ExecutionSnapshot,
  FrameSnapshot,
  VariableSnapshot,
  DebuggerEvent,
  DebuggerState,
  Breakpoint,
} from './types.js';

const STACK_MAX = 4096;
const FRAMES_MAX = 256;
const DEFAULT_MAX_STEPS = 100_000;

export class TimeTravelDebugger {
  // ── Public State ──────────────────────────────────────────────────────────
  public history: ExecutionSnapshot[] = [];
  public currentStep: number = 0;
  public source: string = '';
  public totalSteps: number = 0;
  public hasRecordingError: boolean = false;
  public recordingErrorMessage: string = '';

  // ── Breakpoints ───────────────────────────────────────────────────────────
  private breakpoints: Map<number, Breakpoint> = new Map();

  // ── VM State (only used during recording, discarded after) ─────────────────
  private stack: Value[] = [];
  private frames: CallFrame[] = [];
  private globals: Map<string, Value> = new Map();
  private openUpvalues: Upvalue[] = [];
  private output: string[] = [];

  constructor(source: string) {
    this.source = source;
  }

  public static fromSource(source: string, maxSteps = DEFAULT_MAX_STEPS): TimeTravelDebugger {
    const dbg = new TimeTravelDebugger(source);
    dbg.record(maxSteps);
    return dbg;
  }

  // ── Recording API ──────────────────────────────────────────────────────────

  public record(maxSteps = DEFAULT_MAX_STEPS): void {
    // Reset all state
    this.history = [];
    this.currentStep = 0;
    this.stack = [];
    this.frames = [];
    this.globals = new Map();
    this.openUpvalues = [];
    this.output = [];
    this.hasRecordingError = false;
    this.recordingErrorMessage = '';

    // ── 1. Full compiler pipeline ──────────────────────────────────────────
    const tokens = new Lexer(this.source).tokenize();
    const parser = new Parser(tokens, this.source);
    const ast = parser.parse();

    const analyzer = new SemanticAnalyzer(this.source);
    const semRes = analyzer.analyze(ast);
    if (semRes.errors.length > 0) {
      const err = semRes.errors[0]!;
      throw new RuntimeError(err.message, err.loc, [], this.source);
    }

    const compiler = new BytecodeCompiler('script', 'main');
    const chunk = compiler.compile(ast);

    // ── 2. Bootstrap VM ────────────────────────────────────────────────────
    this.initGlobals();

    const scriptFn: FunctionValue = {
      kind: 'function',
      name: 'main',
      arity: 0,
      minArity: 0,
      chunk,
      upvalues: [],
      localNames: compiler.locals.map(l => l.name),
    };

    const mainClosure: ClosureValue = {
      kind: 'closure',
      fn: scriptFn,
      upvalues: [],
    };

    this.push(mainClosure);
    this.call(mainClosure, 0);

    // ── 3. Step-by-step execution + snapshotting ───────────────────────────
    let stepCount = 0;

    // Track previous globals to detect changes for highlight
    let prevGlobals: Map<string, string> = new Map();

    while (this.frames.length > 0 && stepCount < maxSteps) {
      const frame = this.frames[this.frames.length - 1]!;
      if (frame.ip >= frame.closure.fn.chunk.code.length) break;

      const ipBefore = frame.ip;
      const loc = frame.closure.fn.chunk.locations[ipBefore] ?? { line: 1, column: 1, offset: 0 };

      let event: DebuggerEvent;
      try {
        event = this.executeInstruction();
      } catch (err: any) {
        // Capture error snapshot then stop
        event = {
          type: 'error',
          description: err.message || String(err),
          loc,
          stepIndex: stepCount,
        };
        const errSnap = this.buildSnapshot(stepCount, ipBefore, loc, event, prevGlobals);
        this.history.push(errSnap);
        this.hasRecordingError = true;
        this.recordingErrorMessage = err.message || String(err);
        break;
      }

      event.stepIndex = stepCount;
      event.loc = loc;

      const snap = this.buildSnapshot(stepCount, ipBefore, loc, event, prevGlobals);
      this.history.push(snap);

      // Update prev globals map for change detection on next step
      for (const g of snap.globals) {
        prevGlobals.set(g.name, g.displayValue);
      }

      stepCount++;
    }

    // Patch totalSteps into all snapshots
    this.totalSteps = this.history.length;
    for (const snap of this.history) {
      snap.totalSteps = this.totalSteps;
    }
  }

  // ── Navigation API ──────────────────────────────────────────────────────────

  public stepForward(): DebuggerState {
    if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
    }
    return this.getCurrentState();
  }

  public stepBackward(): DebuggerState {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
    return this.getCurrentState();
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

  /** Continue to the next breakpoint (or end of program). */
  public continueToBreakpoint(): DebuggerState {
    let step = this.currentStep + 1;
    while (step < this.totalSteps) {
      const snap = this.history[step]!;
      if (this.breakpoints.has(snap.sourceLine) && this.breakpoints.get(snap.sourceLine)!.enabled) {
        break;
      }
      step++;
    }
    return this.gotoStep(step);
  }

  /** Step over — advance one "significant" step (assign, call, return, print). */
  public stepOver(): DebuggerState {
    let step = this.currentStep + 1;
    const interestingTypes = new Set(['assign', 'call', 'return', 'print', 'halt', 'error']);
    while (step < this.totalSteps) {
      const snap = this.history[step]!;
      if (interestingTypes.has(snap.event.type)) {
        break;
      }
      step++;
    }
    return this.gotoStep(step);
  }

  // ── Breakpoints API ─────────────────────────────────────────────────────────

  public setBreakpoint(line: number): void {
    this.breakpoints.set(line, { line, enabled: true });
  }

  public removeBreakpoint(line: number): void {
    this.breakpoints.delete(line);
  }

  public toggleBreakpoint(line: number): void {
    if (this.breakpoints.has(line)) {
      this.removeBreakpoint(line);
    } else {
      this.setBreakpoint(line);
    }
  }

  public getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  public clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  // ── Inspection API ──────────────────────────────────────────────────────────

  public getCurrentState(): DebuggerState {
    const snap = this.history[this.currentStep] ?? this.createEmptySnapshot();
    return {
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      isAtStart: this.currentStep === 0,
      isAtEnd: this.currentStep >= Math.max(0, this.totalSteps - 1),
      hasError: this.hasRecordingError,
      snapshot: snap,
    };
  }

  public getCurrentSnapshot(): ExecutionSnapshot {
    return this.history[this.currentStep] ?? this.createEmptySnapshot();
  }

  public getTimeline(): DebuggerEvent[] {
    return this.history.map(h => h.event);
  }

  public getHistory(): ExecutionSnapshot[] {
    return this.history;
  }

  public getVariables(): { locals: VariableSnapshot[]; globals: VariableSnapshot[] } {
    const snap = this.getCurrentSnapshot();
    const activeFrame = snap.frames[snap.frames.length - 1];
    return {
      locals: activeFrame ? activeFrame.locals : [],
      globals: snap.globals,
    };
  }

  public getCallStack(): FrameSnapshot[] {
    return this.getCurrentSnapshot().frames;
  }

  public getSourceLocation(): SourceLocation {
    return this.getCurrentSnapshot().loc;
  }

  /** Get all steps that touch a given source line — useful for line-level stepping. */
  public getStepsForLine(line: number): number[] {
    return this.history
      .filter(s => s.sourceLine === line)
      .map(s => s.stepIndex);
  }

  // ── Snapshot Building ────────────────────────────────────────────────────────

  private buildSnapshot(
    stepIndex: number,
    ipBefore: number,
    loc: SourceLocation,
    event: DebuggerEvent,
    prevGlobals: Map<string, string>,
  ): ExecutionSnapshot {
    const globals = this.captureGlobals(prevGlobals);
    return {
      stepIndex,
      totalSteps: 0, // patched after
      ip: ipBefore,
      loc,
      sourceLine: loc.line,
      sourceColumn: loc.column,
      stackDisplay: this.stack.map(v => valueToString(v)),
      frames: this.captureFrames(loc),
      globals,
      output: [...this.output],
      event,
    };
  }

  private captureFrames(currentLoc: SourceLocation): FrameSnapshot[] {
    const snapshots: FrameSnapshot[] = [];

    for (let fIdx = 0; fIdx < this.frames.length; fIdx++) {
      const f = this.frames[fIdx]!;
      const isTop = fIdx === this.frames.length - 1;
      const loc = isTop
        ? currentLoc
        : (f.closure.fn.chunk.locations[Math.max(0, f.ip - 1)] ?? currentLoc);

      const locals: VariableSnapshot[] = [];
      const localNames = f.closure.fn.localNames ?? [];
      const nextFrameSlot =
        fIdx + 1 < this.frames.length ? this.frames[fIdx + 1]!.slots : this.stack.length;

      for (let s = f.slots; s < nextFrameSlot; s++) {
        const localIndex = s - f.slots;
        const name = localNames[localIndex]
          || (localIndex === 0 ? (f.closure.fn.name || '<fn>') : `$slot${localIndex}`);

        // Skip internal compiler-emitted helper slots (start with $)
        if (!name || name.startsWith('$')) continue;

        const val = this.stack[s];
        if (val === undefined) continue;

        locals.push({
          name,
          value: this.cloneValue(val),
          type: valueType(val),
          displayValue: valueToString(val),
        });
      }

      snapshots.push({
        id: fIdx,
        fnName: f.closure.fn.name || 'anonymous',
        loc,
        ip: f.ip,
        slots: f.slots,
        locals,
      });
    }

    return snapshots;
  }

  private captureGlobals(prevGlobals: Map<string, string>): VariableSnapshot[] {
    const result: VariableSnapshot[] = [];
    const internalBuiltins = new Set(['print', 'len', 'typeof', 'int', 'float', 'str', 'bool']);

    for (const [name, val] of this.globals.entries()) {
      if (internalBuiltins.has(name)) continue;
      const displayValue = valueToString(val);
      result.push({
        name,
        value: this.cloneValue(val),
        type: valueType(val),
        displayValue,
        changed: prevGlobals.has(name) && prevGlobals.get(name) !== displayValue,
      });
    }

    return result;
  }

  private cloneValue(v: Value): Value {
    if (v === null || typeof v !== 'object') return v;
    if (v.kind === 'array') {
      return { kind: 'array', elements: v.elements.map(e => this.cloneValue(e)) };
    }
    if (v.kind === 'object') {
      const fields = new Map<string, Value>();
      for (const [k, val] of v.fields.entries()) {
        fields.set(k, this.cloneValue(val));
      }
      return { kind: 'object', fields };
    }
    // closures / functions / natives: immutable, share reference
    return v;
  }

  private createEmptySnapshot(): ExecutionSnapshot {
    return {
      stepIndex: 0,
      totalSteps: 0,
      ip: 0,
      loc: { line: 1, column: 1, offset: 0 },
      sourceLine: 1,
      sourceColumn: 1,
      stackDisplay: [],
      frames: [],
      globals: [],
      output: [],
      event: {
        type: 'step',
        description: 'Initial state',
        loc: { line: 1, column: 1, offset: 0 },
        stepIndex: 0,
      },
    };
  }

  // ── VM Instruction Execution Engine ──────────────────────────────────────────

  private initGlobals(): void {
    const def = (name: string, arity: number, fn: (args: Value[]) => Value) => {
      const nativeVal: NativeFunctionValue = { kind: 'native', name, arity, fn };
      this.globals.set(name, nativeVal);
    };

    def('print', -1, (args) => {
      this.output.push(args.map(a => valueToString(a)).join(' '));
      return null;
    });
    def('len', 1, (args) => {
      const a = args[0]!;
      if (typeof a === 'string') return a.length;
      if (typeof a === 'object' && a !== null && a.kind === 'array') return a.elements.length;
      if (typeof a === 'object' && a !== null && a.kind === 'object') return a.fields.size;
      throw new Error(`'len()' not supported for type '${valueType(a)}'.`);
    });
    def('typeof', 1, (args) => valueType(args[0]!));
    def('int', 1, (args) => {
      const a = args[0]!;
      if (typeof a === 'number') return Math.trunc(a);
      if (typeof a === 'string') return parseInt(a, 10);
      if (typeof a === 'boolean') return a ? 1 : 0;
      return 0;
    });
    def('float', 1, (args) => {
      const a = args[0]!;
      if (typeof a === 'number') return a;
      if (typeof a === 'string') return parseFloat(a);
      if (typeof a === 'boolean') return a ? 1.0 : 0.0;
      return 0.0;
    });
    def('str', 1, (args) => valueToString(args[0]!));
    def('bool', 1, (args) => isTruthy(args[0]!));
  }

  private executeInstruction(): DebuggerEvent {
    // Always fetch the live top frame — OP_RETURN can modify the frame stack
    const frame = this.frames[this.frames.length - 1]!;
    const op = frame.closure.fn.chunk.code[frame.ip++] as OpCode;
    const loc = frame.closure.fn.chunk.locations[frame.ip - 1] ?? { line: 1, column: 1, offset: 0 };
    const ch = frame.closure.fn.chunk;

    const mkEvent = (
      type: DebuggerEvent['type'],
      description: string,
      extra: Partial<DebuggerEvent> = {}
    ): DebuggerEvent => ({ type, description, loc, stepIndex: 0, ...extra });

    switch (op) {
      // ── Stack literals ──────────────────────────────────────────────────
      case OpCode.OP_CONSTANT: {
        const c = ch.constants[ch.code[frame.ip++]!]!;
        this.push(c);
        return mkEvent('step', `Load ${valueToString(c)}`);
      }
      case OpCode.OP_NULL:
        this.push(null);
        return mkEvent('step', 'Push null');
      case OpCode.OP_TRUE:
        this.push(true);
        return mkEvent('step', 'Push true');
      case OpCode.OP_FALSE:
        this.push(false);
        return mkEvent('step', 'Push false');
      case OpCode.OP_POP:
        this.pop();
        return mkEvent('step', 'Pop');
      case OpCode.OP_DUP:
        this.push(this.peek(0));
        return mkEvent('step', 'Duplicate stack top');

      // ── Variable access ─────────────────────────────────────────────────
      case OpCode.OP_GET_LOCAL: {
        const slot = ch.code[frame.ip++]!;
        const val = this.stack[frame.slots + slot]!;
        const name = frame.closure.fn.localNames?.[slot] ?? `local_${slot}`;
        this.push(val);
        return mkEvent('step', `Read local ${name} → ${valueToString(val)}`, { varName: name, varValue: valueToString(val) });
      }
      case OpCode.OP_SET_LOCAL: {
        const slot = ch.code[frame.ip++]!;
        const val = this.peek(0);
        const name = frame.closure.fn.localNames?.[slot] ?? `local_${slot}`;
        this.stack[frame.slots + slot] = val;
        return mkEvent('assign', `${name} = ${valueToString(val)}`, { varName: name, varValue: valueToString(val) });
      }
      case OpCode.OP_GET_GLOBAL: {
        const name = ch.constants[ch.code[frame.ip++]!] as string;
        const val = this.globals.get(name) ?? null;
        this.push(val);
        return mkEvent('step', `Read ${name} → ${valueToString(val)}`, { varName: name, varValue: valueToString(val) });
      }
      case OpCode.OP_DEFINE_GLOBAL: {
        const name = ch.constants[ch.code[frame.ip++]!] as string;
        const val = this.pop();
        this.globals.set(name, val);
        return mkEvent('assign', `let ${name} = ${valueToString(val)}`, { varName: name, varValue: valueToString(val) });
      }
      case OpCode.OP_SET_GLOBAL: {
        const name = ch.constants[ch.code[frame.ip++]!] as string;
        const val = this.peek(0);
        this.globals.set(name, val);
        return mkEvent('assign', `${name} = ${valueToString(val)}`, { varName: name, varValue: valueToString(val) });
      }
      case OpCode.OP_GET_UPVALUE: {
        const slot = ch.code[frame.ip++]!;
        const upval = frame.closure.upvalues[slot]!;
        const val = upval.closed !== null ? upval.closed : this.stack[upval.location]!;
        this.push(val);
        return mkEvent('step', `Read captured var → ${valueToString(val)}`);
      }
      case OpCode.OP_SET_UPVALUE: {
        const slot = ch.code[frame.ip++]!;
        const upval = frame.closure.upvalues[slot]!;
        const val = this.peek(0);
        if (upval.closed !== null) upval.closed = val;
        else this.stack[upval.location] = val;
        return mkEvent('assign', `Captured var = ${valueToString(val)}`);
      }

      // ── Arithmetic ──────────────────────────────────────────────────────
      case OpCode.OP_ADD: {
        const b = this.pop(); const a = this.pop();
        if (typeof a === 'number' && typeof b === 'number') {
          const r = a + b; this.push(r);
          return mkEvent('step', `${a} + ${b} = ${r}`);
        }
        const r = valueToString(a) + valueToString(b); this.push(r);
        return mkEvent('step', `"${valueToString(a)}" + "${valueToString(b)}" = "${r}"`);
      }
      case OpCode.OP_SUB: { const b = this.pop() as number, a = this.pop() as number, r = a - b; this.push(r); return mkEvent('step', `${a} − ${b} = ${r}`); }
      case OpCode.OP_MUL: { const b = this.pop() as number, a = this.pop() as number, r = a * b; this.push(r); return mkEvent('step', `${a} × ${b} = ${r}`); }
      case OpCode.OP_DIV: {
        const b = this.pop() as number, a = this.pop() as number;
        if (b === 0) throw new Error('Division by zero.');
        const r = Number.isInteger(a) && Number.isInteger(b) && a % b === 0 ? Math.trunc(a / b) : a / b;
        this.push(r);
        return mkEvent('step', `${a} ÷ ${b} = ${r}`);
      }
      case OpCode.OP_MOD: { const b = this.pop() as number, a = this.pop() as number, r = a % b; this.push(r); return mkEvent('step', `${a} % ${b} = ${r}`); }
      case OpCode.OP_POW: { const b = this.pop() as number, a = this.pop() as number, r = a ** b; this.push(r); return mkEvent('step', `${a} ** ${b} = ${r}`); }
      case OpCode.OP_NEGATE: { const a = this.pop() as number; this.push(-a); return mkEvent('step', `negate → ${-a}`); }
      case OpCode.OP_NOT: { const a = this.pop(); const r = !isTruthy(a); this.push(r); return mkEvent('step', `not ${valueToString(a)} → ${r}`); }

      // ── Comparisons ─────────────────────────────────────────────────────
      case OpCode.OP_EQUAL: { const b = this.pop(), a = this.pop(), r = valuesEqual(a, b); this.push(r); return mkEvent('step', `${valueToString(a)} == ${valueToString(b)} → ${r}`); }
      case OpCode.OP_NOT_EQUAL: { const b = this.pop(), a = this.pop(), r = !valuesEqual(a, b); this.push(r); return mkEvent('step', `${valueToString(a)} != ${valueToString(b)} → ${r}`); }
      case OpCode.OP_GREATER: { const b = this.pop() as any, a = this.pop() as any, r = a > b; this.push(r); return mkEvent('step', `${a} > ${b} → ${r}`); }
      case OpCode.OP_GREATER_EQUAL: { const b = this.pop() as any, a = this.pop() as any, r = a >= b; this.push(r); return mkEvent('step', `${a} >= ${b} → ${r}`); }
      case OpCode.OP_LESS: { const b = this.pop() as any, a = this.pop() as any, r = a < b; this.push(r); return mkEvent('step', `${a} < ${b} → ${r}`); }
      case OpCode.OP_LESS_EQUAL: { const b = this.pop() as any, a = this.pop() as any, r = a <= b; this.push(r); return mkEvent('step', `${a} <= ${b} → ${r}`); }

      // ── Control flow ─────────────────────────────────────────────────────
      case OpCode.OP_JUMP: {
        const offset = (ch.code[frame.ip++]! << 8) | ch.code[frame.ip++]!;
        frame.ip += offset;
        return mkEvent('branch', `Jump forward +${offset}`);
      }
      case OpCode.OP_JUMP_IF_FALSE: {
        const offset = (ch.code[frame.ip++]! << 8) | ch.code[frame.ip++]!;
        const cond = this.peek(0);
        if (!isTruthy(cond)) { frame.ip += offset; return mkEvent('branch', `Branch (false) → skip ${offset} bytes`); }
        return mkEvent('branch', `Branch (true) → continue`);
      }
      case OpCode.OP_LOOP: {
        const offset = (ch.code[frame.ip++]! << 8) | ch.code[frame.ip++]!;
        frame.ip -= offset;
        return mkEvent('loop', `Loop back −${offset}`);
      }

      // ── Functions ────────────────────────────────────────────────────────
      case OpCode.OP_CALL: {
        const argCount = ch.code[frame.ip++]!;
        const callee = this.peek(argCount);
        const fnName =
          callee && typeof callee === 'object'
            ? (callee as any).fn?.name ?? (callee as any).name ?? 'fn'
            : 'fn';
        this.callValue(callee, argCount);
        return mkEvent('call', `Call ${fnName}(${argCount} args)`, { fnName });
      }
      case OpCode.OP_CLOSURE: {
        const constIdx = ch.code[frame.ip++]!;
        const fnVal = ch.constants[constIdx] as FunctionValue;
        const closure: ClosureValue = { kind: 'closure', fn: fnVal, upvalues: [] };
        for (let i = 0; i < fnVal.upvalues.length; i++) {
          const isLocal = ch.code[frame.ip++] === 1;
          const index = ch.code[frame.ip++]!;
          closure.upvalues.push(
            isLocal ? this.captureUpvalue(frame.slots + index) : frame.closure.upvalues[index]!
          );
        }
        this.push(closure);
        return mkEvent('step', `Create closure <fn ${fnVal.name}>`, { fnName: fnVal.name });
      }
      case OpCode.OP_CLOSE_UPVALUE: {
        this.closeUpvalues(this.stack.length - 1);
        this.pop();
        return mkEvent('step', 'Close upvalue');
      }
      case OpCode.OP_RETURN: {
        const result = this.pop();
        const returningFn = frame.closure.fn.name || 'main';
        this.closeUpvalues(frame.slots);
        this.frames.pop();
        if (this.frames.length === 0) {
          return mkEvent('halt', `Program ended`, { fnName: returningFn });
        }
        this.stack.length = frame.slots;
        this.push(result);
        return mkEvent('return', `${returningFn}() → ${valueToString(result)}`, { fnName: returningFn });
      }

      // ── Collections ──────────────────────────────────────────────────────
      case OpCode.OP_ARRAY: {
        const count = ch.code[frame.ip++]!;
        const elements: Value[] = Array(count);
        for (let i = count - 1; i >= 0; i--) elements[i] = this.pop();
        const arrVal: ArrayValue = { kind: 'array', elements };
        this.push(arrVal);
        return mkEvent('step', `Build array[${count}]`);
      }
      case OpCode.OP_OBJECT: {
        const count = ch.code[frame.ip++]!;
        const items: [string, Value][] = [];
        for (let i = 0; i < count; i++) {
          const val = this.pop(), key = this.pop() as string;
          items.unshift([key, val]);
        }
        const fields = new Map<string, Value>(items);
        const objVal: ObjectValue = { kind: 'object', fields };
        this.push(objVal);
        return mkEvent('step', `Build object{${count} fields}`);
      }
      case OpCode.OP_GET_INDEX: {
        const index = this.pop(), target = this.pop();
        if (typeof target === 'object' && target !== null) {
          if (target.kind === 'array') {
            const idx = Math.trunc(index as number);
            if (idx < 0 || idx >= target.elements.length) throw new Error(`Array index ${idx} out of bounds (length ${target.elements.length}).`);
            const val = target.elements[idx]!;
            this.push(val);
            return mkEvent('step', `arr[${idx}] → ${valueToString(val)}`);
          }
          if (target.kind === 'object') {
            const key = valueToString(index);
            const val = target.fields.get(key) ?? null;
            this.push(val);
            return mkEvent('step', `obj["${key}"] → ${valueToString(val)}`);
          }
        }
        throw new Error(`Cannot index into ${valueType(target)}.`);
      }
      case OpCode.OP_SET_INDEX: {
        const val = this.pop(), index = this.pop(), target = this.pop();
        if (typeof target === 'object' && target !== null && target.kind === 'array') {
          const idx = Math.trunc(index as number);
          target.elements[idx] = val;
          this.push(val);
          return mkEvent('assign', `arr[${idx}] = ${valueToString(val)}`);
        }
        if (typeof target === 'object' && target !== null && target.kind === 'object') {
          target.fields.set(valueToString(index), val);
          this.push(val);
          return mkEvent('assign', `obj["${valueToString(index)}"] = ${valueToString(val)}`);
        }
        throw new Error(`Cannot set index on ${valueType(target)}.`);
      }
      case OpCode.OP_GET_PROPERTY: {
        const propName = ch.constants[ch.code[frame.ip++]!] as string;
        const target = this.pop();
        if (typeof target === 'object' && target !== null) {
          if (target.kind === 'array') {
            if (propName === 'length') { this.push(target.elements.length); return mkEvent('step', `arr.length → ${target.elements.length}`); }
            if (propName === 'push') {
              this.push({ kind: 'native', name: 'push', arity: 1, fn: (a) => { target.elements.push(a[0]!); return target.elements.length; } });
              return mkEvent('step', 'arr.push ref');
            }
            if (propName === 'pop') {
              this.push({ kind: 'native', name: 'pop', arity: 0, fn: () => target.elements.pop() ?? null });
              return mkEvent('step', 'arr.pop ref');
            }
          }
          if (target.kind === 'object') {
            const val = target.fields.get(propName) ?? null;
            this.push(val);
            return mkEvent('step', `.${propName} → ${valueToString(val)}`);
          }
        }
        throw new Error(`Property '${propName}' not found on ${valueType(target)}.`);
      }
      case OpCode.OP_SET_PROPERTY: {
        const propName = ch.constants[ch.code[frame.ip++]!] as string;
        const val = this.pop(), target = this.pop();
        if (typeof target === 'object' && target !== null && target.kind === 'object') {
          target.fields.set(propName, val);
          this.push(val);
          return mkEvent('assign', `.${propName} = ${valueToString(val)}`);
        }
        throw new Error(`Cannot set property on ${valueType(target)}.`);
      }

      // ── I/O ──────────────────────────────────────────────────────────────
      case OpCode.OP_PRINT: {
        const argCount = ch.code[frame.ip++]!;
        const args: Value[] = Array(argCount);
        for (let i = argCount - 1; i >= 0; i--) args[i] = this.pop();
        const line = args.map(a => valueToString(a)).join(' ');
        this.output.push(line);
        this.push(null);
        return mkEvent('print', `"${line}"`);
      }

      case OpCode.OP_HALT:
        return mkEvent('halt', 'Halt');

      default:
        return mkEvent('step', `Opcode ${op}`);
    }
  }

  // ── VM Helpers ────────────────────────────────────────────────────────────

  private callValue(callee: Value, argCount: number): void {
    if (typeof callee === 'object' && callee !== null) {
      if (callee.kind === 'closure') {
        this.call(callee, argCount);
        return;
      }
      if (callee.kind === 'native') {
        const args: Value[] = Array(argCount);
        for (let i = argCount - 1; i >= 0; i--) args[i] = this.pop();
        this.pop(); // pop native itself
        this.push(callee.fn(args));
        return;
      }
    }
    throw new Error(`Cannot call ${valueType(callee)}.`);
  }

  private call(closure: ClosureValue, argCount: number): void {
    if (this.frames.length >= FRAMES_MAX) throw new Error('Stack overflow (max call depth exceeded).');
    this.frames.push({ closure, ip: 0, slots: this.stack.length - argCount - 1 });
  }

  private captureUpvalue(localIndex: number): Upvalue {
    for (const u of this.openUpvalues) { if (u.location === localIndex) return u; }
    const u: Upvalue = { location: localIndex, closed: null };
    this.openUpvalues.push(u);
    return u;
  }

  private closeUpvalues(lastSlot: number): void {
    for (let i = this.openUpvalues.length - 1; i >= 0; i--) {
      const u = this.openUpvalues[i]!;
      if (u.location >= lastSlot) {
        u.closed = this.stack[u.location]!;
        this.openUpvalues.splice(i, 1);
      }
    }
  }

  private push(val: Value): void {
    if (this.stack.length >= STACK_MAX) throw new Error('Value stack overflow.');
    this.stack.push(val);
  }

  private pop(): Value {
    if (this.stack.length === 0) throw new Error('Value stack underflow.');
    return this.stack.pop()!;
  }

  private peek(distance: number): Value {
    return this.stack[this.stack.length - 1 - distance]!;
  }
}
