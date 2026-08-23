import { Token, TokenType, SourceLocation, KEYWORDS, isKeyword } from './token.js';

// ---------------------------------------------------------------------------
// LexerError
// ---------------------------------------------------------------------------
export class LexerError extends Error {
  constructor(
    message: string,
    public readonly loc: SourceLocation,
    public readonly source?: string,
  ) {
    super(message);
    this.name = 'LexerError';
  }

  /** Format the error with source context for display. */
  format(src: string): string {
    const lines  = src.split('\n');
    const srcLine = lines[this.loc.line - 1] ?? '';
    const caret  = ' '.repeat(this.loc.column - 1) + '^';
    return [
      `LexerError at line ${this.loc.line}, column ${this.loc.column}:`,
      `  ${this.message}`,
      '',
      `  ${srcLine}`,
      `  ${caret}`,
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

/**
 * Converts CodeTime source code into a flat array of tokens.
 *
 * Design decisions:
 *   - Newlines are emitted as NEWLINE tokens so the parser can use them as
 *     implicit statement terminators (similar to Go / Python).  However, a
 *     newline that immediately follows certain tokens (operators, commas,
 *     opening brackets) is suppressed so multi-line expressions work naturally.
 *   - Comments (starting with `//` or `#`) are skipped; they do not produce
 *     tokens.
 *   - The lexer never throws — it emits ILLEGAL tokens for unrecognised
 *     characters so parsing can continue and collect more errors.
 *
 * Usage:
 *   const lexer  = new Lexer(source);
 *   const tokens = lexer.tokenize();
 */
export class Lexer {
  private readonly src: string;
  private pos: number   = 0;   // current character index
  private line: number  = 1;
  private col: number   = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.src = source;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Tokenise the entire source and return the token array. */
  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.scanToken();
    }
    this.addToken(TokenType.EOF, '');
    return this.tokens;
  }

  // ── Character navigation ─────────────────────────────────────────────────

  private isAtEnd(): boolean {
    return this.pos >= this.src.length;
  }

  private current(): string {
    return this.src[this.pos] ?? '\0';
  }

  private peek(offset = 1): string {
    return this.src[this.pos + offset] ?? '\0';
  }

  private advance(): string {
    const ch = this.src[this.pos++]!;
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  /** Returns the current source location (before consuming anything). */
  private loc(): SourceLocation {
    return { line: this.line, column: this.col, offset: this.pos };
  }

  /** Consume next char only if it matches `expected`. */
  private match(expected: string): boolean {
    if (this.isAtEnd() || this.current() !== expected) return false;
    this.advance();
    return true;
  }

  // ── Token emitters ───────────────────────────────────────────────────────

  private addToken(type: TokenType, value: string, at?: SourceLocation): void {
    this.tokens.push({ type, value, loc: at ?? this.loc() });
  }

  // ── Newline suppression logic ────────────────────────────────────────────

  /**
   * Determines whether a NEWLINE token should be suppressed after `prevType`.
   * Newlines are suppressed when they appear after operators / commas / opening
   * brackets, meaning the expression is clearly not complete.
   */
  private shouldSuppressNewline(): boolean {
    const prev = this.tokens[this.tokens.length - 1];
    if (!prev) return true; // suppress leading newlines
    switch (prev.type) {
      case TokenType.PLUS:
      case TokenType.MINUS:
      case TokenType.STAR:
      case TokenType.SLASH:
      case TokenType.PERCENT:
      case TokenType.POWER:
      case TokenType.COMMA:
      case TokenType.LPAREN:
      case TokenType.LBRACKET:
      case TokenType.LBRACE:
      case TokenType.EQ:
      case TokenType.NEQ:
      case TokenType.LT:
      case TokenType.LTE:
      case TokenType.GT:
      case TokenType.GTE:
      case TokenType.ASSIGN:
      case TokenType.PLUS_ASSIGN:
      case TokenType.MINUS_ASSIGN:
      case TokenType.STAR_ASSIGN:
      case TokenType.SLASH_ASSIGN:
      case TokenType.AND:
      case TokenType.OR:
      case TokenType.NOT:
      case TokenType.BANG:
      case TokenType.ARROW:
      case TokenType.COLON:
      case TokenType.DOT:
      case TokenType.DOTDOT:
      case TokenType.NEWLINE:  // collapse consecutive blank lines
        return true;
      default:
        return false;
    }
  }

  // ── Main scan dispatch ────────────────────────────────────────────────────

  private scanToken(): void {
    const start = this.loc();
    const ch    = this.advance();

    switch (ch) {
      // ── Trivial single-character tokens ──────────────────────────────────
      case '(': this.addToken(TokenType.LPAREN,    ch, start); break;
      case ')': this.addToken(TokenType.RPAREN,    ch, start); break;
      case '{': this.addToken(TokenType.LBRACE,    ch, start); break;
      case '}': this.addToken(TokenType.RBRACE,    ch, start); break;
      case '[': this.addToken(TokenType.LBRACKET,  ch, start); break;
      case ']': this.addToken(TokenType.RBRACKET,  ch, start); break;
      case ',': this.addToken(TokenType.COMMA,     ch, start); break;
      case ';': this.addToken(TokenType.SEMICOLON, ch, start); break;
      case ':': this.addToken(TokenType.COLON,     ch, start); break;

      // ── Potentially multi-character tokens ───────────────────────────────
      case '.':
        if (this.match('.')) {
          this.addToken(TokenType.DOTDOT, '..', start);
        } else {
          this.addToken(TokenType.DOT, ch, start);
        }
        break;
      case '+':
        if (this.match('=')) this.addToken(TokenType.PLUS_ASSIGN, '+=', start);
        else                  this.addToken(TokenType.PLUS,        '+',  start);
        break;
      case '-':
        if (this.match('=')) this.addToken(TokenType.MINUS_ASSIGN, '-=', start);
        else                  this.addToken(TokenType.MINUS,        '-',  start);
        break;
      case '*':
        if (this.match('*'))      this.addToken(TokenType.POWER,       '**', start);
        else if (this.match('=')) this.addToken(TokenType.STAR_ASSIGN,  '*=', start);
        else                      this.addToken(TokenType.STAR,         '*',  start);
        break;
      case '/':
        if (this.match('/')) {
          this.skipLineComment();
        } else if (this.match('=')) {
          this.addToken(TokenType.SLASH_ASSIGN, '/=', start);
        } else {
          this.addToken(TokenType.SLASH, '/', start);
        }
        break;
      case '#':
        this.skipLineComment();
        break;
      case '%': this.addToken(TokenType.PERCENT, ch, start); break;
      case '!':
        if (this.match('=')) this.addToken(TokenType.NEQ,  '!=', start);
        else                  this.addToken(TokenType.BANG, '!',  start);
        break;
      case '=':
        if (this.match('='))      this.addToken(TokenType.EQ,     '==', start);
        else if (this.match('>')) this.addToken(TokenType.ARROW,  '=>', start);
        else                      this.addToken(TokenType.ASSIGN,  '=',  start);
        break;
      case '<':
        if (this.match('=')) this.addToken(TokenType.LTE, '<=', start);
        else                  this.addToken(TokenType.LT,  '<',  start);
        break;
      case '>':
        if (this.match('=')) this.addToken(TokenType.GTE, '>=', start);
        else                  this.addToken(TokenType.GT,  '>',  start);
        break;

      // ── Whitespace ────────────────────────────────────────────────────────
      case '\r': break; // ignore carriage returns
      case '\t':
      case ' ':  break; // ignore spaces/tabs

      case '\n':
        if (!this.shouldSuppressNewline()) {
          this.addToken(TokenType.NEWLINE, '\n', start);
        }
        break;

      // ── String literals ───────────────────────────────────────────────────
      case '"':
      case "'":
        this.scanString(ch, start);
        break;

      default:
        if (isDigit(ch)) {
          this.scanNumber(ch, start);
        } else if (isAlpha(ch)) {
          this.scanIdentifierOrKeyword(ch, start);
        } else {
          this.addToken(TokenType.ILLEGAL, ch, start);
        }
    }
  }

  // ── Scanners ──────────────────────────────────────────────────────────────

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.current() !== '\n') {
      this.advance();
    }
  }

