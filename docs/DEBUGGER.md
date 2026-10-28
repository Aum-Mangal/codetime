# CodeTime Time-Travel Debugger Architecture

## Overview

The central architectural highlight of **CodeTime** is its **time-travel debugger**. Most everyday debugging sessions only step forward; when you step past the interesting moment, you restart. Reverse debugging exists in mature tools (gdb's `record`/`reverse-step`, Mozilla's rr, WinDbg Time Travel Debugging) but usually needs special setup. CodeTime builds it into the language: the debugger records the program's execution once, then lets you move to any recorded step in either direction (`stepForward`, `stepBackward`, `gotoStep`, `restart`, `continueToBreakpoint`).

> **Current design and its limits.** Today each step stores a full snapshot of program state, so moving between steps is an O(1) array lookup, but recording costs grow with program state: a loop that pushes 5,000 items into an array needs about 3 GB. The planned replacement is a checkpoint + replay recorder (periodic full snapshots plus a compact per-step event log), the same design family as rr. See `ARCHITECTURE.md` -> *Known Limitations*.

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

---

## 1. Execution Snapshot Structure

At every bytecode instruction step, the debugger engine constructs a lightweight `ExecutionSnapshot`:

```typescript
export interface ExecutionSnapshot {
  stepIndex: number;          // 0-indexed discrete step number
  totalSteps: number;         // total recorded steps
  ip: number;                 // bytecode instruction pointer
  loc: SourceLocation;        // line & column in source code
  sourceLine: number;         // source line (1-indexed)
  sourceColumn: number;       // source column (1-indexed)
  stackDisplay: string[];     // formatted operand stack strings
  frames: FrameSnapshot[];    // active call stack frames
  globals: VariableSnapshot[];// global variables & values
  output: string[];           // accumulated stdout lines up to this step
  event: DebuggerEvent;       // high-level semantic event metadata
}
```

---

## 2. Frame & Variable Inspection

Each `FrameSnapshot` contains:
- `fnName`: Function name (`main`, `fibonacci`, `anonymous`).
- `loc`: Current instruction location for this call frame.
- `ip`: Instruction pointer inside frame closure chunk.
- `slots`: Base offset in the stack.
- `locals`: Array of `VariableSnapshot` `{ name, value, type, displayValue, changed }`.

Compiler local variable slot names are preserved in `FunctionValue.localNames` at compile time, matching stack indices to actual variable identifiers!

---

## 3. High-Level Semantic Event Types

The debugger maps low-level bytecode opcodes to high-level semantic events:
- `assign`: Variable declaration or mutation (`x = 10`, `arr[0] = 5`).
- `call`: Function invocation (`fibonacci(5)`).
- `return`: Function return (`return 8`).
- `print`: Console print statement (`print("hello")`).
- `loop`: Loop back instruction (`while` or `for..in` iteration).
- `branch`: Conditional jump (`if` / `else`).
- `halt`: Execution completion.
- `error`: Diagnostic error crash event.

---

## 4. Performance & Memory Optimization

- **O(1) navigation, O(state) recording**: Jumping to any recorded step is an array lookup with no re-execution. The cost is paid during recording, where each step copies globals, locals, the operand stack and the output so far.
- **Reference Sharing**: Complex heap structures (closures, native functions) share immutable references across snapshots.
- **Web Worker Isolation**: In the Visual IDE (`packages/ide`), execution snapshotting runs off the main UI thread in a dedicated Web Worker (`compiler.worker.ts`), preserving 60 FPS UI responsiveness.

---

## 5. Debugger API Reference

```typescript
const dbg = TimeTravelDebugger.fromSource(code);

// Navigation
dbg.stepForward();             // Advance 1 step
dbg.stepBackward();            // Rewind 1 step
dbg.stepOver();                // Advance to next significant event
dbg.continueToBreakpoint();    // Continue execution to next breakpoint
dbg.gotoStep(stepIndex);       // Direct jump to step index
dbg.restart();                 // Reset to step 0
dbg.gotoEnd();                 // Jump to final step

// Breakpoints
dbg.setBreakpoint(line);
dbg.removeBreakpoint(line);
dbg.toggleBreakpoint(line);

// Inspection
dbg.getCurrentState();         // Returns DebuggerState
dbg.getTimeline();             // Returns DebuggerEvent[]
dbg.getVariables();            // Returns { locals, globals }
dbg.getCallStack();            // Returns FrameSnapshot[]
```
