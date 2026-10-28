# ADR 0001: One VM for running and debugging

- Status: accepted
- Date: 2026-10-28

## Context

Version 1.1 had two interpreters. The CLI used `VM`. The debugger had its own copy of the opcode loop and its own table of built-in functions, about 380 lines that had to be kept in sync by hand. They drifted: a program could print one thing under `codetime run` and another in the IDE, and fixes made to one loop were missing from the other. The pipeline (lex, parse, analyze, compile) was also repeated in four places.

## Decision

There is exactly one execution engine.

- `compile(source)` in `pipeline.ts` is the only path from source to bytecode. The VM, the debugger, the CLI and the IDE worker all call it.
- `VM` is resumable: `load(chunk)`, then `step()` runs one instruction and `execute(budget)` runs many. `interpret()` is `compile` + `load` + `execute`.
- Built-in functions live only in `vm/natives.ts`. Methods such as `arr.push` receive their receiver through a call context, not through debugger-specific code.
- The debugger never interprets an opcode. Its `StepTracer` peeks at the next instruction, calls `vm.step()`, and classifies what happened.

## Consequences

- The debugger and the CLI behave identically by construction. A property-based differential test (`fuzz.test.ts`) checks this on random programs: same output and same error, at every step.
- A language change is made once.
- Recording is about 30 times slower than a plain run, because the VM is driven one instruction at a time from outside and each step is classified (see the README benchmarks). A plain `Run` in the IDE still records, so the user can travel through it afterward; the CLI does not pay this cost.
