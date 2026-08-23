/**
 * Tests for AST node construction and the AST printer.
 * These are structural tests — the parser tests (Day 2) will validate
 * that the parser produces the correct AST shapes.
 */

import { describe, it, expect } from 'vitest';
import type {
  Program, LetStmt, BinaryExpr, IdentifierExpr, IntegerLiteralExpr,
  FunctionStmt, BlockStmt, ReturnStmt,
} from '../src/ast/nodes.js';
import { isStatement, isExpression } from '../src/ast/nodes.js';
import { printAST } from '../src/ast/printer.js';

const dummyLoc = { line: 1, column: 1, offset: 0 };

// ── Node construction helpers ──────────────────────────────────────────────

function makeInteger(value: number): IntegerLiteralExpr {
  return { kind: 'IntegerLiteralExpr', value, loc: dummyLoc };
}

function makeIdent(name: string): IdentifierExpr {
  return { kind: 'IdentifierExpr', name, loc: dummyLoc };
}

function makeBinary(op: '+' | '-' | '*' | '/', left: IntegerLiteralExpr | IdentifierExpr, right: IntegerLiteralExpr | IdentifierExpr): BinaryExpr {
  return { kind: 'BinaryExpr', operator: op, left, right, loc: dummyLoc };
}

// ── Type guard tests ───────────────────────────────────────────────────────

describe('AST — type guards', () => {
  it('isStatement identifies LetStmt', () => {
    const node: LetStmt = { kind: 'LetStmt', name: 'x', initializer: null, loc: dummyLoc };
    expect(isStatement(node)).toBe(true);
    expect(isExpression(node)).toBe(false);
  });

  it('isExpression identifies BinaryExpr', () => {
    const node: BinaryExpr = makeBinary('+', makeInteger(1), makeInteger(2));
    expect(isExpression(node)).toBe(true);
    expect(isStatement(node)).toBe(false);
  });

  it('isExpression identifies IdentifierExpr', () => {
    expect(isExpression(makeIdent('x'))).toBe(true);
  });

  it('isExpression identifies IntegerLiteralExpr', () => {
    expect(isExpression(makeInteger(42))).toBe(true);
  });
});

// ── AST printer tests ──────────────────────────────────────────────────────

describe('AST printer', () => {
  it('prints an integer literal', () => {
    expect(printAST(makeInteger(42))).toBe('42');
  });

  it('prints an identifier', () => {
    expect(printAST(makeIdent('foo'))).toBe('foo');
  });

  it('prints a binary expression', () => {
    const node = makeBinary('+', makeInteger(2), makeInteger(3));
    expect(printAST(node)).toBe('(+ 2 3)');
  });

  it('prints nested binary expressions', () => {
    // 2 + 3 * 4 — right side is the multiplication
    const mul = makeBinary('*', makeInteger(3), makeInteger(4));
    const add = { kind: 'BinaryExpr' as const, operator: '+' as const, left: makeInteger(2), right: mul, loc: dummyLoc };
    expect(printAST(add)).toBe('(+ 2 (* 3 4))');
  });

  it('prints a let statement', () => {
    const node: LetStmt = {
      kind: 'LetStmt',
      name: 'x',
      initializer: makeInteger(10),
      loc: dummyLoc,
    };
    expect(printAST(node)).toBe('(let x 10)');
  });

  it('prints a let statement with no initializer', () => {
    const node: LetStmt = { kind: 'LetStmt', name: 'x', initializer: null, loc: dummyLoc };
    expect(printAST(node)).toBe('(let x)');
  });

  it('prints a return statement', () => {
    const node: ReturnStmt = { kind: 'ReturnStmt', value: makeInteger(42), loc: dummyLoc };
    expect(printAST(node)).toBe('(return 42)');
  });

  it('prints a return statement with no value', () => {
    const node: ReturnStmt = { kind: 'ReturnStmt', value: null, loc: dummyLoc };
    expect(printAST(node)).toBe('(return)');
  });

  it('prints a function statement', () => {
    const block: BlockStmt = { kind: 'BlockStmt', body: [], loc: dummyLoc };
    const fn: FunctionStmt = {
      kind: 'FunctionStmt',
      name: 'add',
      params: [
        { kind: 'Parameter', name: 'a', loc: dummyLoc },
        { kind: 'Parameter', name: 'b', loc: dummyLoc },
      ],
      body: block,
      loc: dummyLoc,
    };
    const printed = printAST(fn);
    expect(printed).toContain('fn add(a, b)');
  });

  it('prints a program with multiple statements', () => {
    const program: Program = {
      kind: 'Program',
      body: [
        { kind: 'LetStmt', name: 'x', initializer: makeInteger(10), loc: dummyLoc },
        { kind: 'LetStmt', name: 'y', initializer: makeInteger(20), loc: dummyLoc },
      ],
      loc: dummyLoc,
    };
    const printed = printAST(program);
    expect(printed).toContain('(let x 10)');
    expect(printed).toContain('(let y 20)');
    expect(printed).toMatch(/^\(program/);
  });

  it('prints an array expression', () => {
    const node = {
      kind: 'ArrayExpr' as const,
      elements: [makeInteger(1), makeInteger(2), makeInteger(3)],
      loc: dummyLoc,
    };
    expect(printAST(node)).toBe('[1, 2, 3]');
  });

  it('prints a string literal with quotes', () => {
    const node = { kind: 'StringLiteralExpr' as const, value: 'hello', loc: dummyLoc };
    expect(printAST(node)).toBe('"hello"');
  });

  it('prints a boolean literal', () => {
    const node = { kind: 'BooleanLiteralExpr' as const, value: true, loc: dummyLoc };
    expect(printAST(node)).toBe('true');
  });

  it('prints null literal', () => {
    const node = { kind: 'NullLiteralExpr' as const, loc: dummyLoc };
    expect(printAST(node)).toBe('null');
  });

  it('prints a call expression', () => {
    const node = {
      kind: 'CallExpr' as const,
      callee: makeIdent('foo'),
      args: [makeInteger(1), makeInteger(2)],
      loc: dummyLoc,
    };
    expect(printAST(node)).toBe('(call foo 1, 2)');
  });
});
