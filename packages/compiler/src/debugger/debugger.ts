import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { BytecodeCompiler } from '../codegen/compiler.js';
import { Chunk, OpCode } from '../codegen/chunk.js';
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
} from './types.js';

const STACK_MAX = 4096;
const FRAMES_MAX = 256;
const DEFAULT_MAX_STEPS = 50000;

export class TimeTravelDebugger {
  public history: ExecutionSnapshot[] = [];
  public currentStep: number = 0;
  public source: string = '';
  public totalSteps: number = 0;

  // VM state during recording
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

  public record(maxSteps = DEFAULT_MAX_STEPS): void {
    this.history = [];
    this.currentStep = 0;
    this.stack = [];
    this.frames = [];
    this.globals = new Map();
    this.openUpvalues = [];
    this.output = [];

    // 1. Pipeline: Lex, Parse, Analyze, Compile
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

    // 2. Initialize VM runtime
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

    // 3. Execution loop capturing snapshots
    let stepCount = 0;
    let frame = this.frames[this.frames.length - 1]!;

    while (frame && stepCount < maxSteps) {
      if (frame.ip >= frame.closure.fn.chunk.code.length) {
        break;
      }

      const ipBefore = frame.ip;
      const op = frame.closure.fn.chunk.code[ipBefore] as OpCode;
      const loc = frame.closure.fn.chunk.locations[ipBefore] ?? { line: 1, column: 1, offset: 0 };

      // Execute single instruction
      const event = this.executeInstruction();
      event.stepIndex = stepCount;
      event.loc = loc;

      // Capture Snapshot
      const snapshot: ExecutionSnapshot = {
        stepIndex: stepCount,
        totalSteps: 0, // patched after recording completes
        ip: ipBefore,
        loc,
        sourceLine: loc.line,
        sourceColumn: loc.column,
        stack: this.cloneStack(),
        stackDisplay: this.stack.map(v => valueToString(v)),
        frames: this.captureFrames(loc),
        globals: this.captureGlobals(),
        output: [...this.output],
        event,
      };

      this.history.push(snapshot);
      stepCount++;

      if (this.frames.length === 0) {
        break;
      }
      frame = this.frames[this.frames.length - 1]!;
    }

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
    if (stepIndex < 0) {
      this.currentStep = 0;
    } else if (stepIndex >= this.totalSteps) {
      this.currentStep = Math.max(0, this.totalSteps - 1);
    } else {
      this.currentStep = stepIndex;
    }
    return this.getCurrentState();
  }

  public restart(): DebuggerState {
    return this.gotoStep(0);
  }

  public gotoEnd(): DebuggerState {
    return this.gotoStep(this.totalSteps - 1);
  }