  private scanString(quote: string, start: SourceLocation): void {
    let value = '';
    while (!this.isAtEnd() && this.current() !== quote) {
      const ch = this.current();
      if (ch === '\n') {
        // Unterminated string literal
        this.addToken(TokenType.ILLEGAL, value, start);
        return;
      }
      if (ch === '\\') {
        this.advance(); // consume backslash
        const esc = this.advance();
        switch (esc) {
          case 'n':  value += '\n'; break;
          case 't':  value += '\t'; break;
          case 'r':  value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"':  value += '"';  break;
          case "'":  value += "'";  break;
          case '0':  value += '\0'; break;
          default:   value += esc;  break; // allow unknown escapes verbatim
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      this.addToken(TokenType.ILLEGAL, value, start);
      return;
    }

    this.advance(); // consume closing quote
    this.addToken(TokenType.STRING, value, start);
  }

  private scanNumber(first: string, start: SourceLocation): void {
    let raw = first;
    while (!this.isAtEnd() && isDigit(this.current())) {
      raw += this.advance();
    }

    if (this.current() === '.' && isDigit(this.peek())) {
      raw += this.advance(); // consume '.'
      while (!this.isAtEnd() && isDigit(this.current())) {
        raw += this.advance();
      }
      this.addToken(TokenType.FLOAT, raw, start);
    } else {
      this.addToken(TokenType.INTEGER, raw, start);
    }
  }

  private scanIdentifierOrKeyword(first: string, start: SourceLocation): void {
    let raw = first;
    while (!this.isAtEnd() && isAlphaNumeric(this.current())) {
      raw += this.advance();
    }

    if (isKeyword(raw)) {
      const kwType = KEYWORDS[raw]!;
      // Emit TRUE / FALSE as BOOLEAN tokens carrying the actual boolean string
      if (kwType === TokenType.TRUE || kwType === TokenType.FALSE) {
        this.addToken(TokenType.BOOLEAN, raw, start);
      } else if (kwType === TokenType.NULL_KW) {
        this.addToken(TokenType.NULL, raw, start);
      } else {
        this.addToken(kwType, raw, start);
      }
    } else {
      this.addToken(TokenType.IDENTIFIER, raw, start);
    }
  }
}

// ---------------------------------------------------------------------------
// Character classification helpers
// ---------------------------------------------------------------------------

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') ||
         (ch >= 'A' && ch <= 'Z') ||
         ch === '_';
}

function isAlphaNumeric(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}
