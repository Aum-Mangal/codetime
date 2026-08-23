/**
 * Comprehensive lexer tests for the CodeTime language.
 *
 * Tests are organized by category:
 *   1. Literals (integer, float, string, boolean, null)
 *   2. Identifiers and keywords
 *   3. Operators (single and multi-character)
 *   4. Punctuation
 *   5. Comments
 *   6. Newline significance and suppression
 *   7. Error cases (illegal characters, unterminated strings)
 *   8. Complex programs (integration-style)
 */

import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/token.js';
import type { Token } from '../src/lexer/token.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Tokenise source and return the array (excludes the trailing EOF). */
function lex(source: string): Token[] {
  const tokens = new Lexer(source).tokenize();
  return tokens.filter(t => t.type !== TokenType.EOF);
}

/** Tokenise and extract just the token types (excludes EOF). */
function lexTypes(source: string): TokenType[] {
  return lex(source).map(t => t.type);
}

/** Tokenise and extract [type, value] pairs (excludes EOF). */
function lexPairs(source: string): [TokenType, string][] {
  return lex(source).map(t => [t.type, t.value]);
}

// ── 1. Integer literals ───────────────────────────────────────────────────────

describe('Lexer — integer literals', () => {
  it('tokenises a single integer', () => {
    const [tok] = lex('42');
    expect(tok.type).toBe(TokenType.INTEGER);
    expect(tok.value).toBe('42');
  });

  it('tokenises zero', () => {
    const [tok] = lex('0');
    expect(tok.type).toBe(TokenType.INTEGER);
    expect(tok.value).toBe('0');
  });

  it('tokenises a large integer', () => {
    const [tok] = lex('1000000');
    expect(tok.type).toBe(TokenType.INTEGER);
    expect(tok.value).toBe('1000000');
  });

  it('records the correct source location', () => {
    const [tok] = lex('   99');
    expect(tok.loc.line).toBe(1);
    expect(tok.loc.column).toBe(4); // 1-indexed, after 3 spaces
  });
});

// ── 2. Float literals ─────────────────────────────────────────────────────────

describe('Lexer — float literals', () => {
  it('tokenises a simple float', () => {
    const [tok] = lex('3.14');
    expect(tok.type).toBe(TokenType.FLOAT);
    expect(tok.value).toBe('3.14');
  });

  it('does NOT treat trailing dot as float when next char is not a digit', () => {
    const types = lexTypes('x.method');
    expect(types).toEqual([
      TokenType.IDENTIFIER,
      TokenType.DOT,
      TokenType.IDENTIFIER,
    ]);
  });
});

// ── 3. String literals ────────────────────────────────────────────────────────

describe('Lexer — string literals', () => {
  it('tokenises a double-quoted string', () => {
    const [tok] = lex('"hello world"');
    expect(tok.type).toBe(TokenType.STRING);
    expect(tok.value).toBe('hello world');
  });

  it('tokenises a single-quoted string', () => {
    const [tok] = lex("'hello'");
    expect(tok.type).toBe(TokenType.STRING);
    expect(tok.value).toBe('hello');
  });

  it('handles escape sequences', () => {
    const [tok] = lex('"line1\\nline2"');
    expect(tok.value).toBe('line1\nline2');
  });

  it('handles tab escape', () => {
    const [tok] = lex('"a\\tb"');
    expect(tok.value).toBe('a\tb');
  });

  it('handles backslash escape', () => {
    const [tok] = lex('"a\\\\b"');
    expect(tok.value).toBe('a\\b');
  });

  it('handles escaped quotes', () => {
    const [tok] = lex('"say \\"hi\\""');
    expect(tok.value).toBe('say "hi"');
  });

  it('emits ILLEGAL for an unterminated string', () => {
    const types = lexTypes('"unterminated');
    expect(types).toContain(TokenType.ILLEGAL);
  });

  it('tokenises an empty string', () => {
    const [tok] = lex('""');
    expect(tok.type).toBe(TokenType.STRING);
    expect(tok.value).toBe('');
  });
});

// ── 4. Boolean and null literals ─────────────────────────────────────────────

