/**
 * The single source of truth for CodeTime's built-in functions and methods.
 *
 * The semantic analyzer reads BUILTIN_SIGNATURES for arity checks, and every
 * execution engine builds its globals from createNatives(), so the CLI and the
 * IDE can never disagree about what a builtin does.
 */
import {
  Value,
  NativeFunctionValue,
  ArrayValue,
  isTruthy,
  valueToString,
  valueType,
} from './value.js';

export interface BuiltinSignature {
  name: string;
  /** Number of arguments; -1 means variadic. */
  arity: number;
}

export const BUILTIN_SIGNATURES: readonly BuiltinSignature[] = [
  { name: 'print', arity: -1 },
  { name: 'len', arity: 1 },
  { name: 'typeof', arity: 1 },
  { name: 'int', arity: 1 },
  { name: 'float', arity: 1 },
  { name: 'str', arity: 1 },
  { name: 'bool', arity: 1 },
];

export const BUILTIN_NAMES: ReadonlySet<string> = new Set(BUILTIN_SIGNATURES.map(b => b.name));

type NativeImpl = (args: Value[]) => Value;

function native(name: string, arity: number, fn: NativeImpl): NativeFunctionValue {
  return { kind: 'native', name, arity, fn };
}

/** Create the global builtin functions. `print` appends to the given output sink. */
export function createNatives(print: (line: string) => void): Map<string, NativeFunctionValue> {
  const impls: Record<string, NativeImpl> = {
    print: (args) => {
      print(args.map(a => valueToString(a)).join(' '));
      return null;
    },
    len: ([arg]) => {
      if (typeof arg === 'string') return arg.length;
      if (typeof arg === 'object' && arg !== null && arg.kind === 'array') return arg.elements.length;
      if (typeof arg === 'object' && arg !== null && arg.kind === 'object') return arg.fields.size;
      throw new Error(`'len()' not supported for type '${valueType(arg ?? null)}'.`);
    },
    typeof: ([arg]) => valueType(arg ?? null),
    int: ([arg]) => {
      if (typeof arg === 'number') return Math.trunc(arg);
      if (typeof arg === 'string') {
        const parsed = parseInt(arg, 10);
        if (isNaN(parsed)) throw new Error(`Cannot parse '${arg}' as integer.`);
        return parsed;
      }
      if (typeof arg === 'boolean') return arg ? 1 : 0;
      throw new Error(`Cannot convert type '${valueType(arg ?? null)}' to integer.`);
    },
    float: ([arg]) => {
      if (typeof arg === 'number') return arg;
      if (typeof arg === 'string') {
        const parsed = parseFloat(arg);
        if (isNaN(parsed)) throw new Error(`Cannot parse '${arg}' as float.`);
        return parsed;
      }
      if (typeof arg === 'boolean') return arg ? 1.0 : 0.0;
      throw new Error(`Cannot convert type '${valueType(arg ?? null)}' to float.`);
    },
    str: ([arg]) => valueToString(arg ?? null),
    bool: ([arg]) => isTruthy(arg ?? null),
  };

  const natives = new Map<string, NativeFunctionValue>();
  for (const { name, arity } of BUILTIN_SIGNATURES) {
    natives.set(name, native(name, arity, impls[name]!));
  }
  return natives;
}

/**
 * Resolve `target.name` for built-in properties and methods of arrays and
 * strings. Returns undefined when the property does not exist.
 */
export function getBuiltinProperty(target: Value, name: string): Value | undefined {
  if (typeof target === 'string') {
    if (name === 'length') return target.length;
    return undefined;
  }
  if (typeof target === 'object' && target !== null && target.kind === 'array') {
    return getArrayProperty(target, name);
  }
  return undefined;
}

function getArrayProperty(target: ArrayValue, name: string): Value | undefined {
  switch (name) {
    case 'length':
      return target.elements.length;
    case 'push':
      return native('push', 1, ([v]) => {
        target.elements.push(v ?? null);
        return target.elements.length;
      });
    case 'pop':
      return native('pop', 0, () => target.elements.pop() ?? null);
    default:
      return undefined;
  }
}
