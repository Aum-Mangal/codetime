# CodeTime

> **A modern programming language with an $O(1)$ bidirectional time-travel debugger and interactive browser IDE.**

[![CI](https://github.com/Aum-Mangal/codetime/actions/workflows/ci.yml/badge.svg)](https://github.com/Aum-Mangal/codetime/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/Aum-Mangal/codetime/actions/workflows/deploy.yml/badge.svg)](https://github.com/Aum-Mangal/codetime/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen)](https://aum-mangal.github.io/codetime/)
[![Language](https://img.shields.io/badge/language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Overview

**CodeTime** is a complete, custom programming language designed from the ground up to make debugging intuitive, visual, and non-destructive. Traditional debuggers only allow forward execution—if you step past a critical bug or mutate state accidentally, you must restart from the beginning. CodeTime solves this with an integrated **$O(1)$ Time-Travel Debugger Engine** that captures deterministic state snapshots after every bytecode instruction, enabling instant reverse execution, historical state inspection, and scrubbable timeline navigation.

The project is structured as a production-grade TypeScript monorepo featuring a full compiler pipeline, a bytecode virtual machine, a command-line interface (CLI), and a modern browser-based IDE powered by Monaco Editor and Web Workers.

🌐 **Try the Live Web IDE:** [https://aum-mangal.github.io/codetime/](https://aum-mangal.github.io/codetime/)

---

## ✨ Key Features

- **Full Compiler Pipeline** — Pure TypeScript implementation with zero runtime dependencies:
  - **Lexer** with precise source coordinate tracking (line/column spans).
  - **Pratt Precedence Parser** for complex mathematical, logical, and member expressions.
  - **Semantic Analyzer** with lexical scoping, variable declaration validation, and shadowing checks.
  - **Bytecode Compiler** generating optimized bytecode chunks and symbol tables.
  - **Stack Virtual Machine** executing bytecode instructions with call frames, closures, and runtime safety.
- **$O(1)$ Time-Travel Debugging** — Step backward and forward across time:
  - `stepForward` / `stepBackward` — Move one bytecode instruction in either direction.
  - `stepOver` — Step over functions while tracking intermediate state.
  - `continueToBreakpoint` — Run forward or rewind directly to any line breakpoint.
  - `gotoStep` — Jump to any exact execution tick in $O(1)$ constant time.
  - **Full Historical Inspection** — Inspect local/global variables, call stacks, and operand stacks at any past state.
- **Visual Browser IDE (`packages/ide`)**:
  - Full **Monaco Editor** integration with custom syntax highlighting and theme.
  - Dedicated **Web Worker** execution thread so the UI remains 60fps responsive even during long computations.
  - **Interactive Execution Timeline** with scrubbing slider and step-by-step navigation.
  - Live inspection panels for **Variables**, **Call Stack**, and **Operand Stack**.
  - Integrated Console with streaming output.
- **Developer CLI (`packages/cli`)**:
  - `codetime run <file>` — Execute CodeTime source files.
  - `codetime tokens <file>` — Inspect lexer token stream.
  - `codetime ast <file>` — Visualize the Abstract Syntax Tree.
  - `codetime compile <file>` — Disassemble bytecode instructions.
  - `codetime eval "<code>"` — Evaluate expressions interactively.
- **Zero External AI Wrappers** — 100% pure computer science algorithms, AST traversals, lexical scoping, closures, and bytecode execution.
- **Comprehensive Quality Assurance** — 228 automated unit and integration tests passing with 100% success rate across Linux and Windows.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.0.0
- **npm** ≥ 9.0.0

### Installation & Build

```bash
# Clone repository
git clone https://github.com/Aum-Mangal/codetime.git
cd codetime

# Install dependencies and build all monorepo packages
npm install
npm run build

# Run full test suite (228 tests across 7 test suites)
npm test

# Run performance benchmarks
npm run bench
```

### Running via CLI

```bash
# Execute sample programs
node packages/cli/dist/index.js run examples/fibonacci.ct

# Inspect token stream
node packages/cli/dist/index.js tokens examples/hello.ct

# Visualize Abstract Syntax Tree (AST)
node packages/cli/dist/index.js ast examples/hello.ct

# Disassemble bytecode instructions
node packages/cli/dist/index.js compile examples/fibonacci.ct

# Inline evaluation
node packages/cli/dist/index.js eval "let a = 15; let b = 25; print(a * b)"
```

### Launching the Web IDE Locally

```bash
cd packages/ide
npm run dev
# Open http://localhost:5173
```

---

## 💻 Language Syntax & Capabilities

CodeTime combines modern, expressive syntax with safe semantics:

- **Variables:** Lexically scoped `let` bindings with block scoping.
- **Functions & Closures:** First-class functions (`fn`), recursive functions, lambdas (`(x) => x * 2`), and closures with captured upvalues.
- **Control Flow:** `if` / `elif` / `else`, `while`, `for ... in`, `break`, and `continue`.
- **Data Structures:** First-class dynamic arrays (`[1, 2, 3]`), key-value objects (`{ key: value }`), and custom `struct` definitions.
- **Built-in Functions:** `print`, `len`, `typeof`, `int`, `float`, `str`, `bool`.

```codetime
// Fibonacci sequence in CodeTime
fn fibonacci(n) {
    if n <= 1 {
        return n
    }
    return fibonacci(n - 1) + fibonacci(n - 2)
}

let i = 0
while i <= 8 {
    print("fib(" + str(i) + ") = " + str(fibonacci(i)))
    i += 1
}
```

Detailed language specifications and syntax reference:
- [`docs/LANGUAGE_SPEC.md`](docs/LANGUAGE_SPEC.md) — Formal grammar & language specification
- [`docs/TUTORIAL.md`](docs/TUTORIAL.md) — Step-by-step language tutorial and examples

---

## ⏱️ How the Time-Travel Engine Works

The CodeTime VM executes compiled bytecode chunks on a virtual stack machine. In debug mode, an instrumentation layer captures a lightweight differential snapshot after each instruction:

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
│  (i=0, fib=undef) │          │    (i=1, fib=1)   │          │   (i=8, fib=21)   │
└───────────────────┘          └───────────────────┘          └───────────────────┘
```

Because all state transitions (IP, operand stack, call stack, variables) are recorded in an indexed array of immutable snapshots:
- Stepping **forward** advances the snapshot index ($O(1)$).
- Stepping **backward** decrements the snapshot index ($O(1)$).
- Jumping to **any tick** on the timeline is an instantaneous array lookup ($O(1)$).

Full architectural breakdown: [`docs/DEBUGGER.md`](docs/DEBUGGER.md).

---

## ⚡ Performance Benchmarks

Run benchmarks locally using `npm run bench`:

| Pipeline Stage / Component | Sample Size | Throughput |
|---|---|---|
| **Lexer Tokenization** | 2,000 runs | **25,000+ ops/sec** |
| **Parser AST Generation** | 2,000 runs | **11,500+ ops/sec** |
| **Semantic Scope Analysis** | 2,000 runs | **150,000+ ops/sec** |
| **Bytecode Compilation** | 2,000 runs | **95,000+ ops/sec** |
| **VM Execution (Full Program)** | 1,000 runs | **7,500+ runs/sec** |
| **Time-Travel Snapshot Recording** | 100 runs | **150,000+ steps/sec** |

---

## 📁 Repository Architecture

```
codetime/
├── packages/
│   ├── compiler/         Language compiler, VM engine & Debugger (pure TypeScript)
│   │   ├── src/
│   │   │   ├── lexer/       Tokenization & coordinate tracking
│   │   │   ├── parser/      Recursive-descent & Pratt precedence parser
│   │   │   ├── ast/         AST node definitions & AST visualizer
│   │   │   ├── semantic/    Scope hierarchy & semantic verification
│   │   │   ├── codegen/     Bytecode compiler & disassembler
│   │   │   ├── vm/          Stack Virtual Machine runtime
│   │   │   └── debugger/    Time-travel snapshot recorder & navigation engine
│   │   ├── tests/           Vitest unit & integration test suites (228 tests)
│   │   └── benchmarks/      Throughput benchmark suite
│   ├── cli/              Node.js CLI executable tool (codetime)
│   └── ide/              React + Vite + Monaco + Web Worker Visual Time-Travel IDE
├── examples/             Curated sample programs (.ct)
├── docs/                 Language specifications, architecture diagrams, and debugger docs
└── .github/workflows/    CI test workflow and automated GitHub Pages deployment
```

---

## 📚 Documentation Links

- **Language Specification:** [`docs/LANGUAGE_SPEC.md`](docs/LANGUAGE_SPEC.md)
- **Compiler Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Debugger Design:** [`docs/DEBUGGER.md`](docs/DEBUGGER.md)
- **Language Tutorial:** [`docs/TUTORIAL.md`](docs/TUTORIAL.md)

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