describe('Lexer — boolean and null literals', () => {
  it('tokenises true', () => {
    const [tok] = lex('true');
    expect(tok.type).toBe(TokenType.BOOLEAN);
    expect(tok.value).toBe('true');
  });

  it('tokenises false', () => {
    const [tok] = lex('false');
    expect(tok.type).toBe(TokenType.BOOLEAN);
    expect(tok.value).toBe('false');
  });

  it('tokenises null', () => {
    const [tok] = lex('null');
    expect(tok.type).toBe(TokenType.NULL);
    expect(tok.value).toBe('null');
  });
});

// ── 5. Keywords ───────────────────────────────────────────────────────────────

describe('Lexer — keywords', () => {
  const kw: [string, TokenType][] = [
    ['let',      TokenType.LET],
    ['fn',       TokenType.FN],
    ['return',   TokenType.RETURN],
    ['if',       TokenType.IF],
    ['else',     TokenType.ELSE],
    ['while',    TokenType.WHILE],
    ['for',      TokenType.FOR],
    ['in',       TokenType.IN],
    ['break',    TokenType.BREAK],
    ['continue', TokenType.CONTINUE],
    ['print',    TokenType.PRINT],
    ['and',      TokenType.AND],
    ['or',       TokenType.OR],
    ['not',      TokenType.NOT],
    ['struct',   TokenType.STRUCT],
  ];

  for (const [word, type] of kw) {
    it(`tokenises keyword '${word}'`, () => {
      const [tok] = lex(word);
      expect(tok.type).toBe(type);
      expect(tok.value).toBe(word);
    });
  }

  it('does not confuse a keyword prefix as a keyword', () => {
    const [tok] = lex('letter');
    expect(tok.type).toBe(TokenType.IDENTIFIER);
    expect(tok.value).toBe('letter');
  });

  it('does not confuse "fns" as fn keyword', () => {
    const [tok] = lex('fns');
    expect(tok.type).toBe(TokenType.IDENTIFIER);
  });
});

// ── 6. Identifiers ────────────────────────────────────────────────────────────

describe('Lexer — identifiers', () => {
  it('tokenises a simple identifier', () => {
    const [tok] = lex('myVar');
    expect(tok.type).toBe(TokenType.IDENTIFIER);
    expect(tok.value).toBe('myVar');
  });

  it('tokenises an identifier starting with underscore', () => {
    const [tok] = lex('_private');
    expect(tok.type).toBe(TokenType.IDENTIFIER);
    expect(tok.value).toBe('_private');
  });

  it('tokenises an identifier with digits', () => {
    const [tok] = lex('x1y2z3');
    expect(tok.type).toBe(TokenType.IDENTIFIER);
    expect(tok.value).toBe('x1y2z3');
  });

  it('does not include a trailing space in the identifier value', () => {
    const [tok] = lex('foo bar');
    expect(tok.value).toBe('foo');
  });
});

// ── 7. Operators ──────────────────────────────────────────────────────────────

describe('Lexer — operators', () => {
  const ops: [string, TokenType][] = [
    ['+',  TokenType.PLUS],
    ['-',  TokenType.MINUS],
    ['*',  TokenType.STAR],
    ['/',  TokenType.SLASH],
    ['%',  TokenType.PERCENT],
    ['**', TokenType.POWER],
    ['!',  TokenType.BANG],
    ['==', TokenType.EQ],
    ['!=', TokenType.NEQ],
    ['<',  TokenType.LT],
    ['<=', TokenType.LTE],
    ['>',  TokenType.GT],
    ['>=', TokenType.GTE],
    ['=',  TokenType.ASSIGN],
    ['+=', TokenType.PLUS_ASSIGN],
    ['-=', TokenType.MINUS_ASSIGN],
    ['*=', TokenType.STAR_ASSIGN],
    ['/=', TokenType.SLASH_ASSIGN],
    ['=>', TokenType.ARROW],
  ];

  for (const [op, type] of ops) {
    it(`tokenises operator '${op}'`, () => {
      const [tok] = lex(op);
      expect(tok.type).toBe(type);
      expect(tok.value).toBe(op);
    });
  }

  it('distinguishes * from **', () => {
    expect(lexTypes('*')).toEqual([TokenType.STAR]);
    expect(lexTypes('**')).toEqual([TokenType.POWER]);
    expect(lexTypes('*=')).toEqual([TokenType.STAR_ASSIGN]);
  });

  it('distinguishes = from == and =>', () => {
    expect(lexTypes('=')).toEqual([TokenType.ASSIGN]);
    expect(lexTypes('==')).toEqual([TokenType.EQ]);
    expect(lexTypes('=>')).toEqual([TokenType.ARROW]);
  });
});

