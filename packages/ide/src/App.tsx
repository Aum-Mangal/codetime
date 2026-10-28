import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DebuggerState, NavigationCommand, RecordingStats } from '@codetime/compiler';
import { Header } from './components/Header';
import { TransportBar } from './components/TransportBar';
import { Editor, type LastChange } from './components/Editor';
import { Tabs } from './components/Tabs';
import { VariablesPanel } from './components/VariablesPanel';
import { CallStackPanel } from './components/CallStackPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { EventsPanel } from './components/EventsPanel';
import { ConsolePanel } from './components/ConsolePanel';
import { ProblemsPanel } from './components/ProblemsPanel';
import { StatusBar } from './components/StatusBar';
import { EXAMPLES, DEFAULT_EXAMPLE } from './examples';
import { decodeShareHash, encodeShareHash } from './share';
import type {
  BreakpointSpec,
  Diagnostic,
  RunOverviewMessage,
  TimelineWindow,
  WorkerError,
  WorkerRequest,
  WorkerResponse,
} from './worker/protocol';

/** A recording that has not answered by then is treated as hung and its worker is replaced. */
const RECORD_TIMEOUT_MS = 15_000;
const NOTICE_MS = 4_000;
/** Delay between the last keystroke and the live compile check. */
const CHECK_DEBOUNCE_MS = 250;
const LAST_CHANGE_TIMEOUT_MS = 2_000;
/** Selected in the example picker for a program opened from a share link. */
const SHARED = 'shared';

const EMPTY_TIMELINE: TimelineWindow = { start: 0, events: [] };
const NO_VARIABLES: never[] = [];

type InspectorTab = 'variables' | 'callstack' | 'stack';
type BottomTab = 'console' | 'problems';

