# CodeTime — Architecture Document

**Version 1.0** | Technical description of the CodeTime compiler, VM, and debugger architecture.

---

## System Overview

CodeTime is organized as a monorepo with three packages:

```
codetime/
├── packages/compiler/   Pure TypeScript language engine
├── packages/cli/        Node.js command-line interface
└── packages/ide/        React + Vite browser IDE
```

The `compiler` package is the core — it has zero dependencies and runs identically in Node.js (for the CLI) and in the browser via a Web Worker (for the IDE).

---

## Compiler Pipeline

```
Source Code (.ct file)
        │
        ▼
  ┌─────────────┐
  │    Lexer    │  Converts raw text → flat Token stream
  └─────────────┘
        │  Token[]
        ▼
  ┌─────────────┐
  │   Parser    │  Builds typed AST from token stream
  └─────────────┘  Pratt parsing for expressions (correct precedence)
        │  Program (AST)
        ▼
  ┌──────────────────┐
  │ SemanticAnalyzer │  Scope checking, type checking, arity checking
  └──────────────────┘
        │  Annotated AST + symbol table
        ▼
  ┌──────────────────┐
  │ BytecodeCompiler │  Emits bytecode instructions + constant pool
  └──────────────────┘
        │  Chunk (bytecode + source map)
        ▼
  ┌─────────┐
  │   VM    │  Stack-based interpreter with call frames
  └─────────┘
        │  Execution events
        ▼
  ┌──────────┐
  │ Debugger │  Records execution state; supports time-travel
  └──────────┘
```

---

## Lexer

**File:** `packages/compiler/src/lexer/`

The lexer converts source text to a flat array of tokens in a single pass.

Key design decisions:
- **Newline significance**: Newlines are emitted as `NEWLINE` tokens only when they follow value-producing tokens (identifiers, literals, closing brackets). This allows multi-line expressions without semicolons.
- **ILLEGAL tokens**: Unrecognized characters emit `ILLEGAL` rather than throwing, enabling error recovery.
- **Source locations**: Every token carries `{line, column, offset}` for error messages and debugger highlighting.

---

## Parser

**File:** `packages/compiler/src/parser/`

Recursive-descent parser for statements. **Pratt parsing** (top-down operator precedence) for expressions — this correctly handles precedence and associativity without special-casing each binary operator.

The parser produces a fully-typed AST (TypeScript discriminated union types).

Parse errors include:
- Expected vs actual token
- Source line and column
- Source context snippet with a caret pointing to the problem

---

## AST

**File:** `packages/compiler/src/ast/`

Every AST node is a TypeScript interface with:
- `kind: string` — discriminant for the union type
- `loc: SourceLocation` — source position for error reporting and debugger
- Type-specific fields

Major node categories:
- **Statements**: `LetStmt`, `AssignStmt`, `FunctionStmt`, `IfStmt`, `WhileStmt`, `ForInStmt`, `ReturnStmt`, `BlockStmt`, ...
- **Expressions**: `BinaryExpr`, `UnaryExpr`, `CallExpr`, `ArrayExpr`, `ObjectExpr`, literals, `IdentifierExpr`, ...

---

## Semantic Analyzer

**File:** `packages/compiler/src/semantic/`

Walks the AST and detects errors before code generation:

| Check | Example error |
|-------|---------------|
| Undefined variable | `x` used before `let x` |
| Duplicate declaration | `let x = 1; let x = 2` in same scope |
| Return outside function | `return 42` at top level |
| Wrong argument count | `fn f(a, b) {}; f(1)` |
| Break/continue outside loop | `break` at top level |

The analyzer maintains a **scope stack** (array of `Map<string, SymbolInfo>`). Each block push/pops a scope frame.

---

## Bytecode Instruction Set

**File:** `packages/compiler/src/codegen/`

Stack-based instruction set. Instructions operate on the value stack.

```
LOAD_CONST   idx     -- push constants[idx] onto stack
LOAD_VAR     name    -- push current frame's variable `name`
STORE_VAR    name    -- pop TOS, store as `name` in current frame
LOAD_GLOBAL  name    -- push global scope variable
STORE_GLOBAL name    -- pop TOS, store in global scope
ADD                  -- pop 2, push sum
SUB                  -- pop 2, push difference
MUL                  -- pop 2, push product
DIV                  -- pop 2, push quotient
MOD                  -- pop 2, push remainder
POW                  -- pop 2, push power
NEGATE               -- pop 1, push negation
NOT                  -- pop 1, push boolean NOT
EQ / NEQ             -- equality comparison
LT / LTE / GT / GTE  -- relational comparison
JUMP         offset  -- unconditional jump
JUMP_IF_FALSE offset -- pop, jump if falsy
JUMP_IF_TRUE  offset -- pop, jump if truthy (for `or` short-circuit)
CALL         argc    -- call function with argc args from stack
RETURN               -- return TOS (or null) from current call frame
MAKE_ARRAY   count   -- pop count items, push array
MAKE_OBJECT  count   -- pop count key+value pairs, push object
INDEX_GET            -- pop index+object, push value
INDEX_SET            -- pop value+index+object, push modified
MEMBER_GET   name    -- pop object, push object.name
MEMBER_SET   name    -- pop value+object, set object.name
PRINT        argc    -- pop argc args, print them
HALT                 -- stop execution
```

