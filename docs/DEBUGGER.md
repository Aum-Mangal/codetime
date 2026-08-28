# CodeTime Time-Travel Debugger Architecture

## Overview

The central architectural highlight of **CodeTime** is its native **Time-Travel Debugger**. Unlike traditional debuggers (gdb, lldb, VS Code Debugger) which only allow forward step execution, CodeTime captures a discrete step history during VM execution, enabling $O(1)$ bidirectional time travel (`stepForward`, `stepBackward`, `gotoStep`, `restart`, `continueToBreakpoint`).

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

- **$O(1)$ State Restoration**: Jump to any step index ($0 \le k < N$) in $0\text{ ms}$ without re-executing bytecode from step 0.
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
