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
} from './value.js';
import { SourceLocation } from '../lexer/index.js';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { SemanticAnalyzer } from '../semantic/analyzer.js';
import { BytecodeCompiler } from '../codegen/compiler.js';

export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly loc: SourceLocation,
    public readonly callStack: { fnName: string; loc: SourceLocation }[] = [],
    public readonly source?: string,
  ) {
    super(message);
    this.name = 'RuntimeError';
  }

  public format(src?: string): string {
    const sourceText = src ?? this.source;
    const lines = sourceText ? sourceText.split('\n') : [];
    const srcLine = lines[this.loc.line - 1] ?? '';
    const caret = ' '.repeat(Math.max(0, this.loc.column - 1)) + '^';

    const parts = [
      `RuntimeError: ${this.message}`,
      `  --> line ${this.loc.line}, column ${this.loc.column}`,
    ];

    if (srcLine) {
      parts.push('', `  ${this.loc.line} | ${srcLine}`, `    | ${caret}`);
    }

    if (this.callStack.length > 0) {
      parts.push('', 'Call Stack:');
      for (const frame of this.callStack) {
        parts.push(`  at ${frame.fnName} (line ${frame.loc.line}, col ${frame.loc.column})`);
      }
    }

    return parts.join('\n');
  }
}

export interface CallFrame {
  closure: ClosureValue;
  ip: number;
  slots: number; // stack base index
}

export interface VMResult {
  success: boolean;
  output: string[];
  result?: Value;
  error?: RuntimeError;
}

const STACK_MAX = 4096;
const FRAMES_MAX = 256;

export class VM {
  public stack: Value[] = [];
  public frames: CallFrame[] = [];
  public globals: Map<string, Value> = new Map();
  public openUpvalues: Upvalue[] = [];
  public output: string[] = [];
  public source?: string;

