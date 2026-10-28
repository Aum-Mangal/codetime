# Changelog

## 1.2.0 (2026-10-28)

### Language and compiler
- Fixed loop scoping: a `let` in a `for`-in body is per iteration, and `continue` in `for`-in no longer loops forever.
- `break` and `continue` close captured variables correctly.
- Compound assignment to an index (`a[i] += x`) and to a property evaluates the target once.
- Default parameters work for missing arguments without leaking `undefined`.
- `struct` declarations create real constructors; `typeof` returns the struct name.
- The parser recovers from errors and reports all of them; operator precedence follows Python (`not`, unary minus and `**`); deep nesting is a syntax error, not a stack overflow.
- Comparisons require two numbers or two strings; printing a cyclic structure no longer overflows.
- One `compile()` entry point is used by the VM, the debugger, the CLI and the IDE.

### Time-travel debugger
- Rebuilt on the real VM: record once, then replay from checkpoints (see ADR 0001 and 0002).
- Reverse step into, over and out; reverse continue; conditional breakpoints; "last change" watchpoints, including writes through `arr[i] = x` and `arr.push(x)`.
- Variable names come from debug info with live ranges (ADR 0003).
- `let` declarations inside functions are recorded as writes.
- Long runs stop at 1,000,000 steps and are marked as truncated.
- New queries: `getOverview`, `getBreakpointHits` and `lineOf`.

### IDE
- Redesigned UI, designed in Figma first. Includes a canvas run scrubber, live diagnostics, inline values, hover values, a breakpoint-condition popover, Problems and Console tabs, share links and a responsive layout.
- The editor's dark theme is applied before mount. It used to fall back to the light theme.
- Monaco is bundled locally instead of loaded from a CDN.
- A typed worker protocol, and a watchdog that replaces a stuck worker.

### CLI
- Every diagnostic is formatted with its source line. Exit codes: 1 for compile errors, 2 for runtime errors. New `--max-steps` option.

### Quality
- 326 compiler tests: property-based differential fuzzing, golden output for every example, and bytecode structure checks. 10 Playwright end-to-end tests. Coverage gate.
- CI on Linux and Windows with Node 20 and 22: lint with zero warnings, type checks, audit, CodeQL, Dependabot, actions pinned by SHA, and benchmarks published as an artifact. Pages deploys only after CI passes.

## 1.1.0 and 1.0.0

The initial releases: language, bytecode VM, CLI, a snapshot-per-step debugger and the first IDE.
