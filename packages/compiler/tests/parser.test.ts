import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { printAST } from '../src/ast/printer.js';

function parse(source: string): string {
  const tokens = new Lexer(source).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return printAST(ast).trim();
}

describe('Parser - basic parsing', () => {
  it('parses an empty program', () => {
    expect(parse('')).toBe('(program\n\n)');
  });

  it('parses a let statement with initializer', () => {
    expect(parse('let x = 42')).toBe('(program\n  (let x 42)\n)');
  });

  it('parses a let statement without initializer', () => {
    expect(parse('let x')).toBe('(program\n  (let x)\n)');
  });

  it('parses expression statements', () => {
    expect(parse('42')).toBe('(program\n  42\n)');
  });

  it('parses simple binary operators', () => {
    expect(parse('1 + 2')).toBe('(program\n  (+ 1 2)\n)');
  });

  it('parses complex binary expression with proper precedence', () => {
    expect(parse('2 + 3 * 4')).toBe('(program\n  (+ 2 (* 3 4))\n)');
    expect(parse('2 * 3 + 4')).toBe('(program\n  (+ (* 2 3) 4)\n)');
    expect(parse('(2 + 3) * 4')).toBe('(program\n  (* (+ 2 3) 4)\n)');
  });

  it('parses comparison and logical operators', () => {
    expect(parse('a < b and c >= d')).toBe('(program\n  (and (< a b) (>= c d))\n)');
    expect(parse('a == b or c != d')).toBe('(program\n  (or (== a b) (!= c d))\n)');
  });

  it('parses print expressions', () => {
    expect(parse('print("hello", 42)')).toBe('(program\n  (print "hello", 42)\n)');
  });

  it('handles operator associativity (power is right-associative)', () => {
    expect(parse('2 ** 3 ** 4')).toBe('(program\n  (** 2 (** 3 4))\n)');
  });

  it('throws a ParserError on invalid syntax', () => {
    expect(() => parse('let = 42')).toThrow();
  });
});
