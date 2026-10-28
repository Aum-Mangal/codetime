# ADR 0003: Variable names from debug info with live ranges

- Status: accepted
- Date: 2026-10-28

## Context

Locals live in stack slots, and the compiler reuses a slot once its block ends. Version 1.1 recorded one name per slot after compiling the whole function, so a reused slot showed the last name given to it: inside a `while` body the debugger could label `mid` as `value`. It also could not tell which locals existed at a given instruction.

## Decision

The compiler emits debug info per function (`Chunk.debug`), in the spirit of DWARF location lists:

- every local gets `{ name, slot, depth, startIp, endIp }`. `startIp` is recorded when the local is declared (just after its initializer) and `endIp` when its scope ends;
- captured variables get their names in `upvalueNames`.

The inspector shows a local at instruction `ip` only if `startIp <= ip <= endIp`, and the tracer names a write to slot s by the local whose range contains the instruction.

## Consequences

- Shadowed and reused slots show the right names; block locals appear and disappear with their block.
- A `let` inside a function has no store instruction (the initializer's value just stays in its slot). The tracer therefore treats the step that reaches a local's `startIp` as the write that declares it. Without this, "last change of lo" skipped `let lo = 0` and jumped to a write in an earlier call.
- Debug info is a few entries per local and is kept with the bytecode; it is not needed to run a program.
