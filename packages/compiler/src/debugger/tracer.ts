/**
 * Runs one VM instruction and classifies what it did.
 *
 * The tracer never executes bytecode itself: it peeks at the next instruction,
 * calls `vm.step()`, then reads the result. Recording uses the cheap mode
 * (event kind and the variable written, if any); replay asks for the
 * human-readable description of the step being displayed.
 */
import { OpCode, type Chunk } from '../codegen/chunk.js';
import type { SourceLocation } from '../lexer/token.js';
import type { VM, VMStatus } from '../vm/vm.js';
import type { Value } from '../vm/value.js';
import { isTruthy, valueToString } from '../vm/value.js';
import { EventKind } from './trace.js';
import { holderName, isInternalName, localName } from './inspect.js';

const UNKNOWN_LOC: SourceLocation = { line: 1, column: 1, offset: 0 };
const MAX_DESCRIPTION_VALUE = 60;

export interface TracedStep {
  kind: number;
  /** Offset of the executed instruction in its function's bytecode. */
  ip: number;
  loc: SourceLocation;
  /** Call frames while the instruction ran (1 = top-level script). */
  depth: number;
  /** Variable the step wrote to (directly or through an array/object it holds). */
  target: string | null;
  /** Filled only when tracing with `describe`. */
  description: string;
  varName?: string;
  varValue?: string;
  fnName?: string;
}

function short(v: Value | undefined): string {
  const text = valueToString(v ?? null);
  return text.length > MAX_DESCRIPTION_VALUE ? `${text.slice(0, MAX_DESCRIPTION_VALUE)}…` : text;
}

function calleeName(callee: Value | undefined): string {
  if (callee === null || callee === undefined || typeof callee !== 'object') return 'fn';
  switch (callee.kind) {
    case 'closure': return callee.fn.name || 'anonymous';
    case 'native':
    case 'struct':
    case 'function': return callee.name;
    default: return 'fn';
  }
}

/**
 * Per chunk: the instruction offset where each named local comes into scope,
 * i.e. just after its initializer. A `let` inside a function compiles to no
 * store instruction (the initializer's value simply stays in the local's
 * stack slot), so reaching this offset is how the tracer sees the write.
 */
const declarationSites = new WeakMap<Chunk, Map<number, string>>();

function declarationsOf(chunk: Chunk): Map<number, string> {
  let sites = declarationSites.get(chunk);
  if (!sites) {
    sites = new Map();
    for (const info of chunk.debug.locals) {
      if (!isInternalName(info.name)) sites.set(info.startIp, info.name);
    }
    declarationSites.set(chunk, sites);
  }
  return sites;
}

const BINARY_SYMBOLS: Partial<Record<OpCode, string>> = {
  [OpCode.OP_ADD]: '+', [OpCode.OP_SUB]: '-', [OpCode.OP_MUL]: '*', [OpCode.OP_DIV]: '/',
  [OpCode.OP_MOD]: '%', [OpCode.OP_POW]: '**', [OpCode.OP_EQUAL]: '==', [OpCode.OP_NOT_EQUAL]: '!=',
  [OpCode.OP_GREATER]: '>', [OpCode.OP_GREATER_EQUAL]: '>=', [OpCode.OP_LESS]: '<', [OpCode.OP_LESS_EQUAL]: '<=',
};

export class StepTracer {
  /** Result of the most recent trace() call (reused to avoid allocating per step). */
  public readonly step: TracedStep = { kind: EventKind.Step, ip: 0, loc: UNKNOWN_LOC, depth: 0, target: null, description: '' };

