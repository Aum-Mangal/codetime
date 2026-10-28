# Contributing to CodeTime

## Setup

Node.js 20 or 22, and Google Chrome for the browser tests.

```bash
npm install
npm run build
```

## The checks CI runs

```bash
npm run lint            # ESLint, zero warnings allowed
npm run typecheck       # all packages, including tests
npm test                # unit, regression, golden and property-based tests
npm run test:coverage   # compiler coverage, with thresholds
npm run test:golden     # every example through the built CLI
npm run test:e2e        # Playwright against the production IDE build
```

Run them before opening a pull request. CI runs the same commands on Linux and Windows with Node 20 and 22.

## Where things live

- `packages/compiler`: lexer, parser, semantic analysis, bytecode compiler, VM and the time-travel debugger. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEBUGGER.md](docs/DEBUGGER.md).
- `packages/cli`: the `codetime` command.
- `packages/ide`: the browser IDE (React, Monaco, a Web Worker for the debugger).
- `examples/`: sample programs, each with a `.expected` output file used by the golden tests.
- `docs/adr/`: architecture decision records. Add one for a change that alters how the system is built.

## Guidelines

- **A bug fix starts with a failing test.** Language and debugger bugs go in `packages/compiler/tests/regression.test.ts` or the relevant suite.
- **The debugger never interprets bytecode.** It drives `VM.step()` (see ADR 0001). If the debugger needs to know something about a step, record it in the tracer.
- **Keep the VM deterministic.** Replay depends on it (ADR 0002).
- **Numbers in docs must be measured.** Use `npm run bench` and `npm run bench:replay`, and say what machine they came from.
- **IDE styling uses the design tokens** in `packages/ide/src/index.css` (`bg-panel`, `text-fg-muted`, ...), not raw colors.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`fix(debugger): ...`, `feat(ide): ...`).
