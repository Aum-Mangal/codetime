export {
  VM,
  RuntimeError,
  DEFAULT_MAX_INSTRUCTIONS,
  type CallFrame,
  type VMResult,
  type VMOptions,
} from './vm.js';

export {
  type Value,
  type PrimitiveValue,
  type ArrayValue,
  type ObjectValue,
  type FunctionValue,
  type ClosureValue,
  type NativeFunctionValue,
  type StructTypeValue,
  type Upvalue,
  isTruthy,
  valuesEqual,
  valueType,
  valueToString,
} from './value.js';

export { BUILTIN_SIGNATURES, BUILTIN_NAMES, type BuiltinSignature } from './natives.js';
