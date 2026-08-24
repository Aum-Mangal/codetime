/**
 * AST printer — converts an AST back to a pretty-printed, indented S-expression
 * format. Useful for debugging and the `codetime ast` CLI command.
 */

import type {
  ASTNode, Program, Statement, Expression,
  BinaryExpr, UnaryExpr, CallExpr, IndexExpr, MemberExpr,
  ArrayExpr, ObjectExpr, FunctionExpr, PrintExpr,
  LetStmt, AssignStmt, CompoundAssignStmt, FunctionStmt,
  ReturnStmt, IfStmt, WhileStmt, ForInStmt, BlockStmt,
  ExpressionStmt, StructStmt, Parameter,
  IntegerLiteralExpr, FloatLiteralExpr, StringLiteralExpr, BooleanLiteralExpr, IdentifierExpr,
} from './nodes.js';

const INDENT = '  ';

export function printAST(node: ASTNode, depth = 0): string {
  const pad = INDENT.repeat(depth);

  switch (node.kind) {
    case 'Program': {
      const p = node as Program;
      const body = p.body.map(s => printAST(s, depth + 1)).join('\n');
      return `${pad}(program\n${body}\n${pad})`;
    }
    case 'LetStmt': {
      const n = node as LetStmt;
      const init = n.initializer ? ` ${printAST(n.initializer, 0)}` : '';
      return `${pad}(let ${n.name}${init})`;
    }
    case 'AssignStmt': {
      const n = node as AssignStmt;
      return `${pad}(assign ${printAST(n.target, 0)} ${printAST(n.value, 0)})`;
    }
    case 'CompoundAssignStmt': {
      const n = node as CompoundAssignStmt;
      return `${pad}(${n.operator} ${printAST(n.target, 0)} ${printAST(n.value, 0)})`;
    }
    case 'FunctionStmt': {
      const n = node as FunctionStmt;
      const params = n.params.map(p => printParam(p)).join(', ');
      const body   = printAST(n.body, depth + 1);
      return `${pad}(fn ${n.name}(${params})\n${body}\n${pad})`;
    }
    case 'ReturnStmt': {
      const n = node as ReturnStmt;
      const val = n.value ? ` ${printAST(n.value, 0)}` : '';
      return `${pad}(return${val})`;
    }
    case 'IfStmt': {
      const n = node as IfStmt;
      const cond = printAST(n.condition, 0);
      const cons = printAST(n.consequent, depth + 1);
      const alt  = n.alternate ? `\n${pad}(else\n${printAST(n.alternate, depth + 1)}\n${pad})` : '';
      return `${pad}(if ${cond}\n${cons}${alt}\n${pad})`;
    }
    case 'WhileStmt': {
      const n = node as WhileStmt;
      return `${pad}(while ${printAST(n.condition, 0)}\n${printAST(n.body, depth + 1)}\n${pad})`;
    }
    case 'ForInStmt': {
      const n = node as ForInStmt;
      return `${pad}(for ${n.variable} in ${printAST(n.iterable, 0)}\n${printAST(n.body, depth + 1)}\n${pad})`;
    }
    case 'BreakStmt':    return `${pad}(break)`;
    case 'ContinueStmt': return `${pad}(continue)`;
    case 'BlockStmt': {
      const n = node as BlockStmt;
      return n.body.map(s => printAST(s, depth)).join('\n');
    }
    case 'ExpressionStmt': {
      const n = node as ExpressionStmt;
      return printAST(n.expression, depth);
    }
    case 'StructStmt': {
      const n = node as StructStmt;
      return `${pad}(struct ${n.name} { ${n.fields.join(', ')} })`;
    }
    case 'IntegerLiteralExpr': return `${pad}${(node as IntegerLiteralExpr).value}`;
    case 'FloatLiteralExpr':   return `${pad}${(node as FloatLiteralExpr).value}`;
    case 'StringLiteralExpr':  return `${pad}"${(node as StringLiteralExpr).value}"`;
    case 'BooleanLiteralExpr': return `${pad}${(node as BooleanLiteralExpr).value}`;
    case 'NullLiteralExpr':    return `${pad}null`;
    case 'IdentifierExpr':     return `${pad}${(node as IdentifierExpr).name}`;
    case 'BinaryExpr': {
      const n = node as BinaryExpr;
      return `${pad}(${n.operator} ${printAST(n.left, 0)} ${printAST(n.right, 0)})`;
    }
    case 'UnaryExpr': {
      const n = node as UnaryExpr;
      return `${pad}(${n.operator} ${printAST(n.operand, 0)})`;
    }
    case 'CallExpr': {
      const n = node as CallExpr;
      const args = n.args.map(a => printAST(a, 0)).join(', ');
      return `${pad}(call ${printAST(n.callee, 0)} ${args})`;
    }
    case 'IndexExpr': {
      const n = node as IndexExpr;
      return `${pad}(index ${printAST(n.object, 0)} ${printAST(n.index, 0)})`;
    }
    case 'MemberExpr': {
      const n = node as MemberExpr;
      return `${pad}(member ${printAST(n.object, 0)} .${n.property})`;
    }
    case 'ArrayExpr': {
      const n = node as ArrayExpr;
      return `${pad}[${n.elements.map(e => printAST(e, 0)).join(', ')}]`;
    }
    case 'ObjectExpr': {
      const n = node as ObjectExpr;
      const fields = n.fields.map(f => `${f.key}: ${printAST(f.value, 0)}`).join(', ');
      return `${pad}{ ${fields} }`;
    }
    case 'FunctionExpr': {
      const n = node as FunctionExpr;
      const params = n.params.map(p => printParam(p)).join(', ');
      return `${pad}(fn(${params}) ${printAST(n.body, depth)})`;
    }
    case 'PrintExpr': {
      const n = node as PrintExpr;
      return `${pad}(print ${n.args.map(a => printAST(a, 0)).join(', ')})`;
    }
    default:
      return `${pad}(unknown:${(node as ASTNode).kind})`;
  }
}

function printParam(p: Parameter): string {
  return p.defaultValue ? `${p.name}=${printAST(p.defaultValue, 0)}` : p.name;
}
