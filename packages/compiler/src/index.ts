/**
 * @codetime/compiler — Public API
 */

import { Lexer } from './lexer/index.js';
import { Parser, ParserError } from './parser/index.js';
import { SemanticAnalyzer, SemanticError, Scope, ScopeType } from './semantic/index.js';
import { BytecodeCompiler, Chunk, OpCode, disassembleChunk, disassembleInstruction } from './codegen/index.js';
import { VM, RuntimeError } from './vm/index.js';
import { TimeTravelDebugger } from './debugger/index.js';

export {
  Lexer,
  Parser,
  ParserError,
  SemanticAnalyzer,
  SemanticError,
  Scope,
  ScopeType,
  BytecodeCompiler,
  Chunk,
  OpCode,
  disassembleChunk,
  disassembleInstruction,
  VM,
  RuntimeError,
  TimeTravelDebugger,
};

export * from './lexer/index.js';
export * from './ast/index.js';
export * from './parser/index.js';
export * from './semantic/index.js';
export * from './codegen/index.js';
export * from './vm/index.js';
export * from './debugger/index.js';
