import { SourceLocation } from '../lexer/index.js';
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
  IdentifierExpr,
  BinaryExpr,
  UnaryExpr,
  CallExpr,
  IndexExpr,
  MemberExpr,
  ArrayExpr,
  ObjectExpr,
  FunctionExpr,
  PrintExpr,
} from '../ast/index.js';
import { Chunk, OpCode } from './chunk.js';
import type { FunctionValue } from '../vm/value.js';

export interface Local {
  name: string;
  depth: number;
  isCaptured: boolean;
}

export interface UpvalueDesc {
  index: number;
  isLocal: boolean;
}

export type FunctionType = 'script' | 'function' | 'lambda';

export interface LoopContext {
  startIp: number;
  depth: number;
  breakJumps: number[];
}

export class BytecodeCompiler {
  public chunk: Chunk;
  public locals: Local[] = [];
  public scopeDepth: number = 0;
  public upvalues: UpvalueDesc[] = [];
  public functionType: FunctionType;
  public functionName: string;
  public arity: number = 0;
  public minArity: number = 0;
  public enclosing: BytecodeCompiler | null = null;
  public loops: LoopContext[] = [];

  constructor(functionType: FunctionType = 'script', functionName: string = '', enclosing: BytecodeCompiler | null = null) {
    this.functionType = functionType;
    this.functionName = functionName;
    this.enclosing = enclosing;
    this.chunk = new Chunk();

    // Slot 0 of locals is reserved for the function itself / script receiver
    this.locals.push({
      name: functionType === 'script' ? '' : functionName,
      depth: 0,
      isCaptured: false,
    });
  }

  public compile(program: Program): Chunk {
    for (const stmt of program.body) {
      this.compileStatement(stmt);
    }
    this.emitReturn(program.loc);
    return this.chunk;
  }

  // ── Emitting Helpers ────────────────────────────────────────────────────────

  private emitByte(byte: number, loc: SourceLocation): void {
    this.chunk.write(byte, loc);
  }

  private emitBytes(byte1: number, byte2: number, loc: SourceLocation): void {
    this.chunk.write(byte1, loc);
    this.chunk.write(byte2, loc);
  }

  private emitConstant(val: any, loc: SourceLocation): void {
    this.chunk.writeConstant(val, loc);
  }

  private emitReturn(loc: SourceLocation): void {
    this.emitByte(OpCode.OP_NULL, loc);
    this.emitByte(OpCode.OP_RETURN, loc);
  }

  private emitJump(instruction: OpCode, loc: SourceLocation): number {
    this.emitByte(instruction, loc);
    this.emitByte(0xff, loc);
    this.emitByte(0xff, loc);
    return this.chunk.code.length - 2;
  }

  private patchJump(offset: number): void {
    const jump = this.chunk.code.length - offset - 2;
    if (jump > 0xffff) {
      throw new Error(`Too much code to jump over (jump offset ${jump}).`);
    }
    this.chunk.code[offset] = (jump >> 8) & 0xff;
    this.chunk.code[offset + 1] = jump & 0xff;
  }

  private emitLoop(loopStart: number, loc: SourceLocation): void {
    this.emitByte(OpCode.OP_LOOP, loc);
    const offset = this.chunk.code.length - loopStart + 2;
    if (offset > 0xffff) {
      throw new Error(`Loop body too large.`);
    }
    this.emitByte((offset >> 8) & 0xff, loc);
    this.emitByte(offset & 0xff, loc);
  }

  // ── Scopes & Variables ──────────────────────────────────────────────────────

  private beginScope(): void {
    this.scopeDepth++;
  }

  private endScope(loc: SourceLocation): void {
    this.scopeDepth--;
    while (this.locals.length > 0 && this.locals[this.locals.length - 1]!.depth > this.scopeDepth) {
      const local = this.locals.pop()!;
      if (local.isCaptured) {
        this.emitByte(OpCode.OP_CLOSE_UPVALUE, loc);
      } else {
        this.emitByte(OpCode.OP_POP, loc);
      }
    }
  }

  private addLocal(name: string): number {
    this.locals.push({
      name,
      depth: this.scopeDepth,
      isCaptured: false,
    });
    return this.locals.length - 1;
  }

