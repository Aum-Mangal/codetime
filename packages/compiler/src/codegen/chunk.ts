import { SourceLocation } from '../lexer/index.js';
import type { Value } from '../vm/value.js';
import { valueToString } from '../vm/value.js';

export enum OpCode {
  OP_CONSTANT       = 0,
  OP_NULL           = 1,
  OP_TRUE           = 2,
  OP_FALSE          = 3,
  OP_POP            = 4,
  OP_DUP            = 5,

  // Variables
  OP_GET_LOCAL      = 6,
  OP_SET_LOCAL      = 7,
  OP_GET_GLOBAL     = 8,
  OP_SET_GLOBAL     = 9,
  OP_DEFINE_GLOBAL  = 10,
  OP_GET_UPVALUE    = 11,
  OP_SET_UPVALUE    = 12,

  // Arithmetic
  OP_ADD            = 13,
  OP_SUB            = 14,
  OP_MUL            = 15,
  OP_DIV            = 16,
  OP_MOD            = 17,
  OP_POW            = 18,
  OP_NEGATE         = 19,

  // Logical & Comparison
  OP_NOT            = 20,
  OP_EQUAL          = 21,
  OP_NOT_EQUAL      = 22,
  OP_GREATER        = 23,
  OP_GREATER_EQUAL  = 24,
  OP_LESS           = 25,
  OP_LESS_EQUAL     = 26,

  // Control Flow
  OP_JUMP           = 27,
  OP_JUMP_IF_FALSE  = 28,
  OP_LOOP           = 29,

  // Functions & Closures
  OP_CALL           = 30,
  OP_CLOSURE        = 31,
  OP_CLOSE_UPVALUE  = 32,
  OP_RETURN         = 33,

  // Data Structures
  OP_ARRAY          = 34,
  OP_OBJECT         = 35,
  OP_GET_INDEX      = 36,
  OP_SET_INDEX      = 37,
  OP_GET_PROPERTY   = 38,
  OP_SET_PROPERTY   = 39,

  // Built-in operations
  OP_PRINT          = 40,
  OP_HALT           = 41,
}

export class Chunk {
  public code: number[] = [];
  public constants: Value[] = [];
  public locations: SourceLocation[] = [];

  public write(byte: number, loc: SourceLocation): void {
    this.code.push(byte);
    this.locations.push(loc);
  }

  public addConstant(val: Value): number {
    this.constants.push(val);
    return this.constants.length - 1;
  }

  public writeConstant(val: Value, loc: SourceLocation): void {
    const constIndex = this.addConstant(val);
    this.write(OpCode.OP_CONSTANT, loc);
    this.write(constIndex, loc);
  }
}

export function disassembleChunk(chunk: Chunk, name: string): string {
  const lines: string[] = [`== ${name} ==`];
  let offset = 0;
  while (offset < chunk.code.length) {
    const { output, nextOffset } = disassembleInstruction(chunk, offset);
    lines.push(output);
    offset = nextOffset;
  }
  return lines.join('\n');
}

