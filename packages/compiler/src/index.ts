/**
 * @codetime/compiler — Public API
 *
 * The compiler is organized in pipeline stages.  Each stage can be used
 * independently for testing and CLI introspection:
 *
 *   source → Lexer → tokens → Parser → AST → SemanticAnalyzer → BytecodeCompiler → VM
 *
 * Day 1 exports: Lexer, Token types, AST node types, AST printer
 * Later days will add: Parser, SemanticAnalyzer, BytecodeCompiler, VM, Debugger
 */

// ── Lexer ──────────────────────────────────────────────────────────────────
export * from './lexer/index.js';

// ── AST ───────────────────────────────────────────────────────────────────
export * from './ast/index.js';

// ── Parser ─────────────────────────────────────────────────────────────────
export * from './parser/index.js';
