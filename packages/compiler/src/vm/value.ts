import type { Chunk } from '../codegen/chunk.js';

export type PrimitiveValue = number | string | boolean | null;

export interface ArrayValue {
  kind: 'array';
  elements: Value[];
}

export interface ObjectValue {
  kind: 'object';
  fields: Map<string, Value>;
  /** Set when the object was created by a struct constructor. */
  structName?: string;
}

/** A struct declaration at runtime: calling it constructs an ObjectValue with these fields. */
export interface StructTypeValue {
  kind: 'struct';
  name: string;
  fields: string[];
}

export interface FunctionValue {
  kind: 'function';
  name: string;
  arity: number;
  minArity: number;
  chunk: Chunk;
  upvalues: { index: number; isLocal: boolean }[];
  localNames?: string[];
}

export interface Upvalue {
  location: number; // stack index
  closed: Value | null;
}

export interface ClosureValue {
  kind: 'closure';
  fn: FunctionValue;
  upvalues: Upvalue[];
}

export type NativeFn = (args: Value[]) => Value;

export interface NativeFunctionValue {
  kind: 'native';
  name: string;
  arity: number; // -1 for variadic
  fn: NativeFn;
}

export type Value =
  | PrimitiveValue
  | ArrayValue
  | ObjectValue
  | FunctionValue
  | ClosureValue
  | NativeFunctionValue
  | StructTypeValue;

export function isTruthy(val: Value): boolean {
  if (val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  if (typeof val === 'object' && val !== null) {
    if (val.kind === 'array') return val.elements.length > 0;
  }
  return true;
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;

  if (typeof a === 'object' && typeof b === 'object') {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'array' && b.kind === 'array') {
      if (a.elements.length !== b.elements.length) return false;
      for (let i = 0; i < a.elements.length; i++) {
        if (!valuesEqual(a.elements[i]!, b.elements[i]!)) return false;
      }
      return true;
    }
  }

  return false;
}

export function valueType(val: Value): string {
  if (val === null) return 'null';
  if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
  if (typeof val === 'string') return 'string';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'object') {
    if (val.kind === 'object' && val.structName) return val.structName;
    return val.kind;
  }
  return 'unknown';
}

/**
 * Convert a value to its display string. Containers already being printed are
 * tracked in `seen`, so self-referencing arrays/objects print as `[...]` /
 * `{...}` instead of recursing forever.
 */
export function valueToString(val: Value, seen: Set<object> = new Set()): string {
  if (val === null) return 'null';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'string') return val;
  if (typeof val === 'boolean') return val ? 'true' : 'false';

  if (typeof val === 'object') {
    switch (val.kind) {
      case 'array': {
        if (seen.has(val)) return '[...]';
        seen.add(val);
        const elems = val.elements.map(e => nestedToString(e, seen)).join(', ');
        seen.delete(val);
        return `[${elems}]`;
      }
      case 'object': {
        if (seen.has(val)) return '{...}';
        seen.add(val);
        const entries: string[] = [];
        for (const [k, v] of val.fields.entries()) {
          entries.push(`${k}: ${nestedToString(v, seen)}`);
        }
        seen.delete(val);
        const prefix = val.structName ? `${val.structName} ` : '';
        return `${prefix}{ ${entries.join(', ')} }`;
      }
      case 'function':
        return `<fn ${val.name || 'anonymous'}>`;
      case 'closure':
        return `<fn ${val.fn.name || 'anonymous'}>`;
      case 'native':
        return `<native fn ${val.name}>`;
      case 'struct':
        return `<struct ${val.name}>`;
    }
  }

  return String(val);
}

/** Strings inside containers are quoted so `["a"]` is distinguishable from `[a]`. */
function nestedToString(val: Value, seen: Set<object>): string {
  return typeof val === 'string' ? `"${val}"` : valueToString(val, seen);
}

/** Build a struct instance from constructor arguments (one per declared field). */
export function instantiateStruct(def: StructTypeValue, args: Value[]): ObjectValue {
  const fields = new Map<string, Value>();
  def.fields.forEach((field, i) => fields.set(field, args[i] ?? null));
  return { kind: 'object', fields, structName: def.name };
}
