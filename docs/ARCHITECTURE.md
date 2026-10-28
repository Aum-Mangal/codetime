# CodeTime — Architecture Document

**Version 1.1** | Technical description of the CodeTime compiler, VM, and debugger architecture.

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

Stack-based VM. The bytecode design (opcode set, call frames, open/closed upvalues for closures) follows the clox VM from Robert Nystrom's *Crafting Interpreters*; CodeTime's additions are the record-and-replay debugger, structs, default parameters and the IDE.

### Data Structures

```
VM {
  stack: Value[]                // operand stack; locals live in their frame's slots
  frames: CallFrame[]           // call stack
  globals: Map<string, Value>
  openUpvalues: Upvalue[]       // captured variables still on the stack
  output: string[]              // printed lines
  status: 'ready' | 'running' | 'halted' | 'error'
}

CallFrame { closure: ClosureValue; ip: number; slots: number }   // slots = stack base
Upvalue   { location: number; isClosed: boolean; closed: Value } // open → stack slot, closed → own copy
```

`Upvalue.isClosed` is a separate flag because `null` is a real CodeTime value and cannot also mean "still open".

### Execution

The VM is **resumable**: `load(chunk)` prepares the main script, `execute(n)` runs up to n instructions, and `step()` runs exactly one. `run(chunk)` (used by the CLI) is `load` plus `execute(Infinity)`, guarded by an instruction budget. Errors become a `RuntimeError` with a call stack and stop the VM with `status = 'error'` instead of throwing.

Builtins are stateless functions shared by every VM (`natives.ts`). Per-call state comes in through a context: `print` writes through it, and bound methods such as `arr.push` carry their array in a `receiver` field instead of a JavaScript closure. This keeps all program state inside VM fields, which makes snapshots possible.

---

## Time-Travel Debugger

**File:** `packages/compiler/src/debugger/` (full description in [DEBUGGER.md](DEBUGGER.md))

The debugger does not interpret bytecode. It drives the VM above one `step()` at a time and stores:

- a **trace**: 20 bytes per step in typed arrays (line, column, call depth, event kind, variable written, output length, line-start flag);
- a **checkpoint**: an identity-preserving deep copy of the full VM state, every K steps (default 1,000), thinned out once there are more than 200.

To show step n it restores the nearest checkpoint before n into a scratch VM and replays the gap. Replay is exact because the VM is deterministic. Line stepping (forward and reverse), breakpoints and "last write to x" watchpoints are scans over the trace, so only the final step is replayed.

| | Before (snapshot per step) | Now (checkpoint + replay) |
|---|---|---|
| Memory | O(steps × state) | O(20 B × steps + checkpoints × state) |
| Seek | O(1) | O(K) instructions |
| 5,000-push loop (90k steps) | 12.6 s, 3.1 GB | 89 ms, 1.9 MB retained |

Variable names come from compiler debug info: each local has the instruction range in which it occupies its stack slot (`Chunk.debug.locals`), so reused slots are named correctly.

---

## Web IDE

**File:** `packages/ide/`

Built with React + Vite + TypeScript.

### Architecture

```
IDE (React)
├── Worker (Web Worker)
│   └── @codetime/compiler — compile + record + replay run here
│       (off the main thread; UI stays responsive)
│
├── Editor (Monaco)
│   ├── Custom Monarch tokenizer for CodeTime syntax
│   ├── Current-line decoration
│   └── Breakpoint glyphs (click: toggle, right-click: condition)
│
├── Header — Run / Debug, forward and reverse stepping, continue / reverse continue
├── VariablesPanel — locals (by live range), captured variables, globals, "last change" buttons
├── CallStackPanel — function call hierarchy
├── TimelinePanel — events around the current step + recording stats
└── MemoryPanel — operand stack
```

### Worker Protocol

The message types are defined once in `packages/ide/src/worker/protocol.ts` and used by both sides.

To the worker:
- `{ type: 'RECORD', source, startAt: 'start' | 'end' }`: compile and record (Debug / Run)
- `{ type: 'NAVIGATE', command }`: any `NavigationCommand` (`stepOver`, `reverseContinue`, ...)
- `{ type: 'GOTO_STEP', step }`
- `{ type: 'FIND_CHANGE', name, direction }`: jump to the previous / next write of a variable
- `{ type: 'SET_BREAKPOINTS', breakpoints }`: replace all breakpoints (`{ line, condition? }`)

From the worker:
- `{ type: 'STATE', state, timeline: { start, events }, stats, runtimeError }`: the current step, with a window of about 120 events, never the whole run
- `{ type: 'NOTICE', message }`: e.g. "'x' is not written before this step"
- `{ type: 'ERROR', error }`: compile error or failure

If a recording has not answered after 15 seconds, the UI terminates the worker, starts a fresh one and re-sends the breakpoints.

---

## Security Model

- The VM has no I/O primitives beyond `print` (which writes to a string buffer)
- No filesystem, network, process, or OS access
- In the browser: the VM runs in a Web Worker (sandboxed by the browser security model)
- In Node.js CLI: the VM runs in the same process but is a pure computation engine with no native bindings
- Objects are backed by `Map`, never plain JS objects, so programs cannot reach or pollute JavaScript prototypes
- Resource limits: an instruction budget (default 10M, `--max-steps` in the CLI) stops infinite loops, call depth is capped at 256 frames, the operand stack at 4,096 values, and the parser rejects code nested more than 200 levels deep instead of overflowing the JS stack
- The debugger's recording stops at 1,000,000 steps (marked as truncated) and keeps at most 200 checkpoints; breakpoint conditions run on a separate VM with a 100,000-instruction budget

---

## Known Limitations

1. **Very long executions**: Recording keeps 20 bytes per step, so a 1,000,000-step run needs about 20 MB of trace plus its checkpoints. Longer runs are truncated rather than recorded in full.
2. **Memory management is delegated to JavaScript**: CodeTime values are JS objects, so the host garbage collector frees unreachable values. The VM has no GC of its own and no allocation statistics.
3. **Single-threaded**: The language has no concurrency primitives.
4. **No module system**: No `import` / `export`. Planned for v2.

---

## Future Improvements

- [ ] Module system with `import`
- [ ] Type annotations (optional, for tooling)
- [ ] Tail-call optimization
- [ ] REPL
- [ ] Language Server Protocol support for IDE integration beyond Monaco
