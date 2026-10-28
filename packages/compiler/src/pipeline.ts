/**
 * The one entry point from source text to bytecode.
 *
 * Every consumer (VM.interpret, the time-travel debugger, the CLI and the IDE
 * worker) calls compile(), so lexing, parsing, semantic analysis and code
 * generation happen in exactly one place with one error-reporting contract.
 */
import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { SemanticAnalyzer, SemanticError } from './semantic/analyzer.js';
import { BytecodeCompiler } from './codegen/compiler.js';
import { Chunk } from './codegen/chunk.js';
import { CodeTimeError } from './diagnostics/errors.js';
import type { Program } from './ast/index.js';

export interface CompileResult {
  /** Bytecode for the top-level script; null when there are errors. */
  chunk: Chunk | null;
  /** The parsed program (possibly partial when there are syntax errors). */
  ast: Program;
  /** Errors from every stage, in source order within each stage. Empty means success. */
  diagnostics: CodeTimeError[];
  /** Non-fatal findings, such as variable shadowing. */
  warnings: SemanticError[];
}

export function compile(source: string): CompileResult {
  const tokens = new Lexer(source).tokenize();
  const { program, errors: parseErrors } = new Parser(tokens, source).parseProgram();

  // Semantic analysis of a partial AST produces misleading follow-on errors
  // (e.g. "undefined variable" for a declaration that failed to parse), so
  // report syntax errors alone first.
  if (parseErrors.length > 0) {
    return { chunk: null, ast: program, diagnostics: parseErrors, warnings: [] };
  }

  const semantic = new SemanticAnalyzer(source).analyze(program);
  if (semantic.errors.length > 0) {
    return { chunk: null, ast: program, diagnostics: semantic.errors, warnings: semantic.warnings };
  }

  try {
    const chunk = new BytecodeCompiler('script', 'main').compile(program);
    return { chunk, ast: program, diagnostics: [], warnings: semantic.warnings };
  } catch (err) {
    if (err instanceof CodeTimeError) {
      return { chunk: null, ast: program, diagnostics: [err], warnings: semantic.warnings };
    }
    throw err;
  }
}
