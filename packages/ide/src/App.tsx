import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DebuggerState, NavigationCommand, RecordingStats } from '@codetime/compiler';
import { Header } from './components/Header';
import { Editor } from './components/Editor';
import { VariablesPanel } from './components/VariablesPanel';
import { CallStackPanel } from './components/CallStackPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ConsolePanel } from './components/ConsolePanel';
import { ErrorPanel } from './components/ErrorPanel';
import { EXAMPLES, DEFAULT_EXAMPLE } from './examples';
import type { BreakpointSpec, TimelineWindow, WorkerError, WorkerRequest, WorkerResponse } from './worker/protocol';

/** A recording that has not answered by then is treated as hung and its worker is replaced. */
const RECORD_TIMEOUT_MS = 15_000;
const NOTICE_MS = 4_000;

const EMPTY_TIMELINE: TimelineWindow = { start: 0, events: [] };

export function App() {
  const [selectedExample, setSelectedExample] = useState(DEFAULT_EXAMPLE);
  const [code, setCode] = useState(() => EXAMPLES.find((e) => e.name === DEFAULT_EXAMPLE)?.code ?? '');
  const [debuggerState, setDebuggerState] = useState<DebuggerState | null>(null);
  const [timeline, setTimeline] = useState<TimelineWindow>(EMPTY_TIMELINE);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [runtimeError, setRuntimeError] = useState<WorkerError | null>(null);
  const [error, setError] = useState<WorkerError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDebugging, setIsDebugging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<'variables' | 'callstack' | 'memory'>('variables');
  const [breakpoints, setBreakpoints] = useState<BreakpointSpec[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const breakpointsRef = useRef<BreakpointSpec[]>([]);

  const post = useCallback((request: WorkerRequest) => {
    workerRef.current?.postMessage(request);
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), NOTICE_MS);
  }, []);

  /** Start a fresh worker. Breakpoints are re-sent because they live in the worker. */
  const spawnWorker = useCallback(() => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./worker/compiler.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const message = e.data;
      switch (message.type) {
        case 'STATE':
          clearWatchdog();
          setIsRecording(false);
          setError(null);
          setDebuggerState(message.state);
          setTimeline(message.timeline);
          setStats(message.stats);
          setRuntimeError(message.runtimeError);
          break;
        case 'NOTICE':
          showNotice(message.message);
          break;
        case 'ERROR':
          clearWatchdog();
          setIsRecording(false);
          setError(message.error);
          setIsDebugging(false);
          break;
      }
    };

    workerRef.current = worker;
    worker.postMessage({ type: 'SET_BREAKPOINTS', breakpoints: breakpointsRef.current } satisfies WorkerRequest);
  }, [clearWatchdog, showNotice]);

  useEffect(() => {
    spawnWorker();
    return () => {
      clearWatchdog();
      workerRef.current?.terminate();
    };
  }, [spawnWorker, clearWatchdog]);

  const updateBreakpoints = useCallback((next: BreakpointSpec[]) => {
    breakpointsRef.current = next;
    setBreakpoints(next);
    post({ type: 'SET_BREAKPOINTS', breakpoints: next });
  }, [post]);

  const record = useCallback((startAt: 'start' | 'end') => {
    setIsDebugging(true);
    setIsRecording(true);
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      // The worker is stuck inside a long synchronous recording; replace it.
      spawnWorker();
      setIsRecording(false);
      setIsDebugging(false);
      setError({
        message: 'Recording timed out',
        line: 1,
        column: 1,
        formatted: `Recording did not finish within ${RECORD_TIMEOUT_MS / 1000} seconds and was stopped.`,
        kind: 'Timeout',
      });
    }, RECORD_TIMEOUT_MS);
    post({ type: 'RECORD', source: code, startAt });
  }, [code, post, spawnWorker, clearWatchdog]);

  const handleSelectExample = (name: string) => {
    setSelectedExample(name);
    const ex = EXAMPLES.find((e) => e.name === name);
    if (ex) {
      setCode(ex.code);
      setError(null);
      setDebuggerState(null);
      setTimeline(EMPTY_TIMELINE);
      setStats(null);
      setRuntimeError(null);
      setIsDebugging(false);
      updateBreakpoints([]);
    }
  };

  const handleRun = useCallback(() => record('end'), [record]);
  const handleDebug = useCallback(() => record('start'), [record]);
  const navigate = useCallback((command: NavigationCommand) => post({ type: 'NAVIGATE', command }), [post]);
  const handleGotoStep = useCallback((step: number) => post({ type: 'GOTO_STEP', step }), [post]);
  const handleFindChange = useCallback(
    (name: string, direction: 'backward' | 'forward') => post({ type: 'FIND_CHANGE', name, direction }),
    [post],
  );

  const handleToggleBreakpoint = useCallback((line: number) => {
    const current = breakpointsRef.current;
    updateBreakpoints(current.some((b) => b.line === line)
      ? current.filter((b) => b.line !== line)
      : [...current, { line }]);
  }, [updateBreakpoints]);

  const handleEditBreakpointCondition = useCallback((line: number) => {
    const current = breakpointsRef.current;
    const existing = current.find((b) => b.line === line);
    const input = window.prompt(
      `Break on line ${line} only when this CodeTime expression is true (leave empty to always break):`,
      existing?.condition ?? '',
    );
    if (input === null) return;
    const condition = input.trim();
    const updated: BreakpointSpec = condition ? { line, condition } : { line };
    updateBreakpoints([...current.filter((b) => b.line !== line), updated]);
  }, [updateBreakpoints]);

  // Keyboard shortcuts (VS Code style; Shift reverses direction).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const run = (action: () => void) => {
        e.preventDefault();
        action();
      };
      if (e.ctrlKey && e.key === 'Enter') return run(handleRun);
      if (e.key === 'F5') {
        if (!isDebugging) return run(handleDebug);
        return run(() => navigate(e.shiftKey ? 'reverseContinue' : 'continue'));
      }
      if (!isDebugging) return;
      if (e.key === 'F10') return run(() => navigate(e.shiftKey ? 'reverseStepOver' : 'stepOver'));
      if (e.key === 'F11') return run(() => navigate(e.shiftKey ? 'stepOut' : 'stepInto'));
      if (e.altKey && e.key === 'ArrowRight') return run(() => navigate('stepForward'));
      if (e.altKey && e.key === 'ArrowLeft') return run(() => navigate('stepBackward'));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDebugging, handleRun, handleDebug, navigate]);

  const snapshot = debuggerState?.snapshot;
  const activeLine = snapshot?.sourceLine;
  const atErrorStep = Boolean(runtimeError && debuggerState?.isAtEnd);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Header
        onRun={handleRun}
        onDebug={handleDebug}
        onNavigate={navigate}
        state={debuggerState}
        isDebugging={isDebugging}
        isRecording={isRecording}
        selectedExample={selectedExample}
        onSelectExample={handleSelectExample}
        examples={EXAMPLES}
      />

      {notice && (
        <div role="status" className="px-4 py-1.5 text-xs bg-amber-500/10 text-amber-200 border-b border-amber-500/30">
          {notice}
        </div>
      )}

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
              onEditBreakpointCondition={handleEditBreakpointCondition}
              breakpoints={breakpoints}
            />
          </div>

          <div className="h-44 border-t border-slate-800">
            <ConsolePanel
              output={snapshot ? snapshot.output : []}
              error={atErrorStep ? runtimeError?.formatted : undefined}
            />
          </div>
        </div>

        {/* Right: Debugger Panels */}
        <div className="w-[380px] flex flex-col bg-slate-900">
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

          <div className="flex-1 overflow-hidden p-2">
            {error ? (
              <ErrorPanel error={error} />
            ) : activeTab === 'variables' ? (
              <VariablesPanel
                locals={snapshot ? snapshot.frames[snapshot.frames.length - 1]?.locals || [] : []}
                globals={snapshot ? snapshot.globals : []}
                onFindChange={isDebugging && snapshot ? handleFindChange : undefined}
              />
            ) : activeTab === 'callstack' ? (
              <CallStackPanel frames={snapshot ? snapshot.frames : []} />
            ) : (
              <MemoryPanel stackDisplay={snapshot ? snapshot.stackDisplay : []} />
            )}
          </div>

          <div className="h-44">
            <TimelinePanel
              timeline={timeline}
              stats={stats}
              currentStep={debuggerState ? debuggerState.currentStep : 0}
              onGotoStep={handleGotoStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
