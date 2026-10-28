# CodeTime Time-Travel Debugger

## Overview

Most everyday debugging only goes forward: step past the interesting moment and you start again. Reverse debugging exists in mature tools (gdb's `record` / `reverse-step`, Mozilla's rr, WinDbg Time Travel Debugging) but usually needs special setup. CodeTime builds it into the language. The debugger records a run once, then lets you move through it in both directions:

- by instruction or by source line (step into / over / out, and the reverse of each)
- to the previous or next breakpoint hit (conditional breakpoints included)
- to the step that last (or next) wrote a variable: "who changed `hi`?"

The design is **record and replay with checkpoints**, the same family as rr. The debugger runs the program on the same `VM` class the CLI uses. It never interprets bytecode itself, so the CLI and the debugger cannot disagree about what a program does.

```
 source ──compile()──► bytecode ──► VM.step() ◄──────────── StepTracer (classifies each step)
                                       │                          │
                       every K steps   │                          │ every step, 20 bytes
                                       ▼                          ▼
                              ┌─────────────────┐       ┌──────────────────────┐
                              │  Checkpoints    │       │  TraceLog            │
                              │  (full VM state)│       │  (typed arrays)      │
                              └────────┬────────┘       └──────────┬───────────┘
                                       │                           │
           gotoStep(n): restore nearest checkpoint,     navigation queries
           replay ≤ K steps on a scratch VM             (lines, depth, writes)
```

---

## 1. Recording

`TimeTravelDebugger.record()` (`packages/compiler/src/debugger/debugger.ts`) compiles the source with the shared `compile()` pipeline, loads it into a `VM`, and calls `vm.step()` until the program halts, fails, or reaches `maxSteps`. For every step it appends one row to the **trace** (`trace.ts`), stored column-wise in typed arrays:

| Column | Type | Meaning |
|---|---|---|
| `line`, `column` | `Int32Array` | Source position of the executed instruction |
| `depth` | `Uint16Array` | Call frames while it ran (1 = top-level script) |
| `kind` | `Uint8Array` | `step`, `assign`, `call`, `return`, `print`, `loop`, `branch`, `error`, `halt` |
| `target` | `Int32Array` | Interned name of the variable the step wrote, or -1 |
| `outputLength` | `Uint32Array` | Lines printed so far (the output itself is stored once) |
| `lineStart` | `Uint8Array` | 1 if this step starts a source line in its frame |

That is 20 bytes per step. The trace does not hold variable values.

Every `checkpointInterval` steps (default 1,000) the recorder stores a **checkpoint**: a deep copy of the whole VM state (`snapshot.ts`). The copy preserves identity, so:

- two variables that alias one array still alias one copy;
- a closure and the frame owning its open upvalue still share that upvalue;
- a bound method like `arr.push` follows its array into the copy;
- cycles terminate.

Functions, struct types and builtins are immutable and are shared, not copied.

Memory is bounded twice:
- When there are more than `maxCheckpoints` (default 200), every other checkpoint is dropped and the interval doubles. Checkpoint memory stays fixed while seeks get only gradually slower.
- When `maxSteps` (default 1,000,000) is reached, the recording is marked `truncated` with a reason. Previously it was cut off silently.

