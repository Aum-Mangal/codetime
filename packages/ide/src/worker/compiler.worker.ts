import { TimeTravelDebugger } from '@codetime/compiler';

let debuggerInstance: TimeTravelDebugger | null = null;

function sendState(): void {
  if (!debuggerInstance) return;
  self.postMessage({
    type: 'STATE_UPDATE',
    payload: {
      state: debuggerInstance.getCurrentState(),
      timeline: debuggerInstance.getTimeline(),
    },
  });
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data as { type: string; payload: Record<string, any> };

  try {
    switch (type) {
      /**
       * RECORD: compile + record all execution steps, then position at step 0.
       * Responds with the initial debugger state (step 0).
       */
      case 'RECORD': {
        debuggerInstance = TimeTravelDebugger.fromSource(payload.source as string);
        debuggerInstance.restart();
        sendState();
        break;
      }

      /**
       * RECORD_AND_END: compile + record all steps, then jump to the final step.
       * Used for "Run" mode — no need to scrub through intermediate steps.
       */
      case 'RECORD_AND_END': {
        debuggerInstance = TimeTravelDebugger.fromSource(payload.source as string);
        debuggerInstance.gotoEnd();
        sendState();
        break;
      }

      case 'STEP_FORWARD':
        debuggerInstance?.stepForward();
        sendState();
        break;

      case 'STEP_BACKWARD':
        debuggerInstance?.stepBackward();
        sendState();
        break;

      case 'STEP_OVER':
        debuggerInstance?.stepOver();
        sendState();
        break;

      case 'RESTART':
        debuggerInstance?.restart();
        sendState();
        break;

      case 'GOTO_END':
        debuggerInstance?.gotoEnd();
        sendState();
        break;

      case 'GOTO_STEP':
        debuggerInstance?.gotoStep(payload.stepIndex as number);
        sendState();
        break;

      case 'CONTINUE':
        debuggerInstance?.continueToBreakpoint();
        sendState();
        break;

      case 'SET_BREAKPOINT':
        debuggerInstance?.setBreakpoint(payload.line as number);
        sendState();
        break;

      case 'REMOVE_BREAKPOINT':
        debuggerInstance?.removeBreakpoint(payload.line as number);
        sendState();
        break;

      case 'TOGGLE_BREAKPOINT':
        debuggerInstance?.toggleBreakpoint(payload.line as number);
        sendState();
        break;

      case 'CLEAR_BREAKPOINTS':
        debuggerInstance?.clearBreakpoints();
        sendState();
        break;

      default:
        console.warn('[worker] Unknown message type:', type);
    }
  } catch (err: any) {
    // Distinguish between compile-time errors and runtime errors
    const message: string = err.message ?? String(err);
    const loc = err.loc ?? err.token?.loc ?? { line: 1, column: 1 };

    self.postMessage({
      type: 'ERROR',
      payload: {
        message,
        line: loc.line ?? 1,
        column: loc.column ?? 1,
        formatted: typeof err.format === 'function'
          ? err.format()
          : message,
        kind: err.constructor?.name ?? 'Error',
      },
    });
  }
};