  public trace(vm: VM, describe: boolean): VMStatus {
    const out = this.step;
    const frame = vm.frames[vm.frames.length - 1]!;
    const fn = frame.closure.fn;
    const chunk = fn.chunk;
    const code = chunk.code;
    const ip = frame.ip;
    const op = code[ip] as OpCode;
    const operand = code[ip + 1]!;

    out.kind = EventKind.Step;
    out.ip = ip;
    out.loc = chunk.locations[ip] ?? UNKNOWN_LOC;
    out.depth = vm.frames.length;
    out.target = null;
    out.description = '';
    out.varName = out.varValue = out.fnName = undefined;

    // Operands the instruction will consume, read before it runs.
    const sp = vm.stack.length;
    const left = vm.stack[sp - 2];
    const right = vm.stack[sp - 1];
    let subject: Value | undefined; // callee, or the array/object being written
    if (op === OpCode.OP_CALL) subject = vm.stack[sp - 1 - operand];
    else if (op === OpCode.OP_SET_INDEX) subject = vm.stack[sp - 3];
    else if (op === OpCode.OP_SET_PROPERTY) subject = left;

    const status = vm.step();

    if (status === 'error') {
      out.kind = EventKind.Error;
      out.description = vm.error?.message ?? 'Runtime error';
      return status;
    }

    const top = vm.stack[vm.stack.length - 1];
    const assign = (name: string, value: Value | undefined, text: string): void => {
      if (isInternalName(name)) return; // compiler temporaries stay ordinary steps
      out.kind = EventKind.Assign;
      out.target = name;
      if (describe) {
        out.varName = name;
        out.varValue = valueToString(value ?? null);
        out.description = text;
      }
    };

    switch (op) {
      case OpCode.OP_SET_LOCAL: {
        const name = localName(chunk, operand, ip) ?? `local${operand}`;
        assign(name, top, `${name} = ${short(top)}`);
        break;
      }
      case OpCode.OP_DEFINE_GLOBAL:
      case OpCode.OP_SET_GLOBAL: {
        const name = chunk.constants[operand] as string;
        const value = vm.globals.get(name);
        assign(name, value, `${op === OpCode.OP_DEFINE_GLOBAL ? 'let ' : ''}${name} = ${short(value)}`);
        break;
      }
      case OpCode.OP_SET_UPVALUE: {
        const name = chunk.debug.upvalueNames[operand] ?? 'captured';
        assign(name, top, `${name} = ${short(top)} (captured)`);
        break;
      }
      case OpCode.OP_SET_INDEX: {
        out.kind = EventKind.Assign;
        out.target = holderName(vm, subject);
        if (describe) out.description = `${out.target ?? 'value'}[${short(left)}] = ${short(top)}`;
        break;
      }
      case OpCode.OP_SET_PROPERTY: {
        out.kind = EventKind.Assign;
        out.target = holderName(vm, subject);
        if (describe) out.description = `${out.target ?? 'value'}.${chunk.constants[operand] as string} = ${short(top)}`;
        break;
      }
      case OpCode.OP_CALL: {
        const name = calleeName(subject);
        const receiver = subject !== null && typeof subject === 'object' && subject.kind === 'native' ? subject.receiver : undefined;
        out.kind = name === 'print' && receiver === undefined ? EventKind.Print : EventKind.Call;
        // Built-in methods such as arr.push(x) modify the array they belong to.
        if (receiver !== undefined) out.target = holderName(vm, receiver);
        if (describe) {
          out.fnName = name;
          const owner = receiver !== undefined ? `${out.target ?? 'value'}.` : '';
          out.description = out.kind === EventKind.Print
            ? `"${vm.output[vm.output.length - 1] ?? ''}"`
            : `Call ${owner}${name}(${operand === 1 ? '1 arg' : `${operand} args`})`;
        }
        break;
      }
      case OpCode.OP_RETURN: {
        const name = fn.name || 'main';
        if (vm.status === 'halted') {
          out.kind = EventKind.Halt;
          if (describe) out.description = 'Program ended';
        } else {
          out.kind = EventKind.Return;
          if (describe) out.description = `${name}() → ${short(top)}`;
        }
        if (describe) out.fnName = name;
        break;
      }
      case OpCode.OP_HALT:
        out.kind = EventKind.Halt;
        if (describe) out.description = 'Program ended';
        break;
      case OpCode.OP_PRINT:
        out.kind = EventKind.Print;
        if (describe) out.description = `"${vm.output[vm.output.length - 1] ?? ''}"`;
        break;
      case OpCode.OP_LOOP:
        out.kind = EventKind.Loop;
        if (describe) out.description = 'Next loop iteration';
        break;
      case OpCode.OP_JUMP_IF_FALSE:
        out.kind = EventKind.Branch;
        if (describe) out.description = isTruthy(right ?? null) ? 'Condition true → enter' : 'Condition false → skip';
        break;
      case OpCode.OP_JUMP:
        out.kind = EventKind.Branch;
        if (describe) out.description = 'Jump';
        break;
      case OpCode.OP_JUMP_IF_ARG_PRESENT: {
        out.kind = EventKind.Branch;
        if (describe) {
          const name = localName(chunk, operand, ip) ?? `argument ${operand}`;
          out.description = vm.frames[vm.frames.length - 1]!.ip === ip + 4
            ? `Argument ${name} missing → use default`
            : `Argument ${name} was passed`;
        }
        break;
      }
      default:
        if (describe) out.description = this.describeSimple(vm, op, operand, left, right, top);
    }

    // The step that finishes a local's initializer declares it: `let lo = 0`,
    // or the return from `f` in `let x = f()`.
    if (out.target === null && status === 'running' && vm.frames.length <= out.depth) {
      const returned = vm.frames.length < out.depth;
      const current = vm.frames[vm.frames.length - 1]!;
      const next = current.ip;
      const declared = returned || (next > ip && op !== OpCode.OP_LOOP)
        ? declarationsOf(current.closure.fn.chunk).get(next)
        : undefined;
      if (declared !== undefined) {
        const kind = out.kind;
        const description = out.description;
        assign(declared, top, `let ${declared} = ${short(top)}`);
        // Keep a branch or call visible as such; it also happened on this step.
        if (kind !== EventKind.Step) {
          out.kind = kind;
          if (describe) out.description = description;
        }
      }
    }
    return status;
  }

