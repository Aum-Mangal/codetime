/**
 * Abstract Syntax Tree node definitions for the CodeTime language.
 *
 * Every node carries a `loc` (SourceLocation) so error messages and the
 * debugger can pinpoint source positions.
 *
 * Node naming convention:
 *   - *Statement nodes end in `Stmt`
 *   - *Expression nodes end in `Expr`
 *   - The top-level file is a `Program`
 */

import { SourceLocation } from '../lexer/token.js';

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export interface ASTNode {
  kind: string;
  loc: SourceLocation;
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export interface Program extends ASTNode {
  kind: 'Program';
  body: Statement[];
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type Statement =
  | LetStmt
  | AssignStmt
  | CompoundAssignStmt
  | FunctionStmt
  | ReturnStmt
  | IfStmt
  | WhileStmt
  | ForInStmt
  | BreakStmt
  | ContinueStmt
  | BlockStmt
  | ExpressionStmt
  | StructStmt;

export interface LetStmt extends ASTNode {
  kind: 'LetStmt';
  name: string;
  initializer: Expression | null;
}

export interface AssignStmt extends ASTNode {
  kind: 'AssignStmt';
  target: AssignTarget;
  value: Expression;
}

export type AssignTarget =
  | IdentifierExpr
  | IndexExpr
  | MemberExpr;

export interface CompoundAssignStmt extends ASTNode {
  kind: 'CompoundAssignStmt';
  operator: '+=' | '-=' | '*=' | '/=';
  target: AssignTarget;
  value: Expression;
}

export interface FunctionStmt extends ASTNode {
  kind: 'FunctionStmt';
  name: string;
  params: Parameter[];
  body: BlockStmt;
}

export interface Parameter extends ASTNode {
  kind: 'Parameter';
  name: string;
  defaultValue?: Expression;
}

export interface ReturnStmt extends ASTNode {
  kind: 'ReturnStmt';
  value: Expression | null;
}

export interface IfStmt extends ASTNode {
  kind: 'IfStmt';
  condition: Expression;
  consequent: BlockStmt;
  alternate: BlockStmt | IfStmt | null;
}

export interface WhileStmt extends ASTNode {
  kind: 'WhileStmt';
  condition: Expression;
  body: BlockStmt;
}

export interface ForInStmt extends ASTNode {
  kind: 'ForInStmt';
  variable: string;
  iterable: Expression;
  body: BlockStmt;
}

export interface BreakStmt extends ASTNode {
  kind: 'BreakStmt';
}

export interface ContinueStmt extends ASTNode {
  kind: 'ContinueStmt';
}

export interface BlockStmt extends ASTNode {
  kind: 'BlockStmt';
  body: Statement[];
}

export interface ExpressionStmt extends ASTNode {
  kind: 'ExpressionStmt';
  expression: Expression;
}

export interface StructStmt extends ASTNode {
  kind: 'StructStmt';
  name: string;
  fields: string[];
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type Expression =
  | IntegerLiteralExpr
  | FloatLiteralExpr
  | StringLiteralExpr
  | BooleanLiteralExpr
  | NullLiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | IndexExpr
  | MemberExpr
  | ArrayExpr
  | ObjectExpr
  | FunctionExpr
  | PrintExpr;

export interface IntegerLiteralExpr extends ASTNode {
  kind: 'IntegerLiteralExpr';
  value: number;
}

export interface FloatLiteralExpr extends ASTNode {
  kind: 'FloatLiteralExpr';
  value: number;
}

export interface StringLiteralExpr extends ASTNode {
  kind: 'StringLiteralExpr';
  value: string;
}

export interface BooleanLiteralExpr extends ASTNode {
  kind: 'BooleanLiteralExpr';
  value: boolean;
}

export interface NullLiteralExpr extends ASTNode {
  kind: 'NullLiteralExpr';
}

export interface IdentifierExpr extends ASTNode {
  kind: 'IdentifierExpr';
  name: string;
}

export interface BinaryExpr extends ASTNode {
  kind: 'BinaryExpr';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%' | '**'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | 'and' | 'or';

export interface UnaryExpr extends ASTNode {
  kind: 'UnaryExpr';
  operator: '-' | 'not' | '!';
  operand: Expression;
}

export interface CallExpr extends ASTNode {
  kind: 'CallExpr';
  callee: Expression;
  args: Expression[];
}

export interface IndexExpr extends ASTNode {
  kind: 'IndexExpr';
  object: Expression;
  index: Expression;
}

export interface MemberExpr extends ASTNode {
  kind: 'MemberExpr';
  object: Expression;
  property: string;
}

export interface ArrayExpr extends ASTNode {
  kind: 'ArrayExpr';
  elements: Expression[];
}

export interface ObjectExpr extends ASTNode {
  kind: 'ObjectExpr';
  fields: { key: string; value: Expression }[];
}

export interface FunctionExpr extends ASTNode {
  kind: 'FunctionExpr';
  params: Parameter[];
  body: BlockStmt;
}

export interface PrintExpr extends ASTNode {
  kind: 'PrintExpr';
  args: Expression[];
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isStatement(node: ASTNode): node is Statement {
  return [
    'LetStmt', 'AssignStmt', 'CompoundAssignStmt', 'FunctionStmt',
    'ReturnStmt', 'IfStmt', 'WhileStmt', 'ForInStmt',
    'BreakStmt', 'ContinueStmt', 'BlockStmt', 'ExpressionStmt', 'StructStmt',
  ].includes(node.kind);
}

export function isExpression(node: ASTNode): node is Expression {
  return [
    'IntegerLiteralExpr', 'FloatLiteralExpr', 'StringLiteralExpr',
    'BooleanLiteralExpr', 'NullLiteralExpr', 'IdentifierExpr',
    'BinaryExpr', 'UnaryExpr', 'CallExpr', 'IndexExpr',
    'MemberExpr', 'ArrayExpr', 'ObjectExpr', 'FunctionExpr', 'PrintExpr',
  ].includes(node.kind);
}
