export {
  VM,
  RuntimeError,
  type CallFrame,
  type VMResult,
} from './vm.js';

export {
  type Value,
  type PrimitiveValue,
  type ArrayValue,
  type ObjectValue,
  type FunctionValue,
  type ClosureValue,
  type NativeFunctionValue,
  type Upvalue,
  isTruthy,
  valuesEqual,
  valueType,
  valueToString,
} from './value.js';
