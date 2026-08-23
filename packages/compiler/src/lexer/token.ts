/**
 * Token types for the CodeTime language lexer.
 * Every lexical unit produced by the lexer is one of these types.
 */
export enum TokenType {
  // ── Literals ─────────────────────────────────────────────────
  INTEGER    = 'INTEGER',    // 42, -7
  FLOAT      = 'FLOAT',      // 3.14
  STRING     = 'STRING',     // "hello"
  BOOLEAN    = 'BOOLEAN',    // true, false
  NULL       = 'NULL',       // null

  // ── Identifiers and keywords ──────────────────────────────────
  IDENTIFIER = 'IDENTIFIER',

  // Keywords
  LET        = 'LET',        // let
  FN         = 'FN',         // fn
  RETURN     = 'RETURN',     // return
  IF         = 'IF',         // if
  ELSE       = 'ELSE',       // else
  WHILE      = 'WHILE',      // while
  FOR        = 'FOR',        // for
  IN         = 'IN',         // in
  BREAK      = 'BREAK',      // break
  CONTINUE   = 'CONTINUE',  // continue
  TRUE       = 'TRUE',       // true
  FALSE      = 'FALSE',      // false
  NULL_KW    = 'NULL_KW',    // null
  PRINT      = 'PRINT',      // print (built-in)
  AND        = 'AND',        // and
  OR         = 'OR',         // or
  NOT        = 'NOT',        // not
  STRUCT     = 'STRUCT',     // struct

  // ── Operators ─────────────────────────────────────────────────
  PLUS       = 'PLUS',       // +
  MINUS      = 'MINUS',      // -
  STAR       = 'STAR',       // *
  SLASH      = 'SLASH',      // /
  PERCENT    = 'PERCENT',    // %
  POWER      = 'POWER',      // **
  BANG       = 'BANG',       // !
  EQ         = 'EQ',         // ==
  NEQ        = 'NEQ',        // !=
  LT         = 'LT',         // <
  LTE        = 'LTE',        // <=
  GT         = 'GT',         // >
  GTE        = 'GTE',        // >=
  ASSIGN     = 'ASSIGN',     // =
  PLUS_ASSIGN  = 'PLUS_ASSIGN',  // +=
  MINUS_ASSIGN = 'MINUS_ASSIGN', // -=
  STAR_ASSIGN  = 'STAR_ASSIGN',  // *=
  SLASH_ASSIGN = 'SLASH_ASSIGN', // /=
  ARROW      = 'ARROW',      // =>

  // ── Punctuation ───────────────────────────────────────────────
  LPAREN     = 'LPAREN',     // (
  RPAREN     = 'RPAREN',     // )
  LBRACE     = 'LBRACE',     // {
  RBRACE     = 'RBRACE',     // }
  LBRACKET   = 'LBRACKET',   // [
  RBRACKET   = 'RBRACKET',   // ]
  COMMA      = 'COMMA',      // ,
  SEMICOLON  = 'SEMICOLON',  // ;
  COLON      = 'COLON',      // :
  DOT        = 'DOT',        // .
  DOTDOT     = 'DOTDOT',     // ..

  // ── Special ───────────────────────────────────────────────────
  NEWLINE    = 'NEWLINE',    // significant newlines (statement separator)
  EOF        = 'EOF',        // end of input
  ILLEGAL    = 'ILLEGAL',    // unrecognized character
}

/**
 * Source location. 1-indexed line and column numbers so they can be
 * shown directly to users without any off-by-one confusion.
 */
export interface SourceLocation {
  line: number;
  column: number;
  offset: number; // byte offset from start of source
}

/**
 * A single token produced by the lexer.
 */
export interface Token {
  type: TokenType;
  value: string;   // raw source text of this token
  loc: SourceLocation;
}

// ---------------------------------------------------------------------------
// Keyword table — maps keyword strings to their TokenType
// ---------------------------------------------------------------------------
export const KEYWORDS: Readonly<Record<string, TokenType>> = {
  let:      TokenType.LET,
  fn:       TokenType.FN,
  return:   TokenType.RETURN,
  if:       TokenType.IF,
  else:     TokenType.ELSE,
  while:    TokenType.WHILE,
  for:      TokenType.FOR,
  in:       TokenType.IN,
  break:    TokenType.BREAK,
  continue: TokenType.CONTINUE,
  true:     TokenType.TRUE,
  false:    TokenType.FALSE,
  null:     TokenType.NULL_KW,
  print:    TokenType.PRINT,
  and:      TokenType.AND,
  or:       TokenType.OR,
  not:      TokenType.NOT,
  struct:   TokenType.STRUCT,
};

/** Returns true if a given string is a CodeTime keyword. */
export function isKeyword(s: string): s is keyof typeof KEYWORDS {
  return Object.prototype.hasOwnProperty.call(KEYWORDS, s);
}

/** Human-readable representation of a token for error messages. */
export function tokenToString(token: Token): string {
  switch (token.type) {
    case TokenType.EOF:     return 'end of file';
    case TokenType.NEWLINE: return 'newline';
    default:                return `'${token.value}'`;
  }
}
