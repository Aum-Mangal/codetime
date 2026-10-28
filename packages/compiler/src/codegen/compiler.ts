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
  StructStmt,
  BinaryExpr,
  UnaryExpr,
  CallExpr,
  FunctionExpr,
  Parameter,
} from '../ast/index.js';
import { Chunk, OpCode } from './chunk.js';
import type { FunctionValue, StructTypeValue } from '../vm/value.js';
import { CompileError } from '../diagnostics/errors.js';

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
  /** Where `continue` loops back to when the loop has no separate continue target (while). */
  startIp: number;
  /** Scope depth of the loop itself; locals deeper than this belong to the body. */
  depth: number;
  breakJumps: number[];
  /**
   * Forward jumps emitted by `continue` in loops whose continue target comes
   * after the body (for-in: the index increment). Null for while loops.
   */
  continueJumps: number[] | null;
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
      throw new CompileError(`Too much code to jump over (jump offset ${jump}).`, this.chunk.locations[offset]!);
    }
    this.chunk.code[offset] = (jump >> 8) & 0xff;
    this.chunk.code[offset + 1] = jump & 0xff;
  }

  private emitLoop(loopStart: number, loc: SourceLocation): void {
    this.emitByte(OpCode.OP_LOOP, loc);
    const offset = this.chunk.code.length - loopStart + 2;
    if (offset > 0xffff) {
      throw new CompileError(`Loop body too large.`, loc);
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
      this.emitDiscardLocal(local, loc);
    }
  }

  /** Remove a local from the runtime stack, closing it first if a closure captured it. */
  private emitDiscardLocal(local: Local, loc: SourceLocation): void {
    this.emitByte(local.isCaptured ? OpCode.OP_CLOSE_UPVALUE : OpCode.OP_POP, loc);
  }

  /**
   * Emit cleanup for a `break`/`continue` jumping out of the body scopes of a
   * loop: every local deeper than the loop is popped (or closed, if captured)
   * at runtime. The compile-time locals are left in place because the code
   * after the jump in the same block still uses them.
   */
  private emitLoopExit(loop: LoopContext, loc: SourceLocation): void {
    for (let i = this.locals.length - 1; i >= 0 && this.locals[i]!.depth > loop.depth; i--) {
      this.emitDiscardLocal(this.locals[i]!, loc);
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
        this.compileStruct(stmt);
        break;
    }
  }

  /** A struct declaration binds its name to an immutable StructTypeValue; calling it constructs an instance. */
  private compileStruct(stmt: StructStmt): void {
    const structValue: StructTypeValue = { kind: 'struct', name: stmt.name, fields: [...stmt.fields] };
    this.emitConstant(structValue, stmt.loc);
    this.declareVariable(stmt.name, stmt.loc);
  }

  /** Bind the value on top of the stack to `name` as a local (in a scope) or a global (at top level). */
  private declareVariable(name: string, loc: SourceLocation): void {
    if (this.scopeDepth > 0) {
      this.addLocal(name);
    } else {
      const constIdx = this.chunk.addConstant(name);
      this.emitBytes(OpCode.OP_DEFINE_GLOBAL, constIdx, loc);
    }
  }

  private compileLet(stmt: LetStmt): void {
    if (stmt.initializer) {
      this.compileExpression(stmt.initializer);
    } else {
      this.emitByte(OpCode.OP_NULL, stmt.loc);
    }

    this.declareVariable(stmt.name, stmt.loc);
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
      // Evaluate obj and index once, then reuse them for both the read and the write.
      this.compileExpression(stmt.target.object);
      this.compileExpression(stmt.target.index);   // [obj, index]
      this.emitByte(OpCode.OP_DUP2, stmt.loc);      // [obj, index, obj, index]
      this.emitByte(OpCode.OP_GET_INDEX, stmt.loc); // [obj, index, current]
      this.compileExpression(stmt.value);           // [obj, index, current, rhs]
      this.emitByte(opCode, stmt.loc);              // [obj, index, result]
      this.emitByte(OpCode.OP_SET_INDEX, stmt.loc); // [result]
      this.emitByte(OpCode.OP_POP, stmt.loc);
    } else if (stmt.target.kind === 'MemberExpr') {
      const constIdx = this.chunk.addConstant(stmt.target.property);
      this.compileExpression(stmt.target.object);             // [obj]
      this.emitByte(OpCode.OP_DUP, stmt.loc);                  // [obj, obj]
      this.emitBytes(OpCode.OP_GET_PROPERTY, constIdx, stmt.loc); // [obj, current]
      this.compileExpression(stmt.value);                      // [obj, current, rhs]
      this.emitByte(opCode, stmt.loc);                         // [obj, result]
      this.emitBytes(OpCode.OP_SET_PROPERTY, constIdx, stmt.loc); // [result]
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
    this.compileFunction('function', stmt.name, stmt.params, stmt.body.body, stmt.loc);
    this.declareVariable(stmt.name, stmt.loc);
  }

  /**
   * Compile a function body in a child compiler and emit OP_CLOSURE for it.
   * Shared by named functions and lambdas.
   *
   * Calling convention: the VM fills every missing trailing argument with an
   * internal "missing" marker, so parameter slots are always 1..arity. The
   * prologue then replaces each marker with its default value, evaluated in the
   * callee so defaults can reference earlier parameters.
   */
  private compileFunction(
    type: FunctionType,
    name: string,
    params: Parameter[],
    body: Statement[],
    loc: SourceLocation,
  ): void {
    const fnCompiler = new BytecodeCompiler(type, name, this);
    fnCompiler.arity = params.length;
    fnCompiler.minArity = params.filter(p => !p.defaultValue).length;
    fnCompiler.beginScope();

    for (const param of params) {
      fnCompiler.addLocal(param.name);
    }

    params.forEach((param, i) => {
      if (!param.defaultValue) return;
      const slot = i + 1; // slot 0 holds the function itself
      fnCompiler.emitByte(OpCode.OP_JUMP_IF_ARG_PRESENT, param.loc);
      fnCompiler.emitByte(slot, param.loc);
      const skip = fnCompiler.emitJumpOperand(param.loc);
      fnCompiler.compileExpression(param.defaultValue);
      fnCompiler.emitBytes(OpCode.OP_SET_LOCAL, slot, param.loc);
      fnCompiler.emitByte(OpCode.OP_POP, param.loc);
      fnCompiler.patchJump(skip);
    });

    for (const s of body) {
      fnCompiler.compileStatement(s);
    }

    fnCompiler.emitReturn(loc);

    const fnValue: FunctionValue = {
      kind: 'function',
      name,
      arity: fnCompiler.arity,
      minArity: fnCompiler.minArity,
      chunk: fnCompiler.chunk,
      upvalues: fnCompiler.upvalues,
      localNames: fnCompiler.locals.map(l => l.name),
    };

    const constIdx = this.chunk.addConstant(fnValue);
    this.emitBytes(OpCode.OP_CLOSURE, constIdx, loc);

    for (const upval of fnCompiler.upvalues) {
      this.emitByte(upval.isLocal ? 1 : 0, loc);
      this.emitByte(upval.index, loc);
    }
  }

  /** Emit a 2-byte placeholder jump operand and return its offset for patchJump. */
  private emitJumpOperand(loc: SourceLocation): number {
    this.emitByte(0xff, loc);
    this.emitByte(0xff, loc);
    return this.chunk.code.length - 2;
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
      continueJumps: null,
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

  /**
   * Desugars `for item in iterable { body }` into:
   *
   *     { let $iterable = iterable; let $index = 0; let item = null
   *       loop:     if !($index < len($iterable)) goto exit
   *                 item = $iterable[$index]
   *                 { body }                 <- own scope, popped every iteration
   *       continue: $index += 1              <- `continue` jumps here
   *                 goto loop
   *       exit: }                            <- `break` jumps here
   */
  private compileForIn(stmt: ForInStmt): void {
    this.beginScope();
    this.compileExpression(stmt.iterable);
    const iterableSlot = this.addLocal('$iterable');

    this.emitConstant(0, stmt.loc);
    const indexSlot = this.addLocal('$index');

    this.emitByte(OpCode.OP_NULL, stmt.loc);
    const itemSlot = this.addLocal(stmt.variable);

    const loopStart = this.chunk.code.length;
    const loopCtx: LoopContext = {
      startIp: loopStart,
      depth: this.scopeDepth,
      breakJumps: [],
      continueJumps: [],
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

    // Body, in its own scope so its locals are popped at the end of every iteration
    this.beginScope();
    for (const s of stmt.body.body) {
      this.compileStatement(s);
    }
    this.endScope(stmt.body.loc);

    // Continue target: increment index ($index += 1)
    for (const continueJump of loopCtx.continueJumps!) {
      this.patchJump(continueJump);
    }
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
    const currentLoop = this.currentLoop('break', stmt.loc);
    this.emitLoopExit(currentLoop, stmt.loc);
    currentLoop.breakJumps.push(this.emitJump(OpCode.OP_JUMP, stmt.loc));
  }

  private compileContinue(stmt: ContinueStmt): void {
    const currentLoop = this.currentLoop('continue', stmt.loc);
    this.emitLoopExit(currentLoop, stmt.loc);
    if (currentLoop.continueJumps) {
      currentLoop.continueJumps.push(this.emitJump(OpCode.OP_JUMP, stmt.loc));
    } else {
      this.emitLoop(currentLoop.startIp, stmt.loc);
    }
  }

  private currentLoop(keyword: string, loc: SourceLocation): LoopContext {
    const loop = this.loops[this.loops.length - 1];
    if (!loop) {
      // The semantic analyzer rejects this first; this guards direct compiler use.
      throw new CompileError(`'${keyword}' used outside of loop.`, loc);
    }
    return loop;
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
    this.compileFunction('lambda', 'anonymous', expr.params, expr.body.body, expr.loc);
  }
}
