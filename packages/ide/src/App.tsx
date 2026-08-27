import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DebuggerState, DebuggerEvent } from '@codetime/compiler';
import { Header } from './components/Header';
import { Editor } from './components/Editor';
import { VariablesPanel } from './components/VariablesPanel';
import { CallStackPanel } from './components/CallStackPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ConsolePanel } from './components/ConsolePanel';
import { ErrorPanel } from './components/ErrorPanel';

const EXAMPLES = [
  {
    name: 'hello',
    label: 'Hello World',
    code: `// Hello World in CodeTime

print("Hello, World!")
print("Welcome to CodeTime — a language with time-travel debugging.")
`,
  },
  {
    name: 'fibonacci',
    label: 'Fibonacci Sequence',
    code: `// Fibonacci sequence in CodeTime
// Demonstrates: recursion, conditionals, while loops

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
`,
  },
  {
    name: 'factorial',
    label: 'Recursive Factorial',
    code: `// Factorial in CodeTime
fn factorial(n) {
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}

let i = 0
while i <= 6 {
    print(str(i) + "! = " + str(factorial(i)))
    i += 1
}
`,
  },
  {
    name: 'arrays',
    label: 'Arrays & Mutation',
    code: `// Arrays in CodeTime
let numbers = [3, 1, 4, 1, 5, 9, 2, 6]

print("Original array:", numbers)
print("Length:", numbers.length)

let sum = 0
for n in numbers {
    sum += n
}
print("Sum:", sum)

numbers.push(10)
print("After push(10):", numbers)
`,
  },
  {
    name: 'closures',
    label: 'Closures & High-Order Functions',
    code: `// Closures in CodeTime
fn makeCounter(start) {
    let count = start
    fn increment() {
        count += 1
        return count
    }
    return increment
}

let c1 = makeCounter(0)
let c2 = makeCounter(100)

print("c1:", c1(), c1(), c1())
print("c2:", c2())
`,
  },
  {
    name: 'sorting',
    label: 'Bubble Sort Algorithm',
    code: `// Bubble Sort in CodeTime
fn bubbleSort(arr) {
    let n = arr.length
    let i = 0
    while i < n {
        let j = 0
        while j < n - i - 1 {
            if arr[j] > arr[j + 1] {
                let temp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = temp
            }
            j += 1
        }
        i += 1
    }
    return arr
}

let data = [64, 34, 25, 12, 22, 11]
print("Sorted:", bubbleSort(data))
`,
  },
  {
    name: 'buggy',
    label: 'Buggy Binary Search (Time-Travel Demo)',
    code: `// Buggy Binary Search — Time-Travel Debugger Demo
//
// This program has a subtle bug: 'hi' starts at arr.length instead of arr.length - 1!
// Step backward through history to find where mid goes out of bounds.

fn binarySearch(arr, target) {
    let lo = 0
    let hi = arr.length // BUG: should be arr.length - 1

    while lo <= hi {
        let mid = int((lo + hi) / 2)
        let value = arr[mid]

        if value == target { return mid }

        if value < target {
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return -1
}

let sorted = [1, 3, 5, 7, 9, 11]
print("Searching for 5: index", binarySearch(sorted, 5))
print("Searching for 7: index", binarySearch(sorted, 7))
`,
  },
];

