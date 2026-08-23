import { Token, TokenType, SourceLocation } from '../lexer/index.js';
import {
  Program,
  Statement,
  Expression,
  LetStmt,
  ExpressionStmt,
  IdentifierExpr,
  IntegerLiteralExpr,
  FloatLiteralExpr,
  StringLiteralExpr,
  BooleanLiteralExpr,
  NullLiteralExpr,
  BinaryExpr,
  PrintExpr,
  BinaryOperator,
} from '../ast/index.js';

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly token: Token,
  ) {
    super(`${message} at line ${token.loc.line}, column ${token.loc.column}`);
    this.name = 'ParserError';
  }
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    // Filter out consecutive significant newlines if necessary,
    // but the lexer already handles most newline suppression.
    this.tokens = tokens;
  }

  public parse(): Program {
    const statements: Statement[] = [];
    const firstToken = this.peek();
    const startLoc: SourceLocation = firstToken ? firstToken.loc : { line: 1, column: 1, offset: 0 };

    while (!this.isAtEnd()) {
      // Skip empty lines/newlines at the top level
      if (this.match(TokenType.NEWLINE)) {
        continue;
      }
      try {
        statements.push(this.statement());
      } catch (err) {
        if (err instanceof ParserError) {
          // Synchronize to recover from the error
          this.synchronize();
          throw err; // For now, throw the first error. We can collect them later.
        } else {
          throw err;
        }
      }
    }

    return {
      kind: 'Program',
      body: statements,
      loc: startLoc,
    };
  }

  // ── Statements ─────────────────────────────────────────────────────────────

  private statement(): Statement {
    if (this.match(TokenType.LET)) {
      return this.letStatement();
    }
    // Simple block statements, print statements, or expression statements
    return this.expressionStatement();
  }

  private letStatement(): LetStmt {
    const letToken = this.previous();
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expect variable name after 'let'.");
    
    let initializer: Expression | null = null;
    if (this.match(TokenType.ASSIGN)) {
      initializer = this.expression();
    }

    // Expect newline, semicolon, or EOF
    this.consumeStatementEnd("Expect newline or ';' after variable declaration.");

    return {
      kind: 'LetStmt',
      name: nameToken.value,
      initializer,
      loc: letToken.loc,
    };
  }

  private expressionStatement(): ExpressionStmt {
    const expr = this.expression();
    this.consumeStatementEnd("Expect newline or ';' after expression.");
    return {
      kind: 'ExpressionStmt',
      expression: expr,
      loc: expr.loc,
    };
  }

  // ── Expressions ────────────────────────────────────────────────────────────

  private expression(): Expression {
    return this.binary(0);
  }

  // Pratt Parser / Precedence climbing for binary expressions
  private binary(parentPrecedence: number): Expression {
    let left = this.primary();

    while (true) {
      const token = this.peek();
      if (!token) break;

      const precedence = this.getPrecedence(token.type);
      if (precedence === 0 || precedence <= parentPrecedence) {
        break;
      }

      this.advance(); // consume the operator
      const operator = token.value as BinaryOperator;
      const isRightAssoc = token.type === TokenType.POWER;
      const right = this.binary(isRightAssoc ? precedence - 1 : precedence);

      left = {
        kind: 'BinaryExpr',
        operator,
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private primary(): Expression {
    const token = this.peek();

    if (this.match(TokenType.INTEGER)) {
      return {
        kind: 'IntegerLiteralExpr',
        value: parseInt(this.previous().value, 10),
        loc: token.loc,
      };
    }

    if (this.match(TokenType.FLOAT)) {
      return {
        kind: 'FloatLiteralExpr',
        value: parseFloat(this.previous().value),
        loc: token.loc,
      };
    }

    if (this.match(TokenType.STRING)) {
      return {
        kind: 'StringLiteralExpr',
        value: this.previous().value,
        loc: token.loc,
      };
    }

    if (this.match(TokenType.BOOLEAN)) {
      return {
        kind: 'BooleanLiteralExpr',
        value: this.previous().value === 'true',
        loc: token.loc,
      };
    }

    if (this.match(TokenType.NULL)) {
      return {
        kind: 'NullLiteralExpr',
        loc: token.loc,
      };
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return {
        kind: 'IdentifierExpr',
        name: this.previous().value,
        loc: token.loc,
      };
    }

    if (this.match(TokenType.PRINT)) {
      // print(...)
      const printToken = this.previous();
      this.consume(TokenType.LPAREN, "Expect '(' after print.");
      const args: Expression[] = [];
      if (!this.check(TokenType.RPAREN)) {
        do {
          args.push(this.expression());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RPAREN, "Expect ')' after print arguments.");
      return {
        kind: 'PrintExpr',
        args,
        loc: printToken.loc,
      };
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expect ')' after expression.");
      return expr;
    }

    throw new ParserError(`Expect expression, found ${token ? token.value : 'EOF'}.`, token || this.previous());
  }

  // ── Helper methods ─────────────────────────────────────────────────────────

  private getPrecedence(type: TokenType): number {
    switch (type) {
      case TokenType.OR:
        return 1;
      case TokenType.AND:
        return 2;
      case TokenType.EQ:
      case TokenType.NEQ:
        return 3;
      case TokenType.LT:
      case TokenType.LTE:
      case TokenType.GT:
      case TokenType.GTE:
        return 4;
      case TokenType.PLUS:
      case TokenType.MINUS:
        return 5;
      case TokenType.STAR:
      case TokenType.SLASH:
      case TokenType.PERCENT:
        return 6;
      case TokenType.POWER:
        return 7;
      default:
        return 0;
    }
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParserError(message, this.peek());
  }

  private consumeStatementEnd(message: string): void {
    if (this.match(TokenType.NEWLINE) || this.match(TokenType.SEMICOLON) || this.isAtEnd()) {
      return;
    }
    throw new ParserError(message, this.peek());
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.NEWLINE || this.previous().type === TokenType.SEMICOLON) return;

      switch (this.peek().type) {
        case TokenType.LET:
        case TokenType.FN:
        case TokenType.IF:
        case TokenType.WHILE:
        case TokenType.FOR:
        case TokenType.RETURN:
        case TokenType.PRINT:
          return;
      }

      this.advance();
    }
  }
}
