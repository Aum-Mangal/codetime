import { compile, TimeTravelDebugger, type CodeTimeError } from '@codetime/compiler';
import type { BreakpointSpec, Diagnostic, WorkerError, WorkerRequest, WorkerResponse } from './protocol';

/** Timeline events sent on each side of the current step. */
const TIMELINE_RADIUS = 60;
/** Width of the run overview; enough for one bucket per pixel of a wide scrubber. */
const OVERVIEW_BUCKETS = 2048;
/** Breakpoint markers drawn on the scrubber. */
const MAX_BREAKPOINT_MARKERS = 1_000;

let debuggerInstance: TimeTravelDebugger | null = null;

/**
 * Breakpoints belong to the editing session, not to one recording: they can be
 * set before the first Debug and must survive every re-record.
 */
let breakpoints: BreakpointSpec[] = [];

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function toWorkerError(err: unknown): WorkerError {
  const e = err as { message?: string; loc?: { line?: number; column?: number }; format?: () => string; name?: string; label?: string };
  const message = e?.message ?? String(err);
  return {
    message,
    line: e?.loc?.line ?? 1,
    column: e?.loc?.column ?? 1,
    formatted: typeof e?.format === 'function' ? e.format() : message,
    kind: e?.label ?? e?.name ?? 'Error',
  };
}

/** Apply breakpoints to the debugger, reporting conditions that do not parse. */
function applyBreakpoints(dbg: TimeTravelDebugger): void {
  dbg.clearBreakpoints();
  for (const bp of breakpoints) {
    try {
      dbg.setBreakpoint(bp.line, bp.condition);
    } catch (err) {
      dbg.setBreakpoint(bp.line);
      post({ type: 'NOTICE', message: `${toWorkerError(err).message} The breakpoint on line ${bp.line} stops unconditionally.` });
    }
  }
}

function toDiagnostic(err: CodeTimeError): Diagnostic {
  return {
    severity: err.severity,
    message: err.message,
    line: err.loc.line,
    column: err.loc.column,
    kind: err.label,
    ...(err.hint ? { hint: err.hint } : {}),
  };
}

function sendOverview(): void {
  const dbg = debuggerInstance;
  if (!dbg) return;
  const { totalSteps, kinds, depths } = dbg.getOverview(OVERVIEW_BUCKETS);
  post({
    type: 'OVERVIEW',
    overview: { totalSteps, kinds, depths, breakpointHits: dbg.getBreakpointHits(MAX_BREAKPOINT_MARKERS) },
  });
}

function sendState(): void {
  const dbg = debuggerInstance;
  if (!dbg) return;
  const state = dbg.getCurrentState();
  const start = Math.max(0, state.currentStep - TIMELINE_RADIUS);
  const { frames, globals } = state.snapshot;
  const lastWriteLines: Record<string, number> = {};
  for (const v of [...(frames[frames.length - 1]?.locals ?? []), ...globals]) {
    if (v.name in lastWriteLines) continue;
    const step = dbg.findChange(v.name, 'backward', state.currentStep + 1);
    if (step >= 0) lastWriteLines[v.name] = dbg.lineOf(step);
  }
  post({
    type: 'STATE',
    state,
    timeline: { start, events: dbg.getEvents(start, state.currentStep + TIMELINE_RADIUS) },
    stats: dbg.getStats(),
    runtimeError: dbg.runtimeError ? toWorkerError(dbg.runtimeError) : null,
    lastWriteLines,
  });
}

function handle(request: WorkerRequest): void {
  switch (request.type) {
    case 'RECORD': {
      const dbg = new TimeTravelDebugger(request.source);
      dbg.record();
      applyBreakpoints(dbg);
      debuggerInstance = dbg;
      if (request.startAt === 'end') dbg.gotoEnd();
      else dbg.restart();
      sendState();
      sendOverview();
      return;
    }
    case 'NAVIGATE':
      debuggerInstance?.navigate(request.command);
      sendState();
      return;
    case 'GOTO_STEP':
      debuggerInstance?.gotoStep(request.step);
      sendState();
      return;
    case 'FIND_CHANGE': {
      const dbg = debuggerInstance;
      if (!dbg) return;
      const step = dbg.findChange(request.name, request.direction);
      if (step < 0) {
        const when = request.direction === 'backward' ? 'before' : 'after';
        post({ type: 'NOTICE', message: `'${request.name}' is not written ${when} this step.` });
        return;
      }
      dbg.gotoStep(step);
      sendState();
      return;
    }
    case 'SET_BREAKPOINTS':
      breakpoints = request.breakpoints;
      if (debuggerInstance) {
        applyBreakpoints(debuggerInstance);
        sendOverview();
      }
      return;
    case 'CHECK': {
      const result = compile(request.source);
      post({
        type: 'DIAGNOSTICS',
        version: request.version,
        diagnostics: [...result.diagnostics, ...result.warnings].map(toDiagnostic),
      });
      return;
    }
    case 'LAST_CHANGE': {
      const dbg = debuggerInstance;
      const step = dbg ? dbg.findChange(request.name, 'backward') : -1;
      const line = step >= 0 && dbg ? dbg.getEvents(step, step)[0]?.loc.line ?? 0 : 0;
      post({ type: 'LAST_CHANGE', requestId: request.requestId, step, line });
      return;
    }
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    handle(e.data);
  } catch (err) {
    post({ type: 'ERROR', error: toWorkerError(err) });
  }
};