export function App() {
  const [selectedExample, setSelectedExample] = useState(DEFAULT_EXAMPLE);
  const [code, setCode] = useState(() => EXAMPLES.find((e) => e.name === DEFAULT_EXAMPLE)?.code ?? '');
  const [debuggerState, setDebuggerState] = useState<DebuggerState | null>(null);
  const [timeline, setTimeline] = useState<TimelineWindow>(EMPTY_TIMELINE);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [overview, setOverview] = useState<RunOverviewMessage | null>(null);
  const [runtimeError, setRuntimeError] = useState<WorkerError | null>(null);
  const [recordError, setRecordError] = useState<WorkerError | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [lastWriteLines, setLastWriteLines] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('variables');
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
  const [breakpoints, setBreakpoints] = useState<BreakpointSpec[]>([]);
  const [shareCopied, setShareCopied] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const breakpointsRef = useRef<BreakpointSpec[]>([]);
  const checkVersionRef = useRef(0);
  const lastChangeRequestsRef = useRef(new Map<number, (result: LastChange | null) => void>());
  const nextRequestIdRef = useRef(1);
  const revealRef = useRef<((line: number, column: number) => void) | null>(null);

  const isDebugging = debuggerState !== null;

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

  const endSession = useCallback(() => {
    setDebuggerState(null);
    setTimeline(EMPTY_TIMELINE);
    setStats(null);
    setOverview(null);
    setRuntimeError(null);
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
          setRecordError(null);
          setDebuggerState(message.state);
          setTimeline(message.timeline);
          setStats(message.stats);
          setRuntimeError(message.runtimeError);
          setLastWriteLines(message.lastWriteLines);
          break;
        case 'OVERVIEW':
          setOverview(message.overview);
          break;
        case 'DIAGNOSTICS':
          if (message.version === checkVersionRef.current) setDiagnostics(message.diagnostics);
          break;
        case 'LAST_CHANGE': {
          const resolve = lastChangeRequestsRef.current.get(message.requestId);
          lastChangeRequestsRef.current.delete(message.requestId);
          resolve?.(message.step >= 0 ? { step: message.step, line: message.line } : null);
          break;
        }
        case 'NOTICE':
          showNotice(message.message);
          break;
        case 'ERROR':
          clearWatchdog();
          setIsRecording(false);
          setRecordError(message.error);
          endSession();
          setBottomTab(/Syntax|Parse|Semantic|Lex|Compile/.test(message.error.kind) ? 'problems' : 'console');
          break;
      }
    };

    workerRef.current = worker;
    worker.postMessage({ type: 'SET_BREAKPOINTS', breakpoints: breakpointsRef.current } satisfies WorkerRequest);
  }, [clearWatchdog, showNotice, endSession]);

  useEffect(() => {
    spawnWorker();
    return () => {
      clearWatchdog();
      workerRef.current?.terminate();
    };
  }, [spawnWorker, clearWatchdog]);

  // Open a program from a share link.
  useEffect(() => {
    void decodeShareHash(window.location.hash).then((shared) => {
      if (shared === null) return;
      setCode(shared);
      setSelectedExample(SHARED);
    });
  }, []);

  // Live diagnostics while typing.
  useEffect(() => {
    const version = ++checkVersionRef.current;
    const timer = window.setTimeout(() => post({ type: 'CHECK', source: code, version }), CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [code, post]);

  const updateBreakpoints = useCallback((next: BreakpointSpec[]) => {
    breakpointsRef.current = next;
    setBreakpoints(next);
    post({ type: 'SET_BREAKPOINTS', breakpoints: next });
  }, [post]);

  const record = useCallback((startAt: 'start' | 'end') => {
    setIsRecording(true);
    setRecordError(null);
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      // The worker is stuck inside a long synchronous recording; replace it.
      spawnWorker();
      setIsRecording(false);
      endSession();
      setRecordError({
        message: 'Recording timed out',
        line: 1,
        column: 1,
        formatted: `Recording did not finish within ${RECORD_TIMEOUT_MS / 1000} seconds and was stopped.`,
        kind: 'Timeout',
      });
      setBottomTab('console');
    }, RECORD_TIMEOUT_MS);
    // Check first, so Problems is current even if Run follows a keystroke immediately.
    post({ type: 'CHECK', source: code, version: ++checkVersionRef.current });
    post({ type: 'RECORD', source: code, startAt });
    setBottomTab('console');
  }, [code, post, spawnWorker, clearWatchdog, endSession]);

  const handleCodeChange = useCallback((next: string) => {
    setCode(next);
    // The recording no longer matches the source.
    if (debuggerState) endSession();
  }, [debuggerState, endSession]);

  const handleSelectExample = (name: string) => {
    const ex = EXAMPLES.find((e) => e.name === name);
    if (!ex) return;
    setSelectedExample(name);
    setCode(ex.code);
    setRecordError(null);
    endSession();
    updateBreakpoints([]);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const handleShare = useCallback(async () => {
    const hash = await encodeShareHash(code);
    history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2_000);
    } catch {
      showNotice('The link is in the address bar; copying to the clipboard was not allowed.');
    }
  }, [code, showNotice]);

  const handleRun = useCallback(() => record('end'), [record]);
  const handleDebug = useCallback(() => record('start'), [record]);
  const navigate = useCallback((command: NavigationCommand) => post({ type: 'NAVIGATE', command }), [post]);
  const handleGotoStep = useCallback((step: number) => post({ type: 'GOTO_STEP', step }), [post]);
  const handleFindChange = useCallback(
    (name: string, direction: 'backward' | 'forward') => post({ type: 'FIND_CHANGE', name, direction }),
    [post],
  );

  const queryLastChange = useCallback((name: string) => new Promise<LastChange | null>((resolve) => {
    const requestId = nextRequestIdRef.current++;
    lastChangeRequestsRef.current.set(requestId, resolve);
    post({ type: 'LAST_CHANGE', requestId, name });
    window.setTimeout(() => {
      if (lastChangeRequestsRef.current.delete(requestId)) resolve(null);
    }, LAST_CHANGE_TIMEOUT_MS);
  }), [post]);

  const handleToggleBreakpoint = useCallback((line: number) => {
    const current = breakpointsRef.current;
    updateBreakpoints(current.some((b) => b.line === line)
      ? current.filter((b) => b.line !== line)
      : [...current, { line }]);
  }, [updateBreakpoints]);

  const handleUpdateBreakpoint = useCallback((line: number, spec: BreakpointSpec | null) => {
    const others = breakpointsRef.current.filter((b) => b.line !== line);
    updateBreakpoints(spec ? [...others, spec] : others);
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
  const frames = snapshot?.frames ?? [];
  const topFrame = frames[frames.length - 1];
  const locals = topFrame?.locals ?? NO_VARIABLES;
  const globals = snapshot?.globals ?? NO_VARIABLES;
  const atErrorStep = Boolean(runtimeError && debuggerState?.isAtEnd);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const examples = selectedExample === SHARED ? [{ name: SHARED, label: 'Shared program' }, ...EXAMPLES] : EXAMPLES;

  const consoleError = recordError
    ? `Could not run: ${recordError.kind} at line ${recordError.line}, column ${recordError.column}\n\n${recordError.formatted}`
    : atErrorStep ? runtimeError?.formatted : undefined;

  return (
    <div className="h-screen w-screen flex flex-col bg-app text-fg overflow-hidden">
      <Header
        onRun={handleRun}
        onDebug={handleDebug}
        isRecording={isRecording}
        selectedExample={selectedExample}
        onSelectExample={handleSelectExample}
        examples={examples}
        onShare={() => void handleShare()}
        shareCopied={shareCopied}
      />

      <TransportBar
        state={debuggerState}
        overview={overview}
        isRecording={isRecording}
        onNavigate={navigate}
        onGotoStep={handleGotoStep}
      />

      {notice && (
        <div role="status" className="shrink-0 px-4 py-1.5 text-xs bg-warn/10 text-warn border-b border-warn/30">
          {notice}
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-h-0 min-w-0 flex flex-col lg:border-r border-line">
          <div className="flex-1 min-h-[200px]">
            <Editor
              value={code}
              onChange={handleCodeChange}
              activeLine={snapshot?.sourceLine}
              breakpoints={breakpoints}
              onToggleBreakpoint={handleToggleBreakpoint}
              onUpdateBreakpoint={handleUpdateBreakpoint}
              diagnostics={diagnostics}
              locals={locals}
              globals={globals}
              lastWriteLines={lastWriteLines}
              onQueryLastChange={queryLastChange}
              revealRef={revealRef}
            />
          </div>

          <section className="h-32 sm:h-44 shrink-0 flex flex-col border-t border-line bg-panel" aria-label="Output">
            <Tabs<BottomTab>
              label="Output"
              active={bottomTab}
              onChange={setBottomTab}
              tabs={[
                { id: 'console', label: 'Console' },
                {
                  id: 'problems',
                  label: 'Problems',
                  badge: (
                    <span className={`rounded-full px-1.5 text-[10px] ${errorCount ? 'bg-err/15 text-err' : 'bg-hover text-fg-muted'}`}>
                      {diagnostics.length}
                    </span>
                  ),
                },
              ]}
            />
            <div className="flex-1 min-h-0">
              {bottomTab === 'console' ? (
                <ConsolePanel output={snapshot ? snapshot.output : []} error={consoleError} />
              ) : (
                <ProblemsPanel diagnostics={diagnostics} onReveal={(line, column) => revealRef.current?.(line, column)} />
              )}
            </div>
          </section>
        </div>

        <aside className="h-[45%] lg:h-auto lg:w-[400px] shrink-0 flex flex-col bg-panel border-t lg:border-t-0 border-line" aria-label="Debugger">
          <div className="flex-1 min-h-0 flex flex-col">
            <Tabs<InspectorTab>
              label="Inspector"
              active={inspectorTab}
              onChange={setInspectorTab}
              tabs={[
                { id: 'variables', label: 'Variables' },
                {
                  id: 'callstack',
                  label: 'Call stack',
                  badge: frames.length > 0 ? <span className="text-fg-muted">{frames.length}</span> : undefined,
                },
                { id: 'stack', label: 'VM stack' },
              ]}
            />
            <div className="flex-1 min-h-0" role="tabpanel" aria-labelledby={`tab-${inspectorTab}`}>
              {inspectorTab === 'variables' ? (
                <VariablesPanel
                  locals={locals}
                  globals={globals}
                  functionName={topFrame && topFrame.fnName !== 'main' ? topFrame.fnName : undefined}
                  onFindChange={isDebugging ? handleFindChange : undefined}
                />
              ) : inspectorTab === 'callstack' ? (
                <CallStackPanel frames={frames} />
              ) : (
                <MemoryPanel stackDisplay={snapshot ? snapshot.stackDisplay : []} />
              )}
            </div>
          </div>

          <div className="h-[40%] min-h-[160px] shrink-0 border-t border-line">
            <EventsPanel
              timeline={timeline}
              stats={stats}
              currentStep={debuggerState ? debuggerState.currentStep : 0}
              onGotoStep={handleGotoStep}
            />
          </div>
        </aside>
      </main>

      <StatusBar state={debuggerState} stats={stats} isRecording={isRecording} errorCount={errorCount} />
    </div>
  );
}