export function App() {
  const [selectedExample, setSelectedExample] = useState('fibonacci');
  const [code, setCode] = useState(EXAMPLES[1]!.code);
  const [debuggerState, setDebuggerState] = useState<DebuggerState | null>(null);
  const [timeline, setTimeline] = useState<DebuggerEvent[]>([]);
  const [error, setError] = useState<{ message: string; line: number; column: number; formatted: string } | null>(null);
  const [isDebugging, setIsDebugging] = useState(false);
  const [activeTab, setActiveTab] = useState<'variables' | 'callstack' | 'memory'>('variables');
  const [breakpoints, setBreakpoints] = useState<number[]>([]);

  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker
  useEffect(() => {
    const worker = new Worker(new URL('./worker/compiler.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data;
      if (type === 'STATE_UPDATE') {
        setError(null);
        setDebuggerState(payload.state);
        setTimeline(payload.timeline);
      } else if (type === 'ERROR') {
        setError(payload);
        setIsDebugging(false);
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const handleSelectExample = (name: string) => {
    setSelectedExample(name);
    const ex = EXAMPLES.find((e) => e.name === name);
    if (ex) {
      setCode(ex.code);
      setError(null);
      setDebuggerState(null);
      setIsDebugging(false);
      setBreakpoints([]);
    }
  };

  const handleRun = useCallback(() => {
    if (!workerRef.current) return;
    setIsDebugging(true);
    workerRef.current.postMessage({ type: 'RECORD_AND_END', payload: { source: code } });
  }, [code]);

  const handleDebug = useCallback(() => {
    if (!workerRef.current) return;
    setIsDebugging(true);
    workerRef.current.postMessage({ type: 'RECORD', payload: { source: code } });
  }, [code]);

  const handleStepForward = useCallback(() => {
    workerRef.current?.postMessage({ type: 'STEP_FORWARD' });
  }, []);

  const handleStepBackward = useCallback(() => {
    workerRef.current?.postMessage({ type: 'STEP_BACKWARD' });
  }, []);

  const handleStepOver = useCallback(() => {
    workerRef.current?.postMessage({ type: 'STEP_OVER' });
  }, []);

  const handleContinue = useCallback(() => {
    workerRef.current?.postMessage({ type: 'CONTINUE' });
  }, []);

  const handleGotoStep = useCallback((stepIndex: number) => {
    workerRef.current?.postMessage({ type: 'GOTO_STEP', payload: { stepIndex } });
  }, []);

  const handleRestart = useCallback(() => {
    workerRef.current?.postMessage({ type: 'RESTART' });
  }, []);

  const handleGotoEnd = useCallback(() => {
    workerRef.current?.postMessage({ type: 'GOTO_END' });
  }, []);

  const handleToggleBreakpoint = (line: number) => {
    setBreakpoints((prev) => {
      const exists = prev.includes(line);
      const next = exists ? prev.filter((l) => l !== line) : [...prev, line];
      workerRef.current?.postMessage({ type: 'TOGGLE_BREAKPOINT', payload: { line } });
      return next;
    });
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (isDebugging) handleContinue();
        else handleDebug();
      } else if (e.key === 'F10' && isDebugging) {
        e.preventDefault();
        handleStepOver();
      } else if (e.key === 'ArrowRight' && e.altKey && isDebugging) {
        e.preventDefault();
        handleStepForward();
      } else if (e.key === 'ArrowLeft' && e.altKey && isDebugging) {
        e.preventDefault();
        handleStepBackward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDebugging, handleRun, handleDebug, handleContinue, handleStepOver, handleStepForward, handleStepBackward]);

  const snapshot = debuggerState?.snapshot;
  const activeLine = snapshot?.sourceLine;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Header */}
      <Header
        onRun={handleRun}
        onDebug={handleDebug}
        onStepForward={handleStepForward}
        onStepBackward={handleStepBackward}
        onStepOver={handleStepOver}
        onContinue={handleContinue}
        onRestart={handleRestart}
        onGotoEnd={handleGotoEnd}
        state={debuggerState}
        isDebugging={isDebugging}
        selectedExample={selectedExample}
        onSelectExample={handleSelectExample}
        examples={EXAMPLES}
      />

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Code Editor */}
        <div className="flex-1 flex flex-col border-r border-slate-800">
          <div className="flex-1">
            <Editor
              value={code}
              onChange={setCode}
              activeLine={activeLine}
              isDebugging={isDebugging}
              onToggleBreakpoint={handleToggleBreakpoint}
              breakpoints={breakpoints}
            />
          </div>

          {/* Bottom Console Panel */}
          <div className="h-44 border-t border-slate-800">
            <ConsolePanel output={snapshot ? snapshot.output : []} />
          </div>
        </div>

        {/* Right: Debugger Panels */}
        <div className="w-[380px] flex flex-col bg-slate-900">
          {/* Panel Tabs */}
          <div className="flex items-center bg-slate-950 border-b border-slate-800">
            <button
              onClick={() => setActiveTab('variables')}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === 'variables'
                  ? 'border-sky-400 text-sky-300 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Variables
            </button>
            <button
              onClick={() => setActiveTab('callstack')}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === 'callstack'
                  ? 'border-purple-400 text-purple-300 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Call Stack ({snapshot ? snapshot.frames.length : 0})
            </button>
            <button
              onClick={() => setActiveTab('memory')}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === 'memory'
                  ? 'border-amber-400 text-amber-300 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Operand Stack
            </button>
          </div>

          {/* Active Panel Content */}
          <div className="flex-1 overflow-hidden p-2">
            {error ? (
              <ErrorPanel error={error} />
            ) : activeTab === 'variables' ? (
              <VariablesPanel
                locals={snapshot ? snapshot.frames[snapshot.frames.length - 1]?.locals || [] : []}
                globals={snapshot ? snapshot.globals : []}
              />
            ) : activeTab === 'callstack' ? (
              <CallStackPanel frames={snapshot ? snapshot.frames : []} />
            ) : (
              <MemoryPanel stackDisplay={snapshot ? snapshot.stackDisplay : []} />
            )}
          </div>

          {/* Bottom Execution Timeline */}
          <div className="h-40">
            <TimelinePanel
              timeline={timeline}
              currentStep={debuggerState ? debuggerState.currentStep : 0}
              onGotoStep={handleGotoStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
