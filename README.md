# CodeTime

> A programming language with a visual time-travel debugger.

CodeTime is a complete, from-scratch programming language and browser-based IDE. It features a full compiler pipeline — lexer → parser → AST → semantic analysis → bytecode compiler → virtual machine — paired with a time-travel debugger that lets you step forward and backward through any program's execution history.

Built as a serious portfolio project demonstrating real compiler engineering, not an AI wrapper or toy demo.

---

## Features

- **Real compiler pipeline** — Every stage (lexer, parser, semantic analyzer, bytecode compiler, VM) is fully implemented and independently testable
- **Time-travel debugging** — Step forward and backward through execution; inspect variables and call stack at any historical point
- **Browser IDE** — Monaco-based editor with CodeTime syntax highlighting, source-line highlighting, interactive timeline, variable inspector, and call stack panel
- **CLI** — `codetime run`, `codetime debug`, `codetime tokens`, `codetime ast`, `codetime compile`
- **Zero AI dependency** — The compiler and debugger are pure algorithms

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
git clone https://github.com/YOUR_USERNAME/codetime.git
cd codetime
npm install
npm run build
```

### Run a program

```bash
# Run the hello world example
node packages/cli/dist/index.js run examples/hello.ct

# See the token stream
node packages/cli/dist/index.js tokens examples/fibonacci.ct

# See the AST
node packages/cli/dist/index.js ast examples/fibonacci.ct
```

### Start the IDE

```bash
cd packages/ide
npm run dev
# Open http://localhost:5173
```

---

## The Language

CodeTime is a dynamically-typed language with:

- Variables (`let`)
- Functions (`fn`) with closures and recursion
- Control flow (`if`/`else`, `while`, `for`/`in`, `break`, `continue`)
- Arrays and objects
- First-class functions
- Lexical scoping
- Built-in `print`

```codetime
fn fibonacci(n) {
    if n <= 1 { return n }
    return fibonacci(n - 1) + fibonacci(n - 2)
}

let i = 0
while i <= 10 {
    print(fibonacci(i))
    i += 1
}
```

Full language specification: [`docs/LANGUAGE_SPEC.md`](docs/LANGUAGE_SPEC.md)

---

## Time-Travel Debugging

The debugger records a complete snapshot of the VM state after every instruction. You can:

- **Step forward** — advance one instruction
- **Step backward** — restore the previous state (O(1) — no replay)
- **Jump to any step** — click any point in the timeline
- **Inspect variables** at any historical step
- **Inspect the call stack** at any historical step
- **See source highlighting** — the current instruction's source line is highlighted

### Strategy: Full Snapshot

After each instruction, the debugger stores a deep copy of:
- All local variables in all call frames
- The global variable table
- The operand stack
- The instruction pointer
- The source location
- Accumulated output

Backward stepping is O(1) because we read directly from the snapshot array — no re-execution. The tradeoff is memory: see [DEBUGGER.md](docs/DEBUGGER.md) for analysis.

---

## Architecture

```
Source Code
    │
    ▼ Lexer (token.ts / lexer.ts)
Token[]
    │
    ▼ Parser (parser.ts — Pratt parsing)
AST (Program)
    │
    ▼ SemanticAnalyzer (semantic.ts)
Annotated AST + scope table
    │
    ▼ BytecodeCompiler (codegen.ts)
Chunk (bytecode + constant pool + source map)
    │
    ▼ VM (vm.ts — stack-based interpreter)
Execution + snapshots
    │
    ▼ Debugger (debugger.ts)
ExecutionSnapshot[]
    │
    ▼ IDE (React / Monaco / Web Worker)
Visual debugger
```

Full architecture document: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Project Structure

```
codetime/
├── packages/
│   ├── compiler/      Language engine (pure TS, no deps)
│   │   ├── src/
│   │   │   ├── lexer/     Tokenizer
│   │   │   ├── parser/    Recursive-descent + Pratt parser
│   │   │   ├── ast/       AST node types and printer
│   │   │   ├── semantic/  Scope analysis and type checking
│   │   │   ├── codegen/   Bytecode compiler
│   │   │   ├── vm/        Stack-based virtual machine
│   │   │   └── debugger/  Time-travel state management
│   │   └── tests/         Vitest test suite
│   ├── cli/           Node.js CLI (codetime run / debug / tokens / ast)
│   └── ide/           React + Vite browser IDE
├── examples/          Example .ct programs
└── docs/              Language spec, architecture, debugger docs
```

---

## Development

### Run tests

```bash
# All packages
npm test

# Compiler tests only
cd packages/compiler && npx vitest run --reporter=verbose
```

### Build

```bash
npm run build
```

---

## Development Progress

| Day | Work |
|-----|------|
| Day 1 | Architecture, language spec, lexer, AST, initial tests |
| Day 2 | Complete parser (Pratt parsing), semantic analysis |
| Day 3 | Bytecode compiler, VM, CLI |
| Day 4 | Time-travel debugger |
| Day 5 | Browser IDE (Monaco, timeline, panels) |
| Day 6 | Testing, benchmarks, documentation, release |

---

## Documentation

- [`docs/LANGUAGE_SPEC.md`](docs/LANGUAGE_SPEC.md) — Full language specification with grammar
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Compiler and VM design
- [`docs/DEBUGGER.md`](docs/DEBUGGER.md) — Time-travel debugger implementation
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — Development guide

---

## License

MIT — see [LICENSE](LICENSE)
