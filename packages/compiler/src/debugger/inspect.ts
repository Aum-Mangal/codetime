/**
 * Read-only views of a paused VM: which variables are in scope, what they
 * hold, and which variable owns a given array or object.
 *
 * Variable names come from the compiler's debug info (Chunk.debug): each local
 * has the instruction range in which it occupies its stack slot, so the same
 * slot can be reported as `i` in one block and `total` in the next.
 */
import type { Chunk, LocalVariableInfo } from '../codegen/chunk.js';
import type { SourceLocation } from '../lexer/token.js';
import type { CallFrame, VM } from '../vm/vm.js';
import { MISSING_ARG } from '../vm/vm.js';
import type { Value } from '../vm/value.js';
import { valueToString, valueType } from '../vm/value.js';
import { BUILTIN_NAMES } from '../vm/natives.js';
import type { FrameSnapshot, VariableSnapshot } from './types.js';

const UNKNOWN_LOC: SourceLocation = { line: 1, column: 1, offset: 0 };
const MAX_DISPLAY_LENGTH = 2000;

/** Locals whose stack slot holds them at instruction pointer `ip`, by slot. */
export function liveLocals(chunk: Chunk, ip: number): LocalVariableInfo[] {
  return chunk.debug.locals
    .filter(info => info.startIp <= ip && ip <= info.endIp)
    .sort((a, b) => a.slot - b.slot);
}

/** Name of the local in `slot` at `ip`, or null if the compiler recorded none. */
export function localName(chunk: Chunk, slot: number, ip: number): string | null {
  for (const info of chunk.debug.locals) {
    if (info.slot === slot && info.startIp <= ip && ip <= info.endIp) return info.name;
  }
  return null;
}

/** Hidden compiler temporaries (for-in's `$iterable` and `$index`). */
export function isInternalName(name: string): boolean {
  return name === '' || name.startsWith('$');
}

export function displayValue(v: Value): string {
  const text = valueToString(v);
  return text.length > MAX_DISPLAY_LENGTH ? `${text.slice(0, MAX_DISPLAY_LENGTH)}…` : text;
}

function variable(name: string, value: Value, changed: boolean, captured = false): VariableSnapshot {
  return {
    name,
    type: valueType(value),
    displayValue: displayValue(value),
    changed,
    ...(captured ? { captured } : {}),
  };
}

function upvalueValue(vm: VM, frame: CallFrame, index: number): Value {
  const u = frame.closure.upvalues[index]!;
  return u.isClosed ? u.closed : vm.stack[u.location] ?? null;
}

/** Live locals and captured variables of one frame. */
function frameVariables(vm: VM, frameIndex: number, changedName: string | null): VariableSnapshot[] {
  const frame = vm.frames[frameIndex]!;
  const chunk = frame.closure.fn.chunk;
  const isTop = frameIndex === vm.frames.length - 1;
  const end = isTop ? vm.stack.length : vm.frames[frameIndex + 1]!.slots;
  const result: VariableSnapshot[] = [];

  for (const info of liveLocals(chunk, frame.ip)) {
    const index = frame.slots + info.slot;
    if (isInternalName(info.name) || index >= end) continue;
    const value = vm.stack[index];
    if (value === MISSING_ARG) continue;
    result.push(variable(info.name, value!, isTop && info.name === changedName));
  }

  const names = chunk.debug.upvalueNames;
  for (let i = 0; i < frame.closure.upvalues.length; i++) {
    const name = names[i] ?? `captured${i}`;
    result.push(variable(name, upvalueValue(vm, frame, i), isTop && name === changedName, true));
  }
  return result;
}

export function frameViews(vm: VM, changedName: string | null): FrameSnapshot[] {
  return vm.frames.map((frame, i) => {
    const chunk = frame.closure.fn.chunk;
    return {
      id: i,
      fnName: frame.closure.fn.name || 'anonymous',
      loc: chunk.locations[Math.max(0, frame.ip - 1)] ?? UNKNOWN_LOC,
      ip: frame.ip,
      slots: frame.slots,
      locals: frameVariables(vm, i, changedName),
    };
  });
}

export function globalViews(vm: VM, changedName: string | null): VariableSnapshot[] {
  const result: VariableSnapshot[] = [];
  for (const [name, value] of vm.globals) {
    if (BUILTIN_NAMES.has(name) && value !== null && typeof value === 'object' && value.kind === 'native') continue;
    result.push(variable(name, value, name === changedName));
  }
  return result;
}

/**
 * The name of a variable in scope that refers to `obj` (by identity), used to
 * attribute writes like `arr[0] = 1` or `arr.push(1)` to `arr`. Checks the
 * current frame's locals, then its captured variables, then globals.
 */
export function holderName(vm: VM, obj: Value | undefined): string | null {
  if (obj === null || obj === undefined || typeof obj !== 'object') return null;
  const frame = vm.frames[vm.frames.length - 1];
  if (frame) {
    for (const info of liveLocals(frame.closure.fn.chunk, frame.ip)) {
      if (!isInternalName(info.name) && vm.stack[frame.slots + info.slot] === obj) return info.name;
    }
    const names = frame.closure.fn.chunk.debug.upvalueNames;
    for (let i = 0; i < frame.closure.upvalues.length; i++) {
      if (upvalueValue(vm, frame, i) === obj) return names[i] ?? null;
    }
  }
  for (const [name, value] of vm.globals) {
    if (value === obj) return name;
  }
  return null;
}

/** Variables visible from the top frame, for evaluating breakpoint conditions. */
export function visibleVariables(vm: VM): Map<string, Value> {
  const env = new Map<string, Value>(vm.globals);
  const frame = vm.frames[vm.frames.length - 1];
  if (!frame) return env;
  const names = frame.closure.fn.chunk.debug.upvalueNames;
  for (let i = 0; i < frame.closure.upvalues.length; i++) {
    env.set(names[i] ?? `captured${i}`, upvalueValue(vm, frame, i));
  }
  for (const info of liveLocals(frame.closure.fn.chunk, frame.ip)) {
    const value = vm.stack[frame.slots + info.slot];
    if (!isInternalName(info.name) && value !== undefined) env.set(info.name, value);
  }
  return env;
}