  public getCurrentState(): DebuggerState {
    const snap = this.history[this.currentStep] ?? this.createEmptySnapshot();
    return {
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      isAtStart: this.currentStep === 0,
      isAtEnd: this.currentStep === Math.max(0, this.totalSteps - 1),
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

  // ── Snapshot Capture Helpers ────────────────────────────────────────────────

  private captureFrames(currentLoc: SourceLocation): FrameSnapshot[] {
    const snapshots: FrameSnapshot[] = [];

    for (let fIdx = 0; fIdx < this.frames.length; fIdx++) {
      const f = this.frames[fIdx]!;
      const isTop = fIdx === this.frames.length - 1;
      const loc = isTop ? currentLoc : (f.closure.fn.chunk.locations[Math.max(0, f.ip - 1)] ?? currentLoc);

      const locals: VariableSnapshot[] = [];
      const localNames = f.closure.fn.localNames ?? [];
      const nextFrameSlot = fIdx + 1 < this.frames.length ? this.frames[fIdx + 1]!.slots : this.stack.length;

      for (let s = f.slots; s < nextFrameSlot; s++) {
        const localIndex = s - f.slots;
        const name = localNames[localIndex] || (localIndex === 0 ? (f.closure.fn.name || '<this>') : `$slot${localIndex}`);
        if (name && !name.startsWith('$')) { // omit internal compiler helper slots
          const val = this.stack[s];
          if (val !== undefined) {
            locals.push({
              name,
              value: this.cloneValue(val),
              type: valueType(val),
              displayValue: valueToString(val),
            });
          }
        }
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

  private captureGlobals(): VariableSnapshot[] {
    const result: VariableSnapshot[] = [];
    const internalBuiltins = new Set(['print', 'len', 'typeof', 'int', 'float', 'str', 'bool']);

    for (const [name, val] of this.globals.entries()) {
      if (!internalBuiltins.has(name)) {
        result.push({
          name,
          value: this.cloneValue(val),
          type: valueType(val),
          displayValue: valueToString(val),
        });
      }
    }

    return result;
  }

  private cloneStack(): Value[] {
    return this.stack.map(v => this.cloneValue(v));
  }

  private cloneValue(v: Value): Value {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      return v;
    }
    if (typeof v === 'object') {
      if (v.kind === 'array') {
        return {
          kind: 'array',
          elements: v.elements.map(e => this.cloneValue(e)),
        };
      }
      if (v.kind === 'object') {
        const fields = new Map<string, Value>();
        for (const [k, val] of v.fields.entries()) {
          fields.set(k, this.cloneValue(val));
        }
        return { kind: 'object', fields };
      }
      return v; // closures/functions/natives are immutable references
    }
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
      stack: [],
      stackDisplay: [],
      frames: [],
      globals: [],
      output: [],
      event: { type: 'step', description: 'Initial state', loc: { line: 1, column: 1, offset: 0 }, stepIndex: 0 },
    };
  }

  // ── VM Instruction Execution Engine ─────────────────────────────────────────

  private initGlobals(): void {
    this.defineNative('print', -1, (args) => {
      const line = args.map(a => valueToString(a)).join(' ');
      this.output.push(line);
      return null;
    });

    this.defineNative('len', 1, (args) => {
      const arg = args[0]!;
      if (typeof arg === 'string') return arg.length;
      if (typeof arg === 'object' && arg !== null && arg.kind === 'array') return arg.elements.length;
      if (typeof arg === 'object' && arg !== null && arg.kind === 'object') return arg.fields.size;
      throw new Error(`'len()' not supported for type '${valueType(arg)}'.`);
    });

    this.defineNative('typeof', 1, (args) => {
      return valueType(args[0]!);
    });

    this.defineNative('int', 1, (args) => {
      const arg = args[0]!;
      if (typeof arg === 'number') return Math.trunc(arg);
      if (typeof arg === 'string') return parseInt(arg, 10);
      if (typeof arg === 'boolean') return arg ? 1 : 0;
      return 0;
    });

    this.defineNative('float', 1, (args) => {
      const arg = args[0]!;
      if (typeof arg === 'number') return arg;
      if (typeof arg === 'string') return parseFloat(arg);
      if (typeof arg === 'boolean') return arg ? 1.0 : 0.0;
      return 0.0;
    });

    this.defineNative('str', 1, (args) => {
      return valueToString(args[0]!);
    });

    this.defineNative('bool', 1, (args) => {
      return isTruthy(args[0]!);
    });
  }

  private defineNative(name: string, arity: number, fn: (args: Value[]) => Value): void {
    const nativeVal: NativeFunctionValue = {
      kind: 'native',
      name,
      arity,
      fn,
    };
    this.globals.set(name, nativeVal);
  }

  private executeInstruction(): DebuggerEvent {
    let frame = this.frames[this.frames.length - 1]!;
    const op = frame.closure.fn.chunk.code[frame.ip++] as OpCode;
    const loc = frame.closure.fn.chunk.locations[frame.ip - 1] ?? { line: 1, column: 1, offset: 0 };

    switch (op) {
      case OpCode.OP_CONSTANT: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const constant = frame.closure.fn.chunk.constants[constIdx]!;
        this.push(constant);
        return { type: 'step', description: `Load constant ${valueToString(constant)}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_NULL:
        this.push(null);
        return { type: 'step', description: 'Load null', loc, stepIndex: 0 };
      case OpCode.OP_TRUE:
        this.push(true);
        return { type: 'step', description: 'Load true', loc, stepIndex: 0 };
      case OpCode.OP_FALSE:
        this.push(false);
        return { type: 'step', description: 'Load false', loc, stepIndex: 0 };
      case OpCode.OP_POP:
        this.pop();
        return { type: 'step', description: 'Pop stack', loc, stepIndex: 0 };
      case OpCode.OP_DUP: {
        const val = this.peek(0);
        this.push(val);
        return { type: 'step', description: 'Duplicate top of stack', loc, stepIndex: 0 };
      }

      case OpCode.OP_GET_LOCAL: {
        const slot = frame.closure.fn.chunk.code[frame.ip++]!;
        const val = this.stack[frame.slots + slot]!;
        const name = frame.closure.fn.localNames?.[slot] || `local_${slot}`;
        this.push(val);
        return { type: 'step', description: `Read ${name} (${valueToString(val)})`, varName: name, varValue: valueToString(val), loc, stepIndex: 0 };
      }
      case OpCode.OP_SET_LOCAL: {
        const slot = frame.closure.fn.chunk.code[frame.ip++]!;
        const val = this.peek(0);
        const name = frame.closure.fn.localNames?.[slot] || `local_${slot}`;
        this.stack[frame.slots + slot] = val;
        return { type: 'assign', description: `${name} = ${valueToString(val)}`, varName: name, varValue: valueToString(val), loc, stepIndex: 0 };
      }
      case OpCode.OP_GET_GLOBAL: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const name = frame.closure.fn.chunk.constants[constIdx] as string;
        const val = this.globals.get(name)!;
        this.push(val);
        return { type: 'step', description: `Read global ${name} (${valueToString(val)})`, varName: name, varValue: valueToString(val), loc, stepIndex: 0 };
      }
      case OpCode.OP_DEFINE_GLOBAL: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const name = frame.closure.fn.chunk.constants[constIdx] as string;
        const val = this.pop();
        this.globals.set(name, val);
        return { type: 'assign', description: `Define global ${name} = ${valueToString(val)}`, varName: name, varValue: valueToString(val), loc, stepIndex: 0 };
      }
      case OpCode.OP_SET_GLOBAL: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const name = frame.closure.fn.chunk.constants[constIdx] as string;
        const val = this.peek(0);
        this.globals.set(name, val);
        return { type: 'assign', description: `${name} = ${valueToString(val)}`, varName: name, varValue: valueToString(val), loc, stepIndex: 0 };
      }
      case OpCode.OP_GET_UPVALUE: {
        const slot = frame.closure.fn.chunk.code[frame.ip++]!;
        const upval = frame.closure.upvalues[slot]!;
        const val = upval.closed !== null ? upval.closed : this.stack[upval.location]!;
        this.push(val);
        return { type: 'step', description: `Read captured variable (${valueToString(val)})`, loc, stepIndex: 0 };
      }
      case OpCode.OP_SET_UPVALUE: {
        const slot = frame.closure.fn.chunk.code[frame.ip++]!;
        const upval = frame.closure.upvalues[slot]!;
        const val = this.peek(0);
        if (upval.closed !== null) {
          upval.closed = val;
        } else {
          this.stack[upval.location] = val;
        }
        return { type: 'assign', description: `Update captured variable = ${valueToString(val)}`, loc, stepIndex: 0 };
      }

      case OpCode.OP_ADD: {
        const b = this.pop();
        const a = this.pop();
        if (typeof a === 'number' && typeof b === 'number') {
          const res = a + b;
          this.push(res);
          return { type: 'step', description: `${a} + ${b} = ${res}`, loc, stepIndex: 0 };
        } else {
          const res = valueToString(a) + valueToString(b);
          this.push(res);
          return { type: 'step', description: `Concatenate strings -> "${res}"`, loc, stepIndex: 0 };
        }
      }
      case OpCode.OP_SUB: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        const res = a - b;
        this.push(res);
        return { type: 'step', description: `${a} - ${b} = ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_MUL: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        const res = a * b;
        this.push(res);
        return { type: 'step', description: `${a} * ${b} = ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_DIV: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        if (b === 0) throw new Error('Division by zero.');
        const res = Number.isInteger(a) && Number.isInteger(b) && a % b === 0 ? Math.trunc(a / b) : a / b;
        this.push(res);
        return { type: 'step', description: `${a} / ${b} = ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_MOD: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        const res = a % b;
        this.push(res);
        return { type: 'step', description: `${a} % ${b} = ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_POW: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        const res = a ** b;
        this.push(res);
        return { type: 'step', description: `${a} ** ${b} = ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_NEGATE: {
        const a = this.pop() as number;
        this.push(-a);
        return { type: 'step', description: `-${a}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_NOT: {
        const a = this.pop();
        const res = !isTruthy(a);
        this.push(res);
        return { type: 'step', description: `not ${valueToString(a)} -> ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_EQUAL: {
        const b = this.pop();
        const a = this.pop();
        const res = valuesEqual(a, b);
        this.push(res);
        return { type: 'step', description: `${valueToString(a)} == ${valueToString(b)} -> ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_NOT_EQUAL: {
        const b = this.pop();
        const a = this.pop();
        const res = !valuesEqual(a, b);
        this.push(res);
        return { type: 'step', description: `${valueToString(a)} != ${valueToString(b)} -> ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_GREATER: {
        const b = this.pop() as any;
        const a = this.pop() as any;
        const res = a > b;
        this.push(res);
        return { type: 'step', description: `${a} > ${b} -> ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_GREATER_EQUAL: {
        const b = this.pop() as any;
        const a = this.pop() as any;
        const res = a >= b;
        this.push(res);
        return { type: 'step', description: `${a} >= ${b} -> ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_LESS: {
        const b = this.pop() as any;
        const a = this.pop() as any;
        const res = a < b;
        this.push(res);
        return { type: 'step', description: `${a} < ${b} -> ${res}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_LESS_EQUAL: {
        const b = this.pop() as any;
        const a = this.pop() as any;
        const res = a <= b;
        this.push(res);
        return { type: 'step', description: `${a} <= ${b} -> ${res}`, loc, stepIndex: 0 };
      }

      case OpCode.OP_JUMP: {
        const offset = (frame.closure.fn.chunk.code[frame.ip++]! << 8) | frame.closure.fn.chunk.code[frame.ip++]!;
        frame.ip += offset;
        return { type: 'step', description: `Jump +${offset}`, loc, stepIndex: 0 };
      }
      case OpCode.OP_JUMP_IF_FALSE: {
        const offset = (frame.closure.fn.chunk.code[frame.ip++]! << 8) | frame.closure.fn.chunk.code[frame.ip++]!;
        const cond = this.peek(0);
        if (!isTruthy(cond)) {
          frame.ip += offset;
          return { type: 'step', description: `Condition false -> jump +${offset}`, loc, stepIndex: 0 };
        }
        return { type: 'step', description: 'Condition true -> continue branch', loc, stepIndex: 0 };
      }
      case OpCode.OP_LOOP: {
        const offset = (frame.closure.fn.chunk.code[frame.ip++]! << 8) | frame.closure.fn.chunk.code[frame.ip++]!;
        frame.ip -= offset;
        return { type: 'loop', description: `Loop back -${offset}`, loc, stepIndex: 0 };
      }

      case OpCode.OP_CALL: {
        const argCount = frame.closure.fn.chunk.code[frame.ip++]!;
        const callee = this.peek(argCount);
        const fnName = callee && typeof callee === 'object' ? (callee as any).name || (callee as any).fn?.name || 'function' : 'function';
        this.callValue(callee, argCount);
        return { type: 'call', description: `Call ${fnName}()`, fnName, loc, stepIndex: 0 };
      }

      case OpCode.OP_CLOSURE: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const fnVal = frame.closure.fn.chunk.constants[constIdx] as FunctionValue;
        const closure: ClosureValue = {
          kind: 'closure',
          fn: fnVal,
          upvalues: [],
        };

        for (let i = 0; i < fnVal.upvalues.length; i++) {
          const isLocal = frame.closure.fn.chunk.code[frame.ip++] === 1;
          const index = frame.closure.fn.chunk.code[frame.ip++]!;
          if (isLocal) {
            closure.upvalues.push(this.captureUpvalue(frame.slots + index));
          } else {
            closure.upvalues.push(frame.closure.upvalues[index]!);
          }
        }
        this.push(closure);
        return { type: 'step', description: `Create closure <fn ${fnVal.name}>`, fnName: fnVal.name, loc, stepIndex: 0 };
      }

      case OpCode.OP_CLOSE_UPVALUE: {
        this.closeUpvalues(this.stack.length - 1);
        this.pop();
        return { type: 'step', description: 'Close captured variable', loc, stepIndex: 0 };
      }

      case OpCode.OP_RETURN: {
        const result = this.pop();
        const returningFn = frame.closure.fn.name || 'main';
        this.closeUpvalues(frame.slots);
        this.frames.pop();

        if (this.frames.length === 0) {
          return { type: 'halt', description: `Program finished with ${valueToString(result)}`, loc, stepIndex: 0 };
        }

        this.stack.length = frame.slots;
        this.push(result);
        return { type: 'return', description: `Return from ${returningFn}() -> ${valueToString(result)}`, fnName: returningFn, loc, stepIndex: 0 };
      }

      case OpCode.OP_ARRAY: {
        const count = frame.closure.fn.chunk.code[frame.ip++]!;
        const elements: Value[] = [];
        for (let i = count - 1; i >= 0; i--) {
          elements[i] = this.pop();
        }
        const arrVal: ArrayValue = { kind: 'array', elements };
        this.push(arrVal);
        return { type: 'step', description: `Create array ${valueToString(arrVal)}`, loc, stepIndex: 0 };
      }

      case OpCode.OP_OBJECT: {
        const count = frame.closure.fn.chunk.code[frame.ip++]!;
        const fields = new Map<string, Value>();
        const items: [string, Value][] = [];
        for (let i = 0; i < count; i++) {
          const val = this.pop();
          const key = this.pop() as string;
          items.unshift([key, val]);
        }
        for (const [k, v] of items) {
          fields.set(k, v);
        }
        const objVal: ObjectValue = { kind: 'object', fields };
        this.push(objVal);
        return { type: 'step', description: `Create object ${valueToString(objVal)}`, loc, stepIndex: 0 };
      }

      case OpCode.OP_GET_INDEX: {
        const index = this.pop();
        const target = this.pop();
        if (typeof target === 'object' && target !== null) {
          if (target.kind === 'array') {
            const idx = Math.trunc(index as number);
            const val = target.elements[idx]!;
            this.push(val);
            return { type: 'step', description: `Index array[${idx}] -> ${valueToString(val)}`, loc, stepIndex: 0 };
          } else if (target.kind === 'object') {
            const key = valueToString(index);
            const val = target.fields.get(key) ?? null;
            this.push(val);
            return { type: 'step', description: `Index object["${key}"] -> ${valueToString(val)}`, loc, stepIndex: 0 };
          }
        }
        throw new Error(`Cannot index into ${valueType(target)}`);
      }

      case OpCode.OP_SET_INDEX: {
        const val = this.pop();
        const index = this.pop();
        const target = this.pop();
        if (typeof target === 'object' && target !== null && target.kind === 'array') {
          const idx = Math.trunc(index as number);
          target.elements[idx] = val;
          this.push(val);
          return { type: 'assign', description: `arr[${idx}] = ${valueToString(val)}`, loc, stepIndex: 0 };
        }
        if (typeof target === 'object' && target !== null && target.kind === 'object') {
          target.fields.set(valueToString(index), val);
          this.push(val);
          return { type: 'assign', description: `obj["${valueToString(index)}"] = ${valueToString(val)}`, loc, stepIndex: 0 };
        }
        throw new Error(`Cannot set index on ${valueType(target)}`);
      }

      case OpCode.OP_GET_PROPERTY: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const propName = frame.closure.fn.chunk.constants[constIdx] as string;
        const target = this.pop();
        if (typeof target === 'object' && target !== null && target.kind === 'array' && propName === 'length') {
          this.push(target.elements.length);
          return { type: 'step', description: `Array .length -> ${target.elements.length}`, loc, stepIndex: 0 };
        }
        if (typeof target === 'object' && target !== null && target.kind === 'array' && propName === 'push') {
          this.push({
            kind: 'native',
            name: 'push',
            arity: 1,
            fn: (args) => {
              target.elements.push(args[0]!);
              return target.elements.length;
            },
          });
          return { type: 'step', description: 'Array .push() method', loc, stepIndex: 0 };
        }
        if (typeof target === 'object' && target !== null && target.kind === 'array' && propName === 'pop') {
          this.push({
            kind: 'native',
            name: 'pop',
            arity: 0,
            fn: () => target.elements.pop() ?? null,
          });
          return { type: 'step', description: 'Array .pop() method', loc, stepIndex: 0 };
        }
        if (typeof target === 'object' && target !== null && target.kind === 'object') {
          const val = target.fields.get(propName) ?? null;
          this.push(val);
          return { type: 'step', description: `Read property .${propName} -> ${valueToString(val)}`, loc, stepIndex: 0 };
        }
        throw new Error(`Property '${propName}' not found.`);
      }

      case OpCode.OP_SET_PROPERTY: {
        const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
        const propName = frame.closure.fn.chunk.constants[constIdx] as string;
        const val = this.pop();
        const target = this.pop();
        if (typeof target === 'object' && target !== null && target.kind === 'object') {
          target.fields.set(propName, val);
          this.push(val);
          return { type: 'assign', description: `.${propName} = ${valueToString(val)}`, loc, stepIndex: 0 };
        }
        throw new Error(`Cannot set property on non-object.`);
      }

      case OpCode.OP_PRINT: {
        const argCount = frame.closure.fn.chunk.code[frame.ip++]!;
        const args: Value[] = [];
        for (let i = 0; i < argCount; i++) {
          args.unshift(this.pop());
        }
        const line = args.map(a => valueToString(a)).join(' ');
        this.output.push(line);
        this.push(null);
        return { type: 'print', description: `Print: "${line}"`, loc, stepIndex: 0 };
      }

      case OpCode.OP_HALT:
        return { type: 'halt', description: 'Halt execution', loc, stepIndex: 0 };

      default:
        return { type: 'step', description: `Instruction ${op}`, loc, stepIndex: 0 };
    }
  }

  private callValue(callee: Value, argCount: number): void {
    if (typeof callee === 'object' && callee !== null) {
      if (callee.kind === 'closure') {
        this.call(callee, argCount);
        return;
      }
      if (callee.kind === 'native') {
        const args: Value[] = [];
        for (let i = 0; i < argCount; i++) {
          args.unshift(this.pop());
        }
        this.pop(); // Pop native function itself
        const res = callee.fn(args);
        this.push(res);
        return;
      }
    }
    throw new Error(`Cannot call non-function of type ${valueType(callee)}.`);
  }

  private call(closure: ClosureValue, argCount: number): void {
    if (this.frames.length >= FRAMES_MAX) {
      throw new Error(`Stack overflow.`);
    }
    const frame: CallFrame = {
      closure,
      ip: 0,
      slots: this.stack.length - argCount - 1,
    };
    this.frames.push(frame);
  }

  private captureUpvalue(localIndex: number): Upvalue {
    for (const upval of this.openUpvalues) {
      if (upval.location === localIndex) return upval;
    }
    const upval: Upvalue = { location: localIndex, closed: null };
    this.openUpvalues.push(upval);
    return upval;
  }

  private closeUpvalues(lastSlot: number): void {
    for (let i = this.openUpvalues.length - 1; i >= 0; i--) {
      const upval = this.openUpvalues[i]!;
      if (upval.location >= lastSlot) {
        upval.closed = this.stack[upval.location]!;
        this.openUpvalues.splice(i, 1);
      }
    }
  }

  private push(val: Value): void {
    if (this.stack.length >= STACK_MAX) throw new Error('Stack overflow.');
    this.stack.push(val);
  }

  private pop(): Value {
    if (this.stack.length === 0) throw new Error('Stack underflow.');
    return this.stack.pop()!;
  }

  private peek(distance: number): Value {
    return this.stack[this.stack.length - 1 - distance]!;
  }
}