  private describeSimple(vm: VM, op: OpCode, operand: number, left: Value | undefined, right: Value | undefined, top: Value | undefined): string {
    const symbol = BINARY_SYMBOLS[op];
    if (symbol) return `${short(left)} ${symbol} ${short(right)} → ${short(top)}`;

    const frame = vm.frames[vm.frames.length - 1]!;
    const chunk = frame.closure.fn.chunk;
    switch (op) {
      case OpCode.OP_CONSTANT: return `Load ${short(top)}`;
      case OpCode.OP_NULL: return 'Load null';
      case OpCode.OP_TRUE: return 'Load true';
      case OpCode.OP_FALSE: return 'Load false';
      case OpCode.OP_POP: return 'Discard value';
      case OpCode.OP_DUP:
      case OpCode.OP_DUP2: return 'Duplicate';
      case OpCode.OP_NEGATE: return `-${short(right)} → ${short(top)}`;
      case OpCode.OP_NOT: return `not ${short(right)} → ${short(top)}`;
      case OpCode.OP_GET_LOCAL: {
        const name = localName(chunk, operand, frame.ip - 2) ?? `local${operand}`;
        return `Read ${name} → ${short(top)}`;
      }
      case OpCode.OP_GET_GLOBAL: return `Read ${chunk.constants[operand] as string} → ${short(top)}`;
      case OpCode.OP_GET_UPVALUE: return `Read ${chunk.debug.upvalueNames[operand] ?? 'captured'} → ${short(top)}`;
      case OpCode.OP_GET_INDEX: return `[${short(right)}] → ${short(top)}`;
      case OpCode.OP_GET_PROPERTY: return `.${chunk.constants[operand] as string} → ${short(top)}`;
      case OpCode.OP_CLOSURE: return `Create closure ${short(top)}`;
      case OpCode.OP_CLOSE_UPVALUE: return 'Move captured variable off the stack';
      case OpCode.OP_ARRAY: return `Build array of ${operand}`;
      case OpCode.OP_OBJECT: return `Build object with ${operand} fields`;
      default: return `Opcode ${op}`;
    }
  }
}
