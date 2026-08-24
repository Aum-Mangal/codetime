import { Token, TokenType, SourceLocation, tokenToString } from '../lexer/index.js';
import {
  Program,
  Statement,
  Expression,
  LetStmt,
  AssignStmt,
  CompoundAssignStmt,
  FunctionStmt,
  ReturnStmt,
  IfStmt,
  WhileStmt,
  ForInStmt,
  BreakStmt,
  ContinueStmt,
  BlockStmt,
  ExpressionStmt,
  StructStmt,
  Parameter,
  AssignTarget,
  IdentifierExpr,
  IntegerLiteralExpr,
  FloatLiteralExpr,
  StringLiteralExpr,
  BooleanLiteralExpr,
  NullLiteralExpr,
  BinaryExpr,
  UnaryExpr,
  CallExpr,
  IndexExpr,
  MemberExpr,
  ArrayExpr,
  ObjectExpr,
  FunctionExpr,
  PrintExpr,
  BinaryOperator,
} from '../ast/index.js';

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly token: Token,
    public readonly source?: string,
  ) {
    super(message);
    this.name = 'ParserError';
  }

  /** Format the error with source context and caret pointing to error column */
  format(src?: string): string {
    const sourceText = src ?? this.source;
    if (!sourceText) {
      return `SyntaxError [line ${this.token.loc.line}, col ${this.token.loc.column}]: ${this.message}`;
    }

    const lines = sourceText.split('\n');
    const lineNum = this.token.loc.line;
    const colNum = this.token.loc.column;
    const srcLine = lines[lineNum - 1] ?? '';
    const caret = ' '.repeat(Math.max(0, colNum - 1)) + '^';

    return [
      `SyntaxError: ${this.message}`,
      `  --> line ${lineNum}, column ${colNum}`,
      '',
      `  ${lineNum} | ${srcLine}`,
      `    | ${caret}`,
    ].join('\n');
  }
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private source?: string;

  constructor(tokens: Token[], source?: string) {
    this.tokens = tokens;
    this.source = source;
  }

  public parse(): Program {
    const statements: Statement[] = [];
    const firstToken = this.peek();
    const startLoc: SourceLocation = firstToken ? firstToken.loc : { line: 1, column: 1, offset: 0 };

    while (!this.isAtEnd()) {
      // Skip empty lines/newlines at the top level
      if (this.match(TokenType.NEWLINE, TokenType.SEMICOLON)) {
        continue;
      }
      statements.push(this.statement());
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
    if (this.check(TokenType.FN) && this.peekNext().type === TokenType.IDENTIFIER) {
      this.advance(); // consume 'fn'
      return this.functionDeclaration();
    }
    if (this.match(TokenType.IF)) {
      return this.ifStatement();
    }
    if (this.match(TokenType.WHILE)) {
      return this.whileStatement();
    }
    if (this.match(TokenType.FOR)) {
      return this.forInStatement();
    }
    if (this.match(TokenType.RETURN)) {
      return this.returnStatement();
    }
    if (this.match(TokenType.BREAK)) {
      return this.breakStatement();
    }
    if (this.match(TokenType.CONTINUE)) {
      return this.continueStatement();
    }
    if (this.match(TokenType.STRUCT)) {
      return this.structDeclaration();
    }
    if (this.check(TokenType.LBRACE)) {
      return this.blockStatement();
    }

    return this.expressionOrAssignmentStatement();
  }

  private letStatement(): LetStmt {
    const letToken = this.previous();
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expect variable name after 'let'.");
    
    let initializer: Expression | null = null;
    if (this.match(TokenType.ASSIGN)) {
      initializer = this.expression();
    }

    this.consumeStatementEnd("Expect newline or ';' after variable declaration.");

    return {
      kind: 'LetStmt',
      name: nameToken.value,
      initializer,
      loc: letToken.loc,
    };
  }

  private functionDeclaration(): FunctionStmt {
    const fnToken = this.previous();
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expect function name.");

    this.consume(TokenType.LPAREN, "Expect '(' after function name.");
    const params = this.parameterList();
    this.consume(TokenType.RPAREN, "Expect ')' after parameters.");

    this.skipNewlines();
    const body = this.blockStatement();

    return {
      kind: 'FunctionStmt',
      name: nameToken.value,
      params,
      body,
      loc: fnToken.loc,
    };
  }

  private parameterList(): Parameter[] {
    const params: Parameter[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        this.skipNewlines();
        const paramToken = this.consume(TokenType.IDENTIFIER, "Expect parameter name.");
        let defaultValue: Expression | undefined;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.expression();
        }
        params.push({
          kind: 'Parameter',
          name: paramToken.value,
          defaultValue,
          loc: paramToken.loc,
        });
        this.skipNewlines();
      } while (this.match(TokenType.COMMA));
    }
    return params;
  }

  private ifStatement(): IfStmt {
    const ifToken = this.previous();
    const condition = this.expression();
    this.skipNewlines();
    const consequent = this.blockStatement();
    
    let alternate: BlockStmt | IfStmt | null = null;
    this.skipNewlines();
    if (this.match(TokenType.ELSE)) {
      this.skipNewlines();
      if (this.match(TokenType.IF)) {
        alternate = this.ifStatement();
      } else {
        alternate = this.blockStatement();
      }
    }

    return {
      kind: 'IfStmt',
      condition,
      consequent,
      alternate,
      loc: ifToken.loc,
    };
  }

  private whileStatement(): WhileStmt {
    const whileToken = this.previous();
    const condition = this.expression();
    this.skipNewlines();
    const body = this.blockStatement();

    return {
      kind: 'WhileStmt',
      condition,
      body,
      loc: whileToken.loc,
    };
  }

  private forInStatement(): ForInStmt {
    const forToken = this.previous();
    const varToken = this.consume(TokenType.IDENTIFIER, "Expect variable name after 'for'.");
    this.consume(TokenType.IN, "Expect 'in' after variable name in for-loop.");
    const iterable = this.expression();
    this.skipNewlines();
    const body = this.blockStatement();

    return {
      kind: 'ForInStmt',
      variable: varToken.value,
      iterable,
      body,
      loc: forToken.loc,
    };
  }

  private returnStatement(): ReturnStmt {
    const returnToken = this.previous();
    let value: Expression | null = null;

    if (!this.check(TokenType.NEWLINE) && !this.check(TokenType.SEMICOLON) && !this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      value = this.expression();
    }

    this.consumeStatementEnd("Expect newline or ';' after return statement.");

    return {
      kind: 'ReturnStmt',
      value,
      loc: returnToken.loc,
    };
  }

  private breakStatement(): BreakStmt {
    const token = this.previous();
    this.consumeStatementEnd("Expect newline or ';' after 'break'.");
    return {
      kind: 'BreakStmt',
      loc: token.loc,
    };
  }

  private continueStatement(): ContinueStmt {
    const token = this.previous();
    this.consumeStatementEnd("Expect newline or ';' after 'continue'.");
    return {
      kind: 'ContinueStmt',
      loc: token.loc,
    };
  }

  private structDeclaration(): StructStmt {
    const structToken = this.previous();
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expect struct name.");
    this.skipNewlines();
    this.consume(TokenType.LBRACE, "Expect '{' before struct body.");
    this.skipNewlines();

    const fields: string[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const fieldToken = this.consume(TokenType.IDENTIFIER, "Expect field name in struct.");
      fields.push(fieldToken.value);
      this.match(TokenType.COMMA);
      this.skipNewlines();
    }

    this.consume(TokenType.RBRACE, "Expect '}' after struct body.");
    this.consumeStatementEnd("Expect newline or ';' after struct declaration.");

    return {
      kind: 'StructStmt',
      name: nameToken.value,
      fields,
      loc: structToken.loc,
    };
  }

  private blockStatement(): BlockStmt {
    const braceToken = this.consume(TokenType.LBRACE, "Expect '{' to start block.");
    const body: Statement[] = [];
    this.skipNewlines();

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.NEWLINE, TokenType.SEMICOLON)) {
        continue;
      }
      body.push(this.statement());
      this.skipNewlines();
    }

    this.consume(TokenType.RBRACE, "Expect '}' after block.");

    return {
      kind: 'BlockStmt',
      body,
      loc: braceToken.loc,
    };
  }

  private expressionOrAssignmentStatement(): Statement {
    const expr = this.expression();

    // Check for assignment or compound assignment operators
    if (this.match(TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN)) {
      const opToken = this.previous();
      
      if (!this.isValidAssignTarget(expr)) {
        throw new ParserError(
          `Invalid assignment target: cannot assign to ${expr.kind}.`,
          opToken,
          this.source,
        );
      }

      const value = this.expression();
      this.consumeStatementEnd("Expect newline or ';' after assignment.");

      if (opToken.type === TokenType.ASSIGN) {
        return {
          kind: 'AssignStmt',
          target: expr as AssignTarget,
          value,
          loc: expr.loc,
        };
      } else {
        return {
          kind: 'CompoundAssignStmt',
          operator: opToken.value as '+=' | '-=' | '*=' | '/=',
          target: expr as AssignTarget,
          value,
          loc: expr.loc,
        };
      }
    }

    this.consumeStatementEnd("Expect newline or ';' after expression.");
    return {
      kind: 'ExpressionStmt',
      expression: expr,
      loc: expr.loc,
    };
  }

  private isValidAssignTarget(expr: Expression): boolean {
    return expr.kind === 'IdentifierExpr' || expr.kind === 'IndexExpr' || expr.kind === 'MemberExpr';
  }

  // ── Expressions ────────────────────────────────────────────────────────────

  public parseExpression(): Expression {
    return this.expression();
  }

  private expression(): Expression {
    return this.binary(0);
  }

  // Pratt Parser / Precedence climbing for binary expressions
  private binary(parentPrecedence: number): Expression {
    let left = this.unary();

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

  private unary(): Expression {
    if (this.match(TokenType.MINUS, TokenType.NOT, TokenType.BANG)) {
      const opToken = this.previous();
      const operand = this.unary();
      return {
        kind: 'UnaryExpr',
        operator: opToken.value as '-' | 'not' | '!',
        operand,
        loc: opToken.loc,
      };
    }

    return this.postfix();
  }

  private postfix(): Expression {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        // Function call: expr(arg1, arg2, ...)
        const lparen = this.previous();
        const args: Expression[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            this.skipNewlines();
            args.push(this.expression());
            this.skipNewlines();
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expect ')' after arguments.");
        expr = {
          kind: 'CallExpr',
          callee: expr,
          args,
          loc: lparen.loc,
        };
      } else if (this.match(TokenType.LBRACKET)) {
        // Index access: expr[index]
        const lbracket = this.previous();
        this.skipNewlines();
        const index = this.expression();
        this.skipNewlines();
        this.consume(TokenType.RBRACKET, "Expect ']' after index.");
        expr = {
          kind: 'IndexExpr',
          object: expr,
          index,
          loc: lbracket.loc,
        };
      } else if (this.match(TokenType.DOT)) {
        // Member access: expr.property
        const dot = this.previous();
        const propToken = this.consume(TokenType.IDENTIFIER, "Expect property name after '.'.");
        expr = {
          kind: 'MemberExpr',
          object: expr,
          property: propToken.value,
          loc: dot.loc,
        };
      } else {
        break;
      }
    }

    return expr;
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
      const printToken = this.previous();
      this.consume(TokenType.LPAREN, "Expect '(' after print.");
      const args: Expression[] = [];
      if (!this.check(TokenType.RPAREN)) {
        do {
          this.skipNewlines();
          args.push(this.expression());
          this.skipNewlines();
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RPAREN, "Expect ')' after print arguments.");
      return {
        kind: 'PrintExpr',
        args,
        loc: printToken.loc,
      };
    }

    // Array literal: [elem1, elem2]
    if (this.match(TokenType.LBRACKET)) {
      const lbracket = this.previous();
      const elements: Expression[] = [];
      this.skipNewlines();
      if (!this.check(TokenType.RBRACKET)) {
        do {
          this.skipNewlines();
          elements.push(this.expression());
          this.skipNewlines();
        } while (this.match(TokenType.COMMA));
      }
      this.skipNewlines();
      this.consume(TokenType.RBRACKET, "Expect ']' after array elements.");
      return {
        kind: 'ArrayExpr',
        elements,
        loc: lbracket.loc,
      };
    }

    // Object literal: { key: value, key2: value2 }
    if (this.match(TokenType.LBRACE)) {
      const lbrace = this.previous();
      const fields: { key: string; value: Expression }[] = [];
      this.skipNewlines();
      if (!this.check(TokenType.RBRACE)) {
        do {
          this.skipNewlines();
          let key: string;
          if (this.match(TokenType.IDENTIFIER, TokenType.STRING)) {
            key = this.previous().value;
          } else {
            throw new ParserError("Expect object field key identifier or string.", this.peek(), this.source);
          }
          this.consume(TokenType.COLON, "Expect ':' after object field key.");
          const val = this.expression();
          fields.push({ key, value: val });
          this.skipNewlines();
        } while (this.match(TokenType.COMMA));
      }
      this.skipNewlines();
      this.consume(TokenType.RBRACE, "Expect '}' after object fields.");
      return {
        kind: 'ObjectExpr',
        fields,
        loc: lbrace.loc,
      };
    }

    // Lambda / Anonymous function expression: fn(a, b) { ... }
    if (this.match(TokenType.FN)) {
      const fnToken = this.previous();
      this.consume(TokenType.LPAREN, "Expect '(' after 'fn' for anonymous function.");
      const params = this.parameterList();
      this.consume(TokenType.RPAREN, "Expect ')' after parameters.");
      this.skipNewlines();
      const body = this.blockStatement();
      return {
        kind: 'FunctionExpr',
        params,
        body,
        loc: fnToken.loc,
      };
    }

    if (this.match(TokenType.LPAREN)) {
      this.skipNewlines();
      const expr = this.expression();
      this.skipNewlines();
      this.consume(TokenType.RPAREN, "Expect ')' after expression.");
      return expr;
    }

    throw new ParserError(
      `Expect expression, found ${tokenToString(token)}.`,
      token || this.previous(),
      this.source,
    );
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

  private skipNewlines(): void {
    while (this.match(TokenType.NEWLINE)) {
      // noop
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

  private peekNext(): Token {
    return this.tokens[this.current + 1] ?? this.peek();
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParserError(message, this.peek(), this.source);
  }

  private consumeStatementEnd(message: string): void {
    if (this.match(TokenType.NEWLINE, TokenType.SEMICOLON) || this.check(TokenType.RBRACE) || this.isAtEnd()) {
      return;
    }
    throw new ParserError(message, this.peek(), this.source);
  }
}
