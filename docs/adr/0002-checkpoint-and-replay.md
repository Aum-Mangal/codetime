# ADR 0002: Time travel by checkpoint and replay

- Status: accepted
- Date: 2026-10-28

## Context

Most instructions destroy information (an assignment overwrites the old value), so a VM cannot simply run backward. Version 1.1 stored a full snapshot of the program state after every instruction. Seeking was O(1), but memory grew with steps × state size: a 90,000-step loop that grows an array took 12.6 s and 3.1 GB, and the IDE posted the whole run to the UI thread.

## Options considered

1. **Snapshot every step** (v1.1): simple, O(1) seek, O(steps × state) memory. Not usable beyond small programs.
2. **Undo log**: record the old value of every write and undo backward. Compact, but every opcode and native function needs an exact inverse, and an IO-free VM does not need that complexity.
3. **Checkpoint and replay** (the approach of rr and WinDbg TTD): keep a full state copy every K steps and a small per-step event log. To show step n, restore the nearest checkpoint at or before n and re-execute the gap. Correct because the VM is deterministic (no clock, randomness or input).

## Decision

Option 3.

- `TraceLog` keeps 20 bytes per step in typed arrays: line, column, call depth, event kind, the variable written (interned), output length and a line-start flag.
- A checkpoint is an identity-preserving deep copy of the VM state (`StateCopier`), so aliasing, closures and open upvalues survive restore. One is taken every K = 1,000 steps. When there are more than 200, every other one is dropped and K doubles, so memory stays bounded for long runs.
- Recording stops at 1,000,000 steps and marks the recording as truncated, rather than cutting it off silently.
- Navigation that only needs lines, depths or writes (step over/out in both directions, breakpoints, "last change of x") scans the event log. Only the destination step is replayed.

## Consequences

- Memory is O(20 B × steps + checkpoints × state). The 2,000-push loop retains 0.3 MB instead of 310.6 MB with a copy per step (`npm run bench:replay`).
- Seeking costs at most K instructions of replay: a p99 of about 2 to 5 ms in the benchmarks.
- Replay exactness is tested at every step against a recording with no checkpoints (`debugger.test.ts`), and at random steps on random programs (`fuzz.test.ts`).
- The VM must stay deterministic. Adding a clock, randomness or input would require logging those values in the trace.
