import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser, ParserError } from '../src/parser/parser.js';
import { printAST } from '../src/ast/printer.js';
import type { Program } from '../src/ast/nodes.js';

function parse(source: string): string {
  const tokens = new Lexer(source).tokenize();
  const parser = new Parser(tokens, source);
  const ast = parser.parse();
  return printAST(ast).trim();
}

function parseAST(source: string): Program {
  const tokens = new Lexer(source).tokenize();
  const parser = new Parser(tokens, source);
  return parser.parse();
}

describe('Parser — Statements', () => {
  it('parses an empty program', () => {
    expect(parse('')).toBe('(program\n\n)');
  });

  it('parses let statements with and without initializers', () => {
    expect(parse('let x = 42')).toBe('(program\n  (let x 42)\n)');
    expect(parse('let y')).toBe('(program\n  (let y)\n)');
  });

  it('parses assignment statements', () => {
    expect(parse('x = 100')).toBe('(program\n  (assign x 100)\n)');
    expect(parse('arr[0] = 5')).toBe('(program\n  (assign (index arr 0) 5)\n)');
    expect(parse('obj.prop = "value"')).toBe('(program\n  (assign (member obj .prop) "value")\n)');
  });

  it('parses compound assignments', () => {
    expect(parse('x += 5')).toBe('(program\n  (+= x 5)\n)');
    expect(parse('arr[1] -= 2')).toBe('(program\n  (-= (index arr 1) 2)\n)');
    expect(parse('val *= 10')).toBe('(program\n  (*= val 10)\n)');
    expect(parse('total /= 4')).toBe('(program\n  (/= total 4)\n)');
  });

  it('parses function declarations', () => {
    const src = `
fn add(a, b) {
  return a + b
}
`;
    expect(parse(src)).toBe('(program\n  (fn add(a, b)\n    (return (+ a b))\n  )\n)');
  });

  it('parses function declarations with default parameter values', () => {
    const src = `
fn greet(name, greeting = "Hello") {
  return greeting + " " + name
}
`;
    expect(parse(src)).toContain('fn greet(name, greeting="Hello")');
  });

  it('parses if and if-else statements', () => {
    const src = `
if x > 10 {
  print("high")
} else {
  print("low")
}
`;
    expect(parse(src)).toBe('(program\n  (if (> x 10)\n    (print "high")\n  (else\n    (print "low")\n  )\n  )\n)');
  });

  it('parses if-else if-else chains', () => {
    const src = `
if a == 1 {
  print("one")
} else if a == 2 {
  print("two")
} else {
  print("other")
}
`;
    const ast = parseAST(src);
    expect(ast.body[0]?.kind).toBe('IfStmt');
  });

  it('parses while loops', () => {
    const src = `
while count < 10 {
  count += 1
}
`;
    expect(parse(src)).toBe('(program\n  (while (< count 10)\n    (+= count 1)\n  )\n)');
  });

  it('parses for-in loops', () => {
    const src = `
for item in items {
  print(item)
}
`;
    expect(parse(src)).toBe('(program\n  (for item in items\n    (print item)\n  )\n)');
  });

  it('parses break and continue statements', () => {
    const src = `
while true {
  if done {
    break
  }
  continue
}
`;
    const ast = parse(src);
    expect(ast).toContain('(break)');
    expect(ast).toContain('(continue)');
  });

  it('parses return statements with and without values', () => {
    expect(parse('return 42')).toBe('(program\n  (return 42)\n)');
    expect(parse('return')).toBe('(program\n  (return)\n)');
  });

  it('parses struct declarations', () => {
    const src = `
struct Point {
  x,
  y
}
`;
    expect(parse(src)).toBe('(program\n  (struct Point { x, y })\n)');
  });
});

describe('Parser — Expressions & Precedence', () => {
  it('parses literals', () => {
    expect(parse('42')).toBe('(program\n  42\n)');
    expect(parse('3.14')).toBe('(program\n  3.14\n)');
    expect(parse('"hello"')).toBe('(program\n  "hello"\n)');
    expect(parse('true')).toBe('(program\n  true\n)');
    expect(parse('false')).toBe('(program\n  false\n)');
    expect(parse('null')).toBe('(program\n  null\n)');
  });

  it('parses unary operators (-, not, !)', () => {
    expect(parse('-5')).toBe('(program\n  (- 5)\n)');
    expect(parse('not true')).toBe('(program\n  (not true)\n)');
    expect(parse('!false')).toBe('(program\n  (! false)\n)');
  });

  it('parses binary operator precedence correctly', () => {
    expect(parse('2 + 3 * 4')).toBe('(program\n  (+ 2 (* 3 4))\n)');
    expect(parse('2 * 3 + 4')).toBe('(program\n  (+ (* 2 3) 4)\n)');
    expect(parse('(2 + 3) * 4')).toBe('(program\n  (* (+ 2 3) 4)\n)');
  });

  it('handles logical operator precedence (and higher than or)', () => {
    expect(parse('a or b and c')).toBe('(program\n  (or a (and b c))\n)');
    expect(parse('a and b or c')).toBe('(program\n  (or (and a b) c)\n)');
  });

  it('handles comparison operator precedence', () => {
    expect(parse('a + 1 > b * 2')).toBe('(program\n  (> (+ a 1) (* b 2))\n)');
    expect(parse('x == 1 or y != 2')).toBe('(program\n  (or (== x 1) (!= y 2))\n)');
  });

  it('handles right-associativity of power (**)', () => {
    expect(parse('2 ** 3 ** 4')).toBe('(program\n  (** 2 (** 3 4))\n)');
  });

  it('parses array literals', () => {
    expect(parse('[1, 2, 3]')).toBe('(program\n  [1, 2, 3]\n)');
    expect(parse('[]')).toBe('(program\n  []\n)');
  });

  it('parses object literals', () => {
    expect(parse('let obj = { a: 1, b: 2 }')).toBe('(program\n  (let obj { a: 1, b: 2 })\n)');
    expect(parse('let empty = {}')).toBe('(program\n  (let empty {  })\n)');
  });

  it('parses lambda (anonymous function) expressions', () => {
    const src = 'let f = fn(x) { return x * 2 }';
    expect(parse(src)).toContain('(fn(x)');
  });

  it('parses chained postfix operations (calls, index, member access)', () => {
    expect(parse('foo(1)[2].bar()')).toBe(
      '(program\n  (call (member (index (call foo 1) 2) .bar) )\n)'
    );
  });
});

describe('Parser — Error Handling & Formatting', () => {
  it('throws ParserError on missing identifier after let', () => {
    expect(() => parse('let = 10')).toThrow(ParserError);
  });

  it('throws ParserError on invalid assignment target', () => {
    expect(() => parse('10 = 20')).toThrow(ParserError);
    expect(() => parse('foo() = 20')).toThrow(ParserError);
  });

  it('throws ParserError on unclosed parenthesis', () => {
    expect(() => parse('(1 + 2')).toThrow(ParserError);
  });

  it('throws ParserError on unclosed brace in block', () => {
    expect(() => parse('if true { x = 1')).toThrow(ParserError);
  });

  it('formats syntax error with source line and column caret', () => {
    try {
      parse('let 123 = 456');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      const formatted = (e as ParserError).format('let 123 = 456');
      expect(formatted).toContain('SyntaxError:');
      expect(formatted).toContain('line 1, column 5');
      expect(formatted).toContain('^');
    }
  });
});
