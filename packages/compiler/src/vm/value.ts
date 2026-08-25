import type { Chunk } from '../codegen/chunk.js';

export type PrimitiveValue = number | string | boolean | null;

export interface ArrayValue {
  kind: 'array';
  elements: Value[];
}

export interface ObjectValue {
  kind: 'object';
  fields: Map<string, Value>;
}

export interface FunctionValue {
  kind: 'function';
  name: string;
  arity: number;
  minArity: number;
  chunk: Chunk;
  upvalues: { index: number; isLocal: boolean }[];
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
  | NativeFunctionValue;

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
    return val.kind;
  }
  return 'unknown';
}

export function valueToString(val: Value): string {
  if (val === null) return 'null';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'string') return val;
  if (typeof val === 'boolean') return val ? 'true' : 'false';

  if (typeof val === 'object') {
    switch (val.kind) {
      case 'array': {
        const elems = val.elements.map(e => (typeof e === 'string' ? `"${e}"` : valueToString(e))).join(', ');
        return `[${elems}]`;
      }
      case 'object': {
        const entries: string[] = [];
        for (const [k, v] of val.fields.entries()) {
          const valStr = typeof v === 'string' ? `"${v}"` : valueToString(v);
          entries.push(`${k}: ${valStr}`);
        }
        return `{ ${entries.join(', ')} }`;
      }
      case 'function':
        return `<fn ${val.name || 'anonymous'}>`;
      case 'closure':
        return `<fn ${val.fn.name || 'anonymous'}>`;
      case 'native':
        return `<native fn ${val.name}>`;
    }
  }

  return String(val);
}
