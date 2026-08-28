# CodeTime

> A complete programming language with a visual time-travel debugger.

CodeTime is a full-featured, from-scratch programming language and web-based IDE built in TypeScript. It features a complete compiler pipeline — **Lexer → Parser → AST → Semantic Analyzer → Bytecode Compiler → Virtual Machine** — paired with an $O(1)$ **Time-Travel Debugger** that allows stepping forward and backward through any program's execution history.

Built as a computer-science and software-engineering portfolio project demonstrating real compiler design, VM runtime execution, state snapshotting, and web UI integration.

---

## Features

- **Real Compiler Pipeline** — Pure TypeScript implementation of lexing, Pratt expression parsing, static semantic scope analysis, bytecode compilation, and stack-based virtual machine runtime.
- **Visual Time-Travel Debugger** — $O(1)$ bidirectional time travel (`stepForward`, `stepBackward`, `stepOver`, `continueToBreakpoint`, `gotoStep`, `restart`). Inspect local/global variables, call stack frames, and VM operand stack at any historical execution point.
- **Browser IDE (`packages/ide`)** — Monaco Editor integration with custom Monarch syntax highlighting, line highlight decorations, Web Worker compiler thread, scrubbable execution timeline, variables inspector, call stack panel, and console output.
- **Command-Line Interface (`packages/cli`)** — `codetime run`, `codetime tokens`, `codetime ast`, `codetime compile`, and `codetime eval`.
- **Comprehensive Verification** — 222 passing unit & integration tests across 6 test suites.
- **Zero External AI Wrappers** — Pure computer science algorithms, AST traversals, closures, upvalues, and bytecode execution.

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Build & Run Tests

```bash
# Clone repository
git clone https://github.com/Saran/codetime.git
cd codetime

# Install dependencies and build monorepo packages
npm install
npm run build

# Run unit and E2E test suites (222 tests passing)
npm test

# Run benchmarks
npm run bench
```

### CLI Usage

```bash
# Execute CodeTime programs
node packages/cli/dist/index.js run examples/fibonacci.ct

# Inspect token stream
node packages/cli/dist/index.js tokens examples/hello.ct

# Inspect AST (Abstract Syntax Tree)
node packages/cli/dist/index.js ast examples/hello.ct

# Disassemble bytecode
node packages/cli/dist/index.js compile examples/fibonacci.ct

# Evaluate inline code snippet
node packages/cli/dist/index.js eval "let a = 10; let b = 20; print(a + b)"
```

### Launch Visual Time-Travel IDE

```bash
cd packages/ide
npm run dev
# Open http://localhost:5173
```

---

## Language Features

CodeTime supports:
- Variables (`let`) with lexical block scoping and shadowing
- First-class functions (`fn`), recursive functions, lambdas (`(x) => x * 2`), closures, upvalues
- Control flow (`if`/`elif`/`else`, `while`, `for`/`in`, `break`, `continue`)
- Object literals (`{ key: value }`), array literals (`[1, 2, 3]`), properties (`.length`, `.push()`, `.pop()`)
- Custom `struct` declarations
- Built-in functions (`print`, `len`, `typeof`, `int`, `float`, `str`, `bool`)

```codetime
fn fibonacci(n) {
    if n <= 1 { return n }
    return fibonacci(n - 1) + fibonacci(n - 2)
}

let i = 0
while i <= 8 {
    print("fib(" + str(i) + ") = " + str(fibonacci(i)))
    i += 1
}
```

Full language tutorial & specification: [`docs/TUTORIAL.md`](docs/TUTORIAL.md) and [`docs/LANGUAGE_SPEC.md`](docs/LANGUAGE_SPEC.md).

---

## Time-Travel Debugging Engine

The debugger instrumented VM records a lightweight snapshot of the VM state after every byte-instruction:

```
                              ┌───────────────────────────┐
                              │    Source Code (.ct)      │
                              └─────────────┬─────────────┘
                                            │
                                  Lexer & Pratt Parser
                                            │
                                            ▼
                              ┌───────────────────────────┐
                              │      Bytecode Chunk       │
                              └─────────────┬─────────────┘
                                            │
                                  Instrumented VM Engine
                                            │
             ┌──────────────────────────────┼──────────────────────────────┐
             │                              │                              │
             ▼                              ▼                              ▼
  ┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
  │   Snapshot #0     │ ◄──────► │   Snapshot #1     │ ◄──────► │   Snapshot #N     │
  │  (x=10, y=undef)  │          │    (x=10, y=20)   │          │  (x=10, y=20,...) │
  └───────────────────┘          └───────────────────┘          └───────────────────┘
```

Detailed technical analysis: [`docs/DEBUGGER.md`](docs/DEBUGGER.md).

---

## Performance Benchmarks

Run benchmarks locally: `npm run bench`

| Stage / Component | Operation Count | Throughput (ops/sec) |
|---|---|---|
| Lexer Tokenization | 2,000 | **27,000+ ops/sec** |
| Parser AST Generation | 2,000 | **12,000+ ops/sec** |
| Semantic Analyzer | 2,000 | **164,000+ ops/sec** |
| Bytecode Compiler | 2,000 | **93,000+ ops/sec** |
| VM Execution (Full Programs) | 1,000 | **6,500+ runs/sec** |
| Time-Travel Debugger Snapshot Recording | 500 | **140,000+ steps/sec** |

---

## Monorepo Architecture

```
codetime/
├── packages/
│   ├── compiler/      Language compiler, VM engine & Debugger (pure TS, zero runtime deps)
│   │   ├── src/
│   │   │   ├── lexer/     Tokenization engine
│   │   │   ├── parser/    Recursive-descent & Pratt precedence parser
│   │   │   ├── ast/       AST nodes & printer
│   │   │   ├── semantic/  Scope analysis & type checking
│   │   │   ├── codegen/   Bytecode compiler & disassembler
│   │   │   ├── vm/        Stack-based Virtual Machine & call frames
│   │   │   └── debugger/  Time-travel execution engine & snapshotting
│   │   ├── tests/         Vitest unit & integration test suites (222 tests)
│   │   └── benchmarks/    Performance benchmark suite
│   ├── cli/           Node.js CLI executable tool (codetime)
│   └── ide/           React + Vite + Monaco + Web Worker Visual Time-Travel IDE
├── examples/          Example .ct programs
├── docs/              Language spec, architecture, debugger design, and tutorial docs
└── .github/workflows/ CI workflow for GitHub Actions
```

---

## Multi-Day Development Progression

| Day | Phase | Deliverables |
|---|---|---|
| **Day 1** | Foundation | Architecture doc, language specification, lexer, AST hierarchy, initial parser, initial tests |
| **Day 2** | Parser & Semantics | Complete Pratt parser, scope analyzer, function arity checks, control flow validation, 156 tests |
| **Day 3** | Execution Engine & CLI | Opcode set, bytecode compiler, stack VM with closures & call frames, CodeTime CLI tool, 190 tests |
| **Day 4** | Time-Travel Debugger | State snapshotting, $O(1)$ reverse execution, stepOver, breakpoints, call stack inspection, 222 tests |
| **Day 5** | Visual IDE | React + Monaco Editor with Monarch grammar, Web Worker background compiler, interactive timeline UI |
| **Day 6** | Release & CI | E2E integration tests, performance benchmarks suite, docs (`DEBUGGER.md`, `TUTORIAL.md`), GitHub Actions CI, v1.0.0 |

---

## Documentation

- [`docs/LANGUAGE_SPEC.md`](docs/LANGUAGE_SPEC.md) — Formal language specification and EBNF grammar
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Compiler architecture and VM bytecode design
- [`docs/DEBUGGER.md`](docs/DEBUGGER.md) — Time-travel debugger implementation and $O(1)$ state restoration
- [`docs/TUTORIAL.md`](docs/TUTORIAL.md) — Language tutorial, built-in functions, CLI & IDE guide

---

## License

MIT — see [LICENSE](LICENSE)
