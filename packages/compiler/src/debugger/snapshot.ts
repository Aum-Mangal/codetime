/**
 * Capture and restore the complete execution state of a VM.
 *
 * A checkpoint must be a deep copy: the VM keeps running (and mutating arrays,
 * objects and upvalues) after it is taken. The copy preserves identity, so two
 * variables that alias one array still alias one (copied) array, a closure and
 * the frame that owns its open upvalue still share that upvalue, and cyclic
 * structures terminate. Functions, struct types and builtins are immutable and
 * are shared rather than copied.
 */
import type { CallFrame, VM, VMStatus } from '../vm/vm.js';
import type { RuntimeError } from '../vm/vm.js';
import type { ArrayValue, ClosureValue, ObjectValue, Upvalue, Value } from '../vm/value.js';

export interface VMSnapshot {
  stack: Value[];
  frames: CallFrame[];
  globals: Map<string, Value>;
  openUpvalues: Upvalue[];
  status: VMStatus;
  result: Value;
  error: RuntimeError | null;
  instructionCount: number;
}

/**
 * Deep-copies values while remembering every container it has copied, so one
 * original always maps to one copy.
 */
export class StateCopier {
  private readonly copies = new Map<object, unknown>();

  /**
   * @param closeOpenUpvaluesFrom When given, open upvalues are copied as closed
   *   upvalues holding the current value of their stack slot. Used when values
   *   leave their VM (e.g. to evaluate a breakpoint condition elsewhere).
   */
  constructor(private readonly closeOpenUpvaluesFrom?: Value[]) {}

  public value(v: Value): Value {
    if (v === null || typeof v !== 'object') return v;
    switch (v.kind) {
      case 'array': {
        const existing = this.copies.get(v);
        if (existing) return existing as ArrayValue;
        const copy: ArrayValue = { kind: 'array', elements: new Array(v.elements.length) };
        this.copies.set(v, copy);
        for (let i = 0; i < v.elements.length; i++) copy.elements[i] = this.value(v.elements[i]!);
        return copy;
      }
      case 'object': {
        const existing = this.copies.get(v);
        if (existing) return existing as ObjectValue;
        const copy: ObjectValue = { kind: 'object', fields: new Map(), structName: v.structName };
        this.copies.set(v, copy);
        for (const [k, val] of v.fields) copy.fields.set(k, this.value(val));
        return copy;
      }
      case 'closure':
        return this.closure(v);
      case 'native': {
        // Bound methods (arr.push) must follow their receiver into the copy.
        if (v.receiver === undefined) return v;
        const existing = this.copies.get(v);
        if (existing) return existing as Value;
        const copy = { ...v, receiver: undefined as Value | undefined };
        this.copies.set(v, copy);
        copy.receiver = this.value(v.receiver);
        return copy;
      }
      default:
        return v;
    }
  }

  public closure(c: ClosureValue): ClosureValue {
    const existing = this.copies.get(c);
    if (existing) return existing as ClosureValue;
    const copy: ClosureValue = { kind: 'closure', fn: c.fn, upvalues: [] };
    this.copies.set(c, copy);
    for (const u of c.upvalues) copy.upvalues.push(this.upvalue(u));
    return copy;
  }

  public upvalue(u: Upvalue): Upvalue {
    const existing = this.copies.get(u);
    if (existing) return existing as Upvalue;
    const copy: Upvalue = { location: u.location, isClosed: u.isClosed, closed: null };
    this.copies.set(u, copy);
    if (u.isClosed) {
      copy.closed = this.value(u.closed);
    } else if (this.closeOpenUpvaluesFrom) {
      copy.isClosed = true;
      copy.closed = this.value(this.closeOpenUpvaluesFrom[u.location] ?? null);
    }
    return copy;
  }

  public state(src: VMSnapshot): VMSnapshot {
    return {
      stack: src.stack.map(v => this.value(v)),
      frames: src.frames.map(f => ({ closure: this.closure(f.closure), ip: f.ip, slots: f.slots })),
      globals: new Map(Array.from(src.globals, ([k, v]) => [k, this.value(v)] as [string, Value])),
      openUpvalues: src.openUpvalues.map(u => this.upvalue(u)),
      status: src.status,
      result: this.value(src.result),
      error: src.error,
      instructionCount: src.instructionCount,
    };
  }
}

/** Take a deep, independent copy of the VM's execution state. */
export function captureState(vm: VM): VMSnapshot {
  return new StateCopier().state(vm);
}

/**
 * Put the VM into the state held by `snapshot`. The snapshot is copied again,
 * so it can be restored any number of times. Output is not part of the state:
 * the debugger keeps one shared output log and records its length per step.
 */
export function restoreState(vm: VM, snapshot: VMSnapshot): void {
  const s = new StateCopier().state(snapshot);
  vm.stack = s.stack;
  vm.frames = s.frames;
  vm.globals = s.globals;
  vm.openUpvalues = s.openUpvalues;
  vm.status = s.status;
  vm.result = s.result;
  vm.error = s.error;
  vm.instructionCount = s.instructionCount;
  vm.output = [];
}