// ── 8. Punctuation ────────────────────────────────────────────────────────────

describe('Lexer — punctuation', () => {
  it('tokenises parentheses', () => {
    expect(lexTypes('()')).toEqual([TokenType.LPAREN, TokenType.RPAREN]);
  });

  it('tokenises braces', () => {
    expect(lexTypes('{}')).toEqual([TokenType.LBRACE, TokenType.RBRACE]);
  });

  it('tokenises brackets', () => {
    expect(lexTypes('[]')).toEqual([TokenType.LBRACKET, TokenType.RBRACKET]);
  });

  it('tokenises comma', () => {
    expect(lexTypes(',')).toEqual([TokenType.COMMA]);
  });

  it('tokenises semicolon', () => {
    expect(lexTypes(';')).toEqual([TokenType.SEMICOLON]);
  });

  it('tokenises colon', () => {
    expect(lexTypes(':')).toEqual([TokenType.COLON]);
  });

  it('tokenises dot', () => {
    expect(lexTypes('.')).toEqual([TokenType.DOT]);
  });

  it('tokenises dotdot', () => {
    expect(lexTypes('..')).toEqual([TokenType.DOTDOT]);
  });
});

// ── 9. Comments ───────────────────────────────────────────────────────────────

describe('Lexer — comments', () => {
  it('skips // line comments', () => {
    const types = lexTypes('// this is a comment\nlet x = 1');
    expect(types).not.toContain(TokenType.ILLEGAL);
    expect(types).toContain(TokenType.LET);
  });

  it('skips # line comments', () => {
    const types = lexTypes('# this is a comment\nlet x = 1');
    expect(types).toContain(TokenType.LET);
  });

  it('does not include comment content in any token value', () => {
    const tokens = lex('// secret\nlet x = 1');
    for (const tok of tokens) {
      expect(tok.value).not.toContain('secret');
    }
  });

  it('comment at end of file produces no extra tokens', () => {
    const types = lexTypes('let x = 1 // trailing');
    expect(types).toEqual([
      TokenType.LET, TokenType.IDENTIFIER, TokenType.ASSIGN, TokenType.INTEGER,
    ]);
  });
});

// ── 10. Newline handling ──────────────────────────────────────────────────────

describe('Lexer — newline handling', () => {
  it('emits NEWLINE between statements', () => {
    const types = lexTypes('let x = 1\nlet y = 2');
    expect(types).toContain(TokenType.NEWLINE);
  });

  it('suppresses NEWLINE after an operator', () => {
    const types = lexTypes('let x = 1 +\n2');
    expect(types).not.toContain(TokenType.NEWLINE);
  });

  it('suppresses NEWLINE after opening parenthesis', () => {
    const types = lexTypes('fn foo(\n  x\n)');
    // No newline immediately after '('
    const lparen = types.indexOf(TokenType.LPAREN);
    expect(types[lparen + 1]).not.toBe(TokenType.NEWLINE);
  });

  it('suppresses consecutive blank lines', () => {
    const types = lexTypes('let x = 1\n\n\nlet y = 2');
    // Should have exactly one NEWLINE between the two statements
    let newlineCount = 0;
    let betweenStmts = false;
    for (const t of types) {
      if (t === TokenType.INTEGER) betweenStmts = true;
      if (betweenStmts && t === TokenType.NEWLINE) newlineCount++;
    }
    expect(newlineCount).toBe(1);
  });

  it('treats CR+LF (Windows) the same as LF', () => {
    const types = lexTypes('let x = 1\r\nlet y = 2');
    expect(types).toContain(TokenType.NEWLINE);
  });
});

// ── 11. Source locations ──────────────────────────────────────────────────────

describe('Lexer — source locations', () => {
  it('tracks line numbers correctly across newlines', () => {
    const tokens = lex('let x = 1\nlet y = 2');
    const secondLet = tokens.find((t, i) => t.type === TokenType.LET && i > 0);
    expect(secondLet?.loc.line).toBe(2);
  });

  it('tracks column numbers correctly', () => {
    const [tok] = lex('    foo');
    expect(tok.loc.column).toBe(5); // 4 spaces then 'f' at column 5
  });

  it('resets column after newline', () => {
    const tokens = lex('abc\ndef');
    const def = tokens.find(t => t.value === 'def');
    expect(def?.loc.column).toBe(1);
  });
});