  constructor(source?: string) {
    this.source = source;
    this.initGlobals();
  }

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
      if (typeof arg === 'string') {
        const parsed = parseInt(arg, 10);
        if (isNaN(parsed)) throw new Error(`Cannot parse '${arg}' as integer.`);
        return parsed;
      }
      if (typeof arg === 'boolean') return arg ? 1 : 0;
      throw new Error(`Cannot convert type '${valueType(arg)}' to integer.`);
    });

    this.defineNative('float', 1, (args) => {
      const arg = args[0]!;
      if (typeof arg === 'number') return arg;
      if (typeof arg === 'string') {
        const parsed = parseFloat(arg);
        if (isNaN(parsed)) throw new Error(`Cannot parse '${arg}' as float.`);
        return parsed;
      }
      if (typeof arg === 'boolean') return arg ? 1.0 : 0.0;
      throw new Error(`Cannot convert type '${valueType(arg)}' to float.`);
    });

    this.defineNative('str', 1, (args) => {
      return valueToString(args[0]!);
    });

    this.defineNative('bool', 1, (args) => {
      return isTruthy(args[0]!);
    });
  }

  public defineNative(name: string, arity: number, fn: (args: Value[]) => Value): void {
    const nativeVal: NativeFunctionValue = {
      kind: 'native',
      name,
      arity,
      fn,
    };
    this.globals.set(name, nativeVal);
  }

  public interpret(source: string): VMResult {
    this.source = source;
    this.output = [];

    // 1. Lex
    const tokens = new Lexer(source).tokenize();

    // 2. Parse
    const parser = new Parser(tokens, source);
    const ast = parser.parse();

    // 3. Semantic Analysis
    const analyzer = new SemanticAnalyzer(source);
    const semanticRes = analyzer.analyze(ast);
    if (semanticRes.errors.length > 0) {
      const err = semanticRes.errors[0]!;
      return {
        success: false,
        output: this.output,
        error: new RuntimeError(err.message, err.loc, [], source),
      };
    }

    // 4. Compile to Bytecode
    const compiler = new BytecodeCompiler('script', 'main');
    const chunk = compiler.compile(ast);

    // 5. Run VM
    return this.run(chunk);
  }

  public run(chunk: Chunk): VMResult {
    this.stack = [];
    this.frames = [];
    this.openUpvalues = [];

    const scriptFn: FunctionValue = {
      kind: 'function',
      name: 'main',
      arity: 0,
      minArity: 0,
      chunk,
      upvalues: [],
    };

    const mainClosure: ClosureValue = {
      kind: 'closure',
      fn: scriptFn,
      upvalues: [],
    };

    this.push(mainClosure);
    this.call(mainClosure, 0);

    return this.execute();
  }

  private execute(): VMResult {
    let frame = this.frames[this.frames.length - 1]!;

    while (true) {
      if (frame.ip >= frame.closure.fn.chunk.code.length) {
        break;
      }

      const instruction = frame.closure.fn.chunk.code[frame.ip++] as OpCode;
      const currentLoc = frame.closure.fn.chunk.locations[frame.ip - 1] ?? { line: 1, column: 1, offset: 0 };

      try {
        switch (instruction) {
          case OpCode.OP_CONSTANT: {
            const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
            const constant = frame.closure.fn.chunk.constants[constIdx]!;
            this.push(constant);
            break;
          }
          case OpCode.OP_NULL:
            this.push(null);
            break;
          case OpCode.OP_TRUE:
            this.push(true);
            break;
          case OpCode.OP_FALSE:
            this.push(false);
            break;
          case OpCode.OP_POP:
            this.pop();
            break;
          case OpCode.OP_DUP: {
            const val = this.peek(0);
            this.push(val);
            break;
          }

          case OpCode.OP_GET_LOCAL: {
            const slot = frame.closure.fn.chunk.code[frame.ip++]!;
            this.push(this.stack[frame.slots + slot]!);
            break;
          }
          case OpCode.OP_SET_LOCAL: {
            const slot = frame.closure.fn.chunk.code[frame.ip++]!;
            this.stack[frame.slots + slot] = this.peek(0);
            break;
          }
          case OpCode.OP_GET_GLOBAL: {
            const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
            const name = frame.closure.fn.chunk.constants[constIdx] as string;
            if (!this.globals.has(name)) {
              throw new Error(`Undefined variable '${name}'.`);
            }
            this.push(this.globals.get(name)!);
            break;
          }
          case OpCode.OP_DEFINE_GLOBAL: {
            const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
            const name = frame.closure.fn.chunk.constants[constIdx] as string;
            this.globals.set(name, this.pop());
            break;
          }
          case OpCode.OP_SET_GLOBAL: {
            const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
            const name = frame.closure.fn.chunk.constants[constIdx] as string;
            this.globals.set(name, this.peek(0));
            break;
          }
          case OpCode.OP_GET_UPVALUE: {
            const slot = frame.closure.fn.chunk.code[frame.ip++]!;
            const upvalue = frame.closure.upvalues[slot]!;
            this.push(upvalue.closed !== null ? upvalue.closed : this.stack[upvalue.location]!);
            break;
          }
          case OpCode.OP_SET_UPVALUE: {
            const slot = frame.closure.fn.chunk.code[frame.ip++]!;
            const upvalue = frame.closure.upvalues[slot]!;
            if (upvalue.closed !== null) {
              upvalue.closed = this.peek(0);
            } else {
              this.stack[upvalue.location] = this.peek(0);
            }
            break;
          }

          case OpCode.OP_ADD: {
            const b = this.pop();
            const a = this.pop();
            if (typeof a === 'number' && typeof b === 'number') {
              this.push(a + b);
            } else if (typeof a === 'string' || typeof b === 'string') {
              this.push(valueToString(a) + valueToString(b));
            } else {
              throw new Error(`Cannot add types '${valueType(a)}' and '${valueType(b)}'.`);
            }
            break;
          }
          case OpCode.OP_SUB: {
            const b = this.pop();
            const a = this.pop();
            this.checkNumberOperands(a, b, '-');
            this.push((a as number) - (b as number));
            break;
          }
          case OpCode.OP_MUL: {
            const b = this.pop();
            const a = this.pop();
            this.checkNumberOperands(a, b, '*');
            this.push((a as number) * (b as number));
            break;
          }
          case OpCode.OP_DIV: {
            const b = this.pop();
            const a = this.pop();
            this.checkNumberOperands(a, b, '/');
            if (b === 0) {
              throw new Error(`Division by zero.`);
            }
            const res = (a as number) / (b as number);
            // If both are integers and evenly divide, keep as integer
            if (Number.isInteger(a) && Number.isInteger(b) && (a as number) % (b as number) === 0) {
              this.push(Math.trunc(res));
            } else {
              this.push(res);
            }
            break;
          }
          case OpCode.OP_MOD: {
            const b = this.pop();
            const a = this.pop();
            this.checkNumberOperands(a, b, '%');
            if (b === 0) throw new Error(`Modulo by zero.`);
            this.push((a as number) % (b as number));
            break;
          }
          case OpCode.OP_POW: {
            const b = this.pop();
            const a = this.pop();
            this.checkNumberOperands(a, b, '**');
            this.push((a as number) ** (b as number));
            break;
          }
          case OpCode.OP_NEGATE: {
            const a = this.pop();
            if (typeof a !== 'number') {
              throw new Error(`Operand must be a number for unary '-'.`);
            }
            this.push(-a);
            break;
          }
          case OpCode.OP_NOT: {
            const a = this.pop();
            this.push(!isTruthy(a));
            break;
          }

          case OpCode.OP_EQUAL: {
            const b = this.pop();
            const a = this.pop();
            this.push(valuesEqual(a, b));
            break;
          }
          case OpCode.OP_NOT_EQUAL: {
            const b = this.pop();
            const a = this.pop();
            this.push(!valuesEqual(a, b));
            break;
          }
          case OpCode.OP_GREATER: {
            const b = this.pop();
            const a = this.pop();
            this.push((a as any) > (b as any));
            break;
          }
          case OpCode.OP_GREATER_EQUAL: {
            const b = this.pop();
            const a = this.pop();
            this.push((a as any) >= (b as any));
            break;
          }
          case OpCode.OP_LESS: {
            const b = this.pop();
            const a = this.pop();
            this.push((a as any) < (b as any));
            break;
          }
          case OpCode.OP_LESS_EQUAL: {
            const b = this.pop();
            const a = this.pop();
            this.push((a as any) <= (b as any));
            break;
          }

          case OpCode.OP_JUMP: {
            const offset = (frame.closure.fn.chunk.code[frame.ip++]! << 8) | frame.closure.fn.chunk.code[frame.ip++]!;
            frame.ip += offset;
            break;
          }
          case OpCode.OP_JUMP_IF_FALSE: {
            const offset = (frame.closure.fn.chunk.code[frame.ip++]! << 8) | frame.closure.fn.chunk.code[frame.ip++]!;
            if (!isTruthy(this.peek(0))) {
              frame.ip += offset;
            }
            break;
          }
          case OpCode.OP_LOOP: {
            const offset = (frame.closure.fn.chunk.code[frame.ip++]! << 8) | frame.closure.fn.chunk.code[frame.ip++]!;
            frame.ip -= offset;
            break;
          }

          case OpCode.OP_CALL: {
            const argCount = frame.closure.fn.chunk.code[frame.ip++]!;
            const callee = this.peek(argCount);
            this.callValue(callee, argCount);
            frame = this.frames[this.frames.length - 1]!;
            break;
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
            break;
          }

          case OpCode.OP_CLOSE_UPVALUE: {
            this.closeUpvalues(this.stack.length - 1);
            this.pop();
            break;
          }

          case OpCode.OP_RETURN: {
            const result = this.pop();
            this.closeUpvalues(frame.slots);
            this.frames.pop();

            if (this.frames.length === 0) {
              return {
                success: true,
                output: this.output,
                result,
              };
            }

            // Remove all local variables of returning frame from stack
            this.stack.length = frame.slots;
            this.push(result);
            frame = this.frames[this.frames.length - 1]!;
            break;
          }

          case OpCode.OP_ARRAY: {
            const count = frame.closure.fn.chunk.code[frame.ip++]!;
            const elements: Value[] = [];
            for (let i = count - 1; i >= 0; i--) {
              elements[i] = this.pop();
            }
            const arrVal: ArrayValue = { kind: 'array', elements };
            this.push(arrVal);
            break;
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
            break;
          }

          case OpCode.OP_GET_INDEX: {
            const index = this.pop();
            const target = this.pop();

            if (typeof target === 'object' && target !== null) {
              if (target.kind === 'array') {
                if (typeof index !== 'number') {
                  throw new Error(`Array index must be an integer, got '${valueType(index)}'.`);
                }
                const idx = Math.trunc(index);
                if (idx < 0 || idx >= target.elements.length) {
                  throw new Error(`Array index out of bounds: index ${idx}, length ${target.elements.length}.`);
                }
                this.push(target.elements[idx]!);
                break;
              } else if (target.kind === 'object') {
                const key = valueToString(index);
                this.push(target.fields.has(key) ? target.fields.get(key)! : null);
                break;
              }
            } else if (typeof target === 'string') {
              if (typeof index !== 'number') throw new Error(`String index must be a number.`);
              const idx = Math.trunc(index);
              if (idx < 0 || idx >= target.length) throw new Error(`String index out of bounds: ${idx}.`);
              this.push(target[idx]!);
              break;
            }

            throw new Error(`Cannot index into type '${valueType(target)}'.`);
          }

          case OpCode.OP_SET_INDEX: {
            const val = this.pop();
            const index = this.pop();
            const target = this.pop();

            if (typeof target === 'object' && target !== null) {
              if (target.kind === 'array') {
                if (typeof index !== 'number') throw new Error(`Array index must be an integer.`);
                const idx = Math.trunc(index);
                if (idx < 0 || idx > target.elements.length) {
                  throw new Error(`Array index out of bounds: index ${idx}, length ${target.elements.length}.`);
                }
                target.elements[idx] = val;
                this.push(val);
                break;
              } else if (target.kind === 'object') {
                target.fields.set(valueToString(index), val);
                this.push(val);
                break;
              }
            }

            throw new Error(`Cannot set index on type '${valueType(target)}'.`);
          }

          case OpCode.OP_GET_PROPERTY: {
            const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
            const propName = frame.closure.fn.chunk.constants[constIdx] as string;
            const target = this.pop();

            if (typeof target === 'object' && target !== null) {
              if (target.kind === 'array') {
                if (propName === 'length') {
                  this.push(target.elements.length);
                  break;
                }
                if (propName === 'push') {
                  this.push({
                    kind: 'native',
                    name: 'push',
                    arity: 1,
                    fn: (args) => {
                      target.elements.push(args[0]!);
                      return target.elements.length;
                    },
                  });
                  break;
                }
                if (propName === 'pop') {
                  this.push({
                    kind: 'native',
                    name: 'pop',
                    arity: 0,
                    fn: () => {
                      return target.elements.pop() ?? null;
                    },
                  });
                  break;
                }
              } else if (target.kind === 'object') {
                this.push(target.fields.has(propName) ? target.fields.get(propName)! : null);
                break;
              }
            } else if (typeof target === 'string') {
              if (propName === 'length') {
                this.push(target.length);
                break;
              }
            }

            throw new Error(`Property '${propName}' not found on type '${valueType(target)}'.`);
          }

          case OpCode.OP_SET_PROPERTY: {
            const constIdx = frame.closure.fn.chunk.code[frame.ip++]!;
            const propName = frame.closure.fn.chunk.constants[constIdx] as string;
            const val = this.pop();
            const target = this.pop();

            if (typeof target === 'object' && target !== null && target.kind === 'object') {
              target.fields.set(propName, val);
              this.push(val);
              break;
            }

            throw new Error(`Cannot set property on non-object type '${valueType(target)}'.`);
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
            break;
          }

          case OpCode.OP_HALT:
            return {
              success: true,
              output: this.output,
              result: this.peek(0),
            };
        }
      } catch (err: any) {
        const callStack = this.frames.map(f => ({
          fnName: f.closure.fn.name || 'anonymous',
          loc: f.closure.fn.chunk.locations[Math.max(0, f.ip - 1)] ?? currentLoc,
        })).reverse();

        const runtimeErr = new RuntimeError(err.message, currentLoc, callStack, this.source);
        return {
          success: false,
          output: this.output,
          error: runtimeErr,
        };
      }
    }

    return {
      success: true,
      output: this.output,
      result: this.stack.length > 0 ? this.peek(0) : null,
    };
  }

  private callValue(callee: Value, argCount: number): void {
    if (typeof callee === 'object' && callee !== null) {
      if (callee.kind === 'closure') {
        this.call(callee, argCount);
        return;
      }
      if (callee.kind === 'native') {
        if (callee.arity !== -1 && callee.arity !== argCount) {
          throw new Error(`Native function '${callee.name}' expects ${callee.arity} arguments, got ${argCount}.`);
        }
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
    throw new Error(`Cannot call non-function value of type '${valueType(callee)}'.`);
  }

  private call(closure: ClosureValue, argCount: number): void {
    if (argCount < closure.fn.minArity || argCount > closure.fn.arity) {
      throw new Error(
        `Function '${closure.fn.name}' expects ${closure.fn.minArity === closure.fn.arity ? closure.fn.arity : `${closure.fn.minArity} to ${closure.fn.arity}`} arguments, got ${argCount}.`
      );
    }

    if (this.frames.length >= FRAMES_MAX) {
      throw new Error(`Stack overflow (maximum recursion depth exceeded).`);
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
      if (upval.location === localIndex) {
        return upval;
      }
    }
    const upval: Upvalue = {
      location: localIndex,
      closed: null,
    };
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
    if (this.stack.length >= STACK_MAX) {
      throw new Error(`Stack overflow (maximum stack size exceeded).`);
    }
    this.stack.push(val);
  }

  private pop(): Value {
    if (this.stack.length === 0) {
      throw new Error(`Stack underflow.`);
    }
    return this.stack.pop()!;
  }

  private peek(distance: number): Value {
    return this.stack[this.stack.length - 1 - distance]!;
  }

  private checkNumberOperands(a: Value, b: Value, op: string): void {
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new Error(`Operands for '${op}' must be numbers, got '${valueType(a)}' and '${valueType(b)}'.`);
    }
  }
}
