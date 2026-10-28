import { SourceLocation } from '../lexer/index.js';
import { CodeTimeError, Severity } from '../diagnostics/errors.js';
import { BUILTIN_SIGNATURES } from '../vm/natives.js';
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
  StructStmt,
  CallExpr,
  FunctionExpr,
  Parameter,
} from '../ast/index.js';

export type SymbolKind = 'variable' | 'function' | 'parameter' | 'struct' | 'builtin';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  loc: SourceLocation;
  paramCount?: number;
  minParamCount?: number;
}

export class SemanticError extends CodeTimeError {
  constructor(message: string, loc: SourceLocation, source?: string, hint?: string, severity: Severity = 'error') {
    super(message, loc, source, hint);
    this.name = 'SemanticError';
    this.severity = severity;
  }
}

export enum ScopeType {
  GLOBAL = 'GLOBAL',
  FUNCTION = 'FUNCTION',
  BLOCK = 'BLOCK',
  LOOP = 'LOOP',
}

export class Scope {
  public symbols: Map<string, SymbolInfo> = new Map();

  constructor(
    public readonly type: ScopeType,
    public readonly parent: Scope | null = null,
  ) {}

  public define(symbol: SymbolInfo): boolean {
    if (this.symbols.has(symbol.name)) {
      return false; // duplicate in same scope
    }
    this.symbols.set(symbol.name, symbol);
    return true;
  }

  public resolve(name: string): SymbolInfo | undefined {
    if (this.symbols.has(name)) {
      return this.symbols.get(name);
    }
    if (this.parent) {
      return this.parent.resolve(name);
    }
    return undefined;
  }

  public isInsideFunction(): boolean {
    if (this.type === ScopeType.FUNCTION) return true;
    if (this.parent) return this.parent.isInsideFunction();
    return false;
  }

  /** True if a `break`/`continue` here would target a loop. Loops do not reach across function boundaries. */
  public isInsideLoop(): boolean {
    if (this.type === ScopeType.LOOP) return true;
    if (this.type === ScopeType.FUNCTION) return false;
    if (this.parent) return this.parent.isInsideLoop();
    return false;
  }
}

export interface SemanticResult {
  errors: SemanticError[];
  warnings: SemanticError[];
  rootScope: Scope;
}

export class SemanticAnalyzer {
  private currentScope: Scope;
  private rootScope: Scope;
  private errors: SemanticError[] = [];
  private warnings: SemanticError[] = [];
  private source?: string;

  constructor(source?: string) {
    this.source = source;
    this.rootScope = new Scope(ScopeType.GLOBAL);
    this.currentScope = this.rootScope;
    this.initBuiltins();
  }

  private initBuiltins(): void {
    for (const { name, arity } of BUILTIN_SIGNATURES) {
      this.rootScope.define({
        name,
        kind: 'builtin',
        loc: { line: 0, column: 0, offset: 0 },
        paramCount: arity,
        minParamCount: arity,
      });
    }
  }

  public analyze(program: Program): SemanticResult {
    this.errors = [];
    this.warnings = [];
    this.rootScope = new Scope(ScopeType.GLOBAL);
    this.currentScope = this.rootScope;
    this.initBuiltins();

    // First pass: Hoist top-level functions and structs
    for (const stmt of program.body) {
      if (stmt.kind === 'FunctionStmt') {
        this.declareFunction(stmt);
      } else if (stmt.kind === 'StructStmt') {
        this.declareStruct(stmt);
      }
    }

    // Second pass: Analyze all statements
    for (const stmt of program.body) {
      this.analyzeStatement(stmt);
    }

    return {
      errors: this.errors,
      warnings: this.warnings,
      rootScope: this.rootScope,
    };
  }