// ── 12. Illegal characters ────────────────────────────────────────────────────

describe('Lexer — illegal characters', () => {
  it('emits ILLEGAL for @', () => {
    const types = lexTypes('@');
    expect(types).toContain(TokenType.ILLEGAL);
  });

  it('emits ILLEGAL for $', () => {
    const types = lexTypes('$');
    expect(types).toContain(TokenType.ILLEGAL);
  });

  it('continues lexing after an illegal character', () => {
    const types = lexTypes('let @ x = 1');
    expect(types).toContain(TokenType.LET);
    expect(types).toContain(TokenType.ILLEGAL);
    expect(types).toContain(TokenType.IDENTIFIER);
  });
});

// ── 13. Complex / integration scenarios ──────────────────────────────────────

describe('Lexer — integration: complete programs', () => {
  it('tokenises a variable declaration correctly', () => {
    const pairs = lexPairs('let x = 42');
    expect(pairs).toEqual([
      [TokenType.LET,        'let'],
      [TokenType.IDENTIFIER, 'x'],
      [TokenType.ASSIGN,     '='],
      [TokenType.INTEGER,    '42'],
    ]);
  });

  it('tokenises a function definition', () => {
    const src = `fn add(a, b) {\n  return a + b\n}`;
    const types = lexTypes(src);
    expect(types).toContain(TokenType.FN);
    expect(types).toContain(TokenType.RETURN);
    expect(types).toContain(TokenType.PLUS);
  });

  it('tokenises an if/else correctly', () => {
    const src = `if x > 10 {\n  print("big")\n} else {\n  print("small")\n}`;
    const types = lexTypes(src);
    expect(types).toContain(TokenType.IF);
    expect(types).toContain(TokenType.ELSE);
    expect(types).toContain(TokenType.GT);
    expect(types).toContain(TokenType.PRINT);
    expect(types).toContain(TokenType.STRING);
  });

  it('tokenises an array literal', () => {
    const types = lexTypes('[1, 2, 3]');
    expect(types).toEqual([
      TokenType.LBRACKET,
      TokenType.INTEGER,
      TokenType.COMMA,
      TokenType.INTEGER,
      TokenType.COMMA,
      TokenType.INTEGER,
      TokenType.RBRACKET,
    ]);
  });

  it('tokenises arithmetic with precedence-relevant tokens', () => {
    const pairs = lexPairs('2 + 3 * 4');
    expect(pairs).toEqual([
      [TokenType.INTEGER, '2'],
      [TokenType.PLUS,    '+'],
      [TokenType.INTEGER, '3'],
      [TokenType.STAR,    '*'],
      [TokenType.INTEGER, '4'],
    ]);
  });

  it('tokenises a while loop', () => {
    const src = `while i < 10 {\n  i += 1\n}`;
    const types = lexTypes(src);
    expect(types).toContain(TokenType.WHILE);
    expect(types).toContain(TokenType.LT);
    expect(types).toContain(TokenType.PLUS_ASSIGN);
  });

  it('tokenises a complete fibonacci function', () => {
    const src = `
fn fib(n) {
  if n <= 1 {
    return n
  }
  return fib(n - 1) + fib(n - 2)
}
let result = fib(10)
print(result)
    `.trim();

    const tokens = new Lexer(src).tokenize();
    // Should not contain any ILLEGAL tokens
    const illegal = tokens.filter(t => t.type === TokenType.ILLEGAL);
    expect(illegal).toHaveLength(0);

    const types = tokens.map(t => t.type).filter(t => t !== TokenType.NEWLINE);
    expect(types).toContain(TokenType.FN);
    expect(types).toContain(TokenType.IF);
    expect(types).toContain(TokenType.RETURN);
    expect(types).toContain(TokenType.PRINT);
  });

  it('produces correct token count for "let x = 10"', () => {
    // let x = 10 EOF → 4 meaningful tokens + EOF = 5 total
    const all = new Lexer('let x = 10').tokenize();
    expect(all).toHaveLength(5);
    expect(all[all.length - 1]!.type).toBe(TokenType.EOF);
  });
});