Each instruction also carries a `sourceIndex` — an index into the source map, which maps instruction positions to `{line, column}` in the source file.

---

## Virtual Machine

**File:** `packages/compiler/src/vm/`

Stack-based VM inspired by CPython and the Crafting Interpreters Lox VM.

### Data Structures

```
VM {
  chunk: Chunk           // bytecode + constants
  ip: number             // instruction pointer (index into chunk.code)
  stack: Value[]         // operand stack
  frames: CallFrame[]    // call stack
  globals: Map<string, Value>  // global variables
}

CallFrame {
  fn: FunctionValue      // the function being executed
  ip: number             // return address (IP when CALL was made)
  stackBase: number      // index into VM.stack where this frame's locals start
  locals: Map<string, Value>   // local variables in this frame
}

Value = integer | float | string | boolean | null | ArrayValue | ObjectValue | FunctionValue
```

### Execution

The VM runs in a tight loop, fetching and dispatching instructions by type. Each `CALL` instruction:
1. Pops `argc` arguments off the stack
2. Creates a new `CallFrame` with those arguments bound to parameter names
3. Sets `ip` to the function's bytecode start

`RETURN` pops the frame, restores the previous `ip`, and pushes the return value.

---

## Time-Travel Debugger

**File:** `packages/compiler/src/debugger/`

### Strategy: Full Snapshot per Step

After each executed instruction, the debugger takes a **full deep copy** of the relevant VM state:

```typescript
interface ExecutionSnapshot {
  stepIndex: number;
  ip: number;
  sourceLoc: SourceLocation;
  stack: Value[];
  frames: FrameSnapshot[];
  globals: Record<string, Value>;
  output: string[];           // accumulated print output up to this step
  event: StepEvent;           // what just happened (assignment, call, return, etc.)
}

interface FrameSnapshot {
  fnName: string;
  locals: Record<string, Value>;
  ip: number;
}
```

The snapshot array is stored in `Debugger.history: ExecutionSnapshot[]`.

### Navigation

| Operation | Implementation |
|-----------|----------------|
| Step forward | Execute one instruction, append snapshot |
| Step backward | Decrement current step index, return snapshot |
| Jump to step N | Return `history[N]` |
| Restart | Reset current step to 0, return `history[0]` |

**Complexity:** Step backward and jump-to are O(1) — no replay needed. The tradeoff is memory: for typical programs (< 10,000 steps) the history stays well under 10 MB. For very long programs, a checkpoint+replay hybrid would be needed (documented as a known limitation).

### State Restoration

When the UI navigates to step N, it receives `history[N]` and reconstructs:
- Variable panel: `frames[0].locals` + `globals`
- Call stack panel: `frames.map(f => f.fnName)`
- Source highlighting: `sourceLoc.line`
- Timeline: the `event` field for each step

No re-execution is needed. The previous state is exactly restored by reading the snapshot.

---

## Web IDE

**File:** `packages/ide/`

Built with React + Vite + TypeScript.

### Architecture

```
IDE (React)
├── Worker (Web Worker)
│   └── @codetime/compiler — VM + Debugger runs here
│       (off the main thread; UI stays responsive)
│
├── CodeEditor (Monaco Editor)
│   ├── Custom Monarch tokenizer for CodeTime syntax
│   ├── Line decoration for current step highlighting
│   └── Error markers from semantic analyzer
│
├── DebugControls — Run / Pause / Step / Step Back / Restart / End
├── VariablesPanel — Displays current frame locals + globals
├── CallStackPanel — Function call hierarchy
├── TimelinePanel — Clickable execution history
└── MemoryPanel — Stack frame visualization
```

### Worker Protocol

Messages sent to the worker:
- `{ type: 'RUN', source: string }` — run without debug
- `{ type: 'DEBUG', source: string }` — run with full history capture
- `{ type: 'STEP_FORWARD' }` — advance one step
- `{ type: 'STEP_BACKWARD' }` — go back one step
- `{ type: 'GOTO', stepIndex: number }` — jump to step
- `{ type: 'RESTART' }` — go to step 0

Messages received from the worker:
- `{ type: 'SNAPSHOT', snapshot: ExecutionSnapshot }` — state update
- `{ type: 'OUTPUT', text: string }` — print output
- `{ type: 'ERROR', error: CompileError | RuntimeError }` — error event
- `{ type: 'DONE', totalSteps: number }` — execution complete

---

## Security Model

- The VM has no I/O primitives beyond `print` (which writes to a string buffer)
- No filesystem, network, process, or OS access
- In the browser: the VM runs in a Web Worker (sandboxed by the browser security model)
- In Node.js CLI: the VM runs in the same process but is a pure computation engine with no native bindings

---

## Known Limitations

1. **Memory for very long executions**: Full snapshots per step. A program that runs 100,000 steps may use significant memory. Mitigation: checkpoint every N steps + replay.
2. **No garbage collection**: Values are never freed during execution in the current VM design.
3. **Single-threaded**: The language has no concurrency primitives.
4. **No module system**: No `import` / `export`. Planned for v2.

---

## Future Improvements

- [ ] Module system with `import`
- [ ] Checkpoint-based time-travel for very long executions
- [ ] Type annotations (optional, for tooling)
- [ ] Tail-call optimization
- [ ] REPL
- [ ] Language Server Protocol support for IDE integration beyond Monaco