  private declareFunction(stmt: FunctionStmt): void {
    const requiredParams = stmt.params.filter(p => !p.defaultValue).length;
    const ok = this.currentScope.define({
      name: stmt.name,
      kind: 'function',
      loc: stmt.loc,
      paramCount: stmt.params.length,
      minParamCount: requiredParams,
    });

    if (!ok) {
      this.error(
        `Duplicate function declaration '${stmt.name}'.`,
        stmt.loc,
        `A function or variable with the name '${stmt.name}' has already been declared in this scope.`,
      );
    }
  }

  private declareStruct(stmt: StructStmt): void {
    const ok = this.currentScope.define({
      name: stmt.name,
      kind: 'struct',
      loc: stmt.loc,
      paramCount: stmt.fields.length,
      minParamCount: stmt.fields.length,
    });

    if (!ok) {
      this.error(
        `Duplicate struct declaration '${stmt.name}'.`,
        stmt.loc,
        `A struct with the name '${stmt.name}' has already been declared in this scope.`,
      );
    }

    // Check for duplicate field names
    const seenFields = new Set<string>();
    for (const field of stmt.fields) {
      if (seenFields.has(field)) {
        this.error(
          `Duplicate field '${field}' in struct '${stmt.name}'.`,
          stmt.loc,
          `Struct fields must have unique names.`,
        );
      }
      seenFields.add(field);
    }
  }

