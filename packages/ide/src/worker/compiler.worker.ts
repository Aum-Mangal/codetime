import { TimeTravelDebugger } from '@codetime/compiler';

let debuggerInstance: TimeTravelDebugger | null = null;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'RECORD': {
        const { source } = payload;
        debuggerInstance = TimeTravelDebugger.fromSource(source);
        const state = debuggerInstance.getCurrentState();
        const timeline = debuggerInstance.getTimeline();
        self.postMessage({
          type: 'STATE_UPDATE',
          payload: { state, timeline },
        });
        break;
      }
      case 'GOTO_STEP': {
        if (!debuggerInstance) return;
        const state = debuggerInstance.gotoStep(payload.stepIndex);
        self.postMessage({
          type: 'STATE_UPDATE',
          payload: { state, timeline: debuggerInstance.getTimeline() },
        });
        break;
      }
      case 'STEP_FORWARD': {
        if (!debuggerInstance) return;
        const state = debuggerInstance.stepForward();
        self.postMessage({
          type: 'STATE_UPDATE',
          payload: { state, timeline: debuggerInstance.getTimeline() },
        });
        break;
      }
      case 'STEP_BACKWARD': {
        if (!debuggerInstance) return;
        const state = debuggerInstance.stepBackward();
        self.postMessage({
          type: 'STATE_UPDATE',
          payload: { state, timeline: debuggerInstance.getTimeline() },
        });
        break;
      }
      case 'RESTART': {
        if (!debuggerInstance) return;
        const state = debuggerInstance.restart();
        self.postMessage({
          type: 'STATE_UPDATE',
          payload: { state, timeline: debuggerInstance.getTimeline() },
        });
        break;
      }
      case 'GOTO_END': {
        if (!debuggerInstance) return;
        const state = debuggerInstance.gotoEnd();
        self.postMessage({
          type: 'STATE_UPDATE',
          payload: { state, timeline: debuggerInstance.getTimeline() },
        });
        break;
      }
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: err.message || String(err),
        line: err.loc?.line ?? (err.token?.loc?.line ?? 1),
        column: err.loc?.column ?? (err.token?.loc?.column ?? 1),
        formatted: typeof err.format === 'function' ? err.format(payload?.source || debuggerInstance?.source) : String(err),
      },
    });
  }
};