**Writes through containers count as writes.** `arr[0] = 1`, `obj.x = 2`, `arr.push(3)` and `arr.pop()` are attributed to the variable that holds the array or object (current frame's locals, then captured variables, then globals, by identity), so watchpoints work for them too.

## 2. Replay (seeking)

To show step *n*, a `Replayer` restores the latest checkpoint **before** *n* into its own VM and re-executes the remaining steps (at most one interval). The VM has no clock, randomness or input, so replay reproduces the original state exactly. A test checks this: every step of each example program compares equal with a checkpoint every 3 steps and with no checkpoints at all.

The replayer remembers its position, so stepping forward is one instruction, and stepping back is one restore plus at most K instructions. The debugger keeps two replayers: the **cursor** for the displayed step, and a **scratch** one for queries (timeline windows, breakpoint conditions) that should not move the cursor.

| | Snapshot per step (v1.1) | Checkpoint + replay (now) |
|---|---|---|
| Recording memory | O(T × S) | O(20·T + C × S), C ≤ 200 |
| Seek to any step | O(1) | O(K) instructions |
| Step forward | O(1) | O(1) |

*T = steps, S = program state size, K = checkpoint interval, C = checkpoints kept.*

### Measured

From `npm run bench:replay`. The program is a loop that pushes N items into an array.

| N | Steps | v1.1 record | v1.1 memory | Now: record | Now: retained heap | Seek p99 |
|---:|---:|---:|---:|---:|---:|---:|
| 500 | 9,016 | 146 ms | 41 MB | 19 ms | 0.5 MB | 1.8 ms |
| 2,000 | 36,016 | 1.75 s | 524 MB | 47 ms | 0.4 MB | 1.9 ms |
| 5,000 | 90,016 | 12.6 s | 3.1 GB | 89 ms | 1.9 MB | 1.6 ms |
| 20,000 | 360,016 | (over the 100k-step cap) | | 270 ms | 14.1 MB | 5.3 ms |

Numbers are from one machine (Node 22, Windows 11) and vary between runs; the benchmark prints them each time.

---

## 3. Variable names from debug info

Stack slots are reused: two sibling blocks can both put a local in slot 3. The compiler therefore records a live range for every local in `Chunk.debug.locals` (`{ name, slot, depth, startIp, endIp }`), similar in spirit to DWARF location lists. A local is shown only while the frame's instruction pointer is inside its range, so `first` and `second` in sibling blocks each appear under their own name and only while in scope. Captured variables are listed with a `captured` tag, named from `Chunk.debug.upvalueNames`. Compiler temporaries (`$iterable`, `$index`) stay hidden.

---

## 4. Navigation

All of these are scans over the trace columns. Only the step finally shown is replayed.

| Command | Lands on |
|---|---|
| `stepForward` / `stepBackward` | the next / previous instruction |
| `stepInto` | the next line start, entering calls |
| `stepOver` | the next line start at the same or a shallower call depth |
| `stepOut` | the first step after the current function returns |
| `reverseStepInto` | the previous line start, entering calls backward (the callee's last line) |
| `reverseStepOver` | the previous line start at the same or a shallower depth |
| `reverseStepOut` | the start of the line that called the current function |
| `continueToBreakpoint` / `reverseContinue` | the next / previous line start on a breakpoint whose condition holds |
| `findChange(name, 'backward' \| 'forward')` | the previous / next step that wrote `name` |

A **line start** is a step whose line differs from its frame's previous step, the first step of a newly entered frame, or the step after a loop jumps back. Each iteration of `while i < 3 { i += 1 }` is therefore a separate stop, even on one line. Steps inside calls made from a line do not split that line, which is what lets step-over skip them.

**Conditional breakpoints** (`setBreakpoint(line, 'i == 3')`) are compiled when set, so a syntax error is reported immediately. At a candidate step, the condition runs on a separate VM, with a 100k-instruction budget, against *copies* of the visible variables. A condition with side effects (`arr.pop() > 0`) therefore cannot change the recording. A condition that fails at runtime counts as true, so the problem is visible.

---

## 5. API

```typescript
const dbg = TimeTravelDebugger.fromSource(code, {
  maxSteps: 1_000_000,        // optional
  checkpointInterval: 1_000,  // optional
  maxCheckpoints: 200,        // optional
});

// Navigation (each returns DebuggerState)
dbg.stepForward();  dbg.stepBackward();
dbg.stepInto();     dbg.stepOver();         dbg.stepOut();
dbg.reverseStepInto(); dbg.reverseStepOver(); dbg.reverseStepOut();
dbg.continueToBreakpoint(); dbg.reverseContinue();
dbg.gotoStep(n); dbg.restart(); dbg.gotoEnd();
dbg.navigate('reverseStepOver');            // same, by name

// Breakpoints and watchpoints
dbg.setBreakpoint(12, 'lo == hi');
dbg.findChange('hi', 'backward');           // step index, or -1

// Inspection
dbg.getCurrentState();                      // DebuggerState for the current step
dbg.snapshotAt(n);                          // state at any step, cursor unchanged
dbg.getEvents(from, to);                    // timeline window
dbg.getLineHits();                          // Map<line, times started>
dbg.getStats();                             // steps, checkpoints, trace bytes, truncation
```

---

## 6. In the IDE

The recording lives in a Web Worker (`packages/ide/src/worker/compiler.worker.ts`). The message types are defined once in `worker/protocol.ts` and shared with the UI. For each step, the worker sends:
- the current `DebuggerState`;
- about 120 timeline events around it;
- the recording stats.

It never sends the whole run, so message size does not grow with program length. If a recording does not answer within 15 seconds, the UI terminates the worker, starts a new one and re-sends the breakpoints.

Keyboard: F5 debug / continue, Shift+F5 reverse continue, F10 / Shift+F10 step over forward / backward, F11 step into, Shift+F11 step out, Alt+← / Alt+→ by instruction. Right-click a breakpoint to give it a condition. Hover a variable and press the history icon to jump to the step that last changed it.
