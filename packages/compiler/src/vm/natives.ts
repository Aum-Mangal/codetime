/**
 * The single source of truth for CodeTime's built-in functions and methods.
 *
 * The semantic analyzer reads BUILTIN_SIGNATURES for arity checks and the VM
 * builds its globals from createNatives(). The debugger replays the same VM,
 * so the CLI and the IDE can never disagree about what a builtin does.
 */
import {
  Value,
  NativeFn,
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

function native(name: string, arity: number, fn: NativeFn): NativeFunctionValue {
  return { kind: 'native', name, arity, fn };
}

const IMPLEMENTATIONS: Record<string, NativeFn> = {
  print: (args, ctx) => {
    ctx.print(args.map(a => valueToString(a)).join(' '));
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

/** Builtins are stateless, so one shared instance of each serves every VM. */
const NATIVES: ReadonlyMap<string, NativeFunctionValue> = new Map(
  BUILTIN_SIGNATURES.map(({ name, arity }) => [name, native(name, arity, IMPLEMENTATIONS[name]!)]),
);

/** The global builtin functions, as a fresh map a VM can use for its globals. */
export function createNatives(): Map<string, NativeFunctionValue> {
  return new Map(NATIVES);
}

const arrayPush: NativeFn = ([v], ctx) => {
  const target = ctx.receiver as ArrayValue;
  target.elements.push(v ?? null);
  return target.elements.length;
};

const arrayPop: NativeFn = (_args, ctx) => (ctx.receiver as ArrayValue).elements.pop() ?? null;

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
    switch (name) {
      case 'length':
        return target.elements.length;
      case 'push':
        return { kind: 'native', name: 'push', arity: 1, fn: arrayPush, receiver: target };
      case 'pop':
        return { kind: 'native', name: 'pop', arity: 0, fn: arrayPop, receiver: target };
    }
  }
  return undefined;
}
