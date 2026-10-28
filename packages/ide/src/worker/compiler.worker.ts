import { TimeTravelDebugger } from '@codetime/compiler';
import type { BreakpointSpec, WorkerError, WorkerRequest, WorkerResponse } from './protocol';

/** Timeline events sent on each side of the current step. */
const TIMELINE_RADIUS = 60;

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
  const e = err as { message?: string; loc?: { line?: number; column?: number }; format?: () => string; name?: string };
  const message = e?.message ?? String(err);
  return {
    message,
    line: e?.loc?.line ?? 1,
    column: e?.loc?.column ?? 1,
    formatted: typeof e?.format === 'function' ? e.format() : message,
    kind: e?.name ?? 'Error',
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

function sendState(): void {
  const dbg = debuggerInstance;
  if (!dbg) return;
  const state = dbg.getCurrentState();
  const start = Math.max(0, state.currentStep - TIMELINE_RADIUS);
  post({
    type: 'STATE',
    state,
    timeline: { start, events: dbg.getEvents(start, state.currentStep + TIMELINE_RADIUS) },
    stats: dbg.getStats(),
    runtimeError: dbg.runtimeError ? toWorkerError(dbg.runtimeError) : null,
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
      if (debuggerInstance) applyBreakpoints(debuggerInstance);
      return;
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    handle(e.data);
  } catch (err) {
    post({ type: 'ERROR', error: toWorkerError(err) });
  }
};