  private analyzeStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'LetStmt':
        this.analyzeLet(stmt);
        break;
      case 'AssignStmt':
        this.analyzeAssign(stmt);
        break;
      case 'CompoundAssignStmt':
        this.analyzeCompoundAssign(stmt);
        break;
      case 'FunctionStmt':
        this.analyzeFunction(stmt);
        break;
      case 'ReturnStmt':
        this.analyzeReturn(stmt);
        break;
      case 'IfStmt':
        this.analyzeIf(stmt);
        break;
      case 'WhileStmt':
        this.analyzeWhile(stmt);
        break;
      case 'ForInStmt':
        this.analyzeForIn(stmt);
        break;
      case 'BreakStmt':
        this.analyzeBreak(stmt);
        break;
      case 'ContinueStmt':
        this.analyzeContinue(stmt);
        break;
      case 'BlockStmt':
        this.analyzeBlock(stmt, ScopeType.BLOCK);
        break;
      case 'ExpressionStmt':
        this.analyzeExpression(stmt.expression);
        break;
      case 'StructStmt':
        // Top-level structs are hoisted in pass 1; nested ones are declared here.
        if (this.currentScope !== this.rootScope) {
          this.declareStruct(stmt);
        }
        break;
    }
  }

  private analyzeLet(stmt: LetStmt): void {
    if (stmt.initializer) {
      this.analyzeExpression(stmt.initializer);
    }

    const outer = this.currentScope.parent?.resolve(stmt.name);
    if (outer && outer.kind !== 'builtin' && !this.currentScope.symbols.has(stmt.name)) {
      this.warning(
        `'${stmt.name}' shadows a ${outer.kind} declared in an outer scope (line ${outer.loc.line}).`,
        stmt.loc,
        `Inside this block, '${stmt.name}' refers to the new variable; the outer one is unchanged. Rename it if that is not intended.`,
      );
    }

    const ok = this.currentScope.define({
      name: stmt.name,
      kind: 'variable',
      loc: stmt.loc,
    });

    if (!ok) {
      this.error(
        `Cannot redeclare variable '${stmt.name}' in the same scope.`,
        stmt.loc,
        `'${stmt.name}' was already declared in this scope. Consider reusing the variable or using a different name.`,
      );
    }
  }

  private analyzeAssign(stmt: AssignStmt): void {
    this.analyzeExpression(stmt.value);

    if (stmt.target.kind === 'IdentifierExpr') {
      const symbol = this.currentScope.resolve(stmt.target.name);
      if (!symbol) {
        this.error(
          `Cannot assign to undefined variable '${stmt.target.name}'.`,
          stmt.target.loc,
          `Declare the variable first using 'let ${stmt.target.name} = ...'.`,
        );
      }
    } else if (stmt.target.kind === 'IndexExpr') {
      this.analyzeExpression(stmt.target.object);
      this.analyzeExpression(stmt.target.index);
    } else if (stmt.target.kind === 'MemberExpr') {
      this.analyzeExpression(stmt.target.object);
    }
  }

  private analyzeCompoundAssign(stmt: CompoundAssignStmt): void {
    this.analyzeExpression(stmt.value);

    if (stmt.target.kind === 'IdentifierExpr') {
      const symbol = this.currentScope.resolve(stmt.target.name);
      if (!symbol) {
        this.error(
          `Cannot operate on undefined variable '${stmt.target.name}'.`,
          stmt.target.loc,
          `Variable '${stmt.target.name}' must be declared before performing '${stmt.operator}'.`,
        );
      }
    } else if (stmt.target.kind === 'IndexExpr') {
      this.analyzeExpression(stmt.target.object);
      this.analyzeExpression(stmt.target.index);
    } else if (stmt.target.kind === 'MemberExpr') {
      this.analyzeExpression(stmt.target.object);
    }
  }

  private analyzeFunction(stmt: FunctionStmt): void {
    if (this.currentScope !== this.rootScope) {
      this.declareFunction(stmt);
    }
    // Enter function scope
    this.enterScope(ScopeType.FUNCTION);
    this.analyzeParams(stmt.params, `function '${stmt.name}'`);

    // Analyze body statements in function scope
    for (const s of stmt.body.body) {
      this.analyzeStatement(s);
    }

    this.exitScope();
  }

  private analyzeReturn(stmt: ReturnStmt): void {
    if (!this.currentScope.isInsideFunction()) {
      this.error(
        `'return' statement outside of function.`,
        stmt.loc,
        `Return statements are only valid inside function bodies.`,
      );
    }

    if (stmt.value) {
      this.analyzeExpression(stmt.value);
    }
  }

  private analyzeIf(stmt: IfStmt): void {
    this.analyzeExpression(stmt.condition);
    this.analyzeBlock(stmt.consequent, ScopeType.BLOCK);
    if (stmt.alternate) {
      if (stmt.alternate.kind === 'IfStmt') {
        this.analyzeIf(stmt.alternate);
      } else {
        this.analyzeBlock(stmt.alternate, ScopeType.BLOCK);
      }
    }
  }

  private analyzeWhile(stmt: WhileStmt): void {
    this.analyzeExpression(stmt.condition);
    this.analyzeBlock(stmt.body, ScopeType.LOOP);
  }

  private analyzeForIn(stmt: ForInStmt): void {
    this.analyzeExpression(stmt.iterable);
    this.enterScope(ScopeType.LOOP);

    this.currentScope.define({
      name: stmt.variable,
      kind: 'variable',
      loc: stmt.loc,
    });

    for (const s of stmt.body.body) {
      this.analyzeStatement(s);
    }

    this.exitScope();
  }

  private analyzeBreak(stmt: BreakStmt): void {
    if (!this.currentScope.isInsideLoop()) {
      this.error(
        `'break' statement outside of loop.`,
        stmt.loc,
        `'break' can only be used inside 'while' or 'for' loops.`,
      );
    }
  }

  private analyzeContinue(stmt: ContinueStmt): void {
    if (!this.currentScope.isInsideLoop()) {
      this.error(
        `'continue' statement outside of loop.`,
        stmt.loc,
        `'continue' can only be used inside 'while' or 'for' loops.`,
      );
    }
  }

  private analyzeBlock(stmt: BlockStmt, type: ScopeType = ScopeType.BLOCK): void {
    this.enterScope(type);
    for (const s of stmt.body) {
      this.analyzeStatement(s);
    }
    this.exitScope();
  }

  private analyzeExpression(expr: Expression): void {
    switch (expr.kind) {
      case 'IdentifierExpr': {
        const symbol = this.currentScope.resolve(expr.name);
        if (!symbol) {
          this.error(
            `Undefined variable '${expr.name}'.`,
            expr.loc,
            `Variable '${expr.name}' was not found in the current scope chain. Make sure it is defined with 'let' or 'fn' before use.`,
          );
        }
        break;
      }
      case 'BinaryExpr':
        this.analyzeExpression(expr.left);
        this.analyzeExpression(expr.right);
        break;
      case 'UnaryExpr':
        this.analyzeExpression(expr.operand);
        break;
      case 'CallExpr':
        this.analyzeCall(expr);
        break;
      case 'IndexExpr':
        this.analyzeExpression(expr.object);
        this.analyzeExpression(expr.index);
        break;
      case 'MemberExpr':
        this.analyzeExpression(expr.object);
        break;
      case 'ArrayExpr':
        for (const elem of expr.elements) {
          this.analyzeExpression(elem);
        }
        break;
      case 'ObjectExpr':
        for (const field of expr.fields) {
          this.analyzeExpression(field.value);
        }
        break;
      case 'FunctionExpr':
        this.analyzeLambda(expr);
        break;
      case 'PrintExpr':
        for (const arg of expr.args) {
          this.analyzeExpression(arg);
        }
        break;
      case 'IntegerLiteralExpr':
      case 'FloatLiteralExpr':
      case 'StringLiteralExpr':
      case 'BooleanLiteralExpr':
      case 'NullLiteralExpr':
        break;
    }
  }

  private analyzeCall(expr: CallExpr): void {
    this.analyzeExpression(expr.callee);
    for (const arg of expr.args) {
      this.analyzeExpression(arg);
    }

    // If callee is a statically known identifier, check arity
    if (expr.callee.kind === 'IdentifierExpr') {
      const symbol = this.currentScope.resolve(expr.callee.name);
      if (symbol && (symbol.kind === 'function' || symbol.kind === 'builtin' || symbol.kind === 'struct')) {
        if (symbol.name === 'print') {
          // print is variadic (takes 0 or more arguments)
          return;
        }

        const argCount = expr.args.length;
        const maxParams = symbol.paramCount ?? 0;
        const minParams = symbol.minParamCount ?? maxParams;

        if (argCount < minParams || argCount > maxParams) {
          const expectedStr = minParams === maxParams ? `${maxParams}` : `${minParams} to ${maxParams}`;
          this.error(
            `Function '${symbol.name}' expects ${expectedStr} argument(s), but received ${argCount}.`,
            expr.loc,
            `Check the definition of '${symbol.name}' and ensure the argument count matches.`,
          );
        }
      }
    }
  }

  /**
   * Declare parameters in order. A default value is evaluated at call time
   * inside the callee, so it may reference any parameter declared before it.
   */
  private analyzeParams(params: Parameter[], fnLabel: string): void {
    for (const param of params) {
      if (param.defaultValue) {
        this.analyzeExpression(param.defaultValue);
      }

      const ok = this.currentScope.define({
        name: param.name,
        kind: 'parameter',
        loc: param.loc,
      });
      if (!ok) {
        this.error(
          `Duplicate parameter name '${param.name}' in ${fnLabel}.`,
          param.loc,
          `Function parameters must be uniquely named.`,
        );
      }
    }
  }

  private analyzeLambda(expr: FunctionExpr): void {
    this.enterScope(ScopeType.FUNCTION);
    this.analyzeParams(expr.params, 'anonymous function');

    for (const s of expr.body.body) {
      this.analyzeStatement(s);
    }

    this.exitScope();
  }

  // ── Scoping helpers ────────────────────────────────────────────────────────

  private enterScope(type: ScopeType): void {
    this.currentScope = new Scope(type, this.currentScope);
  }

  private exitScope(): void {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  private error(message: string, loc: SourceLocation, hint?: string): void {
    this.errors.push(new SemanticError(message, loc, this.source, hint));
  }

  private warning(message: string, loc: SourceLocation, hint?: string): void {
    this.warnings.push(new SemanticError(message, loc, this.source, hint, 'warning'));
  }
}