  private resolveLocal(name: string): number {
    for (let i = this.locals.length - 1; i >= 0; i--) {
      if (this.locals[i]!.name === name) {
        return i;
      }
    }
    return -1;
  }

  private addUpvalue(index: number, isLocal: boolean): number {
    for (let i = 0; i < this.upvalues.length; i++) {
      const upvalue = this.upvalues[i]!;
      if (upvalue.index === index && upvalue.isLocal === isLocal) {
        return i;
      }
    }
    this.upvalues.push({ index, isLocal });
    return this.upvalues.length - 1;
  }

  private resolveUpvalue(name: string): number {
    if (!this.enclosing) return -1;

    const local = this.enclosing.resolveLocal(name);
    if (local !== -1) {
      this.enclosing.locals[local]!.isCaptured = true;
      return this.addUpvalue(local, true);
    }

    const upvalue = this.enclosing.resolveUpvalue(name);
    if (upvalue !== -1) {
      return this.addUpvalue(upvalue, false);
    }

    return -1;
  }

  // ── Statements ─────────────────────────────────────────────────────────────

  public compileStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'LetStmt':
        this.compileLet(stmt);
        break;
      case 'AssignStmt':
        this.compileAssign(stmt);
        break;
      case 'CompoundAssignStmt':
        this.compileCompoundAssign(stmt);
        break;
      case 'FunctionStmt':
        this.compileFunctionStmt(stmt);
        break;
      case 'ReturnStmt':
        this.compileReturn(stmt);
        break;
      case 'IfStmt':
        this.compileIf(stmt);
        break;
      case 'WhileStmt':
        this.compileWhile(stmt);
        break;
      case 'ForInStmt':
        this.compileForIn(stmt);
        break;
      case 'BreakStmt':
        this.compileBreak(stmt);
        break;
      case 'ContinueStmt':
        this.compileContinue(stmt);
        break;
      case 'BlockStmt':
        this.beginScope();
        for (const s of stmt.body) {
          this.compileStatement(s);
        }
        this.endScope(stmt.loc);
        break;
      case 'ExpressionStmt':
        this.compileExpression(stmt.expression);
        this.emitByte(OpCode.OP_POP, stmt.loc);
        break;
      case 'StructStmt':
        // Struct metadata can be registered as an object template
        break;
    }
  }

  private compileLet(stmt: LetStmt): void {
    if (stmt.initializer) {
      this.compileExpression(stmt.initializer);
    } else {
      this.emitByte(OpCode.OP_NULL, stmt.loc);
    }

    if (this.scopeDepth > 0) {
      this.addLocal(stmt.name);
    } else {
      const constIdx = this.chunk.addConstant(stmt.name);
      this.emitBytes(OpCode.OP_DEFINE_GLOBAL, constIdx, stmt.loc);
    }
  }

  private compileAssign(stmt: AssignStmt): void {
    if (stmt.target.kind === 'IdentifierExpr') {
      this.compileExpression(stmt.value);
      const name = stmt.target.name;

      const local = this.resolveLocal(name);
      if (local !== -1) {
        this.emitBytes(OpCode.OP_SET_LOCAL, local, stmt.loc);
      } else {
        const upvalue = this.resolveUpvalue(name);
        if (upvalue !== -1) {
          this.emitBytes(OpCode.OP_SET_UPVALUE, upvalue, stmt.loc);
        } else {
          const constIdx = this.chunk.addConstant(name);
          this.emitBytes(OpCode.OP_SET_GLOBAL, constIdx, stmt.loc);
        }
      }
      this.emitByte(OpCode.OP_POP, stmt.loc);
    } else if (stmt.target.kind === 'IndexExpr') {
      this.compileExpression(stmt.target.object);
      this.compileExpression(stmt.target.index);
      this.compileExpression(stmt.value);
      this.emitByte(OpCode.OP_SET_INDEX, stmt.loc);
      this.emitByte(OpCode.OP_POP, stmt.loc);
    } else if (stmt.target.kind === 'MemberExpr') {
      this.compileExpression(stmt.target.object);
      this.compileExpression(stmt.value);
      const constIdx = this.chunk.addConstant(stmt.target.property);
      this.emitBytes(OpCode.OP_SET_PROPERTY, constIdx, stmt.loc);
      this.emitByte(OpCode.OP_POP, stmt.loc);
    }
  }

  private compileCompoundAssign(stmt: CompoundAssignStmt): void {
    // Op: target += value  --> target = target + value
    let opCode: OpCode;
    switch (stmt.operator) {
      case '+=': opCode = OpCode.OP_ADD; break;
      case '-=': opCode = OpCode.OP_SUB; break;
      case '*=': opCode = OpCode.OP_MUL; break;
      case '/=': opCode = OpCode.OP_DIV; break;
    }

    if (stmt.target.kind === 'IdentifierExpr') {
      const name = stmt.target.name;
      // Load target current value
      this.compileVariableGet(name, stmt.loc);
      // Compile RHS value
      this.compileExpression(stmt.value);
      // Perform operation
      this.emitByte(opCode, stmt.loc);
      // Store back
      this.compileVariableSet(name, stmt.loc);
      this.emitByte(OpCode.OP_POP, stmt.loc);
    } else if (stmt.target.kind === 'IndexExpr') {
      this.compileExpression(stmt.target.object);
      this.compileExpression(stmt.target.index);
      // Stack: [obj, index]
      this.emitByte(OpCode.OP_DUP, stmt.loc); // [obj, index, index]
      // To get current value, we can use a sub-expression or index get
      // Stack layout for OP_SET_INDEX: [obj, index, value]
      this.compileExpression(stmt.target); // computes obj[index]
      this.compileExpression(stmt.value);
      this.emitByte(opCode, stmt.loc);
      this.emitByte(OpCode.OP_SET_INDEX, stmt.loc);
      this.emitByte(OpCode.OP_POP, stmt.loc);
    } else if (stmt.target.kind === 'MemberExpr') {
      this.compileExpression(stmt.target.object);
      this.compileExpression(stmt.target);
      this.compileExpression(stmt.value);
      this.emitByte(opCode, stmt.loc);
      const constIdx = this.chunk.addConstant(stmt.target.property);
      this.emitBytes(OpCode.OP_SET_PROPERTY, constIdx, stmt.loc);
      this.emitByte(OpCode.OP_POP, stmt.loc);
    }
  }

  private compileVariableGet(name: string, loc: SourceLocation): void {
    const local = this.resolveLocal(name);
    if (local !== -1) {
      this.emitBytes(OpCode.OP_GET_LOCAL, local, loc);
    } else {
      const upvalue = this.resolveUpvalue(name);
      if (upvalue !== -1) {
        this.emitBytes(OpCode.OP_GET_UPVALUE, upvalue, loc);
      } else {
        const constIdx = this.chunk.addConstant(name);
        this.emitBytes(OpCode.OP_GET_GLOBAL, constIdx, loc);
      }
    }
  }

  private compileVariableSet(name: string, loc: SourceLocation): void {
    const local = this.resolveLocal(name);
    if (local !== -1) {
      this.emitBytes(OpCode.OP_SET_LOCAL, local, loc);
    } else {
      const upvalue = this.resolveUpvalue(name);
      if (upvalue !== -1) {
        this.emitBytes(OpCode.OP_SET_UPVALUE, upvalue, loc);
      } else {
        const constIdx = this.chunk.addConstant(name);
        this.emitBytes(OpCode.OP_SET_GLOBAL, constIdx, loc);
      }
    }
  }

  private compileFunctionStmt(stmt: FunctionStmt): void {
    const fnCompiler = new BytecodeCompiler('function', stmt.name, this);
    fnCompiler.arity = stmt.params.length;
    fnCompiler.minArity = stmt.params.filter(p => !p.defaultValue).length;
    fnCompiler.beginScope();

    for (const param of stmt.params) {
      fnCompiler.addLocal(param.name);
    }

    for (const s of stmt.body.body) {
      fnCompiler.compileStatement(s);
    }

    fnCompiler.emitReturn(stmt.loc);
    const fnChunk = fnCompiler.chunk;

    const fnValue: FunctionValue = {
      kind: 'function',
      name: stmt.name,
      arity: fnCompiler.arity,
      minArity: fnCompiler.minArity,
      chunk: fnChunk,
      upvalues: fnCompiler.upvalues,
      localNames: fnCompiler.locals.map(l => l.name),
    };

    const constIdx = this.chunk.addConstant(fnValue);
    this.emitBytes(OpCode.OP_CLOSURE, constIdx, stmt.loc);

    for (const upval of fnCompiler.upvalues) {
      this.emitByte(upval.isLocal ? 1 : 0, stmt.loc);
      this.emitByte(upval.index, stmt.loc);
    }

    if (this.scopeDepth > 0) {
      this.addLocal(stmt.name);
    } else {
      const nameIdx = this.chunk.addConstant(stmt.name);
      this.emitBytes(OpCode.OP_DEFINE_GLOBAL, nameIdx, stmt.loc);
    }
  }

  private compileReturn(stmt: ReturnStmt): void {
    if (stmt.value) {
      this.compileExpression(stmt.value);
    } else {
      this.emitByte(OpCode.OP_NULL, stmt.loc);
    }
    this.emitByte(OpCode.OP_RETURN, stmt.loc);
  }

  private compileIf(stmt: IfStmt): void {
    this.compileExpression(stmt.condition);

    const thenJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE, stmt.loc);
    this.emitByte(OpCode.OP_POP, stmt.loc); // Pop condition on truthy path

    this.compileStatement(stmt.consequent);

    const elseJump = this.emitJump(OpCode.OP_JUMP, stmt.loc);

    this.patchJump(thenJump);
    this.emitByte(OpCode.OP_POP, stmt.loc); // Pop condition on falsy path

    if (stmt.alternate) {
      this.compileStatement(stmt.alternate);
    }

    this.patchJump(elseJump);
  }

  private compileWhile(stmt: WhileStmt): void {
    const loopStart = this.chunk.code.length;
    const loopCtx: LoopContext = {
      startIp: loopStart,
      depth: this.scopeDepth,
      breakJumps: [],
    };
    this.loops.push(loopCtx);

    this.compileExpression(stmt.condition);
    const exitJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE, stmt.loc);
    this.emitByte(OpCode.OP_POP, stmt.loc); // Pop condition on true

    this.compileStatement(stmt.body);

    this.emitLoop(loopStart, stmt.loc);

    this.patchJump(exitJump);
    this.emitByte(OpCode.OP_POP, stmt.loc); // Pop condition on false

    // Patch all breaks
    for (const breakJump of loopCtx.breakJumps) {
      this.patchJump(breakJump);
    }

    this.loops.pop();
  }

  private compileForIn(stmt: ForInStmt): void {
    // Desugar for item in iterable { body }
    // 1. Evaluate iterable: stack has [iterable]
    this.beginScope();
    this.compileExpression(stmt.iterable);
    const iterableSlot = this.addLocal('$iterable');

    // 2. Initialize index variable $i = 0
    this.emitConstant(0, stmt.loc);
    const indexSlot = this.addLocal('$index');

    // 3. Declare user loop variable
    this.emitByte(OpCode.OP_NULL, stmt.loc);
    const itemSlot = this.addLocal(stmt.variable);

    const loopStart = this.chunk.code.length;
    const loopCtx: LoopContext = {
      startIp: loopStart,
      depth: this.scopeDepth,
      breakJumps: [],
    };
    this.loops.push(loopCtx);

    // Condition: $index < len($iterable)
    this.emitBytes(OpCode.OP_GET_LOCAL, indexSlot, stmt.loc);
    const lenIdx = this.chunk.addConstant('len');
    this.emitBytes(OpCode.OP_GET_GLOBAL, lenIdx, stmt.loc);
    this.emitBytes(OpCode.OP_GET_LOCAL, iterableSlot, stmt.loc);
    this.emitBytes(OpCode.OP_CALL, 1, stmt.loc); // calls len($iterable)
    this.emitByte(OpCode.OP_LESS, stmt.loc);

    const exitJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE, stmt.loc);
    this.emitByte(OpCode.OP_POP, stmt.loc); // pop condition

    // Assign item = $iterable[$index]
    this.emitBytes(OpCode.OP_GET_LOCAL, iterableSlot, stmt.loc);
    this.emitBytes(OpCode.OP_GET_LOCAL, indexSlot, stmt.loc);
    this.emitByte(OpCode.OP_GET_INDEX, stmt.loc);
    this.emitBytes(OpCode.OP_SET_LOCAL, itemSlot, stmt.loc);
    this.emitByte(OpCode.OP_POP, stmt.loc);

    // Body
    for (const s of stmt.body.body) {
      this.compileStatement(s);
    }

    // Increment index: $index += 1
    this.emitBytes(OpCode.OP_GET_LOCAL, indexSlot, stmt.loc);
    this.emitConstant(1, stmt.loc);
    this.emitByte(OpCode.OP_ADD, stmt.loc);
    this.emitBytes(OpCode.OP_SET_LOCAL, indexSlot, stmt.loc);
    this.emitByte(OpCode.OP_POP, stmt.loc);

    this.emitLoop(loopStart, stmt.loc);

    this.patchJump(exitJump);
    this.emitByte(OpCode.OP_POP, stmt.loc); // pop condition

    for (const breakJump of loopCtx.breakJumps) {
      this.patchJump(breakJump);
    }

    this.loops.pop();
    this.endScope(stmt.loc);
  }

  private compileBreak(stmt: BreakStmt): void {
    if (this.loops.length === 0) {
      throw new Error(`'break' used outside of loop.`);
    }
    const currentLoop = this.loops[this.loops.length - 1]!;
    // Clean up local variables up to loop depth before breaking
    let count = 0;
    for (let i = this.locals.length - 1; i >= 0; i--) {
      if (this.locals[i]!.depth > currentLoop.depth) count++;
      else break;
    }
    for (let i = 0; i < count; i++) {
      this.emitByte(OpCode.OP_POP, stmt.loc);
    }

    const breakJump = this.emitJump(OpCode.OP_JUMP, stmt.loc);
    currentLoop.breakJumps.push(breakJump);
  }

  private compileContinue(stmt: ContinueStmt): void {
    if (this.loops.length === 0) {
      throw new Error(`'continue' used outside of loop.`);
    }
    const currentLoop = this.loops[this.loops.length - 1]!;
    this.emitLoop(currentLoop.startIp, stmt.loc);
  }

  // ── Expressions ────────────────────────────────────────────────────────────

  public compileExpression(expr: Expression): void {
    switch (expr.kind) {
      case 'IntegerLiteralExpr':
      case 'FloatLiteralExpr':
      case 'StringLiteralExpr':
        this.emitConstant(expr.value, expr.loc);
        break;
      case 'BooleanLiteralExpr':
        this.emitByte(expr.value ? OpCode.OP_TRUE : OpCode.OP_FALSE, expr.loc);
        break;
      case 'NullLiteralExpr':
        this.emitByte(OpCode.OP_NULL, expr.loc);
        break;
      case 'IdentifierExpr':
        this.compileVariableGet(expr.name, expr.loc);
        break;
      case 'UnaryExpr':
        this.compileUnary(expr);
        break;
      case 'BinaryExpr':
        this.compileBinary(expr);
        break;
      case 'CallExpr':
        this.compileCall(expr);
        break;
      case 'IndexExpr':
        this.compileExpression(expr.object);
        this.compileExpression(expr.index);
        this.emitByte(OpCode.OP_GET_INDEX, expr.loc);
        break;
      case 'MemberExpr':
        this.compileExpression(expr.object);
        const constIdx = this.chunk.addConstant(expr.property);
        this.emitBytes(OpCode.OP_GET_PROPERTY, constIdx, expr.loc);
        break;
      case 'ArrayExpr':
        for (const elem of expr.elements) {
          this.compileExpression(elem);
        }
        this.emitBytes(OpCode.OP_ARRAY, expr.elements.length, expr.loc);
        break;
      case 'ObjectExpr':
        for (const field of expr.fields) {
          this.emitConstant(field.key, expr.loc);
          this.compileExpression(field.value);
        }
        this.emitBytes(OpCode.OP_OBJECT, expr.fields.length, expr.loc);
        break;
      case 'FunctionExpr':
        this.compileLambda(expr);
        break;
      case 'PrintExpr':
        for (const arg of expr.args) {
          this.compileExpression(arg);
        }
        this.emitBytes(OpCode.OP_PRINT, expr.args.length, expr.loc);
        break;
    }
  }

  private compileUnary(expr: UnaryExpr): void {
    this.compileExpression(expr.operand);
    switch (expr.operator) {
      case '-':
        this.emitByte(OpCode.OP_NEGATE, expr.loc);
        break;
      case 'not':
      case '!':
        this.emitByte(OpCode.OP_NOT, expr.loc);
        break;
    }
  }

  private compileBinary(expr: BinaryExpr): void {
    // Short-circuit logical operators
    if (expr.operator === 'and') {
      this.compileExpression(expr.left);
      const endJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE, expr.loc);
      this.emitByte(OpCode.OP_POP, expr.loc); // pop left if true
      this.compileExpression(expr.right);
      this.patchJump(endJump);
      return;
    }

    if (expr.operator === 'or') {
      this.compileExpression(expr.left);
      const elseJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE, expr.loc);
      const endJump = this.emitJump(OpCode.OP_JUMP, expr.loc);
      this.patchJump(elseJump);
      this.emitByte(OpCode.OP_POP, expr.loc); // pop left if false
      this.compileExpression(expr.right);
      this.patchJump(endJump);
      return;
    }

    this.compileExpression(expr.left);
    this.compileExpression(expr.right);

    switch (expr.operator) {
      case '+':  this.emitByte(OpCode.OP_ADD, expr.loc); break;
      case '-':  this.emitByte(OpCode.OP_SUB, expr.loc); break;
      case '*':  this.emitByte(OpCode.OP_MUL, expr.loc); break;
      case '/':  this.emitByte(OpCode.OP_DIV, expr.loc); break;
      case '%':  this.emitByte(OpCode.OP_MOD, expr.loc); break;
      case '**': this.emitByte(OpCode.OP_POW, expr.loc); break;
      case '==': this.emitByte(OpCode.OP_EQUAL, expr.loc); break;
      case '!=': this.emitByte(OpCode.OP_NOT_EQUAL, expr.loc); break;
      case '>':  this.emitByte(OpCode.OP_GREATER, expr.loc); break;
      case '>=': this.emitByte(OpCode.OP_GREATER_EQUAL, expr.loc); break;
      case '<':  this.emitByte(OpCode.OP_LESS, expr.loc); break;
      case '<=': this.emitByte(OpCode.OP_LESS_EQUAL, expr.loc); break;
    }
  }

  private compileCall(expr: CallExpr): void {
    this.compileExpression(expr.callee);
    for (const arg of expr.args) {
      this.compileExpression(arg);
    }
    this.emitBytes(OpCode.OP_CALL, expr.args.length, expr.loc);
  }

  private compileLambda(expr: FunctionExpr): void {
    const fnCompiler = new BytecodeCompiler('lambda', 'anonymous', this);
    fnCompiler.arity = expr.params.length;
    fnCompiler.minArity = expr.params.filter(p => !p.defaultValue).length;
    fnCompiler.beginScope();

    for (const param of expr.params) {
      fnCompiler.addLocal(param.name);
    }

    for (const s of expr.body.body) {
      fnCompiler.compileStatement(s);
    }

    fnCompiler.emitReturn(expr.loc);
    const fnChunk = fnCompiler.chunk;

    const fnValue: FunctionValue = {
      kind: 'function',
      name: 'anonymous',
      arity: fnCompiler.arity,
      minArity: fnCompiler.minArity,
      chunk: fnChunk,
      upvalues: fnCompiler.upvalues,
      localNames: fnCompiler.locals.map(l => l.name),
    };

    const constIdx = this.chunk.addConstant(fnValue);
    this.emitBytes(OpCode.OP_CLOSURE, constIdx, expr.loc);

    for (const upval of fnCompiler.upvalues) {
      this.emitByte(upval.isLocal ? 1 : 0, expr.loc);
      this.emitByte(upval.index, expr.loc);
    }
  }
}