export function disassembleInstruction(chunk: Chunk, offset: number): { output: string; nextOffset: number } {
  const op = chunk.code[offset] as OpCode;
  const loc = chunk.locations[offset];
  const lineStr = loc ? `${loc.line.toString().padStart(4, ' ')}:${loc.column.toString().padEnd(3, ' ')}` : '   ?:?  ';
  const offsetStr = offset.toString().padStart(4, '0');

  const prefix = `${offsetStr}  ${lineStr}  `;

  switch (op) {
    case OpCode.OP_CONSTANT: {
      const constIdx = chunk.code[offset + 1]!;
      const val = chunk.constants[constIdx];
      return {
        output: `${prefix}OP_CONSTANT         ${constIdx.toString().padStart(4, ' ')} ('${val !== undefined ? valueToString(val) : '?' }')`,
        nextOffset: offset + 2,
      };
    }
    case OpCode.OP_NULL:
      return { output: `${prefix}OP_NULL`, nextOffset: offset + 1 };
    case OpCode.OP_TRUE:
      return { output: `${prefix}OP_TRUE`, nextOffset: offset + 1 };
    case OpCode.OP_FALSE:
      return { output: `${prefix}OP_FALSE`, nextOffset: offset + 1 };
    case OpCode.OP_POP:
      return { output: `${prefix}OP_POP`, nextOffset: offset + 1 };
    case OpCode.OP_DUP:
      return { output: `${prefix}OP_DUP`, nextOffset: offset + 1 };

    case OpCode.OP_GET_LOCAL: {
      const slot = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_GET_LOCAL        slot ${slot}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_SET_LOCAL: {
      const slot = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_SET_LOCAL        slot ${slot}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_GET_GLOBAL: {
      const constIdx = chunk.code[offset + 1]!;
      const name = chunk.constants[constIdx];
      return { output: `${prefix}OP_GET_GLOBAL       '${name !== undefined ? valueToString(name) : '?'}'`, nextOffset: offset + 2 };
    }
    case OpCode.OP_SET_GLOBAL: {
      const constIdx = chunk.code[offset + 1]!;
      const name = chunk.constants[constIdx];
      return { output: `${prefix}OP_SET_GLOBAL       '${name !== undefined ? valueToString(name) : '?'}'`, nextOffset: offset + 2 };
    }
    case OpCode.OP_DEFINE_GLOBAL: {
      const constIdx = chunk.code[offset + 1]!;
      const name = chunk.constants[constIdx];
      return { output: `${prefix}OP_DEFINE_GLOBAL    '${name !== undefined ? valueToString(name) : '?'}'`, nextOffset: offset + 2 };
    }
    case OpCode.OP_GET_UPVALUE: {
      const slot = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_GET_UPVALUE      slot ${slot}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_SET_UPVALUE: {
      const slot = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_SET_UPVALUE      slot ${slot}`, nextOffset: offset + 2 };
    }

    case OpCode.OP_ADD:
      return { output: `${prefix}OP_ADD`, nextOffset: offset + 1 };
    case OpCode.OP_SUB:
      return { output: `${prefix}OP_SUB`, nextOffset: offset + 1 };
    case OpCode.OP_MUL:
      return { output: `${prefix}OP_MUL`, nextOffset: offset + 1 };
    case OpCode.OP_DIV:
      return { output: `${prefix}OP_DIV`, nextOffset: offset + 1 };
    case OpCode.OP_MOD:
      return { output: `${prefix}OP_MOD`, nextOffset: offset + 1 };
    case OpCode.OP_POW:
      return { output: `${prefix}OP_POW`, nextOffset: offset + 1 };
    case OpCode.OP_NEGATE:
      return { output: `${prefix}OP_NEGATE`, nextOffset: offset + 1 };

    case OpCode.OP_NOT:
      return { output: `${prefix}OP_NOT`, nextOffset: offset + 1 };
    case OpCode.OP_EQUAL:
      return { output: `${prefix}OP_EQUAL`, nextOffset: offset + 1 };
    case OpCode.OP_NOT_EQUAL:
      return { output: `${prefix}OP_NOT_EQUAL`, nextOffset: offset + 1 };
    case OpCode.OP_GREATER:
      return { output: `${prefix}OP_GREATER`, nextOffset: offset + 1 };
    case OpCode.OP_GREATER_EQUAL:
      return { output: `${prefix}OP_GREATER_EQUAL`, nextOffset: offset + 1 };
    case OpCode.OP_LESS:
      return { output: `${prefix}OP_LESS`, nextOffset: offset + 1 };
    case OpCode.OP_LESS_EQUAL:
      return { output: `${prefix}OP_LESS_EQUAL`, nextOffset: offset + 1 };

    case OpCode.OP_JUMP: {
      const jump = (chunk.code[offset + 1]! << 8) | chunk.code[offset + 2]!;
      return { output: `${prefix}OP_JUMP             -> ${(offset + 3 + jump).toString().padStart(4, '0')}`, nextOffset: offset + 3 };
    }
    case OpCode.OP_JUMP_IF_FALSE: {
      const jump = (chunk.code[offset + 1]! << 8) | chunk.code[offset + 2]!;
      return { output: `${prefix}OP_JUMP_IF_FALSE    -> ${(offset + 3 + jump).toString().padStart(4, '0')}`, nextOffset: offset + 3 };
    }
    case OpCode.OP_LOOP: {
      const jump = (chunk.code[offset + 1]! << 8) | chunk.code[offset + 2]!;
      return { output: `${prefix}OP_LOOP             -> ${(offset + 3 - jump).toString().padStart(4, '0')}`, nextOffset: offset + 3 };
    }

    case OpCode.OP_CALL: {
      const argCount = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_CALL             args ${argCount}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_CLOSURE: {
      const constIdx = chunk.code[offset + 1]!;
      const fnVal = chunk.constants[constIdx] as any;
      let nextOff = offset + 2;
      const upvaluesDesc: string[] = [];
      if (fnVal && fnVal.upvalues) {
        for (let i = 0; i < fnVal.upvalues.length; i++) {
          const isLocal = chunk.code[nextOff++] === 1;
          const index = chunk.code[nextOff++];
          upvaluesDesc.push(`${isLocal ? 'local' : 'upvalue'} ${index}`);
        }
      }
      return {
        output: `${prefix}OP_CLOSURE          ${constIdx} (${fnVal ? fnVal.name : '?'}) [${upvaluesDesc.join(', ')}]`,
        nextOffset: nextOff,
      };
    }
    case OpCode.OP_CLOSE_UPVALUE:
      return { output: `${prefix}OP_CLOSE_UPVALUE`, nextOffset: offset + 1 };
    case OpCode.OP_RETURN:
      return { output: `${prefix}OP_RETURN`, nextOffset: offset + 1 };

    case OpCode.OP_ARRAY: {
      const count = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_ARRAY            count ${count}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_OBJECT: {
      const count = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_OBJECT           fields ${count}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_GET_INDEX:
      return { output: `${prefix}OP_GET_INDEX`, nextOffset: offset + 1 };
    case OpCode.OP_SET_INDEX:
      return { output: `${prefix}OP_SET_INDEX`, nextOffset: offset + 1 };
    case OpCode.OP_GET_PROPERTY: {
      const constIdx = chunk.code[offset + 1]!;
      const name = chunk.constants[constIdx];
      return { output: `${prefix}OP_GET_PROPERTY     .${name !== undefined ? valueToString(name) : '?'}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_SET_PROPERTY: {
      const constIdx = chunk.code[offset + 1]!;
      const name = chunk.constants[constIdx];
      return { output: `${prefix}OP_SET_PROPERTY     .${name !== undefined ? valueToString(name) : '?'}`, nextOffset: offset + 2 };
    }

    case OpCode.OP_PRINT: {
      const argCount = chunk.code[offset + 1]!;
      return { output: `${prefix}OP_PRINT            args ${argCount}`, nextOffset: offset + 2 };
    }
    case OpCode.OP_HALT:
      return { output: `${prefix}OP_HALT`, nextOffset: offset + 1 };

    default:
      return { output: `${prefix}UNKNOWN_OP (${op})`, nextOffset: offset + 1 };
  }
}
